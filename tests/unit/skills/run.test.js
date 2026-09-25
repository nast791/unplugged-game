import { describe, expect, it } from 'vitest';
import { isMoment, moments } from '#shared/constants/moments.js';
import { runSkillMoment } from '#shared/skills/run.js';
import { ap, createState, fighter, hand, PHASES, player } from '../../fixtures/state.js';

/** Состояние с синтетической способностью игрока 0 (правила задаём прямо в тесте). */
const stateWith = (rules, patch = {}) => {
  const state = createState({ phase: PHASES.turn, ...patch });
  player(state, '0').skill = { id: 'test_skill', type: 'skill', rules };
  return state;
};

/** Окно выбора уже открыто, цель отмечена — так выглядит состояние в момент picked. */
const withPickedTarget = (state, fighterId = 'beta') => {
  state.targeting = {
    playerId: '0',
    source: 'test_skill',
    required: false,
    count: 1,
    candidates: [{ fighterId, playerId: '1', name: fighterId, position: 10 }],
    picked: fighterId,
  };
  return state;
};

describe('skills: runSkillMoment', () => {
  it('прогоняет правила только своего момента; переменные берутся из var условий', () => {
    const state = stateWith([
      {
        moment: 'turnStart',
        when: [
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent' },
            min: 1,
            var: 'targets',
          },
        ],
        then: [{ action: 'SET_TARGETING', op: 'open', candidates: '$targets' }],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -3 }],
      },
    ]);

    const started = runSkillMoment(state, '0', 'turnStart');
    expect(started.targeting.source).toBe('test_skill');
    expect(started.targeting.playerId).toBe('0');
    expect(started.targeting.candidates.map(entry => entry.fighterId)).toEqual([
      'beta',
    ]);

    const picked = runSkillMoment(withPickedTarget(started), '0', 'picked');
    expect(player(picked, '1').fighters[0].currentHp).toBe(10);
    expect(player(picked, '0').fighters[0].currentHp).toBe(15);
  });

  it('без отметки цели правило момента picked не срабатывает', () => {
    const state = stateWith([
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -3 }],
      },
    ]);

    expect(player(runSkillMoment(state, '0', 'picked'), '1').fighters[0].currentHp).toBe(
      13,
    );
  });

  it('правила независимы: срабатывают все подходящие (развилки — взаимно исключающими условиями)', () => {
    const rules = [
      {
        moment: 'picked',
        when: [{ fact: 'AP', params: { min: 2 } }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
      {
        moment: 'picked',
        when: [{ fact: 'AP', params: { min: 3 } }],
        then: [{ action: 'SET_ACTIONS', delta: 5 }],
      },
    ];

    const withTwo = runSkillMoment(stateWith(rules, { actionsLeft: 2 }), '0', 'picked');
    expect(hand(player(withTwo, '0'))).toHaveLength(4);
    expect(ap(withTwo)).toBe(2);

    const withThree = runSkillMoment(
      stateWith(rules, { actionsLeft: 3 }),
      '0',
      'picked',
    );
    expect(hand(player(withThree, '0'))).toHaveLength(4);
    expect(ap(withThree)).toBe(8);
  });

  it('any: срабатывает первая подошедшая ветка, остальные не выполняются', () => {
    const state = stateWith([
      {
        moment: 'picked',
        any: [
          [{ fact: 'AP', params: { min: 1 }, var: 'bonus' }],
          [{ fact: 'HAND', params: { min: 1 }, var: 'bonus' }],
        ],
        then: [{ action: 'SET_ACTIONS', delta: '$bonus' }],
      },
    ]);

    // Если бы выполнилась вторая ветка, $bonus был бы списком карт и SET_ACTIONS упал бы на delta.
    expect(ap(runSkillMoment(state, '0', 'picked'))).toBe(4);
  });

  it('any: переменные подошедшей ветки видны в then', () => {
    const state = stateWith([
      {
        moment: 'picked',
        any: [
          [{ fact: 'AP', params: { min: 9 } }],
          [
            {
              fact: 'FIGHTERS',
              params: { side: 'opponent' },
              min: 1,
              var: 'targets',
            },
          ],
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$targets',
            count: 1,
          },
        ],
      },
    ]);

    const next = runSkillMoment(state, '0', 'picked');
    expect(next.targeting.candidates.map(entry => entry.fighterId)).toEqual([
      'beta',
    ]);
  });

  it('any: если ни одна ветка не подошла — правило не срабатывает', () => {
    const state = stateWith([
      {
        moment: 'picked',
        any: [
          [{ fact: 'AP', params: { min: 9 } }],
          [{ fact: 'HAND', params: { type: 'scheme', min: 1 } }],
        ],
        then: [{ action: 'SET_ACTIONS', delta: 5 }],
      },
    ]);

    expect(ap(runSkillMoment(state, '0', 'picked'))).toBe(2);
  });

  it('when и any вместе: нужен и весь when, и хотя бы одна ветка', () => {
    const rules = [
      {
        moment: 'picked',
        when: [{ fact: 'AP', params: { min: 9 } }],
        any: [[{ fact: 'FIGHTERS', params: { side: 'opponent' }, min: 1 }]],
        then: [{ action: 'SET_ACTIONS', delta: 5 }],
      },
    ];

    expect(ap(runSkillMoment(stateWith(rules), '0', 'picked'))).toBe(2);

    const reachable = stateWith([
      {
        moment: 'picked',
        when: [{ fact: 'AP', params: { min: 1 } }],
        any: [[{ fact: 'FIGHTERS', params: { side: 'opponent' }, min: 1 }]],
        then: [{ action: 'SET_ACTIONS', delta: 5 }],
      },
    ]);
    expect(ap(runSkillMoment(reachable, '0', 'picked'))).toBe(7);
  });

  it('без any всё работает как раньше', () => {
    const state = stateWith([
      {
        moment: 'picked',
        when: [{ fact: 'AP', params: { min: 1 } }],
        then: [{ action: 'SET_ACTIONS', delta: 5 }],
      },
    ]);

    expect(ap(runSkillMoment(state, '0', 'picked'))).toBe(7);
  });

  it('чужой момент и правила другого игрока не трогает', () => {
    const state = stateWith([
      {
        moment: 'picked',
        then: [{ action: 'SET_ACTIONS', delta: 5 }],
      },
    ]);

    expect(runSkillMoment(state, '0', 'turnStart')).toBe(state);
    expect(ap(runSkillMoment(state, '1', 'picked'))).toBe(2);
  });

  it('неизвестный момент и неизвестное действие — ошибки', () => {
    expect(() => runSkillMoment(stateWith([]), '0', 'nowhere')).toThrow(
      /неизвестный момент/,
    );

    const broken = stateWith([{ moment: 'picked', then: [{ action: 'NOPE' }] }]);
    expect(() => runSkillMoment(broken, '0', 'picked')).toThrow(/не найдено/);
  });

  it('добивающий урон завершает партию', () => {
    const state = stateWith([
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -9 }],
      },
    ]);
    player(state, '1').fighters[0].currentHp = 5;

    const next = runSkillMoment(withPickedTarget(state), '0', 'picked');

    expect(next.hook).toBe(PHASES.gameEnd);
    expect(next.winner).toBe('0');
  });

  it('объект в player.skill без type: skill — ошибка', () => {
    const state = createState({ phase: PHASES.turn });
    player(state, '0').skill = { id: 'x', rules: [] };

    expect(() => runSkillMoment(state, '0', 'turnStart')).toThrow(/type/);
  });

  it('список моментов — единственный источник имён', () => {
    expect(moments.map(entry => entry.name)).toEqual([
      'turnStart',
      'picked',
      'immediately',
      'duringCombat',
      'afterCombat',
    ]);
    expect(isMoment('turnStart')).toBe(true);
    expect(isMoment('picked')).toBe(true);
    expect(isMoment('immediately')).toBe(true);
    expect(isMoment('duringCombat')).toBe(true);
    expect(isMoment('afterCombat')).toBe(true);
    expect(isMoment('skipped')).toBe(false);
  });
});
