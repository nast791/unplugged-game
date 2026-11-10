// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * Большой формат карты из руки: правый клик по карте открывает её во весь экран, а закрывает
 * окно клик ВНЕ карты. Клик по самой карте окно не закрывает — иначе нельзя ни прокрутить
 * текст свойства, ни прочитать его на увеличенной карте.
 */
globalThis.ref = ref;
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.nextTick = nextTick;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

const cards = vi.hoisted(() => [
  { instanceId: 'card-1', id: 'anubis_01', title: 'Погребальный звон', text: 'Нанесите 2 урона.' },
  { instanceId: 'card-2', id: 'anubis_02', title: 'Суд молчит', text: 'Возьмите карту.' },
]);

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = {
    myHand: ref(cards),
    isCardPlayable: () => true,
    onCardClick: vi.fn(),
    canDiscardBonus: ref(false),
    armBonusCard: vi.fn(),
    onBonusDiscard: vi.fn(),
  };
  return { useGameSession: () => session, session };
});

vi.mock('~/composables/ui/useCardDrag.js', async () => {
  const { ref } = await import('vue');
  return {
    useCardDrag: () => ({
      drag: ref({ active: false, key: '' }),
      over: ref(''),
      startCardDrag: vi.fn(),
      moveCardDrag: vi.fn(),
      setCardDragOver: vi.fn(),
      endCardDrag: vi.fn(),
    }),
  };
});

vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: { text: { type: String, default: '' } },
      setup(props, { slots }) {
        return () => h('div', { 'data-tooltip-trigger': '' }, slots.default?.());
      },
    }),
  };
});

vi.mock('~/components/molecules/game/Card.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'Card',
      inheritAttrs: false,
      props: { card: { type: Object, default: null } },
      setup(props, { attrs }) {
        return () => h('div', attrs, h('p', { 'data-card-body': '' }, props.card?.text ?? ''));
      },
    }),
  };
});

vi.mock('~/components/molecules/game/CardText.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'CardText',
      props: { text: { type: String, default: '' }, tone: { type: String, default: 'card' } },
      setup(props) {
        return () =>
          h('div', { 'data-zoom-body': '', 'data-tone': props.tone }, [
            h('span', { 'data-zoom-line': '' }, 'Помилование'),
            h('span', { 'data-zoom-raw': '' }, props.text),
          ]);
      },
    }),
  };
});

const HandFan = (await import('~/components/organisms/game/HandFan.vue')).default;

const click = element => element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

const openZoom = async wrapper => {
  await wrapper.find('[data-hand-card]').trigger('contextmenu');
  await nextTick();
};

describe('большой формат карты из руки', () => {
  let wrapper = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  const mountHandFan = () => {
    wrapper = mount(HandFan, { attachTo: document.body });
    return wrapper;
  };

  it('открывает карту правым кликом и закрывает кликом вне её', async () => {
    const fan = mountHandFan();
    await openZoom(fan);

    expect(document.querySelector('[data-zoom-card]')).toBeTruthy();
    expect(document.querySelector('[data-zoom-card]')?.textContent).toContain('Нанесите 2 урона.');

    click(document.querySelector('[data-esc-layer]'));
    await nextTick();

    expect(document.querySelector('[data-zoom-card]')).toBeNull();
  });

  it('держит окно открытым, когда кликают по самой карте: текст листают точечно', async () => {
    const fan = mountHandFan();
    await openZoom(fan);

    click(document.querySelector('[data-card-body]'));
    await nextTick();

    expect(document.querySelector('[data-zoom-card]')).toBeTruthy();
  });

  it('показывает рядом с картой полный текст, а не поверх неё', async () => {
    const fan = mountHandFan();
    await openZoom(fan);

    const card = () => document.querySelector('[data-zoom-card]');
    const hover = type => card().dispatchEvent(new MouseEvent(type, { bubbles: false }));

    expect(document.querySelector('[data-zoom-text]')).toBeNull();

    hover('mouseenter');
    await nextTick();

    const panel = document.querySelector('[data-zoom-text]');

    expect(panel?.textContent).toContain('Погребальный звон');
    expect(panel?.textContent).toContain('Нанесите 2 урона.');
    expect(panel?.classList.contains('pointer-events-none')).toBe(true);
    expect(panel.querySelector('[data-zoom-body]')?.getAttribute('data-tone')).toBe('zoom');

    hover('mouseleave');
    await nextTick();
    expect(document.querySelector('[data-zoom-text]')).toBeNull();
  });

  it('закрывает окно правым кликом вне карты и не закрывает им внутри карты', async () => {
    const fan = mountHandFan();
    await openZoom(fan);

    document
      .querySelector('[data-card-body]')
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.querySelector('[data-zoom-card]')).toBeTruthy();

    document
      .querySelector('[data-esc-layer]')
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.querySelector('[data-zoom-card]')).toBeNull();
  });
});
