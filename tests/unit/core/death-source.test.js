import { describe, expect, it } from 'vitest';
import { SET_HEALTH } from '#shared/actions/health.js';
import { stateFields } from '#shared/constants/state.js';
import { cardKey } from '#shared/helpers/cards.js';
import { runRules } from '#shared/rules/run.js';
import snowQueen from '../../../server/content/heroes/snow-queen/index.js';
import { card, createState, deck, discard, fighter, player } from '../../fixtures/state.js';

/**
 * «Боец погиб именно от этой карты»: `SET_HEALTH` передаёт в мост `lost` сведения об источнике
 * (`action.source`, `action.playedCard`), движок кладёт их в служебный `state._death`, а карта-источник
 * прогоняет в этом моменте свои правила. Порядок — сначала умение владельца, потом карта.
 */

/** Карта-источник: `runRules` кладёт её в действие как `playedCard`, а её id — в `_death.source`. */
const effectCard = (id, rules, instanceId) =>
  card({ id, instanceId, title: id, type: 'effect', rules });

const crow = patch =>
  fighter({
    id: 'crow_1',
    name: 'Кристальная ворона',
    type: 'assistant',
    group: 'crow',
    currentPosition: null,
    currentHp: 2,
    startHp: 2,
    move: 3,
    ...patch,
  });

const stateWithCrow = (patch = {}) => {
  const state = createState(patch);
  player(state, '0').fighters.push(crow());
  return state;
};

/** Разыграть правила карты как её действие: source — ключ копии, card — сама карта. */
const playCard = (state, cardObject, playerId = '0') =>
  runRules(state, cardObject.rules, 'effect', {
    playerId,
    source: cardKey(cardObject),
    card: cardObject,
  });

const lostOf = (state, playerId = '0') => player(state, playerId).lost ?? [];

/** Линия из пяти клеток: своим бойцам хватает места, для возврата убитого есть свободная. */
const lineMap = {
  id: 'line',
  name: 'Line',
  nodes: [8, 9, 10, 11, 12].map((id, index, list) => ({
    id,
    terrain: 'ice',
    x: index,
    y: 0,
    neighbors: [list[index - 1], list[index + 1]].filter(neighbour => neighbour != null),
  })),
};

/** Умение владельца: та же форма, что у «Вечной мерзлоты» — гибель вороны сбрасывает верхнюю карту. */
const ownerSkill = {
  id: 'test_skill',
  type: 'skill',
  fighter: 'alpha',
  rules: [
    {
      moment: 'lost',
      when: [{ fact: 'DEATH', params: { group: 'crow' } }],
      then: [{ action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 }],
    },
  ],
};

describe('источник смерти: карта, добившая бойца, получает свой момент lost', () => {
  it('карта срабатывает на смерть, которую нанесла сама', () => {
    const killer = effectCard('sq_17', [
      { moment: 'effect', then: [{ action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 }] },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { source: 'sq_17' } }],
        then: [{ action: 'SET_ACTIONS', delta: 1 }],
      },
    ]);
    const state = stateWithCrow();
    const actionsBefore = state.turn.actionsLeft;

    playCard(state, killer);

    expect(lostOf(state).map(entry => entry.id)).toEqual(['crow_1']);
    expect(state.turn.actionsLeft).toBe(actionsBefore + 1);
  });

  it('`_death` — транзиент: после прогона его в состоянии нет', () => {
    const killer = effectCard('sq_17', [
      { moment: 'effect', then: [{ action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 }] },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { source: 'sq_17' } }],
        then: [{ action: 'SET_ACTIONS', delta: 1 }],
      },
    ]);
    const state = stateWithCrow();

    const next = playCard(state, killer);

    expect('_death' in next).toBe(false);
    expect('_death' in stateFields).toBe(false);
  });

  it('source — id карты, а не ключ копии: номер копии в колоде не важен', () => {
    const killer = effectCard(
      'sq_17',
      [
        { moment: 'effect', then: [{ action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 }] },
        {
          moment: 'lost',
          when: [{ fact: 'DEATH', params: { source: 'sq_17' } }],
          then: [{ action: 'SET_ACTIONS', delta: 1 }],
        },
      ],
      'sq_17_4',
    );
    const state = stateWithCrow();

    playCard(state, killer);

    expect(cardKey(killer)).toBe('sq_17_4');
    expect(state.turn.actionsLeft).toBe(3);
  });

  it('порядок: сначала умение владельца, потом карта-источник', () => {
    const killer = effectCard('sq_17', [
      { moment: 'effect', then: [{ action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 }] },
      {
        moment: 'lost',
        // условие читается уже по состоянию после умения: без сброшенной им карты правило молчит
        when: [
          { fact: 'DEATH', params: { group: 'crow', source: 'sq_17' } },
          { fact: 'CARDS', params: { zone: 'discard', min: 1 } },
        ],
        then: [{ action: 'SET_ACTIONS', delta: 1 }],
      },
    ]);
    const state = stateWithCrow();
    player(state, '0').skill = structuredClone(ownerSkill);
    const deckBefore = deck(player(state, '0')).length;

    playCard(state, killer);

    expect(deck(player(state, '0'))).toHaveLength(deckBefore - 1);
    expect(state.turn.actionsLeft).toBe(3);
  });
});

describe('источник смерти: чужая карта на смерть не отзывается', () => {
  it('смерть от чужого действия не запускает правило карты соперника', () => {
    const state = stateWithCrow();
    // карта игрока 0 подошла бы под смерть вороны, но источник — не она
    player(state, '0').hand.cards.push(
      effectCard('sq_17', [
        {
          moment: 'lost',
          when: [{ fact: 'DEATH', params: { group: 'crow' } }],
          then: [
            { action: 'SET_ACTIONS', delta: 2 },
            { action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 },
          ],
        },
      ]),
    );

    const killer = effectCard('sq_18', [
      { moment: 'effect', then: [{ action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 }] },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { group: 'crow', source: 'sq_18' } }],
        then: [{ action: 'SET_ACTIONS', delta: 1 }],
      },
    ]);
    const deckBefore = deck(player(state, '0')).length;

    playCard(state, killer, '1');

    expect(lostOf(state).map(entry => entry.id)).toEqual(['crow_1']);
    // сработало только правило карты-источника: +1 действие, сброса у игрока 0 нет
    expect(state.turn.actionsLeft).toBe(3);
    expect(deck(player(state, '0'))).toHaveLength(deckBefore);
  });

  it('DEATH: фильтр source не ломает group, type и min', () => {
    const keeper = effectCard('sq_17', [
      { moment: 'effect', then: [{ action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 }] },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { source: 'sq_17', group: 'crow' } }],
        then: [{ action: 'SET_ACTIONS', delta: 1 }],
      },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { source: 'sq_17', type: 'hero' } }],
        then: [{ action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 }],
      },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { source: 'sq_99' } }],
        then: [{ action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 }],
      },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { source: 'sq_17' }, min: 2 }],
        then: [{ action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 }],
      },
    ]);
    const state = stateWithCrow();
    const deckBefore = deck(player(state, '0')).length;

    playCard(state, keeper);

    expect(state.turn.actionsLeft).toBe(3);
    expect(deck(player(state, '0'))).toHaveLength(deckBefore);
  });
});

describe('источник смерти: умение владельца работает как раньше', () => {
  it('умение владельца срабатывает и когда смерть нанёс не он', () => {
    const state = stateWithCrow();
    player(state, '0').skill = structuredClone(ownerSkill);
    const deckBefore = deck(player(state, '0')).length;

    SET_HEALTH(state, { fighterIds: ['crow_1'], delta: -2 });

    expect(deck(player(state, '0'))).toHaveLength(deckBefore - 1);
    expect(lostOf(state).map(entry => entry.id)).toEqual(['crow_1']);
  });

  it('«Вечная мерзлота»: верхняя карта колоды уходит в сброс', () => {
    const state = stateWithCrow();
    player(state, '0').skill = structuredClone(snowQueen.skill);
    player(state, '0').deck.cards.push(card({ id: 'top_card', title: 'top_card' }));
    const deckBefore = deck(player(state, '0')).length;

    SET_HEALTH(state, { fighterIds: ['crow_1'], delta: -2 });

    expect(deck(player(state, '0'))).toHaveLength(deckBefore - 1);
    expect(discard(player(state, '0')).map(entry => entry.id)).toContain('top_card');
  });

  it('гибель героя правило умения не задевает', () => {
    const state = stateWithCrow();
    player(state, '0').skill = structuredClone(ownerSkill);
    const deckBefore = deck(player(state, '0')).length;

    SET_HEALTH(state, { fighterIds: ['alpha'], delta: -99 });

    expect(deck(player(state, '0'))).toHaveLength(deckBefore);
  });
});

describe('источник смерти: рекурсии нет', () => {
  it('правило lost, возвращающее и снова добивающее бойца, не уводит смерть по кругу', () => {
    const endless = effectCard('sq_17', [
      { moment: 'effect', then: [{ action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 }] },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { group: 'crow', source: 'sq_17' } }],
        then: [
          { action: 'SET_ACTIONS', delta: 1 },
          { action: 'REVIVE_FIGHTER', group: 'crow', cellId: 11 },
          { action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 },
        ],
      },
    ]);
    const state = stateWithCrow({ map: lineMap });

    expect(() => playCard(state, endless)).not.toThrow();

    // карта, уже разбирающая собственную смерть, второй раз не запускается
    expect(state.turn.actionsLeft).toBe(3);
    expect(lostOf(state).map(entry => entry.id)).toEqual(['crow_1']);
    expect('_death' in state).toBe(false);
  });

  it('вложенная смерть видна, но карту второй раз не запускает', () => {
    const chain = effectCard('sq_17', [
      { moment: 'effect', then: [{ action: 'SET_HEALTH', fighterId: 'crow_1', delta: -2 }] },
      {
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { group: 'crow', source: 'sq_17' } }],
        then: [
          { action: 'SET_ACTIONS', delta: 1 },
          { action: 'SET_HEALTH', fighterId: 'crow_2', delta: -2 },
        ],
      },
    ]);
    const state = stateWithCrow();
    player(state, '0').fighters.push(crow({ id: 'crow_2' }));
    player(state, '0').skill = structuredClone(ownerSkill);
    const deckBefore = deck(player(state, '0')).length;

    playCard(state, chain);

    // умение владельца сработало на обе смерти, правило карты — один раз на свою
    expect(deck(player(state, '0'))).toHaveLength(deckBefore - 2);
    expect(state.turn.actionsLeft).toBe(3);
    expect(lostOf(state).map(entry => entry.id)).toEqual(['crow_1', 'crow_2']);
    expect('_death' in state).toBe(false);
  });
});
