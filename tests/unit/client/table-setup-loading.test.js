// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref, watch } from 'vue';

/**
 * Загрузка партии живёт в модалке стола: **окно не закрывается, пока экран партии не готов** (жалоба
 * владельца: после клика модалка исчезала и лобби стояло нетронутым, пока грузилась партия). На кнопке
 * «Начать» крутится лоадер, «Отмена» сбрасывает сборку и возвращает в лобби — на случай зависшей загрузки.
 *
 * Проверяем именно это: оверлей остаётся открытым и после ответа сервера, пока идёт переход (кнопка
 * с лоадером, поля выключены), отмена рвёт запрос и не оставляет партии, а ошибка сборки возвращает окно
 * в рабочее состояние.
 *
 * `TableSetupModal.vue` — SFC приложения: `computed`/`ref`/`watch` приходят автоимпортами Nuxt, в тесте
 * кладём их в `globalThis` до импорта компонента (так же, как `hero-details-modal.test.js`). Запрос сборки — тоже
 * автоимпорт (`$fetch`), его подменяем в `globalThis`, а переход на экран партии — вход `navigate`.
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.watch = watch;

const seedCalls = [];
const seedViewCalls = [];
const discardCalls = [];

vi.mock('~/composables/game/useGameView', () => ({
  useGameView: () => ({
    seed: (host, playerId) => {
      seedCalls.push({ host, playerId });
    },
    seedView: raw => {
      seedViewCalls.push(raw);
    },
    discard: () => discardCalls.push(true),
  }),
}));

vi.mock('~/composables/ui/useSortable', () => ({
  useSortable: () => ({
    draggingIndex: ref(-1),
    overIndex: ref(-1),
    handleProps: () => ({}),
    targetProps: () => ({}),
    moveBy: () => null,
  }),
}));

// Настоящий `useUI` читает конфиг приложения (`app.config.js`), которого в тесте нет: классы пресетов
// этой проверке не нужны — она про состояние окна (так же, как `player-card.test.js`).
vi.mock('~/composables/ui/useUI', async importOriginal => {
  const { computed: computedFn } = await import('vue');
  const actual = await importOriginal();
  return {
    ...actual,
    useUI: () => ({ styles: computedFn(() => ({})) }),
  };
});

// Тот же путь импорта, что внутри `TableSetupModal.vue` (`useModal`, без расширения): иначе модулей
// реестра окажется два и `openModal` в тесте не откроет окно компонента.
const { closeAllModals, isModalOpen, openModal } = await import('~/composables/ui/useModal');

const { default: TableSetupModal } =
  await import('../../../app/components/organisms/modals/TableSetupModal.vue');

const HEROES = [
  { id: 'medusa', name: 'Медуза', health: 14 },
  { id: 'anubis', name: 'Анубис', health: 15 },
];

const CREATED = {
  id: 'game_test_1',
  host: { id: 'game_test_1', hook: 'gameStart' },
  you: 'medusa',
  players: [],
};

const stub = name =>
  defineComponent({
    name,
    setup(_props, { slots, emit, attrs }) {
      return () =>
        h(
          'div',
          { ...attrs, 'data-stub': name, 'onClick': () => emit('click') },
          slots.default?.(),
        );
    },
  });

/**
 * Кнопка ждёт канонической формы стола: по умолчанию места не заполнены, и «Начать» выключена —
 * клик по выключенной кнопке в браузере не срабатывает. Поэтому у заглушки кнопки `disabled` остаётся
 * входом компонента, но в разметку не попадает: проверяем не её, а состояние окна.
 */
const buttonStub = defineComponent({
  name: 'AButton',
  props: {
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
  },
  setup(_props, { slots, emit, attrs }) {
    return () =>
      h(
        'div',
        { ...attrs, 'data-stub': 'AButton', 'onClick': () => emit('click') },
        slots.default?.(),
      );
  },
});

const wrappers = [];

/** Переход на экран партии подменяется входом `navigate`: по умолчанию это Nuxt-овый `navigateTo`. */
let navigate;

const mountTable = async () => {
  const wrapper = mount(TableSetupModal, {
    props: { content: { heroes: HEROES }, navigate },
    global: {
      stubs: {
        AAvatar: stub('AAvatar'),
        AButton: buttonStub,
        AInput: stub('AInput'),
        ARadioGroup: stub('ARadioGroup'),
        ASelect: stub('ASelect'),
        ASwitch: stub('ASwitch'),
        NuxtIcon: stub('NuxtIcon'),
      },
    },
  });
  wrappers.push(wrapper);
  await wrapper.vm.$nextTick();
  return wrapper;
};

/** Окно уезжает в `document.body` порталом reka-ui: ищем его там, а не внутри обёртки. */
const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? '';
const dialogOpen = () => Boolean(document.querySelector('[role="dialog"]'));

const startButton = () =>
  [...document.querySelectorAll('[data-stub="AButton"]')].find(node =>
    /Начать|Создание|Начало партии/.test(node.textContent),
  );

const buttonByText = text =>
  [...document.querySelectorAll('[data-stub="AButton"]')].find(node =>
    node.textContent.includes(text),
  );

const click = node => {
  node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

beforeEach(() => {
  seedCalls.length = 0;
  seedViewCalls.length = 0;
  discardCalls.length = 0;
  closeAllModals();
  openModal('table');
});

afterEach(() => {
  while (wrappers.length) wrappers.pop().unmount();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  closeAllModals();
});

describe('Загрузка партии в модалке стола', () => {
  it('пока идёт сборка, окно открыто, а на «Начать» лоадер', async () => {
    let resolveFetch;
    vi.stubGlobal(
      '$fetch',
      vi.fn(
        () =>
          new Promise(resolve => {
            resolveFetch = resolve;
          }),
      ),
    );
    navigate = vi.fn(() => Promise.resolve());

    const wrapper = await mountTable();
    expect(dialogOpen()).toBe(true);

    click(startButton());
    await flushPromises();

    expect(globalThis.$fetch).toHaveBeenCalledTimes(1);
    expect(dialogOpen()).toBe(true);
    expect(isModalOpen('table')).toBe(true);
    expect(startButton().textContent).toContain('Создание…');

    resolveFetch(CREATED);
    await flushPromises();
    expect(dialogOpen()).toBe(true);
  });

  it('партию отдаёт проекция из ответа сервера — второго запроса на экран партии нет', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(() => Promise.resolve(CREATED)),
    );
    let releaseNavigation;
    navigate = vi.fn(
      () =>
        new Promise(resolve => {
          releaseNavigation = resolve;
        }),
    );

    const wrapper = await mountTable();
    click(startButton());
    await flushPromises();

    expect(seedCalls).toEqual([{ host: CREATED.host, playerId: 'medusa' }]);
    expect(seedViewCalls).toEqual([CREATED]);
    expect(navigate).toHaveBeenCalledWith({
      path: '/game',
      query: { gameId: 'game_test_1', playerId: 'medusa' },
    });
    // переход ещё идёт: окно не закрыто, кнопка ждёт, поля выключены
    expect(dialogOpen()).toBe(true);
    expect(startButton().textContent).toContain('Начало партии…');
    expect(document.querySelector('fieldset').disabled).toBe(true);

    releaseNavigation();
    await flushPromises();
  });

  it('отмена рвёт запрос, сбрасывает партию и закрывает окно', async () => {
    const signals = [];
    vi.stubGlobal(
      '$fetch',
      vi.fn(
        (_url, options) =>
          new Promise(() => {
            signals.push(options.signal);
          }),
      ),
    );
    navigate = vi.fn(() => Promise.resolve());

    const wrapper = await mountTable();
    click(startButton());
    await flushPromises();
    expect(signals[0]?.aborted).toBe(false);

    click(buttonByText('Отмена'));
    await flushPromises();

    expect(signals[0].aborted).toBe(true);
    expect(discardCalls).toEqual([true]);
    expect(seedCalls).toEqual([]);
    expect(seedViewCalls).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
    expect(isModalOpen('table')).toBe(false);
  });

  it('ошибка сборки возвращает окно в рабочее состояние', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(() => Promise.reject(new Error('сервер не собрал стол'))),
    );
    navigate = vi.fn(() => Promise.resolve());

    const wrapper = await mountTable();
    click(startButton());
    await flushPromises();

    expect(dialogText()).toContain('сервер не собрал стол');
    expect(dialogOpen()).toBe(true);
    expect(isModalOpen('table')).toBe(true);
    expect(startButton().textContent).toContain('Начать');
    expect(seedCalls).toEqual([]);
  });

  it('уход со страницы обрывает незавершённую сборку', async () => {
    const signals = [];
    vi.stubGlobal(
      '$fetch',
      vi.fn(
        (_url, options) =>
          new Promise(() => {
            signals.push(options.signal);
          }),
      ),
    );
    navigate = vi.fn(() => Promise.resolve());

    const wrapper = await mountTable();
    click(startButton());
    await flushPromises();
    expect(signals[0]?.aborted).toBe(false);

    wrapper.unmount();
    expect(signals[0].aborted).toBe(true);
  });
});
