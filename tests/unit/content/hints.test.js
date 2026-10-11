import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HINTS } from '#shared/constants/hints.js';
import { lifecycleHooks } from '#shared/lifecycle/registry.js';

/**
 * Сторож словаря подсказок (`shared/constants/hints.js`).
 *
 * Смысл словаря — «все тексты подсказок в одном файле», и держится он только договором: фаза может
 * снова написать строку у себя, и никто этого не заметит. Тест проверяет три вещи: ключи словаря и фаз
 * совпадают, у статической подсказки в фазе стоит ссылка на словарь (а не своя копия текста), и в
 * исходниках фаз нет строковых литералов в `text:`.
 *
 * Подсказки окна умения (`choose.skillWindow`) — исключение: текст приходит из пака героя, поэтому
 * значение словаря только приводит его к строке и в фазе стоит обёртка.
 */

/** Фазы всех хуков: `hooks[turn].phases` — массив бриков, у каждого своё `hints`. */
const phases = () => [...new Set(Object.values(lifecycleHooks).flatMap(hook => hook.phases ?? []))];

/** Функции без параметров — статические подсказки: в фазе они должны стоять по ссылке. */
const isStatic = hint => typeof hint === 'function' && hint.length === 0;

describe('словарь подсказок', () => {
  it('у каждой подсказки фазы есть строка в словаре — и наоборот', () => {
    const fromPhases = {};
    for (const phase of phases()) {
      for (const key of Object.keys(phase.hints ?? {})) {
        fromPhases[`${phase.name}.${key}`] = true;
      }
    }

    const fromDict = [];
    for (const [group, entries] of Object.entries(HINTS)) {
      // `client` — подсказки клиента, их движок не отдаёт: у фаз их нет по определению
      if (group === 'client') continue;
      for (const key of Object.keys(entries)) fromDict.push(`${group}.${key}`);
    }

    expect(fromDict.filter(path => !fromPhases[path])).toEqual([]);
    expect(Object.keys(fromPhases).filter(path => !fromDict.includes(path))).toEqual([]);
  });

  it('статическая подсказка в фазе — ссылка на словарь, а не своя копия', () => {
    const own = [];
    for (const phase of phases()) {
      for (const [key, hint] of Object.entries(phase.hints ?? {})) {
        const text = HINTS[phase.name]?.[key];
        if (!isStatic(text)) continue;
        if (hint.text !== text) own.push(`${phase.name}.${key}`);
      }
    }

    expect(own).toEqual([]);
  });

  it('в исходниках фаз не осталось строк-подсказок', () => {
    const dir = new URL('../../../shared/phases/', import.meta.url);
    const files = readdirSync(dir).filter(file => file.endsWith('.js'));

    const inline = [];
    for (const file of files) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      // `text:` со строкой или шаблоном рядом — признак текста, который живёт в фазе
      for (const match of source.matchAll(/text:\s*(?:\([^)]*\)\s*=>\s*)?['"`]/g)) {
        inline.push(`${file}: ${match[0].trim()}`);
      }
    }

    expect(inline).toEqual([]);
  });

  it('тексты словаря — непустые строки, а подстановки заполнены', () => {
    const sample = {
      'choose.skillWindow': { text: 'Обменяйте Дороти и Тото' },
      'handLimit.discardCards': { limit: 5, count: 2 },
      'attack.waitingDefense': { name: 'Медуза' },
      'waiting.waitingMovement': { name: 'Медуза' },
      'waiting.waitingChoice': { name: 'Медуза' },
      'waiting.waitingTurn': { name: 'Тесла' },
      'finished.finished': { name: 'Дороти' },
      'client.timerExpired': { limit: '30 с' },
      'client.placementExpired': { limit: '2 мин' },
    };

    const empty = [];
    for (const [group, entries] of Object.entries(HINTS)) {
      for (const [key, hint] of Object.entries(entries)) {
        const path = `${group}.${key}`;
        const value = hint(sample[path] ?? {});
        if (typeof value !== 'string' || value.trim() === '' || value.includes('undefined')) {
          empty.push(`${path}: ${JSON.stringify(value)}`);
        }
      }
    }

    expect(empty).toEqual([]);
  });

  it('в подсказке с ветками каждый вариант — непустая строка', () => {
    const branches = {
      'choose.pickTarget': [{ cells: true }, { cells: false }],
      'movement.moveFighters': [{ fromEffect: true }, { fromEffect: false }],
      'defense.effectOption': [{ required: true }, { required: false }],
      'defense.effectTarget': [
        { cells: true, required: true },
        { cells: true, required: false },
        { cells: false, required: true },
        { cells: false, required: false },
      ],
      'defense.combatChoice': [{ movement: true }, { movement: false }],
      'defense.defend': [{ afterCancel: true }, { afterCancel: false }],
    };

    const broken = [];
    for (const [path, variants] of Object.entries(branches)) {
      const [group, key] = path.split('.');
      for (const context of variants) {
        const value = HINTS[group][key](context);
        if (typeof value !== 'string' || value.trim() === '')
          broken.push(`${path} ${JSON.stringify(context)}`);
      }
    }

    expect(broken).toEqual([]);
  });
});
