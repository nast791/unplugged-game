import { describe, expect, it } from 'vitest';
import { ITEM_STATE_LABELS } from '../../../app/constants/items.js';
import { itemStateLabel } from '../../../app/composables/game/useGameHelpers.js';

/**
 * Состояние предмета называется одинаково у всех предметов (решение владельца): «активна» / «не активна».
 * Прежние «цела», «порвана», «отсутствует» игроку не показываются, и пак не может переименовать эти два
 * состояния себе: предмет — индикатор эффекта, а не вещь со своим словарём. Своё имя остаётся только
 * у нестандартного состояния счётчика — осколки Снежной королевы «во льду» / «собраны».
 */
describe('подпись состояния предмета', () => {
  it('активное и неактивное состояния подписаны одинаково для любого предмета', () => {
    expect(ITEM_STATE_LABELS).toEqual({ active: 'активна', inactive: 'не активна' });
    expect(itemStateLabel({ id: 'shroud' }, 'active')).toBe('активна');
    expect(itemStateLabel({ id: 'shroud' }, 'inactive')).toBe('не активна');
  });

  it('пак не переименовывает активное и неактивное состояние', () => {
    const shroud = { id: 'shroud', states: { active: 'цела', inactive: 'отсутствует' } };

    expect(itemStateLabel(shroud, 'active')).toBe('активна');
    expect(itemStateLabel(shroud, 'inactive')).toBe('не активна');
  });

  it('своё имя у состояния счётчика остаётся', () => {
    const shard = { id: 'shard', states: { ice: 'во льду', collected: 'собраны' } };

    expect(itemStateLabel(shard, 'ice')).toBe('во льду');
    expect(itemStateLabel(shard, 'collected')).toBe('собраны');
  });

  it('незнакомое и пустое состояние не ломают подпись', () => {
    expect(itemStateLabel({}, 'charged')).toBe('charged');
    expect(itemStateLabel({}, null)).toBe('—');
    expect(itemStateLabel(null, undefined)).toBe('—');
  });
});
