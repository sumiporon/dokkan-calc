/** Build-only packaging for the production-separated Firefox prototype. */
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { dokkanInfoEventHtml, dokkanInfoStageHtml } from '../tests/fixtures/phase11/dokkaninfo-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'prototypes/phase11-one-tap-extension');
const OUT = path.join(ROOT, 'generated/phase11-one-tap');
const FIXED = path.join(ROOT, 'phase11-one-tap-fixture');
const packages = [
  { name: 'source', manifest: 'manifest.source.json', fixture: false },
  { name: 'fixture', manifest: 'manifest.fixture.json', fixture: true },
  { name: 'chromium-test', manifest: 'manifest.chromium-test.json', fixture: true }
];
const baselineModule = await readFile(path.join(ROOT, 'generated/phase11/baseline.mjs'), 'utf8');
const baseline = JSON.parse(baselineModule.replace(/^export default /, '').replace(/;\s*$/, ''));
const baselineRuntime = JSON.stringify(baseline.runtime);
const AMO_TEXT_PARSE_LIMIT = 5 * 1024 * 1024;

for (const item of packages) {
  const destination = path.join(OUT, item.name);
  await mkdir(destination, { recursive: true });
  await cp(path.join(SRC, item.manifest), path.join(destination, 'manifest.json'));
  await cp(path.join(SRC, 'review.html'), path.join(destination, 'review.html'));
  await cp(path.join(SRC, 'review.css'), path.join(destination, 'review.css'));
  await writeFile(path.join(destination, 'baseline-runtime.json'), baselineRuntime);
  for (const [entry, outfile] of [['background.mjs', 'background.js'], ['review.mjs', 'review.js']]) {
    await build({ absWorkingDir: ROOT, entryPoints: [path.join(SRC, entry)], outfile: path.join(destination, outfile), bundle: true, format: 'iife', platform: 'browser', target: item.name === 'chromium-test' ? 'chrome128' : 'firefox128', minify: true, legalComments: 'none', banner: { js: 'const browser=globalThis.browser??globalThis.chrome;' } });
  }
  await build({
    absWorkingDir: ROOT,
    entryPoints: [path.join(SRC, 'content.mjs')],
    outfile: path.join(destination, 'content.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'firefox128',
    minify: true,
    legalComments: 'none',
    banner: { js: 'const browser=globalThis.browser??globalThis.chrome;' },
    define: { PHASE11_FIXTURE_MODE: item.fixture ? 'true' : 'false' }
  });
  for (const name of ['background.js', 'content.js', 'review.js']) {
    const size = (await stat(path.join(destination, name))).size;
    if (size >= AMO_TEXT_PARSE_LIMIT) throw new Error(`${item.name}/${name} is ${size} bytes; AMO parses JavaScript only below ${AMO_TEXT_PARSE_LIMIT} bytes.`);
  }
}

await mkdir(FIXED, { recursive: true });
const eventId = '990001';
const stages = [1, 2, 3].map((number) => ({ id: `9900010${number}`, name: `架空ステージ${number}` }));
const meta = (url) => `<meta name="phase11-fixture-source-url" content="${url}">`;
const insertMeta = (html, url) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">${meta(url)}`);
await writeFile(path.join(FIXED, 'event.html'), insertMeta(dokkanInfoEventHtml({ eventId, stages }), `https://jpnja.dokkaninfo.com/events/challenge/${eventId}`));
for (const [index, stage] of stages.entries()) {
  const url = `https://jpnja.dokkaninfo.com/events/challenge/${eventId}/${stage.id}`;
  const html = dokkanInfoStageHtml({ eventId, stageId: stage.id, stageName: stage.name, normalAtk: 600000 + index * 100000, hp: 10000000 + index * 1000000, def: 150000 + index * 10000 });
  await writeFile(path.join(FIXED, `stage-${stage.id}.html`), insertMeta(html, url));
}
await writeFile(path.join(FIXED, 'README.txt'), 'Self-authored fictional three-stage pages for the Phase 11 Android Firefox gate. No third-party source data.\n');

const sourceText = await Promise.all(['background.mjs', 'content.mjs'].map((name) => readFile(path.join(SRC, name), 'utf8')));
for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /GM_xmlhttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /setInterval\s*\(/, /location\.reload\s*\(/, /\.click\s*\(/, /<all_urls>/]) {
  if (sourceText.some((text) => forbidden.test(text))) throw new Error(`Forbidden acquisition mechanism in extension source: ${forbidden}`);
}
console.log(`Phase 11 one-tap prototype built: ${OUT}; fictional fixture: ${FIXED}`);
