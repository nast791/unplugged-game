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
 *   колоду, когда до истощения близко). Ноль — эталонное поведение.
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
    // бой: сила карты, добор раненого и цена свойства
    cardValue: 1.5,
    option: 1,
    optionCost: 1,
    // цель: раненого добивают, герой важнее помощника
    finish: 12,
    heroTarget: 6,
    target: 2,
  };
};

/** Признаки позиции и усталости выключены: эталон замеров §13–§14. */
const NO_POSITION = { stepAway: 0, hold: 0, terrain: 0, fatigue: 0 };

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
    const fuel = Number(situation?.fuel) || 0;
    const rivalFuel = Number(situation?.rivalFuel) || 0;
    const clock = Math.max(-1, Math.min(1, (fuel - rivalFuel) / 8));
    // впереди (clock > 0) — жить долго; позади (clock < 0) — давить; равенство — без надбавки
    const press = 1 + 1.2 * Math.max(0, -clock);
    const hold = 1 + 0.8 * Math.max(0, clock);
    return {
      ...base,
      attack: base.attack * press,
      stepCloser: base.stepCloser * (1 + 0.6 * Math.max(0, -clock)),
      draw: base.draw * (1 - 0.5 * Math.max(0, clock)),
      stepAway: (base.stepAway ?? 0) * 0.75 * hold,
      hold: (base.hold ?? 0) * hold,
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
    };
  },

  /**
   * Доигрывающая политика для поиска: тот же `greedy`, но с усиленной атакой и без кайта. Нужна, чтобы
   * роллаут видел бой, а не перетягивание: с осторожной политикой поиск откладывает невыгодный размен, и
   * партия тянется до истощения (бесплатного паса в игре нет — каждый маневр сжигает карту колоды).
   * Сама боевая политика остаётся `greedy` — агрессия нужна только для оценки последствий.
   */
  aggressive: situation => {
    const base = greedyBase(situation);
    return {
      ...base,
      attack: base.attack * 3,
      draw: Math.max(1, base.draw * 0.5),
      stepAway: 0,
      hold: 0,
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
   * Поиск, у которого лист оценивает **ученик**: в позиции на границе доигрывания он делает свой лучший
   * ход собственными `Q(s, a)` (`bot/play/search.js: qvalueLeaf`). Это «ученик считает вперёд» — один шаг
   * пересчёта его же оценками, а не подсказка корню. Отдельное имя нужно для замера:
   * `--policy=qleaf --policy-b=search` — те же сиды и бюджет, отличается только лист.
   */
  qleaf: situation => greedyBase(situation),

  /**
   * Ученик, который **сам считает наперёд**: к своей прямой оценке действия он добавляет свой же пересчёт
   * следующей позиции (`bot/play/decide.js: deepOptions`, `QVALUE_LOOKAHEAD`). Ни поиска, ни оракула —
   * это `qvalue` плюс один свой шаг вперёд. Отдельное имя нужно для замера: `--policy=qdeep --policy-b=greedy`.
   */
  qdeep: situation => greedyBase(situation),

  /**
   * Ученик, который **думает пересчётом вперёд в одной шкале**: свои ходы — максимум, ответы соперника —
   * минимум, лист — его собственная оценка позиции `V(s)` (`bot/play/decide.js: thinkOptions`,
   * глубина `QVALUE_DEPTH`). Больше глубины — больше пересчёта; это то, что должно улучшать решение.
   * Отдельное имя для замера: `--policy=qthink --policy-b=greedy`.
   */
  qthink: situation => greedyBase(situation),

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
   * Поиск с **приором от ученика**: лист считается как у `search` (ручная формула), а подсказкой корня
   * служит оценка обученной модели (`bot/play/qvalue.js`, `bot/play/search.js: rootPriors`). Отдельное имя
   * нужно, чтобы измерить вклад приора: `--policy=qprior --policy-b=search` — те же сиды, тот же бюджет,
   * разница только в том, чьё мнение о вариантах получает поиск.
   */
  qprior: situation => greedyBase(situation),

  /**
   * Обученная тренером оценка пары «состояние + действие» (`trainer/`, артефакт читает
   * `bot/play/qvalue.js`): варианты перечисляются жадно, а веса переставляет модель. Пока артефакта нет,
   * веса остаются жадными — политика не падает, а играет как `greedy` (`hasQValue`).
   */
  qvalue: situation => greedyBase(situation),

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
   * учитываются. Эталон первого замера (`docs/hero-balance.md` §12): сравнение `greedy` против `basic`
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
 */
export const cardCostWeight = (card, weights, { fuels = false } = {}) => {
  const cost = Number(weights?.cardCost) || 0;
  if (cost <= 0) return 1;
  if (fuels && Number(weights?.cardValue) > 0) return cost;
  return Math.max(1, cost - (Number(card?.bonus) || 0));
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
 *   `tradeFuelSlope` добавляет плавный рост цены атаки по мере опустошения колоды (0 — только порог).
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
  } = {},
) => {
  const attack = Number(weights?.attack) || 0;
  const worth = Number(weights?.cardValue) || 0;
  const pays = Number(weights?.condition) || 0;
  const printed = Math.max(0, Number(card?.value) || 0);
  const effective =
    pays > 0 && strength != null ? Math.max(printed, Number(strength) || 0) : printed;
  const premium = pays * (Number(promise) || 0);
  if (worth <= 0 || average <= 0) return attack + premium;

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

  return Math.max(
    0,
    (attack * (1 + scale) * fuelGain * cardsGain * deckGain * risk * wound -
      (attack * worth * waste) / Math.max(1, average) / 2) /
      Math.max(1, cost) +
      (kills ? Number(weights?.finish) || 0 : 0) +
      premium,
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
export const defenseWeight = (card, weights, { threat = 0, strength = null } = {}) => {
  const defend = Number(weights?.defend) || 0;
  const worth = Number(weights?.cardValue) || 0;
  const printed = Math.max(0, Number(card?.value) || 0);
  const effective =
    (Number(weights?.condition) || 0) > 0 && strength != null
      ? Math.max(printed, Number(strength) || 0)
      : printed;
  if (worth <= 0) return defend;

  if (threat <= 0) return defend + worth * effective;

  return Math.max(
    0,
    defend + worth * Math.min(effective, threat) - worth * Math.max(0, effective - threat),
  );
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
 */
export const movementWeight = (weights, { kind = 'idle', affinity = false } = {}) => {
  const base =
    kind === 'step'
      ? weights?.step
      : kind === 'closer'
        ? weights?.stepCloser
        : kind === 'away'
          ? weights?.stepAway
          : weights?.stepIdle;
  const bonus = affinity ? Number(weights?.terrain) || 0 : 0;

  return Math.max(0, (Number(base) || 0) + bonus);
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

/** До какого запаса колоды добор считается рискованным: пустая колода — это 2 урона за карту. */
export const FATIGUE_MARGIN = 6;

/**
 * Вес добора. Колода **не перетасовывается** (`shared/actions/cards.js`), сброс топливом не считается,
 * поэтому каждый добор приближает истощение: при запасе меньше `FATIGUE_MARGIN` добор дешевеет
 * (`fatigue` — насколько сильно). Исключение — почти пустая рука: без карт боец не бьёт и не защищается,
 * поэтому там добор нужен любой ценой, и вес `draw` остаётся как задан политикой.
 */
export const drawWeight = (weights, { fuel = FATIGUE_MARGIN, hand = 3 } = {}) => {
  const draw = Number(weights?.draw) || 0;
  const fatigue = Number(weights?.fatigue) || 0;
  if (fatigue <= 0 || hand <= 1 || fuel >= FATIGUE_MARGIN) return draw;

  return draw * Math.max(0, fuel / FATIGUE_MARGIN) ** fatigue;
};
