/** Unpacked unsigned candidate + localhost-only fixture build. No ZIP/signing/install. */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DIAGNOSTIC_CASES, diagnosticFixture } from '../prototypes/phase11-f3-structure-extension/fixtures.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = new URL('../prototypes/phase11-f3-structure-extension/', import.meta.url);
const out = new URL('../generated/phase11-f3-structure-extension/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', source), 'utf8'));
const exact = 'https://jpnja.dokkaninfo.com/events/challenge/1705/17050015';
if (JSON.stringify(manifest.permissions) !== '[]' || JSON.stringify(manifest.host_permissions) !== JSON.stringify([exact]) || JSON.stringify(manifest.content_scripts[0].matches) !== JSON.stringify([exact])) throw new Error('Unexpected diagnostic permission boundary');
const matches = Object.keys(DIAGNOSTIC_CASES).map(kind => `http://127.0.0.1/events/challenge/992200/${diagnosticFixture(kind).stageId}`);
const fixtureManifest = { ...manifest, name: 'Structure diagnostic LOCAL FIXTURE TEST ONLY', host_permissions: matches,
  content_scripts: [{ ...manifest.content_scripts[0], matches }] };
delete fixtureManifest.browser_specific_settings;
for (const [mode, entry, config] of [['candidate', 'content.mjs', manifest], ['fixture-test', 'fixture-entry.mjs', fixtureManifest]]) {
  const dir = new URL(`${mode}/`, out); await mkdir(dir, { recursive: true });
  await writeFile(new URL('manifest.json', dir), JSON.stringify(config, null, 2) + '\n');
  await build({ absWorkingDir: root, entryPoints: [fileURLToPath(new URL(entry, source))], outfile: fileURLToPath(new URL('content.js', dir)), bundle: true, format: 'iife', platform: 'browser', target: 'firefox140', minifyIdentifiers: true, legalComments: 'none', metafile: true }).then(async result => {
    await writeFile(new URL(`${mode}-inputs.json`, out), JSON.stringify(Object.keys(result.metafile.inputs), null, 2) + '\n');
  });
}
// The preview uses exactly the same localhost entry/UI; no extension is installed.
const preview = new URL('preview/', out); await mkdir(new URL('events/challenge/992200/', preview), { recursive: true });
const links = [];
for (const [kind, name] of Object.entries(DIAGNOSTIC_CASES)) {
  const f = diagnosticFixture(kind);
  const path = `events/challenge/992200/${f.stageId}.html`;
  const head = `<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><style>body{margin:0;font:15px system-ui}main{padding:12px}img{width:1px;height:1px}</style>`;
  const html = f.html.replace('</head>', head + '</head>').replace('</body>', '<script src="/content.js"></script></body>');
  await writeFile(new URL(path, preview), html); links.push(`<li><a href="/${path}">${name}</a></li>`);
}
await writeFile(new URL('content.js', preview), await readFile(new URL('fixture-test/content.js', out)));
// Browser tests count operations inside the actual content-script world.
const probe = await readFile(new URL('../tests/helpers/phase11-structure-extension-probe.js', import.meta.url), 'utf8');
const testBundle = new URL('fixture-test/content.js', out);
await writeFile(testBundle, probe + '\n' + await readFile(testBundle, 'utf8'));
await writeFile(new URL('index.html', preview), `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>専用構造診断extension候補・fixture review</title><style>body{font:16px/1.6 system-ui;margin:20px}li{margin:18px 0}</style><h1>専用構造診断extension候補</h1><p>localhost自作fixtureのみ。実サイト操作・署名・インストールなし。</p><ul>${links.join('')}</ul></html>`);
console.log('Built isolated structure diagnostic candidate, localhost test extension and preview. No archive generated.');
