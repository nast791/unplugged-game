import { describe, expect, it } from 'vitest';
import { timeoutLosers } from '../../../app/utils/timeLoss.js';

/**
 * Лимит времени — правило партии: кто не успел, тот выбывает. Кто именно — решает эта чистая функция,
 * поэтому её и проверяем: в расстановке выбывают неподтвердившиеся, в игре — действующий игрок, а слот
 * компьютера не выбывает никогда (за него ходы считает клиент) и сдавшийся не сдаётся вторым разом.
 */
const seats = overrides =>
  [
    { id: '0', control: 'human', placementReady: false },
    { id: '1', control: 'ai', placementReady: false },
    { id: '2', control: 'human', placementReady: true },
    { id: '3', control: 'human', placementReady: false, resigned: true },
  ].map(player => ({ ...player, ...(overrides?.[player.id] ?? {}) }));

describe('timeoutLosers', () => {
  it('расстановка: выбывают все, кто её не подтвердил', () => {
    expect(timeoutLosers({ placement: true, players: seats() })).toEqual(['0']);
  });

  it('расстановка: компьютер и уже сдавшийся в список не попадают', () => {
    const all = seats({ 0: { placementReady: false }, 2: { placementReady: false } });
    // люди без подтверждения: 0 и 2; компьютер (1) и сдавшийся (3) — нет
    expect(timeoutLosers({ placement: true, players: all })).toEqual(['0', '2']);
  });

  it('расстановка: все подтвердили — выбывать некого', () => {
    const ready = seats({ 0: { placementReady: true } });
    expect(timeoutLosers({ placement: true, players: ready })).toEqual([]);
  });

  it('игра: выбывает действующий игрок', () => {
    expect(timeoutLosers({ players: seats(), actorId: '2' })).toEqual(['2']);
  });

  it('игра: без действующего игрока выбывать некого', () => {
    expect(timeoutLosers({ players: seats(), actorId: null })).toEqual([]);
    expect(timeoutLosers({ players: seats() })).toEqual([]);
  });

  it('игра: за компьютер не сдаём, сдавшийся не сдаётся дважды, чужой id — пустой список', () => {
    expect(timeoutLosers({ players: seats(), actorId: '1' })).toEqual([]);
    expect(timeoutLosers({ players: seats(), actorId: '3' })).toEqual([]);
    expect(timeoutLosers({ players: seats(), actorId: 'nope' })).toEqual([]);
  });
});
