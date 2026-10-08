import { describe, expect, it } from 'vitest';
import { actionsFor, actorOf } from '../../../bot/play/decide.js';
import { cardIdOf } from '../../../bot/play/metrics.js';
import { playDuel } from '../../../bot/play/duel.js';

/**
 * Вето на пустой эффект: карта, у которой свойство сейчас не срабатывает, получает вес 0 и не играется.
 *
 * Проверяется на живой партии, а не на фикстуре: важно, что правило работает в том же
 * перечислении действий, которым играет бот (`actionsFor`), — до этого эффекты уходили в пустоту
 * в 24% случаев, а «Анубис: Погребальный звон» вообще не различался по условиям.
 */
const findUselessEffect = () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    let found = null;
    playDuel({
      seed,
      heroA: 'anubis',
      heroB: 'dorothy',
      policy: 'greedy',
      maxSteps: 60,
      onStep: ({ state, playerId }) => {
        if (found) return;
        const options = actionsFor(state, playerId, { policy: 'greedy' });
        for (const entry of options) {
          if (entry.action?.kind !== 'card') continue;
          const card = (state.players ?? [])
            .find(player => String(player.id) === String(playerId))
            ?.hand?.cards?.find(
              item => String(item.instanceId ?? item.id) === String(entry.action.id),
            );
          if (card?.type !== 'effect') continue;
          // карта с нулевым весом — это и есть «свойство сейчас не сработает»
          if (Number(entry.weight) === 0) {
            found = { state, playerId, action: entry.action, options, cardId: cardIdOf(card.id) };
            return;
          }
        }
      },
    });
    if (found) return found;
  }
  return null;
};

describe('вето на пустой эффект', () => {
  it('эффектная карта без срабатывающего свойства имеет вес 0, и есть из чего выбрать', () => {
    const found = findUselessEffect();
    expect(found).not.toBeNull();

    // у того же решения есть варианты с положительным весом: вето не оставляет игрока без хода
    expect(found.options.some(entry => Number(entry.weight) > 0)).toBe(true);
    expect(actorOf(found.state)).toBeTruthy();
  });
});
