import { describe, expect, it } from 'vitest';
import { SET_CARDS } from '#shared/actions/cards.js';
import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { SET_HAND_LIMIT } from '#shared/actions/handLimit.js';
import { SET_HEALTH } from '#shared/actions/health.js';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { SET_STATUS } from '#shared/actions/status.js';
import { runFact, runUi } from '#shared/core.js';
import {
  SHARD_GROUP,
  SHARD_STATE_COLLECTED,
  SHARD_STATE_FREE,
  shardCount,
  syncAllShardItems,
} from '#shared/helpers/shards.js';
import {
  handLimitFor,
  isHandOverLimit,
  movableFighterIds,
  movementDestinations,
  mustDiscardCount,
} from '#shared/helpers/turn.js';
import turnEnd from '#shared/lifecycle/turnEnd.js';
import { runSkillMoment } from '#shared/skills/run.js';
import snowQueen from '../../../server/content/heroes/snow-queen/index.js';
import { card, createState, deck, discard, fighter, player } from '../../fixtures/state.js';

/** Карта с меткой осколка (то, что делает карту осколком, когда она уходит в сброс). */
const shardCard = (id, patch = {}) =>
  card({
    id,
    instanceId: id,
    title: id,
    type: 'attack',
    value: 3,
    bonus: 1,
    tags: ['shard'],
    ...patch,
  });

/** Предмет-табло осколков: пул из `size` копий, скрытый в состоянии `ice`. */
const shardItems = (size = 12) =>
  Array.from({ length: size }, (_, index) => ({
    id: `${SHARD_GROUP}_${index + 1}`,
    group: SHARD_GROUP,
    name: 'Осколки',
    state: SHARD_STATE_FREE,
    hiddenStates: [SHARD_STATE_FREE],
    display: 'counter',
  }));

const putInDiscard = (state, playerId, count) => {
  const cards = Array.from({ length: count }, (_, index) => shardCard(`shard_${index + 1}`));
  player(state, playerId).discard.cards.push(...cards);
};

/** Игрок с умением королевы: его правила гоняются так же, как в партии. */
const withSkill = (state, playerId = '0') => {
  player(state, playerId).skill = structuredClone(snowQueen.skill);
  return state;
};

describe('осколки: факт CARDS читает сброс', () => {
  it('считает карты с меткой и молчит про карты без метки', () => {
    const state = createState();
    putInDiscard(state, '0', 2);
    player(state, '0').discard.cards.push(card({ id: 'plain', title: 'plain' }));

    expect(shardCount(state, '0')).toBe(2);
    expect(
      runFact(state, 'CARDS', { zone: 'discard', tag: 'shard', min: 2 }, { playerId: '0' }).ok,
    ).toBe(true);
    expect(
      runFact(state, 'CARDS', { zone: 'discard', tag: 'shard', min: 3 }, { playerId: '0' }).ok,
    ).toBe(false);
    expect(
      runFact(state, 'CARDS', { zone: 'discard', tag: 'shard' }, { playerId: '1' }).value,
    ).toEqual([]);
  });

  it('видит и чужой сброс, и другие зоны', () => {
    const state = createState();
    putInDiscard(state, '0', 6);
    player(state, '0').deck.cards.push(shardCard('deck_shard'));

    expect(
      runFact(state, 'CARDS', { of: '0', zone: 'discard', tag: 'shard', min: 6 }, { playerId: '1' })
        .ok,
    ).toBe(true);
    expect(
      runFact(state, 'CARDS', { of: '0', zone: 'deck', tag: 'shard', min: 1 }, { playerId: '0' })
        .ok,
    ).toBe(true);
  });
});

describe('осколки: табло-предмет — зеркало сброса', () => {
  it('собранные копии идут в collected, остальные остаются во льду', () => {
    const state = createState();
    player(state, '0').items = shardItems(12);
    putInDiscard(state, '0', 7);

    syncAllShardItems(state);

    const items = player(state, '0').items;
    expect(items.filter(item => item.state === SHARD_STATE_COLLECTED)).toHaveLength(7);
    expect(items.filter(item => item.state === SHARD_STATE_FREE)).toHaveLength(5);
  });

  it('сброс проредили — осколков меньше: сила гаснет вместе с ними', () => {
    const state = createState();
    player(state, '0').items = shardItems(12);
    putInDiscard(state, '0', 6);
    syncAllShardItems(state);
    expect(shardCount(state, '0')).toBe(6);

    SET_CARDS(state, {
      playerId: '0',
      op: 'move',
      from: 'discard',
      to: 'hand',
      cardIds: ['shard_1'],
    });
    syncAllShardItems(state);

    expect(shardCount(state, '0')).toBe(5);
    expect(
      player(state, '0').items.filter(item => item.state === SHARD_STATE_COLLECTED),
    ).toHaveLength(5);
  });
});

describe('«Вечная мерзлота»: лимит руки только врагам', () => {
  it('правило опускает лимит врагам и не трогает своих', () => {
    const state = createState();
    // команда red: игроки 0 и 2 союзники, игрок 1 — враг
    state.players[1].team = 'blue';
    state.players[0].team = 'red';
    state.players.push({
      ...structuredClone(state.players[0]),
      id: '2',
      name: 'Gamma',
      team: 'red',
    });

    SET_HAND_LIMIT(state, { playerId: '0', of: 'enemies', value: 5 });

    expect(handLimitFor(state, '1')).toBe(5);
    expect(handLimitFor(state, '2')).toBe(7);
    expect(handLimitFor(state, '0')).toBe(7);
  });

  it('value: null возвращает общий лимит', () => {
    const state = createState();
    SET_HAND_LIMIT(state, { playerId: '0', of: 'enemies', value: 5 });
    expect(handLimitFor(state, '1')).toBe(5);

    SET_HAND_LIMIT(state, { playerId: '0', of: 'enemies', value: null });
    expect(handLimitFor(state, '1')).toBe(7);
  });

  it('шесть осколков включают режим в конце её хода, пять — выключают', () => {
    const state = withSkill(createState());
    putInDiscard(state, '0', 6);
    runSkillMoment(state, '0', 'turnEnd');
    expect(handLimitFor(state, '1')).toBe(5);

    SET_CARDS(state, {
      playerId: '0',
      op: 'move',
      from: 'discard',
      to: 'hand',
      cardIds: ['shard_1'],
    });
    runSkillMoment(state, '0', 'turnEnd');
    expect(handLimitFor(state, '1')).toBe(7);
  });

  it('набранные по ходу осколки включают режим к концу её хода', () => {
    const state = withSkill(createState());
    putInDiscard(state, '0', 6);

    runSkillMoment(state, '0', 'turnEnd');

    expect(handLimitFor(state, '1')).toBe(5);
  });

  it('пять карт у врага — перебор, четыре — уже нет', () => {
    const state = withSkill(createState());
    putInDiscard(state, '0', 6);
    runSkillMoment(state, '0', 'turnEnd');

    player(state, '1').hand.cards = Array.from({ length: 6 }, (_, index) =>
      card({ id: `b_${index + 1}` }),
    );
    expect(isHandOverLimit(state, '1')).toBe(true);
    expect(mustDiscardCount(state, '1')).toBe(1);

    player(state, '1').hand.cards = player(state, '1').hand.cards.slice(0, 5);
    expect(isHandOverLimit(state, '1')).toBe(false);
    expect(mustDiscardCount(state, '1')).toBe(0);
  });
});

describe('«Вечная мерзлота»: гибель вороны', () => {
  const stateWithCrow = (topCard = shardCard('top_shard')) => {
    const state = withSkill(createState());
    player(state, '0').fighters.push(
      fighter({
        id: 'crow_1',
        name: 'Кристальная ворона',
        type: 'assistant',
        group: 'crow',
        currentPosition: null,
        currentHp: 2,
        startHp: 2,
        move: 3,
      }),
    );
    player(state, '0').deck.cards.push(topCard);
    return state;
  };

  it('верхняя карта колоды уходит в сброс, и осколок на ней засчитывается', () => {
    const state = stateWithCrow();
    const deckBefore = deck(player(state, '0')).length;
    expect(shardCount(state, '0')).toBe(0);

    SET_HEALTH(state, { fighterIds: ['crow_1'], delta: -2 });

    expect(deck(player(state, '0'))).toHaveLength(deckBefore - 1);
    expect(discard(player(state, '0')).map(entry => entry.id)).toContain('top_shard');
    expect(shardCount(state, '0')).toBe(1);
  });

  it('карта без метки уходит в сброс, но осколком не становится', () => {
    const state = stateWithCrow(card({ id: 'plain_top', instanceId: 'plain_top' }));

    SET_HEALTH(state, { fighterIds: ['crow_1'], delta: -2 });

    expect(shardCount(state, '0')).toBe(0);
    expect(discard(player(state, '0')).map(entry => entry.id)).toContain('plain_top');
  });

  it('гибель героя правило не задевает', () => {
    const state = withSkill(createState());
    const deckBefore = deck(player(state, '0')).length;

    SET_HEALTH(state, { fighterIds: ['alpha'], delta: -99 });

    expect(deck(player(state, '0'))).toHaveLength(deckBefore);
  });

  it('на пустой колоде правило молчит', () => {
    const state = stateWithCrow();
    player(state, '0').deck.cards = [];

    expect(() => SET_HEALTH(state, { fighterIds: ['crow_1'], delta: -2 })).not.toThrow();
    expect(discard(player(state, '0'))).toHaveLength(0);
  });
});

describe('«заморожен»: статус бойца', () => {
  const frozenState = () => {
    const state = createState();
    SET_STATUS(state, { fighterIds: ['alpha'], status: 'frozen', value: true });
    return state;
  };

  it('ставит статус и читается фактом', () => {
    const state = frozenState();

    expect(
      runFact(state, 'FIGHTERS', { fighterIds: ['alpha'], frozen: true }, { playerId: '0' }).ok,
    ).toBe(true);
    expect(runFact(state, 'FIGHTERS', { frozen: true, min: 2 }, { playerId: '0' }).ok).toBe(false);
  });

  it('шаг и телепорт замороженному закрыты', () => {
    const state = frozenState();

    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 })).toThrow(/заморожен/);
    expect(() =>
      SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9, teleport: true }),
    ).toThrow(/заморожен/);
    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'pawn', cellId: 8 })).not.toThrow();
  });

  it('подсветка шага и клик говорят одно и то же: замороженному клеток не предлагают', () => {
    // линия длиннее фикстуры: у свободного бойца есть куда шагнуть, у замороженного — нет
    const lineMap = {
      id: 'line',
      nodes: [8, 9, 10, 11].map((id, index, list) => ({
        id,
        terrain: 'ice',
        x: index,
        y: 0,
        neighbors: [list[index - 1], list[index + 1]].filter(neighbour => neighbour != null),
      })),
    };
    const state = createState({ map: lineMap });
    player(state, '1').fighters[0].currentPosition = 11;
    SET_MOVEMENT(state, { op: 'open', playerId: '0' });
    SET_STATUS(state, { fighterIds: ['alpha'], status: 'frozen', value: true });

    // свободный помощник ходит, замороженный герой — нет
    expect(movementDestinations(state, '0', 'pawn')).not.toEqual([]);
    expect(movementDestinations(state, '0', 'alpha')).toEqual([]);
    expect(runUi(state, '0', { selectedFighterId: 'alpha' }).highlightedCellIds).toEqual([]);
    expect(movableFighterIds(state, '0')).toEqual([]);
  });

  it('снимается сам в конце хода', () => {
    const state = frozenState();

    turnEnd.enter(state);

    expect(player(state, '0').fighters[0].frozen).toBeUndefined();
    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 })).not.toThrow();
  });

  it('чужой статус не мешает ходить своим', () => {
    const state = createState();
    SET_STATUS(state, { fighterIds: ['beta'], status: 'frozen', value: true });

    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 })).not.toThrow();
    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'beta', cellId: 9 })).toThrow(/заморожен/);
  });
});

describe('замешивание колоды: детерминировано сидом', () => {
  it('тот же сид — тот же порядок, разный сид — другой', () => {
    const order = seed => {
      const state = createState();
      state.settings = { seed };
      player(state, '0').deck.cards = Array.from({ length: 10 }, (_, index) =>
        card({ id: `d_${index + 1}` }),
      );
      SET_CARDS(state, { playerId: '0', op: 'shuffle', zone: 'deck' });
      return deck(player(state, '0'))
        .map(entry => entry.id)
        .join(',');
    };

    expect(order(7)).toBe(order(7));
    expect(order(7)).not.toBe(order(8));
  });

  it('переносу можно ограничить число карт: «замешайте 3»', () => {
    const state = createState();
    putInDiscard(state, '0', 5);
    const ids = discard(player(state, '0')).map(entry => entry.id);

    SET_CARDS(state, {
      playerId: '0',
      op: 'move',
      from: 'discard',
      to: 'deck',
      cardIds: ids,
      count: 3,
    });

    expect(deck(player(state, '0'))).toHaveLength(5);
    expect(discard(player(state, '0'))).toHaveLength(2);
  });
});
