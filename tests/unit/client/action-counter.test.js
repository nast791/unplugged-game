import { describe, expect, it } from 'vitest';
import { createGame } from '../../../server/create.js';
import { load, view } from '../../../server/party.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { numberedCellId, startAreaCellIds } from '#shared/helpers/placement.js';
import { pendingActionCount } from '#shared/helpers/turn.js';
import { adaptPartyView } from '../../../app/composables/game/useGameView.js';
import { player } from '../../fixtures/state.js';

/**
 * Счётчик действий на карточке героя (находка владельца, m00001): движок списывает действие в момент
 * объявления, а карточка показывает его законченным — «2/2», пока перемещение открыто, и «1/2» после
 * завершения. Компенсацию считает сервер (`view().actionsPending`), клиент только прибавляет её.
 */
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
    { testId: 'action_counter', testSeed: 5 },
  );
  return load('action_counter');
};

const placeAll = (state, playerId) => {
  let run = state;
  const p = player(run, playerId);
  const free = new Set(startAreaCellIds(run, playerId).map(String));
  free.delete(String(numberedCellId(run, playerId)));
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
      playerId,
    });
  }
  return run;
};

/** Начало хода Медузы: расстановка пройдена, открыт выбор действия на 2/2. */
const turnOfMedusa = () => {
  let run = runAction(placeAll(create(), 'medusa'), { type: 'UI_OK', playerId: 'medusa' });
  for (let i = 0; i < 4 && runUi(run, 'medusa').phase !== 'choose'; i += 1) {
    run = runAction(run, { type: 'UI_OK', playerId: 'medusa' });
  }
  return run;
};

const shownActions = (state, playerId) => adaptPartyView(view(state, playerId)).actionsLeft;

describe('счётчик действий: списание видно после завершения действия', () => {
  it('объявленное перемещение держит 2/2, завершённое показывает 1/2', () => {
    const turn = turnOfMedusa();
    expect(runUi(turn, 'medusa').phase).toBe('choose');
    expect(shownActions(turn, 'medusa')).toBe(2);

    const moving = runAction(turn, { type: 'PICK', kind: 'deck', playerId: 'medusa' });
    expect(moving.movement).not.toBeNull();
    expect(moving.movement.source).toBeNull();
    // движок списывает действие уже объявленным, а карточка ещё показывает прежние два
    expect(moving.turn.actionsLeft).toBe(1);
    expect(shownActions(moving, 'medusa')).toBe(2);

    const closed = runAction(moving, { type: 'UI_OK', playerId: 'medusa' });
    expect(closed.movement).toBeNull();
    expect(closed.turn.actionsLeft).toBe(1);
    expect(shownActions(closed, 'medusa')).toBe(1);
  });

  it('чужой смотрит тот же счётчик: перемещение скрыто, компенсация нет', () => {
    const moving = runAction(turnOfMedusa(), { type: 'PICK', kind: 'deck', playerId: 'medusa' });

    expect(view(moving, 'tesla').movement).toBeNull();
    expect(view(moving, 'tesla').actionsPending).toBe(1);
    expect(shownActions(moving, 'tesla')).toBe(2);
  });

  it('признак незаконченного действия: обычное перемещение да, от эффекта — нет', () => {
    expect(pendingActionCount({})).toBe(0);
    expect(pendingActionCount({ movement: { source: null } })).toBe(1);
    expect(pendingActionCount({ movement: { source: 'medusa_03' } })).toBe(0);
    expect(pendingActionCount({ combat: { attackerPlayerId: '0' } })).toBe(1);
    expect(pendingActionCount({ effect: { playerId: '0' } })).toBe(1);
  });
});
