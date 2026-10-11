const TYPES = {
  attack: { label: 'Атака', icon: 'lucide:swords', plate: 'bg-danger' },
  defense: { label: 'Защита', icon: 'lucide:shield', plate: 'bg-info' },
  hybrid: { label: 'Гибрид', icon: 'lucide:shuffle', plate: 'bg-violet' },
  effect: { label: 'Эффект', icon: 'game-icons:magic-palm', plate: 'bg-accent' },
};

export const CARD_TYPE_ORDER = ['attack', 'defense', 'hybrid', 'effect'];

export const cardType = type =>
  TYPES[String(type)] ?? {
    label: String(type ?? ''),
    icon: 'lucide:circle-help',
    plate: 'bg-surface-2',
  };

export default cardType;
