// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { computed } from 'vue';

/**
 * Помилование и Наказание у Анубиса — опции свойства, а не выбор игрока: их строки начинаются с новой
 * строки и выделены подписью, но нажать их нельзя. Поэтому `CardText.vue` рисует их текстом с ярлыком,
 * а не `CardOptions` (у того — кнопки и отметки выбора).
 */
globalThis.computed = computed;

const { default: CardText } = await import('../../../app/components/molecules/game/CardText.vue');

const scalesText =
  'ПОСЛЕ БИТВЫ: Если вы победили, оппонент сбрасывает 1 случайную карту. ' +
  'Помилование. ПОСЛЕ БИТВЫ: Восстановите Амат 2 здоровья. ' +
  'Наказание. ВО ВРЕМЯ БИТВЫ: Значение этой карты +2.';

const mountText = (props = {}) => mount(CardText, { props: { text: scalesText, ...props } });

const optionLines = wrapper => wrapper.findAll('[data-option]');

describe('CardText: опции свойства', () => {
  it('Помилование и Наказание стоят каждая своей строкой с ярлыком', () => {
    const lines = optionLines(mountText());

    expect(lines.map(line => line.attributes('data-option'))).toEqual(['Помилование', 'Наказание']);
    expect(lines[0].text()).toContain('Помилование');
    expect(lines[0].text()).toContain('Восстановите Амат 2 здоровья');
    expect(lines[1].text()).toContain('Наказание');
    expect(lines[1].text()).toContain('Значение этой карты +2');
  });

  it('между ярлыком опции и текстом свойства есть отступ', () => {
    const label = mountText().find('[data-option] span');

    expect(label.classes()).toContain('mb-4');
  });

  it('строки опций без плашки и вертикальной полосы', () => {
    for (const line of optionLines(mountText())) {
      expect(line.classes()).toContain('mt-4');
      expect(line.classes()).not.toContain('border-l-2');
      expect(line.classes().some(name => name.startsWith('bg-'))).toBe(false);
    }
  });

  it('строки опций не кнопки: выбрать их нельзя', () => {
    const wrapper = mountText();

    expect(wrapper.findAll('button')).toHaveLength(0);
    for (const line of optionLines(wrapper))
      expect(line.element.querySelector('button')).toBeNull();
  });

  it('карта без опций — ровно один блок текста без ярлыков', () => {
    const wrapper = mountText({ text: 'МГНОВЕННО: сбросьте 1 случайную карту.' });

    expect(optionLines(wrapper)).toHaveLength(0);
    expect(wrapper.text()).toContain('МГНОВЕННО: сбросьте 1 случайную карту.');
  });

  it('играющая сейчас опция подсвечивается своим моментом', () => {
    const wrapper = mountText({ highlight: ['duringCombat'] });
    const [mild, punish] = optionLines(wrapper);

    expect(punish.classes()).toContain('text-accent');
    expect(mild.classes()).not.toContain('text-accent');
  });
});
