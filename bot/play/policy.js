/**
 * Политики бота: как он выбирает действие из тех, что предлагает движок.
 *
 * - `random` — веса фаззинга: атаки чуть охотнее прочего, но в целом бот ходит наугад. Он лезет в редкие
 *   ветки карт и именно он приносит находки, поэтому остаётся отдельной политикой.
 * - `greedy` — осмысленная игра: защищается картой вместо паса, подходит на дистанцию удара, держит
 *   выгодную дистанцию, встаёт на свою стихию и не крутит колоду на исходе. Скрытых данных не читает —
 *   только то, что даёт `runUi` (своя рука, чужие бойцы на поле) и содержимое **своих** карт
 *   (`bot/play/cards.js`), поэтому его метрики честные: он не знает ни чужой руки, ни закрытой карты атаки.
 * - `cards` — тот же жадный без признаков позиции и усталости (эталон этапа §13–§14), `economy` — без
 *   признаков карты и свойства (§12), `basic` — вообще без признаков (§10). Эталоны заморожены: по ним
 *   видно вклад каждого следующего этапа.
 *
 * Политика — это **веса, а не код**: `actionsFor` (`bot/play/duel.js`) перечисляет легальные действия движка,
 * а политика решает, какое из них вероятнее. Обучение бота будет менять этот вектор, а не граф игры
 * (`TODO`, «ИИ и обучение ботов»).
 *
 * Ключи весов:
 * - обычный ход: `attack` (карта атаки/гибрид), `card` (прочая карта), `draw` (объявить перемещение и
 *   добрать), `pass`;
 * - окно перемещения: `step` (шаг, с которого бьёшь), `stepCloser` (шаг, сокращающий дистанцию),
 *   `stepAway` (шаг из-под удара, когда мы достаём дальше врага), `stepIdle` (шаг в никуда;
 *   **вес 0 значит «не предлагаем»** — иначе бот топчется и партия не заканчивается), `movePass`
 *   (закончить, когда есть куда идти), `movePassIdle` (закончить, когда идти некуда — иначе бот ходит
 *   туда-обратно), `hold` (премия за то, чтобы остаться на выгодной позиции или на своей стихии);
 * - фаза защиты: `defend` (карта защиты), `defendPass` (пас);
 * - окна выбора: `pick` (цель, вариант свойства, боец), `cardCost` (жадность на трату карты),
 *   `finish`/`heroTarget`/`target` (вес цели: добить / герой / прочий боец);
 * - ценность карты и свойства: `cardValue` (насколько важнее сила карты в бою), `option` (базовый вес
 *   варианта свойства), `optionCost` (штраф за трату ресурса в свойстве) и `condition` (сколько веса
 *   платят за обещанную правилами карты пользу: «Погребальный звон» — 6 при покое). Ноль отключает
 *   оценку: так `random` не теряет покрытие, а эталоны остаются без этих признаков;
 * - позиция и усталость: `terrain` (шаг на свою стихию из паспорта героя) и `fatigue` (не крутить
 *   колоду, когда до истощения близко). Ноль — эталонное поведение;
 * - признаки поля с **той стороны** (`contact`, `foeterrain`, `foeguard`, `foeroom`, `flee`): опасная
 *   дистанция, клетка чужой стихии, путь чужого героя к моему дешёвому бойцу, закрытый выход, отход в тыл;
 * - скрытое и отложенное (`cancel`, `defer`, `estimate`, `scales`): вероятность отмены в чужой руке,
 *   цена раннего розыгрыша, распределение чужого усиления и свойств по остатку колоды.
 *
 * Признаки, а не только числа: политика смотрит на **свою руку** (`hand`, `canDraw`) и на **открытое
 * состояние чужих бойцов** (здоровье, тип). Скрытого она по-прежнему не видит: ни чужой руки, ни
 * закрытой карты атаки.
 */
/**
 * Основа «жадного»: числа этапа §12–§14 (рука, добор, цена карты, сила карты в бою, свойства, цель).
 * Признаки позиции и усталости включаются отдельно — так эталон `cards` остаётся ровно прежним жадным.
 */
const greedyBase = ({ canAttack = false, hand = 3, canDraw = true } = {}) => {
  const starving = canDraw && hand <= 1;
  // `BOT_EFFECT_WORTH=0` выключает оценку эффектов: так меряется её вклад (до/после) без правок кода
  const effectGene =
    typeof process !== 'undefined' && process?.env?.BOT_EFFECT_WORTH === '0' ? 0 : 1.5;
  return {
    attack: 10,
    card: canAttack ? 3 : 5,
    // эффектная карта: вес растёт на обещанную пользу (`bot/play/cards.js: effectWorth` — сколько
    // свойство сделает именно в этой позиции), а карта без единого сработавшего правила получает 0 —
    // вето, как у «шага в никуда». Ноль гена отключает оценку: эталоны `basic`/`economy` и роллаут
    // поиска играют по одному весу на все карты, поэтому невзвешенные карты из игры не выпадают.
    effect: effectGene,
    draw: starving ? 16 : canAttack ? 1 : 8,
    pass: 1,
    step: 8,
    stepCloser: 6,
    stepIdle: 0,
    movePass: 1,
    movePassIdle: 10,
    defend: 6,
    defendPass: 1,
    pick: 1,
    // окно усиления/сброса: сильные карты берегутся (вес падает с ростом бонуса)
    cardCost: 6,
    // карта как запас колоды: тонкая колода делает каждую трату дороже (`keepPrice`, m02166)
    keep: 1,
    // бой: сила карты, добор раненого и цена свойства
    cardValue: 1.5,
    option: 1,
    optionCost: 1,
    // цель: раненого добивают, герой важнее помощника
    finish: 12,
    heroTarget: 6,
    target: 2,
    // добивание тела: обычный помощник с 2 hp не стоит карты с запасом, важный (Амат, ворона) — стоит
    finishBody: 1,
    // позиция тела: шаг на клетку, которая перекрывает путь к моему герою, и штраф за подставу под удар
    guard: 3,
    // потолок премии за перекрытие у шага «в никуда»: встать в коридор — тоже ход, хотя дистанция не
    // меняется. Без него блокер физически не мог занять место: шаг без смены дистанции весит 0
    guardFloor: 1,
    exposed: 2.5,
    // защита тела: карту тратят на спасение помощника, только если он важен герою (Амат, ворона)
    defendBody: 0.85,
    // телепорт и обмен — не шаг: путь не тратится, поэтому позиция в той же шкале, но со своей ценой.
    // `teleport` — шаг, срезанный переносом (за каждый сэкономленный шаг); `swap` — обмен бойцов
    // местами (умение Дороти, «Тото отвлекает»); `banish` — чужой перенос: врага выгодно ставить под
    // мои удары и подальше от своих (m02358)
    teleport: 1.5,
    swap: 1,
    banish: 1,
  };
};

/** Признаки позиции и усталости выключены: эталон замеров §13–§14. */
const NO_POSITION = {
  stepAway: 0,
  hold: 0,
  terrain: 0,
  fatigue: 0,
  guard: 0,
  guardFloor: 0,
  exposed: 0,
  defendBody: 0,
  teleport: 0,
  swap: 0,
  banish: 0,
};

/**
 * Переключатели генов через переменные среды: `BOT_GENE_<ИМЯ>=0` выключает ген, `=число` задаёт его
 * значение. Нужно для замеров: вклад каждого гена меряется отдельно, без правок кода между прогонами
 * (тот же приём, что `BOT_EFFECT_WORTH`). Читается один раз на загрузку модуля — в браузере переменных
 * среды нет, там гены всегда проектные.
 */
const envGenes = {};
if (typeof process !== 'undefined' && process?.env) {
  for (const [name, value] of Object.entries(process.env)) {
    const found = /^BOT_GENE_([A-Z_]+)$/.exec(name);
    if (found == null) continue;
    const number = Number(value);
    if (Number.isFinite(number)) envGenes[found[1].toLowerCase()] = number;
  }
}

/** Значение гена: переменная среды важнее проектного. */
export const gene = (name, fallback) => (envGenes[name] != null ? envGenes[name] : fallback);

/** Запас чужой колоды, с которого начинается «бомба истощения»: одну карту он доберёт и останется пустым. */
const BOMB_FUEL = 1;
/** Насколько бомба снимает тягу к размену (`attack`) и к сближению (`stepCloser`), и их полы: вес 0
 *  значит «вариант не предлагаем», а выключать бой целиком нельзя — добивать всё равно придётся. */
const BOMB_ATTACK = 0.4;
const BOMB_APPROACH = 0.5;
const BOMB_ATTACK_FLOOR = 0.25;
const BOMB_APPROACH_FLOOR = 0.2;
/** Насколько бомба поднимает отход (`stepAway`) и удержание позиции (`hold`): ищем, где встать. */
const BOMB_ESCAPE = 2;
const BOMB_HOLD = 1;

/**
 * **Бомба истощения**: у соперника колода кончается, поэтому каждый его *обязательный* добор — это
 * истощение (2 урона всем его бойцам, `rules.exhaustionDamage`). Бить его для этого не нужно: удар он
 * встретит картой защиты, а вот шаг к нам — маневром, то есть добором. Значит в этой фазе выгодно
 * держать дистанцию и не подставляться.
 *
 * Условия: его запас ≤ `BOMB_FUEL` **и** его колода тоньше нашей — иначе размен колодами мы проиграем
 * сами. Ген `BOT_GENE_BOMB=0` выключает.
 */
const bombPressure = ({ fuel = 0, rivalFuel = 0 } = {}) => {
  const power = gene('bomb', 1);
  if (!(power > 0)) return 0;
  const theirs = Number(rivalFuel);
  if (!Number.isFinite(theirs) || theirs > Math.max(0, gene('bombfuel', BOMB_FUEL))) return 0;
  if (theirs >= (Number(fuel) || 0)) return 0;

  return power;
};

export const policies = {
  /** Наугад: разброс весов от сида нужен, чтобы прогоны не были однообразными. */
  random: ({ style = 2 } = {}) => ({
    attack: 2 + style * 2,
    card: 6 - style,
    draw: 6 - style,
    pass: style,
    step: 3,
    stepCloser: 3,
    stepIdle: 0,
    movePass: 1,
    movePassIdle: 10,
    defend: 1,
    defendPass: 1,
    pick: 1,
    // случайный бот карты не оценивает: любая тратится одинаково охотно
    cardCost: 0,
    cardValue: 0,
    // свойства: все варианты равны — редкие ступени должны проверяться
    option: 0,
    optionCost: 0,
    finish: 1,
    heroTarget: 1,
    target: 1,
  }),

  /**
   * Осмысленная игра. Есть чем ударить — бьём; нет — идём сближаться (объявление перемещения тянет за
   * собой добор, поэтому «идти» и «добрать» — одно действие). В защите играем карту: пас всегда пропускает
   * весь урон, а карта защиты почти всегда его уменьшает.
   *
   * Экономика и карты — из `greedyBase`. Сверх неё два признака этого этапа:
   * - **позиция**: дальнобойный боец выходит из-под удара (`stepAway`), выгодная дистанция и своя стихия
   *   удерживаются (`hold`), шаг на стихию из паспорта получает премию (`terrain`);
   * - **усталость**: колода не перетасовывается, поэтому на исходе колоды добор — это будущие 2 урона
   *   истощения, и «маневр просто так» при полной руке невыгоден (`fatigue`).
   */
  greedy: situation => ({
    ...greedyBase(situation),
    stepAway: 7,
    hold: 4,
    terrain: 5,
    fatigue: 1,
  }),

  /**
   * Тот же жадный **без признаков позиции и усталости** — эталон этапа §13–§14: карты и свойства
   * оцениваются, а дистанция, стихия и запас колоды — нет. Нужен, чтобы замер §15 показывал вклад
   * именно новых признаков.
   */
  cards: situation => ({ ...greedyBase(situation), ...NO_POSITION }),

  /**
   * Жадный, который читает **свои же правила карты**: «Погребальный звон» — это 6, пока Анубис не
   * двигался, «Печать Маат» дороже при руке врага 4+, «Ни шагу назад» — 5 рядом со своим бойцом
   * (`bot/play/cards.js: cardPromise`, ген `condition` платит за обещанную пользу). Эталон замера — сам
   * `greedy`, у которого ген нулевой: так видно вклад именно условий, а не признаков (§20).
   */
  conditions: situation => ({ ...policies.greedy(situation), condition: 3 }),

  /**
   * Жадный, который **давит**: сильнее хочет драться и идти вперёд, меньше — крутить колоду.
   *
   * Нужен как кандидат против «отсиживания»: `greedy` может держать 50% и при этом тянуть партию до
   * истощения, потому что бой в его оценке — это «потерять карту и получить удар», а темп и добивание
   * он не считает. Здесь вес атаки выше, добор на сближении дешевле, а отступление выключено.
   * Эталон замера — сам `greedy`.
   */
  pressure: situation => {
    const base = greedyBase(situation);
    return {
      ...base,
      attack: base.attack * 1.3,
      draw: base.draw * 0.6,
      stepCloser: base.stepCloser * 1.4,
      stepAway: 0,
      hold: 0,
      pass: Math.max(0.5, base.pass * 0.5),
    };
  },

  /**
   * Жадный с **оценкой темпа**: идёт в размен, когда бой нужен, и не идёт, когда выгоднее тянуть.
   *
   * Часы партии — колода: она не перетасовывается, поэтому у кого она кончится раньше, тот получит
   * истощение (2 урона за добор на пустой колоде). Отсюда решение:
   * - **я впереди по колоде** (`fuel - rivalFuel > 0`) — время на моей стороне: размен невыгоден,
   *   потому что он тратит карты обеим сторонам, а истощение проиграет тот, у кого карт меньше;
   * - **я позади** — тянуть нельзя: каждый ход приближает моё истощение, значит давить и добивать;
   * - **равенство** — размен не решает, берём только то, что даёт добивание или урон без потерь.
   *
   * Кроме числа атаки сжимается кайт: `stepAway`/`hold` падают, `stepCloser` растёт, — иначе бот
   * отходит вместо того, чтобы идти в контакт. Эталон замера — сам `greedy` (`trade` — кандидат).
   */
  trade: situation => {
    const base = greedyBase(situation);
    // Позиционные гены берутся у жадной политики, а не у базы: в самой `greedyBase` их нет, и живой
    // предлагатель (`PROPOSER_POLICY`) оставался без кайта, удержания выгодной клетки, своей стихии и
    // цены добора — то есть шаг «из-под удара» и шаг «на свою землю» в перечисление не попадали вовсе
    // (вес 0 = «не предлагаем»). `BOT_GENE_POSITION=0` возвращает прежнее поведение.
    const sited = policies.greedy(situation);
    const position = gene('position', 1);
    const fuel = Number(situation?.fuel) || 0;
    const rivalFuel = Number(situation?.rivalFuel) || 0;
    const clock = Math.max(-1, Math.min(1, (fuel - rivalFuel) / 8));
    // впереди (clock > 0) — жить долго; позади (clock < 0) — давить; равенство — без надбавки
    const press = 1 + 1.2 * Math.max(0, -clock);
    const hold = 1 + 0.8 * Math.max(0, clock);
    // Бомба истощения: у соперника в колоде последняя карта, а у нас толще — тогда его следующий маневр
    // и есть добор на пустой колоде (2 урона всем его бойцам). Бой ему не даём: атака дешевеет, отход и
    // удержание дистанции дорожают — пусть тратит карту на шаг. `BOT_GENE_BOMB=0` выключает.
    // Запас передаётся **как есть**: неизвестный (нет числа) — это не «ноль карт», бомбы нет.
    const bomb = bombPressure({ fuel, rivalFuel: Number(situation?.rivalFuel) });
    return {
      ...base,
      attack: base.attack * press * Math.max(BOMB_ATTACK_FLOOR, 1 - BOMB_ATTACK * bomb),
      stepCloser:
        base.stepCloser *
        (1 + 0.6 * Math.max(0, -clock)) *
        Math.max(BOMB_APPROACH_FLOOR, 1 - BOMB_APPROACH * bomb),
      draw: base.draw * (1 - 0.5 * Math.max(0, clock)),
      stepAway: sited.stepAway * 0.75 * hold * position * (1 + BOMB_ESCAPE * bomb),
      hold: sited.hold * hold * position * (1 + BOMB_HOLD * bomb),
      terrain: sited.terrain * position,
      fatigue: sited.fatigue * position,
      // сушка руки: при полной руке добор уходит в сброс, а не в игру (`drawWeight`)
      choke: gene('choke', 1),
      pass: Math.max(0.5, base.pass * (1 - 0.4 * Math.max(0, -clock))),
      // Оценка размена (§37): усиление карты сгорает вместе с ней (`tradeCost`), ответный удар
      // считается, если боец может его не пережить (`tradeRisk`), материал сторон сравнивается
      // (`tradeWound`), а на исходе колоды бездействие дороже атаки — порогом `tradeFuel` и плавным
      // ростом `tradeFuelSlope` (чем меньше доборов, тем дороже атака).
      tradeCost: 1,
      tradeRisk: 1,
      tradeWound: 0.5,
      tradeCards: 0.5,
      tradeRivalFuel: 0.5,
      tradeFuel: 3,
      tradeFuelSlope: 0.4,
      // Темп затянувшегося хода (§43): замер на сидах 21001…21060 дал 54% и с геном, и без него —
      // добавка не видна, поэтому ген оставлен нулевым: механизм есть, включается числом, но
      // в живую политику не входит.
      tempo: 0,
      tempoRound: 20,
      // Ясность правил (§43): механизмы добавлены и измерены, но вклад каждого — **ноль**. Замер
      // (сиды 21001…21060 и 26001…26120, по 7 200–14 400 партий на вариант): с генами и без них —
      // 54–55% в пределах шума; единственный минус — `actionSecond` (53%). Причина: веса политики
      // тонут в оценке поиска. Гены оставлены нулевыми как настроенные механизмы для замеров
      // через `BOT_GENE_<ИМЯ>`.
      initiative: 0,
      lastAction: 0,
      actionSecond: 0,
      deal: 0,
      dealRound: 15,
      focus: 0,
      focusLow: 5,
      // Условия карт в **живом** предлагателе (`.docs/bot-strategies.md`, «Стратегии по героям»).
      // До §74 ген был нулевым у всех политик рантайма: «Погребальный звон» бил 3 вместо 6, пороги
      // «Трещины»/«Оцепенения»/«Сосульки» не отличались, условия Дороти не работали. Обещание карты
      // считается в предлагателе (один раз на решение), роллаут остаётся без него — там цена иная.
      condition: gene('condition', 3),
      // Отмены по остатку чужой колоды (п. 6): обещанная польза карты гасится вероятностью, что у
      // соперника в руке есть отмена (`counting.js: cancelRiskOf`), а своя отмена не уходит на защиту
      // от слабого удара (`defenseWeight`).
      cancel: gene('cancel', 1),
      // Опасная дистанция без атаки (п. 7): шаг в контакт, из которого не бьёшь, дешевеет.
      contact: gene('contact', 1),
      // Чужая стихия и перекрытие пути чужого героя к моим дешёвым бойцам (п. 2 «б»).
      foeterrain: gene('foeterrain', 1),
      foeguard: gene('foeguard', 1),
      // Теснота вокруг чужого героя (п. 8): шаг, закрывающий ему выход, стоит премии.
      foeroom: gene('foeroom', 1),
      // Приговорённый важный помощник уходит в тыл (Амат, ворона): шаг **от** врага получает премию.
      flee: gene('flee', 1),
      // Обмен «герой дороже помощника»: прирост позиции взвешивается по типу бойца (Дороти).
      swaphero: gene('swaphero', 1),
      // Выбор карты из чужой руки: брать самую дорогую для соперника, а не первую (Снежная королева).
      foecard: gene('foecard', 1),
      // Карта с `noReturn` («Зал суда») уходит из партии навсегда — ранняя трата дороже напечатанной.
      noreturn: gene('noreturn', 1),
      // Последнего духа не жгут: пока он жив, работают ступени пака (Ифрит).
      lastspirit: gene('lastspirit', 1),
      // Обещание ветки `picked` (урон, толчок, добор в момент выбора) — «Ожог», «Смена караула».
      picked: gene('picked', 1),
      // Сброс карты в колоду — это счётчик ресурса: у Снежной королевы он роняет порог осколков.
      resonance: gene('resonance', 1),
      // Прибавка за номер действия (`AP { spentMin }`): объявлять карту раньше её окна — потеря обещания.
      defer: gene('defer', 1),
    };
  },

  /**
   * Доигрывающая политика для поиска: тот же `greedy`, но с усиленной атакой. Нужна, чтобы роллаут видел
   * бой, а не перетягивание: с осторожной политикой поиск откладывает невыгодный размен, и партия тянется
   * до истощения (бесплатного паса в игре нет — каждый маневр сжигает карту колоды). Сама боевая политика
   * остаётся `greedy` — агрессия нужна только для оценки последствий.
   *
   * **Позиционные гены в симуляции** (`.docs/bot-strategies.md` п. 5). Раньше роллаут шёл без
   * `stepAway`/`hold`/`terrain`/`fatigue`: шаг «из-под удара» в симуляции не предлагался вовсе (вес 0 =
   * «не предлагаем»), поэтому поиск **не предвидел** кайт и бомбу истощения — он видел их только весом
   * варианта у корня. Теперь кайт и удержание позиции живут и в доигрывании: цены взяты у `trade`
   * (тот же шаг, что у живой политики). `BOT_GENE_ROLLOUTPOS=0` возвращает прежнее поведение.
   */
  aggressive: situation => {
    const base = greedyBase(situation);
    const sited = policies.greedy(situation);
    const position = gene('rolloutpos', 1);
    return {
      ...base,
      attack: base.attack * 3,
      draw: Math.max(1, base.draw * 0.5),
      stepAway: sited.stepAway * 0.75 * position,
      hold: sited.hold * position,
      terrain: sited.terrain * position,
      fatigue: sited.fatigue * position,
      pass: Math.max(0.5, base.pass * 0.5),
    };
  },

  /**
   * Маркер поиска: веса — как у `greedy` (по ним `actionsFor` перечисляет варианты), а сам выбор делает
   * `bot/play/search.js` — плоский MCTS с детерминизацией. В списке политик он нужен, чтобы `--policy=search`
   * работал в прогонах и матрице, а эталоны оставались сравнимыми.
   */
  search: situation => greedyBase(situation),

  /**
   * Тот же поиск, но с **обученной** оценкой листа (`bot/play/value.js`, веса из `bot/play/value-weights.js`).
   * Отдельное имя нужно, чтобы две оценки можно было сравнить напрямую: `--policy=net --policy-b=search`.
   */
  net: situation => greedyBase(situation),

  /**
   * Поиск, у которого лист считается **весами пары** из артефакта матчапов (`bot/play/matchups.json`,
   * зеркало — `bot/play/matchup-weights.js`): как мой герой играет против этого соперника. Пары в артефакте
   * нет — лист считается ручной формулой (`bot/play/search.js: evaluate`).
   */
  matchup: situation => greedyBase(situation),

  /**
   * Поиск с **прежней** ручной формулой листа (§16: здоровье героя, здоровье команды, запас колоды) —
   * эталон §21: `search` против `plain` показывает вклад ресурса, помощников и покоя в оценку листа.
   */
  plain: situation => greedyBase(situation),

  /**
   * Поиск с **геометрией в листе** (§29): та же ручная формула плюс угроза герою, давление на чужого
   * героя и прикрытие своими бойцами (`bot/play/search.js: leafScorePosition`). Отдельное имя нужно,
   * чтобы измерить вклад именно геометрии: `--policy=position --policy-b=search` — те же сиды и бюджет.
   */
  position: situation => greedyBase(situation),

  /**
   * Поиск, который думает **ход целиком**: доигрывание идёт не до предела глубины, а до конца моего
   * хода (и ответа соперника), и оценка берётся на этой границе (`bot/play/search.js: rolloutScore`,
   * `turnEnd`/`replyTurn`). Числа — как у `greedy`; отличается только то, где ставится лист. Отдельное
   * имя нужно, чтобы сравнивать с обычным поиском: `--policy=turn --policy-b=search`.
   */
  turn: situation => greedyBase(situation),

  /**
   * План на ход: вариантами решения становятся **цепочки своих действий** до конца хода, а не отдельные
   * действия (`bot/play/plan.js`). Веса — как у `greedy`: ими задаётся порядок и отбор вариантов внутри
   * цепочки, а саму цепочку выбирает планировщик. Отдельное имя нужно, чтобы сравнивать план с поиском
   * одного действия: `--policy=chain --policy-b=search` — те же сиды и тот же бюджет.
   */
  chain: situation => greedyBase(situation),

  /**
   * Поиск с **парной переоценкой корня** (§52): то же перечисление и тот же лист, что у `search`, но
   * решение корня уточняется оценкой всех раскрытых вариантов **в одних мирах**
   * (`bot/play/search.js: pairedRootValues`). Отдельное имя нужно для честного матча: настройка среды
   * `SEARCH_PAIRED` задала бы механизм **обеим** сторонам, и сравнивать было бы нечего.
   */
  spair: situation => greedyBase(situation),

  /**
   * Поиск с **кэшем повторных миров** (§53): тот же лист и то же перечисление, что у `search`, но
   * повторно встреченный мир корня не доигрывается заново, а берёт уже посчитанную оценку
   * (`bot/play/search.js: repeats`). Отдельное имя — для честного матча «с кэшем против без».
   */
  srep: situation => greedyBase(situation),

  /**
   * Поиск со **схлопыванием одинаковых вариантов** (§53): если два хода ведут в одно состояние (три
   * одинаковые гарпии шагают на ту же клетку), у корня остаётся один узел, а не два, — визиты не делятся
   * между неразличимыми записями. Отдельное имя — для честного матча «со схлопыванием против без».
   */
  sdedup: situation => greedyBase(situation),

  /**
   * Поиск на **пуле миров** (§54): миры набираются один раз на решение и берутся по кругу, поэтому на
   * каждый мир приходится много доигрываний, а разница между вариантами корня не тонет в разнице чужих
   * рук. Отдельное имя — для честного матча «с пулом против без».
   */
  sworld: situation => greedyBase(situation),

  /**
   * Жадный **без признаков карты и свойства** — эталон этапа §12: рука, добор, цена карты и выбор цели
   * есть, а силу карты в бою и варианты свойств политика не оценивает. Нужен, чтобы замер нового этапа
   * (§13) показывал вклад именно новых признаков.
   */
  economy: ({ canAttack = false, hand = 3, canDraw = true } = {}) => {
    const starving = canDraw && hand <= 1;
    return {
      attack: 10,
      card: canAttack ? 3 : 5,
      draw: starving ? 16 : canAttack ? 1 : 8,
      pass: 1,
      step: 8,
      stepCloser: 6,
      stepIdle: 0,
      movePass: 1,
      movePassIdle: 10,
      defend: 6,
      defendPass: 1,
      pick: 1,
      cardCost: 6,
      cardValue: 0,
      option: 0,
      optionCost: 0,
      finish: 12,
      heroTarget: 6,
      target: 2,
    };
  },

  /**
   * Тот же жадный, но **без признаков вообще**: рука, ценность карты, свойства и выбор цели не
   * учитываются. Эталон первого замера (`.docs/hero-balance.md` §12): сравнение `greedy` против `basic`
   * показывает, что дали все признаки вместе.
   */
  basic: ({ canAttack = false } = {}) => ({
    attack: 10,
    card: canAttack ? 3 : 5,
    draw: canAttack ? 1 : 8,
    pass: 1,
    step: 8,
    stepCloser: 6,
    stepIdle: 0,
    movePass: 1,
    movePassIdle: 10,
    defend: 6,
    defendPass: 1,
    pick: 1,
    cardCost: 0,
    cardValue: 0,
    option: 0,
    optionCost: 0,
    finish: 1,
    heroTarget: 1,
    target: 1,
  }),
};

/** Имена политик — для флагов CLI и сообщений об ошибке. */
export const policyNames = Object.keys(policies);

/**
 * Веса политики по имени, готовому объекту весов или функции от ситуации (так тюнер проверяет
 * кандидатов). Неизвестное имя — ошибка: молча подставлять `random` нельзя, иначе опечатка в флаге
 * тихо меняет смысл метрик.
 */
export const weightsFor = (policy, situation = {}) => {
  if (typeof policy === 'function') return policy(situation);
  if (policy != null && typeof policy === 'object') return policy;
  const factory = policies[policy ?? 'random'];
  if (!factory) {
    throw new Error(`политика "${policy}" (нужны ${policyNames.join(' | ')})`);
  }
  return factory(situation);
};

/**
 * Вес карты в окне, где карту **тратят** (усиление боя, вынужденный сброс): чем меньше бонус, тем
 * охотнее карта уходит — сильные берегутся на бой. `cardCost: 0` (политика `random`) отключает оценку:
 * все карты равны, чтобы фаззинг пробовал разные.
 *
 * `fuels` — карта кормит ресурс героя (метка осколка Снежной королевы): её сброс не трата, а вложение,
 * поэтому штрафа за бонус нет. Считается только политикой, которая сравнивает карты (`cardValue > 0`).
 *
 * `own` — своя механика карты (отмена, добор, лечение) в единицах оценки: она сгорает вместе с картой,
 * поэтому «отмену» и «добор» на усиление шага почти не сбрасывают (ген `stock`).
 */
export const cardCostWeight = (card, weights, { fuels = false, own = 0 } = {}) => {
  const cost = Number(weights?.cardCost) || 0;
  if (cost <= 0) return 1;
  if (fuels && Number(weights?.cardValue) > 0) return cost;
  const keep = gene('stock', 1) > 0 ? Math.max(0, Number(own) || 0) * STOCK_OWN : 0;
  return Math.max(1, cost - (Number(card?.bonus) || 0) - keep);
};

/**
 * Вес карты атаки: какой картой бить. Политика без оценки карты (`cardValue: 0`) все карты атаки
 * считает равными — так играют `random`, `basic` и замороженная `economy`.
 *
 * `average` — средняя сила карт атаки в **своей** колоде: премия берётся относительно неё, поэтому
 * базовый вес `attack` остаётся серединой и уже настроенные соотношения (например «при пустой руке
 * добор важнее удара») не сдвигаются. Премия ограничена половиной веса, чтобы оценка карты не
 * перевешивала решение «бить или добрать».
 *
 * `weakness` — здоровье самого слабого врага, до которого бот сейчас достаёт (0 — неизвестно). Карта,
 * которой хватает на убийство, получает премию «добить», а сила сверх нужной считается переплатой:
 * добивать помощника с 2 hp пятёркой незачем, сильная карта подождёт более крупной цели.
 *
 * `strength` — **эффективное** число карты из её же правил (`bot/play/cards.js: cardPromise`): «Погребальный
 * звон» — 6, пока Анубис не двигался. `promise` — прочая обещанная польза (сброс чужой карты, добор).
 * За обе платит ген `condition`: у эталонов он нулевой, поэтому они играют по напечатанному числу.
 *
 * **Оценка размена** (гены `tradeCost`, `tradeRisk`, `tradeWound`, `tradeFuel`/`tradeFuelSlope`,
 * политика `trade`, §37):
 * - `tradeCost` — карта в бою стоит не только своего числа: её усиление (`bonus`) сгорает вместе с ней,
 *   и карта 4/3 уносит из колоды 4 урона и 3 топлива. Отсюда `cost = (value + bonus) / value`;
 * - `tradeRisk` — ответный удар: если боец может не пережить чужую атаку (её ожидание даёт
 *   `expectedAttack`), размен плохой, если только он не добивающий. Это то же, что защита считает для
 *   себя (`threat`), только со стороны атакующего;
 * - `tradeWound` — **цена ранения в общей шкале**: бой меняет материал (моё здоровье против чужого,
 *   `material: { mine, theirs }`), и если перевес после размена ухудшается, атака дешевеет;
 * - `tradeCards` — **размен по картам**: `rivalHand` (чужие карты в руке — открытая величина) решает,
 *   ответят ли на удар картой. Пустая рука поднимает цену атаки, полная опускает: свои карты лучше не
 *   тратить, пока ответ у соперника есть;
 * - `tradeRivalFuel` — **колода соперника в цене боя**: обмен карты на карту в бою (моя в сброс, его
 *   защита в сброс) приближает к истощению того, у кого колода тоньше. Чем меньше его колода, тем дороже
 *   атака; своя тонкая колода, наоборот, просит поберечь карту (это тот же `rivalFuel`, что у темпа, но
 *   в цене одного боя);
 * - `tradeFuel`/`tradeFuelSlope` — исход колоды: у порога `tradeFuel` бездействие резко дорожает, а
 *   `tradeFuelSlope` добавляет плавный рост цены атаки по мере опустошения колоды (0 — только порог);
 * - `tempo`/`tempoRound` — **темп затянувшегося хода**: к `tempoRound`-му ходу атака получает добавку
 *   `tempo` (то есть ×(1 + `tempo`)), потому что откладывать бой при двух тонких колодах уже нечего.
 *   Это единственный ген, который смотрит на **номер хода**, а не на запас колоды.
 * - `initiative` — **взаимная летальность** (§43): если моя карта добивает врага, а его ожидаемый ответ
 *   добивает моего бойца, откладывать удар нельзя — ударит тот, чей сейчас ход. Такой удар получает
 *   множитель `1 + initiative` (страховка `tradeRisk` при этом не применяется: `kills` её и так снимает);
 * - `lastAction` — **последнее действие хода** (§43): когда действий осталось одно, добор и маневр уже
 *   ничего не успевают, и карта получает множитель `1 + lastAction`. Так бот перестаёт «копить на потом»
 *   внутри хода, где копить нечего;
 * - `actionSecond` — **после своего удара** (§43): сыгранная в этом ходу карта делает сближение дешевле
 *   (`stepCloser` × (1 − `actionSecond`)), иначе бот после удара идёт догонять вместо размена;
 * - `deal` — **затянувшийся безбойный ход** (§43): если к `dealRound`-му ходу боя не было, атака получает
 *   `1 + deal` — в паре контролей партия иначе идёт к истощению обоих (разобрано в §42);
 * - `focus`/`focusLow` — **добивание**: удар по врагу с остатком здоровья ≤ `focusLow` получает надбавку
 *   `focus · (1 − hp / focusLow)`, то есть убрать бойца с поля важнее, чем снять 3 hp с полного.
 */
export const attackWeight = (
  card,
  weights,
  {
    weakness = 0,
    average = 0,
    strength = null,
    promise = 0,
    hp = 0,
    threat = 0,
    fuel = 0,
    rivalFuel = null,
    material = null,
    rivalHand = null,
    round = 0,
    actionsLeft = null,
    inFight = true,
    enemyHp = 0,
    enemyType = null,
    enemyImportant = 0,
    stock = null,
    rivalCards = 0,
    attackerType = null,
    attackerImportant = 0,
    cancelRisk = 0,
    deferred = 0,
  } = {},
) => {
  const attack = Number(weights?.attack) || 0;
  const worth = Number(weights?.cardValue) || 0;
  const pays = Number(weights?.condition) || 0;
  const printed = Math.max(0, Number(card?.value) || 0);
  const effective =
    pays > 0 && strength != null ? Math.max(printed, Number(strength) || 0) : printed;
  const premium = pays * (Number(promise) || 0) * cancelFactor(weights, cancelRisk);
  // цена «объявил раньше окна»: обещание, которое карта получила бы на своём номере действия, теряется
  // вместе с картой (`deferred` считает `bot/play/cards.js: cardPromise`)
  const deferGene = gene('defer', Number(weights?.defer) || 0);
  const deferredLoss =
    deferGene > 0 ? deferGene * Math.max(0, Number(deferred) || 0) : 0;
  // последний щит: гибрид в атаку дешевеет, когда защит в руке и колоде почти не осталось (ген `stock`)
  const stockGain = stockFactor(weights, {
    stock,
    hybrid: String(card?.type) === 'hybrid',
    rivalCards,
  });
  // порог перевеса по здоровью: при явном перевесе партию упрощают — давим, а не берегём карту
  const leadGain = leadFactor(weights, material ?? {});
  if (worth <= 0 || average <= 0)
    return Math.max(0, (attack + premium) * stockGain * leadGain - deferredLoss);

  const kills = weakness > 0 && effective >= weakness;
  const useful = kills ? Math.min(effective, weakness) : effective;
  const scale = Math.max(-0.5, Math.min(0.5, (worth * (useful - average)) / average));
  const waste = kills ? Math.max(0, effective - weakness) : 0;

  // цена карты: усиление уходит вместе с ней, поэтому сильная карта дороже
  const bonus = Math.max(0, Number(card?.bonus) || 0);
  const cost =
    printed > 0
      ? 1 + (Number(weights?.tradeCost) || 0) * (bonus / printed)
      : 1 + (Number(weights?.tradeCost) || 0);

  // ответный удар: своё здоровье против ожидания чужой атаки (добивание от риска свободно)
  const riskGene = Number(weights?.tradeRisk) || 0;
  const risk =
    riskGene > 0 && Number(threat) > 0 && Number(hp) > 0 && !kills
      ? Math.max(
          0,
          1 - (riskGene * Math.max(0, Number(threat) - Number(hp))) / Math.max(1, Number(threat)),
        )
      : 1;

  // приманка: слабый удар дешёвого помощника по полной чужой руке — ответ всё равно потратят на него,
  // поэтому часть `tradeRisk` прощаем (ген `bait`)
  const bait = baitFactor(weights, { attackerType, attackerImportant, card, rivalCards });
  const riskNow = bait > 0 ? risk + (1 - risk) * bait : risk;

  // цена ранения в общей шкале: **отставание по материалу** (моё здоровье против чужого) поднимает
  // цену атаки — отставать нельзя, а перевес разрешает поберечь карту. Считается по открытым числам:
  // своё здоровье, здоровье чужих бойцов (помощник весит половину) и ожидание их атаки.
  const woundGene = Number(weights?.tradeWound) || 0;
  const mineHp = Number(material?.mine) || 0;
  const theirsHp = Number(material?.theirs) || 0;
  const total = mineHp + theirsHp;
  const advantage = total > 0 ? (mineHp - theirsHp) / total : 0;
  const wound = woundGene > 0 ? 1 + woundGene * Math.max(-1, Math.min(1, -advantage)) : 1;

  // исход колоды: порог «добор дороже атаки» плюс плавный рост цены атаки по мере опустошения колоды
  const fuelGene = Number(weights?.tradeFuel) || 0;
  const fuelSlope = Number(weights?.tradeFuelSlope) || 0;
  const fuelGain =
    (fuelGene > 0 && Number(fuel) <= fuelGene ? 1.5 : 1) +
    (fuelSlope > 0 ? fuelSlope / Math.max(1, Number(fuel) || 1) : 0);

  // размен по картам: чем меньше у соперника карт в руке, тем вернее удар не встретят картой, поэтому
  // цена атаки растёт; полная рука, наоборот, просит поберечь свою карту (пустая рука — множитель 1,5)
  const cardsGene = Number(weights?.tradeCards) || 0;
  const hand = Number(rivalHand);
  const cardsGain =
    cardsGene > 0 && Number.isFinite(hand)
      ? 1 + cardsGene * 0.5 * (1 - Math.max(0, Math.min(1, hand / 5)))
      : 1;

  // колода соперника в цене боя: обмен карты на карту приближает к истощению того, чья колода тоньше,
  // поэтому тонкая чужая колода поднимает цену атаки, а тонкая своя — опускает
  const rivalFuelGene = Number(weights?.tradeRivalFuel) || 0;
  const rival = Number(rivalFuel);
  // моя колода минус чужая: впереди по запасу — тонкая чужая колода, значит истощение ближе у него
  const fuelLean = Math.max(0, Number(fuel) || 0) - Math.max(0, rival);
  const deckGain =
    rivalFuelGene > 0 && Number.isFinite(rival)
      ? 1 + rivalFuelGene * 0.4 * Math.max(-1, Math.min(1, fuelLean / 8))
      : 1;

  // Темп затянувшегося хода (§43): цена откладывания. Колоды кончаются у обоих, и в этой фазе «поберечь
  // карту» уже не работает — тянуть означает ждать истощения, которое бьёт по обоим одинаково, а тот, кто
  // ударит первым, заберёт инициативу. Сигнал — номер хода, которого у других генов не было (у `tradeFuel`
  // и `tradeRivalFuel` считается только запас колоды).
  const tempoGene = gene('tempo', Number(weights?.tempo) || 0);
  const tempoRound = Math.max(1, gene('temporound', Number(weights?.tempoRound) || 20));
  const tempoGain =
    tempoGene > 0 ? 1 + tempoGene * Math.min(1, Math.max(0, Number(round) || 0) / tempoRound) : 1;

  // взаимная летальность: добиваю его — и он добивает меня ответом. Первым бьёт тот, чей ход, поэтому
  // цена откладывания бесконечна, а цена удара — нет
  const initiativeGene = gene('initiative', Number(weights?.initiative) || 0);
  const lethalTrade =
    initiativeGene > 0 &&
    kills &&
    Number(threat) > 0 &&
    Number(hp) > 0 &&
    Number(threat) >= Number(hp)
      ? 1 + initiativeGene
      : 1;

  // последнее действие хода: добор и маневр уже не успевают ничего, поэтому карта весит больше
  const lastGene = gene('lastaction', Number(weights?.lastAction) || 0);
  const lastGain =
    lastGene > 0 && Number.isFinite(Number(actionsLeft)) && Number(actionsLeft) <= 1
      ? 1 + lastGene
      : 1;

  // затянувшийся безбойный ход: боя ещё не было, а ход уже поздний — в паре контролей это дорога
  // к истощению обоих, поэтому атака дешевеет (разобрано в §42)
  const dealGene = gene('deal', Number(weights?.deal) || 0);
  const dealRound = Math.max(1, gene('dealround', Number(weights?.dealRound) || 15));
  const dealGain =
    dealGene > 0 && inFight === false && (Number(round) || 0) >= dealRound ? 1 + dealGene : 1;

  // добивание раненого: убрать бойца с поля важнее, чем снять те же 3 hp с полного
  const focusGene = gene('focus', Number(weights?.focus) || 0);
  const focusLow = Math.max(1, gene('focuslow', Number(weights?.focusLow) || 5));
  const focusGain =
    focusGene > 0 && Number(enemyHp) > 0 && Number(enemyHp) <= focusLow
      ? 1 + focusGene * (1 - Number(enemyHp) / focusLow)
      : 1;

  // За что платит добивание: убрать героя — победа; важного помощника (Амат держит пелену, ворона носит
  // «Клёв в темноте») — половина цены; обычное тело — мелочь. Без этой доли карта с 5 атаки на помощника
  // с 2 hp получала ту же премию, что и удар по герою (жалоба владельца, m01732).
  const finishGene = Number(weights?.finish) || 0;
  const finishBody = Math.max(0, Math.min(1, gene('finishbody', Number(weights?.finishBody) || 0)));
  const bodyWorth =
    enemyType == null || String(enemyType) === 'hero'
      ? 1
      : 0.15 + 0.85 * Math.min(1, Math.max(0, Number(enemyImportant) || 0));
  const finishGain = kills ? finishGene * (1 - finishBody * (1 - bodyWorth)) : 0;

  return Math.max(
    0,
    (attack *
      (1 + scale) *
      fuelGain *
      cardsGain *
      deckGain *
      riskNow *
      wound *
      tempoGain *
      lethalTrade *
      lastGain *
      dealGain *
      focusGain *
      stockGain *
      leadGain -
      (attack * worth * waste) / Math.max(1, average) / 2) /
      Math.max(1, cost) +
      finishGain +
      premium -
      deferredLoss,
  );
};

/**
 * Вес карты защиты: закрыть ровно столько, сколько нужно, и не переплачивать. `threat` — число
 * объявленной карты атаки (0 — неизвестно). Переплата силой карты не даёт ничего: урон считается как
 * `max(0, атака − защита)`, поэтому лишние очки защиты сгорают вместе с картой.
 *
 * `strength` — эффективное число карты из её правил: у «Санава» значение равно усилению чужой атаки,
 * и в открытом бою это уже известно (`cardPromise` с `open: true`). Платит за него ген `condition`.
 */
export const defenseWeight = (
  card,
  weights,
  { threat = 0, strength = null, save = null, cancels = false } = {},
) => {
  const defend = Number(weights?.defend) || 0;
  const worth = Number(weights?.cardValue) || 0;
  const printed = Math.max(0, Number(card?.value) || 0);
  const effective =
    (Number(weights?.condition) || 0) > 0 && strength != null
      ? Math.max(printed, Number(strength) || 0)
      : printed;
  const keep = saveFactor(weights, save, threat) * cancelKeepFactor(weights, { cancels, save, threat, effective });
  if (worth <= 0) return defend * keep;

  if (threat <= 0) return (defend + worth * effective) * keep;

  return (
    Math.max(
      0,
      defend + worth * Math.min(effective, threat) - worth * Math.max(0, effective - threat),
    ) * keep
  );
};

/**
 * Стоит ли вообще спасать того, по кому бьют. Карта защиты — это тоже карта, и тратить её на тело с
 * 2 hp обычно глупо: помощник вернётся картой возврата, а защита ушла. Исключение — **важный** помощник
 * (`bot/play/pool.js: assistantImportance`): у Анубиса от Амат зависит активность пелены, у Снежной
 * королевы ворона — атака «Клёв в темноте», поэтому за них держатся. Приговорённое тело (урон уже не
 * меньше здоровья) не спасают вовсе: карта уйдёт впустую.
 */
const saveFactor = (weights, save, threat) => {
  const body = gene('defendbody', Number(weights?.defendBody) || 0);
  if (body <= 0 || save == null || save.type !== 'assistant') return 1;
  if (save.important === true) return 1 + body;

  const doomed = Number(threat) > 0 && Number(threat) >= (Number(save.hp) || 0);
  return Math.max(0.05, 1 - body * (doomed ? 1 : 0.7));
};

/**
 * Вес варианта свойства (`optionWorth` из `bot/play/cards.js`: польза и цена в единицах «примерно карта»).
 * `option: 0` — политика варианты не оценивает, все равны (нужно фаззингу: иначе редкие ступени
 * перестают проверяться).
 */
export const optionWeight = (worth, weights) => {
  const option = Number(weights?.option) || 0;
  if (option <= 0) return 1;

  const gain =
    (Number(worth?.value) || 0) - (Number(weights?.optionCost) || 0) * (Number(worth?.cost) || 0);
  return Math.max(0, option * (1 + gain));
};

/**
 * Вес цели: добить раненого (`finish`), ударить героя (`heroTarget`), прочий боец (`target`).
 * Здоровье и тип чужого бойца открыты любому клиенту — это не чтение чужой руки, а то же, что видит
 * игрок на доске. Свой боец (выбор атакующего) сюда не попадает: за него отвечает `pick`.
 */
export const targetWeight = (fighter, weights) => {
  if (!fighter) return Number(weights?.pick) || 1;
  const hp = Number(fighter.currentHp) || 0;
  if (hp <= 3) return Number(weights?.finish) || 1;
  if (fighter.type === 'hero') return Number(weights?.heroTarget) || 1;
  return Number(weights?.target) || 1;
};

/**
 * Вес шага в окне перемещения. Виды: `step` — выйти на дистанцию удара, `closer` — подойти ближе,
 * `away` — выйти из-под удара (враг ближе своей дальности, а мы достаём дальше), `idle` — топтание.
 * Шаг на **свою** стихию получает премию `terrain`: паспорт героя подсказывает, где ему выгодно стоять.
 * У эталонов `terrain: 0`, но шаг «в никуда» с нулевым весом всё равно не предлагается — иначе бот
 * топчется и партия не заканчивается.
 *
 * Сверх этого три признака поля (`.docs/bot-strategies.md` пп. 1, 2 «б», 8):
 * - `noAttack` — **опасная дистанция**: с клетки не достаём никого, а враг оттуда достаёт. Такой шаг
 *   оплачивает чужой ход, поэтому множитель `contactFactor` его снимает;
 * - `foeTerrain` — клетка чужой стихии: встать туда, где срабатывают карты соперника, — контроль поля;
 * - `foeRoute`/`foeRoom` — перекрыть кратчайший путь чужого героя к моим дешёвым бойцам и закрыть ему
 *   выход: это те же единицы, что у `guard` (перекрытие пути к своему герою), только с той стороны.
 * - `flee` — отход в тыл: приговорённый важный помощник (Амат, ворона) уходит, пока держит механику пака.
 */
export const movementWeight = (
  weights,
  {
    kind = 'idle',
    affinity = false,
    guard = 0,
    exposed = 0,
    noAttack = false,
    foeTerrain = false,
    foeRoute = 0,
    foeRoom = 0,
    flee = 0,
  } = {},
) => {
  const base =
    kind === 'step'
      ? weights?.step
      : kind === 'closer'
        ? weights?.stepCloser
        : kind === 'away'
          ? weights?.stepAway
          : weights?.stepIdle;
  const bonus = affinity ? Number(weights?.terrain) || 0 : 0;
  // тело в проходе: клетка, после которой врагу до героя дольше, стоит премии `guard`; клетка под
  // тремя стволами — штрафа `exposed`. Премия не перевешивает сам шаг: позиция важна, но не вместо хода.
  // Потолок у топтания — `guardFloor`: перекрыть проход можно и стоя в стороне (шаг «в никуда» весит 0
  // и не предлагается), иначе помощник-блокер физически не мог встать в коридор
  const cap = Math.max(Number(base) || 0, gene('guardfloor', Number(weights?.guardFloor) || 0));
  const cover = Math.min(
    cap,
    gene('guard', Number(weights?.guard) || 0) * Math.max(0, Number(guard) || 0),
  );
  const risk = gene('exposed', Number(weights?.exposed) || 0) * Math.max(0, Number(exposed) || 0);
  const contact = noAttack ? contactFactor(weights) : 1;
  const ground = foeTerrain
    ? gene('foeterrain', Number(weights?.foeterrain) || 0) * FOE_TERRAIN
    : 0;
  const route = gene('foeguard', Number(weights?.foeguard) || 0) * FOE_ROUTE * share01(foeRoute);
  const room = gene('foeroom', Number(weights?.foeroom) || 0) * FOE_ROOM * share01(foeRoom);
  const rear = gene('flee', Number(weights?.flee) || 0) * FLEE_STEP * share01(flee);

  return Math.max(
    0,
    ((Number(base) || 0) + bonus + cover - risk) * contact + ground + route + room + rear,
  );
};

/**
 * Вес клетки для **телепорта** — постановки без прохода («Немой приговор», перенос Анубиса на песок,
 * «Путь на закате»). Телепорт от шага отличается не ценой пути, а его отсутствием: маршрут не тратится,
 * поэтому клетка оценивается **сама по себе** — вышел ли из-под удара, достаёшь ли оттуда, срезало ли
 * путь. Шаг и телепорт считаются разными функциями, иначе перенос получал цену топтания (`stepIdle: 0`)
 * и окно закрывалось первым попавшимся вариантом. `shortcut` — сколько шагов перенос срезал.
 */
export const TELEPORT_SHORTCUT = 1.2;
/** «Ничего не изменилось» в шкале телепорта: клетка равна отказу от переноса (`pick`). */
export const TELEPORT_BASE = 1;
/** Дотянуться до цели оттуда, куда перенос ставит, — главная причина телепорта (Дороти к дальнику). */
export const TELEPORT_REACH = 3;
export const TELEPORT_CLOSER = 1.2;
export const TELEPORT_ESCAPE = 1.6;
export const TELEPORT_HOLD = 0.5;
export const TELEPORT_RISK = 2;

export const teleportWeight = (
  weights,
  { kind = 'idle', affinity = false, guard = 0, exposed = 0, shortcut = 0 } = {},
) => {
  // Своя база, а не `movementWeight`: у шага «топтание» и «уход» весят 0 (иначе бот топчется), а у
  // переноса 0 значил бы «отказ выгоднее любого выхода из-под удара» — окно закрывалось бы первым
  // попавшимся вариантом. Здесь 1 — «позиция не изменилась», всё, что лучше, добавляет, что хуже, снимает
  const reach =
    kind === 'step'
      ? TELEPORT_REACH
      : kind === 'closer'
        ? TELEPORT_CLOSER
        : kind === 'away'
          ? TELEPORT_ESCAPE
          : 0;
  const terrain = affinity ? Math.max(0, Number(weights?.terrain) || 0) * 0.2 : 0;
  const cover =
    gene('guard', Number(weights?.guard) || 0) * TELEPORT_HOLD * Math.max(0, Number(guard) || 0);
  const risk =
    gene('exposed', Number(weights?.exposed) || 0) *
    TELEPORT_RISK *
    Math.max(0, Number(exposed) || 0);
  const cut =
    gene('teleport', Number(weights?.teleport) ?? 1) *
    Math.max(0, Number(shortcut) || 0) *
    TELEPORT_SHORTCUT;

  return Math.max(0, TELEPORT_BASE + reach + terrain + cover - risk + cut);
};

/**
 * Вес обмена бойцов местами (`SWAP_FIGHTERS` — умение Дороти и «Тото отвлекает»). Обмен бесплатен и не
 * трогает бюджет движения, поэтому его цена — прирост позиции **двух** бойцов: `delta` считается той же
 * шкалой, что и вес шага (`movementWeight`), и приходит от `bot/play/decide.js: swapDelta`.
 */
export const swapWeight = (weights, { delta = 0 } = {}) => {
  const base = Number(weights?.pick) || 0;
  const gain = gene('swap', Number(weights?.swap) ?? 1) * Number(delta);

  return Math.max(0.01, base + gain);
};

/** Во сколько единиц веса обходится шаг «плохой» клетки при чужом переносе (`banishWeight: value`). */
export const BANISH_STEP = 1.5;

/**
 * Вес клетки для **чужого** переноса: врага выгодно выселить под свои удары и подальше от своих
 * (`banishWeight`), а не жребием, как было (`weights.pick` на все клетки).
 */
export const banishWeight = (weights, { value = 0 } = {}) => {
  const base = Number(weights?.pick) || 0;
  const gain = gene('banish', Number(weights?.banish) ?? 1);

  return Math.max(0.01, base + gain * BANISH_STEP * Number(value));
};

/**
 * Вес «закончить перемещение». `good` — позиция уже выгодная (в своей дистанции, а враг оттуда не
 * достаёт), `affinity` — стоим на своей стихии: за такое место держатся, поэтому добавляется `hold`.
 */
export const holdWeight = (weights, { useful = false, good = false, affinity = false } = {}) => {
  const base = useful ? weights?.movePass : weights?.movePassIdle;
  const bonus = good || affinity ? Number(weights?.hold) || 0 : 0;

  return Math.max(0, (Number(base) || 0) + bonus);
};

/**
 * Вес **своего** бойца, когда выбирают, кто будет бить. Раньше все свои были равны (`pick` = 1), то есть
 * бот одинаково охотно посылал в бой полного героя и помощника с одним здоровьем — решал только
 * роллаут. Здесь два правила, оба про размен:
 *
 * - **здоровье**: ответный урон достаётся тому, кто ударил, поэтому полный боец охотнее;
 * - **важность** (`bot/play/pool.js: assistantImportance`): важного помощника (Амат, ворона) в размен не
 *   посылают — на нём держится механика пака.
 *
 * Усиление ограничено: это перевес между своими, а не замена решения «бить или нет». Ноль гена
 * (`BOT_GENE_ATTACKERS=0`) возвращает прежнее равенство — так правка меряется.
 */
export const ATTACKER_HEALTH = 0.4;
export const ATTACKER_IMPORTANT = 0.5;

export const attackerWeight = (weights, fighter, { importance = 0 } = {}) => {
  const base = Number(weights?.pick) || 0;
  const power = gene('attackers', 1);
  if (!(power > 0) || fighter == null) return base;

  const hp = Math.max(0, Number(fighter.currentHp) || 0);
  const max = Math.max(hp, Number(fighter.startHp) || hp) || 1;
  const health = hp / max;
  // важность считается только у помощников: у героя она и так единица по смыслу
  const keyed =
    String(fighter.type) === 'hero' ? 0 : Math.max(0, Math.min(1, Number(importance) || 0));

  return base * (1 + ATTACKER_HEALTH * power * health) * (1 - ATTACKER_IMPORTANT * power * keyed);
};

/** До какого запаса колоды добор считается рискованным: пустая колода — это 2 урона за карту. */
export const FATIGUE_MARGIN = 6;

/**
 * Вес добора. Колода **не перетасовывается** (`shared/actions/cards.js`), сброс топливом не считается,
 * поэтому каждый добор приближает истощение: при запасе меньше `FATIGUE_MARGIN` добор дешевеет
 * (`fatigue` — насколько сильно). Исключение — почти пустая рука: без карт боец не бьёт и не защищается,
 * поэтому там добор нужен любой ценой, и вес `draw` остаётся как задан политикой.
 *
 * **Сушка руки** (`choke`): добор при полной руке — это карта из колоды сразу в сброс, потому что в конце
 * хода рука сбрасывается до лимита. Такая карта сожжена, а не сыграна, поэтому вес добора падает на долю,
 * которая не влезет. Ноль гена — прежнее поведение.
 */
export const drawWeight = (
  weights,
  { fuel = FATIGUE_MARGIN, hand = 3, handLimit = 7, amount = 1 } = {},
) => {
  const draw = Number(weights?.draw) || 0;
  const fatigue = Number(weights?.fatigue) || 0;
  const choke = chokeFactor(weights, { hand, handLimit, amount });
  if (fatigue <= 0 || hand <= 1 || fuel >= FATIGUE_MARGIN) return draw * choke;

  return draw * Math.max(0, fuel / FATIGUE_MARGIN) ** fatigue * choke;
};

/**
 * Множитель «рука и так полная»: сколько добра теряется в конце хода, столько и снимается с веса.
 * `hand` и `handLimit` — свои; лимит берётся у игрока, а не из правил, потому что умение его понижает.
 *
 * Не ноль: маневр — это ещё и **перемещение**, а не только добор, и запирать бойца «на месте, пока рука
 * полная» нельзя — бывает, что уйти дороже, чем сжечь карту. Это вычет (как `keepPrice`), а не вето.
 */
const CHOKE_FLOOR = 0.3;

const chokeFactor = (weights, { hand = 3, handLimit = 7, amount = 1 } = {}) => {
  const choke = Number(weights?.choke) || 0;
  if (choke <= 0 || amount <= 0) return 1;
  const room = Math.max(0, Number(handLimit) - Number(hand));

  return Math.max(CHOKE_FLOOR, 1 - choke * Math.max(0, 1 - room / amount));
};

/** Запас колоды, с которого израсходованная карта начинает чего-то стоить: топливо кончается раньше нуля. */
export const KEEP_FUEL = 10;

/**
 * Цена одной израсходованной карты в общей шкале веса. Считается по делу: карта ушла из руки — рука
 * доберётся до лимита, а пустая колода это **2 урона за карту** истощения. Одна карта в бою весит
 * несколько единиц, поэтому и цена карты мерится не десятыми.
 */
export const KEEP_CARD = 4;

/**
 * Цена карты **как запаса** (запрос владельца, m02166). Разыгранная карта уходит в сброс, а рука всё равно
 * доберётся до лимита, поэтому каждая трата приближает конец колоды — а пустая колода это истощение, 2 урона
 * за карту. Ошибка прежних версий — оценивать только пользу эффекта: карта стоит ещё и как топливо будущих
 * боёв, и когда колода тонкая или соперник по колоде впереди, слабую пользу гасим. Возвращает **вычитаемое**
 * из веса, поэтому решает не «играть или нет», а «стоит ли эта польза такой карты».
 *
 * Ноль у гена — прежнее поведение: `$env:BOT_GENE_KEEP='0'`.
 */
export const keepPrice = (weights, { fuel = KEEP_FUEL, rivalFuel = null } = {}) => {
  const keep = Number(weights?.keep) || 0;
  if (keep <= 0) return 0;
  const mine = Number(fuel) || 0;
  const deficit = Math.max(0, KEEP_FUEL - mine) / KEEP_FUEL;
  // соперник по колоде впереди — его часы идут медленнее: тянуть нам нельзя, но и сбрасывать нечего
  const behind =
    rivalFuel == null ? 0 : Math.max(0, (Number(rivalFuel) || 0) - mine) / (2 * KEEP_FUEL);

  return keep * KEEP_CARD * (deficit + behind);
};

/** Запас защит (рука + колода), ниже которого гибрид в атаку — это трата последнего щита (`defenseStock`). */
export const KEEP_DEFENSE = 2;

/** Насколько гибрид в атаку дешевеет при пустом запасе защит и полной чужой руке; пол — `STOCK_FLOOR`. */
const STOCK_ATTACK = 0.5;
const STOCK_FLOOR = 0.25;

/** Насколько своя механика карты (отмена, добор, лечение) поднимает её цену в окне «карту тратят». */
const STOCK_OWN = 0.5;

/**
 * Порог «важного» помощника: на нём держится механика пака (Амат, ворона, Тото) — таким в размен не
 * ходят, и приманкой он быть не может. Тот же порог читает `decide.js` (`assistantImportance`).
 */
export const BODY_KEY = 0.5;

/** Перевес по материалу (в hp), за которым цена атаки меняется сразу, а не плавно. */
const LEAD_HP = 5;
/** Насколько дороже атака при перевесе (`×1,28`) и дешевле при таком же отставании (`×0,85`). */
const LEAD_ATTACK = 0.28;
const LEAD_BEHIND = 0.15;

/**
 * **Порог перевеса по здоровью** (`.docs/bot-strategies.md` п. 9). `wound` считает перевес плавно, а на
 * 4 hp разницы даёт всего ~10% скидки — при явном перевесе партию надо упрощать, а не отсиживаться.
 * Поэтому за порогом `LEAD_HP` цена атаки падает сразу на `LEAD_ATTACK`, а при таком же отставании —
 * растёт на `LEAD_BEHIND`. Материал приходит симметричным: герой 1, помощник 0.5 (`decide.js`).
 *
 * `BOT_GENE_LEAD=0` возвращает прежнее поведение — так правка меряется.
 */
export const leadFactor = (weights, { mine = 0, theirs = 0 } = {}) => {
  const power = gene('lead', 1);
  if (!(power > 0)) return 1;
  const lead = (Number(mine) || 0) - (Number(theirs) || 0);
  if (lead >= LEAD_HP) return 1 + LEAD_ATTACK * power;
  if (lead <= -LEAD_HP) return Math.max(0.5, 1 - LEAD_BEHIND * power);

  return 1;
};

/** Карта, которой бьют **приманкой**: не убить, а выбить защиту из чужой руки. */
const BAIT_CARD = 2;

/** Насколько приманка снимает риск ответного удара: ответ по дешёвому телу — не потеря героя. */
const BAIT_RISK = 0.6;

/**
 * **Приманка помощником** (`.docs/bot-strategies.md` п. 2). Помощник бьёт **слабой** картой, чтобы
 * соперник потратил ответ, — и удар героя потом встречает уже пустая рука. Риск ответного удара для
 * такого удара считается иначе: тело дешёвое, а рука соперника полна, значит ответ всё равно потратят на
 * него. Возвращает долю, на которую нужно «простить» `tradeRisk` (0 — приманки нет).
 *
 * Условия: бьёт помощник, он не важный (`BODY_KEY`), карта не сильнее `BAIT_CARD`, у соперника 4+ карт.
 * `BOT_GENE_BAIT=0` возвращает прежнее поведение — так правка меряется.
 */
export const baitFactor = (
  weights,
  { attackerType = null, attackerImportant = 0, card = null, rivalCards = 0 } = {},
) => {
  const power = gene('bait', 1);
  if (!(power > 0)) return 0;
  if (String(attackerType) !== 'assistant') return 0;
  if ((Number(attackerImportant) || 0) >= BODY_KEY) return 0;
  if (Math.max(0, Number(card?.value) || 0) > BAIT_CARD) return 0;
  if ((Number(rivalCards) || 0) < 4) return 0;

  return Math.min(1, power) * BAIT_RISK;
};

/**
 * **Запас защит** (`defenseStock`, `.docs/bot-strategies.md` п. 3). Гибрид — это и удар, и защита: бить
 * им, когда в руке и колоде осталась одна защитная карта или ни одной, значит отдать последний щит
 * в обмен, на который ответят картой. Множитель к весу атаки гибридом; условия включения — защит
 * меньше `KEEP_DEFENSE` **и** у соперника в руке 3+ карты (иначе ответа не будет и беречь нечего).
 *
 * `BOT_GENE_STOCK=0` возвращает прежнее поведение — так правка меряется.
 */
export const stockFactor = (weights, { stock = null, hybrid = false, rivalCards = 0 } = {}) => {
  const power = gene('stock', 1);
  if (!(power > 0) || !hybrid) return 1;
  const left = Number(stock);
  if (!Number.isFinite(left) || left >= KEEP_DEFENSE) return 1;
  if ((Number(rivalCards) || 0) < 3) return 1;

  return Math.max(STOCK_FLOOR, 1 - STOCK_ATTACK * power);
};

/** Доля признака в 0…1: премии шага приходят нормализованными, но округления их не гарантируют. */
const share01 = value => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * **Опасная дистанция** (`.docs/bot-strategies.md` п. 1): насколько дешевеет шаг в контакт, из которого не
 * бьёшь. Это тот самый размен темпа, на котором опытный игрок и проигрывает: подошёл, потратил действие,
 * не ударил — и получил чужой ход в упор. Порог не ноль: бывают позиции, где подойти выгодно (перевес по
 * колоде, дешёвая приманка), и выключать шаги целиком нельзя — партия встанет.
 */
const CONTACT_PENALTY = 0.55;

export const contactFactor = weights => {
  const power = gene('contact', Number(weights?.contact) || 0);
  if (!(power > 0)) return 1;

  return Math.max(0.2, 1 - CONTACT_PENALTY * Math.min(1, power));
};

/**
 * **Отмены по остатку колоды** (`.docs/bot-strategies.md` п. 5, `counting.js: cancelRiskOf`): обещанная
 * картой польза гасится вероятностью, что у соперника в руке лежит отмена. Карта-отмена живёт в чужой
 * колоде до боя, поэтому «Гробницу» с большим обещанием больше не бьют в полную руку вслепую.
 */
const CANCEL_PREMIUM = 0.8;

const cancelFactor = (weights, risk) => {
  const power = gene('cancel', Number(weights?.cancel) || 0);
  const chance = Math.max(0, Math.min(1, Number(risk) || 0));
  if (!(power > 0) || chance <= 0) return 1;

  return Math.max(0.2, 1 - CANCEL_PREMIUM * power * chance);
};

/** Насколько своя отмена дешевеет, когда ею закрывают удар без свойств и без риска для бойца. */
const CANCEL_DEFENSE = 0.45;

const cancelKeepFactor = (weights, { cancels = false, save = null, threat = 0, effective = 0 } = {}) => {
  const power = gene('cancel', Number(weights?.cancel) || 0);
  if (!(power > 0) || cancels !== true) return 1;
  const hp = Number(save?.hp) || 0;
  if (hp <= 0 || Number(threat) <= 0) return 1;
  // карта спасает: урон после защиты сравним с остатком здоровья — тут отмена уместна
  const damage = Math.max(0, Number(threat) - Number(effective));
  if (damage >= hp - 1) return 1;

  return Math.max(0.2, 1 - CANCEL_DEFENSE * power);
};

/** Премия за шаг на **чужую** стихию: там срабатывают карты соперника, и стоять на них ему не дают. */
const FOE_TERRAIN = 2.4;
/** Премия за перекрытие кратчайшего пути чужого героя к моему дешёвому бойцу (в единицах веса шага). */
const FOE_ROUTE = 2.6;
/** Премия за закрытый выход чужого героя: шаг уменьшает число его свободных клеток. */
const FOE_ROOM = 2.2;
/** Премия за шаг в тыл приговорённому важному помощнику (за клетку отрыва, до трёх). */
const FLEE_STEP = 2;

/**
 * Обмен бойцов местами (`SWAP_FIGHTERS`): **герой дороже помощника**. Позиция героя решает партию, а тело
 * помощника — расход, поэтому прирост позиции считается с разным весом (`decide.js: swapDelta`).
 * Числа — из разбора Дороти (`.docs/bot-strategies.md`, «Асимметрия размена»): ×2,5 и ×0,5.
 */
export const SWAP_HERO = 2.5;
export const SWAP_BODY = 0.5;
