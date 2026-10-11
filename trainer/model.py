"""Модель тренера: Q(state, action) с эмбеддингами героев и карт, плюс голова ценности позиции.

Почему именно так:

- **действие — часть входа.** Шесть замеров в `docs/hero-balance.md` (§17–§21) показали, что оценка
  *позиции* насыщена: признаки и точность растут, сила нет. Единственный непроверенный рычаг —
  оценивать пару «состояние + действие»;
- **эмбеддинги.** У героя и карты нет числового смысла, но есть смысл игровой: учим вектор на каждого
  (`nn.Embedding`), поэтому новый герой получает свои координаты без правки кода;
- **дистилляция поиска.** Цель политики — доли доигрываний (`visits`) из `bot/play/search.js`, а не
  «правильный ход»: поиск знает больше, чем исход партии, и учить по нему дешевле, чем по винрейту
  (см. §11 и §20 C — там градиент по винрейту не сработал);
- **две головы.** `score` (Q пары) участвует в политике и в предсказании исхода выбранного действия,
  `V(state)` — отдельная голова только на состоянии: она даёт запасной сигнал там, где действий мало.
- **две головы по виду решения** (`two_heads`, §49). Замер §28 и разбор §44 показали, что природа решений
  разная: на картах согласие с целью 53–75%, на клетках до признаков 0%. Флаг даёт **два ствола и две
  головы** — `cell` для шагов и `card` для всего остального (карта, добро, боец, «закончить»), маршрут
  берётся из первого числа вектора действия (там же, где рантайм отличает вид). Число параметров то же,
  что у одной большой головы, поэтому сравнение честное: не «больше чисел», а «разные карты признаков».

Один и тот же `score` считается для каждого варианта хода — это и есть ранжирование действий моделью.
"""

import torch
import torch.nn as nn


class QScorer(nn.Module):
    def __init__(
        self,
        state_dim,
        action_dim,
        heroes,
        cards,
        hidden=64,
        embed=8,
        two_heads=False,
        summary_index=None,
        gated=False,
    ):
        super().__init__()
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.hidden = hidden
        self.embed = embed
        self.two_heads = bool(two_heads)
        self.heroes = list(heroes)
        self.cards = list(cards)

        # **скрещивание «состояние × действие»** (`gated`, §50): у действия появляется свой входной вес,
        # который считается **из позиции**: `a' = a · σ(G · summary + g0)`. У линейной модели скрещивание
        # задано руками (`wCross`), а у сети взаимодействие есть только внутри первого слоя — то есть
        # фиксированное и общее для всех позиций. Здесь взаимодействие **своё для каждой позиции**.
        self.summary_index = list(summary_index or [])
        self.gated = bool(gated) and len(self.summary_index) > 0
        if self.gated:
            self.gate = nn.Linear(len(self.summary_index), action_dim)
            nn.init.zeros_(self.gate.weight)
            nn.init.zeros_(self.gate.bias)

        self.hero_embed = nn.Embedding(max(1, len(self.heroes)), embed)
        # строк на одну больше, чем карт: индекс 0 — «не карта» (`train.py`: `card_index = index + 1`),
        # иначе первая карта словаря делила бы строку с пустой, а последняя выходила за границы
        self.card_embed = nn.Embedding(max(1, len(self.cards) + 1), embed)

        input_dim = state_dim + action_dim + 3 * embed

        def trunk():
            return nn.Sequential(
                nn.Linear(input_dim, hidden),
                nn.ReLU(),
                nn.Linear(hidden, hidden),
                nn.ReLU(),
            )

        self.trunk = trunk()
        self.score = nn.Linear(hidden, 1)
        self.value = nn.Linear(state_dim, 1)

        if self.two_heads:
            # второй ствол стартует **копией** первого: сравнение с одной головой идёт с одного и того же
            # места, и разницу даёт только обучение, а не другая инициализация
            self.cell_trunk = trunk()
            self.cell_trunk.load_state_dict(self.trunk.state_dict())
            self.cell_score = nn.Linear(hidden, 1)
            self.cell_score.load_state_dict(self.score.state_dict())

        nn.init.zeros_(self.card_embed.weight)
        nn.init.normal_(self.hero_embed.weight, std=0.05)

    def _hero(self, names):
        index = torch.tensor(
            [self.heroes.index(name) if name in self.heroes else 0 for name in names],
            dtype=torch.long,
        )
        return self.hero_embed(index)

    def _cards(self, names):
        index = torch.tensor(
            [self.cards.index(name) if name in self.cards else 0 for name in names],
            dtype=torch.long,
        )
        return self.card_embed(index)

    def forward(self, states, actions, hero_of, rival_of, card_of, mask):
        """Считает Q и V для пачки точек решения.

        states:  (B, state_dim)
        actions: (B, A, action_dim)   — варианты хода (A — максимум вариантов в пачке)
        hero_of/rival_of: список имён длины B
        card_of: (B, A) индексы карт в словаре (0 — не карта)
        mask:    (B, A) 1 у существующих вариантов, 0 у добивки
        """
        batch, count, _ = actions.shape
        hero = self._hero(hero_of).unsqueeze(1).expand(batch, count, self.embed)
        rival = self._hero(rival_of).unsqueeze(1).expand(batch, count, self.embed)
        card = self.card_embed(card_of)

        state = states.unsqueeze(1).expand(batch, count, self.state_dim)
        if self.gated:
            # сводка позиции → ворота действия: векторы вариантов взвешиваются **по позиции**
            summary = states[:, self.summary_index]
            gate = torch.sigmoid(self.gate(summary)).unsqueeze(1)
            actions = actions * gate
        packed = torch.cat([state, actions, hero, rival, card], dim=2)
        flat = packed.reshape(batch * count, -1)

        if not self.two_heads:
            hidden = self.trunk(flat)
            scores = self.score(hidden).reshape(batch, count)
            scores = scores.masked_fill(mask < 0.5, -1e9)
            return scores, self.value(states).squeeze(-1)

        # маршрут: первый признак действия — вид (0 карта, 1 добро, 2 боец, 3 клетка, 4 «закончить»),
        # ровно он же различает головы в рантайме (`bot/play/qvalue.js: mlpScore`). Порог 0,25, а не 0,5:
        # с воротами признак клетки при нулевых воротах равен 0,5 (σ(0) · 1), и жёсткий порог ломал маршрут
        route = actions[:, :, 3] > 0.25
        flat_route = route.reshape(-1)
        hidden = torch.empty(flat.shape[0], self.hidden, dtype=flat.dtype)
        hidden[~flat_route] = self.trunk(flat[~flat_route])
        if bool(flat_route.any()):
            hidden[flat_route] = self.cell_trunk(flat[flat_route])
        scores = torch.empty(flat.shape[0], 1, dtype=flat.dtype)
        scores[~flat_route] = self.score(hidden[~flat_route])
        if bool(flat_route.any()):
            scores[flat_route] = self.cell_score(hidden[flat_route])
        scores = scores.reshape(batch, count).masked_fill(mask < 0.5, -1e9)

        return scores, self.value(states).squeeze(-1)

    def export(self, meta):
        """Артефакт для JS-рантайма (`bot/play/qvalue.js`): только числа и словари, без torch."""
        def flatten(tensor):
            return [round(float(value), 5) for value in tensor.detach().reshape(-1)]

        trunk = list(self.trunk)
        artifact = {
            "v": 1,
            "kind": "mlp-q",
            "stateDim": self.state_dim,
            "actionDim": self.action_dim,
            "hidden": self.hidden,
            "embed": self.embed,
            "heroes": self.heroes,
            "cards": self.cards,
            "heroEmbed": [flatten(row) for row in self.hero_embed.weight],
            "cardEmbed": [flatten(row) for row in self.card_embed.weight],
            "W1": flatten(trunk[0].weight),
            "b1": flatten(trunk[0].bias),
            "W2": flatten(trunk[2].weight),
            "b2": flatten(trunk[2].bias),
            "Wscore": flatten(self.score.weight),
            "bscore": flatten(self.score.bias),
            "Wvalue": flatten(self.value.weight),
            "bvalue": flatten(self.value.bias),
            "meta": meta,
        }
        if self.two_heads:
            # головы по виду решения (§49): те же ключи с суффиксом `Cell`, маршрут — признак 3 (клетка)
            cell_trunk = list(self.cell_trunk)
            artifact.update(
                {
                    "twoHeads": True,
                    "W1Cell": flatten(cell_trunk[0].weight),
                    "b1Cell": flatten(cell_trunk[0].bias),
                    "W2Cell": flatten(cell_trunk[2].weight),
                    "b2Cell": flatten(cell_trunk[2].bias),
                    "WscoreCell": flatten(self.cell_score.weight),
                    "bscoreCell": flatten(self.cell_score.bias),
                }
            )
        if self.gated:
            # ворота действия из сводки позиции (§50): рантайм повторяет ту же формулу, а индексы сводки
            # уезжают в артефакт, чтобы он не зависел от порядка признаков в коде (`summaryFeatures`
            # дописывает тренер — он знает имена)
            artifact.update(
                {
                    "gated": True,
                    "summaryIndex": list(self.summary_index),
                    "Wgate": flatten(self.gate.weight),
                    "bgate": flatten(self.gate.bias),
                }
            )
        return artifact
