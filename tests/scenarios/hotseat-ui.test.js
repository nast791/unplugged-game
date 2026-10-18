// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';

/**
 * Клиентский фаззинг стола на четверых: партию ведёт настоящий `useGameSession` (со своей проекцией
 * `party.view` → `adaptPartyView`), а ходы делает кликами по тому, что игрок видит, — и рядом живут
 * настоящие панели (`PlayersPanel`, `CardsPanel`, `HintsWindow`, `ChoicePanel`, `BattleWindow`,
 * `PlacementTray`), чтобы падение вида на живых данных тоже стало находкой.
 *
 * Короткая серия — в `pnpm test`; длинная — `$env:UI_SEEDS='40'; npx vitest run tests/scenarios/hotseat-ui.test.js`.
 * Находки печатаются с сидом и логом кликов: партия повторяется один в один.
 */
vi.mock('~/composables/game/useGameView.js', async importOriginal => {
  const original = await importOriginal();
  const vue = await import('vue');
  const { runAction } = await import('#shared/publicApi.js');
  const { view: projectView } = await import('../../server/party.js');

  const hostState = vue.ref(null);
  const playerId = vue.ref(null);
  const gameId = vue.ref(null);
  const steps = vue.ref(0);
  const selectedFighterId = vue.ref(null);
  const view = vue.ref(null);
  // Проекция сервера клонирует состояние (`structuredClone`), а прокси Vue не клонируется: держим
  // рядом обычный объект — ровно то, что приходит на сервер по HTTP (`state` уже разобран из JSON).
  let raw = null;

  const project = () => {
    view.value = original.adaptPartyView(projectView(raw, playerId.value));
    return view.value;
  };

  const api = {
    hostState,
    gameId,
    playerId,
    steps,
    selectedFighterId,
    view: vue.computed(() => view.value),
    sendAction: async action => {
      // как настоящий клиент (`useGameView.sendAction`): смотрящий подставляется в `playerId`
      const payload = { ...action, playerId: String(action.playerId ?? playerId.value) };
      raw = runAction(raw, payload);
      hostState.value = raw;
      steps.value += 1;
      return project();
    },
    refresh: async () => project(),
    bootstrap: async () => view.value,
    seed: () => {},
    seedView: () => view.value,
    clear: () => {},
    discard: () => {},
    __start: (host, asPlayerId) => {
      raw = JSON.parse(JSON.stringify(host));
      hostState.value = raw;
      gameId.value = String(host.id);
      playerId.value = String(asPlayerId);
      project();
    },
  };

  return { ...original, useGameView: () => api };
});

vi.mock('~/composables/ui/useProfile.js', async () => {
  const vue = await import('vue');
  return { useProfile: () => ({ nick: vue.computed(() => 'Игрок') }) };
});

/** Пресеты интерфейса берутся из `useAppConfig` Nuxt, которого в тесте нет: слоты остаются своими. */
vi.mock('~/composables/ui/useUI.js', async importOriginal => {
  const original = await importOriginal();
  const vue = await import('vue');
  return {
    ...original,
    useUI: (key, localUi = {}) => ({
      styles: vue.computed(() => original.resolveUiStyles({}, vue.toValue(localUi) ?? {})),
    }),
  };
});

vi.mock('~/composables/api/heroes.js', async () => {
  const vue = await import('vue');
  return {
    useHeroPacks: () => ({ packs: { data: vue.ref(null) }, load: () => {}, heroPack: () => null }),
    useHeroQuery: () => ({
      data: vue.ref(null),
      isPending: vue.ref(false),
      isError: vue.ref(false),
    }),
  };
});

/** Картинка ходит в `@nuxt/image` (`useImage`), которого в тесте нет: для вида хватит `<img>`. */
vi.mock('~/components/atoms/APicture.vue', async () => {
  const vue = await import('vue');
  return {
    default: {
      name: 'APicture',
      props: { src: { type: String, default: '' }, alt: { type: String, default: '' } },
      render() {
        return vue.h('img', { src: this.src, alt: this.alt });
      },
    },
  };
});

vi.mock('~/composables/ui/useSwiper.js', async () => {
  const vue = await import('vue');
  return {
    useSwiper: () => ({
      containerRef: vue.ref(null),
      slideNext: () => {},
      slidePrev: () => {},
      isFirstVisible: vue.ref(true),
      isLastVisible: vue.ref(true),
      update: () => {},
      setEnabled: () => {},
      reinit: () => {},
      destroy: () => {},
    }),
  };
});

globalThis.computed = computed;
globalThis.ref = ref;

const { runUiGame } = await import('../support/hotseat-ui.js');

/** Поломка клиента: пустой экран, молчащая кнопка, чужой экран, падение вида. */
const FAILING = ['crash', 'empty', 'silent', 'acting', 'console', 'render'];

const failureLine = report =>
  `сид ${report.seed}, шаг ${report.steps}: ${report.status} — ${report.detail}\n` +
  `  клики: ${JSON.stringify(report.log.slice(-5))}`;

describe('стол на четверых: клиентский прогон', () => {
  it('партия проходится кликами по подсветке: нет пустых экранов и молчащих кнопок', async () => {
    const seeds = Math.max(1, Number(process.env.UI_SEEDS) || 1);
    const reports = [];
    for (let seed = 1; seed <= seeds; seed += 1) {
      reports.push(await runUiGame({ seed, players: 4, maxSteps: 250 }));
    }

    const failures = reports.filter(report => FAILING.includes(report.status));
    process.stdout.write(
      `клиентский прогон: ${reports.map(r => `${r.status} за ${r.steps} кликов`).join(', ')}\n`,
    );
    expect(failures.map(failureLine)).toEqual([]);
    expect(reports.some(report => report.status === 'finished' || report.status === 'stuck')).toBe(
      true,
    );
  }, 180000);
});
