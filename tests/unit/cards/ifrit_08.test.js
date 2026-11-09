import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runLifecycle } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, hand, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_08');

/** Линия 1—2—3—4: Ифрит на 2, Бета на 3. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
  ],
};

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

const filler = {
  id: 'filler',
  instanceId: 'filler_1',
  type: 'attack',
  value: 1,
  bonus: 1,
  fighter: 'ifrit',
};

const slot = (id, name, order, fighters, cards = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(id === '0' ? [filler] : []),
  hand: zone(cards),
  discard: zone([]),
  fighters,
});

const betaAttack = {
  id: 'beta_atk',
  instanceId: 'beta_atk_1',
  type: 'attack',
  value: 6,
  bonus: 1,
  fighter: 'beta',
};

/** Ифрит на 2 держит «Стену огня», Бета на 3 с `betaHp` здоровья. */
const buildState = ({ betaHp = 14, map = lineMap } = {}) =>
  createState({
    phase: PHASES.turn,
    map,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3 })],
        [{ ...card, instanceId: 'ifrit_08_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, betaHp)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Ифрит бьёт «Стеной огня» (4), Бета пасует. */
const openBattle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_08_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

/** Бета бьёт картой `attack`, Ифрит отвечает «Стеной огня» (4). */
const defendBattle = (state, attack) => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: attack.instanceId,
    playerId: '1',
  });
  return runAction(opened, { type: 'PICK', kind: 'card', id: 'ifrit_08_1', playerId: '0' });
};

/** Бета бьёт картой `attack`, Ифрит пасует. */
const passDefense = (state, attack) => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: attack.instanceId,
    playerId: '1',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '0' });
};

const endTurn = state => {
  state.hook = PHASES.turnEnd;
  return runLifecycle(state);
};

const nodeOf = (state, cellId) => state.map.nodes.find(node => String(node.id) === String(cellId));

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_08 «Стена огня»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules).toHaveLength(2);
    for (const rule of card.rules) {
      expect(rule.moment).toBe('afterCombat');
      expect(isMoment(rule.moment)).toBe(true);
    }
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'hybrid',
      value: 4,
      bonus: 2,
      quantity: 2,
      fighter: 'any',
    });
    expect(card.text).toContain('Доберите 1 карту');
    expect(card.text).toContain('до конца вашего хода');
    expect(card.text).toMatch(/меньше 3 стихий/);
    expect(card.rules[0].then[0]).toMatchObject({ action: 'SET_CARDS', op: 'draw', count: 1 });
    expect(card.rules[1].when[0]).toMatchObject({ fact: 'COMBAT', params: { winner: 'self' } });
    expect(card.rules[1].when[1]).toMatchObject({
      fact: 'FIGHTERS',
      params: { fighterIds: ['ifrit'] },
      var: 'hero',
    });
    expect(card.rules[1].then[0]).toMatchObject({
      action: 'SET_CELL_TERRAIN',
      op: 'add',
      cellId: '$hero',
      terrain: 'lava',
    });
  });

  it('после победы в атаке клетка Ифрита получает лаву, стихия клетки остаётся', () => {
    const after = openBattle(buildState());

    expect(after.lastCombat.winner).toBe('attacker');
    expect(nodeOf(after, 2)).toMatchObject({
      terrain: 'ice',
      extraTerrain: ['lava'],
      extraTerrainBy: '0',
    });
    // клетка, на которой стоял противник, не поджигается: огонь у Ифрита под ногами
    expect(nodeOf(after, 3).extraTerrain).toBeUndefined();
    expect(fighterOf(after, '0', 'ifrit').currentPosition).toBe(2);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
  });

  it('победа добирает карту, а сама карта уходит в сброс', () => {
    const after = openBattle(buildState());

    expect(hand(player(after, '0')).map(entry => entry.id)).toEqual(['filler']);
    expect(discard(player(after, '0')).map(entry => entry.id)).toEqual(['ifrit_08']);
  });

  it('окно боя закрывается сразу: свойства не спрашивают игрока', () => {
    const after = openBattle(buildState());

    expect(after.movement ?? null).toBeNull();
    expect(after.combat ?? null).toBeNull();
    expect(after.targeting ?? null).toBeNull();
    expect(after.lastCombat.effects.map(entry => entry.status)).toEqual(['applied', 'applied']);
  });

  it('при поражении лавы нет', () => {
    const state = buildState();
    const attack = betaAttack;
    player(state, '1').hand = zone([attack]);
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };

    const after = passDefense(state, attack);

    expect(after.lastCombat.winner).toBe('attacker');
    expect(nodeOf(after, 2).extraTerrain).toBeUndefined();
    expect(after.movement ?? null).toBeNull();
  });

  it('на клетке уже три стихии — лавы не появляется', () => {
    const fullMap = {
      ...lineMap,
      nodes: lineMap.nodes.map(node =>
        node.id === 2 ? { ...node, terrain: ['ice', 'forest', 'desert'] } : node,
      ),
    };
    const after = openBattle(buildState({ map: fullMap }));

    expect(nodeOf(after, 2).terrain).toEqual(['ice', 'forest', 'desert']);
    expect(nodeOf(after, 2).extraTerrain).toBeUndefined();
  });

  it('играется и в защиту: лава доживает до хода Ифрита и снимается в его конце', () => {
    const state = buildState();
    const lowAttack = { ...betaAttack, id: 'beta_atk_low', instanceId: 'beta_atk_low_1', value: 3 };
    player(state, '1').hand = zone([lowAttack]);
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };

    const after = defendBattle(state, lowAttack);

    // защитник победил — огонь под Ифритом, и он переживает конец чужого хода
    expect(after.lastCombat.winner).toBe('defender');
    expect(nodeOf(after, 2)).toMatchObject({ extraTerrain: ['lava'], extraTerrainBy: '0' });
    expect(after.combat ?? null).toBeNull();
    expect(after.movement ?? null).toBeNull();

    const enemiesTurnOver = endTurn(after);

    expect(nodeOf(enemiesTurnOver, 2).extraTerrain).toEqual(['lava']);

    // ход Ифрита кончился — огонь снят, базовая стихия клетки на месте
    enemiesTurnOver.turn = { ...enemiesTurnOver.turn, playerId: '0' };
    const ownTurnOver = endTurn(enemiesTurnOver);

    expect(nodeOf(ownTurnOver, 2).extraTerrain).toBeUndefined();
    expect(nodeOf(ownTurnOver, 2).terrain).toBe('ice');
  });
});
