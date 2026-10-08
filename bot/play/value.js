import { heroIds } from './pool.js';
import { resourceOf, resourceProgress, resourceReady } from './resources.js';

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
 * Признаков стало 63: 15 базовых, 12 индикаторов, 36 взаимодействий с героем.
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

/** Ресурс героя на игрока: готовность к порогу, включённый порог и топливо в руке (`bot/play/resources.js`). */
const resourcesOf = player => {
  const resource = resourceOf(player);
  return { progress: resourceProgress(resource), on: resourceReady(resource), fuel: resource.fuel };
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
  'fuel', // карты-топливо в руке: чем ресурс можно двинуть прямо сейчас
  'stillness', // мой герой не двигался в этом ходу — покой это условие его карт (Анубис, Дороти)
  'rivalHand', // рука соперника: его топливо на удар и защиту (не разница, а его запас)
  'sidekickHp', // здоровье помощников отдельно от героя: у Ифрита духи — двигатель, у Анубиса расход
  'frozen', // замороженные бойцы: статус отнимает шаг и телепорт
  'handLimit', // перебор руки: карты сверх лимита уйдут в сброс
  'round', // ход партии: время работает против того, кто ведёт
];

/** Признаки, которые у разных архетипов значат разное: для каждого героя модель учит их вес отдельно. */
export const conditionedFeatures = [
  'fighters',
  'hand',
  'deck',
  'resource',
  'stillness',
  'sidekickHp',
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
    diffResource(entry => entry.fuel) / limit,
    stillHero(mine),
    sum(others, player => cards(player, 'hand')) / limit,
    diff(assistantsHp) / 12,
    diff(frozenCount) / 2,
    (mine == null ? 0 : Math.max(0, cards(mine, 'hand') - limit)) / limit,
    Number(state.turn?.index ?? 0) / 20,
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
