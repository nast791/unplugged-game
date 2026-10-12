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
vi.mock('~/composables/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = {
    deckCount: ref(12),
    myDiscardCount: ref(3),
    isPlacement: ref(false),
    onDeckClick: vi.fn(),
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

const { session } = await import('~/composables/useGameSession.js');
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

beforeEach(() => {
  setState();
  session.onDeckClick.mockClear();
  openModal.mockClear();
});

describe('Стопки: пустой сброс', () => {
  it('пустой сброс не кликабелен и модалку не открывает', async () => {
    setState({ discard: 0 });
    const wrapper = mountPile(DiscardPile);

    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button').attributes('aria-label')).toBe('Сброс пуст');

    await wrapper.find('button').trigger('click');

    expect(openModal).not.toHaveBeenCalled();
  });

  it('пустой сброс не выдвигается наверх и не показывает подсказку', () => {
    setState({ discard: 0 });
    const wrapper = mountPile(DiscardPile);

    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toBe('');
    expect(wrapper.html()).not.toContain('group-hover:-translate-y');
  });

  it('непустой сброс работает как прежде: подсказка, число, выдвижение и модалка', async () => {
    const wrapper = mountPile(DiscardPile);
    const button = wrapper.find('button');

    expect(button.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toContain('Открыть сброс');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.html()).toContain('group-hover:-translate-y-4');
    expect(wrapper.html()).toContain('group-hover:-translate-y-6');

    await button.trigger('click');

    expect(openModal).toHaveBeenCalledWith('discard');
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
    const button = wrapper.find('button');

    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-label')).toBe('Сброс: до начала партии недоступен');
    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toBe('');
    expect(wrapper.html()).not.toContain('group-hover:-translate-y');
    expect(wrapper.text()).not.toContain('3');

    await button.trigger('click');

    expect(openModal).not.toHaveBeenCalled();
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
