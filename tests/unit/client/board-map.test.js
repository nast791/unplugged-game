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
const { TOKEN, nodeRadius, tokenFaceRadius, tokenRadius } =
  await import('~/composables/ui/useBoardGeometry.js');
const { terrainColor } = await import('#shared/constants/terrain.js');

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
    pickFighters: { type: Boolean, default: false },
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

describe('useBoardMap: подсказка бойца', () => {
  const tokenWith = fighter => ({ x: 120, y: 340, fighter });

  it('называет бойца, здоровье, удар и шаг', () => {
    const { board } = mountMap();
    const tip = board.fighterTipTextConfig(
      tokenWith({ id: 'amat', name: 'Амат', currentHp: 4, startHp: 6, attackRange: 1, move: 3 }),
    );

    expect(tip.text).toBe('Амат\nЗдоровье 4/6 · Удар 1 · Шаг 3');
    expect(tip.listening).toBe(false);
  });

  it('встаёт над фишкой, а не поверх неё, и указывает вниз', () => {
    const { board } = mountMap();
    const anchor = board.fighterTipAnchorConfig(tokenWith({ id: 'amat', name: 'Амат' }));

    expect(anchor.x).toBe(120);
    expect(anchor.y).toBeLessThan(340);
    expect(board.fighterTipTagConfig().pointerDirection).toBe('down');
  });
});

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

  /**
   * Поле под клетками — глухая бумага, а не рисунок-подложка (правило владельца): снимок фона читался
   * сквозь поле и мешал стихиям, поэтому у бумаги нет альфы, а самого фона в геометрии больше нет.
   */
  it('поле закрывает стол непрозрачной бумагой, без рисунка на фоне', async () => {
    const { board } = mountMap();

    expect(value(board.paperConfig).fill).toBe('#efece6');
    expect('FIELD_BACKDROP' in (await import('~/composables/ui/useBoardGeometry.js'))).toBe(false);
  });

  it('бойцы стоят по своим клеткам со сдвигом друг от друга, а выбывший не рисуется', () => {
    const { board } = mountMap();
    const tokens = value(board.placedFighters);

    expect(tokens.map(token => token.fighter.id).sort()).toEqual(['amat', 'anubis']);
    expect(tokens.map(token => token.x).sort((a, b) => a - b)).toEqual([92, 108]);
    expect(tokens.map(token => token.y).sort((a, b) => a - b)).toEqual([92, 108]);
  });

  /**
   * Подсветка клетки — то же кольцо, что и в расстановке: граница клетки остаётся родной, а действие
   * показывает голубое кольцо поверх неё с мягким гало (`PLACEMENT.free = #22d3ee`).
   */
  it('подсветка клетки вне расстановки — то же голубое кольцо, а граница клетки родная', async () => {
    const { board, wrapper } = mountMap({ highlightedCellIds: [2] });
    const cell = value(board.nodes)[1];

    expect(board.nodeCircleConfig(cell).stroke).not.toBe('#0284c7');
    expect(board.nodeCircleConfig(cell).stroke).toBe('#1E293B');
    expect(board.cellRingConfig(cell).stroke).toBe('#22d3ee');
    expect(board.cellGlowConfig(cell).shadowBlur).toBeGreaterThan(0);

    await wrapper.setProps({ placementCells: [{ id: 2, occupied: false }] });

    expect(board.cellRingConfig(cell).stroke).toBe('#22d3ee');
  });

  it('кольцо рисуется только у клеток-кандидатов и у клеток области расстановки', async () => {
    const { board } = mountMap({ highlightedCellIds: [2] });
    const [first, second] = value(board.nodes);

    expect(board.isActiveCell(second)).toBe(true);
    expect(board.isActiveCell(first)).toBe(false);
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

  /**
   * Движок на защите отмечает цель боя рамкой фазы (`framedFighterIds`), но защитник обязан остаться
   * голубым: красный цвет читается как «этот бьёт». Роль в битве сильнее рамки.
   */
  it('защитник голубой при любой рамке фазы: цвет роли важнее выделения', () => {
    const { board } = mountMap({
      battleRoles: { attackerFighterId: 'anubis', defenderFighterId: 'amat' },
      framedFighterIds: ['anubis', 'amat'],
    });

    expect(board.fighterHaloConfig(tokenOf(board, 'amat')).stroke).toBe('#0ea5e9');
    expect(board.fighterHaloConfig(tokenOf(board, 'anubis')).stroke).toBe('#dc2626');
  });

  it('рамка фазы никогда не красная: красный остаётся за тем, кто бьёт', () => {
    const { board } = mountMap({
      framedFighterIds: ['anubis'],
      highlightedFighterIds: ['amat'],
    });

    const framed = board.fighterHaloConfig(tokenOf(board, 'anubis'));
    expect(framed.stroke).toBe('#0ea5e9');
    expect(framed.strokeWidth).toBe(5);
    expect(board.fighterHaloConfig(tokenOf(board, 'amat')).stroke).toBe('#0ea5e9');

    const attacker = mountMap({
      battleRoles: { attackerFighterId: 'anubis' },
      framedFighterIds: ['anubis', 'amat'],
    }).board;
    expect(attacker.fighterHaloConfig(tokenOf(attacker, 'anubis')).stroke).toBe('#dc2626');
    expect(attacker.fighterHaloConfig(tokenOf(attacker, 'amat')).stroke).toBe('#0ea5e9');
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

describe('useBoardMap: выделение фишки', () => {
  const tokenOf = (board, id) =>
    value(board.placedFighters).find(token => String(token.fighter.id) === id);

  it('выбранная фишка светится коралловой тенью, а кольца у неё нет', () => {
    const { board } = mountMap({ selectedFighterId: 'anubis' });

    const halo = board.fighterHaloConfig(tokenOf(board, 'anubis'));
    expect(halo.opacity).toBe(1);
    expect(halo.fill).toBe('transparent');
    // кольцо не спорит с тенью: у простого выбора кольца нет вовсе
    expect(halo.strokeWidth).toBe(0);

    const shadow = board.fighterShadowConfig(tokenOf(board, 'anubis'));
    expect(shadow.fillRadialGradientColorStops[1]).toContain('255, 127, 80');
    expect(shadow.fillRadialGradientColorStops[3]).toContain('255, 127, 80');
    expect(shadow.listening).toBe(false);
    // светится ровно со всех сторон и не выходит за клетку
    expect(shadow.y).toBe(0);
    expect(shadow.radiusX).toBe(shadow.radiusY);
    const cell = nodeRadius(map.settings.nodeSize);
    expect(shadow.radiusX).toBeLessThan(cell);
    expect(shadow.radiusY).toBeLessThan(cell);
  });

  it('рамку фазы выбор не отменяет: кольцо остаётся голубым, акцент — в тени', () => {
    const { board } = mountMap({
      selectedFighterId: 'anubis',
      framedFighterIds: ['anubis'],
      highlightedFighterIds: ['anubis'],
    });

    const halo = board.fighterHaloConfig(tokenOf(board, 'anubis'));
    expect(halo.stroke).toBe('#0ea5e9');
    expect(halo.strokeWidth).toBe(5);
    // соседняя фишка без выбора остаётся голубой рамкой фазы, тень у неё тёмная
    const other = mountMap({ framedFighterIds: ['amat'] }).board;
    expect(other.fighterHaloConfig(tokenOf(other, 'amat')).stroke).toBe('#0ea5e9');
  });

  it('тень обычной фишки тёмная, а не акцентная', () => {
    const { board } = mountMap({});
    const shadow = board.fighterShadowConfig(tokenOf(board, 'anubis'));

    expect(shadow.fillRadialGradientColorStops[1]).toContain('15, 23, 42');
    // и тоже не выползает за клетку: низ пятна остаётся внутри кружка
    expect(shadow.y + shadow.radiusY).toBeLessThan(nodeRadius(map.settings.nodeSize));
  });

  it('роль в битве сильнее выбора: атакующий остаётся красным', () => {
    const { board } = mountMap({
      selectedFighterId: 'anubis',
      battleRoles: { attackerFighterId: 'anubis' },
    });

    expect(board.fighterHaloConfig(tokenOf(board, 'anubis')).stroke).toBe('#dc2626');
    // и тень у него обычная: акцент не перебивает бой
    const shadow = board.fighterShadowConfig(tokenOf(board, 'anubis'));
    expect(shadow.fillRadialGradientColorStops[1]).toContain('15, 23, 42');
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

    const free = board.cellGlowConfig(cell).shadowBlur;
    expect(free).toBeGreaterThan(0);

    board.setDropCell(2);
    expect(board.cellGlowConfig(cell).shadowBlur).toBeGreaterThan(free);
  });

  it('свободная клетка области обведена голубым фирменным, а не серой границей', () => {
    const { board } = mountMap({ placementCells: placement });
    const [, cell] = value(board.nodes);
    const ring = board.cellRingConfig(cell);

    expect(ring.stroke).toBe('#22d3ee');
    expect(board.cellGlowConfig(cell).shadowColor).toBe('#22d3ee');
  });

  /**
   * Свечение уходит **наружу клетки**: кружок свечения на 8 больше радиуса клетки, а у самого кольца
   * своей тени нет — иначе гало ложится внутрь кружка и за границей клетки его не видно.
   */
  it('свечение шире клетки, а у кольца своей тени нет', () => {
    const { board } = mountMap({ placementCells: placement });
    const [, cell] = value(board.nodes);
    const ring = board.cellRingConfig(cell);
    const glow = board.cellGlowConfig(cell);

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

    const glow = board.cellGlowConfig(cell);
    board.setPulse(1);

    expect(board.cellGlowConfig(cell)).toEqual(glow);
    const ring = board.cellRingConfig(cell);
    board.setPulse(0);
    expect(board.cellRingConfig(cell)).toEqual(ring);
  });

  it('активный боец — ровное свечение по всей подсветке, без пульсации', () => {
    const { board } = mountMap({ placementCells: placement, highlightedCellIds: [2] });
    const [, cell] = value(board.nodes);

    board.setPulse(0);
    const calm = board.cellGlowConfig(cell);
    board.setPulse(1);
    const later = board.cellGlowConfig(cell);

    expect(later.shadowBlur).toBe(calm.shadowBlur);
    expect(later.shadowOpacity).toBe(calm.shadowOpacity);
    expect(calm.shadowBlur).toBeGreaterThan(board.cellGlowConfig({ id: 1 }).shadowBlur);
  });

  it('занятая своим бойцом клетка не светится', () => {
    const { board } = mountMap({ placementCells: placement });
    const [busy] = value(board.nodes);
    const ring = board.cellRingConfig(busy);
    const glow = board.cellGlowConfig(busy);

    expect(glow.opacity).toBe(0);
    expect(ring.shadowOpacity).toBe(0);
    expect(ring.opacity).toBe(0.5);
    expect(ring.stroke).toBe('#94a3b8');
  });
});

/**
 * Мигание — знак «здесь нужен выбор»: оно живёт только на кандидатах и только пока фаза ждёт клика.
 * Информационная подсветка (ждём защиту, цель боя уже выбрана) кольцо показывает, но не мигает.
 */
describe('useBoardMap: мигание там, где нужен выбор', () => {
  const tokenOf = (board, id) =>
    value(board.placedFighters).find(token => String(token.fighter.id) === id);

  it('клетки-кандидаты пульсируют, а занятая своим бойцом — нет', () => {
    const { board } = mountMap({
      highlightedCellIds: [2],
      placementCells: [{ id: 1, occupied: true }],
    });
    const [busy, free] = value(board.nodes);

    expect(value(board.pulseActive)).toBe(true);
    expect(board.isPulsingCell(free)).toBe(true);
    expect(board.isPulsingCell(busy)).toBe(false);
    expect(board.cellPulseConfig(free).pulseRing).toBe(true);
  });

  it('бойцы мигают только когда фаза просит клик по бойцу', async () => {
    const { board, wrapper } = mountMap({ highlightedFighterIds: ['amat'] });

    expect(board.isPulsingFighter(tokenOf(board, 'amat'))).toBe(false);

    await wrapper.setProps({ pickFighters: true });

    expect(board.isPulsingFighter(tokenOf(board, 'amat'))).toBe(true);
    expect(board.isPulsingFighter(tokenOf(board, 'anubis'))).toBe(false);
    expect(board.fighterPulseConfig(tokenOf(board, 'amat')).pulseRing).toBe(true);
  });

  it('пульс не участвует в ровных конфигах: меняет узел Konva, а не разметку', () => {
    const { board } = mountMap({ highlightedCellIds: [2] });
    const cell = value(board.nodes)[1];
    const glow = board.cellGlowConfig(cell);
    const ring = board.cellRingConfig(cell);

    board.setPulse(1);

    expect(board.cellGlowConfig(cell)).toEqual(glow);
    expect(board.cellRingConfig(cell)).toEqual(ring);
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

describe('useBoardMap: временная стихия клетки', () => {
  const extraMap = {
    id: 'extra',
    settings: { nodeSize: 72 },
    nodes: [
      {
        id: 1,
        x: 100,
        y: 100,
        terrain: 'ice',
        extraTerrain: ['lava'],
        neighbors: [],
      },
    ],
  };

  it('добавка рисуется отдельным сектором с золотой каймой, а стихия клетки не меняется', () => {
    const { board } = mountMap({ map: extraMap });
    const [cell] = value(board.nodes);
    const sectors = board.sectorsOf(cell);

    // цвет кружка по-прежнему цвет основной стихии, а не лавы
    expect(board.nodeCircleConfig(cell).fill).toBe(terrainColor('ice'));
    expect(sectors).toHaveLength(2);
    expect(sectors[0].temporary).toBe(false);
    expect(sectors[1].temporary).toBe(true);
    expect(board.sectorConfig(sectors[1])).toMatchObject({
      stroke: '#F7C846',
      strokeWidth: 2,
    });
  });

  it('у добавки есть пунктирный обод: видно, что стихия исчезнет в конце хода', () => {
    const { board } = mountMap({ map: extraMap });
    const [cell] = value(board.nodes);
    const marks = board.temporaryMarksOf(cell);

    expect(marks).toHaveLength(1);
    expect(marks[0].dash).toEqual([5, 4]);
    expect(marks[0].stroke).toBe('#F7C846');
  });

  it('текстура добавки тоже ложится: у клетки две плитки стихий', () => {
    const { board } = mountMap({ map: extraMap });
    const [cell] = value(board.nodes);
    const patterns = board.patternsOf(cell);

    expect(patterns.map(pattern => pattern.terrain)).toEqual(['ice', 'lava']);
  });
});

describe('useBoardMap: объёмная фишка в цвете героя', () => {
  const tokenOf = (board, id) =>
    value(board.placedFighters).find(token => String(token.fighter.id) === id);

  it('кромка фишки — цвет героя с объёмным градиентом, без внешней обводки и без тени-кольца', () => {
    const { board } = mountMap();
    const token = tokenOf(board, 'anubis');
    const body = board.fighterBodyConfig(token);

    // свет из верхнего левого угла: чем дальше, тем темнее — круг читается куполом
    expect(body.fillPriority).toBe('radial-gradient');
    expect(body.fillRadialGradientColorStops[5]).toBe('#3B82F6');
    expect(body.fillRadialGradientStartPoint.x).toBeLessThan(0);
    expect(body.fillRadialGradientStartPoint.y).toBeLessThan(0);
    // внешняя обводка «сплющивала» фишку: край держит отдельное пятно тени, а не линия по контуру
    expect(body.stroke).toBeUndefined();
    expect(body.strokeWidth).toBeUndefined();
    expect(body.shadowColor).toBeUndefined();
    // круг остаётся хит-зоной группы: клик по фишке должен работать
    expect(body.listening).not.toBe(false);
    expect(body.radius).toBeCloseTo(tokenRadius(value(board.radius)), 6);
  });

  it('край скруглён мягкой тенью, а поле портрета вдавлено тенью поверх аватара', () => {
    const { board } = mountMap();
    const token = tokenOf(board, 'anubis');
    const body = board.fighterBodyConfig(token);
    const rim = board.fighterRimShadeConfig(token);
    const faceEdge = board.fighterFaceEdgeConfig(token);

    expect(rim.listening).toBe(false);
    expect(rim.radius).toBeCloseTo(body.radius, 6);
    expect(rim.fillPriority).toBe('radial-gradient');
    expect(rim.fillRadialGradientColorStops[1]).toBe('rgba(15, 23, 42, 0)');
    expect(rim.fillRadialGradientColorStops[5]).toMatch(/^rgba\(15, 23, 42, 0\.[34]/);

    expect(faceEdge.listening).toBe(false);
    expect(faceEdge.radius).toBeCloseTo(tokenFaceRadius(value(board.radius)), 6);
    expect(faceEdge.fillRadialGradientStartRadius).toBeGreaterThan(0);
    expect(faceEdge.fillRadialGradientColorStops[1]).toBe('rgba(15, 23, 42, 0)');
    expect(faceEdge.fillRadialGradientColorStops[3]).toMatch(/^rgba\(15, 23, 42, 0\.[45]/);
  });

  it('под фишкой лежит тень: пятно снизу не ловит клики', () => {
    const { board } = mountMap();
    const shadow = board.fighterShadowConfig(tokenOf(board, 'anubis'));
    const body = board.fighterBodyConfig(tokenOf(board, 'anubis'));

    expect(shadow.listening).toBe(false);
    expect(shadow.y).toBeGreaterThan(0);
    expect(shadow.radiusX).toBeGreaterThan(shadow.radiusY);
    // пятно шире фишки снизу: тень видна из-под неё, а не спрятана в круге
    expect(shadow.radiusX).toBeGreaterThan(body.radius);
    expect(shadow.fillPriority).toBe('radial-gradient');
    expect(shadow.fillRadialGradientColorStops[1]).toBe('rgba(15, 23, 42, 0.55)');
    expect(shadow.fillRadialGradientColorStops[3]).toBe('rgba(15, 23, 42, 0)');
  });

  it('поле портрета меньше кромки и не ловит клики: внутри лежит аватар', () => {
    const { board } = mountMap();
    const token = tokenOf(board, 'anubis');
    const face = board.fighterFaceConfig(token);

    expect(face.listening).toBe(false);
    expect(face.radius).toBeLessThan(board.fighterBodyConfig(token).radius);
    expect(face.radius).toBeCloseTo(tokenFaceRadius(value(board.radius)), 6);
    expect(face.fillPriority).toBe('radial-gradient');
    expect(face.stroke).toMatch(/^rgba?\(/);
  });

  it('блик лежит пятном света на кромке и не ловит клики', () => {
    const { board } = mountMap();
    const token = tokenOf(board, 'anubis');
    const shine = board.fighterShineConfig(token);
    const body = board.fighterBodyConfig(token);

    expect(shine.listening).toBe(false);
    expect(shine.radius).toBeCloseTo(body.radius, 6);
    expect(shine.fillPriority).toBe('radial-gradient');
    expect(shine.fillRadialGradientColorStops[1]).toMatch(/rgba\(255, 255, 255/);
    expect(shine.fillRadialGradientColorStops[5]).toBe('rgba(255, 255, 255, 0)');
    // свет из верхнего левого угла: без среза на конце, в отличие от прежней дуги
    expect(shine.fillRadialGradientStartPoint.x).toBeLessThan(0);
    expect(shine.fillRadialGradientStartPoint.y).toBeLessThan(0);
  });

  it('без аватара внутри буква контрастного цвета, а не тёмная на тёмном', () => {
    const { board } = mountMap();
    const dark = board.fighterLabelConfig(tokenOf(board, 'anubis'));
    const light = board.fighterLabelConfig({ ...tokenOf(board, 'anubis'), color: '#EDC9AF' });

    expect(dark.text).toBe('А');
    expect(dark.fill).toBe('#FFFFFF');
    expect(light.fill).toBe('#111827');
    expect(dark.listening).toBe(false);
  });
});

describe('useBoardMap: здоровье бойца — сердце, а не карта', () => {
  const tokenOf = (board, id) =>
    value(board.placedFighters).find(token => String(token.fighter.id) === id);

  it('сердце объёмное, без рамки и без карты: градиент, блик и цифры внутри', async () => {
    const { HEART } = await import('~/constants/heart.js');
    const { board } = mountMap();
    const token = tokenOf(board, 'anubis');
    const heart = board.fighterHpHeartConfig(token);
    const gloss = board.fighterHpGlossConfig(token);
    const label = board.fighterHpLabelConfig(token);
    const body = board.fighterBodyConfig(token);
    const size = heart.scaleX * HEART.width;

    expect(heart.data).toBe(HEART.path);
    expect(heart.fillPriority).toBe('linear-gradient');
    expect(heart.fillLinearGradientColorStops).toEqual([
      0,
      '#ff8d7c',
      0.42,
      '#e2322b',
      1,
      '#8d0f14',
    ]);
    expect(heart.stroke).toBeUndefined();
    expect(heart.cornerRadius).toBeUndefined();
    expect(heart.listening).toBe(false);
    expect(heart.offsetX).toBe(HEART.centerX);
    expect(heart.offsetY).toBe(HEART.centerY);

    expect(gloss.fillPriority).toBe('radial-gradient');
    expect(gloss.fillRadialGradientColorStops[1]).toMatch(/^rgba\(255, 255, 255/);
    expect(gloss.fillRadialGradientEndRadius).toBe(HEART.glossRadius);

    // сердце торчит из-под фишки вправо-вниз, по размеру меньше самой фишки
    expect(heart.x).toBeGreaterThan(body.radius * 0.6);
    expect(heart.y).toBeCloseTo(heart.x, 6);
    expect(size).toBeLessThan(body.radius * 1.2);

    // цифры стоят по центру сердца
    expect(label.text).toBe(String(Number(token.fighter.currentHp ?? 0)));
    expect(label.fill).toBe('#ffffff');
    expect(label.fontStyle).toBe('bold');
    expect(label.x + label.width / 2).toBeCloseTo(heart.x, 6);
  });
});

describe('useBoardMap: ключ кэша статики доски', () => {
  const shift = async (key, mutate) => {
    const map = {
      id: 'test',
      name: 'test',
      settings: { nodeSize: 72 },
      nodes: [
        { id: 1, x: 100, y: 100, terrain: 'ice', neighbors: [2], heroStart: true, position: 1 },
        { id: 2, x: 200, y: 100, terrain: 'desert', neighbors: [1] },
      ],
    };
    mutate?.(map);
    const { wrapper, board } = mountMap({ map });
    const before = value(board.boardKey);
    const after = await key({ wrapper, board, map });
    return [before, after];
  };

  it('не сбрасывается подсветкой и выбором: статика от них не зависит', async () => {
    const { wrapper, board } = mountMap();
    const before = value(board.boardKey);

    await wrapper.setProps({ highlightedCellIds: [1], selectedFighterId: 'anubis' });

    expect(value(board.boardKey)).toBe(before);
  });

  it('сбрасывается сменой стихии клетки: временный сектор — уже другая картинка', async () => {
    const [before, after] = await shift(async ({ wrapper, map }) => {
      const next = { ...map, nodes: map.nodes.map(node => ({ ...node })) };
      next.nodes[1].terrain = ['desert', 'water'];
      await wrapper.setProps({ map: next });
      return value(wrapper.vm.board.boardKey);
    });

    expect(after).not.toBe(before);
  });

  it('сбрасывается переездом клетки: статика не может остаться на старом месте', async () => {
    const { wrapper, board } = mountMap();
    const before = value(board.boardKey);

    const map = {
      ...wrapper.props('map'),
      nodes: wrapper
        .props('map')
        .nodes.map(node => (node.id === 2 ? { ...node, x: 220 } : { ...node })),
    };
    await wrapper.setProps({ map });

    expect(value(board.boardKey)).not.toBe(before);
  });
});
