import { heroIds } from './pool.js';
import { resourceOf, resourceProgress, resourceReady, resourceSteps } from './resources.js';
import { heroes } from '../../server/content/index.js';
import { cellDistances } from './actionFeatures.js';

/**
 * Оценка позиции для поиска: маленькая линейная модель на признаках состояния.
 *
 * Это первый шаг «экспертной итерации»: признаки считаются по открытым данным (здоровье, бойцы, рука,
 * колода, ресурс героя, ход партии), веса подбираются на трассах поиска (`bot/learn/train.js`), а поиск берёт
 * оценку вместо ручной формулы (`SEARCH_EVAL=net`). Модель нарочно крошечная: её видно целиком, она
 * считается за микросекунды и не тянет за собой библиотек — сеть нужна как оценка листа, а не как игрок.
 *
 * **Герой — часть признака (§18).** Первая версия модели не знала, кто играет, и общие признаки работали
 * прокси архетипа: в весах `fighters` и `resources` вышли с обратным знаком (у одних героев помощники —
 * сила, у других — расход). Поэтому к базовым признакам добавлены три блока: кто мой герой
 * (`hero:<id>`), кто герой соперника (`rival:<id>`) и как **мой** герой меняет смысл ключевых признаков
 * (`<признак>@<id>` — взаимодействие). Индикатор героя внутри партии постоянен, поэтому он не двигает
 * ранжирование листьев, но снимает с базовых весов чужую работу; взаимодействия ранжирование меняют.
 *
 * **Ресурс героя — из пака (§19).** Прежние `resources` и `items` считали копии предметов по хардкоду
 * состояний, поэтому у Снежной королевы признак не видел пул осколков «во льду» и умножался на `count`
 * копии (12). Теперь три признака читают **порог из правил героя** (`bot/play/resources.js`): готовность к
 * порогу, сам порог и карты-топливо в руке.
 *
 * **Покой, чужая рука, помощники и заморозка (§20).** Четыре признака по инвентарю условий всех шести
 * паков: не двигался ли мой герой (`movedThisTurn` — условие «Погребального звона», «Суда молчит»,
 * «Наотмашь»), запас чужой руки (её размер, а не разница), здоровье помощников отдельно от героя
 * (у Ифрита духи — двигатель, у Анубиса Амат — расход) и заморозка (`SET_STATUS` Снежной королевы).
 * **Механики карт, которых не было в признаках (m02640).** Аудит всех паков показал, из чего вообще
 * состоят свойства: битва (`COMBAT`), окна выбора (`PICKED`), предметы-состояния (`ITEMS`), группы бойцов,
 * сброс и раскрытая колода, остаток действий. Под это добавлены признаки `combatOpen`/`combatLead`,
 * `reach`/`adjacentFoes`/`room`, `freeTerrain`, `assistants`/`lostAssistants`/`reviveReady`,
 * `handBonus`/`handTagged`, `rivalLimit`, `actionsLeft`.
 *
 * **Ступени ресурса (m03187).** У Снежной королевы осколки включаются ступенями 4/5/6, у Теслы варианты
 * 5/7: лист читал только верхний порог умения и не видел, что до следующей ступени один осколок. Признаки
 * `resourceStep` (расстояние до ближайшей непройденной ступени) и `resourceShare` (доля верхней) считаются
 * по порогам **карт** пака (`bot/play/resources.js: resourceSteps`).
 *
 * **Карты эффектов в сбросе и руке (m04079).** «Зал суда» Анубиса бьёт в лицо ровно по числу эффектов
 * в сбросе, а рука — запас таких ударов: `discardEffects` и `handEffects`.
 *
 * Признаков стало 120: 36 базовых, 12 индикаторов, 72 взаимодействия с героем.
 *
 * **Матрица матчапов (§20).** Для каждой пары «мой герой против этого соперника» из этой же модели
 * считается проекция (`bot/play/matchups.js`): внутри пары индикаторы постоянны, поэтому оценка сводится к
 * коэффициентам базовых признаков плюс константа. Артефакт — `bot/play/matchups.json` и его зеркало для
 * бандла, `pairScore` играет теми же числами (проверяет `tests/unit/bot/matchups.test.js`).
 */
const clamp = value => Math.max(-1, Math.min(1, value));

const sum = (list, pick) => list.reduce((total, entry) => total + pick(entry), 0);

const hpSum = player =>
  sum(player?.fighters ?? [], fighter => Math.max(0, Number(fighter.currentHp) || 0));

const heroHp = player =>
  sum(
    (player?.fighters ?? []).filter(fighter => fighter.type === 'hero'),
    fighter => Math.max(0, Number(fighter.currentHp) || 0),
  );

const alive = player =>
  (player?.fighters ?? []).filter(fighter => (Number(fighter.currentHp) || 0) > 0).length;

/** Помощники отдельно от героя: у Ифрита духи — двигатель, у Анубиса Амат — расход. */
const assistantsHp = player =>
  sum(
    (player?.fighters ?? []).filter(fighter => fighter.type === 'assistant'),
    fighter => Math.max(0, Number(fighter.currentHp) || 0),
  );

/**
 * Мой герой ещё не двигался в этом ходу (`movedThisTurn` снимает начало хода). Флаг читают карты
 * («Погребальный звон» — 6, «Наотмашь» — 5), поэтому оценка обязана его видеть. Считается только своя
 * сторона: в чужой ход флаг у обоих снят, и разница ничего не значила бы.
 */
export const stillHero = player => {
  const heroes = (player?.fighters ?? []).filter(fighter => fighter.type === 'hero');
  return heroes.length > 0 && heroes.every(fighter => !fighter.movedThisTurn) ? 1 : 0;
};

/** Замороженные бойцы: статус запрещает шаг, телепорт и обмен (`SET_STATUS`). */
const frozenCount = player =>
  (player?.fighters ?? []).filter(fighter => Boolean(fighter.frozen)).length;

const cards = (player, zone) => (player?.[zone]?.cards ?? []).length;

/**
 * Стихии, которые читает пак героя: `terrainAffinity` (родная земля) плюс любой `terrain` в правилах
 * его карт и умения (лава Ифрита, песок Анубиса). Считается из контента, а не списком — новая карта
 * «от стихии» попадает в признак без правки бота.
 */
const terrainsOfHero = (() => {
  const cache = new Map();
  const collect = (value, out) => {
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry, out);
      return out;
    }
    if (value == null || typeof value !== 'object') return out;
    if (value.terrain != null) {
      for (const terrain of Array.isArray(value.terrain) ? value.terrain : [value.terrain]) {
        out.add(String(terrain));
      }
    }
    for (const entry of Object.values(value)) collect(entry, out);
    return out;
  };
  return heroId => {
    const key = String(heroId ?? '');
    if (!cache.has(key)) {
      const pack = heroes[key] ?? null;
      const terrains = collect([pack?.cards, pack?.skill], new Set(pack?.terrainAffinity ?? []));
      cache.set(key, terrains);
    }
    return cache.get(key);
  };
})();

/** Родные стихии героя: родная земля пака плюс всё, что читают его карты. */
const affinityOf = player => terrainsOfHero(player?.heroId);

/** Стихии клетки: `node.terrain` — строка или список (`shared/constants/terrain.js`). */
const cellTerrainList = (state, cellId) => {
  const node = (state.map?.nodes ?? []).find(entry => String(entry.id) === String(cellId));
  if (node == null) return [];
  return Array.isArray(node.terrain) ? node.terrain : [node.terrain];
};

/** Бойцы игрока на его родной стихии: там срабатывают карты «от стихии» (лава Ифрита, песок Анубиса). */
const onOwnTerrain = (state, player) => {
  const affinity = affinityOf(player);
  return (player?.fighters ?? []).filter(fighter => {
    if ((Number(fighter.currentHp) || 0) <= 0 || fighter.currentPosition == null) return false;
    return cellTerrainList(state, fighter.currentPosition).some(terrain => affinity.has(terrain));
  }).length;
};

/** Чужие бойцы на МОЕЙ стихии: чужая фигура в моей зоне — потеря контроля над полем. */
const onMyTerrain = (state, me, others) => {
  const affinity = affinityOf(me);
  return sum(others, player =>
    (player?.fighters ?? []).filter(fighter => {
      if ((Number(fighter.currentHp) || 0) <= 0 || fighter.currentPosition == null) return false;
      return cellTerrainList(state, fighter.currentPosition).some(terrain => affinity.has(terrain));
    }).length,
  );
};

/** Живые бойцы игрока, о которых что-то известно полю: снятые с доски сюда не попадают. */
const liveFighters = player =>
  (player?.fighters ?? []).filter(
    fighter => (Number(fighter.currentHp) || 0) > 0 && fighter.currentPosition != null,
  );

const heroFighter = player => liveFighters(player).find(fighter => fighter.type === 'hero') ?? null;

const foeFighters = others => others.flatMap(player => liveFighters(player));

const occupiedCellIds = state =>
  new Set(
    (state.players ?? []).flatMap(player =>
      liveFighters(player).map(fighter => String(fighter.currentPosition)),
    ),
  );

/** Ближайший чужой боец к моему герою: шаги по линиям поля, дальше шести не различаем. */
const nearestFoeDistance = (state, me, others) => {
  const hero = heroFighter(me);
  if (hero == null) return 6;
  const distances = cellDistances(state, hero.currentPosition);
  return foeFighters(others).reduce(
    (best, foe) => Math.min(best, distances.get(String(foe.currentPosition)) ?? 6),
    6,
  );
};

/** Чужие бойцы **в пределах моей дальности атаки**: «достаю» против «не достаю». */
const foesInReach = (state, me, others) => {
  const hero = heroFighter(me);
  if (hero == null) return 0;
  const range = Math.max(1, Number(hero.attackRange) || 1);
  const distances = cellDistances(state, hero.currentPosition);
  return foeFighters(others).filter(
    foe => (distances.get(String(foe.currentPosition)) ?? 6) <= range,
  ).length;
};

/** Чужие бойцы вплотную к моему герою: ближняя угроза. */
const foesAdjacent = (state, me, others) => {
  const hero = heroFighter(me);
  if (hero == null) return 0;
  const distances = cellDistances(state, hero.currentPosition);
  return foeFighters(others).filter(
    foe => (distances.get(String(foe.currentPosition)) ?? 6) === 1,
  ).length;
};

/** Свободные клетки рядом с моим героем: теснота запирает шаг и окна перемещения. */
const roomAround = (state, me) => {
  const hero = heroFighter(me);
  if (hero == null) return 0;
  const node = (state.map?.nodes ?? []).find(
    entry => String(entry.id) === String(hero.currentPosition),
  );
  const occupied = occupiedCellIds(state);
  return (node?.neighbors ?? []).filter(cellId => !occupied.has(String(cellId))).length;
};

/** Свободные клетки родной стихии: есть ли куда встать картой «от стихии» и телепортом. */
const freeAffinityCells = (state, me) => {
  const affinity = affinityOf(me);
  if (affinity.size === 0) return 0;
  const occupied = occupiedCellIds(state);
  let count = 0;
  for (const node of state.map?.nodes ?? []) {
    if (occupied.has(String(node.id))) continue;
    const terrains = Array.isArray(node.terrain) ? node.terrain : [node.terrain];
    if (terrains.some(terrain => affinity.has(String(terrain)))) count += 1;
  }
  return count;
};

/** Открытый бой: моё значение против чужого (`state.combat` живёт до закрытия боя). */
const combatFeatures = (state, viewerId) => {
  const combat = state.combat ?? null;
  if (combat == null) return { open: 0, lead: 0 };
  const key = String(viewerId);
  const mineAttacks = String(combat.attackerPlayerId) === key;
  const mineDefends = String(combat.defenderPlayerId) === key;
  // бой двух других игроков на четвёртом столе — не моя битва, в признаки не идёт
  if (!mineAttacks && !mineDefends) return { open: 0, lead: 0 };
  const mine = Number(mineAttacks ? combat.attackValue : combat.defenseValue) || 0;
  const theirs = Number(mineAttacks ? combat.defenseValue : combat.attackValue) || 0;
  return { open: 1, lead: (mine - theirs) / 10 };
};

/** Сумма усилений карт в руке: топливо удара и защиты, которого не видно по числу карт. */
const handBonus = player => sum(player?.hand?.cards ?? [], card => Number(card.bonus) || 0);

/** Карты с метками в руке: у Анубиса это весы, у Снежной королевы — осколки. */
const handTagged = player =>
  (player?.hand?.cards ?? []).filter(card => (card.tags ?? []).length > 0).length;

const assistantsAlive = player =>
  liveFighters(player).filter(fighter => fighter.type === 'assistant').length;

const lostCount = player => (player?.lost ?? []).length;

/** Карты эффектов в зоне: «Зал суда» бьёт по числу эффектов в сбросе, а рука — запас таких ударов. */
const effectCards = (player, zoneName) =>
  (player?.[zoneName]?.cards ?? []).filter(card => card?.type === 'effect').length;

/** Ресурс героя на игрока: готовность к порогу, включённый порог, ступени и топливо в руке (`bot/play/resources.js`). */
const resourcesOf = player => {
  const resource = resourceOf(player);
  const steps = resourceSteps(resource);
  return {
    progress: resourceProgress(resource),
    on: resourceReady(resource),
    gap: steps.gap,
    share: steps.share,
    fuel: resource.fuel,
  };
};

/**
 * Признаки позиции **глазами `viewerId`**: всё в разнице «наше минус их», поэтому знак модели читается
 * как «насколько мне лучше». Порядок признаков фиксирован: он же порядок весов в `bot/play/value-weights.js`.
 */
export const baseFeatureNames = [
  'heroHp', // здоровье главного героя — оно решает партию
  'teamHp', // здоровье команды целиком
  'fighters', // живые бойцы: у кого больше тел, тот держит темп
  'hand', // карты в руке: топливо на удар и защиту
  'deck', // запас колоды: истощение стоит 2 здоровья за карту
  'thinDeck', // штраф за тонкую колоду (нелинейность: 5 карт хуже, чем 10)
  'resource', // готовность ресурса героя к его порогу (0..1): собрано ли то, чем он играет
  'resourceOn', // порог достигнут: механика героя включена (катушки, осколки, пелена)
  'resourceStep', // шаг до СЛЕДУЮЩЕЙ ступени карт (0 — ступень близко, 1 — далеко): у Снежной их 4/5/6
  'resourceShare', // доля верхней ступени (0..1): ресурс сверх порога умения тоже виден
  'fuel', // карты-топливо в руке: чем ресурс можно двинуть прямо сейчас
  'stillness', // мой герой не двигался в этом ходу — покой это условие его карт (Анубис, Дороти)
  'rivalHand', // рука соперника: его топливо на удар и защиту (не разница, а его запас)
  'sidekickHp', // здоровье помощников отдельно от героя: у Ифрита духи — двигатель, у Анубиса расход
  'frozen', // замороженные бойцы: статус отнимает шаг и телепорт
  'handLimit', // перебор руки: карты сверх лимита уйдут в сброс
  'round', // ход партии: время работает против того, кто ведёт
  'terrainStand', // бойцы на родной стихии героя: там срабатывают карты «от стихии» (песок, лава)
  'terrainFoe', // чужие бойцы на МОЕЙ стихии со знаком минус: чужая фигура в моей зоне — потеря контроля
  'distance', // близость моего героя к ближайшему чужому бойцу (1 — вплотную, 0 — далеко)
  'discard', // сброс — второй запас карт: у Снежной королевы он и есть ресурс
  'discardEffects', // карты эффектов в сбросе: «Зал суда» Анубиса бьёт ровно по их числу
  'handEffects', // карты эффектов в руке: запас таких ударов ещё не сожжён
  'combatOpen', // идёт моя битва прямо сейчас (свойство карты ещё разыгрывается)
  'combatLead', // перевес значений в открытом бою: «Саван» и весы выигрывают или проигрывают
  'reach', // чужие бойцы в пределах МОЕЙ дальности атаки: достаю или не достаю
  'adjacentFoes', // чужие бойцы вплотную к моему герою: ближняя угроза
  'room', // свободные клетки рядом с героем: теснота запирает шаг и окна перемещения
  'freeTerrain', // свободные клетки родной стихии: есть куда встать картой «от стихии»
  'assistants', // живые помощники: у Ифрита духи — двигатель, у Анубиса Амат — расход
  'lostAssistants', // убитые бойцы в запасе: материал для воскрешения и счёт потерь
  'reviveReady', // у кого есть кого вернуть: воскрешение как ресурс, а не как факт окна
  'handBonus', // сумма усилений карт в руке: топливо удара и защиты, которого не видно по числу
  'handTagged', // карты с метками в руке: весы Анубиса, осколки Снежной королевы
  'rivalLimit', // лимит руки соперника: перебор считается по его лимиту, а не по семёрке
  'actionsLeft', // остаток действий в моём ходу: ход уже потрачен или ещё нет
];

/** Признаки, которые у разных архетипов значат разное: для каждого героя модель учит их вес отдельно. */
export const conditionedFeatures = [
  'fighters',
  'hand',
  'deck',
  'resource',
  'resourceStep',
  'stillness',
  'sidekickHp',
  'terrainStand',
  'distance',
  'reach',
  'handBonus',
  'assistants',
];

/**
 * Полный список признаков: базовые, потом блок героя. Индикаторы героя — «эмбеддинг» в линейной модели:
 * при одном активном герое на партию это ровно его собственные веса, а взаимодействия со своим героем
 * дают **вес признака на пару** — то, что читает матрица матчапов (`bot/play/matchups.js`).
 *
 * Взаимодействия с героем **соперника** (`<признак>@rival:<id>`) пробовали (§20) и убрали: на тех же
 * diff-признаках они коллинеарны блоку своего героя — точность 75,3% → 72,7%, сила 51% → 48%.
 */
export const featureNames = [
  ...baseFeatureNames,
  ...heroIds.map(heroId => `hero:${heroId}`),
  ...heroIds.map(heroId => `rival:${heroId}`),
  ...heroIds.flatMap(heroId => conditionedFeatures.map(name => `${name}@${heroId}`)),
];

const baseIndexOf = Object.fromEntries(baseFeatureNames.map((name, index) => [name, index]));

export const featuresOf = (state, viewerId) => {
  const key = String(viewerId);
  const players = state.players ?? [];
  const mine = players.find(player => String(player.id) === key) ?? null;
  const others = players.filter(player => String(player.id) !== key);
  const diff = pick => (mine == null ? 0 : pick(mine)) - sum(others, pick);
  // ресурс считается один раз на игрока: за лист оценка зовётся тысячи раз, а сброс приходится обходить
  const mineResource = resourcesOf(mine);
  const otherResources = others.map(resourcesOf);
  const diffResource = pick => pick(mineResource) - sum(otherResources, pick);
  const limit = 7;
  const combat = combatFeatures(state, key);

  const base = [
    diff(heroHp) / 8,
    diff(hpSum) / 24,
    diff(alive) / 2,
    diff(player => cards(player, 'hand')) / limit,
    diff(player => cards(player, 'deck')) / 25,
    // тонкая колода наказывается нелинейно: сперва «просто меньше», потом резко
    (sum(others, player => Math.max(0, 5 - cards(player, 'deck'))) -
      (mine == null ? 0 : Math.max(0, 5 - cards(mine, 'deck')))) /
      5,
    diffResource(entry => entry.progress),
    diffResource(entry => entry.on),
    diffResource(entry => entry.gap),
    diffResource(entry => entry.share),
    diffResource(entry => entry.fuel) / limit,
    stillHero(mine),
    sum(others, player => cards(player, 'hand')) / limit,
    diff(assistantsHp) / 12,
    diff(frozenCount) / 2,
    (mine == null ? 0 : Math.max(0, cards(mine, 'hand') - Number(mine.handLimit ?? limit))) / limit,
    Number(state.turn?.index ?? 0) / 20,
    diff(player => onOwnTerrain(state, player)) / 2,
    -onMyTerrain(state, mine, others) / 2,
    (5 - nearestFoeDistance(state, mine, others)) / 5,
    diff(player => cards(player, 'discard')) / 25,
    diff(player => effectCards(player, 'discard')) / 5,
    diff(player => effectCards(player, 'hand')) / 3,
    combat.open,
    combat.lead,
    foesInReach(state, mine, others) / 3,
    foesAdjacent(state, mine, others) / 4,
    roomAround(state, mine) / 6,
    Math.min(1, freeAffinityCells(state, mine) / 4),
    diff(assistantsAlive) / 3,
    diff(lostCount) / 3,
    (mine != null && lostCount(mine) > 0 ? 1 : 0) -
      sum(others, player => (lostCount(player) > 0 ? 1 : 0)),
    diff(handBonus) / 10,
    diff(handTagged) / 5,
    diff(player => Number(player.handLimit ?? limit)) / limit,
    (Number(state.turn?.actionsLeft ?? 0) / Math.max(1, Number(state.turn?.actionsTotal ?? 1))),
  ];

  const myHero = String(mine?.heroId ?? '');
  const rivals = new Set(others.map(player => String(player.heroId)));

  return [
    ...base,
    ...heroIds.map(heroId => (heroId === myHero ? 1 : 0)),
    ...heroIds.map(heroId => (rivals.has(heroId) ? 1 : 0)),
    // взаимодействия: тот же базовый признак, но только для своего героя — у остальных ноль
    ...heroIds.flatMap(heroId =>
      conditionedFeatures.map(name => (heroId === myHero ? base[baseIndexOf[name]] : 0)),
    ),
  ];
};

/** Ручные веса базовых признаков: работают до обучения, чтобы оценка не была нулевой. */
const baseDefaults = {
  heroHp: 8,
  teamHp: 1,
  fighters: 2,
  hand: 0.6,
  deck: 0.5,
  thinDeck: 1.5,
  resource: 1.2,
  resourceOn: 1.5,
  fuel: 0.4,
  stillness: 0.5,
  rivalHand: -0.5,
  sidekickHp: 1,
  frozen: -0.5,
  handLimit: -0.5,
  round: 0,
  terrainStand: 0.6,
  terrainFoe: -0.4,
  distance: 0.2,
  discard: 0.3,
};

/**
 * Веса «по умолчанию»: базовые — грубая ручная настройка, блок героя — нули (у него нет разумного
 * априори: он весь смысл берёт из обучения).
 */
export const defaultWeights = Object.fromEntries(
  featureNames.map(name => [name, baseDefaults[name] ?? 0]),
);

/** Оценка позиции моделью: скалярное произведение признаков на веса, сжатое в те же `[-1, 1]`. */
export const scoreOf = (state, viewerId, weights = defaultWeights) => {
  if (state.hook === 'gameEnd') return String(state.winner) === String(viewerId) ? 1 : -1;

  const features = featuresOf(state, viewerId);
  let total = 0;
  for (let index = 0; index < featureNames.length; index += 1) {
    total += (Number(weights?.[featureNames[index]]) || 0) * features[index];
  }

  return clamp(Math.tanh(total));
};

