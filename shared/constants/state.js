/** Кто видит поле: roles.visibility — 'self' | 'team' | 'enemy'. */

export const stateFields = {
  id: ['self', 'team', 'enemy'],
  hook: ['self', 'team', 'enemy'],
  round: ['self', 'team', 'enemy'],
  winner: ['self', 'team', 'enemy'],
  turn: ['self', 'team', 'enemy'],
  map: ['self', 'team', 'enemy'],
  settings: ['self', 'team', 'enemy'],
  combat: ['self', 'team', 'enemy'],
  log: ['self', 'team', 'enemy'],
};

export const playerFields = {
  id: ['self', 'team', 'enemy'],
  heroId: ['self', 'team', 'enemy'],
  order: ['self', 'team', 'enemy'],
  control: ['self', 'team', 'enemy'],
  name: ['self', 'team', 'enemy'],
  team: ['self', 'team', 'enemy'],
  color: ['self', 'team', 'enemy'],
  skill: ['self', 'team', 'enemy'],
  items: ['self', 'team', 'enemy'],
  fighters: ['self', 'team', 'enemy'],
  deck: [],
  hand: ['self', 'team'],
  discard: ['self', 'team', 'enemy'],
};
