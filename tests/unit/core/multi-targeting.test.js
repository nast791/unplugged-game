import { describe, expect, it } from 'vitest';
import { SET_TARGETING } from '#shared/actions/targeting.js';
import { advanceCombat } from '#shared/cards/run.js';
import { runAction, runFact, runUi } from '#shared/publicApi.js';
import { card, createState, fighter, player, PHASES } from '../../fixtures/state.js';

/**
 * Мультивыбор цели («выберите 2 из 3», `docs/reference-heroes.md` §5): окно просит несколько целей,
 * клик добавляет цель к набору, набор применяет общая кнопка. Окно на одну цель при этом не меняется —
 * его отметка по-прежнему скаляр и закрывает окно сама.
 *
 * Карты здесь синтетические: проверяется механизм движка, а не конкретный контент. Линия 1—2—3—4:
 * свой герой на 1, враги на 2, 3 и 4.
 */
const map = {
  id: 'line',
  nodes: [1, 2, 3, 4].map((id, index, list) => ({
    id,
    terrain: 'ice',
    x: index,
    y: 0,
    neighbors: [list[index - 1], list[index + 1]].filter(neighbour => neighbour != null),
  })),
};

const unit = (id, cell, hp) =>
  fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  });

const slot = (id, name, order, fighters, hand = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: [] },
  hand: { visibility: [], cards: hand },
  discard: { visibility: [], cards: [] },
  fighters,
});

/** Эффектная карта «выберите двух вражеских бойцов — каждому 1 урон»; `count` и `required` — параметры окна. */
const twinCard = (count, required, auto = false) => ({
  id: 'test_twin',
  instanceId: 'test_twin_1',
  title: 'Двойной удар',
  type: 'effect',
  value: 0,
  bonus: 1,
  text: 'ЭФФЕКТ: отметьте вражеских бойцов — нанесите каждому 1 урон.',
  rules: [
    {
      moment: 'effect',
      when: [{ fact: 'FIGHTERS', params: { side: 'opponent' }, var: 'targets' }],
      then: [
        {
          action: 'SET_TARGETING',
          op: 'open',
          candidates: '$targets',
          count,
          required,
          auto,
        },
      ],
    },
    {
      moment: 'picked',
      when: [{ fact: 'PICKED', var: 'picked' }],
      then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
    },
  ],
});

/** Врагов `enemies` штук: у трёх кандидатов набор настоящий, у одного выбора нет. */
const state = (card1, enemies = 3) => {
  const units = [unit('beta', 2, 10), unit('gamma', 3, 10), unit('delta', 4, 10)].slice(0, enemies);
  return createState({
    phase: PHASES.turn,
    map,
    players: [slot('0', 'Тесла', 1, [unit('tesla', 1, 14)], [card1]), slot('1', 'Враги', 2, units)],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });
};

const play = start =>
  runAction(start, { type: 'PICK', kind: 'card', id: 'test_twin_1', playerId: '0' });

const pickFighter = (state, fighterId) =>
  runAction(state, { type: 'PICK', kind: 'fighter', id: fighterId, playerId: '0' });

const confirm = state => runAction(state, { type: 'UI_OK', playerId: '0' });

const hp = (state, fighterId) =>
  player(state, '1').fighters.find(entry => entry.id === fighterId)?.currentHp ?? null;

const hps = state => ['beta', 'gamma', 'delta'].map(id => hp(state, id));

describe('окно на несколько целей: набор по отметке за клик', () => {
  it('две отметки двумя действиями, правило picked видит обе цели', () => {
    const opened = play(state(twinCard(2, true)));

    expect(opened.targeting).toMatchObject({
      kind: 'fighters',
      count: 2,
      required: true,
      picked: null,
    });
    expect(opened.targeting.complete).toBe(false);
    expect(opened.targeting.candidates.map(entry => entry.fighterId)).toEqual([
      'beta',
      'gamma',
      'delta',
    ]);
    // окно обязательное: кнопки у него нет, пока набор не собран
    expect(runUi(opened, '0').controls.ok).toMatchObject({ visible: false, enabled: false });

    const first = pickFighter(opened, 'beta');
    expect(first.targeting).toMatchObject({ picked: ['beta'], complete: false });
    // клик только отмечает: урон наносит общая кнопка, а внутри окна факт PICKED показывает отметки
    expect(hps(first)).toEqual([10, 10, 10]);
    expect(runFact(first, 'PICKED', {}).value).toEqual(['beta']);
    expect(runFact(first, 'PICKED', { min: 2 }).ok).toBe(false);
    expect(runUi(first, '0').controls.ok).toMatchObject({ visible: false, enabled: false });

    const second = pickFighter(first, 'gamma');
    expect(second.targeting).toMatchObject({ picked: ['beta', 'gamma'], complete: true });
    expect(hps(second)).toEqual([10, 10, 10]);
    expect(runFact(second, 'PICKED', { min: 2 }).value).toEqual(['beta', 'gamma']);
    expect(runUi(second, '0').controls.ok).toMatchObject({ visible: true, enabled: true });

    const done = confirm(second);
    expect(done.targeting ?? null).toBeNull();
    expect(done.effect ?? null).toBeNull();
    // правило получило обе отметки: `fighterIds: '$picked'` — список, урон по обоим
    expect(hps(done)).toEqual([9, 9, 10]);
  });

  it('дубль, чужой кандидат и перебор отклоняются', () => {
    const opened = play(state(twinCard(2, true)));

    expect(() => pickFighter(opened, 'tesla')).toThrow(/не среди кандидатов/);
    expect(() => pickFighter(opened, 'beta')).not.toThrow();

    const marked = pickFighter(opened, 'beta');
    expect(() => pickFighter(marked, 'beta')).toThrow(/уже отмечен/);

    const full = pickFighter(marked, 'gamma');
    expect(() => pickFighter(full, 'delta')).toThrow(/уже отмечено 2 цели/);
    // и подтверждение закрывает окно целиком
    expect(confirm(full).targeting ?? null).toBeNull();
  });

  it('окно на две клетки: набор собирается так же, и его список отдаёт факт PICKED', () => {
    const opened = SET_TARGETING(createState(), {
      op: 'open',
      playerId: '0',
      kind: 'cells',
      candidates: ['9', '10', '11'],
      count: 2,
      required: true,
    });

    const one = SET_TARGETING(opened, { op: 'pick', playerId: '0', cellId: '9' });
    expect(one.targeting).toMatchObject({ picked: ['9'], complete: false });

    const two = SET_TARGETING(one, { op: 'pick', playerId: '0', cellId: '11' });
    expect(two.targeting).toMatchObject({ picked: ['9', '11'], complete: true });
    expect(runFact(two, 'PICKED', { min: 2 }).value).toEqual(['9', '11']);
    // `cellId: '$picked'` у действий, которые ставят одного бойца, берёт первую отметку — как и раньше
    expect(two.targeting.picked[0]).toBe('9');
  });

  it('недоступный кандидат в окне не отмечается, но само окно открывается', () => {
    const state1 = SET_TARGETING(createState(), {
      op: 'open',
      playerId: '0',
      candidates: [
        { fighterId: 'beta' },
        { fighterId: 'gamma' },
        { fighterId: 'delta', disabled: true },
      ],
      count: 2,
    });
    expect(state1.targeting.candidates).toHaveLength(3);

    expect(() => SET_TARGETING(state1, { op: 'pick', playerId: '0', fighterId: 'delta' })).toThrow(
      /сейчас недоступен/,
    );
    expect(() =>
      SET_TARGETING(state1, { op: 'pick', playerId: '0', fighterId: 'beta' }),
    ).not.toThrow();
  });

  it('необязательное окно закрывается одной отметкой: правило видит только её', () => {
    const opened = play(state(twinCard(2, false)));

    expect(opened.targeting.required).toBe(false);
    // от необязательного окна можно отказаться, ничего не отметив
    expect(runUi(opened, '0').controls.ok).toMatchObject({ visible: true, enabled: true });

    const marked = pickFighter(opened, 'beta');
    expect(marked.targeting).toMatchObject({ picked: ['beta'], complete: false });
    expect(runUi(marked, '0').controls.ok).toMatchObject({ visible: true, enabled: true });

    const done = confirm(marked);
    expect(done.targeting ?? null).toBeNull();
    expect(done.effect ?? null).toBeNull();
    // цель одна, хотя окно просило две: правило получило то, что успели отметить
    expect(hps(done)).toEqual([9, 10, 10]);
  });

  it('необязательное окно закрывается и без отметок: правило не срабатывает вовсе', () => {
    const opened = play(state(twinCard(2, false)));
    const done = confirm(opened);

    expect(done.targeting ?? null).toBeNull();
    expect(done.effect ?? null).toBeNull();
    expect(hps(done)).toEqual([10, 10, 10]);
  });

  it('обязательное окно до набора цели не закрывается', () => {
    const opened = play(state(twinCard(2, true)));
    const marked = pickFighter(opened, 'beta');

    expect(() => confirm(marked)).toThrow(/полным набором целей/);
    expect(marked.targeting ?? null).not.toBeNull();
  });
});

describe('окно на одну цель: поведение прежнее', () => {
  it('отметка скаляр и закрывает окно сама', () => {
    const opened = play(state(twinCard(1, true)));

    expect(opened.targeting.count).toBe(1);
    expect('complete' in opened.targeting).toBe(false);
    // до клика отметок нет — окно только показывает кандидатов
    expect(runFact(opened, 'PICKED', {}, { playerId: '0' }).value).toEqual([]);

    const picked = pickFighter(opened, 'gamma');
    // одно действие — и правило применено, окна больше нет
    expect(picked.targeting ?? null).toBeNull();
    expect(picked.effect ?? null).toBeNull();
    expect(hps(picked)).toEqual([10, 9, 10]);
  });

  it('окно на клетки с одной отметкой: picked — строка, а не список', () => {
    const state1 = SET_TARGETING(createState(), {
      op: 'open',
      playerId: '0',
      kind: 'cells',
      candidates: ['9', '10'],
      count: 1,
    });
    const picked = SET_TARGETING(state1, { op: 'pick', playerId: '0', cellId: '10' });

    expect(picked.targeting.picked).toBe('10');
    expect(runFact(picked, 'PICKED', {}).value).toEqual(['10']);
  });
});

describe('окно без выбора (auto: true)', () => {
  it('единственный кандидат: движок отмечает его сам, окна игрок не видит', () => {
    const played = play(state(twinCard(1, true, true), 1));

    expect(played.targeting ?? null).toBeNull();
    expect(played.effect ?? null).toBeNull();
    expect(hps(played)).toEqual([9, null, null]);
  });

  it('кандидатов ровно столько, сколько просит окно на несколько целей: движок собирает набор сам', () => {
    const played = play(state(twinCard(2, true, true), 2));

    expect(played.targeting ?? null).toBeNull();
    expect(played.effect ?? null).toBeNull();
    expect(hps(played)).toEqual([9, 9, null]);
  });

  it('кандидатов больше, чем просит окно: выбор есть, окно ждёт игрока', () => {
    const played = play(state(twinCard(2, true, true), 3));

    expect(played.targeting.kind).toBe('fighters');
    expect(played.targeting.complete).toBe(false);
    expect(hps(played)).toEqual([10, 10, 10]);
  });
});

/**
 * Окно, открытое картой боя: подсветку и клик ведёт фаза defense (`cardWindowOf` → `answerTargeting`),
 * правила picked разыгрывает общая кнопка. Бой стоит на паузе между кликами — очередь ждёт шаг.
 */
describe('окно на несколько целей, открытое картой боя', () => {
  const combatCard = {
    id: 'test_twin',
    instanceId: 'test_twin_1',
    title: 'Двойной удар',
    type: 'attack',
    value: 1,
    bonus: 1,
    fighter: 'tesla',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { side: 'opponent' }, var: 'foes' }],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$foes',
            count: 2,
            required: true,
            source: 'test_twin_1',
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
      },
    ],
  };

  const buildCombat = () => {
    const built = state({ ...combatCard }, 2);
    player(built, '0').hand = { visibility: [], cards: [] };
    player(built, '0').fighters[0].id = 'tesla';
    built.combat = {
      stage: 'reveal',
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'tesla',
      targetFighterId: 'beta',
      attackCard: combatCard,
      defenseCard: null,
      attackValue: 1,
      defenseValue: 0,
      defenseRequired: false,
      defenseReplaced: false,
      effects: [
        {
          order: 1,
          moment: 'duringCombat',
          side: 'attacker',
          cardId: 'test_twin_1',
          playerId: '0',
          status: 'pending',
        },
      ],
    };
    return built;
  };

  it('два клика по подсвеченным бойцам и подтверждение: шаг очереди применён, бой доигран', () => {
    const opened = advanceCombat(buildCombat());

    expect(opened.targeting).toMatchObject({ kind: 'fighters', count: 2, required: true });
    expect(opened.targeting.candidates.map(entry => entry.fighterId)).toEqual(['beta', 'gamma']);
    expect(opened.combat.effects[0].status).toBe('waiting');
    // подсветку и клик ведёт фаза защиты: кандидаты окна — это её подсвеченные бойцы
    const ui = runUi(opened, '0');
    expect(ui.phase).toBe('defense');
    expect(ui.highlightedFighterIds).toEqual(['beta', 'gamma']);
    expect(ui.controls.ok).toMatchObject({ visible: false, enabled: false });

    const first = pickFighter(opened, 'beta');
    expect(first.targeting).toMatchObject({ picked: ['beta'], complete: false });
    expect(first.combat.effects[0].status).toBe('waiting');
    expect(hps(first)).toEqual([10, 10, null]);

    const second = pickFighter(first, 'gamma');
    expect(second.targeting).toMatchObject({ picked: ['beta', 'gamma'], complete: true });
    expect(runUi(second, '0').controls.ok).toMatchObject({ visible: true, enabled: true });

    const done = confirm(second);
    // свойство сработало по обеим отметкам, шаг очереди закрыт, бой доигран до конца
    expect(done.targeting ?? null).toBeNull();
    expect(done.combat ?? null).toBeNull();
    // урон свойства по обоим + урон самого боя по цели (attackValue 1 против защиты 0)
    expect(hps(done)).toEqual([8, 9, null]);
  });

  it('обязательное окно боя до набора не подтверждается', () => {
    const opened = advanceCombat(buildCombat());
    const marked = pickFighter(opened, 'beta');

    expect(() => confirm(marked)).toThrow(/полным набором целей/);
    expect(marked.combat.effects[0].status).toBe('waiting');
  });
});
