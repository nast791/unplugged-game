import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_14');

/** Линия 1—2—…—8: Ифрит на 4, радиус 2 накрывает 2, 3, 5 и 6. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'lava' },
    { id: 2, neighbors: [1, 3], terrain: 'lava' },
    { id: 3, neighbors: [2, 4], terrain: 'lava' },
    { id: 4, neighbors: [3, 5], terrain: 'lava' },
    { id: 5, neighbors: [4, 6], terrain: 'lava' },
    { id: 6, neighbors: [5, 7], terrain: 'lava' },
    { id: 7, neighbors: [6, 8], terrain: 'lava' },
    { id: 8, neighbors: [7], terrain: 'lava' },
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

const spirit = (cell = 5, hp = 3) =>
  unit('ash_1', cell, hp, { name: 'Пепельный дух', type: 'assistant', group: 'ash' });

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
 * Ифрит на 4. Свои: дух на 5 (один шаг). Чужие: Бета на 2 (два шага), Гамма на 7 (три шага).
 * Разное здоровье — чтобы видеть, кому досталось.
 */
const buildState = ({ ashHp = 3, foeCell = 2, farCell = 7, spiritNear = true } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 4, 14, { attackRange: 2 }), ...(spiritNear ? [spirit(5, ashHp)] : [])],
        [{ ...card, instanceId: 'ifrit_14_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', foeCell, 13), unit('gamma', farCell, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'ifrit_14_1', playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_14 «Сжечь всех дотла»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect']);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'effect',
      value: null,
      bonus: 2,
      quantity: 1,
      fighter: 'ifrit',
    });
    expect(card.rules[0].when[1]).toMatchObject({
      fact: 'FIGHTERS',
      params: { withinOf: 'ifrit', within: 2 },
      min: 1,
      var: 'victims',
    });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_HEALTH',
      fighterIds: '$victims',
      delta: -2,
    });
  });

  it('бьёт всех в радиусе 2 — и своих тоже; боец в трёх шагах цел', () => {
    const played = play(buildState());

    // радиус от клетки 4: 2 и 3 в одну сторону, 5 и 6 в другую
    expect(fighterOf(played, '1', 'beta').currentHp).toBe(11);
    expect(fighterOf(played, '0', 'ash_1').currentHp).toBe(1);
    // Гамма на 7 — три шага: вне радиуса
    expect(fighterOf(played, '1', 'gamma').currentHp).toBe(13);
    // сам Ифрит своей же картой не бьётся
    expect(fighterOf(played, '0', 'ifrit').currentHp).toBe(14);
    // карта эффекта ушла в сброс, действие потрачено
    expect(played.turn.actionsLeft).toBe(1);
    expect(discard(player(played, '0')).map(entry => entry.id)).toEqual(['ifrit_14']);
  });

  it('свой дух с 2 здоровья погибает и уходит в lost', () => {
    const played = play(buildState({ ashHp: 2 }));

    expect(fighterOf(played, '0', 'ash_1')).toBeUndefined();
    expect(player(played, '0').lost.map(entry => entry.id)).toContain('ash_1');
    expect(fighterOf(played, '1', 'beta').currentHp).toBe(11);
  });

  it('никого в радиусе — карта не предлагается и остаётся топливом', () => {
    const state = buildState({ foeCell: 7, farCell: 8, spiritNear: false });
    // своих рядом нет, противники на 7 и 8 — это три и четыре шага от Ифрита
    const ui = runUi(state, '0');

    expect(ui.playableCardIds ?? []).not.toContain('ifrit_14_1');
    expect(ui.disabledCardIds ?? []).toContain('ifrit_14_1');
  });

  it('пустой радиус не бьёт ни своих, ни чужих', () => {
    const state = buildState({ foeCell: 7, farCell: 8, spiritNear: false });

    expect(runUi(state, '0').playableCardIds ?? []).not.toContain('ifrit_14_1');
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(13);
    expect(fighterOf(state, '1', 'gamma').currentHp).toBe(13);
    expect(fighterOf(state, '0', 'ifrit').currentHp).toBe(14);
  });
});
