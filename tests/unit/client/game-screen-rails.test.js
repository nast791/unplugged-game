// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue';

/**
 * Свёрнутый вид партии («скрыть героев и руку») гасит полку героев и руку всегда, а полку расстановки
 * не гасит никогда: она живёт только в расстановке, и без неё бойцов некуда взять (правка владельца,
 * m01696 — полка помощников справа при свёрнутом виде остаётся).
 *
 * `GameScreen.vue` — SFC приложения: `computed`/`watch`/`onBeforeUnmount` приходят автоимпортами Nuxt,
 * все панели и доска подменяются заглушками (важен только `v-if`), а состояние партии отдаёт мок
 * `useGameSession`.
 */
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.onBeforeUnmount = onBeforeUnmount;

const panel = name => defineComponent({ setup: () => () => h('i', { 'data-panel': name }) });

vi.mock('~/svg/brand/logo.svg', () => ({ default: panel('logo') }));
vi.mock('~/components/molecules/game/PlacementTray.vue', () => ({ default: panel('placement') }));
vi.mock('~/components/molecules/game/DeckWindow.vue', () => ({ default: panel('deck') }));
vi.mock('~/components/molecules/game/DiscardWindow.vue', () => ({ default: panel('discard') }));
vi.mock('~/components/molecules/game/HandWindow.vue', () => ({ default: panel('hand-window') }));
vi.mock('~/components/organisms/game/Board.vue', () => ({ default: panel('board') }));
vi.mock('~/components/organisms/game/BattleWindow.vue', () => ({ default: panel('battle') }));
vi.mock('~/components/organisms/game/CardDragLayer.vue', () => ({ default: panel('drag') }));
vi.mock('~/components/organisms/game/CardFlights.vue', () => ({ default: panel('flights') }));
vi.mock('~/components/organisms/game/ChoicePanel.vue', () => ({ default: panel('choice') }));
vi.mock('~/components/organisms/game/HintsWindow.vue', () => ({ default: panel('hints') }));
vi.mock('~/components/organisms/game/GameMenu.vue', () => ({ default: panel('menu') }));
vi.mock('~/components/organisms/game/HandFan.vue', () => ({ default: panel('hand-fan') }));
vi.mock('~/components/organisms/game/HeroRail.vue', () => ({ default: panel('hero-rail') }));
vi.mock('~/components/organisms/game/TopRail.vue', () => ({ default: panel('top-rail') }));
vi.mock('~/components/organisms/modals/ConfirmModal.vue', () => ({ default: panel('confirm') }));
vi.mock('~/components/organisms/modals/HeroDetailsModal.vue', () => ({
  default: panel('details'),
}));
vi.mock('~/components/organisms/modals/ProfileModal.vue', () => ({ default: panel('profile') }));
vi.mock('~/components/organisms/modals/SettingsModal.vue', () => ({ default: panel('settings') }));

const placement = ref(false);

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { ref: makeRef } = await import('vue');
  return {
    useGameSession: () => ({
      isPlacement: placement,
      myHeroes: makeRef([]),
      revealedCards: makeRef([]),
      showPickNumHero: makeRef(false),
      selectedNumHeroId: makeRef(null),
      onPickNumHero: () => {},
      onFighterClick: () => {},
      onCellClick: () => {},
    }),
  };
});

const { default: GameScreen } =
  await import('../../../app/components/organisms/game/GameScreen.vue');

const shown = (wrapper, name) => wrapper.find(`[data-panel="${name}"]`).exists();

const NuxtLinkStub = defineComponent({
  name: 'NuxtLink',
  setup:
    (_, { slots }) =>
    () =>
      h('a', slots.default?.()),
});

const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup: props => () => h('i', { 'data-icon': props.name }),
});

const mountScreen = async ({ compact = false, inPlacement = false } = {}) => {
  placement.value = inPlacement;
  const wrapper = mount(GameScreen, {
    props: { compact },
    global: { stubs: { NuxtLink: NuxtLinkStub, Icon: IconStub, NuxtIcon: IconStub } },
  });
  await nextTick();
  return wrapper;
};

describe('свёрнутый вид партии и полки', () => {
  it('в бою кнопка «скрыть героев и руку» убирает и полку героев, и руку', async () => {
    const wrapper = await mountScreen({ compact: true });

    expect(shown(wrapper, 'hero-rail')).toBe(false);
    expect(shown(wrapper, 'hand-fan')).toBe(false);
    expect(shown(wrapper, 'placement')).toBe(false);
  });

  it('в расстановке свёрнутый вид прячет гексы героев и руку, а полку помощников оставляет', async () => {
    const wrapper = await mountScreen({ compact: true, inPlacement: true });

    expect(shown(wrapper, 'hero-rail')).toBe(false);
    expect(shown(wrapper, 'hand-fan')).toBe(false);
    expect(shown(wrapper, 'placement')).toBe(true);
  });

  it('полный вид показывает полки и полку расстановки в расстановке', async () => {
    const wrapper = await mountScreen({ compact: false, inPlacement: true });

    expect(shown(wrapper, 'hero-rail')).toBe(true);
    expect(shown(wrapper, 'hand-fan')).toBe(true);
    expect(shown(wrapper, 'placement')).toBe(true);
  });

  it('полки расстановки нет после неё, даже в полном виде', async () => {
    const wrapper = await mountScreen({ compact: false, inPlacement: false });

    expect(shown(wrapper, 'hero-rail')).toBe(true);
    expect(shown(wrapper, 'placement')).toBe(false);
  });
});
