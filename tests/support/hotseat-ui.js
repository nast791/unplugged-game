import { flushPromises, mount } from '@vue/test-utils';
import { Suspense, defineComponent, h, nextTick } from 'vue';
import { runAction, runUi } from '#shared/publicApi.js';
import { createGame } from '../../server/create.js';
import { load, remove } from '../../server/party.js';
import { actionsFor, actorOf } from '../../bot/play/decide.js';
import { signature } from '../../bot/play/duel.js';
import { hotseatSlots } from '../../bot/play/hotseat.js';

/**
 * Клиентский прогон стола: партию ведёт **настоящий клиент** — `useGameSession` со своей проекцией
 * (`party.view` → `adaptPartyView`), а ходы делает не движок напрямую, а клики по тому, что игрок видит:
 * подсвеченный боец, свободная клетка, доступная карта, вариант свойства, кнопка завершения.
 *
 * Что ищет (всё с сидом и шагом, повторяется один в один):
 * - `empty` — движок ждёт ход, а клиент не показывает ни одного действия (пустой экран);
 * - `silent` — клик ушёл, но не сделал ничего и ничего не сказал игроку (кнопка-пустышка);
 * - `acting` — клиент считает действующим одного, движок другого (экран не тому человеку);
 * - `render`/`console` — панель не смонтировалась или Vue ругнулся на живой партии;
 * - `crash` — исключение в клиенте (клик, рендер, проекция);
 * - `stuck` — двадцать кликов подряд не меняют состояние.
 *
 * Моки (`useGameView` без сети, `useProfile`, пак героев, Swiper) объявляет вызывающий тест: сюда
 * приходят уже подменённые модули, как и в остальных клиентских тестах.
 */
const PANELS = [
  ['HintsWindow', '../../app/components/organisms/game/HintsWindow.vue'],
  ['ChoicePanel', '../../app/components/organisms/game/ChoicePanel.vue'],
  ['BattleWindow', '../../app/components/organisms/game/BattleWindow.vue'],
  ['PlacementTray', '../../app/components/molecules/game/PlacementTray.vue'],
  ['PlayersPanel', '../../app/components/organisms/game/PlayersPanel.vue'],
  ['CardsPanel', '../../app/components/organisms/game/CardsPanel.vue'],
];

const messageOf = error => (error instanceof Error ? error.message : String(error));

const keyOf = action => JSON.stringify(action ?? null);

/** Сбой клиента в консоли: Vue ругается так же, как падает, — на живой партии это находка. */
const captureConsole = () => {
  const records = [];
  const original = { error: console.error, warn: console.warn };
  const push =
    kind =>
    (...args) => {
      records.push(`${kind}: ${args.map(arg => messageOf(arg)).join(' ')}`.slice(0, 300));
    };
  console.error = push('error');
  console.warn = push('warn');
  return {
    records,
    restore: () => {
      console.error = original.error;
      console.warn = original.warn;
    },
  };
};

/** Значок рисует `@nuxt/icon` и просит Nuxt-контекст: в тесте его заменяет простая `<i>`. */
const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup: props => () => h('i', { 'data-icon': props.name }),
});

/** Панели читают общее состояние сами, поэтому входов у них нет: монтируем рядом с сессией. */
const mountPanels = async problems => {
  const mounted = [];
  for (const [name, path] of PANELS) {
    try {
      const module = await import(/* @vite-ignore */ path);
      // у панели бывает асинхронная настройка (запрос пака героя): в приложении её держит Suspense
      const Host = defineComponent({
        name: `${name}Host`,
        setup: () => () => h(Suspense, null, { default: () => h(module.default) }),
      });
      mounted.push({
        name,
        // значок в шаблоне — автоподстановка `@nuxt/icon`, её настоящее имя `NuxtIcon`
        wrapper: mount(Host, {
          global: { stubs: { NuxtIcon: IconStub }, components: { Icon: IconStub } },
        }),
      });
    } catch (error) {
      const stack = (error?.stack ?? '').split('\n').slice(1, 4).join('\n');
      problems.push(`панель ${name} не смонтировалась: ${messageOf(error)}\n${stack}`);
    }
  }
  return mounted;
};

/** Что игрок видит и может нажать сейчас: от окна выбора к обычному ходу, минуя уже отказ. */
const visibleClick = (session, skip) => {
  const candidates = [];
  const freePlacementCells = (session.placementCells.value ?? [])
    .filter(cell => cell.occupied !== true)
    .map(cell => String(cell.id));
  const selected =
    session.selectedFighterId.value ??
    (session.myFighters.value ?? []).find(fighter => fighter.currentPosition != null)?.id ??
    null;

  const picked = new Set((session.choicePicked.value ?? []).map(String));
  const complete = session.choiceComplete.value === true;

  // окно вариантов: пока набор не собран — отмечаем **ещё не отмеченный** вариант, после — общая кнопка
  if (!complete) {
    for (const choice of [
      ...(session.choices.value ?? []),
      ...(session.targetingChoices.value ?? []),
    ]) {
      if (choice.disabled === true || picked.has(String(choice.optionId))) continue;
      candidates.push({
        kind: 'option',
        action: { kind: 'option', id: choice.optionId },
        run: () => session.onChoiceClick(choice.optionId),
      });
    }
  }

  if (session.ui.value?.pickFighters === true) {
    for (const fighterId of session.highlightedFighterIds.value ?? []) {
      candidates.push({
        kind: 'fighter',
        action: { kind: 'fighter', id: fighterId },
        run: () => session.onFighterClick({ fighterId }),
      });
    }
  }

  for (const cellId of session.highlightedCellIds.value ?? []) {
    if (selected == null) break;
    candidates.push({
      kind: 'cell',
      action: { kind: 'cell', id: cellId, fighterId: selected },
      run: async () => {
        if (session.selectedFighterId.value == null) {
          session.selectFighter(selected);
          await nextTick();
        }
        session.onCellClick(cellId);
      },
    });
  }

  if (session.isPlacement.value) {
    const fighter = (session.placementFighters.value ?? [])[0];
    for (const cell of freePlacementCells) {
      if (!fighter) break;
      candidates.push({
        kind: 'place',
        action: { kind: 'cell', id: cell, fighterId: fighter.id },
        run: async () => {
          session.selectFighter(fighter.id);
          await nextTick();
          session.onCellClick(cell);
        },
      });
    }
  }

  for (const card of session.myHand.value ?? []) {
    if (!session.isCardPlayable(card)) continue;
    const id = card.instanceId ?? card.id;
    candidates.push({
      kind: 'card',
      action: { kind: 'card', id },
      run: () => session.onCardClick(card),
    });
  }

  if (session.deckClickable.value === true) {
    candidates.push({ kind: 'deck', action: { kind: 'deck' }, run: () => session.onDeckClick() });
  }

  if (session.okControl.value?.enabled === true) {
    candidates.push({ kind: 'ok', action: { type: 'UI_OK' }, run: () => session.onFinishAction() });
  }

  return candidates.find(entry => !skip.has(keyOf(entry.action))) ?? null;
};

/** Молчащий клик: важно, чей это промах — клиента или движка (то же действие напрямую). */
const silentDetail = (state, engineActor, click, session) => {
  let engine;
  try {
    const next = runAction(state, { type: 'PICK', ...click.action, playerId: engineActor });
    engine =
      signature(next) === signature(state)
        ? 'движок тоже не меняет состояние'
        : 'движок действие применяет';
  } catch (error) {
    engine = `движок отказывает: ${messageOf(error)}`;
  }
  const ui = runUi(state, engineActor);
  const legal = actionsFor(state, engineActor, { policy: 'random' }).map(entry => entry.action);
  const snapshot = {
    hook: state.hook,
    actor: engineActor,
    turn: state.turn?.playerId,
    combat: state.combat?.stage ?? null,
    targeting: state.targeting ?? null,
    uiChoices: (ui.choices ?? []).map(entry => `${entry.optionId}${entry.disabled ? '*' : ''}`),
    uiSource: ui.source ?? null,
    legalOptions: legal.filter(action => action.kind === 'option'),
    legalCount: legal.length,
    choices: (session.choices.value ?? []).map(
      entry => `${entry.optionId}${entry.disabled ? '*' : ''}`,
    ),
    targetingChoices: (session.targetingChoices.value ?? []).map(entry => entry.optionId),
    sent: { type: 'PICK', ...click.action },
    error: session.error.value,
  };
  return `клик «${click.kind}» ничего не сделал и ничего не сказал: ${engine}\n${JSON.stringify(snapshot)}`;
};

export const runUiGame = async ({
  seed = 1,
  players = 4,
  maxSteps = 400,
  mode = 'table',
  testId = null,
} = {}) => {
  const { useGameView } = await import('~/composables/game/useGameView.js');
  const { useGameSession } = await import('~/composables/game/useGameSession.js');

  const id = testId ?? `ui_${players}_${seed}`;
  const log = [];
  const problems = [];
  const report = (status, detail, steps) => ({
    status,
    seed,
    players,
    steps,
    detail,
    log: [...log],
    problems: [...problems],
  });

  let host;
  try {
    createGame(
      { mapId: 'generated', mode, heroes: hotseatSlots(players, seed) },
      {
        testId: id,
        testSeed: seed,
      },
    );
    host = load(id);
  } catch (error) {
    return report('crash', `стол не собрался: ${messageOf(error)}`, 0);
  }
  if (!host) return report('crash', 'партия не сохранилась в реестре сервера', 0);

  const view = useGameView();
  view.__start(host, host.players[0].id);

  const consoleCapture = captureConsole();
  let session = null;
  let app = null;
  let panels = [];
  let steps = 0;

  try {
    const Host = defineComponent({
      setup() {
        session = useGameSession();
        return () => h('div');
      },
    });
    app = mount(Host);
    await nextTick();
    await flushPromises();

    panels = await mountPanels(problems);
    if (problems.length > 0) return report('render', problems[0], steps);

    const skip = new Set();
    let idleRun = 0;

    for (; steps < maxSteps; steps += 1) {
      const state = view.hostState.value;
      if (state == null) return report('crash', 'клиент потерял состояние партии', steps);
      if (state.hook === 'gameEnd') return report('finished', null, steps);

      const engineActor = actorOf(state);
      if (engineActor == null)
        return report('crash', 'движок не назвал действующего игрока', steps);

      if (String(session.you.value) !== String(engineActor)) {
        await session.onSwitchPlayer(engineActor);
        await flushPromises();
        await nextTick();
      }
      if (
        session.actingPlayerId.value != null &&
        String(session.actingPlayerId.value) !== String(engineActor)
      ) {
        return report(
          'acting',
          `клиент считает действующим ${session.actingPlayerId.value}, движок — ${engineActor}`,
          steps,
        );
      }

      const click = visibleClick(session, skip);
      if (!click) {
        const legal = actionsFor(state, engineActor, { policy: 'random' });
        const snapshot = {
          you: session.you.value,
          phase: session.phase.value,
          placement: session.isPlacement.value,
          placementFighters: (session.placementFighters.value ?? []).map(f => f.id),
          placementCells: (session.placementCells.value ?? []).map(
            c => `${c.id}${c.occupied ? '*' : ''}`,
          ),
          ok: session.okControl.value,
          back: session.backControl.value,
          highlighted: session.highlightedCellIds.value,
          pickFighters: session.ui.value?.pickFighters === true,
          hand: (session.myHand.value ?? []).length,
          playable: (session.myHand.value ?? []).filter(card => session.isCardPlayable(card))
            .length,
          deck: session.deckClickable.value,
          error: session.error.value,
          skipped: [...skip],
        };
        return report(
          'empty',
          legal.length > 0
            ? `клиент не показывает ни одного действия, а движок ждёт ход (вариантов ${legal.length}, движок видит: ${JSON.stringify(legal.slice(0, 3).map(entry => entry.action))})\n${JSON.stringify(snapshot)}`
            : 'тупик: движок тоже не видит ходов',
          steps,
        );
      }

      const before = signature(state);
      try {
        await click.run();
      } catch (error) {
        return report('crash', `клик «${click.kind}» упал: ${messageOf(error)}`, steps);
      }
      await flushPromises();
      await nextTick();
      await flushPromises();

      const after = signature(view.hostState.value);
      const message = session.error.value;
      if (after === before) {
        // клиент отказал словами — это не молчание, но этот путь больше не пробуем
        if (message) skip.add(keyOf(click.action));
        else {
          return report('silent', `${silentDetail(state, engineActor, click, session)}`, steps);
        }
      } else {
        skip.clear();
      }

      if (consoleCapture.records.length > 0) {
        return report('console', consoleCapture.records[0], steps);
      }

      log.push(click.action);
      idleRun = after === before ? idleRun + 1 : 0;
      if (idleRun >= 20)
        return report('stuck', 'двадцать кликов подряд не меняют состояние', steps);
    }

    return report('stuck', `партия не закончилась за ${maxSteps} кликов`, steps);
  } catch (error) {
    return report('crash', `исключение вне клика: ${messageOf(error)}`, steps);
  } finally {
    consoleCapture.restore();
    for (const panel of panels) panel.wrapper.unmount();
    app?.unmount();
    remove(id);
  }
};

export default runUiGame;
