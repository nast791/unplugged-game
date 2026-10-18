// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

/**
 * Стопки полосы партии (`DeckPile`, `DiscardPile`) обещают клик только тогда, когда он есть:
 * пустой сброс и расстановка (партия ещё не началась) — это неактивные кнопки без выдвижения наверх,
 * без подсказки и без чисел. Числа до начала партии ничего не значат: колода и сброс ещё не в игре.
 *
 * SFC приложения: `computed` приходит автоимпортом Nuxt — в тесте кладём его в `globalThis` до импорта
 * компонентов (так же, как `placement-tray.test.js`).
 */
globalThis.computed = computed;

vi.mock('~/composables/ui/useModal.js', () => ({ openModal: vi.fn() }));

// Состояние стопок компоненты читают из сессии: в тесте она своя.
vi.mock('~/composables/game/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = {
    deckCount: ref(12),
    myDiscardCount: ref(3),
    isPlacement: ref(false),
    onDeckClick: vi.fn(),
    // усиление перемещения: сброс зовёт скинуть карту, когда в фазе есть что скидывать
    canDiscardBonus: ref(false),
    armedBonusCard: ref(null),
    bonusCard: ref(null),
    onBonusDiscard: vi.fn(),
  };
  return { useGameSession: () => session, session };
});

// Тултип — своя обвязка reka-ui: в тесте от него нужен только признак «подсказка выключена».
vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: {
        text: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
      },
      setup(props, { slots }) {
        return () =>
          h('div', { 'data-tooltip': props.disabled ? '' : props.text }, slots.default?.());
      },
    }),
  };
});

vi.mock('~/svg/game/move.svg', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MoveIcon',
      setup: () => () => h('i', { 'data-icon': 'move' }),
    }),
  };
});

// Карта усиления над сбросом — отдельная молекула: в тесте стопок важна только её роль цели.
vi.mock('~/components/molecules/game/BonusCard.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'BonusCard',
      setup: () => () => h('i', { 'data-bonus-card': '' }),
    }),
  };
});

const { session } = await import('~/composables/game/useGameSession.js');
const { openModal } = await import('~/composables/ui/useModal.js');
const { default: DeckPile } = await import('../../../app/components/molecules/game/DeckPile.vue');
const { default: DiscardPile } =
  await import('../../../app/components/molecules/game/DiscardPile.vue');

const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('i', { 'data-icon': props.name });
  },
});

/** Состояние стопок: расстановка (партия не началась), остаток колоды и число карт в сбросе. */
const setState = ({ placement = false, deck = 12, discard = 3 } = {}) => {
  session.isPlacement.value = placement;
  session.deckCount.value = deck;
  session.myDiscardCount.value = discard;
};

const mountPile = component =>
  mount(component, { global: { stubs: { Icon: IconStub, NuxtIcon: IconStub } } });

/** Стопка сброса — вторая кнопка: первая это кружок-действие над ней. */
const pileButton = wrapper => wrapper.findAll('button')[1];
const circleButton = wrapper => wrapper.findAll('button')[0];

beforeEach(() => {
  setState();
  session.onDeckClick.mockClear();
  session.onBonusDiscard.mockClear();
  session.canDiscardBonus.value = false;
  session.armedBonusCard.value = null;
  openModal.mockClear();
});

describe('Стопки: пустой сброс', () => {
  it('стопка пустого сброса выключена и модалку не открывает', async () => {
    setState({ discard: 0 });
    const wrapper = mountPile(DiscardPile);

    expect(pileButton(wrapper).attributes('disabled')).toBeDefined();
    expect(pileButton(wrapper).attributes('aria-label')).toBe('Сброс пуст');

    await pileButton(wrapper).trigger('click');

    expect(openModal).not.toHaveBeenCalled();
  });

  it('кружок над пустым сбросом открывает окно сброса', async () => {
    setState({ discard: 0 });
    const wrapper = mountPile(DiscardPile);

    expect(circleButton(wrapper).attributes('disabled')).toBeUndefined();
    expect(circleButton(wrapper).attributes('aria-label')).toBe('Сброс пуст');

    await circleButton(wrapper).trigger('click');

    expect(openModal).toHaveBeenCalledWith('discard');
  });

  it('пустая стопка не выдвигается наверх и не показывает подсказку', () => {
    setState({ discard: 0 });
    const wrapper = mountPile(DiscardPile);

    // стопка не цель: она выключена и о себе не рассказывает (кружок рядом — рассказывает)
    expect(pileButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('[data-tooltip]')[1].attributes('data-tooltip')).toBe('');
    expect(pileButton(wrapper).classes().join(' ')).not.toContain('group-hover:-translate-y');
  });

  it('непустой сброс работает как прежде: подсказка, число, выдвижение и модалка', async () => {
    const wrapper = mountPile(DiscardPile);
    const button = pileButton(wrapper);

    expect(button.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toContain('Открыть сброс');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.html()).toContain('group-hover:-translate-y-4');
    expect(wrapper.html()).toContain('group-hover:-translate-y-6');

    await button.trigger('click');

    expect(openModal).toHaveBeenCalledWith('discard');
  });
});

describe('Стопки: усиление перемещения', () => {
  it('сброс подсвечивается, пока в фазе есть что скинуть', () => {
    session.canDiscardBonus.value = true;
    const wrapper = mountPile(DiscardPile);

    expect(wrapper.find('.discard-bonus-ready').exists()).toBe(true);
    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toContain(
      'Усиление перемещения',
    );
  });

  it('без усиления подсветки нет, а сброс по-прежнему открывает окно сброса', async () => {
    const wrapper = mountPile(DiscardPile);

    expect(wrapper.find('.discard-bonus-ready').exists()).toBe(false);

    await pileButton(wrapper).trigger('click');

    expect(openModal).toHaveBeenCalledWith('discard');
  });

  /**
   * Сброс усиления — **клик по кружку с плюсом**, стопка открывает окно сброса (решение владельца:
   * «нажимаем на плюсик — так логичнее»). Раньше стопка в этом состоянии молча скидывала карту.
   */
  it('поднятая карта зовёт кликнуть по плюсу: стопка открывает окно, кружок скидывает карту', async () => {
    session.canDiscardBonus.value = true;
    session.armedBonusCard.value = { instanceId: 'fx_0', id: 'fx', bonus: 2 };
    const wrapper = mountPile(DiscardPile);

    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toContain(
      'Скинуть эту карту',
    );

    await pileButton(wrapper).trigger('click');

    expect(openModal).toHaveBeenCalledWith('discard');
    expect(session.onBonusDiscard).not.toHaveBeenCalled();
  });

  it('кружок скидывает поднятую карту, а без поднятой — открывает окно сброса', async () => {
    session.canDiscardBonus.value = true;
    session.armedBonusCard.value = { instanceId: 'fx_0', id: 'fx', bonus: 2 };
    const armed = mountPile(DiscardPile);

    await circleButton(armed).trigger('click');

    expect(session.onBonusDiscard).toHaveBeenCalledTimes(1);
    expect(openModal).not.toHaveBeenCalled();

    // карту опустили — тот же кружок снова открывает окно сброса
    session.armedBonusCard.value = null;
    const idle = mountPile(DiscardPile);

    await circleButton(idle).trigger('click');

    expect(openModal).toHaveBeenCalledWith('discard');
    expect(session.onBonusDiscard).toHaveBeenCalledTimes(1);
  });
});

describe('Стопки: расстановка', () => {
  it('колода до начала партии не кликабельна', async () => {
    setState({ placement: true });
    const wrapper = mountPile(DeckPile);

    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button').attributes('aria-label')).toContain('до начала партии');

    await wrapper.find('button').trigger('click');

    expect(session.onDeckClick).not.toHaveBeenCalled();
  });

  it('колода до начала партии не выдвигается, не подсказывает и не считает карты', () => {
    setState({ placement: true });
    const wrapper = mountPile(DeckPile);

    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toBe('');
    expect(wrapper.html()).not.toContain('group-hover:-translate-y');
    expect(wrapper.text()).not.toContain('12');
  });

  it('сброс до начала партии ведёт себя так же, даже когда карты уже сброшены', async () => {
    setState({ placement: true, discard: 3 });
    const wrapper = mountPile(DiscardPile);
    const button = pileButton(wrapper);

    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-label')).toBe('Сброс: до начала партии недоступен');
    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toBe('');
    expect(wrapper.html()).not.toContain('group-hover:-translate-y');
    expect(wrapper.text()).not.toContain('3');

    await button.trigger('click');

    expect(openModal).not.toHaveBeenCalled();
  });

  it('кружки обеих стопок в расстановке выглядят одинаково: плотная плашка, без прозрачности', () => {
    setState({ placement: true });
    const deckPlate = mountPile(DeckPile).find('button span');
    const discardPlate = circleButton(mountPile(DiscardPile)).find('span');

    for (const plate of [deckPlate, discardPlate]) {
      expect(plate.classes()).toContain('bg-surface-2');
      expect(plate.classes()).toContain('rounded-full');
      expect(plate.classes().join(' ')).not.toContain('opacity-');
    }
  });

  it('партия началась — числа и клики возвращаются', async () => {
    const deck = mountPile(DeckPile);
    const discard = mountPile(DiscardPile);

    expect(deck.text()).toContain('12');
    expect(discard.text()).toContain('3');

    await deck.find('button').trigger('click');

    expect(session.onDeckClick).toHaveBeenCalled();
    expect(deck.find('button').attributes('disabled')).toBeUndefined();
  });
});
