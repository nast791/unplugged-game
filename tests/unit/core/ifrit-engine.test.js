import { describe, expect, it } from 'vitest';
import { RECALL_PLAYED_CARD } from '#shared/actions/recall.js';
import { SET_ACTIONS } from '#shared/actions/base.js';
import { SET_COMBAT } from '#shared/actions/combat.js';
import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { runFact } from '#shared/facts/run.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { runRules } from '#shared/rules/run.js';
import { ap, card, createState, discard, fighter, hand, player } from '../../fixtures/state.js';

/** Карта в сбросе: сыгранная копия, у которой своё значение (у копий колоды оно общее). */
const played = value => card({ id: 'ifrit_03', title: 'Вечный огонь', type: 'attack', value });

const recallState = (value = 3) => {
  const state = createState();
  const owner = player(state, '0');
  owner.discard = { visibility: [], cards: [played(value)] };
  owner.hand = { visibility: [], cards: [] };
  return state;
};

const factOf = (state, params) => runFact(state, 'AP', params, { playerId: '0' });

describe('движок: номер действия в ходу (факт AP)', () => {
  it('spentMin/spentMax считают потраченные действия, а не остаток', () => {
    const first = createState({
      turn: { index: 1, playerId: '0', actionsTotal: 2, actionsLeft: 1 },
    });
    const second = createState({
      turn: { index: 1, playerId: '0', actionsTotal: 2, actionsLeft: 0 },
    });
    const spent = { min: 0, spentMin: 1, spentMax: 1 };
    const spentTwo = { min: 0, spentMin: 2, spentMax: 2 };

    expect(factOf(first, spent).ok).toBe(true);
    expect(factOf(first, spentTwo).ok).toBe(false);
    expect(factOf(second, spent).ok).toBe(false);
    expect(factOf(second, spentTwo).ok).toBe(true);
  });

  it('выданное умением действие растёт в общем счёте хода, а не ломает нумерацию', () => {
    const state = createState({
      turn: { index: 1, playerId: '0', actionsTotal: 2, actionsLeft: 2 },
    });

    // «Пламя преисподней»: −1 за объявленное действие, +1 от умения — ход стал длиннее
    SET_ACTIONS(state, { playerId: '0', delta: -1 });
    SET_ACTIONS(state, { playerId: '0', delta: 1 });

    expect(state.turn.actionsTotal).toBe(3);
    expect(state.turn.actionsLeft).toBe(2);
    // потрачено одно действие из трёх — это по-прежнему первое действие хода
    expect(factOf(state, { min: 0, spentMin: 1, spentMax: 1 }).ok).toBe(true);
    expect(factOf(state, { min: 0, spentMin: 2, spentMax: 2 }).ok).toBe(false);

    SET_ACTIONS(state, { playerId: '0', delta: -1 });
    SET_ACTIONS(state, { playerId: '0', delta: -1 });
    expect(factOf(state, { min: 0, spentMin: 3, spentMax: 3 }).ok).toBe(true);
  });

  it('min/max по остатку работают как раньше', () => {
    const state = createState({
      turn: { index: 1, playerId: '0', actionsTotal: 2, actionsLeft: 2 },
    });

    expect(factOf(state, { min: 2 }).ok).toBe(true);
    expect(factOf(state, { min: 3 }).ok).toBe(false);
    expect(factOf(state, { min: 0, max: 1 }).ok).toBe(false);
  });
});

describe('движок: роль в битве (факт COMBAT)', () => {
  const combatState = () => {
    const state = createState();
    state.combat = {
      stage: 'reveal',
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'alpha',
      targetFighterId: 'beta',
      attackCard: null,
      defenseCard: null,
    };
    return state;
  };

  it('атакующий видит свою роль, защитник — свою', () => {
    const state = combatState();

    expect(runFact(state, 'COMBAT', { role: 'attacker' }, { playerId: '0' }).ok).toBe(true);
    expect(runFact(state, 'COMBAT', { role: 'defender' }, { playerId: '0' }).ok).toBe(false);
    expect(runFact(state, 'COMBAT', { role: 'defender' }, { playerId: '1' }).ok).toBe(true);
    expect(runFact(state, 'COMBAT', { role: 'attacker' }, { playerId: '1' }).ok).toBe(false);
  });

  it('вне битвы роль не подтверждается', () => {
    expect(runFact(createState(), 'COMBAT', { role: 'attacker' }, { playerId: '0' }).ok).toBe(
      false,
    );
  });

  it('неизвестная роль — ошибка контента, а не тихое «нет»', () => {
    expect(() => runFact(combatState(), 'COMBAT', { role: 'судья' }, { playerId: '0' })).toThrow(
      /role/,
    );
  });
});

describe('движок: возврат сыгранной карты (RECALL_PLAYED_CARD)', () => {
  it('сыгранная копия возвращается в руку со значением на 1 меньше', () => {
    const state = recallState(3);

    RECALL_PLAYED_CARD(state, {
      playerId: '0',
      playedCard: played(3),
      valueDelta: -1,
    });

    expect(discard(player(state, '0'))).toEqual([]);
    expect(hand(player(state, '0')).map(entry => [entry.id, entry.value])).toEqual([
      ['ifrit_03', 2],
    ]);
  });

  it('на нуле карта выгорает и остаётся в сбросе', () => {
    const state = recallState(1);

    RECALL_PLAYED_CARD(state, {
      playerId: '0',
      playedCard: played(1),
      valueDelta: -1,
    });

    expect(hand(player(state, '0'))).toEqual([]);
    expect(discard(player(state, '0')).map(entry => entry.value)).toEqual([0]);
  });

  it('правило без карты и карта не в сбросе — ничего не делают', () => {
    const state = recallState(3);

    RECALL_PLAYED_CARD(state, { playerId: '0', playedCard: null, valueDelta: -1 });
    RECALL_PLAYED_CARD(state, {
      playerId: '0',
      playedCard: card({ id: 'ifrit_01', type: 'attack', value: 5 }),
      valueDelta: -1,
    });

    expect(discard(player(state, '0'))).toHaveLength(1);
    expect(hand(player(state, '0'))).toEqual([]);
  });

  it('в окне «после битвы» карта берётся из боя и закрытие боя её не сбрасывает', () => {
    const state = recallState(3);
    const owner = player(state, '0');
    owner.discard = { visibility: [], cards: [] };
    state.combat = {
      stage: 'close',
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'alpha',
      targetFighterId: 'beta',
      attackCard: played(3),
      defenseCard: null,
    };

    RECALL_PLAYED_CARD(state, { playerId: '0', playedCard: played(3), valueDelta: -1 });

    expect(hand(owner).map(entry => [entry.id, entry.value])).toEqual([['ifrit_03', 2]]);
    expect(state.combat.recalled).toEqual({ attackCard: true });
    expect(state.combat.attackCard.value).toBe(2);

    // закрытие боя: возвращённая карта остаётся в руке и в сброс не попадает
    SET_COMBAT(state, { op: 'close' });

    expect(state.combat).toBeNull();
    expect(discard(owner)).toEqual([]);
    expect(hand(owner).map(entry => entry.value)).toEqual([2]);
  });
});

describe('движок: клетка из окна выбора ($picked — список)', () => {
  it('SET_FIGHTER_CELL берёт первую клетку списка и не превращает её в массив', () => {
    const state = createState();
    const here = fighter({ id: 'alpha', type: 'hero', currentPosition: 8 });

    SET_FIGHTER_CELL(state, { fighterId: here.id, cellId: ['10'] });

    expect(player(state, '0').fighters[0].currentPosition).toBe('10');
    expect(player(state, '0').fighters[0].movedThisTurn).toBe(true);
  });

  it('числовая клетка остаётся числом: id клеток в контенте бывают числовыми', () => {
    const state = createState();

    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 });

    expect(player(state, '0').fighters[0].currentPosition).toBe(9);
  });

  it('действия хода не тратятся на постановку бойца', () => {
    const state = createState({
      turn: { index: 1, playerId: '0', actionsTotal: 2, actionsLeft: 2 },
    });

    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 });

    expect(ap(state)).toBe(2);
  });
});

describe('движок: независимость правил одного момента', () => {
  /** Состояние с двумя духами: взаимоисключающие ветки смотрят «первый жив, второй жив». */
  const state = () => {
    const next = createState();
    const owner = player(next, '0');
    owner.fighters = [
      fighter({ id: 'ifrit', type: 'hero', currentPosition: 8, currentHp: 14 }),
      fighter({ id: 'ash_1', type: 'assistant', group: 'ash', currentPosition: 9, currentHp: 1 }),
      fighter({ id: 'ash_2', type: 'assistant', group: 'ash', currentPosition: 10, currentHp: 1 }),
    ];
    owner.lost = [];
    next.turn = { ...next.turn, playerId: '0', actionsTotal: 2, actionsLeft: 1 };
    return next;
  };

  const rules = [
    {
      moment: 'effect',
      when: [{ fact: 'FIGHTERS', params: { fighterIds: ['ash_1'] }, min: 1 }],
      then: [{ action: 'SET_HEALTH', fighterId: 'ash_1', delta: -1 }],
    },
    {
      moment: 'effect',
      when: [
        { fact: 'FIGHTERS', params: { fighterIds: ['ash_1'] }, max: 0 },
        { fact: 'FIGHTERS', params: { fighterIds: ['ash_2'] }, min: 1 },
      ],
      then: [{ action: 'SET_HEALTH', fighterId: 'ash_2', delta: -1 }],
    },
  ];

  it('вторая ветка не срабатывает от того, что первая убила духа: условия читаются по входу', () => {
    const after = runRules(state(), rules, 'effect', { playerId: '0' });

    expect((player(after, '0').lost ?? []).map(entry => entry.id)).toEqual(['ash_1']);
    expect(player(after, '0').fighters.map(entry => entry.id)).toContain('ash_2');
  });

  it('когда первый дух уже убит, работает вторая ветка', () => {
    const start = state();
    start.players[0].fighters = start.players[0].fighters.filter(entry => entry.id !== 'ash_1');

    const after = runRules(start, rules, 'effect', { playerId: '0' });

    expect((player(after, '0').lost ?? []).map(entry => entry.id)).toEqual(['ash_2']);
  });
});

describe('движок: окно цели, открытое картой боя', () => {
  /** Правила пробы: карта бьёт сама и в окне «немедленно» даёт выбрать, кого добить. */
  const probeRules = required => [
    {
      moment: 'immediately',
      when: [{ fact: 'FIGHTERS', params: { side: 'opponent', min: 1 }, var: 'foes' }],
      then: [
        {
          action: 'SET_TARGETING',
          op: 'open',
          candidates: '$foes',
          count: 1,
          required,
        },
      ],
    },
    {
      moment: 'picked',
      when: [{ fact: 'PICKED', var: 'picked' }],
      then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
    },
  ];

  const probe = {
    id: 'probe',
    title: 'Проба',
    type: 'attack',
    value: 2,
    bonus: 1,
    fighter: 'ifrit',
    text: '',
    rules: probeRules(true),
  };

  const battleState = (card = probe) => {
    const state = createState();
    const owner = player(state, '0');
    owner.fighters = [
      fighter({ id: 'ifrit', type: 'hero', currentPosition: 8, currentHp: 14, attackRange: 3 }),
    ];
    owner.hand = { visibility: [], cards: [{ ...card, instanceId: 'probe_1' }] };
    const foe = player(state, '1');
    foe.fighters = [
      fighter({ id: 'beta', type: 'hero', currentPosition: 9, currentHp: 13 }),
      fighter({ id: 'gamma', type: 'hero', currentPosition: 10, currentHp: 10 }),
    ];
    // хук turn уже «входил»: иначе enter снимает бой, открытый тем же кликом
    state._enteredHooks = { gameStart: true, turn: true };
    state.turn = { ...state.turn, playerId: '0', actionsTotal: 2, actionsLeft: 2 };
    return state;
  };

  /** Объявили атаку «пробой», цель — beta, защитник пасует: бой доходит до окна «немедленно». */
  const toWindow = (card = probe) => {
    const opened = runAction(battleState(card), {
      type: 'PICK',
      kind: 'card',
      id: 'probe_1',
      playerId: '0',
    });
    const targeted = runAction(opened, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });
    return runAction(targeted, { type: 'UI_OK', playerId: '1' });
  };

  it('в бою открывается окно бойцов, клиент видит подсветку и pickFighters', () => {
    const state = toWindow();

    expect(state.targeting).toMatchObject({ kind: 'fighters', required: true, playerId: '0' });
    expect(state.targeting.candidates.map(entry => entry.fighterId)).toEqual(['beta', 'gamma']);

    const ui = runUi(state, '0');
    expect(ui.pickFighters).toBe(true);
    expect(ui.highlightedFighterIds).toEqual(['beta', 'gamma']);
    expect(ui.hint).toBe('Выберите цель среди подсвеченных бойцов');
  });

  it('клик по бойцу в бою доигрывает picked: урон получает именно выбранный', () => {
    const after = runAction(toWindow(), {
      type: 'PICK',
      kind: 'fighter',
      id: 'gamma',
      playerId: '0',
    });

    const foe = player(after, '1');
    expect(after.targeting).toBeNull();
    expect(after.combat).toBeNull();
    // боевой урон 2 идёт объявленной цели (beta), а свойство добивает выбранного (gamma)
    expect(foe.fighters.find(entry => entry.id === 'gamma').currentHp).toBe(9);
    expect(foe.fighters.find(entry => entry.id === 'beta').currentHp).toBe(11);
  });

  it('клик не по бойцу окна — ошибка, а не молчание', () => {
    expect(() =>
      runAction(toWindow(), { type: 'PICK', kind: 'card', id: 'probe_1', playerId: '0' }),
    ).toThrow(/ждут "fighter"/);
  });

  it('обязательное окно общей кнопкой не закрывается, необязательное — закрывается', () => {
    // кнопка завершения одна на все окна: у обязательного её нет, пока цель не отмечена
    const required = toWindow();
    expect(runUi(required, '0').controls.ok).toMatchObject({
      visible: false,
      enabled: false,
      label: null,
    });
    expect(() => runAction(required, { type: 'UI_OK', playerId: '0' })).toThrow(
      /закрывается только выбором цели/,
    );

    const optional = { ...probe, rules: probeRules(false) };
    const window = toWindow(optional);
    expect(runUi(window, '0').controls.ok).toMatchObject({
      visible: true,
      enabled: true,
      label: 'Закончить эффект',
    });
    // подсказка окна называет оба пути, а не спрашивает «выбрать или нет»
    expect(runUi(window, '0').hint).toBe(
      'Выберите подсвеченного бойца — или закончите эффект без выбора',
    );

    // отказ: окно закрывается, шаг очереди помечается declined, бой доигрывается без свойства
    const declined = runAction(window, { type: 'UI_OK', playerId: '0' });
    const foe = player(declined, '1');
    expect(declined.targeting).toBeNull();
    expect(declined.combat).toBeNull();
    expect(declined.lastCombat.attackValue).toBe(2);
    expect(foe.fighters.find(entry => entry.id === 'beta').currentHp).toBe(11);
    expect(foe.fighters.find(entry => entry.id === 'gamma').currentHp).toBe(10);
  });
});
