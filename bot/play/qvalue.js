/**
 * Артефакт тренера (`trainer/README.md`) в игре: оценка пары «состояние + действие».
 *
 * Учится на точках решения из движка (`bot/learn/export.js` → JSONL → тренер), а здесь только
 * применяется: модель считает оценку каждого варианта хода и переставляет их веса. Раньше оценка была
 * только у позиции, и шесть замеров подряд (§17–§21) показали, что такая оценка насыщена — этот модуль
 * пробует то, чего в проекте ещё не было: ценность **действия**.
 *
 * Формула (её же считает тренер — `trainer/linear.py`, поэтому расхождений быть не может):
 *
 *   summary = признаки позиции, от которых зависит выбор действия (список — в артефакте)
 *   score   = b + wState·state + wAction·action + wCross·(summary ⊗ action)
 *               + heroBias[мой] + rivalBias[чужой] + cardBias[карта]
 *   value   = bValue + wValue·state
 *
 * Модель линейная, но со скрещиванием признаков позиции и действия: без него внутри одной точки решения
 * все варианты имели бы одинаковую часть от позиции, и ранжирование задавал бы «общий вкус к действию»,
 * а не «уместность здесь». Весит килобайты и считается за микросекунды — то есть может уехать в браузер,
 * где `vs_ai` считает ход в бюджете 200 мс.
 */
import { tableOf } from './artifact.js';
import weights from './qvalue-weights.js';
import { ACTION_FEATURES, actionFeatures, heroOf, rivalOf } from './actionFeatures.js';
import { cardIdOf } from './metrics.js';
import { baseFeatureNames, featuresOf } from './value.js';

/**
 * Есть ли загруженный артефакт: без него политика `qvalue` не переставляет веса. Поддержаны два вида —
 * линейный (`linear-q`, §22) и нелинейный (`mlp-q`, §28): у второго те же входы, но два скрытых слоя,
 * поэтому линейная формула его не считает.
 */
export const hasQValue = (table = weights) =>
  Number(table?.stateDim) > 0 &&
  Number(table?.actionDim) > 0 &&
  (Array.isArray(table?.wState) || (table?.kind === 'mlp-q' && Array.isArray(table?.W1)));

/** Вид артефакта: у старых файлов поля `kind` нет, и это линейная модель. */
const kindOf = table => (table?.kind === 'mlp-q' ? 'mlp-q' : 'linear-q');

/**
 * Веса MLP в типизированных массивах: их читают на каждом варианте хода, а обычный массив JSON —
 * это объекты-числа, и на горячем пути разница заметна. Кэш по самому артефакту (`WeakMap`): объект
 * живёт столько же, сколько политика, копий не плодим.
 */
const mlpCache = new WeakMap();

const prepared = table => {
  const cached = mlpCache.get(table);
  if (cached != null) return cached;

  const floats = list => Float64Array.from(Array.isArray(list) ? list : [], Number);
  const rows = list => (Array.isArray(list) ? list : []).map(row => floats(row));
  const shape = {
    W1: floats(table.W1),
    b1: floats(table.b1),
    W2: floats(table.W2),
    b2: floats(table.b2),
    Wscore: floats(table.Wscore),
    bscore: floats(table.bscore),
    Wvalue: floats(table.Wvalue),
    bvalue: floats(table.bvalue),
    heroEmbed: rows(table.heroEmbed),
    cardEmbed: rows(table.cardEmbed),
    // головы по виду решения (§49): у одноуровневого артефакта их нет, и рантайм играет как раньше
    W1Cell: table.twoHeads === true ? floats(table.W1Cell) : null,
    b1Cell: table.twoHeads === true ? floats(table.b1Cell) : null,
    W2Cell: table.twoHeads === true ? floats(table.W2Cell) : null,
    b2Cell: table.twoHeads === true ? floats(table.b2Cell) : null,
    WscoreCell: table.twoHeads === true ? floats(table.WscoreCell) : null,
    bscoreCell: table.twoHeads === true ? floats(table.bscoreCell) : null,
    // ворота «состояние × действие» (§50): вектор варианта умножается на вес, посчитанный из позиции
    Wgate: table.gated === true ? floats(table.Wgate) : null,
    bgate: table.gated === true ? floats(table.bgate) : null,
    gateIndex: table.gated === true ? (table.summaryIndex ?? []).map(Number) : null,
  };
  mlpCache.set(table, shape);
  return shape;
};

/** Строка эмбеддинга героя: неизвестный герой — нулевая (так же считает тренер, `model.py: _hero`). */
const heroRowOf = (table, shape, name) => {
  const index = (table.heroes ?? []).indexOf(String(name ?? ''));
  return shape.heroEmbed[index < 0 ? 0 : index] ?? shape.heroEmbed[0] ?? new Float64Array(0);
};

/** Индекс карты: 0 — «не карта», дальше словарь артефакта со сдвигом на единицу (`card_index`). */
const cardRowOf = (table, shape, card) => {
  if (card == null) return shape.cardEmbed[0] ?? new Float64Array(0);
  const index = (table.cards ?? []).indexOf(String(card));
  return shape.cardEmbed[index < 0 ? 0 : index + 1] ?? shape.cardEmbed[0] ?? new Float64Array(0);
};

/**
 * Оценка пары «состояние + действие» нелинейной моделью: forward-pass того же вида, что в
 * `trainer/model.py` — `[состояние ⊕ действие ⊕ герой ⊕ соперник ⊕ карта]` → два слоя с `relu` → голова.
 * Матрицы лежат по строкам (`W1[i * вход + j]`), как их пишет `model.py: export`.
 */
export const mlpScore = (table, { stateFeatures, action, hero, rival, card }) => {
  const shape = prepared(table);
  const stateDim = Math.max(0, Number(table.stateDim) || 0);
  const actionDim = Math.max(0, Number(table.actionDim) || 0);
  const heroRow = heroRowOf(table, shape, hero);
  const rivalRow = heroRowOf(table, shape, rival);
  const cardRow = cardRowOf(table, shape, card);

  const input = new Float64Array(stateDim + actionDim + heroRow.length * 2 + cardRow.length);
  let at = 0;
  for (let index = 0; index < stateDim; index += 1)
    input[at++] = Number(stateFeatures?.[index]) || 0;

  /**
   * **Ворота «состояние × действие»** (§50): у каждого варианта свой входной вес, посчитанный из сводки
   * позиции — `a' = a · σ(G · summary + g0)`. Это то же, что делает тренер (`trainer/model.py`), и то,
   * чего у сети не было: взаимодействие признаков позиции и действия, **своё для каждой позиции**, а не
   * общее внутри первого слоя. При нулевых весах ворот σ(0) = 0,5 — общая половинная шкала действий,
   * которую ствол компенсирует первым слоем (то есть старт эквивалентен прежнему поведению).
   */
  const gate = shape.Wgate == null ? null : new Float64Array(actionDim);
  if (gate != null) {
    const index = shape.gateIndex ?? [];
    for (let column = 0; column < actionDim; column += 1) {
      let sum = shape.bgate?.[column] ?? 0;
      for (let slot = 0; slot < index.length; slot += 1) {
        sum +=
          (shape.Wgate[column * index.length + slot] ?? 0) *
          (Number(stateFeatures?.[index[slot]]) || 0);
      }
      gate[column] = 1 / (1 + Math.exp(-sum));
    }
  }

  for (let index = 0; index < actionDim; index += 1) {
    const raw = Number(action?.[index]) || 0;
    input[at++] = gate == null ? raw : raw * gate[index];
  }
  for (const value of heroRow) input[at++] = value;
  for (const value of rivalRow) input[at++] = value;
  for (const value of cardRow) input[at++] = value;

  // **маршрут головы** (§49): признак 3 вектора действия — «это клетка», он же отличает шаги в тренере.
  // Порог 0,25, а не 0,5: с воротами признак клетки при нулевых воротах равен 0,5 (σ(0) · 1)
  const useCell =
    shape.W1Cell != null && (Number(action?.[3]) || 0) * (gate == null ? 1 : gate[3]) > 0.25;
  const W1 = useCell ? shape.W1Cell : shape.W1;
  const b1 = useCell ? shape.b1Cell : shape.b1;
  const W2 = useCell ? shape.W2Cell : shape.W2;
  const b2 = useCell ? shape.b2Cell : shape.b2;
  const Wscore = useCell ? shape.WscoreCell : shape.Wscore;
  const bscore = useCell ? shape.bscoreCell : shape.bscore;

  const hidden = Math.max(1, Number(table.hidden) || 1);
  const first = new Float64Array(hidden);
  for (let row = 0; row < hidden; row += 1) {
    let sum = b1[row] ?? 0;
    const offset = row * input.length;
    for (let column = 0; column < input.length; column += 1) {
      sum += (W1[offset + column] ?? 0) * input[column];
    }
    first[row] = sum > 0 ? sum : 0;
  }

  const second = new Float64Array(hidden);
  for (let row = 0; row < hidden; row += 1) {
    let sum = b2[row] ?? 0;
    const offset = row * hidden;
    for (let column = 0; column < hidden; column += 1) {
      sum += (W2[offset + column] ?? 0) * first[column];
    }
    second[row] = sum > 0 ? sum : 0;
  }

  let total = bscore[0] ?? 0;
  for (let row = 0; row < hidden; row += 1) total += (Wscore[row] ?? 0) * second[row];
  return total;
};

/** Оценка позиции нелинейной моделью (`V(state)`) — та же формула, что у тренера. */
export const mlpValue = (table, stateFeatures) => {
  const shape = prepared(table);
  const stateDim = Math.max(0, Number(table.stateDim) || 0);
  let total = shape.bvalue[0] ?? 0;
  for (let index = 0; index < stateDim; index += 1) {
    total += (shape.Wvalue[index] ?? 0) * (Number(stateFeatures?.[index]) || 0);
  }
  return total;
};

/** Индексы «сводки» в признаках позиции: берём из артефакта, чтобы порядок не разъезжался с тренером. */
const summaryIndex = (table, stateFeatures) => {
  if (Array.isArray(table?.summaryIndex) && table.summaryIndex.length > 0)
    return table.summaryIndex;
  return (table?.summaryFeatures ?? []).map(name => baseFeatureNames.indexOf(name));
};

const indexFrom = (list, value) => {
  const index = (list ?? []).indexOf(String(value));
  return index < 0 ? 0 : index;
};

/** Оценка одного действия в позиции: те же числа, что считал тренер. */
export const scoreAction = (table, { stateFeatures, action, hero, rival, card }) => {
  if (kindOf(table) === 'mlp-q')
    return mlpScore(table, { stateFeatures, action, hero, rival, card });

  const summary = summaryIndex(table, stateFeatures).map(
    index => Number(stateFeatures[index]) || 0,
  );
  let total = Number(table.b) || 0;

  for (let index = 0; index < stateFeatures.length; index += 1) {
    total += (Number(table.wState?.[index]) || 0) * (Number(stateFeatures[index]) || 0);
  }
  for (let index = 0; index < ACTION_FEATURES; index += 1) {
    const value = Number(action[index]) || 0;
    if (value === 0) continue;
    total += (Number(table.wAction?.[index]) || 0) * value;
    for (let slot = 0; slot < summary.length; slot += 1) {
      total += (Number(table.wCross?.[slot]?.[index]) || 0) * summary[slot] * value;
    }
  }

  total += Number(table.heroBias?.[indexFrom(table.heroes, hero)]) || 0;
  total += Number(table.rivalBias?.[indexFrom(table.heroes, rival)]) || 0;
  if (card != null) total += Number(table.cardBias?.[indexFrom(table.cards, card)]) || 0;

  return total;
};

/** Оценка позиции: запасной сигнал и проверка артефакта (у нелинейного артефакта — своя голова). */
export const valueOf = (table, stateFeatures) => {
  if (kindOf(table) === 'mlp-q') return mlpValue(table, stateFeatures);

  let total = Number(table.bValue) || 0;
  for (let index = 0; index < stateFeatures.length; index += 1) {
    total += (Number(table.wValue?.[index]) || 0) * (Number(stateFeatures[index]) || 0);
  }
  return total;
};

/**
 * Оценки модели для предложенных вариантов: `Map` «ключ действия → оценка». Из них собирается и выбор
 * (`rankOptions`), и **приор корня поиска** (`bot/play/search.js`, политика `qprior`): числа обязаны
 * быть одни и те же, иначе поиск подсказывают не тем, чем играет ученик. Вес 0 — вето политики, такие
 * варианты модель не оценивает вовсе; `null` — артефакта нет или предлагать нечего.
 */
export const scoreOptions = (
  state,
  playerId,
  options,
  { table = weights, artifact = null } = {},
) => {
  const model = artifact == null ? table : tableOf(artifact);
  if (!hasQValue(model) || options.length === 0) return null;
  const offered = options.filter(entry => Number(entry.weight) > 0);
  if (offered.length === 0) return null;

  const stateFeatures = featuresOf(state, playerId);
  const hero = heroOf(state, playerId);
  const rival = rivalOf(state, playerId);
  const priorScale = Math.max(...offered.map(entry => Number(entry.weight) || 0), 1);

  return new Map(
    offered.map(entry => [
      JSON.stringify(entry.action),
      scoreAction(model, {
        stateFeatures,
        action: actionFeatures(state, playerId, entry, { priorScale }),
        hero,
        rival,
        card: entry.action?.kind === 'card' ? cardIdOf(String(entry.action.id)) : null,
      }),
    ]),
  );
};

/**
 * Переставляет веса вариантов хода по оценке модели: сильнее оценённое — выше. Два правила, без которых
 * обученная политика играет **хуже** жадной (это поймал замер §22):
 *
 * - **вес 0 — это запрет, а не «мало».** Политика нулём говорит «не предлагаем» (шаг в никуда, добор на
 *   пустой колоде). Модель переставляет только разрешённые варианты и не имеет права вернуть запрещённый:
 *   иначе бот начинает топтаться — ровно то, что уже лечили в §10;
 * - **мягкий максимум с низкой температурой.** Оценки модели близки (разница десятые), поэтому при
 *   температуре 1 ход превращается в почти случайный. При 0.25 лучший вариант доминирует, но остальным
 *   остаётся ненулевой вес — поиск и фаззинг не зацикливаются на одном действии. `temperature: 0` —
 *   чистый argmax модели: так проверяют качество самой оценки, без случайности выбора.
 */
/** Температура выбора: переменная среды `QVALUE_TEMPERATURE` (0 — чистый argmax модели). */
const envTemperature = () => {
  const raw = typeof process !== 'undefined' ? process?.env?.QVALUE_TEMPERATURE : null;
  const value = Number(raw);
  return raw == null || raw === '' || !Number.isFinite(value) ? null : value;
};

/**
 * Температура выбора по умолчанию. Из неё же считается доля, с которой ученик берёт лучший вариант:
 * по ней дневник (`bot/learn/export.js`) проверяется на то, что признаки в нём — те самые, по которым
 * шла игра (тест `tests/unit/bot/export.test.js`).
 */
export const SELECTION_TEMPERATURE = 0.25;

/**
 * Примесь мнения политики к оценке модели (§29). Замер показал, что решения-клетки **не различает
 * никто**: оракул согласен сам с собой на 56–60% при любом листе, бюджете и парной оценке, тогда как на
 * картах та же процедура даёт 74–81%. То есть разница между соседними клетками меньше шума оценки
 * вообще, и «ученик не умеет ранжировать клетки» — это свойство цели, а не модели. Тогда правильное
 * поведение: там, где модель различает варианты, решает она; там, где разница в пределах примеси —
 * решает политика, у которой на движение есть ручные правила (§15: выйти на дистанцию удара, уйти
 * из-под удара, встать на свою стихию). Раньше при равных оценках выбор падал на первый вариант списка,
 * то есть ход помощника выбирался произвольно.
 *
 * Примесь нормирована: `log1p(вес)/log1p(сильнейший вес)` лежит в (0, 1], поэтому её величина — это
 * верхняя граница вклада политики в оценку варианта. Замер (§29, 1150+ партий в обе стороны) тогда дал
 * 0 — 50%, 0.1 — 52%, **0.3 — 54%**, 0.6 — 54%; **перемер §43 на 7 200 партиях на значение показал, что
 * плато идёт дальше**: 0,6–2,0 — 55%, 3,0 — 56%, 6,0 и 10,0 — 54%. Поэтому значение поднято до 0,8
 * (середина плато, а не его край), а сам механизм стал адаптивным по неуверенности модели (ниже).
 * Переменная среды `QVALUE_PRIOR_MIX` (0 — чистая модель) позволяет перемерить это без правок кода.
 */
export const PRIOR_MIX = 0.8;

const envPriorMix = () => {
  const raw = typeof process !== 'undefined' ? process?.env?.QVALUE_PRIOR_MIX : null;
  const value = Number(raw);
  return raw == null || raw === '' || !Number.isFinite(value) ? null : value;
};

/**
 * **Неуверенность модели** (ген `uncertain`, §43): насколько различаются её оценки вариантов внутри одного
 * решения. Замер `rank.js` на живом артефакте: в 11,8% решений оценки **все равны** (на решениях-клетках —
 * 20%), согласие с целью на клетках 41%, а худший вариант выбирается в 28% решений. Значит там, где модель
 * варианты различает, решать должна она, а где не различает — политика с её ручными правилами.
 *
 * Примесь поэтому не постоянная, а по разбросу: `mix = PRIOR_MIX + UNCERTAIN_MIX · (1 − разброс/порог)`.
 * Замер вклада самой примеси (§43, `qvalue` против `greedy`, 7 200 партий на значение): 0,15 — 53%,
 * 0,3 — 53–54%, 0,6–2,0 — 55%, **3,0 — 56%**, 6,0 и 10,0 — 54%. То есть на текущем артефакте политика
 * **сильнее** модели в своей области, и оптимум примеси — единицы, а не доли. Поэтому `PRIOR_MIX` поднят
 * до 0,8, а ген неуверенности добавляет **сверху** (не отнимает, как первая версия).
 */
export const UNCERTAIN_SPREAD = 0.15;
export const UNCERTAIN_MIX = 0;

/**
 * Доли примеси при **разделении решений по виду** (§44): на клетках решают правила (`RULES_MIX`), на
 * решениях с картами — модель (`MODEL_MIX`). Значение 6 на клетках означает «вес политики весит в шесть
 * раз больше оценки модели», то есть клетку выбирают ровно те правила, что написаны в `bot/play/policy.js`.
 * Переключатель — `BOT_GENE_BYKIND=rules|model|mix` (пусто или `mix` — прежнее поведение).
 */
export const RULES_MIX = 6;
export const MODEL_MIX = 0.2;

const envByKind = () => {
  const raw = typeof process !== 'undefined' ? process?.env?.BOT_GENE_BYKIND : null;
  const value = raw == null ? '' : String(raw).trim().toLowerCase();
  return value === 'model' || value === 'mix' ? value : 'rules';
};

const envUncertainMix = () => {
  const raw = typeof process !== 'undefined' ? process?.env?.BOT_GENE_UNCERTAINMIX : null;
  const value = Number(raw);
  return raw == null || raw === '' || !Number.isFinite(value) ? null : value;
};

export const rankOptions = (
  state,
  playerId,
  options,
  { temperature = SELECTION_TEMPERATURE, table = weights, artifact = null } = {},
) => {
  const model = artifact == null ? table : tableOf(artifact);
  if (!hasQValue(model) || options.length === 0) return options;

  const scores = scoreOptions(state, playerId, options, { table: model });
  if (scores == null) return options; // политика ничего не предложила — выдумывать нечего

  const offered = options.filter(entry => Number(entry.weight) > 0);
  const heat = envTemperature() ?? Number(temperature);
  const baseMix = envPriorMix() ?? PRIOR_MIX;
  const scoreOfEntry = entry => scores.get(JSON.stringify(entry.action)) ?? 0;

  /**
   * **Разделение решений по виду** (ген `byKind`, §44). Замер §29–§43: модель различает карты
   * (согласие с целью 60%) и не различает клетки (41%, а в 20% решений оценки всех клеток совпадают —
   * у них просто нет признаков, отличающих «шаг в тактически лучшее место»). Поэтому:
   *
   * - `rules` (живое значение) — на решениях-клетках решают **правила политики**: они для этого и
   *   написаны (дистанция удара, кайт, своя стихия, удержание места), а модель там гадает;
   * - `model` — на решениях с картами решает модель (там она сильнее правил), правила только veto;
   * - `mix` — прежнее поведение: примесь по всем решениям одинаково.
   *
   * `BOT_GENE_BYKIND=0` возвращает примесь (для замера вклада), `=1` — разделение.
   */
  const byKindGene = envByKind();
  const isCellsOnly = offered.every(entry => Number(entry.action?.kind === 'cell'));
  const hasCards = offered.some(entry => entry.action?.kind === 'card');
  const mode = byKindGene;

  // неуверенность: разброс оценок модели на этом решении. Ноль и меньше порога — модель не различает
  // варианты, и решает политика; много больше порога — решает модель, примесь только страхует от ничьей
  const values = offered.map(scoreOfEntry);
  const uncertainGene = envUncertainMix() ?? UNCERTAIN_MIX;
  const spread = Math.max(...values) - Math.min(...values);
  const uncertain = 1 - Math.min(1, spread / UNCERTAIN_SPREAD);

  let mix = uncertainGene > 0 ? baseMix + uncertainGene * uncertain : baseMix;
  // разделение по виду: клетки — правила, карты — модель. На клетках примесь становится решающей
  // (правила только что измерены и сильнее модели там), на картах — минимальной (модель сильнее)
  if (mode === 'rules') {
    if (isCellsOnly) mix = Math.max(mix, RULES_MIX);
    else if (hasCards) mix = Math.min(mix, MODEL_MIX);
  }

  // примесь мнения политики: у клеток оценки модели различаются на сотые, и без примеси выбор среди них
  // случаен (§29). Компонента нормирована на сильнейший вес, поэтому примесь не перебивает модель там,
  // где она действительно различает варианты
  const scale = Math.max(...offered.map(entry => Number(entry.weight) || 0)) || 1;
  const logScale = Math.log1p(scale) || 1;
  const mixedOf = entry =>
    scoreOfEntry(entry) + mix * (Math.log1p(Math.max(0, Number(entry.weight) || 0)) / logScale);

  const best = Math.max(...offered.map(mixedOf));
  const hard = heat <= 0;
  const exp = offered.map(entry =>
    hard
      ? mixedOf(entry) === best
        ? 1
        : 0
      : Math.exp((mixedOf(entry) - best) / Math.max(0.05, heat)),
  );
  const total = exp.reduce((sum, value) => sum + value, 0) || 1;
  const byAction = new Map(
    offered.map((entry, index) => [
      JSON.stringify(entry.action),
      { weight: (exp[index] / total) * scale, qvalue: scoreOfEntry(entry) },
    ]),
  );

  return options.map(entry => {
    const scored = byAction.get(JSON.stringify(entry.action));
    return scored == null ? { ...entry, weight: 0 } : { ...entry, ...scored };
  });
};

export default rankOptions;
