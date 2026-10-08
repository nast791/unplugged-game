import { describe, expect, it } from 'vitest';
import { RECALL_PLAYED_CARD } from '#shared/actions/recall.js';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, hand, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_03');

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  }),
  startHp: hp,
  ...extra,
});

const slot = (id, name, order, fighters, hand = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

/** Линия 1—2—3: Ифрит на 2 (стихия `terrain`), Бета на 3 (40 hp — на три удара). */
const lineMap = terrain => ({
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain },
    { id: 3, neighbors: [2], terrain: 'ice' },
  ],
});

/** Ифрит держит карту с ключом `ifrit_03_1`; действий столько, чтобы бить несколько раз. */
const buildState = ({ terrain = 'lava' } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap(terrain),
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3 })],
        [{ ...card, instanceId: 'ifrit_03_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 40)]),
    ],
    turn: { index: 1, playerId: '0', actionsTotal: 4, actionsLeft: 4, actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Ифрит бьёт Бету «Вечным огнём»; Бета пасует. */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_03_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

/** Следующий удар в том же ходу: карта уже в руке со своим значением, действия не кончились. */
const nextBattle = state => {
  state.turn = { ...state.turn, playerId: '0', actionsLeft: 3 };
  return battle(state);
};

const heroHand = state => hand(player(state, '0'));
const heroDiscard = state => discard(player(state, '0'));

describe('карта ifrit_03 «Вечный огонь»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['afterCombat']);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'attack',
      value: 3,
      bonus: 1,
      quantity: 2,
      fighter: 'ifrit',
    });
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { fighterIds: ['ifrit'], terrain: 'lava' },
    });
    expect(card.rules[0].then[0]).toMatchObject({ action: 'RECALL_PLAYED_CARD', valueDelta: -1 });
  });

  it('сыграна с лавы — карта возвращается в руку со значением 2, в сбросе её нет', () => {
    const after = battle(buildState({ terrain: 'lava' }));

    expect(heroHand(after).map(entry => [entry.id, entry.value])).toEqual([['ifrit_03', 2]]);
    // вернулась именно сыгранная копия: ключ тот же
    expect(heroHand(after)[0].instanceId).toBe('ifrit_03_1');
    expect(heroDiscard(after)).toEqual([]);
    // удар при этом не отменяется: 3 урона
    expect(after.lastCombat.attackValue).toBe(3);
    expect(player(after, '1').fighters[0].currentHp).toBe(37);
  });

  it('сыграна не с лавы — карта остаётся в сбросе, рука пуста', () => {
    const after = battle(buildState({ terrain: 'ice' }));

    expect(heroHand(after)).toEqual([]);
    expect(heroDiscard(after).map(entry => [entry.id, entry.value])).toEqual([['ifrit_03', 3]]);
    expect(after.lastCombat.attackValue).toBe(3);
    expect(player(after, '1').fighters[0].currentHp).toBe(37);
  });

  it('выгорает по шагу: 3 → 2 → 1, каждый раз возвращаясь в руку', () => {
    let state = battle(buildState({ terrain: 'lava' }));
    expect(heroHand(state).map(entry => entry.value)).toEqual([2]);
    expect(heroDiscard(state)).toEqual([]);

    state = nextBattle(state);
    expect(heroHand(state).map(entry => entry.value)).toEqual([1]);
    expect(heroDiscard(state)).toEqual([]);
    // урон каждого удара — по текущему значению копии
    expect(player(state, '1').fighters[0].currentHp).toBe(40 - 3 - 2);
  });

  it('на нуле карта остаётся в сбросе со значением 0 и больше не объявляется', () => {
    let state = battle(buildState({ terrain: 'lava' }));
    state = nextBattle(state);
    state = battle(state);

    expect(heroHand(state)).toEqual([]);
    expect(heroDiscard(state).map(entry => [entry.id, entry.value])).toEqual([['ifrit_03', 0]]);
    // три удара прошли по 3, 2 и 1 — на нуле карта выгорела
    expect(player(state, '1').fighters[0].currentHp).toBe(40 - 3 - 2 - 1);
    expect(() =>
      runAction(state, { type: 'PICK', kind: 'card', id: 'ifrit_03_1', playerId: '0' }),
    ).toThrow(/карты/);
  });

  it('карта привязана к копии: соседняя копия выгорает отдельно', () => {
    // RECALL_PLAYED_CARD работает с самой сыгранной копией, а не с id карты
    const state = buildState({ terrain: 'lava' });
    const owner = player(state, '0');
    const playedCard = { ...card, instanceId: 'ifrit_03_1', value: 3 };
    const other = { ...card, instanceId: 'ifrit_03_2', value: 3 };
    owner.hand = zone([]);
    owner.discard = zone([playedCard, other]);

    RECALL_PLAYED_CARD(state, { playerId: '0', playedCard, valueDelta: -1 });

    expect(heroHand(state).map(entry => entry.instanceId)).toEqual(['ifrit_03_1']);
    expect(heroHand(state).map(entry => entry.value)).toEqual([2]);
    // вторая копия осталась в сбросе со своей тройкой
    expect(heroDiscard(state).map(entry => [entry.instanceId, entry.value])).toEqual([
      ['ifrit_03_2', 3],
    ]);
  });
});
