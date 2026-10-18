export const CARD_TYPES = {
  attack: { label: 'Атака', icon: 'lucide:swords', plate: 'bg-danger' },
  defense: { label: 'Защита', icon: 'lucide:shield', plate: 'bg-info' },
  hybrid: { label: 'Гибрид', icon: 'lucide:shuffle', plate: 'bg-violet' },
  effect: { label: 'Эффект', icon: 'game-icons:magic-palm', plate: 'bg-accent' },
};

export const CARD_TYPE_ORDER = ['attack', 'defense', 'hybrid', 'effect'];

export const CARD_MOMENT_PREFIXES = [
  { moment: 'immediately', keys: ['МГНОВЕННО'] },
  { moment: 'duringCombat', keys: ['ВО ВРЕМЯ БИТВЫ'] },
  { moment: 'afterCombat', keys: ['ПОСЛЕ БИТВЫ'] },
  { moment: 'turnStart', keys: ['НАЧАЛО ХОДА'] },
  { moment: 'turnEnd', keys: ['КОНЕЦ ХОДА'] },
];

export const cardType = type =>
  CARD_TYPES[String(type)] ?? {
    label: String(type ?? ''),
    icon: 'lucide:circle-help',
    plate: 'bg-surface-2',
  };

export default CARD_TYPES;
