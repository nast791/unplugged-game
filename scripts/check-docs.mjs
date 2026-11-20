#!/usr/bin/env node
// Проверка документации UnPlugged: карта AGENTS.md, frontmatter правил (.mdc) и скилов,
// живые относительные ссылки. Запуск: `node scripts/check-docs.mjs`.
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const docsDir = path.join(root, '.docs');
const agentsFile = path.join(root, 'AGENTS.md');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.nuxt',
  '.output',
  '.data',
  '.workbuddy',
  '.refs',
  'trainer',
]);

const DOC_EXTENSIONS = new Set(['.md', '.mdc']);
const RELATIVE_LINK = /\]\(((?:\.docs|\.\.?)\/[^)\s]*)\)/g;

const errors = [];

const toPosix = file => file.split(path.sep).join('/');
const projectPath = file => toPosix(path.relative(root, file));
const mention = (lines, needle) => lines.some(line => line.includes(needle));

async function exists(target) {
  return fsp.access(target).then(
    () => true,
    () => false,
  );
}

async function readText(file) {
  return fsp.readFile(file, 'utf8').catch(() => null);
}

async function walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^\uFEFF/, ''));
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([a-zA-Z-]+):\s*(.*)$/.exec(line);
    if (pair) fields[pair[1]] = pair[2].trim();
  }
  return fields;
}

// Файлы, которые в карте не ищутся по пути: индекс документации и скилы (они живут таблицей).
function isSkillIndex(relative) {
  return (
    relative === '.docs/README.md' ||
    relative === '.docs/skills/README.md' ||
    /^\.docs\/skills\/[^/]+\/SKILL\.md$/.test(relative)
  );
}

function mentionErrors(agentsLines, docs) {
  const problems = [];
  for (const doc of docs) {
    if (isSkillIndex(doc.relative)) continue;
    if (mention(agentsLines, doc.relative)) continue;
    const dir = path.posix.dirname(doc.relative);
    // Каталог засчитывается только файлам из подкаталогов: `.docs/` в карте есть всегда.
    if (dir !== '.docs' && mention(agentsLines, `${dir}/`)) continue;
    problems.push(`${doc.relative}: не упомянут в AGENTS.md (ни путь файла, ни путь каталога)`);
  }
  return problems;
}

async function skillsDirErrors(agentsLines) {
  if (!(await exists(path.join(docsDir, 'skills')))) return [];
  if (mention(agentsLines, '.docs/skills')) return [];
  return ['.docs/skills: каталог скилов не упомянут в AGENTS.md'];
}

function ruleFrontmatterErrors(docs) {
  const problems = [];
  for (const doc of docs) {
    if (path.extname(doc.file) !== '.mdc') continue;
    const meta = frontmatter(doc.content);
    if (!meta) {
      problems.push(`${doc.relative}: нет frontmatter (--- description/alwaysApply ---)`);
      continue;
    }
    if (!meta.description) problems.push(`${doc.relative}: пустой description`);
    const alwaysApply = (meta.alwaysApply ?? '').toLowerCase();
    if (alwaysApply !== 'true' && alwaysApply !== 'false') {
      problems.push(
        `${doc.relative}: alwaysApply должен быть true или false, а не "${meta.alwaysApply ?? ''}"`,
      );
    }
  }
  return problems;
}

function skillFrontmatterErrors(docs) {
  const problems = [];
  for (const doc of docs) {
    if (path.basename(doc.file) !== 'SKILL.md') continue;
    const dirName = path.basename(path.dirname(doc.file));
    const meta = frontmatter(doc.content);
    if (!meta) {
      problems.push(`${doc.relative}: нет frontmatter (name/description)`);
      continue;
    }
    if (meta.name !== dirName) {
      problems.push(
        `${doc.relative}: name "${meta.name ?? ''}" не совпадает с каталогом "${dirName}"`,
      );
    }
    if (!meta.description) problems.push(`${doc.relative}: пустой description`);
  }
  return problems;
}

async function linkErrors(entries) {
  const problems = [];
  for (const entry of entries) {
    for (const match of entry.content.matchAll(RELATIVE_LINK)) {
      const raw = match[1];
      const target = raw.split('#')[0];
      if (!target) continue;
      if (await exists(path.resolve(path.dirname(entry.file), target))) continue;
      problems.push(`${entry.relative}: ссылка ${raw} не найдена`);
    }
  }
  return problems;
}

async function main() {
  if (!(await exists(docsDir))) {
    console.error('❌ .docs не найден в корне проекта: проверять нечего');
    process.exit(1);
  }

  const docs = [];
  for (const file of await walk(docsDir)) {
    if (!DOC_EXTENSIONS.has(path.extname(file))) continue;
    const content = await readText(file);
    if (content === null) {
      errors.push(`${projectPath(file)}: файл не прочитан`);
      continue;
    }
    docs.push({ file, relative: projectPath(file), content });
  }

  const agentsText = await readText(agentsFile);
  const agentsLines = agentsText === null ? [] : agentsText.split(/\r?\n/);

  if (agentsText === null) {
    errors.push('AGENTS.md не найден в корне проекта: карту проверять не по чему');
  } else {
    errors.push(...mentionErrors(agentsLines, docs));
    errors.push(...(await skillsDirErrors(agentsLines)));
  }

  errors.push(...ruleFrontmatterErrors(docs));
  errors.push(...skillFrontmatterErrors(docs));

  const linkEntries = docs
    .filter(doc => path.extname(doc.file) === '.md')
    .map(doc => ({ file: doc.file, relative: doc.relative, content: doc.content }));
  if (agentsText !== null) {
    linkEntries.push({ file: agentsFile, relative: 'AGENTS.md', content: agentsText });
  }
  errors.push(...(await linkErrors(linkEntries)));

  for (const error of errors) console.error(`❌ ${error}`);

  const checked = docs.length + (agentsText === null ? 0 : 1);
  const summary = `файлов ${checked}, ошибок ${errors.length}`;

  if (errors.length) {
    console.error(`\n❌ проверка документации: ${summary}`);
    process.exit(1);
  }

  console.log(`✅ проверка документации: ${summary}`);
}

await main();
