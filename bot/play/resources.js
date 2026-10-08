import { zoneCards } from '#shared/helpers/base.js';
import { cardHasTag, cardTags } from '#shared/helpers/cards.js';
import { heroes } from '../../server/content/index.js';

/**
 * Ресурс героя: что пак считает его запасом и на каком пороге запас срабатывает.
 *
 * Читается **из пака**, а не из списка состояний. Правила героя и его карт ссылаются на ресурс фактами:
 * `ITEMS { group, state }` — копии предмета, `CARDS { zone: 'discard', tag }` — карты с меткой. Порог
 * механики — самый высокий `min` в **умении** героя (у Теслы активные катушки, порог 2 — обе; у Снежной
 * королевы карты с осколком в сбросе, порог 6; у Анубиса целая пелена, порог 1), а состояние или метка
 * этого факта — «готовый» ресурс. Карты порог не задают: у Снежной королевы в них есть ступени на 8 и 9
 * осколков, и брать верхнюю ступень за основной порог значило бы считать её режим выключенным.
 *
 * Прежний хардкод `['active', 'collected']` этого не умел и врал дважды: пул осколков «во льду» не
 * попадал в признак вовсе, а `count` копии (у осколков 12) читался как число зарядов — у Снежной
 * королевы признак раздувался в двенадцать раз на каждую собранную копию.
 *
 * Источник правды о ресурсе — тот, что читают правила: у Снежной королевы это **сброс** (`shards.js`),
 * а предмет `shard` — только табло, поэтому его копии в признак не идут.
 *
 * `fuel` — карты, которые ресурсом **двигают**: несут метку (сброшенная карта с осколком становится
 * осколком) или исполняют действие над предметом (заряжают и тратят катушки). Это ответ на вопрос
 * «есть ли у меня в руке чем включить механику сейчас» — в отличие от `hand`, который считает всё.
 */
const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Факты правил: `when` — список фактов, `any` — список списков. */
export const factsOf = rules =>
  (rules ?? []).flatMap(rule => [...(rule?.when ?? []), ...(rule?.any ?? []).flat()]);

/** Все действия в объекте (правила, варианты свойства, вложенные события) — рекурсивно. */
const actionsOf = value => {
  if (Array.isArray(value)) return value.flatMap(actionsOf);
  if (value == null || typeof value !== 'object') return [];
  const nested = Object.values(value).flatMap(actionsOf);
  return typeof value.action === 'string' ? [value, ...nested] : nested;
};

/** Двигает ли карта ресурс: метка в её тегах или действие над группой предмета. */
const touchesResource = (card, { group, tag }) => {
  if (tag != null && cardHasTag(card, tag)) return true;
  if (group == null) return false;
  return actionsOf(card?.rules).some(entry => String(entry.group ?? entry.itemId ?? '') === group);
};

const buildSpec = heroId => {
  const pack = heroes[heroId] ?? null;
  if (pack == null) return null;

  // Порог механики берётся из **умения** героя: ступени в его картах (у Снежной королевы 8 и 9
  // осколков) основной порог не заменяют. Если умение ресурс не упоминает, остаются факты карт.
  const skillFacts = factsOf(pack?.skill?.rules);
  const facts =
    skillFacts.length > 0 ? skillFacts : (pack?.cards ?? []).flatMap(card => factsOf(card?.rules));
  const itemFacts = facts
    .filter(
      fact => fact?.fact === 'ITEMS' && fact.params?.group != null && fact.params?.state != null,
    )
    .map(fact => ({
      group: String(fact.params.group),
      state: String(fact.params.state),
      // `min` пишут и на самом факте, и внутри `params` (`shared/facts/run.js`)
      need: number(fact.min ?? fact.params?.min, 1),
    }));
  const cardFacts = facts
    .filter(
      fact => fact?.fact === 'CARDS' && fact.params?.zone === 'discard' && fact.params?.tag != null,
    )
    .map(fact => ({
      tag: String(fact.params.tag),
      need: number(fact.min ?? fact.params?.min, 1),
    }));

  const top = entries => entries.reduce((best, entry) => Math.max(best, entry.need), 0);
  const best = entries => entries.find(entry => entry.need === top(entries)) ?? null;
  // Предмет у героя один: его стартовое состояние — «ресурса ещё нет», поэтому из состояний одного
  // порога готовым считается то, которого пак добивается (у пелены `active`, а не `inactive`).
  const group = itemFacts[0]?.group ?? null;
  const startState = String(
    (pack.items ?? []).find(item => String(item.id) === group)?.state ?? '',
  );
  const itemSpec = (() => {
    const wanted = itemFacts.filter(entry => entry.need === top(itemFacts));
    const ready = wanted.find(entry => entry.state !== startState) ?? wanted[0] ?? null;
    return ready == null ? null : { ...ready, need: top(itemFacts) };
  })();

  const cardSpec = cardFacts.length === 0 ? null : { ...best(cardFacts), need: top(cardFacts) };
  const spec = (cardSpec?.need ?? 0) > (itemSpec?.need ?? 0) ? cardSpec : itemSpec;
  if (spec == null) return null;

  return {
    kind: spec.tag != null ? 'card' : 'item',
    group: spec.group ?? null,
    state: spec.state ?? null,
    tag: spec.tag ?? null,
    need: spec.need,
    // Рука, заточенная под механику: считается один раз на героя, а не на каждую оценку листа
    fuel: new Set(
      (pack.cards ?? [])
        .filter(card => touchesResource(card, { group: spec.group, tag: spec.tag }))
        .map(card => String(card.id)),
    ),
  };
};

const cache = new Map();

/** Описание ресурса героя (`null` — механики-запаса у него нет: Дороти, Ифрит, Медуза). */
export const resourceSpec = heroId => {
  const key = String(heroId ?? '');
  if (!cache.has(key)) cache.set(key, buildSpec(key));
  return cache.get(key);
};

/**
 * Сколько ресурса у игрока, по какому порогу он срабатывает и сколько карт-топлива в руке.
 * `ready` считается по источнику, который читают правила пака, а не по табло предмета.
 */
export const resourceOf = (player, spec = resourceSpec(player?.heroId ?? player?.id)) => {
  if (spec == null || player == null) return { ready: 0, need: 0, fuel: 0 };

  const ready =
    spec.kind === 'item'
      ? (player.items ?? []).filter(
          item => String(item.group ?? item.id) === spec.group && String(item.state) === spec.state,
        ).length
      : zoneCards(player.discard).filter(card => cardHasTag(card, spec.tag)).length;
  const fuel = zoneCards(player.hand).filter(card => spec.fuel.has(String(card.id))).length;

  return { ready, need: spec.need, fuel };
};

/** Готовность ресурса к порогу `[0, 1]`: «сколько уже собрано». */
export const resourceProgress = ({ ready, need }) =>
  need > 0 ? Math.min(1, Math.max(0, ready) / need) : 0;

/** Порог достигнут: механика героя работает (`1`/`0`). */
export const resourceReady = ({ ready, need }) => (need > 0 && ready >= need ? 1 : 0);

export default resourceSpec;
