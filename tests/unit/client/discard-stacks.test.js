import { describe, expect, it } from 'vitest';
import { discardStacks } from '../../../app/composables/game/useGameHelpers.js';

/** Карта сброса: вид (`id`) один у копий, `instanceId` — у каждой свой, как в колоде партии. */
const card = (id, instanceId, type = 'attack') => ({ id, instanceId, type, title: id });

describe('discardStacks', () => {
  it('копии одной карты лежат в одной стопке', () => {
    const groups = discardStacks([
      card('anubis_02', 'anubis_02_1'),
      card('anubis_02', 'anubis_02_2'),
      card('anubis_02', 'anubis_02_3'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].stacks).toHaveLength(1);
    expect(groups[0].stacks[0].cards.map(item => item.instanceId)).toEqual([
      'anubis_02_1',
      'anubis_02_2',
      'anubis_02_3',
    ]);
  });

  it('разные карты одного типа — разные стопки: в стопке не бывает чужой карты', () => {
    const groups = discardStacks([
      card('anubis_02', 'anubis_02_1'),
      card('anubis_05', 'anubis_05_1'),
      card('anubis_02', 'anubis_02_2'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].stacks.map(stack => stack.cards.map(item => item.instanceId))).toEqual([
      ['anubis_02_1', 'anubis_02_2'],
      ['anubis_05_1'],
    ]);
  });

  it('типы идут в порядке CARD_TYPE_ORDER, пустые группы не показываются', () => {
    const groups = discardStacks([
      card('anubis_09', 'anubis_09_1', 'effect'),
      card('anubis_02', 'anubis_02_1', 'attack'),
      card('anubis_06', 'anubis_06_1', 'defense'),
    ]);

    expect(groups.map(group => group.type)).toEqual(['attack', 'defense', 'effect']);
    expect(discardStacks([])).toEqual([]);
  });
});
