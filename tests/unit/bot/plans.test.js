import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAN_HEROES, PLANS, planOf, readyPlans } from '../../../bot/play/plans.js';
import { heroIds } from '../../../bot/play/pool.js';

/**
 * Планы бота по героям (`bot/play/plans.js`) — единственное место, где записано, как герой должен играть.
 * Человеческое описание живёт в паспорте героя. Сторож держит договор: у каждого героя пула план есть (иначе
 * новый герой тихо останется без стратегии), а у расписанного плана — раздел «Стратегия бота» в паспорте.
 *
 * Сверять числа плана с паком здесь не нужно: истина о порогах и метках — в контенте, и её уже читает
 * `bot/play/resources.js` из правил карт. План ссылается на смысл, а не дублирует цифры.
 */
const passport = heroId =>
  readFileSync(
    new URL(`../../../server/content/heroes/${heroId}/passport.md`, import.meta.url),
    'utf8',
  );

describe('планы героев: реестр', () => {
  it('у каждого героя пула есть запись, чужих записей нет', () => {
    expect([...PLAN_HEROES].sort()).toEqual([...heroIds].sort());
  });

  it('у записи есть id и состояние из двух известных', () => {
    for (const id of PLAN_HEROES) {
      expect(PLANS[id].id, id).toBe(id);
      expect(['ready', 'draft'], id).toContain(PLANS[id].state);
    }
  });

  it('план берётся по id героя, неизвестный герой — `null`', () => {
    expect(planOf('snow-queen')).toBe(PLANS['snow-queen']);
    expect(planOf('нет-такого')).toBeNull();
    expect(planOf(null)).toBeNull();
  });
});

describe('планы героев: расписанный план', () => {
  it('у расписанного плана есть раздел «Стратегия бота» в паспорте героя', () => {
    for (const id of readyPlans()) {
      expect(passport(id), id).toMatch(/^### Стратегия бота$/m);
    }
  });

  it('расписанный план: фазы, приоритеты и границы есть, поля заполнены', () => {
    for (const id of readyPlans()) {
      const plan = PLANS[id];

      expect(plan.style.length, id).toBeGreaterThan(0);
      expect(plan.phases.length, id).toBeGreaterThan(0);
      expect(plan.priorities.length, id).toBeGreaterThan(0);
      expect(plan.avoid.length, id).toBeGreaterThan(0);

      for (const phase of plan.phases) {
        expect(phase.id.length, `${id}.${phase.id}`).toBeGreaterThan(0);
        expect(phase.title.length, `${id}.${phase.id}`).toBeGreaterThan(0);
        expect(phase.goal.length, `${id}.${phase.id}`).toBeGreaterThan(0);
      }
      for (const priority of plan.priorities) {
        expect(priority.id.length, `${id}.${priority.id}`).toBeGreaterThan(0);
        expect(priority.title.length, `${id}.${priority.id}`).toBeGreaterThan(0);
        expect(priority.when.length, `${id}.${priority.id}`).toBeGreaterThan(0);
        expect(priority.bot.length, `${id}.${priority.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('у Снежной королевы порядок как в паспорте: кайт первым, «Стужа»/«Резонанс» последней', () => {
    const plan = PLANS['snow-queen'];

    expect(plan.priorities[0].id).toBe('kite');
    expect(plan.priorities.at(-1).id).toBe('stun-resonance');
    expect(plan.priorities).toHaveLength(10);
    // фазы названы по счётчику осколков: выжить → контр-игра → удушение
    expect(plan.phases.map(phase => phase.id)).toEqual(['survive', 'counter', 'choke']);
    expect(plan.thresholds).toEqual([3, 4, 5, 6]);
  });

  it('стратегии разделены на стойки и приёмы: 4 стойки, 6 приёмов', () => {
    const plan = PLANS['snow-queen'];
    const stances = plan.priorities.filter(entry => entry.kind === 'stance');
    const techniques = plan.priorities.filter(entry => entry.kind === 'technique');

    expect(stances.map(entry => entry.id)).toEqual([
      'kite',
      'hand-choke',
      'shard-rush',
      'ice-positioning',
    ]);
    expect(techniques).toHaveLength(6);
    // тип есть у каждой стратегии: иначе список в паспорте и в коде разойдётся
    expect(plan.priorities.every(entry => ['stance', 'technique'].includes(entry.kind))).toBe(true);
  });

  it('у Дороти порядок как в паспорте: обмен первым, «Золотая шапка» последней', () => {
    const plan = PLANS['dorothy'];

    expect(plan.priorities[0].id).toBe('swap-escape');
    expect(plan.priorities.at(-1).id).toBe('golden-cap');
    expect(plan.priorities).toHaveLength(10);
    // фазы названы по здоровью Тото: пара → щит → одна
    expect(plan.phases.map(phase => phase.id)).toEqual(['pair', 'shield', 'alone']);
    // ресурса-счётчика у героини нет
    expect(plan.thresholds).toEqual([]);
  });

  it('Дороти: 3 стойки и 7 приёмов', () => {
    const plan = PLANS['dorothy'];
    const stances = plan.priorities.filter(entry => entry.kind === 'stance');

    expect(stances.map(entry => entry.id)).toEqual(['swap-escape', 'toto-bait', 'pair-guard']);
    expect(plan.priorities.filter(entry => entry.kind === 'technique')).toHaveLength(7);
  });

  it('у Ифрита порядок как в паспорте: последний дух первым, раннее давление последним', () => {
    const plan = PLANS['ifrit'];

    expect(plan.priorities[0].id).toBe('last-spirit');
    expect(plan.priorities.at(-1).id).toBe('early-swarm');
    expect(plan.priorities).toHaveLength(10);
    // фазы названы по числу духов: три → на исходе → нет
    expect(plan.phases.map(phase => phase.id)).toEqual(['three', 'thinning', 'empty']);
    expect(plan.thresholds).toEqual([1, 2, 3]);
  });

  it('Ифрит: 2 стойки и 8 приёмов', () => {
    const plan = PLANS['ifrit'];
    const stances = plan.priorities.filter(entry => entry.kind === 'stance');

    expect(stances.map(entry => entry.id)).toEqual(['last-spirit', 'lava-defense']);
    expect(plan.priorities.filter(entry => entry.kind === 'technique')).toHaveLength(8);
  });

  it('незаписанный герой честно помечен `draft`, а не пустым планом', () => {
    for (const id of PLAN_HEROES) {
      if (PLANS[id].state !== 'draft') continue;
      expect(PLANS[id].priorities, id).toBeUndefined();
    }
  });
});
