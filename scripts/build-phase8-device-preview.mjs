import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RC_ROOT = path.join(REPO_ROOT, 'release-candidate', 'phase8');
const DATA_ROOT = path.join(RC_ROOT, 'data');
const OUTPUT = path.join(RC_ROOT, 'device-preview.html');
const MIGRATION_PREVIEW_URL = 'https://rawcdn.githack.com/sumiporon/dokkan-calc/phase8-pc-recheck-ready-2026-08-24/release-candidate/phase8/migration-device-check.html';

const modulePaths = [
  'src/prototype/phase7-update-engine.mjs',
  'src/release-candidate/phase8-manifest.mjs',
  'src/release-candidate/phase8-release-store.mjs',
  'src/release-candidate/phase8-runtime-client.mjs',
  'src/release-candidate/phase8-selection-state.mjs',
  'src/release-candidate/phase8-ui-model.mjs',
  'release-candidate/phase8/app.mjs'
];

function moduleToClassic(source) {
  return source
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/g, '');
}

async function embeddedFiles() {
  const manifestText = await readFile(path.join(DATA_ROOT, 'release-manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const indexText = await readFile(path.join(DATA_ROOT, manifest.chunked.indexJson.path), 'utf8');
  const index = JSON.parse(indexText);
  const descriptors = [manifest.full.json, manifest.chunked.indexJson, ...index.events.map((event) => event.json)];
  const entries = [['release-manifest.json', { text: manifestText, contentType: 'application/json' }]];
  for (const descriptor of descriptors) {
    entries.push([descriptor.path, { text: await readFile(path.join(DATA_ROOT, descriptor.path), 'utf8'), contentType: descriptor.contentType }]);
  }
  return Object.fromEntries(entries);
}

function embeddedFetchSource(files) {
  return `const phase8EmbeddedFiles=${JSON.stringify(files)};
globalThis.__phase8EmbeddedFetch=async function phase8EmbeddedFetch(input){
  const pathname=new URL(String(input),location.href).pathname.replaceAll('\\\\','/');
  const marker='/data/';
  const markerIndex=pathname.lastIndexOf(marker);
  const relativePath=markerIndex>=0?decodeURIComponent(pathname.slice(markerIndex+marker.length)):'';
  const item=phase8EmbeddedFiles[relativePath];
  if(!item)return new Response('',{status:404});
  return new Response(item.text,{status:200,headers:{'Content-Type':item.contentType}});
};`;
}

export async function buildPhase8DevicePreview({ outputPath = OUTPUT } = {}) {
  const [html, css, core, files, ...modules] = await Promise.all([
    readFile(path.join(RC_ROOT, 'index.html'), 'utf8'),
    readFile(path.join(RC_ROOT, 'app.css'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'src', 'calculation-core.js'), 'utf8'),
    embeddedFiles(),
    ...modulePaths.map((relativePath) => readFile(path.join(REPO_ROOT, relativePath), 'utf8'))
  ]);
  const bundle = [embeddedFetchSource(files), core, ...modules.map(moduleToClassic)].join('\n\n').replaceAll('</script', '<\\/script');
  const document = html
    .replace('<link rel="stylesheet" href="app.css">', `<style>${css}</style>`)
    .replace('<a class="button-link" id="migration-link" href="migration-device-check.html">', `<a class="button-link" id="migration-link" href="${MIGRATION_PREVIEW_URL}">`)
    .replace(/\s*<script src="\.\.\/\.\.\/src\/calculation-core\.js"><\/script>\s*/, '\n')
    .replace(/\s*<script type="module" src="app\.mjs"><\/script>\s*/, `\n<script>${bundle}</script>\n`)
    .replace('Phase 8 確認版</title>', 'Phase 8 単一HTML確認版</title>')
    .replace('本番とは別の確認版です。このbranchでは架空データだけを表示します。', '本番とは別の単一HTML確認版です。架空データだけを内蔵し、現行OneDrive版は変更しません。');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, document, 'utf8');
  return { outputPath, bytes: Buffer.byteLength(document), embeddedArtifacts: Object.keys(files).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPhase8DevicePreview().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
