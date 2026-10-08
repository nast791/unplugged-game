import { describe, expect, it } from 'vitest';
import { createGame } from '../../../server/create.js';
import { load } from '../../../server/party.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { startAreaCellIds, numberedCellId } from '#shared/helpers/placement.js';
import { player } from '../../fixtures/state.js';

const create = () => {
  createGame(
    {
      mapId: 'generated',
      mode: 'hotseat',
      heroes: [
        { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
        { heroId: 'tesla', team: 'B', order: 2, control: 'human' },
      ],
    },
    { testId: 'place_auto', testSeed: 5 },
  );
  return load('place_auto');
};

const placeAll = state => {
  let run = state;
  const p = player(run, 'medusa');
  const free = new Set(startAreaCellIds(run, 'medusa').map(String));
  free.delete(String(numberedCellId(run, 'medusa')));
  for (const fighter of p.fighters) {
    if (fighter.currentPosition != null) {
      free.delete(String(fighter.currentPosition));
      continue;
    }
    const cell = [...free][0];
    free.delete(cell);
    run = runAction(run, {
      type: 'PICK',
      kind: 'cell',
      id: Number(cell),
      fighterId: fighter.id,
      playerId: 'medusa',
    });
  }
  return run;
};

describe('расстановка: подтверждение без нажатия «ОК»', () => {
  it('герой без помощников подтверждается сам: расставлять нечего, двигать его нельзя', () => {
    const state = create();

    expect(player(state, 'tesla').placementReady).toBe(true);
    expect(player(state, 'tesla').fighters).toHaveLength(1);
    expect(player(state, 'tesla').fighters[0].currentPosition).toBe(numberedCellId(state, 'tesla'));
    // игра всё ещё в расстановке: ждём второго игрока
    expect(state.hook).toBe('gameStart');
    expect(runUi(state, 'tesla').hint).toBe('Ожидание расстановки бойцов всех игроков');
  });

  it('у кого есть кого расставлять — «ОК» остаётся за игроком', () => {
    const created = create();
    expect(player(created, 'medusa').placementReady).toBe(false);

    const placed = placeAll(created);
    expect(player(placed, 'medusa').placementReady).toBe(false);
    expect(placed.hook).toBe('gameStart');

    const ready = runAction(placed, { type: 'UI_OK', playerId: 'medusa' });

    expect(player(ready, 'medusa').placementReady).toBe(true);
    expect(ready.hook).toBe('turn');
    expect(ready.turn.playerId).toBe('medusa');
  });
});
