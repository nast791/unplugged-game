// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import preset from '../../../app/ui/arrow-button.js';

/**
 * Стрелка листалки руки: значок `material-symbols:arrow-*` на круглой подложке (решение владельца).
 *
 * `AArrowButton.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, а `Icon` — глобальный
 * компонент `@nuxt/icon`, которому нужен Nuxt-инстанс: и то, и другое подменяем в тесте (так же, как
 * `player-card.test.js` обходится без конфига приложения).
 */
globalThis.computed = computed;

vi.mock('~/composables/ui/useUI', async () => {
  const { computed } = await import('vue');
  return { useUI: () => ({ styles: computed(() => preset) }) };
});

const { default: AArrowButton } = await import('../../../app/components/atoms/AArrowButton.vue');

const mountArrow = (props = {}) =>
  mount(AArrowButton, {
    props: { label: 'Сдвинуть карты', ...props },
    global: {
      stubs: { NuxtIcon: true },
      components: {
        NuxtIcon: defineComponent({
          name: 'NuxtIcon',
          props: { name: { type: String, default: '' } },
          setup(props) {
            return () => h('i', { 'data-icon': props.name });
          },
        }),
      },
    },
  });

/** Что нарисовала иконка: `bool`-заглушка отдаёт атрибуты аватара, имя значка среди них. */
const iconOf = wrapper => {
  const html = wrapper.html();
  const match = html.match(/name="([^"]+)"/);
  return match?.[1] ?? null;
};

describe('AArrowButton: только иконка', () => {
  it('влево — material-symbols:arrow-left, вправо — arrow-right', () => {
    expect(iconOf(mountArrow({ direction: 'prev' }))).toBe('material-symbols:arrow-left');
    expect(iconOf(mountArrow({ direction: 'next' }))).toBe('material-symbols:arrow-right');
  });

  it('пресет кнопки — круглая подложка со стрелкой, а не голая иконка', () => {
    const classes = mountArrow().classes().join(' ');

    expect(classes).toContain('rounded-full');
    expect(classes).toContain('bg-surface-2');
    expect(classes).toContain('border-line');
    expect(preset.arrow_button).toBe(classes);
  });

  it('подпись уходит в aria-label, выключенная кнопка не жмётся', async () => {
    const wrapper = mountArrow({ label: 'Сдвинуть карты влево' });
    expect(wrapper.attributes('aria-label')).toBe('Сдвинуть карты влево');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    const off = mountArrow({ disabled: true });
    await off.trigger('click');
    expect(off.emitted('click')).toBeUndefined();
  });
});
