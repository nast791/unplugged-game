"""Обучение Q(state, action) на выборке из Node-поставщика партий.

Запуск (после `pip install torch`):

    python trainer/train.py --data=trainer/data/search.jsonl --epochs=40 --out=trainer/artifacts/q.json

Проверка контракта без torch (работает на голом Python):

    python trainer/train.py --data=trainer/data/search.jsonl --check

Данные готовит `bot/learn/export.js` (Node играет партии и стримит JSONL) — за это отвечает движок,
тренер правил не знает. Делим выборку **по партиям**, а не по строкам: строки одной партии сильно
коррелированы, и построчный сплит дал бы завышенную проверку.
"""

import argparse
import json
import os
import random
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# консоль Windows по умолчанию в cp1251 и падает на «×» и длинном тире: печатаем в UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf8", errors="replace")

from contract import describe, read_samples, vocabulary  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser(description="Универсальный тренер: Q(state, action)")
    parser.add_argument("--data", required=True, help="JSONL от bot/learn/export.js (.gz можно)")
    parser.add_argument("--out", default="trainer/artifacts/q.json", help="куда писать артефакт")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--hidden", type=int, default=64)
    parser.add_argument("--embed", type=int, default=8)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--holdout", type=float, default=0.1, help="доля партий в проверку")
    parser.add_argument("--limit", type=int, default=None, help="прочитать не больше N строк")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--policy-weight", type=float, default=1.0)
    parser.add_argument("--q-weight", type=float, default=1.0)
    parser.add_argument("--value-weight", type=float, default=0.5)
    parser.add_argument(
        "--target",
        choices=("auto", "chosen", "self", "oracle"),
        default="auto",
        help=(
            "цель политики: auto — доли доигрываний; chosen — выбор учителя; "
            "self — свой выбор со знаком исхода; oracle — ранжирование по ценности каждого варианта"
        ),
    )
    parser.add_argument(
        "--oracle-temperature",
        type=float,
        default=0.25,
        help="насколько мягко цель оракула размазывается по вариантам (доля от разброса цен)",
    )
    parser.add_argument(
        "--margin",
        type=float,
        default=0.0,
        help=(
            "порог пары: пары вариантов с меньшей разницей цен оракула игнорируются, "
            "а потеря считается парным ранжированием (0 — мягкая цель как раньше)"
        ),
    )
    parser.add_argument(
        "--js-out",
        default="bot/play/qvalue-weights.js",
        help="зеркало артефакта для бандла (то же, что у линейного тренера)",
    )
    parser.add_argument("--check", action="store_true", help="только проверить данные и выйти")
    return parser.parse_args()


def split_by_game(samples, holdout, seed):
    """Делит выборку по номерам партий: строки одной партии не попадают в обе части."""
    games = sorted({sample.game for sample in samples})
    random.Random(seed).shuffle(games)
    cut = max(1, int(len(games) * float(holdout)))
    holdout_games = set(games[:cut])
    train = [sample for sample in samples if sample.game not in holdout_games]
    verify = [sample for sample in samples if sample.game in holdout_games]
    return train, verify


def target_distribution(target, visits, values, priors, chosen, mask, temperature):
    """Мягкая цель политики одной формулой для всех режимов — той же, что у линейного тренера.

    `auto` — доли доигрываний, а где их нет — веса политики; `chosen` — выбор учителя одним вариантом;
    `oracle` — ранжирование по ценности **каждого** варианта (разброс берётся внутри решения, потому что
    абсолютный уровень ценности — свойство позиции, а не выбора); `self` считается как `chosen`, а знак
    шага задаёт исход (см. цикл обучения).
    """
    import torch  # импорт здесь: `--check` должен работать без torch

    if target == "chosen" or target == "self":
        one_hot = torch.zeros_like(visits)
        one_hot.scatter_(1, chosen.unsqueeze(1), 1.0)
        return one_hot * mask

    if target == "oracle":
        if float(values.abs().sum()) == 0:
            return None
        best = values.max(dim=1, keepdim=True).values
        spread = torch.clamp(best - values.min(dim=1, keepdim=True).values, min=1e-6)
        spread = spread * max(0.05, float(temperature))
        exp = torch.exp((values - best) / spread) * mask
        return exp / torch.clamp(exp.sum(dim=1, keepdim=True), min=1e-9)

    visit_total = visits.sum(dim=1, keepdim=True)
    prior_total = priors.sum(dim=1, keepdim=True)
    if float(visit_total.sum()) == 0 and float(prior_total.sum()) == 0:
        return None
    by_visits = visits / torch.clamp(visit_total, min=1e-9)
    by_priors = priors / torch.clamp(prior_total, min=1e-9)
    mixed = torch.where(visit_total > 0, by_visits, by_priors)
    return mixed * mask


def batches(samples, size, seed, epoch):
    order = list(range(len(samples)))
    random.Random(seed + epoch).shuffle(order)
    for start in range(0, len(order), size):
        yield [samples[index] for index in order[start : start + size]]


def train(args):
    import torch  # импорт здесь: `--check` должен работать без torch

    from model import QScorer

    samples = []
    for path in [part.strip() for part in str(args.data).split(",") if part.strip()]:
        samples.extend(read_samples(path))
    if args.limit:
        samples = samples[: int(args.limit)]
    if len(samples) < 20:
        raise SystemExit(f"данных мало: {len(samples)} точек решения — проверь контракт (--check)")

    words = vocabulary(samples)
    train_rows, verify_rows = split_by_game(samples, args.holdout, args.seed)
    state_dim = max(len(sample.state) for sample in samples)
    action_dim = max(len(action.features) for sample in samples for action in sample.actions)
    card_index = {card: index + 1 for index, card in enumerate(words["cards"])}  # 0 — «не карта»

    print(
        f"выборка: {len(samples)} точек, партий {len({s.game for s in samples})}, "
        f"обучение {len(train_rows)}, проверка {len(verify_rows)}; "
        f"признаки: состояние {state_dim}, действие {action_dim}, "
        f"героев {len(words['heroes'])}, карт {len(words['cards'])}"
    )

    model = QScorer(
        state_dim, action_dim, words["heroes"], words["cards"], hidden=args.hidden, embed=args.embed
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    def to_batch(rows):
        """Пачка: варианты добиваются нулями, маска помечает настоящие."""
        count = max(len(row.actions) for row in rows)
        states = torch.tensor([row.state + [0.0] * (state_dim - len(row.state)) for row in rows])
        actions = torch.zeros(len(rows), count, action_dim)
        cards = torch.zeros(len(rows), count, dtype=torch.long)
        mask = torch.zeros(len(rows), count)
        visits = torch.zeros(len(rows), count)
        values = torch.zeros(len(rows), count)
        priors = torch.zeros(len(rows), count)
        for index, row in enumerate(rows):
            for slot, action in enumerate(row.actions):
                actions[index, slot, : len(action.features)] = torch.tensor(action.features)
                cards[index, slot] = card_index.get(action.card, 0)
                mask[index, slot] = 1.0
                visits[index, slot] = max(0, action.visits)
                values[index, slot] = action.value
                priors[index, slot] = max(0.0, action.prior)
        chosen = torch.tensor([min(row.chosen, len(row.actions) - 1) for row in rows])
        # цель оценки: исход партии, а с `--target=self` — ценность хода (плотнее и не так шумит)
        outcome = torch.tensor(
            [
                row.turn_value() if args.target == "self" else row.value()
                for row in rows
            ]
        )
        return states, actions, cards, mask, chosen, outcome, visits, values, priors

    def policy_loss(scores, target, outcome):
        """Потери политики: мягкая цель плюс (для `self`) знак шага — исход партии."""
        logp = torch.log_softmax(scores, dim=1)
        per_row = -(target * logp).sum(dim=1)
        sign = outcome if args.target == "self" else torch.ones_like(outcome)
        return (per_row * sign).mean()

    def margin_loss(scores, values, mask, margin):
        """Парное ранжирование с порогом: учимся только на парах, где оракул уверен.

        Замер §29 показал, что на решениях-клетках ценности оракула — шум (он согласен сам с собой на
        56–60%, и рост бюджета не помогает), а мягкая цель заставляет модель учить этот случайный
        порядок. Здесь штрафуется только пара, где разница цен больше порога: `hinge = max(0, margin −
        (Q_лучший − Q_худший))`. Пары внутри порога не дают градиента вовсе — модель не тратит ёмкость на
        то, чего не знает и сам оракул.
        """
        diff = values.unsqueeze(2) - values.unsqueeze(1)
        qdiff = scores.unsqueeze(2) - scores.unsqueeze(1)
        pair_mask = mask.unsqueeze(2) * mask.unsqueeze(1)
        confident = (diff.abs() > margin).float() * pair_mask
        hinge = torch.relu(margin - torch.sign(diff) * qdiff)
        return (hinge * confident).sum() / torch.clamp(confident.sum(), min=1.0)

    def evaluate(rows):
        if not rows:
            return {}
        model.eval()
        correct = 0
        counted = 0
        value_correct = 0
        losses = []
        with torch.no_grad():
            for chunk in batches(rows, args.batch, args.seed, -1):
                states, actions, cards, mask, chosen, outcome, visits, values, priors = to_batch(
                    chunk
                )
                names = [row.player for row in chunk]
                rivals = [row.rival for row in chunk]
                scores, value = model(states, actions, names, rivals, cards, mask)
                target = target_distribution(
                    args.target, visits, values, priors, chosen, mask, args.oracle_temperature
                )

                best = scores.argmax(dim=1)
                for index, row in enumerate(chunk):
                    if target is None:
                        continue
                    if args.margin > 0:
                        # с порогом «верно» и попадание в группу неразличимых вариантов: их порядок оракул
                        # и сам не знает, штрафовать за него модель нельзя (§29)
                        rows_values = values[index][: len(row.actions)]
                        hit = float(rows_values[int(best[index])]) >= float(rows_values.max()) - args.margin
                    else:
                        hit = (
                            target[index][int(best[index])]
                            == target[index][: len(row.actions)].max()
                        )
                    if hit:
                        correct += 1
                    counted += 1
                picked = scores.gather(1, chosen.unsqueeze(1)).squeeze(1)
                value_correct += int(((picked > 0) == (outcome > 0)).sum())
                losses.append(float(torch.nn.functional.mse_loss(picked, outcome)))
        return {
            "rows": len(rows),
            "policy_top1": correct / max(1, counted),
            "value_sign": value_correct / len(rows),
            "q_mse": sum(losses) / max(1, len(losses)),
        }

    for epoch in range(1, int(args.epochs) + 1):
        model.train()
        total = 0.0
        steps = 0
        for chunk in batches(train_rows, args.batch, args.seed, epoch):
            states, actions, cards, mask, chosen, outcome, visits, values, priors = to_batch(chunk)
            names = [row.player for row in chunk]
            rivals = [row.rival for row in chunk]
            scores, value = model(states, actions, names, rivals, cards, mask)

            loss = torch.zeros(())
            if args.margin > 0:
                # учимся на парах, где оракул уверен; пары внутри порога — шум оракула (§29)
                loss = loss + args.policy_weight * margin_loss(scores, values, mask, args.margin)
            else:
                target = target_distribution(
                    args.target, visits, values, priors, chosen, mask, args.oracle_temperature
                )
                if target is not None:
                    loss = loss + args.policy_weight * policy_loss(scores, target, outcome)

            picked = scores.gather(1, chosen.unsqueeze(1)).squeeze(1)
            loss = loss + args.q_weight * torch.nn.functional.mse_loss(picked, outcome)
            loss = loss + args.value_weight * torch.nn.functional.mse_loss(value, outcome)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total += float(loss)
            steps += 1

        if epoch % 5 == 0 or epoch == 1:
            report = evaluate(verify_rows)
            print(
                f"  эпоха {epoch}: loss {total / max(1, steps):.4f} | "
                f"проверка: top-1 политики {report.get('policy_top1', 0):.3f}, "
                f"знак Q {report.get('value_sign', 0):.3f}, MSE {report.get('q_mse', 0):.4f}"
            )

    report = evaluate(verify_rows)
    meta = {
        "samples": len(samples),
        "games": len({sample.game for sample in samples}),
        "train": len(train_rows),
        "holdout": len(verify_rows),
        "hidden": args.hidden,
        "embed": args.embed,
        "epochs": args.epochs,
        "target": args.target,
        "margin": args.margin,
        "policy_weight": args.policy_weight,
        "q_weight": args.q_weight,
        "value_weight": args.value_weight,
        **{key: round(value, 4) for key, value in report.items() if isinstance(value, float)},
    }
    artifact = model.export(meta)
    directory = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(directory, exist_ok=True)
    with open(args.out, "w", encoding="utf8") as handle:
        json.dump(artifact, handle, ensure_ascii=False)
        handle.write("\n")

    # зеркало для бандла: в браузере нет fs, поэтому игра читает JS-модуль, а не JSON
    if args.js_out:
        mirror = os.path.dirname(os.path.abspath(args.js_out))
        os.makedirs(mirror, exist_ok=True)
        with open(args.js_out, "w", encoding="utf8") as handle:
            handle.write("/**\n")
            handle.write(" * Артефакт тренера (`trainer/README.md`) — зеркало артефакта MLP.\n")
            handle.write(" * Файл **перезаписывается** обучением: править руками нечего.\n")
            handle.write(" */\n")
            handle.write("export default " + json.dumps(artifact, ensure_ascii=False) + ";\n")

    print(f"артефакт: {args.out} ({os.path.getsize(args.out) // 1024} КБ) и {args.js_out}")
    print(f"проверка на удержанных партиях: {report}")
    print("как читать: этот артефакт грузит JS-рантайм (`bot/play/qvalue.js`) — см. trainer/README.md")


def main():
    args = parse_args()
    if args.check:
        rows = read_samples(args.data, limit=args.limit)
        print(json.dumps(describe(rows), ensure_ascii=False, indent=2))
        return
    train(args)


if __name__ == "__main__":
    main()
