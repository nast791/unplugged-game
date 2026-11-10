// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
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
 * Окно информации о герое (`HeroInfo`) — одна панель с переключателем разделов внутри: «Герой»,
 * «Помощники (живых из всех)», «Предметы». В режиме «о помощниках» рисуем круглый аватар выбранного
 * помощника и рядом его характеристики — теми же строками, что у героя («Здоровье», «Удар», «Шаг»).
 * Число живых помощников живёт в самой вкладке, а не отдельной строкой: панель одна, и заголовку
 * незачем повторять раздел.
 *
 * Аватар помощника — адрес вида `/api/content/heroes/{id}/images/{file}`: он отдаётся готовым файлом,
 * поэтому картинка идёт мимо ipx (`provider="none"`), иначе прокси-сжатие отдаёт 404.
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.watch = watch;
globalThis.nextTick = nextTick;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

vi.mock('~/components/atoms/APicture.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'APicture',
      props: {
        src: { type: String, default: '' },
        alt: { type: String, default: '' },
        provider: { type: String, default: '' },
      },
      setup(props) {
        return () =>
          h('div', {
            'data-picture': props.src,
            'data-provider': props.provider,
            'data-alt': props.alt,
          });
      },
    }),
  };
});

vi.mock('~/components/atoms/AScroll.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AScroll',
      setup(props, { slots }) {
        return () => h('div', { 'data-scroll': 'true' }, slots.default?.());
      },
    }),
  };
});

vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { Fragment, defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: { text: { type: String, default: '' }, disabled: { type: Boolean, default: false } },
      setup(props, { slots }) {
        return () => h(Fragment, null, [slots.default?.(), slots.content?.()]);
      },
    }),
  };
});

const { default: HeroInfo } = await import('../../../app/components/molecules/game/HeroInfo.vue');

const catalog = {
  fighters: [
    { id: 'dorothy', name: 'Дороти', move: 2, attackRange: 1 },
    { id: 'toto', name: 'Тото', move: 3, attackRange: 1 },
    { id: 'toto-2', name: 'Тото-двойник', move: 2, attackRange: 1 },
  ],
  items: [],
  skill: { title: 'Серебряные башмачки', text: 'Обмен с Тото' },
};

const player = {
  id: 'dorothy',
  name: 'Элисиф',
  fighters: [
    { id: 'toto', type: 'sidekick', name: 'Тото', currentHp: 3, startHp: 4, image: '/toto.webp' },
    {
      id: 'toto-2',
      type: 'sidekick',
      name: 'Тото-двойник',
      currentHp: 0,
      startHp: 2,
      image: '/toto-2.webp',
    },
  ],
  lost: [],
  items: [],
};

const hero = { id: 'dorothy', type: 'hero', name: 'Дороти', currentHp: 13, startHp: 13 };

const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('span', { 'data-icon-name': props.name });
  },
});

const mountInfo = (mode = 'fighters', extra = {}) =>
  mount(HeroInfo, {
    props: { mode, player, hero, catalog, color: '#059669', ...extra },
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

const rowsOf = wrapper =>
  wrapper
    .findAll('.flex.items-center.justify-between')
    .filter(row => row.findAll('span').length === 2)
    .map(row => row.findAll('span').map(span => span.text()));

describe('окно информации о герое', () => {
  it('держит число живых помощников во вкладке, а не строкой ниже', () => {
    const wrapper = mountInfo();

    expect(wrapper.text().toUpperCase()).toContain('ПОМОЩНИКИ (1/2)');
    expect(rowsOf(wrapper).some(([label]) => label === 'Помощников')).toBe(false);
  });

  it('держит имя героя в разделе «Герой», а не шапкой окна', () => {
    const heroTab = mountInfo('hero');
    const fightersTab = mountInfo('fighters');

    expect(heroTab.text()).toContain('Дороти');
    expect(fightersTab.text()).not.toContain('Дороти');
    expect(heroTab.text().indexOf('Дороти')).toBeGreaterThan(
      heroTab.text().toUpperCase().indexOf('ПРЕДМЕТЫ'),
    );
  });

  it('переключает разделы вкладками внутри панели и говорит, какой открыт', async () => {
    const wrapper = mountInfo('hero');
    const tabs = wrapper.findAll('[role="tab"]');

    expect(tabs.map(tab => tab.text())).toEqual(['Герой', 'Помощники (1/2)', 'Предметы']);
    expect(tabs.map(tab => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false']);

    await tabs[1].trigger('click');

    expect(wrapper.emitted('switch')).toEqual([['fighters']]);
  });

  it('гасит вкладку раздела, которого у героя нет', () => {
    const wrapper = mountInfo('hero');
    const tabs = wrapper.findAll('[role="tab"]');

    expect(tabs.map(tab => tab.attributes('disabled'))).toEqual([undefined, undefined, '']);
  });

  it('ставит полоску по границам открытой вкладки, а не третью ряда', async () => {
    const wrapper = mountInfo('hero');
    const geometry = [
      { left: 0, width: 118 },
      { left: 118, width: 156 },
      { left: 274, width: 66 },
    ];

    wrapper.findAll('[role="tab"]').forEach((tab, index) => {
      Object.defineProperty(tab.element, 'offsetLeft', { value: geometry[index].left });
      Object.defineProperty(tab.element, 'offsetWidth', { value: geometry[index].width });
    });

    await wrapper.setProps({ mode: 'fighters' });
    await nextTick();
    await nextTick();

    const bar = wrapper.find('[data-tab-indicator]');

    expect(wrapper.findAll('[data-tab-indicator]')).toHaveLength(1);
    expect(bar.attributes('style')).toContain('translateX(118px)');
    expect(bar.attributes('style')).toContain('width: 156px');
    expect(bar.classes()).toContain('transition-[transform,opacity]');
    expect(bar.classes()).not.toContain('transition-[width,transform,opacity]');
  });

  it('рисует круглый аватар помощника мимо ipx-прокси', () => {
    const wrapper = mountInfo();
    const picture = wrapper.find('[data-picture]');
    const frame = wrapper.find('.rounded-full');

    expect(picture.attributes('data-picture')).toBe('/toto.webp');
    expect(picture.attributes('data-provider')).toBe('none');
    expect(frame.exists()).toBe(true);
    expect(frame.classes()).toContain('size-96');
    expect(frame.classes().join(' ')).toContain('border-[var(--sidekick-color)]');
    expect(frame.attributes('style')).toContain('#059669');
  });

  it('расписывает характеристики помощника теми же строками, что у героя', () => {
    const rows = rowsOf(mountInfo());

    expect(rows).toEqual(
      expect.arrayContaining([
        ['Здоровье', '3/4'],
        ['Удар', '1'],
        ['Шаг', '3'],
      ]),
    );
  });

  it('берёт следующего помощника стрелкой и гасит поверженного', async () => {
    const wrapper = mountInfo();

    expect(wrapper.find('[data-picture]').attributes('data-picture')).toBe('/toto.webp');

    await wrapper.find('[aria-label="Следующий помощник"]').trigger('click');

    expect(wrapper.find('[data-picture]').attributes('data-picture')).toBe('/toto-2.webp');
    expect(wrapper.find('[data-picture]').classes()).toContain('grayscale');
    expect(rowsOf(wrapper)).toEqual(
      expect.arrayContaining([
        ['Здоровье', '0/2'],
        ['Удар', '1'],
        ['Шаг', '2'],
      ]),
    );
  });

  it('показывает характеристики самого героя и его умение', () => {
    const wrapper = mountInfo('hero');
    const rows = rowsOf(wrapper);

    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Герой');
    expect(rows).toEqual(
      expect.arrayContaining([
        ['Здоровье', '13/13'],
        ['Удар', '1'],
        ['Шаг', '2'],
      ]),
    );
    expect(wrapper.text()).toContain('Серебряные башмачки');
  });

  it('пишет состояние предмета словами движка: «активна» и «не активна»', () => {
    const items = [
      {
        id: 'shroud',
        name: 'Пелена',
        state: 'active',
        states: { active: 'цела', inactive: 'отсутствует' },
      },
      { id: 'coil', name: 'Катушка', state: 'inactive' },
    ];
    const wrapper = mountInfo('items', { player: { ...player, items } });
    const labels = wrapper.findAll('[data-item-state]').map(span => span.text());

    expect(wrapper.text()).toContain('Пелена');
    expect(labels).toEqual(['активна', 'не активна']);
  });

  it('пишет шаг и удар с бонусом через дробь, когда бонус есть', () => {
    const wrapper = mountInfo('hero', { moveBonus: 3, attackBonus: 1 });
    const rows = rowsOf(wrapper);

    expect(rows).toEqual(
      expect.arrayContaining([
        ['Удар', '2/1'],
        ['Шаг', '5/2'],
      ]),
    );
  });
});
