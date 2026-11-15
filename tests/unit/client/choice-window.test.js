// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  targeting: [],
  count: 1,
  picked: [],
  hand: null,
  required: false,
  ok: { visible: false, enabled: false, label: null },
}));

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { computed } = await import('vue');
  const merged = () => {
    const byId = new Map();
    for (const entry of [...session.options, ...session.targeting]) {
      byId.set(entry.id, {
        ...entry,
        optionId: entry.id,
        title: entry.text,
        disabled: entry.disabled === true,
      });
    }
    return [...byId.values()];
  };
  return {
    useGameSession: () => ({
      choiceEntries: computed(merged),
      choiceHand: computed(() => session.hand),
      choiceRequired: computed(() => session.required === true),
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
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

beforeEach(() => {
  session.options = [];
  session.targeting = [];
  session.count = 1;
  session.picked = [];
  session.hand = null;
  session.required = false;
  session.ok = { visible: false, enabled: false, label: null };
});

const finish = () =>
  mount(FinishButton, {
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });
/** Активность кнопки — на самой кнопке: обвязка тултипа её состояние не значит. */
const finishDisabled = wrapper => wrapper.find('button').attributes('disabled');

describe('окно вариантов свойства: мультивыбор', () => {
  it('на несколько целей рисует чекбоксы и зовёт подтвердить, когда набор собран', () => {
    session.options = threeOptions();
    session.count = 2;
    session.picked = [];

    expect(panel().findAll('[data-icon="lucide:square"]')).toHaveLength(3);
    // статус живёт в подсказке сверху, а не в окне выбора
    expect(panel().text()).not.toContain('Выберите варианты');

    session.picked = ['draw'];
    const half = panel();
    // отмеченный вариант — зелёная галка
    expect(half.find('[data-icon="lucide:check"]').exists()).toBe(true);
    expect(half.findAll('[data-icon="lucide:square"]')).toHaveLength(2);

    session.picked = ['draw', 'heal'];
    expect(panel().findAll('[data-icon="lucide:check"]')).toHaveLength(2);
  });

  it('на одну цель поведение прежнее: радио и галка на отмеченном', () => {
    session.options = threeOptions();
    session.count = 1;
    session.picked = [];

    expect(panel().findAll('[data-icon="lucide:circle"]')).toHaveLength(3);
    expect(panel().text()).not.toContain('Выберите вариант');

    session.picked = ['heal'];
    const marked = panel();
    expect(marked.find('[data-icon="lucide:check"]').exists()).toBe(true);
  });
});

describe('подписи вариантов: текст свойства, а не id', () => {
  it('окно вне боя берёт подписи из кандидатов движка', () => {
    session.targeting = [
      { id: 'heal', text: 'Восстановите Ифриту 2 здоровья.' },
      { id: 'draw', text: 'Возьмите 2 карты.' },
      { id: 'step', text: 'Сдвиньте Ифрита на расстояние до 2 клеток.' },
    ];

    const window = panel();
    expect(window.findAll('[data-icon="lucide:circle"]')).toHaveLength(3);
    expect(window.text()).toContain('Восстановите Ифриту 2 здоровья.');
    expect(window.text()).not.toContain('heal');
    // кружок-радио держится первой строки текста, а не середины многострочного варианта
    expect(window.find('button').classes()).toContain('items-start');
  });

  it('один вариант не дублируется, когда движок отдал и choices, и кандидатов', () => {
    session.options = threeOptions();
    session.targeting = threeOptions();

    const window = panel();
    expect(window.findAll('button')).toHaveLength(3);
    expect(window.text().match(/добор/g)).toHaveLength(1);
  });
});

describe('выбор карты из руки: окно руки, а не список вариантов', () => {
  it('карты руки не идут в список вариантов — их открывают в окне руки', async () => {
    session.hand = {
      playerId: 'medusa',
      name: 'Медуза',
      cards: [
        { optionId: 'mirror_1', title: 'Ледяное зеркало', type: 'attack', value: 3, zone: 'hand' },
      ],
    };
    session.required = true;

    const { closeAllModals, getActiveModals } = await import('~/composables/ui/useModal.js');
    closeAllModals();

    const window = panel();
    // карта — не строка подписи: списка вариантов нет вовсе
    expect(window.findAll('[data-icon="lucide:circle"]')).toHaveLength(0);
    expect(window.text()).toContain('Выберите карту в окне руки');
    expect(window.text()).not.toContain('Ледяное зеркало');

    await window.find('[data-hand-open]').trigger('click');
    expect(getActiveModals().value).toContain('hand');
    closeAllModals();
  });

  it('отмеченная карта просит подтверждения', () => {
    session.hand = {
      playerId: 'medusa',
      name: 'Медуза',
      cards: [{ optionId: 'mirror_1', zone: 'hand' }],
    };
    session.picked = ['mirror_1'];

    expect(panel().text()).toContain('Нажмите «Подтвердить»');
  });
});

describe('общая кнопка: набор решает, активна ли она', () => {
  it('обязательное окно на две цели: половина набора кнопку не включает, полный набор — включает', () => {
    session.count = 2;
    session.picked = [];
    session.ok = { visible: false, enabled: false, label: null };

    expect(finishDisabled(finish())).toBeDefined();

    session.picked = ['draw'];
    const half = finish();
    // отметка есть, но набор не собран: подтверждать нечего
    expect(finishDisabled(half)).toBeDefined();

    session.picked = ['draw', 'heal'];
    const full = finish();
    expect(finishDisabled(full)).toBeUndefined();
    expect(full.find('button').attributes('aria-label')).toContain('Подтвердить');
  });

  it('окно на одну цель: одна отметка сразу включает кнопку — как было', () => {
    session.count = 1;
    session.picked = ['draw'];
    session.ok = { visible: false, enabled: false, label: null };

    const one = finish();
    expect(finishDisabled(one)).toBeUndefined();
    expect(one.find('button').attributes('aria-label')).toContain('Подтвердить');
  });

  it('необязательное окно: кнопку включает движок, даже если отметок ещё нет', () => {
    session.count = 2;
    session.picked = [];
    session.ok = { visible: true, enabled: true, label: 'Закончить эффект' };

    const optional = finish();
    expect(finishDisabled(optional)).toBeUndefined();
    expect(optional.find('button').attributes('aria-label')).toContain('Закончить эффект');
  });
});
