"""Линейная Q(state, action) на numpy — тот же артефакт, что читает игра (`bot/play/qvalue.js`).

Зачем отдельный тренер, если есть `train.py` с torch: PyTorch под Python 3.14 может быть недоступен, а
этот путь работает на одном numpy и даёт **тот же формат артефакта**, что уезжает в браузер. Модель
линейная, но с главным для этой задачи членом — **скрещиванием** признаков позиции и действия:

    score = b + wState·state + wAction·action + Σ wCross[k][j]·summary[k]·action[j]
              + heroBias[мой] + rivalBias[чужой] + cardBias[карта]

Без скрещивания оценка пары выродилась бы: внутри одной точки решения признаки позиции одинаковы у всех
вариантов, и ранжирование задавал бы только «общий вкус к действию», а не «уместность здесь».

    python trainer/linear.py --data=trainer/data/greedy.jsonl --epochs=12 --out=trainer/artifacts/q.json
"""

import argparse
import json
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# консоль Windows по умолчанию в cp1251 и падает на «×» и длинном тире: печатаем в UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf8", errors="replace")

from contract import read_header, read_samples  # noqa: E402

DEFAULT_SUMMARY = ["heroHp", "teamHp", "fighters", "hand", "deck", "resourceOn", "stillness", "sidekickHp"]


def parse_args():
    parser = argparse.ArgumentParser(description="Линейная Q(state, action) на numpy")
    parser.add_argument(
        "--data",
        required=True,
        help="один файл или несколько через запятую: жадная самоигра (объём) + поиск (мягкие цели)",
    )
    parser.add_argument("--out", default="trainer/artifacts/q.json")
    parser.add_argument("--js-out", default="bot/play/qvalue-weights.js", help="зеркало для бандла")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--lr", type=float, default=0.02)
    parser.add_argument("--decay", type=float, default=0.95)
    parser.add_argument("--clip", type=float, default=5.0, help="обрезка градиента: без неё Q разгоняется")
    parser.add_argument("--l2", type=float, default=1e-4)
    parser.add_argument("--holdout", type=float, default=0.1)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--policy-weight", type=float, default=1.0)
    parser.add_argument("--q-weight", type=float, default=1.0)
    parser.add_argument("--value-weight", type=float, default=0.3)
    parser.add_argument(
        "--target",
        choices=("auto", "chosen", "self", "oracle"),
        default="auto",
        help=(
            "цель политики: auto — доли доигрываний, иначе веса политики; "
            "chosen — действие, которое учитель действительно выбрал (жёсткая цель); "
            "self — свой выбор, взвешенный исходом партии, а целью оценки становится ценность хода; "
            "oracle — ранжирование по ценности каждого варианта (оракул, `--oracle` в экспорте)"
        ),
    )
    parser.add_argument(
        "--oracle-temperature",
        type=float,
        default=0.25,
        help="насколько мягко цель оракула размазывается по вариантам (доля от разброса цен)",
    )
    return parser.parse_args()


def oracle_target(sample, temperature=0.25):
    """Мягкая цель оракула: ценность **каждого** варианта, нормированная внутри решения.

    В отличие от `visits` (что учитель перебирал) и от одного числа на решение, здесь у каждого варианта
    своя цена — поэтому модель может учиться «этот ход лучше того», а не «ход вышел удачным». Разброс
    берётся внутри решения: абсолютный уровень ценности — свойство позиции, и он не должен задавать выбор.

    Масса раздаётся только **предложенным** вариантам (вес политики > 0): у запрещённых оракул ценности
    не считал, и их ноль нельзя принять за оценку.
    """
    offered = [index for index, action in enumerate(sample.actions) if action.prior > 0]
    if not offered:
        return None

    values = np.array([sample.actions[index].value for index in offered], dtype=float)
    if not np.any(values):
        return None

    spread = max(1e-6, float(values.max() - values.min())) * max(0.05, temperature)
    exp = np.exp((values - values.max()) / spread)
    weights = exp / exp.sum()

    target = np.zeros(len(sample.actions))
    for slot, index in enumerate(offered):
        target[index] = weights[slot]
    return target


def policy_target(sample, target="auto"):
    """Цель политики: доли доигрываний (`auto`), веса политики или сам выбор учителя (`chosen`, `self`).

    `visits` — мягкая цель: она говорит, что поиск **рассматривал**, а не что он выбрал (его выбор
    считается по средней оценке доигрываний, поэтому лидер по визитам и выбор совпадают не всегда).
    `chosen` — жёсткая цель «повтори выбор учителя»: годится, когда поиск сильный, а признаков у
    ученика мало и мягкую цель ему не разложить по признакам.
    `self` — то же жёсткое «повтори себя», но знак шага задаёт исход партии (§26): выигранные партии
    усиливают свой выбор, проигранные — гасят. Это обучение на своих ошибках без учителя.
    `oracle` — мягкая цель по ценности каждого варианта (`oracle_target`): единственная цель, у которой
    значение есть у **всех** вариантов решения, поэтому она учит ранжированию, а не угадыванию хода.
    """
    if target in ("chosen", "self"):
        one_hot = [0.0] * len(sample.actions)
        one_hot[min(max(0, sample.chosen), len(one_hot) - 1)] = 1.0
        return one_hot

    visits = np.array([max(0, action.visits) for action in sample.actions], dtype=float)
    if visits.sum() > 0:
        return visits / visits.sum()
    priors = np.array([max(0.0, action.prior) for action in sample.actions], dtype=float)
    if priors.sum() > 0:
        return priors / priors.sum()
    return None


def target_for(sample, target="auto", temperature=0.25):
    """Цель политики одной точкой входа: `oracle` считается по ценностям вариантов, остальное — как раньше."""
    if target == "oracle":
        return oracle_target(sample, temperature)
    return policy_target(sample, target)


class LinearQ:
    def __init__(self, state_dim, action_dim, summary_index, heroes, cards, seed=1):
        rng = np.random.default_rng(seed)
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.summary_index = summary_index
        self.heroes = list(heroes)
        self.cards = list(cards)
        self.hero_index = {name: index for index, name in enumerate(self.heroes)}
        self.card_index = {name: index + 1 for index, name in enumerate(self.cards)}  # 0 — «не карта»

        self.b = 0.0
        self.b_value = 0.0
        self.w_state = np.zeros(state_dim)
        self.w_action = np.zeros(action_dim)
        self.w_cross = rng.normal(0, 0.001, size=(len(summary_index), action_dim))
        self.w_value = np.zeros(state_dim)
        self.hero_bias = np.zeros(max(1, len(self.heroes)))
        self.rival_bias = np.zeros(max(1, len(self.heroes)))
        self.card_bias = np.zeros(max(1, len(self.cards) + 1))

    def scores(self, state, matrix, hero, rival, cards):
        summary = state[self.summary_index]
        # скрещивание: Σ_k Σ_j wCross[k][j]·summary[k]·action[j] = action · (wCrossᵀ · summary)
        z = (
            self.b
            + state @ self.w_state
            + matrix @ self.w_action
            + matrix @ (self.w_cross.T @ summary)
            + self.hero_bias[self.hero_index.get(hero, 0)]
            + self.rival_bias[self.hero_index.get(rival, 0)]
            + self.card_bias[cards]
        )
        return z

    def value(self, state):
        return self.b_value + state @ self.w_value


def build(sample, model):
    matrix = np.array([action.features for action in sample.actions], dtype=float)
    state = np.array(sample.state, dtype=float)
    hero = sample.player
    rival = sample.rival
    cards = np.array(
        [model.card_index.get(action.card, 0) if action.card else 0 for action in sample.actions],
        dtype=int,
    )
    return state, matrix, hero, rival, cards


def evaluate(model, rows, target="auto", temperature=0.25):
    if not rows:
        return {}
    top1 = 0
    value_sign = 0
    counted = 0
    loss = 0.0
    for sample in rows:
        state, matrix, hero, rival, cards = build(sample, model)
        z = model.scores(state, matrix, hero, rival, cards)
        target_row = target_for(sample, target, temperature)
        if target_row is not None:
            best = int(np.argmax(z))
            if target_row[best] == max(target_row):
                top1 += 1
            logp = z - np.log(np.exp(z - z.max()).sum()) - z.max()
            loss += float(-(target_row * logp).sum())
            counted += 1
        # знак Q проверяем по той же цели, что и обучение: исход партии или ценность хода
        outcome = sample.turn_value() if target == "self" else sample.value()
        value_sign += int((z[sample.chosen] > 0) == (outcome > 0))
    return {
        "rows": len(rows),
        "policy_top1": top1 / max(1, counted),
        "value_sign": value_sign / len(rows),
        "policy_ce": loss / max(1, counted),
    }


def collect(paths, limit=None):
    """Читает одну или несколько выборок: у каждой свой заголовок, признаки у них одинаковые."""
    samples = []
    header = {}
    for path in paths:
        header = header or read_header(path)
        samples.extend(read_samples(path))
        if limit is not None and len(samples) >= limit:
            return samples[:limit], header
    return samples, header


def train(args):
    paths = [part.strip() for part in str(args.data).split(",") if part.strip()]
    samples, header = collect(paths, args.limit)
    if len(samples) < 20:
        raise SystemExit(f"данных мало: {len(samples)} точек решения — проверь контракт (--check)")

    summary_names = header.get("summaryFeatures") or DEFAULT_SUMMARY
    base_features = header.get("baseFeatures") or []
    summary_index = [base_features.index(name) for name in summary_names if name in base_features]
    if not summary_index:
        raise SystemExit("в заголовке нет имён признаков позиции: экспорт без заголовка?")

    state_dim = max(len(sample.state) for sample in samples)
    action_dim = max(len(action.features) for sample in samples for action in sample.actions)
    hero_names = sorted({sample.player for sample in samples} | {sample.rival for sample in samples})
    card_names = sorted({a.card for s in samples for a in s.actions if a.card})

    games = sorted({sample.game for sample in samples})
    random.Random(args.seed).shuffle(games)
    cut = max(1, int(len(games) * args.holdout))
    holdout = set(games[:cut])
    train_rows = [s for s in samples if s.game not in holdout]
    verify_rows = [s for s in samples if s.game in holdout]

    model = LinearQ(state_dim, action_dim, summary_index, hero_names, card_names, seed=args.seed)
    print(
        f"выборка: {len(samples)} точек, партий {len(games)}; обучение {len(train_rows)}, "
        f"проверка {len(verify_rows)}; состояние {state_dim}, действие {action_dim}, "
        f"скрещивание {len(summary_index)}×{action_dim}, героев {len(hero_names)}, карт {len(card_names)}"
    )

    lr = args.lr
    for epoch in range(1, args.epochs + 1):
        order = list(range(len(train_rows)))
        random.Random(args.seed + epoch).shuffle(order)
        total = 0.0
        steps = 0
        peak = 0.0

        for index in order:
            sample = train_rows[index]
            state, matrix, hero, rival, cards = build(sample, model)
            summary = state[summary_index]
            count = matrix.shape[0]

            z = model.scores(state, matrix, hero, rival, cards)
            grad_z = np.zeros(count)
            # чему учимся: исход партии (обычные режимы) или ценность хода (`self`, §26)
            outcome = sample.turn_value() if args.target == "self" else sample.value()

            target = target_for(sample, args.target, args.oracle_temperature)
            if target is not None:
                p = np.exp(z - z.max())
                p /= p.sum()
                # `self` — обучение на своих ошибках: свой выбор усиливается в выигранных партиях и
                # гасится в проигранных, поэтому знак шага задаёт исход (политика с преимуществом)
                sign = outcome if args.target == "self" else 1.0
                grad_z += args.policy_weight * sign * (p - target)
                total += float(-sign * (target * np.log(np.maximum(p, 1e-12))).sum())
                steps += 1

            # ценность выбранного действия против исхода партии (или против ценности хода)
            chosen = min(sample.chosen, count - 1)
            grad_z[chosen] += args.q_weight * 2 * (z[chosen] - outcome)
            total += args.q_weight * float((z[chosen] - outcome) ** 2)

            value = model.value(state)
            grad_value = args.value_weight * 2 * (value - outcome)
            total += args.value_weight * float((value - outcome) ** 2)
            steps += 1

            # обрезка градиента: член Q пропорционален самой оценке, поэтому без клиппинга веса
            # разгоняются за считанные эпохи (на 40k точек это незаметно, на 400k — расходятся)
            grad_z = np.clip(grad_z, -args.clip, args.clip)
            grad_value = float(np.clip(grad_value, -args.clip, args.clip))
            peak = max(peak, float(np.abs(z).max()))

            # градиенты по параметрам
            model.b -= lr * grad_z.sum()
            model.w_state -= lr * (grad_z.sum() * state + args.l2 * model.w_state)
            model.w_action -= lr * (matrix.T @ grad_z + args.l2 * model.w_action)
            model.w_cross -= lr * (
                np.outer(summary, matrix.T @ grad_z) + args.l2 * model.w_cross
            )
            model.hero_bias[model.hero_index.get(hero, 0)] -= lr * grad_z.sum()
            model.rival_bias[model.hero_index.get(rival, 0)] -= lr * grad_z.sum()
            for slot, card in enumerate(cards):
                model.card_bias[card] -= lr * grad_z[slot]
            model.b_value -= lr * grad_value
            model.w_value -= lr * (grad_value * state + args.l2 * model.w_value)

        lr *= args.decay
        if epoch % 2 == 0 or epoch == 1:
            report = evaluate(model, verify_rows, args.target, args.oracle_temperature)
            print(
                f"  эпоха {epoch}: loss {total / max(1, steps):.4f}, |z|≤{peak:.2f} | проверка: "
                f"top-1 политики {report['policy_top1']:.3f}, знак Q {report['value_sign']:.3f}, "
                f"CE {report['policy_ce']:.4f} (lr {lr:.4f})"
            )

    report = evaluate(model, verify_rows, args.target, args.oracle_temperature)
    artifact = {
        "v": 1,
        "kind": "linear-q",
        "stateDim": state_dim,
        "actionDim": action_dim,
        "summaryFeatures": summary_names,
        "summaryIndex": summary_index,
        "heroes": model.heroes,
        "cards": model.cards,
        "b": round(model.b, 5),
        "wState": [round(float(v), 5) for v in model.w_state],
        "wAction": [round(float(v), 5) for v in model.w_action],
        "wCross": [[round(float(v), 5) for v in row] for row in model.w_cross],
        "heroBias": [round(float(v), 5) for v in model.hero_bias],
        "rivalBias": [round(float(v), 5) for v in model.rival_bias],
        "cardBias": [round(float(v), 5) for v in model.card_bias],
        "bValue": round(model.b_value, 5),
        "wValue": [round(float(v), 5) for v in model.w_value],
        "meta": {
            "samples": len(samples),
            "games": len(games),
            "train": len(train_rows),
            "holdout": len(verify_rows),
            "epochs": args.epochs,
            "lr": args.lr,
            "data": os.path.basename(args.data),
            "policy_weight": args.policy_weight,
            "q_weight": args.q_weight,
            "value_weight": args.value_weight,
            "target": args.target,
            "turnValue": any(sample.turn is not None for sample in samples),
            **{key: round(value, 4) for key, value in report.items() if isinstance(value, float)},
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf8") as handle:
        json.dump(artifact, handle, ensure_ascii=False)
        handle.write("\n")

    # зеркало для бандла: в браузере нет fs, поэтому игра читает JS-модуль, а не JSON
    with open(args.js_out, "w", encoding="utf8") as handle:
        handle.write("/**\n")
        handle.write(" * Артефакт тренера (`trainer/README.md`) — зеркало `trainer/artifacts/q.json`.\n")
        handle.write(" * Файл **перезаписывается** обучением: править руками нечего.\n")
        handle.write(" */\n")
        handle.write("export default " + json.dumps(artifact, ensure_ascii=False) + ";\n")

    print(f"артефакт: {args.out} ({os.path.getsize(args.out) // 1024} КБ) и {args.js_out}")
    print(f"проверка на удержанных партиях: {report}")
    print("дальше: pnpm test:matrix -- --policy=qvalue --policy-b=greedy --games=10 --workers=8")


def main():
    train(parse_args())


if __name__ == "__main__":
    main()
