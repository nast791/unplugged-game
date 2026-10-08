import { describe, expect, it } from 'vitest';
import { createGame } from '../../../server/create.js';
import ifrit from '../../../server/content/heroes/ifrit/index.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { zoneCards } from '#shared/helpers/base.js';

/**
 * Партия с Ифритом собирается из контента: 30 карт в колоде, 15 в руке и колоде на старте,
 * четыре бойца (герой и три духа) и умение на месте. Проверяется и то, что духи получили
 * группу `ash` — по ней работают умение и две карты колоды.
 */
const body = {
  mapId: 'generated',
  mode: 'vs_ai',
  heroes: [
    { heroId: 'ifrit', team: 'A', order: 1, control: 'human' },
    { heroId: 'dorothy', team: 'B', order: 2, control: 'ai' },
  ],
};

const total = cards => cards.reduce((sum, card) => sum + (card.quantity ?? 1), 0);

describe('партия с Ифритом', () => {
  it('колода героя сходится в 30 карт и 13 уникальных', () => {
    expect(ifritCards).toHaveLength(13);
    expect(total(ifritCards)).toBe(30);
    // карта без свойств ровно одна — «Столб огня»
    expect(ifritCards.filter(card => (card.rules ?? []).length === 0).map(card => card.id)).toEqual(
      ['ifrit_01'],
    );
  });

  it('пак героя: 14 hp, дальность 3, три духа с группой ash', () => {
    expect(ifrit.heroes[0]).toMatchObject({ id: 'ifrit', hp: 14, move: 2, attackRange: 3 });
    expect(ifrit.assistants[0]).toMatchObject({ id: 'ash', count: 3, hp: 1, move: 3 });
  });

  it('createGame собирает партию: 30 карт в колоде, четыре бойца, умение на месте', () => {
    const state = createGame(body, { testId: 'ifrit_game', testSeed: 7 });
    // id игрока в партии — id героя (так же устроены партии Медузы и Теслы)
    const me = state.players.find(player => String(player.id) === 'ifrit');

    expect(zoneCards(me.deck).length + zoneCards(me.hand).length).toBe(30);
    expect(zoneCards(me.deck).length).toBe(30 - 5);
    expect(me.skill?.id).toBe('ifrit_skill');
    expect(me.fighters.map(fighter => fighter.id)).toEqual(['ifrit', 'ash_1', 'ash_2', 'ash_3']);
    expect(me.fighters.filter(fighter => fighter.group === 'ash')).toHaveLength(3);
    expect(me.fighters.find(fighter => fighter.id === 'ifrit')).toMatchObject({
      currentHp: 14,
      startHp: 14,
      attackRange: 3,
    });
  });
});
