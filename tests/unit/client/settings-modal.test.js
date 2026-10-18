// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, ref, watch } from 'vue';

/**
 * Окно настроек: пока в нём одна группа — **скорость анимации** (быстро / средне / медленно).
 * Выбор применяется сразу (окно ничего не «сохраняет» кнопкой), «Готово» просто закрывает окно.
 *
 * `SettingsModal.vue` — SFC приложения: `computed`/`ref`/`watch` приходят автоимпортами Nuxt, в тесте
 * кладём их в `globalThis` до импорта компонента (так же, как `table-setup-loading.test.js`).
 * Состояние читаем в `document.body`: окно уезжает туда порталом reka-ui.
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.watch = watch;

// Настоящий `useUI` читает конфиг приложения (`app.config.js`), которого в тесте нет: классы пресетов
// этой проверке не нужны — она про выбор и запись настройки.
vi.mock('~/composables/ui/useUI', async importOriginal => {
  const { computed: computedFn } = await import('vue');
  const actual = await importOriginal();
  return { ...actual, useUI: () => ({ styles: computedFn(() => ({})) }) };
});

// Тот же путь импорта, что внутри компонента (`useModal`, без расширения): иначе модулей реестра
// окажется два и `openModal` в тесте не откроет окно компонента.
const { closeAllModals, isModalOpen, openModal } = await import('~/composables/ui/useModal');
const { useSettings } = await import('~/composables/ui/useSettings.js');
const { default: SettingsModal } =
  await import('../../../app/components/organisms/modals/SettingsModal.vue');

const IconStub = defineComponent({
  name: 'NuxtIcon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('i', { 'data-icon': props.name });
  },
});

const mountModal = () => mount(SettingsModal, { global: { stubs: { NuxtIcon: IconStub } } });

/** Окно уезжает в `document.body` порталом reka-ui: ищем его там, а не внутри обёртки. */
const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? '';
const radios = () => [...document.querySelectorAll('[role="radio"]')];
const radioByLabel = label => radios().find(node => node.textContent.includes(label));

beforeEach(() => {
  closeAllModals();
  useSettings().reset();
  document.body.innerHTML = '';
});

describe('окно настроек: скорость анимации', () => {
  it('открывается по имени и показывает три скорости', async () => {
    const wrapper = mountModal();
    expect(dialogText()).toBe('');

    openModal('settings');
    await nextTick();

    expect(dialogText()).toContain('Настройки');
    expect(dialogText()).toContain('Скорость анимации');
    expect(radios().map(node => node.textContent.trim())).toEqual(['Медленно', 'Средне', 'Быстро']);

    wrapper.unmount();
  });

  it('выбор применяется сразу и уходит в настройку', async () => {
    const wrapper = mountModal();
    openModal('settings');
    await nextTick();

    // по умолчанию «средне»
    expect(useSettings().animation.value).toBe('medium');

    radioByLabel('Быстро').click();
    await nextTick();
    expect(useSettings().animation.value).toBe('fast');
    expect(useSettings().duration('battleStep')).toBeLessThan(1600);

    radioByLabel('Медленно').click();
    await nextTick();
    expect(useSettings().animation.value).toBe('slow');
    expect(dialogText()).toContain('Сейчас: Медленно');

    wrapper.unmount();
  });

  it('«Готово» закрывает окно, а настройка остаётся', async () => {
    const wrapper = mountModal();
    openModal('settings');
    await nextTick();

    radioByLabel('Быстро').click();
    await nextTick();

    const done = [...document.querySelectorAll('button')].find(node =>
      node.textContent.includes('Готово'),
    );
    done.click();
    await nextTick();
    // reka-ui снимает портал по кадру: без него окно в happy-dom остаётся в разметке
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    await nextTick();

    expect(isModalOpen('settings')).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(useSettings().animation.value).toBe('fast');

    wrapper.unmount();
  });
});
