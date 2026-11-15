// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, mergeProps, ref } from 'vue';

/**
 * Сторона в окне битвы: роль читается по обводке аватара — у атакующего она красная, у защитника
 * голубая, а имя бойца остаётся белым (цвет имени владелец отменил). Атомы и `Card` подменяются.
 */
globalThis.computed = computed;
globalThis.ref = ref;

vi.mock('~/components/atoms/AAvatar.vue', () => ({
  default: defineComponent({
    name: 'AAvatar',
    props: { ui: { type: Object, default: () => ({}) }, src: { type: String, default: '' } },
    setup:
      (props, { attrs }) =>
      () =>
        h('i', mergeProps(attrs, { 'data-avatar': JSON.stringify(props.ui) })),
  }),
}));

vi.mock('~/components/atoms/APicture.vue', () => ({
  default: defineComponent({
    name: 'APicture',
    setup: () => () => h('i', { 'data-picture': '' }),
  }),
}));

vi.mock('~/components/molecules/game/Card.vue', () => ({
  default: defineComponent({
    name: 'Card',
    props: { card: { type: Object, default: null } },
    setup: () => () => h('i', { 'data-side-card': '' }),
  }),
}));

const { default: BattleSide } =
  await import('../../../app/components/molecules/game/BattleSide.vue');

const side = overrides => ({
  side: 'attacker',
  fighterName: 'Ифрит',
  playerName: 'Элисиф',
  hpLabel: '9/14',
  hpColor: '#349948',
  card: null,
  cardState: 'hidden',
  ...overrides,
});

const mountSide = overrides =>
  mount(BattleSide, {
    props: { side: side(overrides) },
  });

const avatarUi = wrapper => JSON.parse(wrapper.find('[data-avatar]').attributes('data-avatar'));

describe('BattleSide: обводка аватара по роли', () => {
  it('атакующий — красная обводка, имя белое', () => {
    const wrapper = mountSide({ side: 'attacker' });

    expect(avatarUi(wrapper).avatar_root).toContain('border-danger');
    expect(wrapper.find('span').classes()).not.toContain('text-danger');
    expect(wrapper.find('span').classes()).not.toContain('text-info');
  });

  it('защитник — голубая обводка, имя тоже белое', () => {
    const wrapper = mountSide({ side: 'defender', fighterName: 'Дороти' });

    expect(avatarUi(wrapper).avatar_root).toContain('border-info');
    expect(avatarUi(wrapper).avatar_root).not.toContain('border-danger');
    expect(wrapper.find('span').classes()).not.toContain('text-info');
  });

  it('погибший боец остаётся серым, обводка роли не пропадает', () => {
    const wrapper = mountSide({ side: 'defender', dead: true, deadLabel: 'погиб' });

    expect(avatarUi(wrapper).avatar_image).toContain('grayscale');
    expect(avatarUi(wrapper).avatar_root).toContain('border-info');
  });
});
