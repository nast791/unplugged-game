// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

/**
 * Окно битвы — окно с **своим законом открытия и закрытия**: пока битва идёт, оно на экране у её
 * участников, и убрать его нечем (ни кнопки, ни клика мимо, ни `Esc`) — открывается оно само.
 * После расчётов окно **остаётся** с итогом, и убирает его игрок: кнопка «Закрыть» в окне или
 * любое действие вне окна; та же битва сама уже не возвращается.
 * Остальным те же сведения отдаёт подсказка (`shared/phases/waiting.js: hints.battle`), а окна у них нет.
 *
 * Здесь же стерегутся три алгоритма окна:
 * 1) **лента шагов играется с паузами** — битва движок разыгрывает целиком внутри одного действия,
 *    поэтому окно доигрывает готовую очередь: шаг за шагом, урон последним и дольше;
 * 2) **окно сворачивается само**, когда свойство карты просит выбрать цель или карту, и разворачивается,
 *    когда выбор сделан (клик по миниатюре разворачивает его и посреди выбора);
 * 3) **размер и место** — минимум, предел экрана, перетаскивание за шапку и стрелки с клавиатуры.
 *
 * `BattleWindow.vue` — SFC приложения: `ref`/`computed`/`watch`/`onBeforeUnmount` приходят автоимпортами
 * Nuxt, в тесте кладём их в `globalThis` до импорта компонента (так же, как `hints-window.test.js`).
 */
globalThis.ref = ref;
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

/** Состояние партии окно читает из сессии: в тесте оно своё, вместе с ним проверяются подписи и числа. */
vi.mock('~/composables/game/useGameSession.js', async () => {
  const { computed, ref } = await import('vue');
  const session = {
    combat: ref(null),
    players: ref([]),
    you: ref('p1'),
    lastCombat: ref(null),
    lastSkill: ref(null),
    targeting: ref(null),
    movement: ref(null),
    askingCard: ref(null),
    steps: ref(0),
    okControl: ref({ visible: false, enabled: false, label: null }),
    pending: ref(false),
    onFinishAction: vi.fn(),
    isBattleParticipant: id => {
      const current = session.combat.value;
      if (!current || id == null) return false;
      return [current.attackerPlayerId, current.defenderPlayerId].some(
        entry => entry != null && String(entry) === String(id),
      );
    },
  };
  session.asking = computed(() => session.targeting.value ?? session.movement.value ?? null);
  return { useGameSession: () => session, session };
});

// Тултип — своя обвязка reka-ui: окну от него нужен только текст подсказки (как в `piles.test.js`).
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

vi.mock('~/components/atoms/AScroll.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AScroll',
      setup(_props, { slots }) {
        return () => h('div', slots.default?.());
      },
    }),
  };
});

vi.mock('~/components/atoms/AButton.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AButton',
      props: { disabled: { type: Boolean, default: false } },
      setup(props, { slots }) {
        return () => h('button', { type: 'button', disabled: props.disabled }, slots.default?.());
      },
    }),
  };
});

vi.mock('~/components/atoms/AAvatar.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AAvatar',
      props: { alt: { type: String, default: '' } },
      setup(props) {
        return () => h('span', { 'data-avatar': props.alt });
      },
    }),
  };
});

/**
 * Карта боя — своя молекула с картинкой и скроллом: в тесте окна важно, что она получила карту,
 * подсвеченный момент и живое число, а не как она выглядит внутри.
 */
vi.mock('~/components/molecules/game/Card.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'Card',
      props: {
        card: { type: Object, required: true },
        highlight: { type: Array, default: () => [] },
        value: { type: Number, default: null },
        valueChanged: { type: Boolean, default: false },
      },
      setup(props) {
        return () =>
          h(
            'div',
            {
              'data-card': props.card.title,
              'data-highlight': props.highlight.join(','),
              'data-value': props.value == null ? '' : String(props.value),
              'data-value-changed': props.valueChanged ? 'true' : 'false',
            },
            [props.card.title, ' ', props.card.text],
          );
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

const { session } = await import('~/composables/game/useGameSession.js');
const { TOOLTIPS } = await import('../../../app/constants/tooltips.js');
const { ANIMATION_DURATIONS } = await import('../../../app/constants/animation.js');
const { BATTLE_MIN_SIZE } = await import('../../../app/composables/game/useBattleView.js');
const { useSettings } = await import('../../../app/composables/ui/useSettings.js');
const { default: BattleWindow } =
  await import('../../../app/components/organisms/game/BattleWindow.vue');

/** Битва на стадии защиты: атакующий известен, защитник ещё думает. */
const combatFixture = () => ({
  stage: 'defense',
  attackerPlayerId: 'p1',
  defenderPlayerId: 'p2',
  attackerFighterId: 'f1',
  targetFighterId: 'f2',
  attackCard: {
    id: 'a1',
    title: 'Наотмашь',
    type: 'attack',
    value: 4,
    bonus: 1,
    quantity: 2,
    text: 'ВО ВРЕМЯ БИТВЫ: значение карты +1. ПОСЛЕ БИТВЫ: нанесите 1 урон помощнику.',
  },
  defenseCard: null,
  attackValue: 4,
  defenseValue: 0,
  effects: [
    {
      order: 1,
      moment: 'immediately',
      side: 'attacker',
      cardId: 'a1',
      playerId: 'p1',
      status: 'applied',
    },
  ],
});

const playersFixture = () => [
  {
    id: 'p1',
    name: 'Элизиф',
    control: 'human',
    color: '#22d3ee',
    fighters: [
      { id: 'f1', name: 'Амат', type: 'hero', currentHp: 9, startHp: 12, currentPosition: 'c1' },
    ],
  },
  {
    id: 'p2',
    name: '',
    control: 'ai',
    color: '#ff7f50',
    fighters: [
      {
        id: 'f2',
        name: 'Тото',
        type: 'assistant',
        currentHp: 4,
        startHp: 4,
        currentPosition: 'c2',
      },
    ],
  },
];

/** Запас до края экрана, тот же, что в компоненте: окно не растягивается в самый край. */
const SCREEN_MARGIN = 24;

const openBattle = () => {
  session.combat.value = combatFixture();
  session.players.value = playersFixture();
};

const mountWindow = () => mount(BattleWindow, { global: { stubs: { NuxtIcon: IconStub } } });

/** Запись закрытого боя: ключи карт без самих карт — вскрытие находит их в сбросе. */
const finishedRecord = () => ({
  attackerPlayerId: 'p1',
  defenderPlayerId: 'p2',
  attackerFighterId: 'f1',
  targetFighterId: 'f2',
  attackValue: 5,
  defenseValue: 2,
  combatDamage: 3,
  winner: 'attacker',
  attackCardId: 'a1',
  defenseCardId: 'd1',
  effects: [
    { order: 1, moment: 'immediately', side: 'defender', cardId: 'd1', status: 'applied' },
    { order: 2, moment: 'duringCombat', side: 'attacker', cardId: 'a1', status: 'applied' },
  ],
});

/** Бой закрылся: карты ушли в сброс, урон посчитан — окно доигрывает ленту и гаснет само. */
const finishBattle = async () => {
  session.combat.value = null;
  // сброс пополняется тем же действием, что закрыло бой: в снимке боя этих карт ещё нет
  session.players.value[0].discard = [
    {
      id: 'a1',
      instanceId: 'a1',
      title: 'Наотмашь',
      type: 'attack',
      value: 4,
      text: 'ВО ВРЕМЯ БИТВЫ: +1',
    },
  ];
  session.players.value[1].discard = [
    { id: 'd1', instanceId: 'd1', title: 'Клёпка', type: 'defense', value: 2, text: '' },
  ];
  session.lastCombat.value = finishedRecord();
  await nextTick();
};

beforeEach(() => {
  // подделываем только таймеры ленты: `requestAnimationFrame` нужен живым (перетаскивание пишет в кадре)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // скорость анимации — настройка приложения: каждый тест начинает со «средней»
  useSettings().reset();
  session.combat.value = null;
  session.players.value = [];
  session.you.value = 'p1';
  session.lastCombat.value = null;
  session.targeting.value = null;
  session.movement.value = null;
  session.askingCard.value = null;
  session.steps.value = 0;
  session.okControl.value = { visible: false, enabled: false, label: null };
  session.pending.value = false;
  session.onFinishAction.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Размер окна на момент захвата: `happy-dom` сам размеров не считает, поэтому рамку задаём руками. */
const stubFrame = (wrapper, box = { left: 120, top: 90, width: 640, height: 500 }) => {
  const element = wrapper.find('section').element;
  element.getBoundingClientRect = () => ({
    ...box,
    x: box.left,
    y: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
  });
};

/** Событие указателя с координатами: готовому событию happy-dom `clientX` не присвоить. */
const pointerEvent = (type, { clientX = 0, clientY = 0, pointerId = 1, button = 0 } = {}) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'button', { value: button });
  return event;
};

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

const drag = async (element, from, to) => {
  element.dispatchEvent(pointerEvent('pointerdown', from));
  await nextTick();
  document.dispatchEvent(pointerEvent('pointermove', to));
  await nextFrame();
  await nextTick();
  document.dispatchEvent(pointerEvent('pointerup', to));
  await nextTick();
};

const resize = async (wrapper, from, to) => {
  const handle = wrapper.find('[data-battle-resize]');
  handle.element.dispatchEvent(pointerEvent('pointerdown', from));
  await nextTick();
  document.dispatchEvent(pointerEvent('pointermove', to));
  await nextTick();
  document.dispatchEvent(pointerEvent('pointerup', to));
  await nextTick();
};

const styleOf = wrapper => {
  const style = wrapper.find('section').attributes('style') ?? '';
  const read = name => Number(new RegExp(`${name}:\\s*(-?[\\d.]+)px`).exec(style)?.[1]);
  return { left: read('left'), top: read('top'), width: read('width'), height: read('height') };
};

/** Пауза ленты: прокручиваем таймеры и даём Vue перерисоваться. */
const passTime = async ms => {
  vi.advanceTimersByTime(ms);
  await nextTick();
};

describe('окно битвы: кому оно открыто', () => {
  it('без битвы окна нет вовсе', () => {
    const wrapper = mountWindow();

    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.html()).toBe('<!--v-if-->');
  });

  it('участник битвы видит окно, а третий игрок — нет: ему те же сведения отдаёт подсказка', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    expect(wrapper.find('[data-battle-window]').exists()).toBe(true);

    // третий игрок смотрит на ту же битву — окна у него нет
    session.you.value = 'p3';
    await nextTick();
    expect(wrapper.find('[data-battle-window]').exists()).toBe(false);

    // а защитник видит окно со своей стороны
    session.you.value = 'p2';
    await nextTick();
    expect(wrapper.find('[data-battle-window]').exists()).toBe(true);
  });

  it('пока защитник не выбран, окна нет: игрок ещё выбирает бойцов по доске, а окно закрыло бы её', async () => {
    session.combat.value = {
      ...combatFixture(),
      stage: 'target',
      attackerFighterId: 'f1',
      defenderPlayerId: null,
      targetFighterId: null,
    };
    session.players.value = playersFixture();
    const wrapper = mountWindow();
    await nextTick();
    expect(wrapper.find('[data-battle-window]').exists()).toBe(false);

    // защитника выбрали — окно открывается само
    session.combat.value = {
      ...session.combat.value,
      defenderPlayerId: 'p2',
      targetFighterId: 'f2',
      stage: 'defense',
    };
    await nextTick();
    expect(wrapper.find('[data-battle-window]').exists()).toBe(true);
  });

  it('пока битва идёт, закрыть окно нечем: кнопки закрытия нет, Esc и клик его не прячут', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    const labels = wrapper.findAll('button').map(button => button.attributes('aria-label'));
    expect(labels).toEqual([TOOLTIPS.battle.minimize()]);
    expect(wrapper.find('[data-battle-close]').exists()).toBe(false);

    await wrapper.find('section').trigger('keydown', { key: 'Escape' });
    await wrapper.find('[data-battle-body]').trigger('click');
    document.body.dispatchEvent(pointerEvent('pointerdown'));
    await nextTick();
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);
  });
});

describe('окно битвы: стороны и карты', () => {
  it('защита слева, атака справа: слот защиты пунктиром и карта атакующего', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    const sides = wrapper.findAll('[data-battle-side]');
    expect(sides.map(side => side.attributes('data-side'))).toEqual(['defender', 'attacker']);
    // защитник ещё не выложил карту — видит пустой слот, а не карту
    expect(sides[0].text()).toContain('Ждём карту защиты');
    expect(sides[0].find('[data-card]').exists()).toBe(false);
    // карта атакующего на месте, число живое
    expect(sides[1].find('[data-card]').attributes('data-card')).toBe('Наотмашь');
    expect(sides[1].find('[data-card]').attributes('data-value')).toBe('4');
  });

  it('боец над картой: имя, здоровье и чей он игрок; у компьютера — «Компьютер»', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    const [, attacker] = wrapper.findAll('[data-battle-side]');
    expect(attacker.text()).toContain('Амат');
    expect(attacker.text()).toContain('Элизиф');
    expect(attacker.text()).toContain('9/12');

    const [defender] = wrapper.findAll('[data-battle-side]');
    // у слота компьютера ника нет — пишем «Компьютер» (решение владельца)
    expect(defender.text()).toContain('Компьютер');
    expect(defender.text()).toContain('4/4');
  });

  it('пас защитника помечает слот пустым, а не «ждём карту»', async () => {
    openBattle();
    session.combat.value = { ...combatFixture(), stage: 'reveal', attackValue: 4, defenseValue: 0 };
    const wrapper = mountWindow();
    await nextTick();

    expect(wrapper.findAll('[data-battle-side]')[0].text()).toContain('Без защиты');
  });

  it('чужую карту до вскрытия проекция прячет — окно говорит «Карта закрыта»', async () => {
    openBattle();
    // проекция не отдаёт карту вовсе: ключа нет, а не «карта равна null»
    delete session.combat.value.attackCard;
    delete session.combat.value.attackValue;
    const wrapper = mountWindow();
    await nextTick();

    expect(wrapper.findAll('[data-battle-side]')[1].text()).toContain('Карта закрыта');
    expect(wrapper.text()).not.toContain('урон');
  });

  it('мечи появляются, когда защита решена', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    expect(wrapper.find('[data-battle-swords]').exists()).toBe(false);

    session.combat.value = { ...combatFixture(), stage: 'reveal' };
    await nextTick();
    expect(wrapper.find('[data-battle-swords]').exists()).toBe(true);
  });

  it('изменённое число карты показывается другим цветом и подписью', async () => {
    openBattle();
    session.combat.value = { ...combatFixture(), stage: 'reveal', attackValue: 5, defenseValue: 2 };
    const wrapper = mountWindow();
    await nextTick();

    const [, attacker] = wrapper.findAll('[data-battle-side]');
    const card = attacker.find('[data-card]');
    expect(card.attributes('data-value')).toBe('5');
    expect(card.attributes('data-value-changed')).toBe('true');
    expect(attacker.find('[data-battle-value]').text()).toContain('+1');
    expect(wrapper.text()).toContain('5 − 2');
  });

  it('карта усиления ложится поверх той карты, чей шаг её потратил', async () => {
    openBattle();
    session.players.value[0].discard = [
      {
        id: 'quiet',
        instanceId: 'quiet_1',
        title: 'Тихий шаг',
        type: 'defense',
        value: 2,
        text: '',
      },
    ];
    session.combat.value = {
      ...combatFixture(),
      stage: 'reveal',
      effects: [
        {
          order: 1,
          moment: 'immediately',
          side: 'attacker',
          cardId: 'a1',
          playerId: 'p1',
          status: 'applied',
          cards: ['quiet_1'],
        },
      ],
    };
    const wrapper = mountWindow();
    await nextTick();

    const [, attacker] = wrapper.findAll('[data-battle-side]');
    expect(attacker.find('[data-battle-boost]').exists()).toBe(true);
    expect(attacker.find('[data-battle-boost]').text()).toContain('Тихий шаг');
    expect(wrapper.findAll('[data-battle-side]')[0].find('[data-battle-boost]').exists()).toBe(
      false,
    );
  });
});

describe('окно битвы: лента шагов с паузами', () => {
  it('после боя окно остаётся, шаги идут по одному, урон — последним', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    await finishBattle();
    // окно живо, но сначала пауза на вскрытые карты: обе карты видно, свойства ещё не пошли
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);
    expect(wrapper.findAll('[data-battle-step-status]')).toHaveLength(0);
    // карты закрытого боя окно нашло в сбросах — обе стороны видны
    expect(wrapper.text()).toContain('Наотмашь');
    expect(wrapper.text()).toContain('Клёпка');

    await passTime(ANIMATION_DURATIONS.battleReveal);
    // пошёл первый шаг: он играет, а статус откроется, когда его пауза пройдёт
    expect(wrapper.findAll('[data-battle-step-status]')).toHaveLength(0);

    await passTime(ANIMATION_DURATIONS.battleStep);
    expect(wrapper.findAll('[data-battle-step-status]')).toHaveLength(1);
    expect(wrapper.findAll('[data-battle-step-status]')[0].text()).toBe('сработало');
    // урон ещё не показан: до него дойдёт лента
    expect(wrapper.find('[data-battle-damage]').exists()).toBe(false);

    await passTime(ANIMATION_DURATIONS.battleStep);
    expect(wrapper.findAll('[data-battle-step-status]')).toHaveLength(2);
    expect(wrapper.find('[data-battle-damage]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-damage]').text()).toBe('−3');

    await passTime(ANIMATION_DURATIONS.battleDamage);
    // лента доиграла, но окно остаётся с итогом: все шаги, урон и кнопка «Закрыть»
    expect(wrapper.find('[data-battle-window]').exists()).toBe(true);
    expect(wrapper.findAll('[data-battle-step-status]')).toHaveLength(2);
    expect(wrapper.find('[data-battle-damage]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-close]').exists()).toBe(true);

    await wrapper.find('[data-battle-close]').trigger('click');
    expect(wrapper.find('[data-battle-window]').exists()).toBe(false);
  });

  it('вскрытие берёт карты из записи боя: в снимке их нет, сброс ещё пуст', async () => {
    session.you.value = 'p2';
    // защитнику проекция карту атакующего до вскрытия не отдаёт — снимок боя снят без неё
    session.players.value = playersFixture();
    session.combat.value = { ...combatFixture(), attackCard: undefined };
    const wrapper = mountWindow();
    await nextTick();

    session.combat.value = null;
    session.lastCombat.value = {
      ...finishedRecord(),
      attackCard: {
        id: 'a1',
        instanceId: 'a1',
        title: 'Наотмашь',
        type: 'attack',
        value: 4,
        text: '',
      },
      defenseCard: {
        id: 'd1',
        instanceId: 'd1',
        title: 'Клёпка',
        type: 'defense',
        value: 2,
        text: '',
      },
    };
    await nextTick();

    const sides = wrapper.findAll('[data-battle-side]');
    expect(sides[0].find('[data-card]').attributes('data-card')).toBe('Клёпка');
    expect(sides[1].find('[data-card]').attributes('data-card')).toBe('Наотмашь');
    expect(wrapper.text()).not.toContain('Без защиты');
    expect(wrapper.text()).not.toContain('Карта закрыта');
  });

  it('скорость анимации из настроек задаёт паузы ленты', async () => {
    const { setAnimation, duration } = useSettings();
    setAnimation('fast');

    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    await finishBattle();

    // «быстро» — та же лента, но короче: паузы берём у настройки, а не у базовых чисел
    await passTime(duration('battleReveal'));
    await passTime(duration('battleStep'));
    expect(wrapper.findAll('[data-battle-step-status]')).toHaveLength(1);
    expect(duration('battleStep')).toBeLessThan(ANIMATION_DURATIONS.battleStep);

    // и до конца она доходит за поделённое время, а не за базовое
    await passTime(duration('battleStep'));
    await passTime(duration('battleDamage'));
    expect(wrapper.find('[data-battle-close]').exists()).toBe(true);
  });

  it('«Пропустить» доигрывает ленту сразу и оставляет итог', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    await finishBattle();
    await wrapper.find('[data-battle-skip]').trigger('click');

    expect(wrapper.findAll('[data-battle-step-status]')).toHaveLength(2);
    expect(wrapper.find('[data-battle-damage]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-close]').exists()).toBe(true);
  });

  it('пробел пропускает ленту, как клик по окну', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    await finishBattle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await nextTick();
    expect(wrapper.findAll('[data-battle-step-status]')).toHaveLength(2);
    expect(wrapper.find('[data-battle-close]').exists()).toBe(true);
  });

  it('битва без свойств и без урона показывает итог сразу: ленте ждать нечего', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    session.combat.value = null;
    session.lastCombat.value = {
      attackerPlayerId: 'p1',
      defenderPlayerId: 'p2',
      attackerFighterId: 'f1',
      targetFighterId: 'f2',
      attackValue: 2,
      defenseValue: 2,
      combatDamage: 0,
      effects: [],
    };
    await nextTick();

    expect(wrapper.find('[data-battle-window]').exists()).toBe(true);
    expect(wrapper.text()).toContain('2 − 2');
    expect(wrapper.find('[data-battle-close]').exists()).toBe(true);

    await wrapper.find('[data-battle-close]').trigger('click');
    expect(wrapper.find('[data-battle-window]').exists()).toBe(false);
  });

  it('итог убирает действие вне окна: клик мимо, а клик внутри — нет', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    await finishBattle();
    await passTime(ANIMATION_DURATIONS.battleReveal);
    await passTime(ANIMATION_DURATIONS.battleStep);
    await passTime(ANIMATION_DURATIONS.battleStep);
    await passTime(ANIMATION_DURATIONS.battleDamage);
    expect(wrapper.find('[data-battle-close]').exists()).toBe(true);

    await wrapper.find('header').trigger('pointerdown');
    expect(wrapper.find('[data-battle-window]').exists()).toBe(true);

    document.body.dispatchEvent(pointerEvent('pointerdown'));
    await nextTick();
    expect(wrapper.find('[data-battle-window]').exists()).toBe(false);
  });

  it('итог битвы видит только её участник: третьему игроку окно не показывают', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    await finishBattle();
    await passTime(ANIMATION_DURATIONS.battleReveal);
    await passTime(ANIMATION_DURATIONS.battleStep);
    await passTime(ANIMATION_DURATIONS.battleStep);
    await passTime(ANIMATION_DURATIONS.battleDamage);
    expect(wrapper.find('[data-battle-close]').exists()).toBe(true);

    // ход перешёл третьему игроку: чужой итог ему не показываем
    session.you.value = 'p3';
    await nextTick();
    expect(wrapper.find('[data-battle-window]').exists()).toBe(false);

    session.you.value = 'p1';
    await nextTick();
    expect(wrapper.find('[data-battle-close]').exists()).toBe(true);
  });

  it('закрытая битва сама не возвращается, а следующая битва открывает окно заново', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    await finishBattle();
    await wrapper.find('[data-battle-skip]').trigger('click');
    await wrapper.find('[data-battle-close]').trigger('click');
    expect(wrapper.find('[data-battle-window]').exists()).toBe(false);

    session.players.value = playersFixture();
    session.steps.value = 1;
    await nextTick();
    expect(wrapper.find('[data-battle-window]').exists()).toBe(false);

    openBattle();
    await nextTick();
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-close]').exists()).toBe(false);
  });
});

describe('окно битвы: окна выбора сворачивают его', () => {
  it('выбор цели сворачивает окно в карту-вопрос и разворачивает обратно', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);

    session.targeting.value = { kind: 'fighters', source: 'a1', playerId: 'p1', required: true };
    session.askingCard.value = session.combat.value.attackCard;
    await nextTick();

    expect(wrapper.find('[data-battle-body]').exists()).toBe(false);
    expect(wrapper.find('[data-battle-asking]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-asking]').text()).toContain('Наотмашь');

    session.targeting.value = null;
    session.askingCard.value = null;
    await nextTick();

    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);
  });

  it('чужое окно выбора окно битвы не сворачивает: оно сворачивается только на своём', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    // проекция отдаёт чужое окно всем (кто выбирает и чем) — сворачиваться на нём нельзя
    session.targeting.value = { kind: 'fighters', source: 'a1', playerId: 'p2', required: true };
    await nextTick();
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);
  });

  it('карту-вопрос можно развернуть в полное окно прямо посреди выбора', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    session.targeting.value = { kind: 'fighters', source: 'a1', playerId: 'p1', required: true };
    session.askingCard.value = session.combat.value.attackCard;
    await nextTick();
    expect(wrapper.find('[data-battle-body]').exists()).toBe(false);

    await wrapper.find('[data-battle-mini]').trigger('click');
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);

    await wrapper.find(`[aria-label="${TOOLTIPS.battle.minimize()}"]`).trigger('click');
    expect(wrapper.find('[data-battle-asking]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-body]').exists()).toBe(false);
  });

  it('свёрнутое вручную окно показывает миниатюру со стадией и числами и разворачивается кликом', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();

    await wrapper.find(`[aria-label="${TOOLTIPS.battle.minimize()}"]`).trigger('click');
    expect(wrapper.find('[data-battle-mini]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-body]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Битва');
    expect(wrapper.text()).toContain('защита');

    await wrapper.find('[data-battle-mini]').trigger('click');
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);
  });

  it('новая битва открывается развёрнутой: свёрнутую миниатюру игрок пропустит', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    await wrapper.find(`[aria-label="${TOOLTIPS.battle.minimize()}"]`).trigger('click');

    session.combat.value = null;
    await nextTick();
    openBattle();
    await nextTick();

    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);
  });
});

describe('окно битвы: режим поля', () => {
  const mountFocused = () =>
    mount(BattleWindow, {
      props: { focus: true },
      global: { stubs: { NuxtIcon: IconStub } },
    });

  it('включение режима поля сворачивает открытое окно', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);

    await wrapper.setProps({ focus: true });

    expect(wrapper.find('[data-battle-mini]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-body]').exists()).toBe(false);
  });

  it('битва, начавшаяся в режиме поля, приходит миниатюрой и разворачивается кликом', async () => {
    const wrapper = mountFocused();
    openBattle();
    await nextTick();

    expect(wrapper.find('[data-battle-mini]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-body]').exists()).toBe(false);

    await wrapper.find('[data-battle-mini]').trigger('click');
    expect(wrapper.find('[data-battle-body]').exists()).toBe(true);
  });

  it('итог битвы окно само не разворачивает: режим поля держит его свёрнутым', async () => {
    openBattle();
    const wrapper = mountFocused();
    await nextTick();
    await finishBattle();
    await passTime(ANIMATION_DURATIONS.battleReveal);
    await passTime(ANIMATION_DURATIONS.battleStep);
    await passTime(ANIMATION_DURATIONS.battleStep);
    await passTime(ANIMATION_DURATIONS.battleDamage);

    expect(wrapper.find('[data-battle-mini]').exists()).toBe(true);
    expect(wrapper.find('[data-battle-body]').exists()).toBe(false);
  });
});

describe('окно битвы: размер и место', () => {
  it('перетаскивание шапки переносит окно в координаты экрана', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    stubFrame(wrapper);

    await drag(
      wrapper.find('header').element,
      { clientX: 100, clientY: 80 },
      { clientX: 300, clientY: 200 },
    );

    expect(wrapper.find('section').classes()).toContain('fixed');
    expect(styleOf(wrapper)).toMatchObject({ left: 320, top: 210 });
  });

  it('кнопки шапки не тянут окно: сворачивание не переставляет его', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    stubFrame(wrapper);

    const button = wrapper.find(`[aria-label="${TOOLTIPS.battle.minimize()}"]`);
    button.element.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 80 }));

    expect(wrapper.find('section').classes()).not.toContain('fixed');
    expect(wrapper.find('section').attributes('style')).toBeUndefined();
  });

  it('растягивание за угол меняет размер окна', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    stubFrame(wrapper);

    await resize(wrapper, { clientX: 600, clientY: 400 }, { clientX: 700, clientY: 470 });

    expect(styleOf(wrapper)).toMatchObject({ left: 120, top: 90, width: 740, height: 570 });
  });

  it('ниже вменяемого минимума окно не сжимается', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    stubFrame(wrapper);

    await resize(wrapper, { clientX: 600, clientY: 400 }, { clientX: 0, clientY: 0 });

    expect(styleOf(wrapper)).toMatchObject({
      width: BATTLE_MIN_SIZE.width,
      height: BATTLE_MIN_SIZE.height,
    });
  });

  it('за край экрана окно не уезжает: предел — экран без запаса', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    stubFrame(wrapper);

    await resize(wrapper, { clientX: 600, clientY: 400 }, { clientX: 99999, clientY: 99999 });

    const { width, height } = styleOf(wrapper);
    expect(width).toBe(Math.max(BATTLE_MIN_SIZE.width, window.innerWidth - SCREEN_MARGIN * 2));
    expect(height).toBe(Math.max(BATTLE_MIN_SIZE.height, window.innerHeight - SCREEN_MARGIN * 2));
  });

  it('размер меняется и с клавиатуры: ручку берут Tab, растят стрелками', async () => {
    openBattle();
    const wrapper = mountWindow();
    await nextTick();
    stubFrame(wrapper);

    const handle = wrapper.find('[data-battle-resize]');
    expect(handle.attributes('tabindex')).toBe('0');
    await handle.trigger('keydown', { key: 'ArrowRight' });
    await handle.trigger('keydown', { key: 'ArrowDown' });

    expect(styleOf(wrapper)).toMatchObject({ width: 664, height: 524 });
  });
});
