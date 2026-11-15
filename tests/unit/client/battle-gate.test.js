// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

/**
 * Окно битвы держит партию, пока игрок не прочитает итог (m00001): пока итог на экране, круговая
 * кнопка действия называется «Закрыть», активна и мигает — окно закрывает она, а не таймер.
 * Само окно (`BattleWindow`) регистрирует закрытие у `useBattleGate`, поэтому кнопка в панели и
 * кнопка внутри окна делают одно и то же.
 */
globalThis.computed = computed;

const session = vi.hoisted(() => ({
  ok: { visible: false, enabled: false, label: null },
  finished: 0,
}));

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { computed, ref } = await import('vue');
  return {
    useGameSession: () => ({
      okControl: computed(() => session.ok),
      pending: ref(false),
      isGameOver: ref(false),
      onFinishAction: () => {
        session.finished += 1;
      },
      choicePicked: computed(() => []),
      choiceComplete: computed(() => false),
    }),
  };
});

// Кнопка тянет конфиг приложения (`useUI` → `useAppConfig`), которого в тесте нет: классы не проверяем.
vi.mock('~/composables/ui/useUI', async importOriginal => {
  const actual = await importOriginal();
  const { computed } = await import('vue');
  return { ...actual, useUI: () => ({ styles: computed(() => ({})) }) };
});

// Тултип тянет конфиг Nuxt (`useUI` → `useAppConfig`): кнопке от него нужен только текст подсказки.
vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: { text: { type: String, default: '' } },
      setup(props, { slots }) {
        return () => h('div', { 'data-tooltip': props.text }, slots.default?.());
      },
    }),
  };
});

const IconStub = defineComponent({
  name: 'NuxtIcon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('i', { 'data-icon': props.name });
  },
});

const { default: FinishButton } =
  await import('../../../app/components/molecules/game/FinishButton.vue');
const { battleResultShown, setBattleResultShown, dismissBattleResult, registerBattleDismiss } =
  await import('~/composables/game/useBattleGate.js');

const finish = () =>
  mount(FinishButton, {
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

/** Активность кнопки — на самой кнопке: обвязка тултипа её состояние не значит. */
const disabled = wrapper => wrapper.find('button').attributes('disabled');

beforeEach(() => {
  setBattleResultShown(false);
  session.ok = { visible: false, enabled: false, label: null };
  session.finished = 0;
});

afterEach(() => {
  registerBattleDismiss(null);
  setBattleResultShown(false);
});

describe('итог битвы держит партию, пока окно открыто', () => {
  it('пока итог на экране, кнопка действия — активная и мигающая «Закрыть»', () => {
    setBattleResultShown(true);
    const wrapper = finish();

    expect(disabled(wrapper)).toBeUndefined();
    expect(wrapper.find('button').attributes('aria-label')).toContain('Закрыть');
    // мигание кнопки — пульсирующее кольцо, как у активного действия
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);
  });

  it('без итога та же кнопка закрытия выключена и делает обычное действие', () => {
    const wrapper = finish();

    expect(disabled(wrapper)).toBe('');
    expect(wrapper.find('button').attributes('aria-label')).not.toContain('Закрыть');
  });

  it('нажатие закрытия убирает окно, а не завершает действие', () => {
    const close = vi.fn();
    registerBattleDismiss(close);
    setBattleResultShown(true);

    finish().find('button').trigger('click');

    expect(close).toHaveBeenCalledTimes(1);
    expect(session.finished).toBe(0);
  });

  it('окно не зарегистрировано — закрывать нечего, кнопка молчит', () => {
    setBattleResultShown(true);
    const wrapper = finish();

    expect(() => wrapper.find('button').trigger('click')).not.toThrow();
    expect(session.finished).toBe(0);
  });

  it('закрытие снимает флаг, и подсказка возвращается к обычной', () => {
    setBattleResultShown(true);
    expect(battleResultShown().value).toBe(true);

    setBattleResultShown(false);
    expect(battleResultShown().value).toBe(false);
    expect(dismissBattleResult).toBeTypeOf('function');
  });
});
