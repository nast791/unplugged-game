import { runAction } from '#shared/publicApi.js';
import { cellDistances } from './actionFeatures.js';
import { stillnessWeight } from './axes.js';
import { unseenOf } from './counting.js';
import { actorOf, actionsFor, nextRandom, pickWeighted, proposalPolicy } from './decide.js';
import { cardById } from './pool.js';
import { resourceOf, resourceProgress, resourceReady } from './resources.js';
import { defaultWeights, scoreOf, stillHero } from './value.js';
import { pairScore } from './matchups.js';
import { SELECTION_TEMPERATURE, scoreOptions } from './qvalue.js';
import trainedWeights from './value-weights.js';

/**
 * Поиск по дереву с детерминизацией (SO-ISMCTS): бот доигрывает партию в нескольких **возможных мирах**
 * и выбирает ход по их исходам. Три части:
 *
 * 1. **Мир** (`worldFactory`) — чужая рука и обе нераскрытые колоды пересобираются из остатка
 *    (`bot/play/counting.js`), порядок своей колоды тасуется: своих будущих доборов бот не знает. Мир собирается
 *    лениво — поверх настоящего состояния подменяются только скрытые зоны, глубокой копии нет.
 * 2. **Дерево** — от корня вниз по UCT: узел хранит только действие, визиты и сумму (состояние не
 *    хранится, путь проигрывается заново). Свои узлы максимизируют, чужие минимизируют: это минимакс по
 *    ответам соперника вместо простого роллаута.
 * 3. **Лист** — роллаут жадной политикой до победы или до предела глубины, затем оценка (`leafScore`).
 *
 * Нетерпение к затяжке: выигрышные исходы дисконтируются по числу сделанных ходов (`gamma`), поэтому
 * «победить побыстрее» выгоднее, чем тянуть; проигрышные — нет, иначе бот тянул бы поражение.
 */
const shuffle = (list, rng) => {
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(nextRandom(rng) * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
};

/** Свой ГПСЧ поиска выводится из состояния: повтор партии по сиду даёт тот же поиск. */
const rngOf = state => ({
  value:
    (Number(state.rng?.value ?? 1) ^
      (Number(state.turn?.index ?? 0) * 2246822519) ^
      (Number(state.round ?? 0) * 3266489917)) >>>
    0,
});

const zoneCards = zone => zone?.cards ?? [];

const playerIdOf = player => String(player?.id ?? '');

/**
 * Фабрика возможных миров глазами `viewerId`. Остаток считается один раз по настоящему состоянию, а
 * каждый мир — это **поверхностная** копия с новыми объектами зон: глубокая копия на каждое доигрывание
 * стоила дороже самого поиска.
 */
export const worldFactory = (state, viewerId) => {
  const viewerKey = String(viewerId);
  const ownDeck = [...zoneCards(state.players?.find(p => playerIdOf(p) === viewerKey)?.deck)];
  const others = (state.players ?? [])
    .filter(player => playerIdOf(player) !== viewerKey)
    .map(player => ({
      id: playerIdOf(player),
      unseen: unseenOf(state, player.heroId, viewerId),
    }));

  return rng => {
    let sequence = 0;
    const take = pool => {
      const cardId = pool.shift();
      const card = cardId == null ? null : cardById(cardId);
      // номер копии уникален в мире: движок различает карты по `instanceId`
      return card == null ? null : { ...card, instanceId: `${cardId}_w${sequence++}` };
    };

    const players = (state.players ?? []).map(player => {
      if (playerIdOf(player) === viewerKey) {
        return { ...player, deck: { ...player.deck, cards: shuffle([...ownDeck], rng) } };
      }
      const known = others.find(entry => entry.id === playerIdOf(player));
      if (!known) return player;

      const pool = [];
      for (const [cardId, copies] of known.unseen.pooled) {
        for (let copy = 0; copy < copies; copy += 1) pool.push(cardId);
      }
      shuffle(pool, rng);
      return {
        ...player,
        hand: {
          ...player.hand,
          cards: Array.from({ length: known.unseen.handSize }, () => take(pool)).filter(Boolean),
        },
        deck: {
          ...player.deck,
          cards: Array.from({ length: known.unseen.deckSize }, () => take(pool)).filter(Boolean),
        },
      };
    });

    return { ...state, players };
  };
};

/** Один мир — для тестов и отладки: та же сборка, что и в поиске. */
export const determinize = (state, viewerId, rng) => worldFactory(state, viewerId)(rng);

const hpSum = player =>
  (player?.fighters ?? []).reduce(
    (sum, fighter) => sum + Math.max(0, Number(fighter.currentHp) || 0),
    0,
  );

const heroHp = player =>
  (player?.fighters ?? [])
    .filter(fighter => fighter.type === 'hero')
    .reduce((sum, fighter) => sum + Math.max(0, Number(fighter.currentHp) || 0), 0);

const clamp = value => Math.max(-0.95, Math.min(0.95, value));

/** Герой игрока, если он жив: позиционные признаки считаются вокруг него, а не вокруг абстракции. */
const heroOfPlayer = player =>
  (player?.fighters ?? []).find(
    fighter => fighter.type === 'hero' && Number(fighter.currentHp) > 0,
  ) ?? null;

const attackersOf = (state, target, attackers) => {
  if (target?.currentPosition == null) return 0;
  const distances = cellDistances(state, target.currentPosition);
  return attackers.filter(enemy => {
    if (enemy.currentPosition == null || Number(enemy.currentHp) <= 0) return false;
    const distance = distances.get(String(enemy.currentPosition));
    return distance != null && distance <= (Number(enemy.attackRange) || 1);
  }).length;
};

/** Прикрытие: свои бойцы в одном шаге от героя (щит из помощников вокруг того, кого берегут). */
const supportOf = (state, hero, allies) => {
  if (hero?.currentPosition == null) return 0;
  const distances = cellDistances(state, hero.currentPosition);
  return allies.filter(ally => {
    if (ally.currentPosition == null || Number(ally.currentHp) <= 0) return false;
    if (String(ally.id) === String(hero.id)) return false;
    const distance = distances.get(String(ally.currentPosition));
    return distance != null && distance <= 2;
  }).length;
};

/**
 * Геометрия позиции — то, чего у листа не было вовсе (§29). Замер показал, что оракул **сам себе**
 * противоречит на решениях-клетках (56% согласия двух прогонов на одной позиции, и рост бюджета до 96
 * доигрываний не помогает), потому что `leafScore` видит здоровье, колоду и ресурс, но не позиции:
 * два разных шага дают одинаковый лист. Здесь появляется то, что владелец назвал «картой угрозы»:
 * сколько чужих бойцов достаёт моего героя, сколько моих достаёт чужого и сколько своих прикрывает
 * своего героя. Всё — глазами `viewerId`, вклад небольшой: это добавка к здоровью, а не замена ему.
 */
const positionScore = (state, viewerId) => {
  const players = state.players ?? [];
  const key = String(viewerId);
  const mine = players.find(player => playerIdOf(player) === key) ?? null;
  const others = players.filter(player => playerIdOf(player) !== key);
  const live = player =>
    (player?.fighters ?? []).filter(
      fighter => Number(fighter.currentHp) > 0 && fighter.currentPosition != null,
    );

  const myHero = heroOfPlayer(mine);
  const foeHeroes = others.map(heroOfPlayer).filter(Boolean);
  if (myHero == null && foeHeroes.length === 0) return 0;

  const myFighters = live(mine);
  const foeFighters = others.flatMap(player => live(player));
  const myThreat = attackersOf(state, myHero, foeFighters) / 3;
  const foeThreat =
    (foeHeroes.length === 0
      ? 0
      : Math.max(...foeHeroes.map(hero => attackersOf(state, hero, myFighters)))) / 3;
  const mySupport = supportOf(state, myHero, myFighters) / 3;
  const foeSupport =
    (foeHeroes.length === 0
      ? 0
      : Math.max(...foeHeroes.map(hero => supportOf(state, hero, foeFighters)))) / 3;

  // угроза герою весит больше прикрытия: подставленный помощник полезен, но не равен спасённому здоровью
  return (foeThreat - myThreat) * 0.25 + (mySupport - foeSupport) * 0.1;
};

/** Сумма признаков позиции без обрезки — чтобы позиционная добавка не терялась в `clamp`. */
const leafRaw = (mine, others) => {
  const sum = pick => others.reduce((total, player) => total + pick(player), 0);
  const deck = player => zoneCards(player?.deck).length;
  const thin = player => Math.max(0, 5 - deck(player));
  const assistants = player =>
    (player?.fighters ?? [])
      .filter(fighter => fighter.type === 'assistant')
      .reduce((total, fighter) => total + Math.max(0, Number(fighter.currentHp) || 0), 0);
  const progress = player => resourceProgress(resourceOf(player));
  const ready = player => resourceReady(resourceOf(player));
  const still = player => (stillHero(player) ? 1 : 0);
  const stillness = stillnessWeight(mine?.heroId);

  return (
    (heroHp(mine) - sum(heroHp)) / 8 +
    (hpSum(mine) - sum(hpSum)) / 24 +
    (deck(mine) - sum(deck)) * 0.02 +
    (sum(thin) - thin(mine)) * 0.05 +
    (progress(mine) - sum(progress)) * 0.15 +
    (ready(mine) - sum(ready)) * 0.2 +
    (assistants(mine) - sum(assistants)) / 24 +
    (still(mine) - sum(still)) * stillness
  );
};

/**
 * Оценка позиции глазами `viewerId`: терминал — победа или поражение, иначе здоровье героя (оно решает
 * партию), суммарное здоровье команды и запас колоды с наказанием за тонкую (истощение стоит 2 здоровья
 * за карту). Топливо считается по колоде, а не по руке: иначе добор выглядит выгодой и бот крутит колоду.
 *
 * С §21 сюда же входит **ресурс героя из пака** (`bot/play/resources.js`: катушки, осколки, пелена),
 * помощники отдельно от героя и покой — но только у тех героев, чьи правила читают `movedThisTurn`
 * (`bot/play/axes.js`): шаг ломает условие их карт, и для них он не нейтрален.
 */
export const leafScore = (state, viewerId) => {
  if (state.hook === 'gameEnd') return String(state.winner) === String(viewerId) ? 1 : -1;

  const players = state.players ?? [];
  const key = String(viewerId);
  const mine = players.find(player => playerIdOf(player) === key) ?? null;
  const others = players.filter(player => playerIdOf(player) !== key);

  return clamp(leafRaw(mine, others));
};

/**
 * Та же оценка плюс **геометрия** (§29): `SEARCH_EVAL=position` включает её в поиске и в оракуле. Нужна
 * потому, что без неё лист не различает шаги, и цель обучения по клеткам оказывается шумом.
 */
export const leafScorePosition = (state, viewerId) => {
  if (state.hook === 'gameEnd') return String(state.winner) === String(viewerId) ? 1 : -1;

  const players = state.players ?? [];
  const key = String(viewerId);
  const mine = players.find(player => playerIdOf(player) === key) ?? null;
  const others = players.filter(player => playerIdOf(player) !== key);

  return clamp(leafRaw(mine, others) + positionScore(state, viewerId));
};

/**
 * Прежняя формула §16 — без ресурса, помощников и покоя. Осталась эталоном: замер §21 сравнивает
 * `search` (новая оценка) с `plain` (эта), чтобы видеть вклад именно этих трёх признаков.
 */
export const leafScorePlain = (state, viewerId) => {
  if (state.hook === 'gameEnd') return String(state.winner) === String(viewerId) ? 1 : -1;

  const players = state.players ?? [];
  const key = String(viewerId);
  const mine = players.find(player => playerIdOf(player) === key) ?? null;
  const others = players.filter(player => playerIdOf(player) !== key);
  const sum = pick => others.reduce((total, player) => total + pick(player), 0);
  const deck = player => zoneCards(player?.deck).length;
  const thin = player => Math.max(0, 5 - deck(player));

  const raw =
    (heroHp(mine) - sum(heroHp)) / 8 +
    (hpSum(mine) - sum(hpSum)) / 24 +
    (deck(mine) - sum(deck)) * 0.02 +
    (sum(thin) - thin(mine)) * 0.05;

  return Math.max(-0.95, Math.min(0.95, raw));
};

/** Идёт мой ход: окна внутри него (защита соперника, мои цели) ход не заканчивают. */
export const myTurnOf = (state, viewerId) =>
  state.hook !== 'gameEnd' && String(state.turn?.playerId) === String(viewerId);

/** Мой ход кончился: партия закончилась или активен уже другой игрок. */
export const turnOver = (state, viewerId) =>
  state.hook === 'gameEnd' || String(state.turn?.playerId) !== String(viewerId);

/**
 * Доигрывание мира роллаутом: агрессивной политикой до победы, до предела шагов или до **границы
 * хода**. Обычный лист — позиция на пределе глубины; с `turnEnd` лист — конец моего хода, а с
 * `replyTurn` — ещё и после ответа соперника. Тогда поиск оценивает не «этот ход», а весь ход целиком:
 * чем он закончится и чем ответит соперник. Это та же мысль, что у планировщика цепочек
 * (`bot/play/plan.js`), но статистику копит UCT, а не одно доигрывание на цепочку.
 *
 * Возвращает состояние, на котором ставится оценка, число сделанных шагов (по нему считается
 * нетерпение) и два признака остановки: `failed` — доигрывание сорвалось на перечислении или на
 * действии, `clock` — его срезал предел времени. Сорванный роллаут — это не «нейтральная оценка», а
 * дырка в поиске: раньше исключение здесь молча съедалось, и поиск играл вовсе без доигрываний
 * (нашлось замером, а не код-ревью). Поэтому счёт таких срывов возвращается наружу и проверяется тестом.
 */
export const rolloutEnd = (state, viewerId, budget) => {
  const { depth, rng, policy, turnEnd = false, replyTurn = false, deadline = 0 } = budget;
  const enumerate = (current, actor) => actionsFor(current, actor, { policy });
  let current = state;
  let steps = 0;
  let why = 'depth';
  let failed = false;
  // доигрывание срезано пределом времени (это не срыв: оценка берётся по тому, что успели)
  let clock = false;
  // 0 — доигрываем мой ход, 1 — доигрываем ответ соперника, 2 — считать оценку (и -1 — обычный режим)
  let stage = turnEnd ? 0 : -1;
  if (stage === 0 && turnOver(current, viewerId)) stage = replyTurn ? 1 : 2;

  for (; steps < depth; steps += 1) {
    // Предел времени режется и **внутри** доигрывания: иначе один длинный роллаут (мой ход плюс ответ)
    // пересиживает бюджет, и «лимит на раздумье» держится только между роллаутами.
    if (deadline > 0 && Date.now() >= deadline) {
      why = 'время';
      clock = true;
      break;
    }
    if (current.hook === 'gameEnd') {
      why = 'gameEnd';
      break;
    }
    if (stage === 0 && turnOver(current, viewerId)) stage = replyTurn ? 1 : 2;
    if (stage === 1 && !turnOver(current, viewerId)) stage = 2;
    if (stage === 2) {
      why = 'stage';
      break;
    }

    const actor = actorOf(current);
    if (actor == null) {
      why = 'нет действующего';
      break;
    }

    let options;
    try {
      options = enumerate(current, actor);
    } catch (error) {
      why = `перечисление: ${error instanceof Error ? error.message : String(error)}`;
      failed = true;
      break;
    }
    if (options.length === 0) {
      why = 'пустой список';
      break;
    }

    try {
      current = runAction(current, { ...pickWeighted(rng, options), playerId: actor });
    } catch (error) {
      why = `действие: ${error instanceof Error ? error.message : String(error)}`;
      failed = true;
      if (env.DEBUG_ROLLOUT) {
        console.log(`  сорванный роллаут: ${why} (${steps} шагов)`);
        console.log(error instanceof Error ? error.stack : '');
      }
      break;
    }
  }

  if (env.DEBUG_ROLLOUT) {
    console.log(
      `rollout: depth ${depth} шагов ${steps} (${why}) hook ${current.hook} ход за ${String(
        current.turn?.playerId,
      )}`,
    );
  }

  return { state: current, steps, failed, clock };
};

/** Оценка доигранного мира: то же, что `rolloutScore` до выделения `rolloutEnd`. */
const rolloutScore = (state, viewerId, budget) => {
  const { state: end, steps, failed, clock } = rolloutEnd(state, viewerId, budget);
  return { score: budget.evaluation(end, viewerId), steps, failed, clock };
};

const keyOf = action => JSON.stringify(action);

/**
 * Отпечаток позиции: всё **открытое** — чей ход и сколько действий осталось, бойцы с позициями и
 * здоровьем, зоны (рука, колода, сброс), счётчик хода. Нужен, чтобы увидеть варианты корня, ведущие в
 * **одно и то же** состояние: у Медузы три гарпии в одной области дают одинаковый шаг, и такая пара
 * вариантов только дробит статистику между двумя записями вместо одной (§53).
 */
const stateFingerprint = state =>
  JSON.stringify({
    hook: state.hook,
    turn: [state.turn?.playerId, state.turn?.actionsLeft, state.turn?.index],
    combat: [state.combat?.stage, state.combat?.attackerFighterId, state.combat?.targetFighterId],
    movement: [state.movement?.playerId ?? null, state.movement?.moves?.length ?? 0],
    targeting: [state.targeting?.playerId ?? null, state.targeting?.picked ?? null],
    fighters: (state.players ?? []).map(player =>
      (player.fighters ?? []).map(fighter => [
        fighter.id,
        fighter.currentPosition,
        fighter.currentHp,
      ]),
    ),
    zones: (state.players ?? []).map(player => [
      player.hand?.cards?.length ?? 0,
      player.deck?.cards?.length ?? 0,
      player.discard?.cards?.length ?? 0,
    ]),
  });

/**
 * **Схлопывание одинаковых вариантов** (§53): если два предложенных хода приводят к одному состоянию
 * (например, ход одной из трёх одинаковых гарпий на ту же клетку), по последствиям они неразличимы, и
 * два узла корня только делят между собой визиты. Оставляем первый по порядку предлагателя, остальные
 * получают ноль доигрываний — их число возвращается наружу (`deduped`).
 */
const dedupeCandidates = (state, viewerId, candidates) => {
  const seen = new Set();
  const kept = [];
  let deduped = 0;
  for (const entry of candidates) {
    let after;
    try {
      after = runAction(state, { ...entry.action, playerId: viewerId });
    } catch {
      kept.push(entry);
      continue;
    }
    const key = stateFingerprint(after);
    if (seen.has(key)) {
      deduped += 1;
      continue;
    }
    seen.add(key);
    kept.push(entry);
  }
  return { kept, deduped };
};

/**
 * Переменные среды читаются через `typeof`: этот модуль попадает и в браузер (`bot/play/ai.js` → режим
 * `vs_ai`), где `process` нет вовсе. В браузере бюджеты остаются умолчаниями, в Node работают флаги.
 */
const env = typeof process === 'undefined' ? {} : (process.env ?? {});

const envNumber = name => {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Коэффициент приора корня: сколько «весит» мнение модели рядом с оценкой доигрываний (`SEARCH_PRIOR`).
 * Отдельно от `prior` (коэффициента весов политики) — это разные сигналы и мерятся они порознь.
 */
const envPriorMix = () => {
  const value = Number(env.SEARCH_PRIOR_MIX);
  return Number.isFinite(value) && value >= 0 && env.SEARCH_PRIOR_MIX != null ? value : null;
};

/** Уверенность приора: насколько быстро он перестаёт спорить с доигрываниями (`SEARCH_PRIOR_TAU`). */
const envPriorTau = () => {
  const value = Number(env.SEARCH_PRIOR_TAU);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Бюджет поиска: снаружи настраивается переменными среды, чтобы замеры шли без правок кода. */
export const searchBudget = () => {
  // Бюджет времени главнее лимита доигрываний: если время просили, лимит снимается — иначе он сработает
  // раньше срока (32 доигрывания это ~50 мс, а не секунда) и «бюджет времени» окажется фикцией. Явно
  // заданный `SEARCH_ITERATIONS` по-прежнему сильнее всего.
  const timeMs = envNumber('SEARCH_TIME') ?? 0;

  return {
    iterations: envNumber('SEARCH_ITERATIONS') ?? (timeMs > 0 ? 100000 : 32),
    depth: envNumber('SEARCH_DEPTH') ?? 10,
    // глубина дерева: 1 — плоский поиск по действиям корня, больше — с ответами соперника внутри ветки
    treeDepth: envNumber('SEARCH_TREE_DEPTH') ?? 3,
    timeMs,
    // доигрывание идёт агрессивной политикой: с осторожной роллаут считает размен невыгодным, бот откладывает
    // его и партия тянется до истощения — колода тут единственные часы (замер: 24 партии, 13 до конца и 292 с
    // против 24 из 24 и 12 с)
    policy: env.SEARCH_ROLLOUT ?? 'aggressive',
    exploration: envNumber('SEARCH_EXPLORATION') ?? 1.4,
    // приоритет политики при равных средних: иначе поиск, которому всё равно, выбирает «не проиграть»
    prior: Number(env.SEARCH_PRIOR ?? 0.02),
    // откуда берётся приор: `weights` — вес варианта у политики, `qvalue` — оценка ученика (`rootPriors`)
    priorSource: env.SEARCH_PRIOR_FROM ?? 'weights',
    /**
     * **Модель как приор решения** (`SEARCH_PRIOR_MIX`): во сколько раз мнение модели весомее оценки
     * доигрываний у корня; ноль — модель в решении не участвует (прежнее поведение, эталон замеров).
     * `prior_mix · p_a / (visits + τ)` — приор спорит с доигрыванием только пока визитов мало, то есть
     * ровно там, где бюджет времени не успел собрать статистику: 30 мс — это ~35 доигрываний на решение
     * (5–7 на вариант корня, замер `.workbuddy/prior-probe.mjs`), и средние по ним — шум.
     */
    priorMix: envPriorMix() ?? 0.8,
    priorTau: envPriorTau() ?? 4,
    /**
     * **Сколько вариантов корня считать** (`SEARCH_TOP`, 0 — все): модель отбирает верхушку по своему
     * мнению, поиск тратит на неё все доигрывания, а не размазывает бюджет по всем вариантам списка.
     * Это другое применение модели, чем приор: не «подсказать порядок», а **сузить перебор** — при
     * бюджете 30 мс доигрываний хватает единицам вариантов, и выбор «на что их потратить» решает исход.
     */
    top: Number(env.SEARCH_TOP ?? 0),
    /**
     * **Парная переоценка корня** (`SEARCH_PAIRED`, §52): доигрываний на вариант, которые после основного
     * поиска оценивают **все раскрытые варианты в одних и тех же мирах** (`pairedRootValues`). Ноль —
     * выключено (прежнее поведение). Зачем: замер сходимости показал, что при 200 мс (~35 доигрываний)
     * поиск играет на четверть иначе, чем тот же поиск с 96 мирами, — выбор дрожит от того, какие миры
     * попались варианту. Парная оценка вычитает общий шум миров: разница между вариантами перестаёт тонуть
     * в разнице чужих рук. Это тот же приём, которым пользуется оракул в обучении (§46), но здесь он
     * уточняет решение, а не метку.
     */
    paired: envNumber('SEARCH_PAIRED') ?? 0,
    // доля веса парной оценки в итоговом решении корня: 1 — только парная, 0 — только средние UCT
    pairedMix: Number(env.SEARCH_PAIRED_MIX ?? 1),
    /**
     * **Схлопывание одинаковых вариантов** (`SEARCH_DEDUP=1`, §53): варианты, ведущие в одно состояние,
     * получают один узел корня вместо нескольких. Это не ускорение ради скорости, а честная статистика:
     * копии делили визиты и искажали UCT (см. замер ошибки в `searchAction`).
     */
    dedup: env.SEARCH_DEDUP === '1',
    /**
     * **Пул миров** (`SEARCH_WORLD_POOL`, §54): сколько миров набирать на решение. Ноль/единица —
     * прежнее поведение: новое доигрывание — новый мир. Больше — миры берутся по кругу из пула, и на
     * каждый мир приходится много доигрываний. Замер §52 показал, что при 200 мс поиск **не сходится**
     * (ответ при 24 мирах совпадает с ответом при 96 лишь в 71%): разброс между вариантами тонет в
     * разнице миров. Пул уменьшает эту разницу, не подменяя статистику: каждое доигрывание свежее, ГПСЧ
     * тратится как обычно, меняется только выбор мира — в отличие от кэша оценок (§53), который врал.
     */
    worldPool: envNumber('SEARCH_WORLD_POOL') ?? 0, // нетерпение: выигрышные исходы дисконтируются по числу ходов, проигрышные — нет
    gamma: Number(env.SEARCH_GAMMA ?? '0.995'),
    // оценка листа: ручная формула или обученная модель (`bot/play/value.js`)
    evaluation: env.SEARCH_EVAL ?? 'heuristic',
    // лист на границе хода: доигрывать мой ход до конца (`turnEnd`) и ответ соперника (`replyTurn`) —
    // так поиск думает ход целиком, а не первые `depth` шагов (политика `turn`, §25)
    turnEnd: env.SEARCH_TURN_END === '1',
    replyTurn: env.SEARCH_TURN_REPLY === '1',
    // каким артефактом считает ученик (`bot/play/qvalue.js`): лист `qvalue` и приор корня `qprior`
    // читают его, поэтому в матче «версия против версии» артефакт обязан быть у каждой стороны свой
    artifact: env.SEARCH_ARTIFACT ?? null,
  };
};

/**
 * Лист глазами **ученика** (`SEARCH_EVAL=qvalue`, политика `qleaf`): он оценивает не абстрактную позицию,
 * а свой лучший ход в ней — то есть делает один шаг пересчёта вперёд **собственными** оценками
 * (`Q(s, a)` из `bot/play/qvalue.js`). Это и есть «ученик считает вперёд»: раньше он умел только
 * подсказывать корень (`qprior`), а сам оставался оценкой одного действия.
 *
 * Берётся мягкий максимум по вариантам с той же температурой, что у выбора ученика: не «лучший ход», а
 * «чем это кончится, если он сыграет здесь». Нет вариантов или артефакта — падаем на ручную формулу,
 * чтобы поиск не зависел от наличия модели.
 */
const qvalueLeaf = (state, viewerId, artifact = null) => {
  let options = [];
  try {
    // перечисление — предлагателем рантайма (`proposalPolicy`): лист ученика обязан смотреть на тот же
    // список вариантов, каким играет рантайм, иначе он оценивает не ту игру
    options = actionsFor(state, viewerId, {
      policy: proposalPolicy('qvalue'),
      artifact,
    }).filter(entry => Number(entry.weight) > 0);
  } catch {
    return leafScore(state, viewerId);
  }
  if (options.length === 0) return leafScore(state, viewerId);

  const scores = scoreOptions(state, viewerId, options, { artifact });
  if (scores == null) return leafScore(state, viewerId);

  const values = options.map(entry => scores.get(keyOf(entry.action)) ?? 0);
  const best = Math.max(...values);
  const exp = values.map(value => Math.exp((value - best) / Math.max(0.05, SELECTION_TEMPERATURE)));
  const total = exp.reduce((sum, value) => sum + value, 0) || 1;
  const expected = values.reduce((sum, value, index) => sum + value * (exp[index] / total), 0);

  return clamp(expected);
};

/** Оценка листа: ручная формула (`leafScore`), она же с геометрией (`position`), оценки ученика (`qvalue`), линейная модель или её проекция. */
const evaluate = (state, viewerId, budget) => {
  if (budget.evaluation === 'net') return scoreOf(state, viewerId, trainedWeights);
  if (budget.evaluation === 'matchup') {
    // веса пары из артефакта (`bot/play/matchups.js`); пары нет — считаем ручной формулой, а не догадкой
    return pairScore(state, viewerId) ?? leafScore(state, viewerId);
  }
  if (budget.evaluation === 'plain') return leafScorePlain(state, viewerId);
  if (budget.evaluation === 'position') return leafScorePosition(state, viewerId);
  if (budget.evaluation === 'qvalue') return qvalueLeaf(state, viewerId, budget.artifact ?? null);
  return leafScore(state, viewerId);
};

/**
 * **Парная** оценка вариантов корня: все варианты оцениваются в **одних и тех же** мирах, по одному
 * доигрыванию на вариант в каждом мире.
 *
 * Зачем это понадобилось (§29). Оракул не различал клетки: два прогона на одной позиции давали согласие
 * 56%, и рост бюджета до 96 доигрываний не помогал. Причина не в листе — с геометрией в листе доля
 * одинаковых оценок упала с 44% до 16%, а согласие осталось 55% — а в том, что `searchAction` тратит
 * итерацию на **один** вариант в **своём** мире: вариант A видит миры {1,5,9}, вариант B — {2,3,4}.
 * Разница между вариантами тонет в разнице между чужими руками. Если же каждый мир оценивает **все**
 * варианты сразу, разброс от чужих карт вычитается, и «какая из двух соседних клеток лучше» становится
 * измеримым — сравнение парное, а не по средним из разных выборок.
 *
 * `iterations` здесь — число **миров** (в каждом оцениваются все варианты), поэтому решение стоит
 * `iterations × вариантов` доигрываний: для оракула это дороже, но клеток в дневнике единицы процентов.
 */
export const pairedRootValues = (state, viewerId, entries, rawBudget = searchBudget()) => {
  const candidates = (entries ?? []).filter(entry => entry?.action != null);
  if (candidates.length === 0) return null;

  // как и в `searchAction`: лист на границе хода имеет смысл только в свой ход (в чужом бою границы нет)
  const budget =
    rawBudget.turnEnd && !myTurnOf(state, viewerId)
      ? { ...rawBudget, turnEnd: false, replyTurn: false }
      : rawBudget;

  const rng = rngOf(state);
  const makeWorld = worldFactory(state, viewerId);
  const started = Date.now();
  const deadline = budget.timeMs > 0 ? started + budget.timeMs : 0;
  const evaluation = (current, viewer) => evaluate(current, viewer, budget);
  const rows = candidates.map(entry => ({
    key: keyOf(entry.action),
    action: entry.action,
    visits: 0,
    total: 0,
  }));
  let rounds = 0;
  let broken = 0;
  let timedOut = 0;

  for (let round = 0; round < budget.iterations; round += 1) {
    if (deadline > 0 && Date.now() >= deadline) break;
    const world = makeWorld(rng);
    let counted = 0;

    for (const row of rows) {
      let after;
      try {
        after = runAction(world, { ...row.action, playerId: viewerId });
      } catch {
        broken += 1;
        continue;
      }
      const { score, steps, failed, clock } = rolloutScore(after, viewerId, {
        ...budget,
        deadline,
        rng,
        evaluation,
      });
      if (failed) broken += 1;
      if (clock) timedOut += 1;
      // нетерпение — как в `searchAction`: быстрый выигрыш дороже медленного, проигрыш не дисконтируется
      row.total += score > 0 ? score * budget.gamma ** steps : score;
      row.visits += 1;
      counted += 1;
    }

    if (counted === 0) break;
    rounds += 1;
  }

  const scored = rows.map(row => ({
    key: row.key,
    action: row.action,
    visits: row.visits,
    mean: row.visits === 0 ? 0 : row.total / row.visits,
  }));
  const best = scored.reduce(
    (leader, row) => (leader == null || row.mean > leader.mean ? row : leader),
    null,
  );

  return {
    action: best?.action ?? null,
    iterations: rounds,
    broken,
    timedOut,
    elapsed: Date.now() - started,
    rows: scored,
  };
};

/**
 * Приор корня: подсказка «какой вариант вероятнее» — она входит и в выбор ребёнка по UCB, и в итоговое
 * решение, но **не заменяет** доигрывания: оценка по-прежнему приходит из роллаутов.
 *
 * - `weights` (по умолчанию) — вес варианта у политики (`log1p`): «жадная политика считает его важнее»;
 * - `qvalue` — оценка **ученика** (`bot/play/qvalue.js`): её числа переводятся в лог-вероятности тем же
 *   softmax с температурой выбора, каким играет сам ученик, — то есть поиск получает ровно то мнение о
 *   вариантах, которое ученик выразил бы без поиска, и проверяет его доигрываниями.
 *
 * Артефакта нет (`scoreOptions` вернул `null`) — приор считается по весам: политика не должна падать
 * из-за отсутствия модели.
 */
export const rootPriors = (state, viewerId, candidates, budget = searchBudget()) => {
  const byWeights = () =>
    new Map(
      candidates.map(entry => [
        keyOf(entry.action),
        budget.prior * Math.log1p(Math.max(0, Number(entry.weight) || 0)),
      ]),
    );

  if (budget.priorSource !== 'qvalue') return byWeights();

  const scores = scoreOptions(state, viewerId, candidates, { artifact: budget.artifact ?? null });
  if (scores == null) return byWeights();

  const values = candidates.map(entry => scores.get(keyOf(entry.action)) ?? 0);
  const best = Math.max(...values);
  const exp = values.map(value => Math.exp((value - best) / Math.max(0.05, SELECTION_TEMPERATURE)));
  const total = exp.reduce((sum, value) => sum + value, 0) || 1;

  return new Map(
    candidates.map((entry, index) => [
      keyOf(entry.action),
      budget.prior * Math.log(exp[index] / total),
    ]),
  );
};

/**
 * **Мнение модели в единицах оценки** (`rootAdvantages`): та же мысль, что играет ученик (`qvalue`),
 * только приором, а не решением. Свип §47 показал, почему прежний приор корня не работал: он входил
 * добавкой `prior · log p` к среднему по визитам. При бюджете времени (30 мс ≈ 35 доигрываний, 5–7 на
 * вариант) средние — шум, и коэффициент приора на них не влияет: 22–26 побед из 48 при приоре от 0 до 30
 * (`.workbuddy/prior-sweep.mjs`). То есть модель **не отвергалась** — её просто не было в решении.
 *
 * Здесь она в решении есть, и в том же виде, в каком играет сама: `−(Q(s, a) + 0,8 · log1p(вес))`, то
 * есть «насколько вариант хуже сильнейшего по мнению модели» (у лучшего нуль, у остальных минус). Число
 * кладётся рядом со средней доигрываний, а вес приора падает с числом визитов (`mix / (visits + τ)`):
 * пока статистики нет — решает модель, как только доигрываний накопилось — решает поиск. Это и есть
 * «поиск решает, модель — приор», а не «модель вместо поиска».
 */
export const rootAdvantages = (state, viewerId, candidates, budget = searchBudget()) => {
  const zeros = new Map(candidates.map(entry => [keyOf(entry.action), 0]));
  if (!(Number(budget.priorMix) > 0) || candidates.length === 0) return zeros;

  const scores = scoreOptions(state, viewerId, candidates, { artifact: budget.artifact ?? null });
  if (scores == null) return zeros;

  const mix = Number(budget.priorMix);
  const scale = Math.max(...candidates.map(entry => Number(entry.weight) || 0)) || 1;
  const logScale = Math.log1p(scale) || 1;
  const mixedOf = entry =>
    (scores.get(keyOf(entry.action)) ?? 0) +
    mix * (Math.log1p(Math.max(0, Number(entry.weight) || 0)) / logScale);

  // отсчёт от сильнейшего варианта: приор не поднимает весь корень, а расставляет варианты между собой
  const best = Math.max(...candidates.map(mixedOf));
  return new Map(candidates.map(entry => [keyOf(entry.action), mixedOf(entry) - best]));
};

/** Выбор ребёнка узла по UCB. Свои узлы максимизируют оценку, чужие — минимизируют. */
const ucbChild = (node, legal, { rootKey, priorByKey, exploration }) => {
  const total = Math.max(1, node.visits);
  let best = null;

  for (const option of legal) {
    const child = node.children.get(keyOf(option.action));
    if (!child) continue;
    const mean = child.value / Math.max(1, child.visits);
    const mine = child.playerId === rootKey;
    const prior = mine ? (priorByKey.get(keyOf(option.action)) ?? 0) : 0;
    const exploit = mine ? mean + prior : -(mean - prior);
    const ucb = exploit + exploration * Math.sqrt(Math.log(total) / Math.max(1, child.visits));
    if (best == null || ucb > best.ucb) best = { child, ucb };
  }

  return best?.child ?? null;
};

/**
 * Выбор действия поиском среди уже перечисленных легальных действий. На входе — пары
 * `{ action, weight }`: вес политики нужен как приоритет при равных средних.
 *
 * Возвращает выбранное действие и статистику: сколько доигрываний успели и что показали действия корня.
 * Если ни одно действие не набрало доигрываний, возвращается `null`: вызывающий играет как раньше.
 */
export const searchAction = (state, viewerId, entries, rawBudget = searchBudget()) => {
  const offeredCandidates = (entries ?? []).filter(entry => entry?.action != null);
  if (offeredCandidates.length === 0) return null;
  // один вариант — решать нечего, и это не «нулевое доигрывание»: ответ совпадает с предложенным
  if (offeredCandidates.length === 1)
    return { action: offeredCandidates[0].action, iterations: 0, rows: [] };

  /**
   * «Думать свой ход целиком» имеет смысл только **внутри** своего хода. В чужом бою (защита, ответное
   * окно) границы моего хода нет: первый же шаг доигрывания упирается в неё, лист вырождается в оценку
   * текущей позиции, и все варианты защиты получают одинаковую оценку. Поэтому вне своего хода
   * `turnEnd`/`replyTurn` снимаются, и поиск считает как обычно — роллаутом на `depth` шагов.
   */
  const budget =
    rawBudget.turnEnd && !myTurnOf(state, viewerId)
      ? { ...rawBudget, turnEnd: false, replyTurn: false }
      : rawBudget;

  /**
   * Схлопывание вариантов, ведущих в одно состояние (§53): это не «ускорение», а **честная статистика**.
   * Замер показал цену ошибки: если вместо схлопывания переиспользовать оценку повторного мира (кэш),
   * поиск проигрывает 36% против 64% на 1 800 партиях — одна выборка попадает в UCT десять раз, и
   * расклад визитов перестаёт отражать реальность. Здесь же у варианта просто **не появляется** второй
   * узел: доигрывания, которые ушли бы в копию, достаются настоящим вариантам.
   */
  let candidates = offeredCandidates;
  let deduped = 0;
  if (budget.dedup === true && offeredCandidates.length > 1) {
    const collapsed = dedupeCandidates(state, viewerId, offeredCandidates);
    candidates = collapsed.kept;
    deduped = collapsed.deduped;
  }
  if (candidates.length === 1) {
    return { action: candidates[0].action, iterations: 0, deduped, rows: [] };
  }

  const rng = rngOf(state);
  const makeWorld = worldFactory(state, viewerId);
  const started = Date.now();
  const deadline = budget.timeMs > 0 ? started + budget.timeMs : 0;
  const rootKey = String(viewerId);
  const root = { playerId: rootKey, children: new Map(), visits: 0, value: 0 };
  /**
   * **Пул миров** (§54): миры набираются один раз на решение и берутся по кругу. Нужен потому, что
   * разница между вариантами корня тонет в разнице миров: каждая итерация тянула **новый** мир, а
   * `worldFactory` каждый раз тасует скрытые зоны. Каждое доигрывание при пуле остаётся свежим (роллаут
   * идёт от копии мира, ГПСЧ тратится как обычно) — меняется только то, какие миры варианту достались.
   */
  const poolSize = Math.max(0, Math.trunc(Number(budget.worldPool) || 0));
  let worldPool = null;
  if (poolSize > 1) {
    worldPool = [];
    for (let index = 0; index < poolSize; index += 1) worldPool.push(makeWorld(rng));
  }
  const poolWorld = round => worldPool[round % worldPool.length];
  // приоры: `priorByKey` — тихий сигнал UCB (как было), `advantageByKey` — мнение модели в единицах оценки
  const priorByKey = rootPriors(state, viewerId, candidates, budget);
  const advantageByKey = rootAdvantages(state, viewerId, candidates, budget);
  // вес мнения модели в решении: ноль — модель в решение не входит вовсе (прежнее поведение поиска)
  const mix = Number(budget.priorMix) || 0;
  const tau = Math.max(0, Number(budget.priorTau) || 0);
  // **порядок развёртывания**: нераскрытые варианты берутся по мнению модели, а не по порядку весов
  // политики. При жёстком бюджете времени доигрываний хватает на первые варианты списка, и без этого
  // «модель как приор» до них просто не доходит: у корня оставались недоисследованные варианты.
  const ranked =
    mix > 0
      ? candidates
          .slice()
          .sort(
            (left, right) =>
              (advantageByKey.get(keyOf(right.action)) ?? 0) -
              (advantageByKey.get(keyOf(left.action)) ?? 0),
          )
      : candidates;
  /**
   * **Верхушка модели** (`SEARCH_TOP`, 0 — все варианты): считать только сильнейшие по её мнению
   * варианты. Так модель тратит бюджет поиска туда, где видит игру, — и это **не** замена решения
   * моделью: из верхушки выбирает доигрывание. Варианты с весом 0 (шаг в никуда) исключены ещё
   * вызывающим (`bot/play/decide.js`), поэтому верхушка — отбор «куда смотреть», а не veto.
   */
  const order = budget.top > 0 ? ranked.slice(0, Math.max(1, Math.trunc(budget.top))) : ranked;
  if (order.length <= 1)
    return { action: order[0]?.action ?? null, iterations: 0, broken: 0, timedOut: 0, rows: [] };

  /**
   * Перечисление действий: миры отличаются скрытым, а список наших ходов от него не зависит. Кэш по
   * подписи позиции здесь пробовали — он не дал ничего (0,99×): время уходило не на перечисление как
   * таковое, а на BFS внутри него, и это вылечил кэш карт расстояний (`bot/play/duel.js`).
   */
  const enumerate = (current, actor) => actionsFor(current, actor, { policy: budget.policy });
  const evaluation = (current, viewer) => evaluate(current, viewer, budget);

  let iterations = 0;
  let finished = 0;
  // сорванные доигрывания: их считаем и отдаём наружу, чтобы «поиск без роллаутов» не прятался
  let broken = 0;
  // доигрывания, срезанные пределом времени: по счётчику видно, держал ли бюджет ход или нет
  let timedOut = 0;

  for (let round = 0; round < budget.iterations; round += 1) {
    if (deadline > 0 && Date.now() >= deadline) break;

    let current = worldPool == null ? makeWorld(rng) : poolWorld(round);
    let node = root;
    const path = [node];
    let steps = 0;

    // спуск по дереву: за доигрывание расширяем ровно один узел, дальше — роллаут
    while (steps < budget.treeDepth) {
      const actor = actorOf(current);
      if (actor == null) break;

      let options;
      try {
        options = enumerate(current, actor);
      } catch {
        break;
      }
      const offered = options.filter(entry => entry.weight > 0);
      const legal = offered.length > 0 ? offered : options;
      if (legal.length === 0) break;

      // у корня нераскрытые варианты берутся **по мнению модели** (`order`: верхушка, если она задана),
      // внутри ветки — по порядку политики
      const untried =
        node === root
          ? (order.find(entry => !node.children.has(keyOf(entry.action))) ?? null)
          : legal.find(entry => !node.children.has(keyOf(entry.action)));
      const child = untried
        ? {
            action: untried.action,
            playerId: String(actor),
            children: new Map(),
            visits: 0,
            value: 0,
          }
        : ucbChild(node, legal, { rootKey, priorByKey, exploration: budget.exploration });
      if (child == null) break;

      if (untried) node.children.set(keyOf(untried.action), child);
      try {
        current = runAction(current, { ...child.action, playerId: actor });
      } catch {
        break;
      }
      path.push(child);
      node = child;
      steps += 1;
      if (untried) break;
    }

    const {
      score,
      steps: rolled,
      failed,
      clock,
    } = rolloutScore(current, viewerId, {
      ...budget,
      // предел времени доходит и до доигрывания: один длинный роллаут не должен пересиживать бюджет
      deadline,
      // ГПСЧ хода поиска: он живёт здесь, а не в бюджете, и без него доигрывание падает на первом же
      // выборе — исключение глотается, и поиск тихо играет без роллаутов (это уже случалось)
      rng,
      evaluation,
    });
    if (failed) broken += 1;
    if (clock) timedOut += 1;
    // нетерпение: быстрый выигрыш дороже медленного, проигрыш не дисконтируется
    const impatient = score > 0 ? score * budget.gamma ** (steps + rolled) : score;

    for (const visited of path) {
      visited.visits += 1;
      visited.value += impatient;
    }
    iterations += 1;
    if (current.hook === 'gameEnd') finished += 1;
  }

  if (iterations === 0) return null;

  const rows = [...root.children.values()].filter(child => child.visits > 0);
  /**
   * **Парная переоценка раскрытых вариантов** (§52): все варианты корня считаются **в одних и тех же**
   * мирах (`pairedRootValues`), поэтому разброс от чужих рук вычитается, и «какая из двух клеток лучше»
   * становится измеримой. Дорого по вариантам, поэтому берётся немного миров (`SEARCH_PAIRED`) и только
   * после основного поиска. Бюджет — часть того же времени решения: если минутная стрелка уже вышла,
   * шаг пропускается и решение остаётся на средних UCT.
   */
  let pairedByKey = null;
  if (budget.paired > 0 && rows.length > 1 && (deadline === 0 || Date.now() < deadline)) {
    const paired = pairedRootValues(
      state,
      viewerId,
      rows.map(child => ({ action: child.action, weight: 1 })),
      { ...budget, iterations: budget.paired },
    );
    if (paired != null) {
      pairedByKey = new Map(paired.rows.map(row => [row.key, row.mean]));
      timedOut += paired.timedOut;
      broken += paired.broken;
    }
  }

  /**
   * Итоговое решение корня: средняя доигрываний плюс мнение модели, **убывающее с числом визитов**
   * (`mix / (visits + τ)`). Так приор не «перебивает» поиск, а закрывает его слабое место — мало
   * доигрываний на вариант при жёстком бюджете времени. Прежний приор (`priorByKey`) остаётся тихим
   * сигналом UCB и в решении не участвует: он в тех же единицах, что и средние, и на 5–7 визитах тонет
   * в их шуме (свип §47: приор 0 против приора 30 — 22–26 побед из 48).
   *
   * Если посчитана парная оценка (`pairedByKey`), она **заменяет** средние UCT с весом `pairedMix`:
   * у неё та же шкала (те же доигрывания и тот же лист), но меньше разброс — ровно то, чего не хватало
   * при 35 доигрываниях.
   */
  const meanOf = child => {
    const mean = child.value / Math.max(1, child.visits);
    const paired = pairedByKey?.get(keyOf(child.action));
    if (paired == null) return mean;
    const weight = Math.max(0, Math.min(1, Number(budget.pairedMix) || 0));
    return weight * paired + (1 - weight) * mean;
  };
  const scoreOf = child =>
    meanOf(child) +
    (mix > 0 ? (mix * (advantageByKey.get(keyOf(child.action)) ?? 0)) / (child.visits + tau) : 0) +
    (priorByKey.get(keyOf(child.action)) ?? 0);
  const best = rows.reduce(
    (leader, child) => (leader == null || scoreOf(child) > scoreOf(leader) ? child : leader),
    null,
  );

  return {
    action: best?.action ?? null,
    iterations,
    finished,
    broken,
    timedOut,
    elapsed: Date.now() - started,
    // сколько вариантов схлопнулось как ведущие в одно состояние (§53): ноль, если схлопывание выключено
    deduped,
    // снялся ли лист на границе хода: вне своего хода он вырождается, и поиск считает обычным роллаутом
    turnPlan: budget.turnEnd,
    rows: rows.map(child => ({
      key: keyOf(child.action),
      visits: child.visits,
      mean: child.value / Math.max(1, child.visits),
    })),
  };
};
