import { describe, expect, it } from 'vitest';
import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { FIGHTER_STATUSES, SET_STATUS } from '#shared/actions/status.js';
import {
  STATUSES,
  STATUS_IDS,
  blockingStatus,
  fighterStatuses,
  hasStatus,
  releaseStatuses,
  statusOf,
} from '#shared/constants/statuses.js';
import { createState, player } from '../../fixtures/state.js';

/**
 * Реестр статусов — источник правды сразу для трёх сторон: движок берёт из него список допустимых id и
 * запреты (`blockingStatus`), контент — id в правиле карты, интерфейс — название, иконку и описание.
 * Поэтому проверяем не «поле существует», а что реестр полон и что движок действительно читает запреты
 * из него, а не из конкретного поля.
 */
describe('реестр статусов', () => {
  it('у каждого статуса есть id, название, иконка, описание и запреты', () => {
    for (const id of STATUS_IDS) {
      const status = STATUSES[id];

      expect(status.id, id).toBe(id);
      expect(status.title.length, id).toBeGreaterThan(0);
      // имя iconify: коллекция:имя — иначе иконка не отрисуется
      expect(status.icon, id).toMatch(/^[a-z-]+:[a-z0-9-]+$/);
      expect(status.text.length, id).toBeGreaterThan(0);
      expect(status.forbids.length, id).toBeGreaterThan(0);
    }
  });

  it('движок валидирует статусы ровно по реестру', () => {
    expect(FIGHTER_STATUSES).toEqual(STATUS_IDS);
  });

  it('«Заморозка» запрещает шаг и телепорт, а срока в реестре нет', () => {
    expect(STATUSES.frozen).toMatchObject({
      title: 'Заморозка',
      forbids: ['move', 'teleport'],
    });
    expect(statusOf('frozen')).toBe(STATUSES.frozen);
    expect(statusOf('нет-такого')).toBeNull();
    // срок — условие правила, которое статус поставило, а не свойство статуса
    expect(STATUSES.frozen).not.toHaveProperty('until');
    expect(STATUSES.frozen).not.toHaveProperty('duration');
  });

  it('«заморозка» отличается иконкой от осколков Снежной королевы', () => {
    // осколки в паке героя — `lucide:snowflake`; у статуса своя снежинка
    expect(STATUSES.frozen.icon).not.toBe('lucide:snowflake');
  });

  it('действующие статусы бойца — в порядке реестра, пусто — пустой список', () => {
    expect(fighterStatuses({ frozen: true }).map(status => status.id)).toEqual(['frozen']);
    expect(fighterStatuses({})).toEqual([]);
    expect(fighterStatuses(null)).toEqual([]);
    // `false` — не статус
    expect(fighterStatuses({ frozen: false })).toEqual([]);
  });

  it('blockingStatus отвечает за вид запрета', () => {
    expect(blockingStatus({ frozen: true }, 'move')).toBe('frozen');
    expect(blockingStatus({ frozen: true }, 'teleport')).toBe('frozen');
    expect(blockingStatus({}, 'move')).toBeNull();
    expect(blockingStatus(null, 'move')).toBeNull();
  });
});

describe('статус на бойце: постановка, запрет, снятие', () => {
  const alpha = state => player(state, '0').fighters.find(fighter => fighter.id === 'alpha');
  it('SET_STATUS ставит и снимает, неизвестный статус — ошибка', () => {
    const state = createState();

    SET_STATUS(state, { playerId: '0', fighterIds: ['alpha'], status: 'frozen', value: true });
    expect(fighterStatuses(alpha(state)).map(status => status.id)).toEqual(['frozen']);
    expect(() =>
      SET_STATUS(state, { playerId: '0', fighterIds: ['alpha'], status: 'нет-такого' }),
    ).toThrow(/неизвестный статус/);

    SET_STATUS(state, { playerId: '0', fighterIds: ['alpha'], status: 'frozen', value: false });
    expect(fighterStatuses(alpha(state))).toEqual([]);
  });

  it('замороженный не шагает и не телепортируется, сосед без статуса — шагает', () => {
    const state = createState();
    SET_STATUS(state, { playerId: '0', fighterIds: ['alpha'], status: 'frozen', value: true });

    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 })).toThrow(/заморожен/);
    expect(() =>
      SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9, teleport: true }),
    ).toThrow(/заморожен/);
    // статус — про бойца, а не про владельца: помощник того же игрока ходит
    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'pawn', cellId: 10 })).not.toThrow();
  });
});

/**
 * Срок статуса живёт **на экземпляре** (`fighter.statuses[id].until`), а не в реестре: один и тот же
 * `frozen` бывает «до конца текущего хода» и «до конца своего хода». Снимает статус конец хода
 * (`releaseStatuses` зовётся из `shared/lifecycle/turnEnd.js`), а досрочно — правило карты с
 * `value: false`.
 */
describe('срок статуса: до конца текущего хода и до конца своего', () => {
  const frozenOn = (until = undefined) => {
    const state = createState();
    SET_STATUS(state, {
      playerId: '0',
      fighterIds: ['alpha'],
      status: 'frozen',
      value: true,
      ...(until === undefined ? {} : { until }),
    });
    return state;
  };
  const alpha = state => player(state, '0').fighters.find(fighter => fighter.id === 'alpha');

  it('по умолчанию — `turnEnd`: снимается на ближайшем конце хода, чей бы он ни был', () => {
    const state = frozenOn();
    expect(fighterStatuses(alpha(state))[0]).toMatchObject({ id: 'frozen', until: 'turnEnd' });

    // ход заканчивает противник — срок всё равно вышел
    expect(releaseStatuses(alpha(state), { playerId: '1', ownerId: '0' })).toEqual(['frozen']);
    expect(hasStatus(alpha(state), 'frozen')).toBe(false);
  });

  it('`ownerTurnEnd` переживает чужой ход и снимается в конце хода владельца', () => {
    const state = frozenOn('ownerTurnEnd');
    expect(fighterStatuses(alpha(state))[0]).toMatchObject({ id: 'frozen', until: 'ownerTurnEnd' });

    // ход чужой: заморозка остаётся
    expect(releaseStatuses(alpha(state), { playerId: '1', ownerId: '0' })).toEqual([]);
    expect(hasStatus(alpha(state), 'frozen')).toBe(true);
    // и боец по-прежнему не ходит
    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 })).toThrow(/заморожен/);

    // дошла очередь владельца — снялась
    expect(releaseStatuses(alpha(state), { playerId: '0', ownerId: '0' })).toEqual(['frozen']);
    expect(hasStatus(alpha(state), 'frozen')).toBe(false);
  });

  it('неизвестный срок — ошибка, а не молчаливое «до конца хода»', () => {
    const state = createState();

    expect(() =>
      SET_STATUS(state, { fighterIds: ['alpha'], status: 'frozen', value: true, until: 'никогда' }),
    ).toThrow(/неизвестный срок/);
    expect(hasStatus(alpha(state), 'frozen')).toBe(false);
  });

  it('досрочное снятие правилом стирает и срок, и запись', () => {
    const state = frozenOn('ownerTurnEnd');

    SET_STATUS(state, { playerId: '0', fighterIds: ['alpha'], status: 'frozen', value: false });

    expect(alpha(state).statuses).toBeUndefined();
    expect(fighterStatuses(alpha(state))).toEqual([]);
  });

  it('старый вид записи (`frozen: true` прямо на бойце`) читается и снимается как `turnEnd`', () => {
    // такие партии могут быть в памяти сервера или в sessionStorage после перезапуска
    const state = createState();
    alpha(state).frozen = true;

    expect(fighterStatuses(alpha(state))[0]).toMatchObject({ id: 'frozen', until: 'turnEnd' });
    expect(blockingStatus(alpha(state), 'move')).toBe('frozen');

    expect(releaseStatuses(alpha(state), { playerId: '1', ownerId: '0' })).toEqual(['frozen']);
    expect(alpha(state).frozen).toBeUndefined();
    expect(hasStatus(alpha(state), 'frozen')).toBe(false);
  });
});
