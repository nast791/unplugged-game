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

Один и тот же `score` считается для каждого варианта хода — это и есть ранжирование действий моделью.
"""

import torch
import torch.nn as nn


class QScorer(nn.Module):
    def __init__(self, state_dim, action_dim, heroes, cards, hidden=64, embed=8):
        super().__init__()
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.hidden = hidden
        self.embed = embed
        self.heroes = list(heroes)
        self.cards = list(cards)

        self.hero_embed = nn.Embedding(max(1, len(self.heroes)), embed)
        # строк на одну больше, чем карт: индекс 0 — «не карта» (`train.py`: `card_index = index + 1`),
        # иначе первая карта словаря делила бы строку с пустой, а последняя выходила за границы
        self.card_embed = nn.Embedding(max(1, len(self.cards) + 1), embed)

        input_dim = state_dim + action_dim + 3 * embed
        self.trunk = nn.Sequential(
            nn.Linear(input_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
        )
        self.score = nn.Linear(hidden, 1)
        self.value = nn.Linear(state_dim, 1)

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
        packed = torch.cat([state, actions, hero, rival, card], dim=2)
        hidden = self.trunk(packed.reshape(batch * count, -1))
        scores = self.score(hidden).reshape(batch, count)
        scores = scores.masked_fill(mask < 0.5, -1e9)

        return scores, self.value(states).squeeze(-1)

    def export(self, meta):
        """Артефакт для JS-рантайма (`bot/play/qvalue.js`): только числа и словари, без torch."""
        def flatten(tensor):
            return [round(float(value), 5) for value in tensor.detach().reshape(-1)]

        trunk = list(self.trunk)
        return {
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
