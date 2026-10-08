import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import tesla from '../../../server/content/heroes/tesla/index.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_01');

/** Линия 1—2—3: Тесла на 1, Бета на 2. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: 'ice' },
  ],
};

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 3,
    attackRange: 1,
  }),
  ...extra,
});

const slot = (id, name, order, fighters, hand = [], items = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: [] },
  hand: { visibility: [], cards: hand },
  discard: { visibility: [], cards: [] },
  fighters,
  items,
});

const coilsOf = (states = ['inactive', 'inactive']) =>
  states.map((state, index) => ({
    id: `coil_${index + 1}`,
    group: 'coil',
    name: 'Катушка Теслы',
    copies: 2,
    state,
  }));

/** Тесла бьёт Бету картой «Поток энергии»; защитник пасует. */
const state = (coilStates = ['inactive', 'inactive'], teslaHp = 14) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, teslaHp, { attackRange: 3, startHp: 14 })],
        [{ ...card, instanceId: 'tesla_01_1' }],
        coilsOf(coilStates),
      ),
      slot('1', 'Бета', 2, [unit('beta', 2, 13, { attackRange: 3 })]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const battlePause = (start = state()) => {
  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_01_1',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
  return runAction(battle, { type: 'UI_OK', playerId: '1' });
};

const choose = (pause, optionId) =>
  runAction(pause, {
    type: 'PICK',
    kind: 'option',
    id: optionId,
    playerId: '0',
  });

const coilStates = state => player(state, '0').items.map(item => item.state);
const heroHp = state => player(state, '0').fighters[0]?.currentHp;

describe('карта tesla_01 «Поток энергии»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['afterCombat', 'picked', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.text).not.toContain(';');
  });

  it('после боя предлагает два варианта, выбор обязателен', () => {
    const paused = battlePause();

    const ui = runUi(paused, '0');
    // тексты вариантов берутся с самой карты (card.options), а не из правила;
    // `disabled` не выставлен: у вариантов этой карты нет условий доступности
    expect(ui.choices).toEqual([
      { optionId: 'charge', title: 'Активируйте обе катушки.', disabled: false },
      {
        optionId: 'discharge',
        title: 'Деактивируйте обе катушки и подлечите Теслу на 2 здоровья.',
        disabled: false,
      },
    ]);
    // выбор обязателен: пропустить нечем
    expect(ui.controls.ok.visible).toBe(false);
    expect(paused.targeting.kind).toBe('options');
    expect(paused.combat.effects[0].status).toBe('waiting');
    // отметка не из списка отклоняется
    expect(() => choose(paused, 'burn')).toThrow(/не среди кандидатов/);
  });

  it('вариант «активировать обе» заряжает обе катушки', () => {
    const paused = battlePause(state(['inactive', 'inactive']));

    const after = choose(paused, 'charge');

    expect(coilStates(after)).toEqual(['active', 'active']);
    expect(heroHp(after)).toBe(14);
    expect(after.combat).toBeNull();
    expect(after.targeting).toBeNull();
  });

  it('вариант «деактивировать обе» разряжает катушки и лечит Теслу на 2', () => {
    const paused = battlePause(state(['active', 'active'], 10));

    const after = choose(paused, 'discharge');

    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(heroHp(after)).toBe(12);
    expect(after.combat).toBeNull();
  });

  it('лечение не поднимает здоровье выше стартового', () => {
    const paused = battlePause(state(['active', 'active'], 14));

    const after = choose(paused, 'discharge');

    expect(heroHp(after)).toBe(14);
  });

  it('если активировать нечего, свойство выполняется частично: катушки остаются активными', () => {
    const paused = battlePause(state(['active', 'active']));

    // вариант разрешён: выбор зафиксирован, переворачивать нечего
    const after = choose(paused, 'charge');

    expect(coilStates(after)).toEqual(['active', 'active']);
    expect(heroHp(after)).toBe(14);
    expect(after.combat).toBeNull();
  });

  it('при полном здоровье второй вариант разрешён: катушки разряжаются, лечение сгорает', () => {
    const paused = battlePause(state(['active', 'active'], 14));

    const after = choose(paused, 'discharge');

    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(heroHp(after)).toBe(14);
  });

  it('при разряженных катушках второй вариант всё равно лечит: выполняем, что можем', () => {
    const paused = battlePause(state(['inactive', 'inactive'], 10));

    const after = choose(paused, 'discharge');

    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(heroHp(after)).toBe(12);
    expect(after.combat).toBeNull();
  });

  it('способность Теслы и её карта работают вместе: катушки те же', () => {
    expect(tesla.skill.rules.some(rule => rule.moment === 'gameStart')).toBe(true);
    expect(heroHp(battlePause())).toBe(14);
  });
});
