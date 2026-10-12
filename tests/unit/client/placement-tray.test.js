// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';

/**
 * Полка расстановки: над кнопкой «Завершить» стоят аватарки тех, кого **мне** ещё надо поставить.
 * Ждущий боец — голубое кольцо (`border-info`) и мигающая подсветка (`placement-blink`), у выбранной
 * аватарки — коралловое (акцент); клик выбирает бойца, захват мышью — выбирает и тащит его на клетку
 * (клетку под курсором считает доска).
 *
 * `PlacementTray.vue` — SFC приложения: `computed`/`cn` приходят автоимпортами Nuxt, в тесте кладём
 * `computed` в `globalThis` до импорта компонента (так же, как `player-card.test.js`).
 */
globalThis.computed = computed;

vi.mock('~/composables/ui/useUI', async importOriginal => {
  const { computed, toValue } = await import('vue');
  const actual = await importOriginal();
  const avatar = (await import('../../../app/ui/avatar.js')).default;

  return {
    ...actual,
    useUI: (key, localUi) => ({
      styles: computed(() => actual.resolveUiStyles(avatar, toValue(localUi))),
    }),
  };
});

// Состояние партии полка читает из сессии: в тесте она своя, с двумя непоставленными бойцами.
vi.mock('~/composables/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = {
    placementFighters: ref([]),
    selectedFighterId: ref(null),
    selectFighter: id => {
      session.selectedFighterId.value = String(id);
    },
  };
  return { useGameSession: () => session, session };
});

const { session } = await import('~/composables/useGameSession.js');
const { default: PlacementTray } =
  await import('../../../app/components/molecules/game/PlacementTray.vue');

const fighter = (id, name) => ({ id, name, type: 'assistant', currentHp: 1, startHp: 1 });

const setFighters = fighters => {
  session.placementFighters.value = fighters;
  session.selectedFighterId.value = null;
};

beforeEach(() => setFighters([fighter('amat', 'Амат'), fighter('harpies_1', 'Гарпия')]));

const mountTray = () => mount(PlacementTray);

/** Аватарки полки — единственные перетаскиваемые узлы: по этому признаку их и находим. */
const avatars = wrapper => wrapper.findAll('[draggable="true"]');

/** Событие захвата с поддельным `dataTransfer`: happy-dom своего не даёт. */
const dragStart = (element, dataTransfer) => {
  const event = new Event('dragstart', { bubbles: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  element.dispatchEvent(event);
};

describe('PlacementTray: кого ещё ставить', () => {
  it('без непоставленных бойцов полки нет', () => {
    setFighters([]);
    expect(mountTray().findAll('[draggable="true"]')).toHaveLength(0);
  });

  it('рисует аватарку на каждого бойца столбиком, с голубой мигающей обводкой', () => {
    const wrapper = mountTray();

    expect(avatars(wrapper)).toHaveLength(2);
    expect(wrapper.element.className).toContain('flex-col');
    // ждущий расстановки — голубое кольцо и мигающая подсветка (решение владельца)
    expect(avatars(wrapper)[0].classes().join(' ')).toContain('border-info');
    expect(avatars(wrapper)[0].classes().join(' ')).toContain('placement-blink');
    expect(avatars(wrapper)[0].classes().join(' ')).not.toContain('border-primary');
    expect(avatars(wrapper)[0].classes().join(' ')).not.toContain('border-accent');
    expect(avatars(wrapper)[0].attributes('title')).toContain('Амат');
  });

  it('аватарки полки крупные — их видно без наведения', () => {
    const wrapper = mountTray();

    expect(avatars(wrapper)[0].classes().join(' ')).toContain('size-68');
  });

  it('клик по аватарке делает её активной: кольцо становится коралловым', async () => {
    const wrapper = mountTray();

    await avatars(wrapper)[1].trigger('click');

    expect(session.selectedFighterId.value).toBe('harpies_1');
    expect(avatars(wrapper)[1].classes().join(' ')).toContain('border-accent');
    expect(avatars(wrapper)[0].classes().join(' ')).toContain('border-info');
  });

  it('снятая активность возвращает голубое кольцо', async () => {
    const wrapper = mountTray();
    await avatars(wrapper)[0].trigger('click');
    expect(avatars(wrapper)[0].classes().join(' ')).toContain('border-accent');

    session.selectedFighterId.value = null;
    await wrapper.vm.$nextTick();

    expect(avatars(wrapper)[0].classes().join(' ')).toContain('border-info');
  });
});

describe('PlacementTray: перетаскивание', () => {
  it('захват аватарки выбирает бойца и кладёт его id в буфер обмена перетаскивания', async () => {
    const wrapper = mountTray();
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: '' };

    dragStart(avatars(wrapper)[0].element, dataTransfer);

    expect(session.selectedFighterId.value).toBe('amat');
    expect(setData).toHaveBeenCalledWith('text/plain', 'amat');
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('без dataTransfer захват не падает: боец всё равно становится активным', async () => {
    const wrapper = mountTray();

    expect(() => dragStart(avatars(wrapper)[1].element, undefined)).not.toThrow();
    expect(session.selectedFighterId.value).toBe('harpies_1');
  });
});
