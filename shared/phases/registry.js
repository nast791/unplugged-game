import pickNumHero from './pickNumHero.js';
import place from './place.js';

/** Зарегистрированные phases по имени (exit lookup). Порядок — в hook.phases. */
export const phases = {
  [pickNumHero.name]: pickNumHero,
  [place.name]: place,
};
