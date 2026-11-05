// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import preset from '../../../app/ui/hexagon.js';

/**
 * Гексагон — атом формы: рамка (слой `hexagon_frame`) и тело (слой `hexagon_body`) режутся одним
 * `clip-path`, содержимое живёт в теле. Стилей в пропсах нет: слоты приходят пресетом
 * `app/ui/hexagon.js` и правкой `ui`, размер и цвет задаёт вызывающая сторона классами.
 *
 * `AHexagon.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, поэтому подменяем его, а
 * `useUI` — на настоящую склейку `cn`, чтобы проверить, что правка `ui` перебивает пресет.
 */
globalThis.computed = computed;

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

const { default: AHexagon } = await import('../../../app/components/atoms/AHexagon.vue');

const mountHex = (props = {}, slots = {}) => mount(AHexagon, { props, slots });

const frameOf = wrapper => wrapper.element.firstElementChild;
const bodyOf = wrapper => wrapper.element.lastElementChild;

describe('AHexagon: форма из пресета', () => {
  it('режет рамку и тело гексагоном из пресета', () => {
    const wrapper = mountHex();

    expect(wrapper.classes()).toContain('relative');
    expect([...frameOf(wrapper).classList]).toContain('hex-side-clip');
    expect([...bodyOf(wrapper).classList]).toContain('hex-side-clip');
    expect([...bodyOf(wrapper).classList]).toContain('bg-surface-2');
  });

  it('размер и цвет задаёт вызывающая сторона классами, а не пропсы', () => {
    const wrapper = mount(AHexagon, { attrs: { class: 'h-100 w-86 bg-accent' } });

    expect(wrapper.classes()).toContain('h-100');
    expect(wrapper.classes()).toContain('w-86');
    expect(wrapper.classes()).toContain('bg-accent');
    expect(wrapper.attributes('style')).toBeUndefined();
  });

  it('содержимое лежит в теле, обрезанном по форме', () => {
    const wrapper = mountHex({}, { default: '<span data-content>13</span>' });
    const body = bodyOf(wrapper);

    expect(body.querySelector('[data-content]').textContent).toBe('13');
    expect([...body.classList]).toContain('overflow-hidden');
    expect(frameOf(wrapper).getAttribute('aria-hidden')).toBe('true');
  });

  it('проп ui перекрывает слот пресета, а не складывается с ним', () => {
    const wrapper = mountHex({ ui: { hexagon_body: 'bg-danger' } });

    expect([...bodyOf(wrapper).classList]).toContain('bg-danger');
    expect([...bodyOf(wrapper).classList]).not.toContain('bg-surface-2');
    expect(preset.hexagon_body).toContain('bg-surface-2');
  });

  it('правка ui дополняет слот пресета, а не выбрасывает его', () => {
    const wrapper = mount(AHexagon, {
      props: { ui: { hexagon_frame: 'bg-accent/20' } },
      attrs: { class: 'h-100' },
    });

    expect([...frameOf(wrapper).classList]).toContain('bg-accent/20');
    expect([...frameOf(wrapper).classList]).toContain('absolute');
    expect([...frameOf(wrapper).classList]).toContain('hex-side-clip');
    expect(wrapper.classes()).toContain('h-100');
  });
});
