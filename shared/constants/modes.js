import { rules } from './rules.js';

/** Пресеты: format (правила стола) + seating (локально / онлайн). */
export const modes = [
  {
    /**
     * «Одиночный режим» (был «Общий стол») — режим локального стола в лобби (`docs/ui-plan.md` §3):
     * 2–4 места, каждое человек или компьютер, каждый сам за себя, а за одним экраном места ведёт один
     * человек. `hotseat` и `vs_ai` остались как крайние случаи того же стола (все люди / ровно один
     * человек) — ими пользуются прогоны и старые закладки.
     */
    name: 'table',
    title: 'Одиночный режим',
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
