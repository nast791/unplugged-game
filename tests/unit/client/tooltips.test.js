import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLTIPS } from '../../../app/constants/tooltips.js';

/**
 * Сторож словаря подсказок (`app/constants/tooltips.js`).
 *
 * Смысл словаря — «все тексты подсказок в одном файле», и держится он только договором: компонент может
 * снова написать строку у себя, и никто этого не заметит. Тест проверяет три вещи: ключи словаря и вызовы
 * в разметке совпадают один к одному, каждая подсказка возвращает непустую строку, а строковых
 * литералов в `text`/`:text` тултипа в исходниках не осталось.
 *
 * **Что считается текстом, а что нет.** Литерал в разметке — всегда текст подсказки, значит он обязан
 * жить в словаре. Выражение (`` :text="TOOLTIPS.…" ``) — это уже вычисление: словарь умеет собирать фразу
 * из контекста, поэтому такое выражение тест не разбирает. Исключение — `ATooltip` с слотом `content`:
 * там текст приходит из контента (умение героя, условие предмета) и в словарь не переводится.
 */

const appDir = new URL('../../../app/', import.meta.url);

/** Все `.vue` и `.js` приложения: ищем вызовы словаря и литералы в тултипах. */
const appFiles = (dir = appDir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : appFiles(url);
    return /\.(vue|js)$/.test(entry.name) ? [[url, readFileSync(url, 'utf8')]] : [];
  });

const source = appFiles();

/** Вызовы словаря в разметке и скриптах: `TOOLTIPS.playerCard.health(…)`. */
const callsIn = text =>
  [...text.matchAll(/TOOLTIPS\.([a-zA-Z]+)\.([a-zA-Z]+)/g)].map(match => `${match[1]}.${match[2]}`);

/** Пути словаря: `playerCard.health` и так далее. */
const dictPaths = Object.entries(TOOLTIPS).flatMap(([group, entries]) =>
  Object.keys(entries).map(key => `${group}.${key}`),
);

describe('словарь подсказок интерфейса', () => {
  it('каждая подсказка словаря используется — и наоборот', () => {
    const used = [...new Set(source.flatMap(([, text]) => callsIn(text)))];
    const unused = dictPaths.filter(path => !used.includes(path));
    const missing = used.filter(path => !dictPaths.includes(path));

    expect(unused).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('в разметке не осталось строк-подсказок', () => {
    const inline = [];
    for (const [url, text] of source) {
      const name = url.pathname.split('/app/')[1];
      // Атрибут `text` со строкой или шаблоном рядом — признак текста, который живёт в компоненте
      for (const match of text.matchAll(/(?<!:)\btext="([^"]*)"/g)) {
        inline.push(`${name}: ${match[0]}`);
      }
    }

    expect(inline).toEqual([]);
  });

  it('каждая подсказка — непустая строка, подстановки заполнены', () => {
    const sample = {
      'playerCard.fighter': { name: 'Амат', hp: '8/8' },
      'playerCard.fighterStats': { move: 2, attackRange: 2 },
      'playerCard.heroSkill': { title: 'Взгляд Медузы', text: 'НАЧАЛО ХОДА: …' },
      'playerCard.player': { name: 'Элизиф' },
      'playerCard.actions': { left: 2, total: 3, bonus: 1 },
      'playerCard.health': { hp: '15/16' },
      'playerCard.item': { name: 'Пелена', state: 'активна' },
      'playerCard.squad': { name: 'Амат', hp: '8/8' },
      'playerCard.handCount': { count: 5 },
      'playerCard.deckCount': { count: 24 },
      'playerCard.discardCount': { count: 3 },
      'card.type': { label: 'Атака' },
      'card.bonus': { bonus: 2 },
      'card.fighter': { name: 'Гарпия' },
      'card.copies': { count: 3 },
      'deck.count': { count: 12 },
      'discard.count': { count: 3 },
      'discard.bonusCard': { bonus: 2 },
      'profile.currency': { label: '12 500' },
      'heroDetails.item': { condition: 'Пока Амат жива' },
      'tableSetup.heroPage': { name: 'Медуза' },
      'placementTray.moveFighter': { name: 'Амат' },
    };

    const broken = [];
    for (const [group, entries] of Object.entries(TOOLTIPS)) {
      for (const [key, hint] of Object.entries(entries)) {
        const path = `${group}.${key}`;
        const value = hint(sample[path] ?? {});
        if (typeof value !== 'string' || value.trim() === '' || value.includes('undefined')) {
          broken.push(`${path}: ${JSON.stringify(value)}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });

  it('подсказки карточки с ветками не оставляют пустого хвоста', () => {
    // добавленные действия меняют фразу, а не дописывают пустые скобки
    expect(TOOLTIPS.playerCard.actions({ left: 2, total: 2, bonus: 0 })).toBe(
      'Осталось действий: 2 из 2',
    );
    expect(TOOLTIPS.playerCard.actions({ left: 2, total: 3, bonus: 1 })).toContain(
      '(+1 в этом ходу)',
    );
    // у умения без названия фраза не начинается с двоеточия
    expect(TOOLTIPS.playerCard.heroSkill({ title: '', text: 'НАЧАЛО ХОДА' })).toBe('НАЧАЛО ХОДА');
    // у предмета без состояния остаётся только имя
    expect(TOOLTIPS.playerCard.item({ name: 'Пелена', state: '' })).toBe('Пелена');
  });
});
