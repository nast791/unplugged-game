import { describe, expect, it } from 'vitest';
import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { advanceCombat } from '#shared/cards/run.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import { buildCombatEffects } from '#shared/helpers/combat.js';
import { endGameIfFinished } from '#shared/helpers/turn.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1], areas: ['#blue'] },
  ],
};

const zone = cards => ({ visibility: [], cards });

const hero = (id, cell, hp) =>
  fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  });

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

const handBonus = (id, bonus) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type: 'effect',
  value: 0,
  bonus,
});

const slot = (id, name, order, fighters, hand = [], deck = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(deck),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

const attackCard = (rules = []) => ({
  id: 'atk',
  instanceId: 'atk_1',
  title: 'Atk',
  type: 'attack',
  value: 2,
  bonus: 1,
  fighter: 'medusa',
  rules,
});

const defenseCard = (rules = []) => ({
  id: 'def',
  instanceId: 'def_1',
  title: 'Def',
  type: 'defense',
  value: 2,
  bonus: 1,
  fighter: 'beta',
  rules,
});

const buildState = ({
  attack = attackCard(),
  defense = null,
  attackerDeck = 0,
  attackerHand = [],
} = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [hero('medusa', 1, 16)],
        [attack, ...attackerHand],
        Array.from({ length: attackerDeck }, (_, index) => deckCard(index)),
      ),
      slot('1', 'Beta', 2, [hero('beta', 2, 13)], defense ? [defense] : []),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const openBattle = state => {
  let next = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'atk_1',
    playerId: '0',
  });
  return runAction(next, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
};

/** Защитник отвечает картой 'def_1'. */
const playDefense = state => {
  const opened = openBattle(state);
  return runAction(opened, {
    type: 'PICK',
    kind: 'card',
    id: 'def_1',
    playerId: '1',
  });
};

/** Защитник пасует: «закончить действие». */
const playPass = state =>
  runAction(openBattle(state), { type: 'UI_OK', playerId: '1' });

const handSize = (state, playerId) => player(state, playerId).hand.cards.length;

describe('окна эффектов боя', () => {
  it('числа боя меняются в окне «во время боя», формула считается после обоих эффектов', () => {
    const state = buildState({
      attack: attackCard([
        {
          moment: 'duringCombat',
          then: [
            { action: 'SET_COMBAT', op: 'value', side: 'attack', delta: 6 },
          ],
        },
      ]),
      defense: defenseCard([
        {
          moment: 'duringCombat',
          then: [
            { action: 'SET_COMBAT', op: 'value', side: 'defense', delta: 1 },
          ],
        },
      ]),
    });

    const after = playDefense(state);

    // 2 + 6 против 2 + 1: усиление обеих карт попало в формулу
    expect(after.lastCombat.attackValue).toBe(8);
    expect(after.lastCombat.defenseValue).toBe(3);
    expect(after.lastCombat.combatDamage).toBe(5);
    expect(after.lastCombat.winner).toBe('attacker');
    expect(
      player(after, '1').fighters.find(entry => entry.id === 'beta').currentHp,
    ).toBe(8);
  });

  it('окно «немедленно» идёт раньше «во время боя», а эффект карты доигрывается после гибели бойца', () => {
    const state = buildState({
      attack: attackCard([
        {
          moment: 'duringCombat',
          then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
        },
      ]),
      defense: defenseCard([
        {
          moment: 'immediately',
          then: [
            { action: 'SET_HEALTH', fighterIds: ['medusa'], delta: -99 },
          ],
        },
      ]),
      attackerDeck: 2,
    });

    const after = playDefense(state);

    // боец атакующего погиб в окне «немедленно», которое разыгрывает защитник первым…
    expect(player(after, '0').fighters).toHaveLength(0);
    // …но эффект карты атакующего всё равно сработал: добор доигран до конца действия
    expect(handSize(after, '0')).toBe(1);
    expect(after.combat).toBeNull();
    expect(after.hook).toBe(PHASES.gameEnd);
    expect(after.winner).toBe('1');
  });

  it('числа боя меняет только участник и только у вскрытого, но не посчитанного боя', () => {
    const state = buildState();
    const opened = openBattle(state);
    expect(opened.combat.stage).toBe('defense');

    // защита ещё не отвечена: числа менять нельзя
    expect(() =>
      SET_COMBAT(opened, {
        op: 'value',
        side: 'attack',
        delta: 1,
        playerId: '0',
      }),
    ).toThrow(/reveal/);

    // защитник пасует — карты вскрыты, окна эффектов открыты
    const revealed = SET_COMBAT(opened, {
      op: 'defense',
      playerId: '1',
      cardId: null,
    });
    expect(revealed.combat.stage).toBe('reveal');

    const boosted = SET_COMBAT(revealed, {
      op: 'value',
      side: 'attack',
      delta: 3,
      playerId: '0',
    });
    expect(boosted.combat.attackValue).toBe(5);

    expect(() =>
      SET_COMBAT(boosted, {
        op: 'value',
        side: 'attack',
        delta: 1,
        playerId: '2',
      }),
    ).toThrow(/участник/);
    expect(() =>
      SET_COMBAT(boosted, {
        op: 'value',
        side: 'defense',
        delta: -99,
        playerId: '1',
      }),
    ).toThrow(/меньше 0/);
    expect(() =>
      SET_COMBAT(boosted, {
        op: 'value',
        side: 'attack',
        delta: 0,
        playerId: '0',
      }),
    ).toThrow(/delta/);

    // бой посчитан и закрыт: числа боя больше не существуют
    const resolving = SET_COMBAT(boosted, { op: 'reveal' });
    const resolved = SET_COMBAT(resolving, { op: 'resolve' });
    const closed = SET_COMBAT(resolved, { op: 'close' });
    expect(closed.combat).toBeNull();
    expect(() =>
      SET_COMBAT(closed, { op: 'value', side: 'attack', delta: 1 }),
    ).toThrow(/бой не идёт/);
  });

  it('очередь шагов: по моментам боя и по сторонам, защитник раньше атакующего', () => {
    const attack = attackCard([
      { moment: 'duringCombat', then: [{ action: 'SET_COMBAT', op: 'value', side: 'attack', delta: 1 }] },
      { moment: 'afterCombat', then: [{ action: 'SET_HEALTH', fighterIds: ['beta'], delta: -1 }] },
    ]);
    const defense = defenseCard([
      { moment: 'immediately', then: [{ action: 'SET_HEALTH', fighterIds: ['medusa'], delta: 0 }] },
      { moment: 'afterCombat', then: [{ action: 'SET_HEALTH', fighterIds: ['medusa'], delta: -1 }] },
    ]);
    const state = buildState({ attack, defense });

    const effects = buildCombatEffects({
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackCard: attack,
      defenseCard: defense,
    });

    expect(effects.map(entry => [entry.moment, entry.side, entry.status])).toEqual([
      ['immediately', 'defender', 'pending'],
      ['duringCombat', 'attacker', 'pending'],
      ['afterCombat', 'defender', 'pending'],
      ['afterCombat', 'attacker', 'pending'],
    ]);
    expect(effects.map(entry => entry.order)).toEqual([1, 2, 3, 4]);
    expect(effects[1].cardId).toBe('atk_1');
    expect(effects[0].playerId).toBe('1');

    // защитник пасует: все четыре шага разыграны, бой закрыт
    const after = playPass(state);
    expect(after.combat).toBeNull();
  });

  it('окно без max: карты тратятся по одной, эффект заканчивает сам игрок', () => {
    const windowCard = attackCard([
      {
        moment: 'duringCombat',
        when: [{ fact: 'HAND', params: { bonusMin: 1 }, min: 1, var: 'cards' }],
        then: [
          {
            action: 'SET_COMBAT',
            op: 'choice',
            effect: 'bonus',
            side: 'attack',
            candidates: '$cards',
            optional: true,
          },
        ],
      },
    ]);
    const state = buildState({
      attack: windowCard,
      attackerHand: [handBonus('quiet', 2), handBonus('loud', 3)],
    });

    const paused = playPass(state);
    // предел задаёт правило: без max окно ждёт игрока, пока есть карты
    expect(paused.combat.choice.max).toBeNull();
    expect(paused.combat.choice.candidates).toHaveLength(2);
    const queue = paused.combat.effects;

    const first = runAction(paused, {
      type: 'PICK',
      kind: 'card',
      id: 'quiet_1',
      playerId: '0',
    });

    expect(first.combat.choice.used).toBe(1);
    expect(first.combat.attackValue).toBe(4);
    expect(first.combat.choice.candidates).toEqual([
      { cardId: 'loud_1', bonus: 3 },
    ]);
    expect(runUi(first, '0').controls.ok.label).toBe('Закончить эффект');
    expect(runUi(first, '0').controls.ok.enabled).toBe(true);

    const finished = runAction(first, { type: 'UI_OK', playerId: '0' });

    expect(finished.combat).toBeNull();
    expect(finished.lastCombat.attackValue).toBe(4);
    expect(finished.lastCombat.combatDamage).toBe(4);
    expect(queue[0].status).toBe('applied');
    expect(queue[0].cards).toEqual(['quiet_1']);
  });

  it('шаг эффекта, которому нечего применять, помечается skipped', () => {
    const state = buildState({
      attack: attackCard([
        {
          moment: 'afterCombat',
          when: [{ fact: 'COMBAT', params: { winner: 'defender' } }],
          then: [{ action: 'SET_HEALTH', fighterIds: ['beta'], delta: -5 }],
        },
      ]),
    });

    const opened = openBattle(state);
    const revealed = SET_COMBAT(opened, {
      op: 'defense',
      playerId: '1',
      cardId: null,
    });
    const queue = revealed.combat.effects;
    expect(queue.map(entry => entry.status)).toEqual(['pending']);

    // защитник пасовал: атака 2 против защиты 0 — победил атакующий, условие шага не сошлось
    const after = advanceCombat(revealed);

    expect(queue.map(entry => entry.status)).toEqual(['skipped']);
    expect(after.combat).toBeNull();
    expect(
      player(after, '1').fighters.find(entry => entry.id === 'beta').currentHp,
    ).toBe(11);
  });

  it('победа не объявляется, пока бой не закрыт', () => {
    const state = buildState();
    player(state, '1').fighters = [];
    state.combat = { stage: 'reveal' };

    expect(endGameIfFinished(state).hook).toBe(PHASES.turn);
    expect(state.winner).toBeNull();

    state.combat = null;
    const after = endGameIfFinished(state);
    expect(after.hook).toBe(PHASES.gameEnd);
    expect(after.winner).toBe('0');
  });

  it('если в одном бою погибли оба героя, побеждает активный игрок', () => {
    const state = buildState({
      attack: attackCard([
        {
          moment: 'afterCombat',
          then: [{ action: 'SET_HEALTH', fighterIds: ['beta'], delta: -99 }],
        },
        {
          moment: 'afterCombat',
          then: [{ action: 'SET_HEALTH', fighterIds: ['medusa'], delta: -99 }],
        },
      ]),
    });

    const after = playPass(state);

    expect(player(after, '0').fighters).toHaveLength(0);
    expect(player(after, '1').fighters).toHaveLength(0);
    expect(after.hook).toBe(PHASES.gameEnd);
    // ход был за игроком 0 — ему и победа
    expect(after.winner).toBe('0');
  });
});
