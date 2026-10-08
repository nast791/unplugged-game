import { rules } from './rules.js';

/** Пресеты: format (правила стола) + seating (локально / онлайн). */
export const modes = [
  {
    /**
     * «Общий стол» — единственный режим локального стола в лобби (`docs/ui-plan.md` §3): 2–4 места, каждое
     * человек или компьютер, каждый сам за себя. `hotseat` и `vs_ai` остались как крайние случаи того же
     * стола (все люди / ровно один человек) — ими пользуются прогоны и старые закладки.
     */
    name: 'table',
    title: 'Общий стол',
    format: 'ffa',
    seating: 'local',
    minHumans: 1,
    maxHumans: rules.maxPlayers,
    minPlayers: rules.minPlayers,
    maxPlayers: rules.maxPlayers,
  },
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
