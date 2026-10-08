import { describe, expect, it } from 'vitest';
import { remainingOf } from '../../../bot/play/counting.js';
import { actionsFor, playDuel } from '../../../bot/play/duel.js';
import { scoreOptions } from '../../../bot/play/qvalue.js';
import {
  determinize,
  leafScore,
  leafScorePlain,
  myTurnOf,
  rolloutEnd,
  rootPriors,
  searchAction,
  searchBudget,
  turnOver,
} from '../../../bot/play/search.js';
import { createState, player } from '../../fixtures/state.js';

/**
 * Поиск с детерминизацией: миры собираются честно (чужая рука из остатка, своя колода перетасована),
 * выбранное действие всегда легально, а бюджет соблюдается. Проверяем на настоящих партиях и на фикстурах.
 */
const firstSearchState = seed => {
  let found = null;
  playDuel({
    seed,
    heroA: 'tesla',
    heroB: 'anubis',
    policy: 'search',
    maxSteps: 6,
    onStep: ({ state, playerId }) => {
      if (found == null) found = { state: structuredClone(state), playerId };
    },
  });
  return found;
};

describe('детерминизация', () => {
  it('чужая рука собирается из остатка, а не из настоящей руки', () => {
    const start = firstSearchState(1);
    expect(start).not.toBeNull();

    const real = start.state;
    const unseen = remainingOf(real, start.playerId).opponents[0];
    const rng = { value: 12345 };
    const world = determinize(real, start.playerId, rng);
    const opponent = world.players.find(p => String(p.id) !== String(start.playerId));

    // размеры зон те же: мир не выдаёт лишних карт
    expect(opponent.hand.cards).toHaveLength(unseen.unseen.handSize);
    expect(opponent.deck.cards).toHaveLength(unseen.unseen.deckSize);
    // и это действительно выборка из остатка
    const pool = new Set(unseen.unseen.pooled.keys());
    for (const card of [...opponent.hand.cards, ...opponent.deck.cards]) {
      expect(pool.has(String(card.id))).toBe(true);
    }
  });

  it('своя колода тасуется: порядок будущих доборов бот не знает', () => {
    const start = firstSearchState(2);
    const real = start.state;
    const before = (
      real.players.find(p => String(p.id) === String(start.playerId))?.deck?.cards ?? []
    ).map(card => String(card.instanceId ?? card.id));
    expect(before.length).toBeGreaterThan(2);

    const orders = new Set();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const world = determinize(real, start.playerId, { value: 1000 + attempt });
      const cards = world.players.find(p => String(p.id) === String(start.playerId)).deck.cards;
      orders.add(cards.map(card => String(card.instanceId ?? card.id)).join(','));
    }
    // хотя бы один порядок отличается от исходного: тасовка работает
    expect([...orders].some(order => order !== before.join(','))).toBe(true);
  });

  it('оценка позиции: терминал — это победа или поражение', () => {
    const state = createState();
    const win = { ...state, hook: 'gameEnd', winner: '0' };
    expect(leafScore(win, '0')).toBe(1);
    expect(leafScore(win, '1')).toBe(-1);
    // в обычной позиции оценка своя и чужая симметричны
    expect(leafScore(state, '0')).toBeCloseTo(-leafScore(state, '1'), 6);
  });
});

describe('выбор действия поиском', () => {
  it('выбирает только предложенное действие и уважает бюджет', () => {
    const start = firstSearchState(3);
    const options = actionsFor(start.state, start.playerId, { policy: 'greedy' });
    const entries = options.map(entry => ({ action: entry.action, weight: entry.weight }));
    const decision = searchAction(start.state, start.playerId, entries, {
      ...searchBudget(),
      iterations: 3,
      depth: 2,
    });

    expect(decision).not.toBeNull();
    expect(decision.iterations).toBeGreaterThan(0);
    expect(decision.iterations).toBeLessThanOrEqual(3);
    expect(entries.map(entry => JSON.stringify(entry.action))).toContain(
      JSON.stringify(decision.action),
    );
  });

  it('единственное действие не тратит доигрывания', () => {
    const start = firstSearchState(4);
    const options = actionsFor(start.state, start.playerId, { policy: 'greedy' });
    const decision = searchAction(start.state, start.playerId, [
      { action: options[0].action, weight: 1 },
    ]);
    expect(decision).toEqual({ action: options[0].action, iterations: 0, rows: [] });
  });

  it('дерево: часть бюджета уходит вглубь ветки, а решение остаётся легальным', () => {
    const start = firstSearchState(6);
    const options = actionsFor(start.state, start.playerId, { policy: 'greedy' });
    const entries = options.map(entry => ({ action: entry.action, weight: entry.weight }));
    const budget = { ...searchBudget(), iterations: 10, depth: 4 };
    const visits = decision => decision.rows.reduce((sum, row) => sum + row.visits, 0);

    const flat = searchAction(start.state, start.playerId, entries, { ...budget, treeDepth: 1 });
    const tree = searchAction(start.state, start.playerId, entries, { ...budget, treeDepth: 2 });

    expect(flat.iterations).toBeGreaterThan(0);
    expect(tree.iterations).toBeGreaterThan(0);
    // в дереве часть доигрываний уходит на узлы внутри ветки, поэтому у корня визитов не больше
    expect(visits(tree)).toBeLessThanOrEqual(visits(flat));
    expect(entries.map(entry => JSON.stringify(entry.action))).toContain(
      JSON.stringify(tree.action),
    );
  });

  /**
   * Доигрывание — не украшение: без него поиск превращается в «дерево плюс оценка листа», и это
   * незаметно. Так уже случилось, когда из вызова роллаута потерялся ГПСЧ: `pickWeighted` падал на
   * первом выборе, исключение глотал `catch`, и поиск тихо играл без роллаутов.
   */
  it('доигрывания не срываются: сорванных роллаутов нет, шаги копятся', () => {
    const start = firstSearchState(8);
    const entries = actionsFor(start.state, start.playerId, { policy: 'greedy' }).map(entry => ({
      action: entry.action,
      weight: entry.weight,
    }));
    const budget = { ...searchBudget(), iterations: 6, depth: 5 };

    const decision = searchAction(start.state, start.playerId, entries, budget);
    expect(decision.broken).toBe(0);

    // доигрывание действительно идёт: без него оценка берётся сразу после дерева
    const end = rolloutEnd(start.state, start.playerId, { ...budget, rng: { value: 3 } });
    expect(end.failed).toBe(false);
    expect(end.steps).toBeGreaterThan(0);
  });

  it('поиск воспроизводим: тот же состояние и бюджет — то же решение', () => {
    const start = firstSearchState(7);
    const options = actionsFor(start.state, start.playerId, { policy: 'greedy' });
    const entries = options.map(entry => ({ action: entry.action, weight: entry.weight }));
    const budget = { ...searchBudget(), iterations: 8, depth: 4 };

    const first = searchAction(start.state, start.playerId, entries, budget);
    const second = searchAction(start.state, start.playerId, entries, budget);
    expect(JSON.stringify(second.action)).toBe(JSON.stringify(first.action));
  });

  it('партия с поиском доходит до конца', () => {
    // поиск на ход дороже жадной политики, поэтому проверяем одну партию и с запасом по времени
    const report = playDuel({
      seed: 1,
      heroA: 'medusa',
      heroB: 'tesla',
      policy: 'search',
      policyB: 'greedy',
    });

    expect(report.status).toBe('finished');
  }, 30000);

  it('лист весами пары: поиск играет по артефакту матчапов и остаётся легальным', () => {
    const start = firstSearchState(9);
    const options = actionsFor(start.state, start.playerId, { policy: 'greedy' });
    const entries = options.map(entry => ({ action: entry.action, weight: entry.weight }));
    const budget = { ...searchBudget(), iterations: 6, depth: 4, evaluation: 'matchup' };

    const decision = searchAction(start.state, start.playerId, entries, budget);
    expect(decision).not.toBeNull();
    expect(entries.map(entry => JSON.stringify(entry.action))).toContain(
      JSON.stringify(decision.action),
    );
  });

  it('поиск не берёт действия с нулевым весом (шаг в никуда остаётся запрещённым)', () => {
    const start = firstSearchState(5);
    const options = actionsFor(start.state, start.playerId, { policy: 'search' });
    // политика `search` оставляет вес только у выбранного действия, все прочие — 0
    expect(options.filter(entry => entry.weight > 0)).toHaveLength(1);
    // и оно есть среди того, что предлагает обычная политика
    const greedy = actionsFor(start.state, start.playerId, { policy: 'greedy' });
    const chosen = options.find(entry => entry.weight > 0).action;
    expect(greedy.map(entry => JSON.stringify(entry.action))).toContain(JSON.stringify(chosen));
  });
  it('фикстура: поиск замечает смертельный удар и выбирает его', () => {
    // ход «начат»: без `_enteredHooks` lifecycle переигрывает начало хода и состояние не то, что в партии
    const state = createState({
      turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
      _enteredHooks: { gameStart: true, turn: true },
    });
    player(state, '0').fighters[0].attackRange = 2;
    player(state, '1').fighters[0].currentHp = 1;
    // защититься нечем: удар действительно смертельный, и это видно только в доигрывании
    player(state, '1').hand.cards = [];
    const options = actionsFor(state, '0', { policy: 'greedy' });
    const entries = options.map(entry => ({ action: entry.action, weight: entry.weight }));
    const decision = searchAction(state, '0', entries, {
      ...searchBudget(),
      iterations: 6,
      depth: 3,
    });
    expect(decision).not.toBeNull();
    expect(decision.action.kind).toBe('card');
  });
});

/**
 * Лист на границе хода (§25, политика `turn`): доигрывание кончается вместе с моим ходом, а с ответом
 * соперника — только когда ход возвращается ко мне. По этим границам поиск и оценивает свой ход.
 */
describe('лист на границе хода', () => {
  const myTurnState = seed => {
    let found = null;
    playDuel({
      seed,
      heroA: 'tesla',
      heroB: 'anubis',
      policy: 'greedy',
      maxSteps: 40,
      onStep: ({ state, playerId }) => {
        if (found == null && myTurnOf(state, playerId)) {
          found = { state: structuredClone(state), playerId: String(playerId) };
        }
      },
    });
    return found;
  };

  it('доигрывание кончается моим ходом, а с ответом — только на моём следующем', () => {
    const start = myTurnState(12);
    expect(start).not.toBeNull();

    const budget = { ...searchBudget(), depth: 30, policy: 'greedy', rng: { value: 5 } };
    const mine = rolloutEnd(start.state, start.playerId, { ...budget, turnEnd: true });
    // лист — уже не мой ход (или партия кончилась)
    expect(mine.state.hook === 'gameEnd' || turnOver(mine.state, start.playerId)).toBe(true);

    const withReply = rolloutEnd(start.state, start.playerId, {
      ...budget,
      depth: 80,
      turnEnd: true,
      replyTurn: true,
    });
    // с ответом доигрывание доходит до момента, когда ход снова мой (или упирается в предел шагов)
    const back = withReply.state.hook === 'gameEnd' || !turnOver(withReply.state, start.playerId);
    expect(back || withReply.steps >= 80).toBe(true);
    expect(withReply.steps).toBeGreaterThanOrEqual(mine.steps);
  });

  it('политика `turn` играет партию до конца', () => {
    const report = playDuel({
      seed: 13,
      heroA: 'medusa',
      heroB: 'tesla',
      policy: 'turn',
      policyB: 'greedy',
    });

    expect(report.status).toBe('finished');
  }, 60000);

  /**
   * Два новых листа §29: с геометрией (`position`) и с оценкой ученика (`qleaf` — он в позиции делает свой
   * лучший ход, то есть считает на шаг вперёд собственными `Q(s, a)`). Обе политики обязаны играть партию
   * целиком: лист зовётся на каждом доигрывании, и ошибка в нём валит поиск молча.
   */
  it('листы `position`, `qleaf` и ученик с пересчётом `qdeep` играют партию до конца', () => {
    for (const policy of ['position', 'qleaf', 'qdeep', 'qthink']) {
      const report = playDuel({
        seed: 14,
        heroA: 'anubis',
        heroB: 'dorothy',
        policy,
        policyB: 'greedy',
      });

      expect(`${policy}:${report.status}`).toBe(`${policy}:finished`);
    }
  }, 180000);
});

/**
 * Предел времени на раздумье. Он режется в двух местах: между доигрываниями (цикл поиска) и **внутри**
 * каждого доигрывания — иначе один длинный роллаут («мой ход плюс ответ») пересиживает бюджет, и лимит
 * держится только на бумаге. Плюс «думать ход целиком» включается только в свой ход: в чужом бою границы
 * моего хода нет, и лист на ней выродился бы в оценку текущей позиции.
 */
describe('бюджет времени на решение', () => {
  const entriesOf = (state, playerId) =>
    actionsFor(state, playerId, { policy: 'greedy' }).map(entry => ({
      action: entry.action,
      weight: entry.weight,
    }));

  it('доигрывание упирается в предел времени, а не в глубину', () => {
    const start = firstSearchState(21);
    const end = rolloutEnd(start.state, start.playerId, {
      ...searchBudget(),
      depth: 100,
      policy: 'greedy',
      rng: { value: 7 },
      deadline: Date.now() - 1, // предел уже прошёл
    });

    expect(end.clock).toBe(true);
    // срезанное временем доигрывание — не срыв: оценка берётся по тому, что успели
    expect(end.failed).toBe(false);
    expect(end.steps).toBe(0);
  });

  it('поиск с бюджетом времени возвращает решение и не срывается', () => {
    const start = firstSearchState(22);
    const entries = entriesOf(start.state, start.playerId);
    const decision = searchAction(start.state, start.playerId, entries, {
      ...searchBudget(),
      iterations: 100000, // лимит снят: решает время
      depth: 30,
      timeMs: 40,
    });

    expect(decision.iterations).toBeGreaterThan(0);
    expect(decision.broken).toBe(0);
    expect(decision.elapsed).toBeLessThan(3000);
    expect(entries.map(entry => JSON.stringify(entry.action))).toContain(
      JSON.stringify(decision.action),
    );
  });

  it('«думать ход целиком» включается только в свой ход', () => {
    // берём состояние именно чужого решения внутри чужой партии: на расстановке `state.turn` ещё нет,
    // а на первом шаге партии действующий игрок может быть защищающимся
    let found = null;
    playDuel({
      seed: 23,
      heroA: 'tesla',
      heroB: 'anubis',
      policy: 'greedy',
      maxSteps: 40,
      onStep: ({ state, playerId }) => {
        if (found == null && myTurnOf(state, playerId)) {
          found = { state: structuredClone(state), playerId: String(playerId) };
        }
      },
    });
    expect(found).not.toBeNull();

    const owner = String(found.state.turn?.playerId);
    const other = String(
      found.state.players.find(player => String(player.id) !== owner)?.id ?? '1',
    );
    const entries = entriesOf(found.state, owner);
    expect(entries.length).toBeGreaterThan(1);
    const budget = { ...searchBudget(), iterations: 4, depth: 6, turnEnd: true, replyTurn: true };

    expect(searchAction(found.state, owner, entries, budget).turnPlan).toBe(true);
    expect(searchAction(found.state, other, entries, budget).turnPlan).toBe(false);
  });
});

/**
 * Приор корня — подсказка о вариантах, а не замена доигрываний (§24): по умолчанию это вес политики,
 * с `priorFrom: 'qvalue'` — оценка обученного ученика (`bot/play/qvalue.js`).
 */
describe('приор корня: вес политики или оценка ученика', () => {
  const start = () => firstSearchState(11);
  const keyOf = entry => JSON.stringify(entry.action);

  it('по весам: сильнейший вариант политики получает сильнейший приор', () => {
    const { state, playerId } = start();
    const entries = actionsFor(state, playerId, { policy: 'greedy' }).map(entry => ({
      action: entry.action,
      weight: entry.weight,
    }));
    const priors = rootPriors(state, playerId, entries, {
      ...searchBudget(),
      priorFrom: 'weights',
    });
    const heaviest = entries.reduce((leader, entry) =>
      entry.weight > leader.weight ? entry : leader,
    );

    expect(priors.size).toBe(entries.length);
    expect(priors.get(keyOf(heaviest))).toBe(Math.max(...priors.values()));
    // логарифм веса: приор неотрицателен
    for (const value of priors.values()) expect(value).toBeGreaterThanOrEqual(0);
  });

  it('по модели: порядок приоров — порядок её оценок, и это лог-вероятности', () => {
    const { state, playerId } = start();
    const entries = actionsFor(state, playerId, { policy: 'greedy' }).map(entry => ({
      action: entry.action,
      weight: entry.weight,
    }));
    const scores = scoreOptions(state, playerId, entries);
    const priors = rootPriors(state, playerId, entries, { ...searchBudget(), priorFrom: 'qvalue' });
    const bestByModel = entries.reduce((leader, entry) =>
      scores.get(keyOf(entry)) > scores.get(keyOf(leader)) ? entry : leader,
    );

    expect(priors.get(keyOf(bestByModel))).toBe(Math.max(...priors.values()));
    for (const value of priors.values()) expect(value).toBeLessThanOrEqual(0);
  });

  it('партия с приором от ученика доходит до конца и остаётся легальной', () => {
    // поиск на ход дороже жадной политики, поэтому проверяем одну партию и с запасом по времени
    const report = playDuel({
      seed: 3,
      heroA: 'medusa',
      heroB: 'tesla',
      policy: 'qprior',
      policyB: 'greedy',
    });

    expect(report.status).toBe('finished');
  }, 30000);
});

/**
 * Лист поиска §21: ресурс героя из пака, помощники отдельно от героя и покой — но покой только у тех
 * героев, чьи правила его требуют (`bot/play/axes.js`). Прежняя формула осталась эталоном `leafScorePlain`.
 */
describe('лист поиска: ресурс, помощники и покой', () => {
  const stateOf = heroId => {
    const state = createState({
      turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
      _enteredHooks: { gameStart: true, turn: true },
    });
    player(state, '0').heroId = heroId;
    return state;
  };

  const setCoils = (state, active, inactive) => {
    player(state, '0').items = [
      ...Array.from({ length: active }, (_, index) => ({
        id: `coil_a${index}`,
        group: 'coil',
        state: 'active',
      })),
      ...Array.from({ length: inactive }, (_, index) => ({
        id: `coil_i${index}`,
        group: 'coil',
        state: 'inactive',
      })),
    ];
  };

  it('заряженные катушки повышают оценку, разряженные — нет', () => {
    const idle = stateOf('tesla');
    const charged = stateOf('tesla');
    setCoils(charged, 2, 0);
    setCoils(idle, 0, 2);

    expect(leafScore(charged, '0')).toBeGreaterThan(leafScore(idle, '0'));
    // прежняя формула ресурса не знает вовсе — это и есть вклад §21
    expect(leafScorePlain(charged, '0')).toBe(leafScorePlain(idle, '0'));
  });

  it('помощники считаются отдельно от героя', () => {
    const state = stateOf('ifrit');
    const before = leafScore(state, '0');
    player(state, '0').fighters.find(fighter => fighter.type === 'assistant').currentHp = 1;
    expect(leafScore(state, '0')).toBeLessThan(before);
  });

  it('покой ценится только у героя, чьи карты его требуют', () => {
    const anubis = stateOf('anubis');
    const anubisIdle = leafScore(anubis, '0');
    player(anubis, '0').fighters[0].movedThisTurn = true;
    expect(leafScore(anubis, '0')).toBeLessThan(anubisIdle);

    // Тесла к покою равнодушна: её правила `movedThisTurn` не читают
    const tesla = stateOf('tesla');
    const teslaIdle = leafScore(tesla, '0');
    player(tesla, '0').fighters[0].movedThisTurn = true;
    expect(leafScore(tesla, '0')).toBe(teslaIdle);
  });
});
