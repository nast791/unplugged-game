import { describe, expect, it } from 'vitest';
import { runCombatPicked, waitingCombatCard } from '#shared/cards/run.js';
import { createState, player } from '../../fixtures/state.js';

/**
 * Ответ в бою уходит **тому** шагу очереди, чьё окно открыто.
 *
 * Пауз в одном бою может быть несколько (своя карта и чужая). Пока движок брал «первый ждущий» шаг,
 * ответ доставался чужой карте: её правило в моменте `picked` меняло число боя уже после расчёта и
 * падало на `SET_COMBAT: шаг "reveal" недоступен на stage "close"` (находка прогона: Дороти против
 * Ифрита, сид 2). Окно хранит ключ открывшей его карты (`source`), у шага тот же ключ в `cardId`.
 */
const pickedCard = (id, delta) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type: 'defense',
  value: 1,
  bonus: 1,
  rules: [{ moment: 'picked', then: [{ action: 'SET_HEALTH', fighterIds: ['beta'], delta }] }],
});

/** Бой с двумя ждущими шагами: первая пауза — карта атакующего, вторая — карта защитника. */
const twoPauses = () => {
  const state = createState();
  state.combat = {
    stage: 'close',
    attackCard: pickedCard('attack', -5),
    defenseCard: pickedCard('defense', -1),
    effects: [
      {
        cardId: 'attack_1',
        side: 'attacker',
        moment: 'afterCombat',
        status: 'waiting',
        playerId: '0',
      },
      {
        cardId: 'defense_1',
        side: 'defender',
        moment: 'afterCombat',
        status: 'waiting',
        playerId: '1',
      },
    ],
  };
  state.targeting = {
    playerId: '1',
    source: 'defense_1',
    kind: 'options',
    candidates: [{ optionId: 'heal' }],
    required: false,
    picked: null,
  };
  return state;
};

const betaHp = state =>
  player(state, '1').fighters.find(fighter => fighter.id === 'beta').currentHp;

describe('очередь боя: ответ адресуется окну, а не первому ждущему шагу', () => {
  it('карта окна — та, что открыла окно', () => {
    expect(waitingCombatCard(twoPauses())?.id).toBe('defense');
  });

  it('правило запускает карта окна, а не первая пауза в очереди', () => {
    const state = twoPauses();
    const before = betaHp(state);

    runCombatPicked(state);

    // сработало правило карты защитника (−1), а не карты атакующего (−5)
    expect(betaHp(state)).toBe(before - 1);
  });

  it('без открытого окна берётся первый ждущий шаг', () => {
    const state = twoPauses();
    state.targeting = null;
    const before = betaHp(state);

    runCombatPicked(state);

    expect(betaHp(state)).toBe(before - 5);
  });
});
