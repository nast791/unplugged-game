// Конвертирует png/jpg/jpeg → webp в .refs (все подпапки); исходники удаляются
// pnpm img:webp  |  pnpm img:webp -- --force  |  pnpm img:webp -- --keep-source  |  pnpm img:webp -- --quality 85
import { stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const INPUT_GLOBS = ['.refs/**/*.{png,jpg,jpeg,JPG,JPEG,PNG}'];

const WEBP_QUALITY = Number.parseInt(
	process.argv.find((a, i) => process.argv[i - 1] === '--quality') ?? '80',
	10,
);
const WEBP_EFFORT = 6;
const WEBP_ALPHA_QUALITY = 100;


const removeSources = !process.argv.includes('--keep-source');
const force = process.argv.includes('--force');

const files = await fg(INPUT_GLOBS, {
	cwd: ROOT,
	absolute: true,
	onlyFiles: true,
});

if (!files.length) {
	console.log('Нет изображений для конвертации (png/jpg/jpeg).');
	process.exit(0);
}

let converted = 0;
let skipped = 0;
let removed = 0;
let failed = 0;

async function removeSource(file, reason) {
	if (!removeSources) return;
	await unlink(file);
	removed++;
	console.log(`🗑 ${path.relative(ROOT, file)} (${reason})`);
}

for (const file of files) {
	const out = file.replace(/\.(png|jpe?g)$/i, '.webp');

	try {
		const meta = await sharp(file).metadata();
		if (!meta.width) {
			console.warn(`⚠ Пропуск (не читается): ${path.relative(ROOT, file)}`);
			skipped++;
			continue;
		}

		let needsConvert = true;

		if (!force) {
			const { mtimeMs: srcMtime } = await stat(file);
			try {
				const outStat = await stat(out);
				if (outStat.mtimeMs >= srcMtime) {
					needsConvert = false;
					skipped++;
					await removeSource(file, 'webp актуален');
					continue;
				}
			} catch {
				// .webp ещё нет
			}
		}

		if (needsConvert) {
			const hasAlpha = Boolean(meta.hasAlpha);
			let pipeline = sharp(file);

			if (hasAlpha) {
				pipeline = pipeline.ensureAlpha().webp({
					quality: WEBP_QUALITY,
					alphaQuality: WEBP_ALPHA_QUALITY,
					effort: WEBP_EFFORT,
					smartSubsample: false,
				});
			} else {
				pipeline = pipeline.webp({
					quality: WEBP_QUALITY,
					effort: WEBP_EFFORT,
					smartSubsample: true,
				});
			}

			await pipeline.toFile(out);

			const outStat = await stat(out);
			const relIn = path.relative(ROOT, file);
			const relOut = path.relative(ROOT, out);
			const kb = (outStat.size / 1024).toFixed(1);
			const mode = hasAlpha ? `q${WEBP_QUALITY}+α${WEBP_ALPHA_QUALITY}` : `q${WEBP_QUALITY}`;
			console.log(`✅ ${relIn} → ${relOut} [${mode}, ${kb} KB]`);
			converted++;
		}

		await removeSource(file, 'конвертирован');
	} catch (err) {
		console.error(`❌ ${path.relative(ROOT, file)}: ${err.message}`);
		failed++;
	}
}

console.log(
	`\nГотово: ${converted} сконвертировано, ${skipped} без перекодирования, ${removed} исходников удалено, ${failed} ошибок` +
		(force ? ' (--force)' : '') +
		(removeSources ? '' : ' (--keep-source)'),
);

if (failed > 0) process.exit(1);
