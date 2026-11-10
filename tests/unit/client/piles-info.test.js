// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref, watch } from 'vue';

/**
 * Окно стопок героя (`PilesInfo`) — одно окно вместо трёх карт-кнопок: числа карт в руке, колоде
 * и сбросе стоят рядом, а большие окна стопок открываются по одному на строку.
 *
 * Кнопка строки гаснет ровно там, где большое окно открыть нечего: рука скрыта от игрока, колода
 * закрыта (`deckVisible`), сброс пуст. Число при этом остаётся: размер руки и колоды — открытый факт.
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.watch = watch;

vi.mock('~/components/atoms/AButton.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AButton',
      props: {
        variant: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
      },
      emits: ['click'],
      setup(props, { emit, slots }) {
        return () =>
          h(
            'button',
            {
              type: 'button',
              disabled: props.disabled || undefined,
              onClick: () => emit('click'),
            },
            slots.default?.(),
          );
      },
    }),
  };
});

const { default: PilesInfo } = await import('../../../app/components/molecules/game/PilesInfo.vue');

const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('span', { 'data-icon-name': props.name });
  },
});

const mountPiles = player =>
  mount(PilesInfo, {
    props: { player },
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

const shared = {
  id: 'anubis',
  hand: [{ id: 'a' }, { id: 'b' }],
  handCount: 5,
  deckCount: 12,
  discardCount: 2,
};

const rowOf = (wrapper, key) => wrapper.find(`[data-pile-row="${key}"]`);
const countOf = (wrapper, key) => rowOf(wrapper, key).find('.lining-nums').text();
const buttonOf = (wrapper, key) => rowOf(wrapper, key).find('button');
const isDisabled = (wrapper, key) =>
  rowOf(wrapper, key).attributes('data-pile-disabled') === 'true';

describe('окно стопок героя', () => {
  it('показывает число карт в руке, колоде и сбросе', () => {
    const wrapper = mountPiles(shared);

    expect(
      wrapper.findAll('[data-pile-row]').map(node => node.attributes('data-pile-row')),
    ).toEqual(['hand', 'deck', 'discard']);
    expect(['hand', 'deck', 'discard'].map(key => countOf(wrapper, key))).toEqual(['5', '12', '2']);
  });

  it('подписывает строки стопками героя', () => {
    const wrapper = mountPiles(shared);

    expect(wrapper.findAll('[data-pile-row]').map(node => node.text())).toEqual([
      expect.stringContaining('Рука'),
      expect.stringContaining('Колода'),
      expect.stringContaining('Сброс'),
    ]);
  });

  it('открывает большое окно стопки кнопкой своей строки', async () => {
    const wrapper = mountPiles(shared);

    await buttonOf(wrapper, 'hand').trigger('click');
    await buttonOf(wrapper, 'discard').trigger('click');

    expect(wrapper.emitted('open')).toEqual([['hand'], ['discard']]);
  });

  it('гасит колоду, пока её карты закрыты, и открывает, когда они видны', () => {
    expect(isDisabled(mountPiles(shared), 'deck')).toBe(true);
    expect(isDisabled(mountPiles({ ...shared, deckVisible: true }), 'deck')).toBe(false);
  });

  it('гасит пустой сброс и скрытую руку, оставляя их числа на месте', () => {
    const wrapper = mountPiles({ ...shared, hand: [], discard: [], discardCount: 0 });

    expect(isDisabled(wrapper, 'hand')).toBe(true);
    expect(countOf(wrapper, 'hand')).toBe('5');
    expect(isDisabled(wrapper, 'discard')).toBe(true);
    expect(buttonOf(wrapper, 'discard').attributes('disabled')).toBeDefined();
  });

  it('держит сброс открытым, пока в нём есть карты', () => {
    expect(isDisabled(mountPiles(shared), 'discard')).toBe(false);
  });
});
