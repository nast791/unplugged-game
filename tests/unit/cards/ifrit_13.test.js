import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_13');

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

/** Та же линия, но области разрезаны: 1—2 лёд, 3—4 лава. Клетка 4 не делит область с Ифритом. */
const splitMap = {
  id: 'split',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'lava' },
    { id: 4, neighbors: [3], terrain: 'lava' },
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
  startHp: extra.startHp ?? hp,
  ...extra,
});

/**
 * Защита противника с условным свойством: «во время битвы: если цель стоит на клетке 3 или дальше,
 * значение карты +1». Нужна для проверки третьего режима — отмены чужих свойств.
 * Текст намеренно без кириллицы: это тестовая карта, её же кладут в тесты на парсинг текстов.
 */
const conditionalDefense = {
  id: 'beta_tricky',
  instanceId: 'beta_tricky_1',
  type: 'defense',
  value: 0,
  bonus: 1,
  fighter: 'beta',
  rules: [
    {
      moment: 'duringCombat',
      when: [{ fact: 'FIGHTERS', params: { fighterIds: ['beta'], terrain: 'ice' }, min: 1 }],
      then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 1 }],
    },
  ],
};

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

/**
 * Ифрит на 2 держит «Счёт ударов»; ход Ифрита. `actionsTotal`/`actionsLeft` — состояние ДО объявления
 * действия: карта спишет одно действие сама (`SET_ACTIONS −1`), а `spent` считается как
 * `actionsTotal − actionsLeft`. Отсюда рабочие наборы:
 *   первое действие — `4/3` или `2/2` (после удара spent 1);
 *   второе — `4/4` (после удара spent 2);
 *   третье — `4/2` (после удара spent 3).
 * `movedThisTurn` — флаг «боец двигался в этом ходу»; `betaHand` — карты защиты Беты;
 * `enemies` — бойцы игрока 1 (по умолчанию только Бета).
 */
const buildState = ({
  actionsTotal = 2,
  actionsLeft = 2,
  movedThisTurn = false,
  betaHand = [],
  enemies = null,
  map = lineMap,
} = {}) =>
  createState({
    phase: PHASES.turn,
    map,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3, startHp: 14, movedThisTurn })],
        [{ ...card, instanceId: 'ifrit_13_1' }],
      ),
      slot('1', 'Бета', 2, enemies ?? [unit('beta', 3, 14)], betaHand),
    ],
    turn: { index: 1, playerId: '0', actionsTotal, actionsLeft, actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Ифрит объявляет атаку «Счётом ударов» (кандидат один). */
const attack = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'ifrit_13_1', playerId: '0' });

/** Клик по подсветке окна «после битвы»: выбранный боец противника получает 1 урон. */
const extraHit = (state, fighterId) =>
  runAction(state, { type: 'PICK', kind: 'fighter', id: fighterId, playerId: '0' });

/** Ифрит бьёт, Бета пасует; дальше может открыться окно «после битвы» (первое действие). */
const battle = state => runAction(attack(state), { type: 'UI_OK', playerId: '1' });

/**
 * То же, но с явным выбором цели боя: когда в радиусе Ифрита несколько врагов, движок
 * останавливается на стадии `target` и ждёт клика (иначе `UI_OK` падает — фаза защиты не наступила).
 */
const battleAndPass = (state, targetFighterId) => {
  let run = attack(state);
  if (run.combat?.stage === 'target') {
    run = runAction(run, { type: 'PICK', kind: 'fighter', id: targetFighterId, playerId: '0' });
  }
  return runAction(run, { type: 'UI_OK', playerId: '1' });
};

/** Полный бой первым действием: цель боя, потом выбор в окне «после битвы». */
const battleAndHit = (state, targetFighterId, hitFighterId) =>
  extraHit(battleAndPass(state, targetFighterId), hitFighterId);

/** Бета бьёт Ифрита на `value`; Ифрит защищается «Счётом ударов». */
const defend = ({ value = 5 } = {}) => {
  const state = buildState({ actionsTotal: 2, actionsLeft: 2 });
  state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };
  player(state, '1').hand = zone([
    {
      id: 'beta_atk',
      instanceId: 'beta_atk_1',
      type: 'attack',
      value,
      bonus: 1,
      fighter: 'beta',
    },
  ]);

  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'beta_atk_1',
    playerId: '1',
  });
  // единственная цель — Ифрит, дальше защита картой
  return runAction(opened, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_13_1',
    playerId: '0',
  });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_13 «Счёт ударов»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual([
      'duringCombat',
      'afterCombat',
      'picked',
      'duringCombat',
      'immediately',
    ]);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'hybrid',
      value: 2,
      bonus: 2,
      quantity: 2,
      fighter: 'ifrit',
    });
    expect(card.rules[0].when[0]).toMatchObject({ fact: 'COMBAT', params: { role: 'defender' } });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_COMBAT',
      delta: -1,
      side: 'opponent',
    });
    // в атаку номер действия читается фактом AP (spentMin/spentMax)
    expect(card.rules[1].when[0]).toMatchObject({
      fact: 'AP',
      params: { min: 0, spentMin: 1, spentMax: 1 },
    });
    // первое действие — не «1 урон цели боя», а окно по врагам В ОБЛАСТИ Ифрита
    expect(card.rules[1].when[2]).toMatchObject({
      fact: 'FIGHTERS',
      params: { side: 'opponent', areaOf: 'ifrit', min: 1 },
      var: 'foes',
    });
    expect(card.rules[1].then[0]).toMatchObject({
      action: 'SET_TARGETING',
      op: 'open',
      candidates: '$foes',
      count: 1,
      required: true,
    });
    // отметку бойца в области обрабатывает отдельное правило `picked`
    expect(card.rules[2].when[0]).toMatchObject({ fact: 'PICKED', var: 'picked' });
    expect(card.rules[2].then[0]).toMatchObject({
      action: 'SET_HEALTH',
      fighterIds: '$picked',
      delta: -1,
    });
    expect(card.rules[3].when[0]).toMatchObject({
      fact: 'AP',
      params: { min: 0, spentMin: 2, spentMax: 2 },
    });
    expect(card.rules[4].when[0]).toMatchObject({
      fact: 'AP',
      params: { min: 0, spentMin: 3, spentMax: 3 },
    });
    expect(card.rules[4].then[0]).toMatchObject({
      action: 'SET_COMBAT',
      op: 'cancelEffects',
      side: 'opponent',
    });
    // текст карты описывает именно выбор бойца в области
    expect(card.text).toContain('выбранному бойцу противника в области Ифрита');
  });

  it('в защиту значение карты противника снижается на 1: 5 → 4', () => {
    const after = defend({ value: 5 });

    expect(after.lastCombat.attackValue).toBe(4);
    expect(after.lastCombat.defenseValue).toBe(2);
    expect(after.lastCombat.winner).toBe('attacker');
    // 5 − 1 − 2 = 2 урона
    expect(after.lastCombat.combatDamage).toBe(2);
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(12);
  });

  it('в защиту карта не двигает своё значение: без среза урона было бы на 1 больше', () => {
    // та же атака, но Ифрит защищается картой без свойства
    const state = buildState({ actionsTotal: 2, actionsLeft: 2 });
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };
    player(state, '1').hand = zone([
      {
        id: 'beta_atk',
        instanceId: 'beta_atk_1',
        type: 'attack',
        value: 5,
        bonus: 1,
        fighter: 'beta',
      },
    ]);
    const plain = {
      id: 'plain_def',
      instanceId: 'plain_def_1',
      type: 'defense',
      value: 2,
      bonus: 1,
      fighter: 'ifrit',
    };
    player(state, '0').hand = zone([plain]);

    const opened = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    const after = runAction(opened, {
      type: 'PICK',
      kind: 'card',
      id: 'plain_def_1',
      playerId: '0',
    });

    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(3);
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(11);
  });

  it('первым действием в атаку: окно по врагам в области Ифрита, 1 урон выбранному', () => {
    // кроме цели боя (Беты на 3) в области Ифрита стоит второй враг на 1
    const state = buildState({
      actionsTotal: 2,
      actionsLeft: 2,
      enemies: [unit('beta', 3, 14), unit('gamma', 1, 14)],
    });

    const opened = battleAndPass(state, 'beta');

    expect(opened.lastCombat.attackValue).toBe(2);
    expect(opened.lastCombat.combatDamage).toBe(2);
    expect(opened.lastCombat.targetFighterId).toBe('beta');
    // окно обязательное, кандидаты — все враги в области
    expect(opened.targeting).toMatchObject({
      playerId: '0',
      kind: 'fighters',
      required: true,
    });
    expect(opened.targeting.candidates.map(entry => entry.fighterId).sort()).toEqual([
      'beta',
      'gamma',
    ]);
    expect(runUi(opened, '0').pickFighters).toBe(true);
    expect(runUi(opened, '0').highlightedFighterIds.sort()).toEqual(['beta', 'gamma']);
    // окно обязательное: завершать нечего, кнопки нет — только выбор подсвеченной цели
    expect(runUi(opened, '0').controls.ok).toMatchObject({
      visible: false,
      enabled: false,
      label: null,
    });
    expect(() => runAction(opened, { type: 'UI_OK', playerId: '0' })).toThrow(
      /закрывается только выбором цели/,
    );

    // выбираем не цель боя: 1 урон уходит именно гамме
    const after = extraHit(opened, 'gamma');

    expect(fighterOf(after, '1', 'beta').currentHp).toBe(12);
    expect(fighterOf(after, '1', 'gamma').currentHp).toBe(13);
    expect(after.targeting ?? null).toBeNull();
    expect(after.combat ?? null).toBeNull();
  });

  it('первым действием можно добить и цель самой битвы: 2 + 1 = 3 урона', () => {
    const after = battleAndHit(buildState({ actionsTotal: 2, actionsLeft: 2 }), 'beta', 'beta');

    expect(fighterOf(after, '1', 'beta').currentHp).toBe(11);
  });

  it('первым действием врага в области нет — окна нет и урона нет', () => {
    // гамма стоит на 4, она в лавовой области: с Ифритом (лёд 1—2) область не общая
    const opened = battleAndPass(
      buildState({
        actionsTotal: 2,
        actionsLeft: 2,
        map: splitMap,
        enemies: [unit('beta', 3, 14), unit('gamma', 4, 14)],
      }),
      'beta',
    );

    expect(opened.targeting ?? null).toBeNull();
    expect(fighterOf(opened, '1', 'beta').currentHp).toBe(12);
    expect(fighterOf(opened, '1', 'gamma').currentHp).toBe(14);
  });

  it('вторым действием без движения бонуса нет: карта держит своё значение 2', () => {
    const after = battle(buildState({ actionsTotal: 4, actionsLeft: 3, movedThisTurn: false }));

    expect(after.lastCombat.attackValue).toBe(2);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(12);
  });

  it('вторым действием с движением — +2, атака 4', () => {
    const after = battle(buildState({ actionsTotal: 4, actionsLeft: 3, movedThisTurn: true }));

    expect(after.lastCombat.attackValue).toBe(4);
    expect(after.lastCombat.combatDamage).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
  });

  it('первым действием в атаку свойство «после битвы» не путается со вторым', () => {
    // тот же бой, но действие первое: +2 за движение не применяется, зато есть окно после битвы
    const after = battleAndHit(
      buildState({ actionsTotal: 2, actionsLeft: 2, movedThisTurn: true }),
      'beta',
      'beta',
    );

    expect(after.lastCombat.attackValue).toBe(2);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(11);
  });

  it('третьим действием в атаку свойства карты противника отменяются', () => {
    // условная защита Беты дала бы +1 и снизила урон; третьим действием свойство отменено
    const state = buildState({
      actionsTotal: 4,
      actionsLeft: 2,
      betaHand: [conditionalDefense],
    });

    const opened = attack(state);
    const after = runAction(opened, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_tricky_1',
      playerId: '1',
    });

    expect(after.lastCombat.attackValue).toBe(2);
    expect(after.lastCombat.defenseValue).toBe(0);
    expect(after.lastCombat.combatDamage).toBe(2);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(12);
    // бой не завис: очередь дошла до закрытия
    expect(after.combat ?? null).toBeNull();
    expect(discard(player(after, '0')).map(entry => entry.id)).toEqual(['ifrit_13']);
  });

  it('без третьего действия та же условная защита срабатывает: урона меньше', () => {
    const state = buildState({
      actionsTotal: 4,
      actionsLeft: 3,
      betaHand: [conditionalDefense],
    });

    const opened = attack(state);
    const after = runAction(opened, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_tricky_1',
      playerId: '1',
    });

    expect(after.lastCombat.defenseValue).toBe(1);
    expect(after.lastCombat.combatDamage).toBe(1);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(13);
  });
});
