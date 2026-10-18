// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue';

/**
 * Геометрия доски — композабл `useBoardMap`: он превращает карту и бойцов в то, что рисует конва
 * (клетки с секторами и текстурами, связи, фишки, маркеры расстановки), и отдаёт доске проверки
 * «что под курсором». Сама математика — `app/composables/ui/useBoardGeometry.js` со своими тестами.
 *
 * Композабл зовётся в `setup` (внутри есть `onMounted` для плиток), поэтому пробу монтируем.
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.onMounted = onMounted;

const { useBoardMap } = await import('~/composables/ui/useBoardMap.js');
const { nodeRadius } = await import('~/composables/ui/useBoardGeometry.js');

const Probe = defineComponent({
  props: {
    map: { type: Object, default: null },
    players: { type: Array, default: () => [] },
    viewerId: { type: [String, Number], default: null },
    phase: { type: String, default: null },
    selectedFighterId: { type: [String, Number], default: null },
    highlightedCellIds: { type: Array, default: () => [] },
    placementCells: { type: Array, default: () => [] },
    highlightedFighterIds: { type: Array, default: () => [] },
    pickedFighterIds: { type: Array, default: () => [] },
    framedFighterIds: { type: Array, default: () => [] },
    battleRoles: { type: Object, default: () => ({}) },
  },
  setup(props) {
    const board = useBoardMap(props);
    return { board };
  },
  render() {
    return h('div');
  },
});

const value = entry =>
  entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;

const mountMap = (props = {}) => {
  const wrapper = mount(Probe, { props: { map, players, ...props } });
  return { wrapper, board: wrapper.vm.board };
};

const map = {
  id: 'test',
  name: 'test',
  settings: { nodeSize: 72 },
  nodes: [
    { id: 1, x: 100, y: 100, terrain: 'ice', neighbors: [2], heroStart: true, position: 1 },
    { id: 2, x: 200, y: 100, terrain: ['desert', 'water'], neighbors: [1] },
  ],
};

const players = [
  {
    id: 'anubis',
    color: '#3B82F6',
    placementReady: false,
    fighters: [
      { id: 'anubis', name: 'Анубис', type: 'hero', currentPosition: 1 },
      { id: 'amat', name: 'Амат', type: 'assistant', currentPosition: 1 },
      { id: 'dead', name: 'Мёртвый', type: 'assistant', currentPosition: null },
    ],
  },
];

const konvaNode = attrs => ({ getAttr: key => attrs[key], getParent: () => null });

describe('useBoardMap: что рисуется', () => {
  it('клетки берутся из карты, радиус — из размера узла', () => {
    const { board } = mountMap();

    expect(value(board.nodes)).toHaveLength(2);
    expect(value(board.radius)).toBeCloseTo(nodeRadius(72));
    expect(value(board.showCellIds)).toBe(false);
  });

  it('у пары соседей одна линия, и она не ловит клики', () => {
    const { board } = mountMap();

    const lines = value(board.edgeLines);
    expect(lines).toHaveLength(1);
    expect(lines[0].listening).toBe(false);
    expect(lines[0].points.length).toBeGreaterThan(2);
  });

  it('цветная клетка получает сектор на каждую стихию, одноцветная — ни одного', () => {
    const { board } = mountMap();
    const [first, second] = value(board.nodes);

    expect(board.sectorsOf(first)).toHaveLength(0);
    expect(board.sectorsOf(second)).toHaveLength(2);
    expect(board.sectorConfig(board.sectorsOf(second)[0]).listening).toBe(false);
  });

  it('бойцы стоят по своим клеткам со сдвигом друг от друга, а выбывший не рисуется', () => {
    const { board } = mountMap();
    const tokens = value(board.placedFighters);

    expect(tokens.map(token => token.fighter.id).sort()).toEqual(['amat', 'anubis']);
    expect(tokens.map(token => token.x).sort((a, b) => a - b)).toEqual([92, 108]);
    expect(tokens.map(token => token.y).sort((a, b) => a - b)).toEqual([92, 108]);
  });

  it('подсветка клетки вне расстановки — синяя рамка, в расстановке рамка родная', async () => {
    const { board, wrapper } = mountMap({ highlightedCellIds: [2] });
    const cell = value(board.nodes)[1];

    expect(board.nodeCircleConfig(cell).stroke).toBe('#0284c7');

    await wrapper.setProps({ placementCells: [{ id: 2, occupied: false }] });

    expect(board.nodeCircleConfig(cell).stroke).not.toBe('#0284c7');
  });
});

describe('useBoardMap: метки битвы', () => {
  const tokenOf = (board, id) =>
    value(board.placedFighters).find(token => String(token.fighter.id) === id);

  it('атакующий обведён красным, защитник — голубым: метки видны всем смотрящим', () => {
    const { board } = mountMap({
      battleRoles: { attackerFighterId: 'anubis', defenderFighterId: 'amat' },
    });

    const attacker = board.fighterHaloConfig(tokenOf(board, 'anubis'));
    const defender = board.fighterHaloConfig(tokenOf(board, 'amat'));

    expect(attacker.stroke).toBe('#dc2626');
    expect(attacker.strokeWidth).toBe(5);
    expect(defender.stroke).toBe('#0ea5e9');
    expect(defender.strokeWidth).toBe(5);
  });

  it('роль в битве сильнее подсветки фазы: атакующий остаётся красным, даже если фаза зовёт его голубым', () => {
    const { board } = mountMap({
      battleRoles: { attackerFighterId: 'anubis' },
      highlightedFighterIds: ['anubis'],
    });

    expect(board.fighterHaloConfig(tokenOf(board, 'anubis')).stroke).toBe('#dc2626');
  });

  it('без битвы цвета прежние: рамка фазы красная, кандидат голубой', () => {
    const { board } = mountMap({
      framedFighterIds: ['anubis'],
      highlightedFighterIds: ['amat'],
    });

    expect(board.fighterHaloConfig(tokenOf(board, 'anubis')).stroke).toBe('#dc2626');
    expect(board.fighterHaloConfig(tokenOf(board, 'amat')).stroke).toBe('#0ea5e9');
  });

  it('отмеченная цель — рамка активности, как у выбранного бойца, без заливки', () => {
    const { board } = mountMap({
      highlightedFighterIds: ['amat'],
      pickedFighterIds: ['amat'],
    });

    const halo = board.fighterHaloConfig(tokenOf(board, 'amat'));
    expect(halo.fill).toBe('transparent');
    expect(halo.stroke).toBe('#0ea5e9');
    expect(halo.strokeWidth).toBe(7);
    expect(halo.opacity).toBe(1);
    // кандидат без отметки остаётся только подсвеченным
    expect(board.fighterHaloConfig(tokenOf(board, 'anubis')).strokeWidth).toBe(0);
  });
});

describe('useBoardMap: кольцо расстановки', () => {
  const placement = [
    { id: 1, occupied: true },
    { id: 2, occupied: false },
  ];

  it('светится у всей области, ярче — у клеток активного бойца и под курсором', () => {
    const { board } = mountMap({ placementCells: placement });
    const [, cell] = value(board.nodes);

    expect(value(board.inPlacement)).toBe(true);
    expect(board.isPlacementCell(cell)).toBe(true);

    const free = board.placementGlowConfig(cell).shadowBlur;
    expect(free).toBeGreaterThan(0);

    board.setDropCell(2);
    expect(board.placementGlowConfig(cell).shadowBlur).toBeGreaterThan(free);
  });

  it('свободная клетка области обведена голубым фирменным, а не серой границей', () => {
    const { board } = mountMap({ placementCells: placement });
    const [, cell] = value(board.nodes);
    const ring = board.placementRingConfig(cell);

    expect(ring.stroke).toBe('#22d3ee');
    expect(board.placementGlowConfig(cell).shadowColor).toBe('#22d3ee');
  });

  /**
   * Свечение уходит **наружу клетки**: кружок свечения на 8 больше радиуса клетки, а у самого кольца
   * своей тени нет — иначе гало ложится внутрь кружка и за границей клетки его не видно.
   */
  it('свечение шире клетки, а у кольца своей тени нет', () => {
    const { board } = mountMap({ placementCells: placement });
    const [, cell] = value(board.nodes);
    const ring = board.placementRingConfig(cell);
    const glow = board.placementGlowConfig(cell);

    expect(glow.radius).toBeGreaterThan(ring.radius);
    expect(glow.shadowBlur).toBeGreaterThan(0);
    expect(glow.shadowForStrokeEnabled).toBe(true);
    expect(ring.shadowBlur).toBe(0);
    expect(ring.shadowOpacity).toBe(0);
  });

  /**
   * Пульс живёт не в конфиге, а на самом узле Konva (`Board.vue: pulseGlow`): пересборка `:config`
   * до узла не доходит — проверено замером (`shadowBlur` замирал на первом значении). Поэтому здесь
   * проверяется только ровная часть: кольцо под курсором не меняется от пульса.
   */
  it('под курсором кольцо остаётся тем же, пока дышит свечение', () => {
    const { board } = mountMap({ placementCells: placement });
    const [, cell] = value(board.nodes);
    board.setDropCell(2);

    const glow = board.placementGlowConfig(cell);
    board.setPulse(1);

    expect(board.placementGlowConfig(cell)).toEqual(glow);
    const ring = board.placementRingConfig(cell);
    board.setPulse(0);
    expect(board.placementRingConfig(cell)).toEqual(ring);
  });

  it('активный боец — ровное свечение по всей подсветке, без пульсации', () => {
    const { board } = mountMap({ placementCells: placement, highlightedCellIds: [2] });
    const [, cell] = value(board.nodes);

    board.setPulse(0);
    const calm = board.placementGlowConfig(cell);
    board.setPulse(1);
    const later = board.placementGlowConfig(cell);

    expect(later.shadowBlur).toBe(calm.shadowBlur);
    expect(later.shadowOpacity).toBe(calm.shadowOpacity);
    expect(calm.shadowBlur).toBeGreaterThan(board.placementGlowConfig({ id: 1 }).shadowBlur);
  });

  it('занятая своим бойцом клетка не светится', () => {
    const { board } = mountMap({ placementCells: placement });
    const [busy] = value(board.nodes);
    const ring = board.placementRingConfig(busy);
    const glow = board.placementGlowConfig(busy);

    expect(glow.opacity).toBe(0);
    expect(ring.shadowOpacity).toBe(0);
    expect(ring.opacity).toBe(0.5);
    expect(ring.stroke).toBe('#94a3b8');
  });
});

describe('useBoardMap: что под курсором', () => {
  it('точка экрана превращается в клетку по живому преобразованию сцены', () => {
    const { board } = mountMap();

    expect(board.cellAt({ x: 100, y: 100 }, { x: 0, y: 0, scaleX: 1, scaleY: 1 })).toBe('1');
    expect(board.cellAt({ x: 900, y: 900 }, { x: 0, y: 0, scaleX: 1, scaleY: 1 })).toBeNull();
    expect(board.cellAt(null, { x: 0, y: 0, scaleX: 1, scaleY: 1 })).toBeNull();
  });

  it('фигура под курсором поднимается до бойца и до клетки', () => {
    const { board } = mountMap();

    expect(board.clickTargetOf(konvaNode({ cellName: 'cell', cellId: 2 }))).toEqual({
      kind: 'cell',
      cellId: 2,
    });
    expect(
      board.clickTargetOf(konvaNode({ cellName: 'fighter', fighterId: 'amat', ownerId: 'anubis' })),
    ).toEqual({ kind: 'fighter', fighterId: 'amat', playerId: 'anubis' });
    expect(board.clickTargetOf({})).toBeNull();
  });

  it('габарит поля считается по клеткам и маркерам расстановки', () => {
    const { wrapper, board } = mountMap({ placementCells: [{ id: 1, occupied: false }] });
    const withoutMarkers = value(board.bounds);

    wrapper.setProps({ players: [{ ...players[0], placementReady: true }] });

    expect(value(board.bounds).minX).toBeGreaterThanOrEqual(withoutMarkers.minX);
  });
});

describe('useBoardMap: чужая расстановка закрыта до её конца', () => {
  const placing = [
    {
      id: 'medusa',
      color: '#22C55E',
      placementReady: false,
      fighters: [{ id: 'harpies_1', name: 'Гарпии', type: 'assistant', currentPosition: 2 }],
    },
    {
      id: 'anubis',
      color: '#3B82F6',
      placementReady: true,
      fighters: [{ id: 'amat', name: 'Амат', type: 'assistant', currentPosition: 1 }],
    },
  ];

  it('пока расстановка идёт, на доске только свои бойцы', () => {
    const { board } = mountMap({ players: placing, phase: 'gameStart', viewerId: 'medusa' });

    expect(value(board.placedFighters).map(token => token.fighter.id)).toEqual(['harpies_1']);
  });

  /** Правило игры: чужую расстановку не видит никто — ни пока она идёт, ни после её подтверждения. */
  it('чужой слот не виден и после того, как сам подтвердился: расстановка чужих — не наша', () => {
    const mineReady = placing.map(player =>
      player.id === 'medusa' ? { ...player, placementReady: true } : player,
    );
    const { board } = mountMap({ players: mineReady, phase: 'gameStart', viewerId: 'medusa' });

    const ids = value(board.placedFighters).map(token => token.fighter.id);
    expect(ids).toContain('harpies_1');
    expect(ids).not.toContain('amat');
  });

  it('расстановка кончилась — видно всех', () => {
    const { board } = mountMap({ players: placing, phase: 'turn', viewerId: 'medusa' });

    expect(
      value(board.placedFighters)
        .map(token => token.fighter.id)
        .sort(),
    ).toEqual(['amat', 'harpies_1']);
  });
});

describe('useBoardMap: реактивность', () => {
  it('карта и бойцы читаются реактивно: новые данные — новая геометрия', async () => {
    const mapRef = reactive({ ...map });
    const wrapper = mount(Probe, {
      props: { map: mapRef, players },
    });

    expect(value(wrapper.vm.board.nodes)).toHaveLength(2);

    mapRef.nodes = [...map.nodes, { id: 3, x: 300, y: 100, terrain: 'forest', neighbors: [] }];
    await wrapper.vm.$nextTick();

    expect(value(wrapper.vm.board.nodes)).toHaveLength(3);
  });
});
