"""Контракт данных тренера: одна строка JSONL — одна точка решения в партии.

Строку пишет Node-поставщик (`bot/learn/export.js`): там живёт движок, поэтому признаки состояния и
признаки действий считаются на стороне игры, а тренер их только читает. Формат намеренно
игра-агностичный: тренер не знает ни правил, ни карт — только числа и словари, поэтому тот же код
годится и для нового героя, и для другой игры с таким же контрактом.

Строка:

    {
      "v": 1,
      "game": 42,                 // номер партии: по нему делится выборка (не по строкам!)
      "step": 17,                 // шаг партии
      "player": "anubis",         // кто решает
      "rival": "medusa",          // против кого
      "state": [ ... ],           // признаки позиции глазами `player` (bot/play/value.js)
      "winner": "anubis",         // исход партии или null, если не доиграна
      "chosen": 3,                // индекс выбранного действия
      "actions": [
        {
          "key": "PICK:card:anubis_01_0",  // человекочитаемый ключ действия
          "card": "anubis_01",             // id карты или null
          "prior": 12.3,                   // вес политики (её приоритет варианта)
          "visits": 41,                    // сколько доигрываний выбрало этот вариант (0 — не выбрало)
          "features": [ ... ]              // признаки действия (см. bot/learn/export.js)
        }
      ]
    }

`visits` — мягкая цель для политики (дистилляция поиска), `winner` — цель для оценки: этого достаточно,
чтобы учить Q(state, action) без доступа к правилам.
"""

import gzip
import json
from dataclasses import dataclass, field


@dataclass
class Action:
    key: str
    features: list
    prior: float = 0.0
    visits: int = 0
    value: float = 0.0
    card: str | None = None


@dataclass
class Sample:
    game: int
    step: int
    player: str
    rival: str
    state: list
    actions: list = field(default_factory=list)
    chosen: int = 0
    winner: str | None = None
    turn: float | None = None

    @property
    def finished(self) -> bool:
        return self.winner is not None

    def value(self) -> float:
        """Цель для оценки: +1, если решающий выиграл партию, иначе −1."""
        return 1.0 if str(self.winner) == str(self.player) else -1.0

    def turn_value(self) -> float:
        """Ценность хода: оценка позиции сразу после хода решающего (если экспорт её записал).

        Исход партии один на сотню решений, а «что принёс ход» известно после каждого хода — эта цель
        плотнее и не шумит так, как исход. Нет её в строке — берём исход партии.
        """
        if self.turn is None:
            return self.value()
        return float(self.turn)

    def policy_target(self) -> list:
        """Мягкая цель политики: доли доигрываний. Пусто — цель не годится (нет посещений)."""
        total = sum(max(0, int(action.visits or 0)) for action in self.actions)
        if total <= 0:
            return []
        return [max(0, int(action.visits or 0)) / total for action in self.actions]


def read_header(path):
    """Заголовок выборки (первая строка): имена признаков, порядок «сводки» и словари.

    Без него порядок признаков пришлось бы дублировать в Python и следить за совпадением руками;
    заголовок пишет тот же код, что и данные (`bot/learn/export.js`).
    """
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt", encoding="utf8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("header"):
                return row
            return {}
    return {}


def read_samples(path, limit=None, finished_only=True):
    """Читает JSONL (в том числе `.gz`) и отдаёт `Sample`. Битую строку пропускает: данные машинные."""
    opener = gzip.open if str(path).endswith(".gz") else open
    samples = []
    with opener(path, "rt", encoding="utf8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if int(row.get("v", 0)) != 1:
                continue
            if finished_only and row.get("winner") is None:
                continue

            actions = [
                Action(
                    key=str(entry.get("key", "")),
                    features=[float(value) for value in entry.get("features", [])],
                    prior=float(entry.get("prior", 0.0) or 0.0),
                    visits=int(entry.get("visits", 0) or 0),
                    value=float(entry.get("value", 0.0) or 0.0),
                    card=(str(entry["card"]) if entry.get("card") else None),
                )
                for entry in row.get("actions", [])
            ]
            if not actions:
                continue

            samples.append(
                Sample(
                    game=int(row.get("game", 0) or 0),
                    step=int(row.get("step", 0) or 0),
                    player=str(row.get("player", "")),
                    rival=str(row.get("rival", "")),
                    state=[float(value) for value in row.get("state", [])],
                    actions=actions,
                    chosen=int(row.get("chosen", 0) or 0),
                    winner=(str(row["winner"]) if row.get("winner") is not None else None),
                    # цена хода: есть только в новых дневниках, у старых остаётся None (тогда цель — исход)
                    turn=(float(row["turn"]) if row.get("turn") is not None else None),
                )
            )
            if limit is not None and len(samples) >= int(limit):
                break
    return samples


def vocabulary(samples):
    """Словари героев и карт: порядок устойчивый (сортировка), чтобы артефакт был воспроизводим."""
    heroes = sorted({sample.player for sample in samples} | {sample.rival for sample in samples})
    cards = sorted(
        {action.card for sample in samples for action in sample.actions if action.card} or set()
    )
    return {
        "heroes": heroes,
        "cards": cards,
        "hero_index": {hero: index for index, hero in enumerate(heroes)},
        "card_index": {card: index for index, card in enumerate(cards)},
    }


def describe(samples):
    """Сводка выборки: ею проверяют контракт до установки torch (`python trainer/train.py --check`)."""
    games = sorted({sample.game for sample in samples})
    state_dim = max((len(sample.state) for sample in samples), default=0)
    action_dim = max(
        (len(action.features) for sample in samples for action in sample.actions), default=0
    )
    sizes = [len(sample.actions) for sample in samples]
    with_visits = sum(1 for sample in samples if sum(a.visits for a in sample.actions) > 0)
    return {
        "samples": len(samples),
        "games": len(games),
        "state_dim": state_dim,
        "action_dim": action_dim,
        "actions_per_step": (sum(sizes) / len(sizes)) if sizes else 0.0,
        "candidates_max": max(sizes, default=0),
        "with_search_visits": with_visits,
        "heroes": sorted({sample.player for sample in samples}),
    }
