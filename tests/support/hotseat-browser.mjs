#!/usr/bin/env node
/**
 * Браузерный обход экрана партии: настоящий Chrome, живое приложение, клики по канве.
 * Запуск: `node tests/support/hotseat-browser.mjs --steps=40`, разбор — `--seed=5 --headful`.
 * Приложение поднимается dev-сервером (текущий код); `--built` берёт готовую сборку `.output`.
 *
 * Что делает: поднимает приложение (готовую сборку `.output`, иначе `pnpm dev`), собирает партию на
 * четырёх людей через API, кладёт состояние в `sessionStorage` вкладки — и дальше играет **как человек**:
 * жмёт полку расстановки, клетки на канве, карты в руке, стопки и общие кнопки. После каждого шага
 * снимает состояние и скриншот.
 *
 * Что считает находкой: консоль и падения страницы, отсутствие подсказки там, где движок ждёт ход,
 * клик без последствий и без ответа, потеря связи с партией (404), зависание. Скриншоты — в
 * `.workbuddy/browser/<сид>/`.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { runUi } from '#shared/publicApi.js';
import { actorOf } from '../../bot/play/decide.js';
import { hotseatSlots } from '../../bot/play/hotseat.js';

const ROOT = join(import.meta.dirname, '..', '..');
const BASE = process.env.GAME_URL ?? 'http://localhost:3000';
const STORAGE_KEY = 'unplugged:party:host';

const numberArg = (name, fallback = null) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  if (found == null) return fallback;
  const value = Number(found.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
};

const seed = numberArg('seed', 1);
const players = numberArg('players', 4);
const steps = numberArg('steps', 40);
const headful = process.argv.includes('--headful');
const shotsDir = join(ROOT, '.workbuddy', 'browser', String(seed));

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const browserPath = BROWSERS.find(path => existsSync(path));
if (!browserPath) {
  console.error('не нашла Chrome/Edge: укажи путь в CHROME_PATH');
  process.exit(1);
}

const alive = async () => {
  try {
    const response = await fetch(`${BASE}/api/content/setup`);
    return response.ok;
  } catch {
    return false;
  }
};

const server = async () => {
  if (await alive()) return null; // приложение уже поднято — чужой процесс не трогаем

  const built = join(ROOT, '.output', 'server', 'index.mjs');
  // по умолчанию поднимаем dev: сборка `.output` может быть старой, а обход должен видеть текущий код
  const useDev = !process.argv.includes('--built') || !existsSync(built);
  const command = useDev ? 'pnpm' : process.execPath;
  const args = useDev ? ['dev'] : [built];
  const child = spawn(command, args, { cwd: ROOT, stdio: 'ignore', shell: useDev });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await alive()) return child;
    await sleep(500);
  }
  child.kill();
  throw new Error(`приложение не поднялось на ${BASE}`);
};

const createParty = async () => {
  const response = await fetch(`${BASE}/api/game/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mapId: 'generated',
      mode: 'table',
      heroes: hotseatSlots(players, seed),
    }),
  });
  if (!response.ok) throw new Error(`партия не собралась: ${response.status}`);
  return response.json();
};

/** Границы поля по клеткам: половина клетки (112) — тот же запас, что у вписывания доски. */
const boundsOf = nodes => {
  const xs = (nodes ?? []).map(node => Number(node.x)).filter(Number.isFinite);
  const ys = (nodes ?? []).map(node => Number(node.y)).filter(Number.isFinite);
  const pad = 56;
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad,
  };
};

/**
 * Точка на экране по клетке: та же вписанная проекция, что считает `useBoardView` — карта вписана в поле
 * целиком с отступом `pad` по краям (`data-gap` у доски), а панели лежат поверх неё.
 */
const pointOf = (rect, bounds, cell, pad = 0) => {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const area = {
    width: Math.max(rect.width - pad * 2, 1),
    height: Math.max(rect.height - pad * 2, 1),
  };
  const scale = Math.min(area.width / width, area.height / height, 4);
  return {
    x: rect.left + pad + (area.width - width * scale) / 2 - bounds.minX * scale + Number(cell.x) * scale,
    y: rect.top + pad + (area.height - height * scale) / 2 - bounds.minY * scale + Number(cell.y) * scale,
  };
};

/** Отступ вписывания в пикселях: его считает доска из единицы сетки (`--spacing`). */
const boardPad = page =>
  page.evaluate(() => Number(document.querySelector('[data-board]')?.dataset.gap) || 0);

const canvasRect = page =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });

const hostState = page =>
  page.evaluate(key => {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);

/** Пиксели вокруг точки: выбор бойца состояния не меняет, но доска перерисовывается — это ловим тут. */
const peekCanvas = async (page, point) => {
  const rect = await canvasRect(page);
  const left = Math.round(point.x - rect.left - 40);
  const top = Math.round(point.y - rect.top - 40);
  return page.evaluate(
    ({ left, top }) => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas?.getContext?.('2d');
      if (!ctx) return null;
      const x = Math.max(0, Math.min(left, canvas.width - 80));
      const y = Math.max(0, Math.min(top, canvas.height - 80));
      return [...ctx.getImageData(x, y, 80, 80).data].join(',');
    },
    { left, top },
  );
};

/** Что под точкой клика: панель, перекрывшая клетку, иначе клик уходит мимо доски. */
const elementAt = (page, point) =>
  page.evaluate(
    ({ x, y }) => {
      const node = document.elementFromPoint(x, y);
      if (!node) return '—';
      const box = node.closest?.('[data-board], section, button, [role="dialog"]') ?? node;
      return `${node.tagName}.${String(node.className).slice(0, 40)} → ${box.tagName}.${String(box.className).slice(0, 40)}`;
    },
    { x: Math.round(point.x), y: Math.round(point.y) },
  );

/** Открытое окно поверх партии: клик по доске до него не дойдёт. */
const openDialog = page =>
  page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"], [data-esc-layer]');
    return dialog ? document.body.innerText.replace(/\s+/g, ' ').slice(0, 120) : null;
  });

const start = Date.now();
const child = await server();
rmSync(shotsDir, { recursive: true, force: true });
mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch({ executablePath: browserPath, headless: !headful });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
const log = [];

page.on('pageerror', error => problems.push(`падение страницы: ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error') problems.push(`консоль: ${message.text()}`);
});

try {
  const party = await createParty();
  const gameId = party.host?.id;
  const playerId = String(party.host?.players?.[0]?.id ?? '');
  if (!gameId) throw new Error('ответ сборки без состояния партии');

  await page.addInitScript(
    ([key, host]) => sessionStorage.setItem(key, JSON.stringify(host)),
    [STORAGE_KEY, party.host],
  );
  await page.goto(`${BASE}/game?gameId=${gameId}&playerId=${playerId}`, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await sleep(600);

  const blank = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return 'нет 2d-контекста';
    const x = Math.round(canvas.width / 2) - 100;
    const y = Math.round(canvas.height / 2) - 100;
    const spot = ctx.getImageData(Math.max(0, x), Math.max(0, y), 200, 200).data;
    return spot.some((value, index) => index % 4 === 3 && value > 0) ? null : 'канва пустая';
  });
  if (blank) problems.push(`доска не нарисовалась: ${blank}`);

  let step = 0;
  let repeats = 0;
  let idle = 0;
  let lastKey = '';
  const selection = new Map();
  const selectTries = new Map();
  for (; step < steps; step += 1) {
    const state = await hostState(page);
    if (state == null) {
      problems.push('клиент потерял состояние партии (sessionStorage пуст)');
      break;
    }
    if (state.hook === 'gameEnd') break;

    const actor = actorOf(state);
    if (actor == null) {
      problems.push('движок не назвал действующего игрока');
      break;
    }
    const actorPlayer = (state.players ?? []).find(entry => String(entry.id) === String(actor));
    const placement = state.hook === 'gameStart';

    // выбор бойца — состояние клиента: он считает `ui` сам, с выбранным бойцом
    const alive = (actorPlayer?.fighters ?? []).filter(fighter => Number(fighter.currentHp) > 0);
    if (
      !selection.has(actor) ||
      !alive.some(fighter => String(fighter.id) === selection.get(actor))
    ) {
      selection.set(
        actor,
        placement
          ? null
          : String(
              alive.find(fighter => fighter.currentPosition != null)?.id ?? alive[0]?.id ?? '',
            ),
      );
    }
    const ui = runUi(state, actor, { selectedFighterId: selection.get(actor) }) ?? {};
    const rect = await canvasRect(page);
    const pad = await boardPad(page);
    const bounds = boundsOf(state.map?.nodes ?? []);
    const unplaced = (actorPlayer?.fighters ?? []).filter(
      fighter => fighter.currentPosition == null,
    );
    const logBefore = [...log];
    let beforePeek = null;
    let lastPoint = null;

    let clicked = null;

    // 1. расстановка: полка бойца, затем свободная клетка области
    const freePlacement = (ui.placementCells ?? []).filter(cell => cell.occupied !== true);

    if (unplaced.length > 0 && freePlacement.length > 0) {
      const fighterId = String(unplaced[0].id);
      const avatar = `[data-placement-fighter="${fighterId}"]`;
      if ((await page.locator(avatar).count()) > 0) {
        await page.locator(avatar).first().click();
        await sleep(120);
      }
      const cell = (state.map?.nodes ?? []).find(
        node => String(node.id) === String(freePlacement[0].id),
      );
      if (cell && rect) {
        const point = pointOf(rect, bounds, cell, pad);
        beforePeek = await peekCanvas(page, point);
        lastPoint = point;
        await page.mouse.click(point.x, point.y);
        clicked = { kind: 'place', cell: cell.id, fighterId };
      }
    }

    // 2. выбор бойца кликом по канве: движок ждёт именно клика по бойцу (бой, окно цели)
    const highlightedFighters = ui.highlightedFighterIds ?? [];
    // «выбрать бойца» бывает там, где дальше кликают клетку: перемещение и расстановка.
    // Каждого подсвеченного пробуем один раз: у окна эффекта двигают не того, кого выбрал клиент.
    const tried = selectTries.get(actor) ?? new Set();
    selectTries.set(actor, tried);
    const tryFighter = highlightedFighters.map(String).find(id => !tried.has(id)) ?? null;
    const needsSelect =
      ui.pickFighters !== true &&
      (ui.highlightedCellIds ?? []).length === 0 &&
      ['movement', 'place'].includes(String(ui.phase)) &&
      tryFighter != null;
    if (!clicked && (ui.pickFighters === true || needsSelect) && highlightedFighters.length > 0) {
      const fighterId = String(ui.pickFighters === true ? highlightedFighters[0] : tryFighter);
      const fighter = (state.players ?? [])
        .flatMap(entry => entry.fighters ?? [])
        .find(entry => String(entry.id) === fighterId);
      const cell = (state.map?.nodes ?? []).find(
        node => String(node.id) === String(fighter?.currentPosition),
      );
      if (cell && rect) {
        const point = pointOf(rect, bounds, cell, pad);
        beforePeek = await peekCanvas(page, point);
        lastPoint = point;
        await page.mouse.click(point.x, point.y);
        clicked = { kind: ui.pickFighters === true ? 'fighter' : 'select', fighterId };
        if (ui.pickFighters !== true) {
          selection.set(actor, fighterId);
          tried.add(fighterId);
        }
      }
    }

    // 3. клетка: боец уже выбран (сессия выбирает сама)
    if (!clicked && (ui.highlightedCellIds ?? []).length > 0) {
      const cellId = String((ui.highlightedCellIds ?? [])[0]);
      const cell = (state.map?.nodes ?? []).find(node => String(node.id) === cellId);
      if (cell && rect) {
        const point = pointOf(rect, bounds, cell, pad);
        beforePeek = await peekCanvas(page, point);
        lastPoint = point;
        await page.mouse.click(point.x, point.y);
        clicked = { kind: 'cell', cellId };
      }
    }

    // 4. карта из руки
    if (!clicked) {
      const key = String((ui.playableCardIds ?? [])[0] ?? '');
      const card = page.locator(`[data-hand-card][data-card-key="${key}"]`);
      if (key && (await card.count()) > 0) {
        await card.first().click();
        clicked = { kind: 'card', key };
      }
    }

    // 5. стопки
    if (!clicked && ui.deck?.clickable === true) {
      const deck = page.locator('[data-card-anchor="deck"]');
      if ((await deck.count()) > 0) {
        await deck.first().click();
        clicked = { kind: 'deck' };
      }
    }

    // 6. общая кнопка (подтвердить / закончить): ищем по метке, иначе по подписи движка
    if (!clicked && ui.controls?.ok?.enabled === true) {
      const control = page.locator('[data-ok-control]:visible');
      if ((await control.count()) > 0) {
        await control.first().click();
        clicked = { kind: 'ok' };
      } else {
        const labels = [
          String(ui.controls.ok.label ?? '').trim(),
          'ОК',
          'Подтвердить',
          'Закончить действие',
          'Закончить эффект',
          'Завершить умение',
        ].filter(Boolean);
        for (const label of labels) {
          const button = page.getByRole('button', { name: label, exact: false });
          if ((await button.count()) > 0) {
            await button.first().click();
            clicked = { kind: 'ok', label };
            break;
          }
        }
      }
    }

    if (!clicked) {
      const hint = String(ui.hint ?? '');
      const buttons = (await page.locator('button').allInnerTexts())
        .map(text => text.trim())
        .filter(Boolean);
      problems.push(
        `шаг ${step}: человеку нечего нажать (фаза ${state.hook}, подсказка «${hint}», ` +
          `подсветка клеток ${(ui.highlightedCellIds ?? []).length}, бойцов ${(ui.highlightedFighterIds ?? []).length}, ` +
          `карт ${(ui.playableCardIds ?? []).length}, controls ${JSON.stringify(ui.controls ?? null)}, ` +
          `кнопки на экране: ${JSON.stringify(buttons)})`,
      );
      await page.screenshot({
        path: join(shotsDir, `step-${String(step).padStart(2, '0')}-empty.png`),
      });
      break;
    }

    await sleep(250);

    const after = await hostState(page);
    // выбор бойца состояние не меняет — его видно по перерисовке доски под точкой клика
    const drawn =
      beforePeek != null && lastPoint != null
        ? (await peekCanvas(page, lastPoint)) !== beforePeek
        : false;
    const changed = JSON.stringify(after) !== JSON.stringify(state) || drawn;
    const key = JSON.stringify(clicked);
    log.push(clicked);

    if (step % 5 === 0 || !changed) {
      await page.screenshot({ path: join(shotsDir, `step-${String(step).padStart(2, '0')}.png`) });
    }

    if (!changed) {
      // «выбрать бойца» состояние не меняет — считаем повторы одного и того же клика и общий застой
      repeats = key === lastKey ? repeats + 1 : 0;
      idle += 1;
      const blocked = lastPoint == null ? null : await elementAt(page, lastPoint);
      const dialog = await openDialog(page);
      if (dialog) await page.keyboard.press('Escape');
      if (repeats >= 3 && clicked?.kind !== 'select') {
        const seen = (await page.evaluate(() => document.body.innerText))
          .replace(/\s+/g, ' ')
          .slice(0, 400);
        problems.push(
          `шаг ${step}: один и тот же клик ${JSON.stringify(clicked)} повторяется впустую; ` +
            `под точкой: ${blocked}; открытое окно: ${dialog ? `«${dialog}»` : 'нет'}; ` +
            `на экране: «${seen}»`,
        );
        await page.screenshot({
          path: join(shotsDir, `step-${String(step).padStart(2, '0')}-stuck.png`),
        });
        break;
      }
      if (idle >= 25) {
        problems.push(`шаг ${step}: двадцать пять кликов подряд не меняют состояние партии`);
        break;
      }
    } else {
      repeats = 0;
      idle = 0;
    }
    lastKey = key;

    if (log.length === logBefore.length) {
      problems.push(`шаг ${step}: клик не учтён (${JSON.stringify(clicked)})`);
      break;
    }

    const hintText = String(ui.hint ?? '').trim();
    if (!hintText) {
      problems.push(
        `шаг ${step}: движок ждёт ход, а подсказки на экране нет (${JSON.stringify(clicked)})`,
      );
      break;
    }
  }

  const finalState = await hostState(page);
  console.log(`браузерный обход: сид ${seed}, мест ${players}, шагов ${step}`);
  console.log(
    `состояние: hook ${finalState?.hook ?? '—'}, ход ${finalState?.turn?.playerId ?? '—'}`,
  );
  console.log(`скриншоты: ${shotsDir}`);
} catch (error) {
  problems.push(`исключение обхода: ${error instanceof Error ? error.message : error}`);
} finally {
  await browser.close();
  child?.kill();
}

console.log(`время: ${((Date.now() - start) / 1000).toFixed(1)} с`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`находка: ${problem}`);
  process.exit(1);
}
console.log('находок нет: экран играется, подсказки на месте, консоль чистая');
