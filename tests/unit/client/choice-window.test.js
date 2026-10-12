// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

/**
 * Окно выбора вариантов и общая кнопка завершения при мультивыборе («выберите 2 из 3»).
 * Клиент обязан **отмечать несколько** кандидатов (чекбокс вместо радио и зелёная галка на отмеченных)
 * и показывать одну общую кнопку «Подтвердить» — но только когда движок разрешает закрыть окно:
 * у обязательного окна она включается полным набором, а половина набора оставляет её выключенной.
 *
 * Состояние окна приходит из `useGameSession` — в тесте он подменён: проверяется отрисовка, а не движок.
 */
globalThis.computed = computed;

const session = vi.hoisted(() => ({
  options: [],
  count: 1,
  picked: [],
  ok: { visible: false, enabled: false, label: null },
}));

vi.mock('~/composables/useGameSession.js', async () => {
  const { computed } = await import('vue');
  return {
    useGameSession: () => ({
      choices: computed(() =>
        session.options.map(option => ({
          optionId: option.id,
          title: option.text,
          disabled: option.disabled === true,
        })),
      ),
      targetingChoices: computed(() => []),
      choiceCount: computed(() => session.count),
      choicePicked: computed(() => session.picked),
      choiceComplete: computed(() => session.picked.length >= session.count),
      okControl: computed(() => session.ok),
      pending: computed(() => false),
      isGameOver: computed(() => false),
      onChoiceClick: () => undefined,
      onFinishAction: () => undefined,
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

const { default: ChoicePanel } =
  await import('../../../app/components/organisms/game/ChoicePanel.vue');
const { default: FinishButton } =
  await import('../../../app/components/molecules/game/FinishButton.vue');

/** Три варианта свойства, как у карты «выберите 2 из 3». */
const threeOptions = () => [
  { id: 'draw', text: 'добор' },
  { id: 'heal', text: 'лечение' },
  { id: 'strike', text: 'удар' },
];

const panel = () =>
  mount(ChoicePanel, {
    global: { stubs: { NuxtIcon: IconStub } },
  });

const finish = () =>
  mount(FinishButton, {
    global: { stubs: { NuxtIcon: IconStub } },
  });

describe('окно вариантов свойства: мультивыбор', () => {
  it('на несколько целей рисует чекбоксы и зовёт подтвердить, когда набор собран', () => {
    session.options = threeOptions();
    session.count = 2;
    session.picked = [];

    expect(panel().findAll('[data-icon="lucide:square"]')).toHaveLength(3);
    expect(panel().text()).toContain('Выберите варианты (нужно 2)');

    session.picked = ['draw'];
    const half = panel();
    // отмеченный вариант — зелёная галка, статус показывает, сколько уже отмечено
    expect(half.find('[data-icon="lucide:check"]').exists()).toBe(true);
    expect(half.findAll('[data-icon="lucide:square"]')).toHaveLength(2);
    expect(half.text()).toContain('Выбрано 1 из 2');

    session.picked = ['draw', 'heal'];
    expect(panel().text()).toContain('Нажмите «Подтвердить»');
  });

  it('на одну цель поведение прежнее: радио, галка на отмеченном и старые подписи', () => {
    session.options = threeOptions();
    session.count = 1;
    session.picked = [];

    expect(panel().findAll('[data-icon="lucide:circle"]')).toHaveLength(3);
    expect(panel().text()).toContain('Выберите вариант');

    session.picked = ['heal'];
    const marked = panel();
    expect(marked.find('[data-icon="lucide:check"]').exists()).toBe(true);
    expect(marked.text()).toContain('Нажмите «Подтвердить»');
  });
});

describe('общая кнопка: набор решает, активна ли она', () => {
  it('обязательное окно на две цели: половина набора кнопку не включает, полный набор — включает', () => {
    session.count = 2;
    session.picked = [];
    session.ok = { visible: false, enabled: false, label: null };

    expect(finish().attributes('disabled')).toBeDefined();

    session.picked = ['draw'];
    const half = finish();
    // отметка есть, но набор не собран: подтверждать нечего
    expect(half.attributes('disabled')).toBeDefined();

    session.picked = ['draw', 'heal'];
    const full = finish();
    expect(full.attributes('disabled')).toBeUndefined();
    expect(full.text()).toContain('Подтвердить');
  });

  it('окно на одну цель: одна отметка сразу включает кнопку — как было', () => {
    session.count = 1;
    session.picked = ['draw'];
    session.ok = { visible: false, enabled: false, label: null };

    const one = finish();
    expect(one.attributes('disabled')).toBeUndefined();
    expect(one.text()).toContain('Подтвердить');
  });

  it('необязательное окно: кнопку включает движок, даже если отметок ещё нет', () => {
    session.count = 2;
    session.picked = [];
    session.ok = { visible: true, enabled: true, label: 'Закончить эффект' };

    const optional = finish();
    expect(optional.attributes('disabled')).toBeUndefined();
    expect(optional.text()).toContain('Закончить эффект');
  });
});
