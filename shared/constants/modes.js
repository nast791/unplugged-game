import { rules } from './rules.js';

/** Пресеты: format (правила стола) + seating (локально / онлайн). */
export const modes = [
  {
    name: 'vs_ai',
    title: 'Против компьютера',
    format: 'ffa',
    seating: 'local',
    default: true,
    minHumans: 1,
    maxHumans: 1,
    minPlayers: rules.minPlayers,
    maxPlayers: rules.maxPlayers,
  },
  {
    name: 'hotseat',
    title: 'Hotseat',
    format: 'ffa',
    seating: 'local',
    minHumans: rules.minPlayers,
    maxHumans: rules.maxPlayers,
    minPlayers: rules.minPlayers,
    maxPlayers: rules.maxPlayers,
  },
  {
    name: 'teams',
    title: '2 на 2',
    format: 'teams_2v2',
    seating: 'local',
    minHumans: rules.minPlayers,
    maxHumans: rules.maxPlayers,
    minPlayers: 4,
    maxPlayers: rules.maxPlayers,
  },
];
