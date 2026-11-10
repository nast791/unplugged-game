// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';

/**
 * Гекс героя (`HeroHex`) — всё, что осталось от карточки героя на минимальном экране: аватар на весь
 * гексагон, акцентная рамка у того, чей ход, рамка цвета героя у остальных, объёмное сердце с текущим
 * здоровьем внизу справа и такой же пузырёк счёта действий внизу слева у героя, чей ход.
 *
 * **Стороны равны:** форма режется полигоном `hex-side-clip` (вершины слева и справа на середине
 * высоты), и регулярным гексагоном она становится при ширине `2/√3` высоты. Отсюда пара утилит
 * `h-150 w-173`: 173 / 150 = 1,153, против 1,1547 у правильного шестиугольника.
 *
 * `HeroHex.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, поэтому кладём его в
 * `globalThis`, а `useUI` подменяем на настоящую склейку `cn`, как в `hexagon.test.js`.
 */
globalThis.computed = computed;

vi.mock('~/svg/game/heart.svg', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'HeartIcon',
      setup() {
        return () => h('svg', { 'data-heart': 'true' });
      },
    }),
  };
});

vi.mock('~/svg/game/action.svg', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ActionIcon',
      setup() {
        return () => h('svg', { 'data-action': 'true' });
      },
    }),
  };
});

vi.mock('~/composables/ui/useUI', async () => {
  const { computed } = await import('vue');
  const { default: preset } = await import('../../../app/ui/hexagon.js');
  const { cn } = await import('../../../app/ui/cn.js');

  return {
    useUI: (key, localUi) => ({
      styles: computed(() => {
        const patch = (typeof localUi === 'function' ? localUi() : localUi) || {};
        const merged = { ...preset };
        for (const [slot, classes] of Object.entries(patch))
          merged[slot] = cn(preset[slot], classes);
        return merged;
      }),
    }),
  };
});

vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { Fragment, defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: {
        text: { type: String, default: '' },
        side: { type: String, default: 'top' },
        sideOffset: { type: Number, default: 6 },
        disabled: { type: Boolean, default: false },
      },
      setup(props, { slots }) {
        return () => h(Fragment, null, [slots.default?.(), slots.content?.()]);
      },
    }),
  };
});

vi.mock('~/components/atoms/APicture.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'APicture',
      props: { src: { type: String, default: '' }, alt: { type: String, default: '' } },
      setup(props) {
        return () => h('div', { 'data-picture': props.src });
      },
    }),
  };
});

const { default: HeroHex } = await import('../../../app/components/molecules/game/HeroHex.vue');

const RATIO = 2 / Math.sqrt(3);

const mountHex = (props = {}) => mount(HeroHex, { props });

const glowOf = wrapper => wrapper.element.firstElementChild;
const buttonOf = wrapper => glowOf(wrapper).firstElementChild;
const hexOf = wrapper => buttonOf(wrapper).firstElementChild;
const frameOf = wrapper => hexOf(wrapper).firstElementChild;
const bodyOf = wrapper => hexOf(wrapper).lastElementChild;

const sizeOf = wrapper => {
  const width = wrapper.classes().find(name => /^w-\d+$/.test(name));
  const height = wrapper.classes().find(name => /^h-\d+$/.test(name));
  return { width: Number(width.slice(2)), height: Number(height.slice(2)) };
};

describe('гекс героя', () => {
  it('держит аватар на весь гексагон, обрезанный его формой', () => {
    const wrapper = mountHex({ portrait: 'anubis.webp', name: 'Анубис' });
    const picture = bodyOf(wrapper).querySelector('[data-picture]');

    expect(picture.getAttribute('data-picture')).toBe('anubis.webp');
    expect(picture.classList).toContain('size-full');
    expect(bodyOf(wrapper).classList).toContain('hex-side-clip');
  });

  it('держит все шесть сторон равными: ширина — 2/√3 высоты', () => {
    const { width, height } = sizeOf(mountHex());

    expect(width / height).toBeCloseTo(RATIO, 2);
  });

  it('обводит акцентом героя, чей ход', () => {
    const frame = frameOf(mountHex({ active: true }));

    expect(frame.classList).toContain('bg-accent');
    expect(frame.classList).not.toContain('bg-[var(--hero-color)]');
    expect(frame.classList).not.toContain('animate-pulse');
  });

  it('окружает гекс акцентным свечением, когда ход его', () => {
    const glow = 'drop-shadow-[0_0_10px_var(--color-accent)]';

    expect(glowOf(mountHex({ active: true })).classList).toContain(glow);
    expect(glowOf(mountHex({ color: '#e5c07b' })).classList).not.toContain(glow);
  });

  it('красит рамку цветом героя, когда ход не его', () => {
    const wrapper = mountHex({ color: '#e5c07b' });
    const frame = frameOf(wrapper);

    expect(frame.classList).toContain('bg-[var(--hero-color)]');
    expect(frame.classList).not.toContain('bg-accent');
    expect(wrapper.attributes('style')).toContain('--hero-color: #e5c07b');
  });

  it('гасит аватар убитого героя, а живого оставляет цветным', () => {
    const dead = mountHex({ portrait: 'anubis.webp', dead: true });

    expect(dead.find('[data-picture]').classes()).toContain('grayscale');
    expect(mountHex({ portrait: 'anubis.webp' }).find('[data-picture]').classes()).not.toContain(
      'grayscale',
    );
  });

  it('показывает инициалы, когда аватара нет', () => {
    const wrapper = mountHex({ name: 'Снежная королева' });

    expect(wrapper.find('[data-picture]').exists()).toBe(false);
    expect(bodyOf(wrapper).textContent.trim()).toBe('СК');
  });

  it('держит сердце с текущим здоровьем внизу справа от гекса', () => {
    const wrapper = mountHex({ hp: 12 });
    const heart = wrapper.element.lastElementChild;

    expect(heart.querySelector('[data-heart]')).not.toBeNull();
    expect(heart.textContent.trim()).toBe('12');
    expect(heart.className).toContain('-right-2');
    expect(heart.className).toContain('-bottom-6');
  });

  it('не рисует сердце, когда здоровье не передали', () => {
    expect(mountHex().find('[data-heart]').exists()).toBe(false);
  });

  it('держит пузырёк счёта действий внизу слева, симметрично сердцу', () => {
    const wrapper = mountHex({ active: true, actionLeft: 1, actionTotal: 2 });
    const badge = wrapper.find('[data-action-badge]');

    expect(badge.exists()).toBe(true);
    expect(badge.find('[data-action]').exists()).toBe(true);
    expect(badge.text()).toBe('1/2');
    expect(badge.classes()).toContain('-left-2');
    expect(badge.classes()).toContain('-bottom-6');
    expect(badge.classes()).toContain('size-54');
  });

  it('не рисует счёт действий чужому герою и герою без счёта', () => {
    expect(mountHex({ actionLeft: 1, actionTotal: 2 }).find('[data-action-badge]').exists()).toBe(
      false,
    );
    expect(mountHex({ active: true }).find('[data-action-badge]').exists()).toBe(false);
    expect(
      mountHex({ active: true, actionLeft: 1, actionTotal: 0 }).find('[data-action-badge]').exists(),
    ).toBe(false);
  });

  it('отдаёт клик наружу и имя для подписи', async () => {
    const wrapper = mountHex({ name: 'Анубис', label: 'Анубис: здоровье 14' });
    const button = buttonOf(wrapper);

    expect(button.tagName).toBe('BUTTON');
    expect(button.classList).toContain('hex-side-clip');
    expect(button.getAttribute('aria-label')).toBe('Анубис: здоровье 14');

    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('подсказывает имя героя капсом и остаток действий, когда ход его', () => {
    const wrapper = mountHex({ name: 'Анубис', actions: 'Осталось действий: 2 из 3' });
    const title = wrapper.find('.uppercase');

    expect(title.text()).toBe('Анубис');
    expect(wrapper.text()).toContain('Осталось действий: 2 из 3');
  });

  it('в подсказке чужого героя нет счёта действий', () => {
    const wrapper = mountHex({ name: 'Анубис' });

    expect(wrapper.find('.uppercase').text()).toBe('Анубис');
    expect(wrapper.text()).not.toContain('Осталось действий');
  });
});
