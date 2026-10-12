// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';

/**
 * Шторка героя живёт **на экране партии**, а не внутри полосы с рукой (`pages/game.vue`), и открывается
 * записью в реестре модалок (`openModal('heroSheet', playerId)` из карточки героя).
 *
 * Так её и проверяем: пейлоад — единственный вход, закрытие убирает запись из реестра. Проверять это
 * обязательно, потому что полоса **прячется, пока открыт любой оверлей** (`isAnyModalOpen`), и шторка,
 * лежащая внутри полосы, снимала бы сама себя: открылась — полоса исчезла — шторка размонтировалась —
 * полоса вернулась (и пересоздала руку со слайдером).
 *
 * `HeroSheet.vue` — SFC приложения: `computed`/`ref`/`watch`/`nextTick` приходят автоимпортами Nuxt,
 * в тесте кладём их в `globalThis` до импорта компонента (так же, как `player-card.test.js`).
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.watch = (await import('vue')).watch;
globalThis.nextTick = (await import('vue')).nextTick;

const HEROES = {
  medusa: { name: 'Медуза' },
  anubis: { name: 'Анубис' },
};

vi.mock('~/composables/api/heroes.js', async () => {
  const { computed, ref, toValue } = await import('vue');
  return {
    useHeroQuery: id => ({
      data: computed(() => HEROES[String(toValue(id) ?? '')] ?? null),
      isPending: ref(false),
      isError: ref(false),
    }),
  };
});

const { closeAllModals, closeModal, getModalPayload, isModalOpen, openModal } =
  await import('~/composables/ui/useModal.js');

const { default: HeroSheet } =
  await import('../../../app/components/organisms/modals/HeroSheet.vue');

/** Тело шторки (описание героя) и её кнопки в тесте не нужны — проверяем только открытие и закрытие. */
const stub = name =>
  defineComponent({
    name,
    setup(_props, { slots }) {
      return () => h('div', { 'data-stub': name }, slots.default?.());
    },
  });

const mountSheet = () =>
  mount(HeroSheet, {
    global: {
      stubs: {
        AButton: stub('AButton'),
        ALoader: stub('ALoader'),
        HeroDetails: stub('HeroDetails'),
        NuxtIcon: stub('NuxtIcon'),
      },
    },
  });

const dialog = wrapper => wrapper.find('[role="dialog"]');

beforeEach(() => closeAllModals());

describe('HeroSheet: открытие и закрытие через реестр', () => {
  it('без пейлоада шторки нет', () => {
    const wrapper = mountSheet();

    expect(dialog(wrapper).exists()).toBe(false);
    expect(wrapper.html()).toBe('<!--v-if-->');
  });

  it('запись в реестре открывает шторку героя из пейлоада', async () => {
    const wrapper = mountSheet();

    openModal('heroSheet', 'medusa');
    await wrapper.vm.$nextTick();

    expect(dialog(wrapper).exists()).toBe(true);
    expect(dialog(wrapper).attributes('aria-label')).toBe('Медуза');
    // шторка держится открытой, пока её не закрыли: полоса с рукой в это время скрыта
    expect(isModalOpen('heroSheet')).toBe(true);
  });

  it('смена пейлоада меняет героя', async () => {
    const wrapper = mountSheet();

    openModal('heroSheet', 'medusa');
    await wrapper.vm.$nextTick();
    openModal('heroSheet', 'anubis');
    await wrapper.vm.$nextTick();

    expect(dialog(wrapper).attributes('aria-label')).toBe('Анубис');
  });

  it('закрытие убирает и шторку, и запись в реестре — полоса возвращается', async () => {
    const wrapper = mountSheet();

    openModal('heroSheet', 'medusa');
    await wrapper.vm.$nextTick();
    closeModal('heroSheet');
    await wrapper.vm.$nextTick();

    expect(dialog(wrapper).exists()).toBe(false);
    expect(isModalOpen('heroSheet')).toBe(false);
    expect(getModalPayload('heroSheet')).toBeUndefined();
  });

  it('клик по подложке закрывает шторку', async () => {
    const wrapper = mountSheet();

    openModal('heroSheet', 'medusa');
    await wrapper.vm.$nextTick();
    await wrapper.trigger('click');

    expect(dialog(wrapper).exists()).toBe(false);
    expect(isModalOpen('heroSheet')).toBe(false);
  });

  it('Escape закрывает шторку, а клик по самой карточке героя — нет', async () => {
    const wrapper = mountSheet();

    openModal('heroSheet', 'medusa');
    await wrapper.vm.$nextTick();
    await dialog(wrapper).trigger('click');
    expect(dialog(wrapper).exists()).toBe(true);

    await dialog(wrapper).trigger('keydown', { key: 'Escape' });
    expect(dialog(wrapper).exists()).toBe(false);
    expect(isModalOpen('heroSheet')).toBe(false);
  });
});
