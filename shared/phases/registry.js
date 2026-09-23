import attack from './attack.js';
import choose from './choose.js';
import defense from './defense.js';
import finished from './finished.js';
import handLimit from './handLimit.js';
import movement from './movement.js';
import pickNumHero from './pickNumHero.js';
import place from './place.js';
import waiting from './waiting.js';

/** Зарегистрированные phases по имени (exit lookup). Порядок — в hook.phases. */
export const phases = {
  [pickNumHero.name]: pickNumHero,
  [place.name]: place,
  [handLimit.name]: handLimit,
  [choose.name]: choose,
  [movement.name]: movement,
  [attack.name]: attack,
  [defense.name]: defense,
  [waiting.name]: waiting,
  [finished.name]: finished,
};
