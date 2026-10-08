import { describe, expect, it } from 'vitest';
import { SET_TARGETING } from '#shared/actions/targeting.js';
import { advanceCombat } from '#shared/cards/run.js';
import { runAction, runFact, runUi } from '#shared/publicApi.js';
import { view } from '../../../server/party.js';
import { card, createState, hand, player, PHASES } from '../../fixtures/state.js';

/** Карта «посмотрите руку противника и сбросьте выбранную им карту» — механика «Ледяного зеркала». */
const mirror = card({
  id: 'mirror',
  instanceId: 'mirror_1',
  title: 'Ледяное зеркало',
  type: 'attack',
  value: 2,
  bonus: 1,
  fighter: 'alpha',
  rules: [
    {
      moment: 'duringCombat',
      when: [
        { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
        { fact: 'CARDS', params: { of: '$enemy', zone: 'hand' }, var: 'mirror' },
      ],
      then: [
        {
          action: 'SET_TARGETING',
          op: 'open',
          kind: 'options',
          candidates: '$mirror',
          max: 1,
          source: 'mirror_1',
          required: true,
        },
      ],
    },
    {
      moment: 'picked',
      when: [{ fact: 'PICKED', var: 'choice' }],
      // противника правило называет ролью: `$enemy` из условия выше в другое правило не переносится
      then: [{ action: 'SET_CARDS', of: 'opponent', op: 'discard', cardIds: '$choice' }],
    },
  ],
});

const enemyCard = (id, title, bonus) =>
  card({ id, instanceId: id, title, type: 'defense', value: 2, bonus, fighter: 'beta' });

/**
 * Открытый бой: карта «во время битвы» разыгрывается очередью боя (`shared/cards/run.js`),
 * поэтому противника правило берёт из открытого боя — `COMBAT { player: 'opponent' }`.
 */
const buildState = () => {
  const state = createState({
    phase: PHASES.turn,
    turn: { index: 1, playerId: '0', actionsTotal: 2, actionsLeft: 2 },
  });
  player(state, '0').hand = { visibility: [], cards: [] };
  player(state, '1').hand = {
    visibility: [],
    cards: [enemyCard('enemy_guard', 'Ледяной панцирь', 2), enemyCard('enemy_bite', 'Укус', 1)],
  };
  state.combat = {
    stage: 'reveal',
    attackerPlayerId: '0',
    defenderPlayerId: '1',
    attackerFighterId: 'alpha',
    targetFighterId: 'beta',
    attackCard: mirror,
    defenseCard: null,
    attackValue: 2,
    defenseValue: 0,
    defenseRequired: false,
    defenseReplaced: false,
    effects: [
      {
        order: 1,
        moment: 'duringCombat',
        side: 'attacker',
        cardId: 'mirror_1',
        playerId: '0',
        status: 'pending',
      },
    ],
  };
  return state;
};

/** Разыграть карту: очередь боя доходит до её правила и открывает окно по чужой руке. */
const play = state => advanceCombat(state);

/** Выбрать карту чужой руки: противник её сбрасывает. */
const pick = (state, optionId) =>
  runAction(state, { type: 'PICK', kind: 'option', id: optionId, playerId: '0' });

const handIds = (state, playerId) => hand(player(state, playerId)).map(entry => entry.instanceId);

describe('карта по чужой руке: выбор и сброс', () => {
  it('CARDS отдаёт карты чужой руки с title, optionId и bonus', () => {
    const state = buildState();
    const fact = runFact(state, 'CARDS', { of: '1', zone: 'hand' }, { playerId: '0' });

    expect(fact.ok).toBe(true);
    expect(fact.value).toEqual([
      {
        cardId: 'enemy_guard',
        optionId: 'enemy_guard',
        id: 'enemy_guard',
        title: 'Ледяной панцирь',
        type: 'defense',
        bonus: 2,
        tags: [],
      },
      {
        cardId: 'enemy_bite',
        optionId: 'enemy_bite',
        id: 'enemy_bite',
        title: 'Укус',
        type: 'defense',
        bonus: 1,
        tags: [],
      },
    ]);
    // ключ копии — тот же, чем карта уходит в сброс (`cardKey`): строка, а не объект факта
    expect(fact.value.map(entry => entry.optionId)).toEqual(fact.value.map(entry => entry.cardId));
  });

  it('окно открывается по картам чужой руки и несёт названия', () => {
    const opened = play(buildState());

    expect(opened.targeting).toMatchObject({
      playerId: '0',
      kind: 'options',
      required: true,
      source: 'mirror_1',
    });
    expect(opened.targeting.candidates.map(entry => entry.optionId)).toEqual([
      'enemy_guard',
      'enemy_bite',
    ]);
    // окно показывает игроку чужие карты: по этим полям клиент рисует список выбора
    expect(opened.targeting.candidates.map(entry => entry.title)).toEqual([
      'Ледяной панцирь',
      'Укус',
    ]);
    expect(opened.targeting.candidates.map(entry => entry.bonus)).toEqual([2, 1]);
    expect(opened.targeting.candidates.every(entry => entry.disabled === false)).toBe(true);
    // у обязательного окна общей кнопки отказа нет
    expect(runUi(opened, '0').controls.ok).toMatchObject({ visible: false, enabled: false });
    // бой стоит на паузе: шаг очереди ждёт решения игрока
    expect(opened.combat.effects[0].status).toBe('waiting');
  });

  it('выбор сбрасывает именно выбранную карту, остальные остаются в руке', () => {
    const after = pick(play(buildState()), 'enemy_guard');

    expect(handIds(after, '1')).toEqual(['enemy_bite']);
    expect(after.targeting ?? null).toBeNull();
    expect(after.effect ?? null).toBeNull();
  });

  it('второй вариант сбрасывает другую карту — окно решает, а не порядок в руке', () => {
    const after = pick(play(buildState()), 'enemy_bite');

    expect(handIds(after, '1')).toEqual(['enemy_guard']);
  });

  it('отметка окна отдаётся фактом PICKED: правило читает выбранный optionId', () => {
    const state = SET_TARGETING(play(buildState()), {
      op: 'pick',
      playerId: '0',
      optionId: 'enemy_bite',
    });

    expect(runFact(state, 'PICKED', {}, { playerId: '0' })).toMatchObject({
      ok: true,
      value: ['enemy_bite'],
    });
    expect(runFact(state, 'PICKED', { is: 'enemy_bite' }, { playerId: '0' }).ok).toBe(true);
    expect(runFact(state, 'PICKED', { is: 'enemy_guard' }, { playerId: '0' }).ok).toBe(false);
  });

  it('ключ карты можно взять из объекта факта: cardIds принимает и строку, и элемент CARDS', () => {
    const opened = play(buildState());
    // окно несёт объекты факта (`cardId`, `title`, `bonus`), а не только ключи
    const facts = runFact(opened, 'CARDS', { of: '1', zone: 'hand' }, { playerId: '0' }).value;
    opened.targeting.candidates = facts;

    const after = pick(opened, 'enemy_guard');

    expect(handIds(after, '1')).toEqual(['enemy_bite']);
  });

  it('чужую руку по этому окну видит только тот, кто разыграл карту', () => {
    const state = play(buildState());

    const ownerView = view(state, '0');
    expect(ownerView.targeting.candidates.map(entry => entry.title)).toEqual([
      'Ледяной панцирь',
      'Укус',
    ]);

    // противник (он же владелец карт) видит только, что выбор идёт: названий его руки в проекции нет
    const enemyView = view(state, '1');
    expect(enemyView.targeting).toMatchObject({
      playerId: '0',
      source: 'mirror_1',
      required: true,
    });
    expect(enemyView.targeting.candidates).toBeUndefined();
    expect(JSON.stringify(enemyView)).not.toContain('Ледяной панцирь');
    expect(JSON.stringify(enemyView)).not.toContain('Укус');
  });

  it('вне боя условия «во время битвы» нет: окно не открывается', () => {
    const state = buildState();
    state.combat = null;

    const played = play(state);

    expect(played.targeting ?? null).toBeNull();
    expect(handIds(played, '1')).toEqual(['enemy_guard', 'enemy_bite']);
  });
});
