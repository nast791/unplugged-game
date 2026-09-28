

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { parse } from '@vue/compiler-dom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');
const GLOB = process.argv.find((a) => a.startsWith('--glob='))?.slice(7) ?? 'app/**/*.vue';

const CONTAIN_RE = /\bcontain-(?:none|content|strict|size|inline-size|layout|paint|style)\b/;
const SKIP_TAGS = new Set([
  'template',
  'slot',
  'Teleport',
  'Transition',
  'TransitionGroup',
  'Suspense',
  'ClientOnly',
  'NuxtLayout',
  'NuxtPage',
  'Html',
  'Body',
  'KeepAlive',
]);

const hasContain = (classes) => CONTAIN_RE.test(classes);

const hasOverflowClip = (classes) => /\boverflow-(?:hidden|clip)\b/.test(classes);

const hasBackdropBlur = (classes) => /\bbackdrop-blur/.test(classes);

const hasExplicitHeight = (classes) =>
  /\b(?:h|min-h|max-h|size)-(?:\d+|full|screen|dvh|svh|lvh|\[)/.test(classes) ||
  /\b(?:sm|md|lg|xl|max-lg|max-md|min-lg|min-\[[^\]]+\]|lg|md|sm|xl):(?:h|min-h|max-h|size)-/.test(classes) ||
  /\binset-0\b/.test(classes) ||
  /\binset-x-0\b/.test(classes);

const isPositionedLayer = (classes) => /\b(?:absolute|fixed)\b/.test(classes);

const isInteractiveOverlay = (tag, classes) =>
  tag === 'button' && /\bfixed\b/.test(classes) && /\binset-/.test(classes);

const getStaticClass = (props) => {
  const parts = [];
  for (const prop of props) {
    if (prop.type === 6 && prop.name === 'class') {
      parts.push(prop.value.content);
    }
  }
  return parts.join(' ');
};

const getAttr = (props, name) =>
  props.find((p) => p.type === 6 && p.name === name)?.value?.content;

const hasDynamicClass = (props) => props.some((p) => p.name === 'class' && p.type !== 6);

const shouldAddContainContent = (tag, classes) => {
  if (hasContain(classes)) return false;
  if (!['section', 'article', 'aside', 'footer'].includes(tag)) return false;
  if (!hasOverflowClip(classes)) return false;
  return true;
};

const shouldAddContainPaint = (tag, classes, props) => {
  if (hasContain(classes)) return false;
  if (hasBackdropBlur(classes)) return false;
  if (isInteractiveOverlay(tag, classes)) return false;
  if (!isPositionedLayer(classes)) return false;
  if (!hasExplicitHeight(classes)) return false;

  const ariaHidden = getAttr(props, 'aria-hidden') === 'true';
  const pointerEventsNone = /\bpointer-events-none\b/.test(classes);
  const alt = getAttr(props, 'alt');
  const isDecorativeImage =
    (tag === 'img' || tag === 'NuxtImg' || tag === 'NuxtPicture') && alt === '';

  if (ariaHidden || pointerEventsNone || isDecorativeImage) return true;

  if (/\binset-0\b/.test(classes) && isDecorativeImage) return true;

  return false;
};

const pickContainClass = (tag, classes, props) => {
  if (shouldAddContainContent(tag, classes)) return 'contain-content';
  if (shouldAddContainPaint(tag, classes, props)) return 'contain-paint';
  return null;
};

const extractTemplate = (source, filename) => {
  const { descriptor, errors } = parseSfc(source, { filename });
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
  if (!descriptor.template?.content) return null;
  return {
    content: descriptor.template.content,
    start: descriptor.template.loc.start.offset,
  };
};

const walk = (nodes, visit) => {
  for (const node of nodes) {
    if (node.type !== 1) continue;
    visit(node);
    if (node.children?.length) walk(node.children, visit);
  }
};

const collectEdits = (template, templateStart) => {
  const edits = [];

  let ast;
  try {
    ast = parse(template, { comments: false });
  } catch (error) {
    return { edits, error };
  }

  walk(ast.children, (node) => {
    const tag = node.tag;
    if (SKIP_TAGS.has(tag)) return;
    if (hasDynamicClass(node.props)) return;

    const classes = getStaticClass(node.props);
    if (!classes) return;

    const containClass = pickContainClass(tag, classes, node.props);
    if (!containClass) return;

    for (const prop of node.props) {
      if (prop.type !== 6 || prop.name !== 'class') continue;
      if (prop.value.content.includes(containClass)) continue;

      const innerStart = templateStart + prop.value.loc.start.offset + 1;
      const innerEnd = templateStart + prop.value.loc.end.offset - 1;
      edits.push({
        start: innerStart,
        end: innerEnd,
        before: prop.value.content,
        after: `${prop.value.content} ${containClass}`,
        tag,
        containClass,
        line: prop.loc.start.line,
      });
    }
  });

  return { edits, error: null };
};

const applyEdits = (source, edits) => {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.after + result.slice(edit.end);
  }
  return result;
};

const run = async () => {
  const files = await fg(GLOB, { cwd: ROOT, absolute: true, onlyFiles: true });
  let changedFiles = 0;
  let totalEdits = 0;
  const report = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let template;
    try {
      template = extractTemplate(source, file);
    } catch (error) {
      report.push({ file: path.relative(ROOT, file), error: error.message });
      continue;
    }
    if (!template) continue;

    const { edits, error } = collectEdits(template.content, template.start);
    if (error) {
      report.push({ file: path.relative(ROOT, file), error: error.message });
      continue;
    }
    if (!edits.length) continue;

    const rel = path.relative(ROOT, file);
    for (const edit of edits) {
      report.push({
        file: rel,
        line: edit.line,
        tag: edit.tag,
        add: edit.containClass,
      });
    }

    totalEdits += edits.length;

    if (!CHECK_ONLY) {
      fs.writeFileSync(file, applyEdits(source, edits));
      changedFiles += 1;
    }
  }

  if (report.length === 0) {
    console.log(CHECK_ONLY ? 'contain: все файлы уже в порядке' : 'contain: изменений не требуется');
    return;
  }

  for (const item of report) {
    if (item.error) {
      console.log(`✗ ${item.file}: parse error — ${item.error}`);
      continue;
    }
    console.log(`• ${item.file}:${item.line} <${item.tag}> +${item.add}`);
  }

  const summary = CHECK_ONLY
    ? `contain: ${totalEdits} правок в ${new Set(report.map((r) => r.file)).size} файлах (dry-run)`
    : `contain: применено ${totalEdits} правок в ${changedFiles} файлах`;

  console.log(summary);
  if (CHECK_ONLY) process.exitCode = 1;
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
