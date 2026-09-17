/** Isolated unpacked v2 candidate and localhost fixtures. No archive/signing. */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CASES, fixture } from '../prototypes/phase11-f3-structure-v2-extension/fixtures.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = new URL('../prototypes/phase11-f3-structure-v2-extension/', import.meta.url);
const out = new URL('../generated/phase11-f3-structure-extension/v2/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', source), 'utf8'));
const exact = 'https://jpnja.dokkaninfo.com/events/challenge/1705/17050015';
if (manifest.version !== '0.0.2' || JSON.stringify(manifest.permissions) !== '[]' || JSON.stringify(manifest.host_permissions) !== JSON.stringify([exact]) || JSON.stringify(manifest.content_scripts[0].matches) !== JSON.stringify([exact]) || manifest.browser_specific_settings.gecko.id !== 'phase11-f3-structure-diagnostic@sumiporon.invalid') throw new Error('Unexpected v2 boundary');
const matches = Object.keys(CASES).map(kind => `http://127.0.0.1/events/challenge/993300/${fixture(kind).stageId}`);
const local = { ...manifest, name: 'Structure diagnostic v2 LOCAL FIXTURE ONLY', host_permissions: matches, content_scripts: [{ ...manifest.content_scripts[0], matches }] };
delete local.browser_specific_settings;
for (const [mode, entry, config] of [['candidate', 'content.mjs', manifest], ['fixture-test', 'fixture-entry.mjs', local]]) {
  const dir = new URL(`${mode}/`, out); await mkdir(dir, { recursive: true });
  await writeFile(new URL('manifest.json', dir), JSON.stringify(config, null, 2) + '\n');
  const result = await build({ absWorkingDir: root, entryPoints: [fileURLToPath(new URL(entry, source))], outfile: fileURLToPath(new URL('content.js', dir)), bundle: true, format: 'iife', platform: 'browser', target: 'firefox140', minifyIdentifiers: true, legalComments: 'none', metafile: true });
  await writeFile(new URL(`${mode}-inputs.json`, out), JSON.stringify(Object.keys(result.metafile.inputs), null, 2) + '\n');
}
const preview = new URL('preview/', out); await mkdir(new URL('events/challenge/993300/', preview), { recursive: true });
const links = [];
for (const [kind, name] of Object.entries(CASES)) {
  const f = fixture(kind), path = `events/challenge/993300/${f.stageId}.html`;
  const head = `<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><style>body{margin:0;font:15px system-ui}main{padding:12px;overflow-wrap:anywhere}img{width:1px;height:1px}</style>`;
  await writeFile(new URL(path, preview), f.html.replace('</head>', head + '</head>').replace('</body>', '<script src="/content.js"></script></body>'));
  links.push(`<li><a href="/${path}">${name}</a></li>`);
}
await writeFile(new URL('content.js', preview), await readFile(new URL('fixture-test/content.js', out)));
const probe = await readFile(new URL('../tests/helpers/phase11-structure-extension-probe.js', import.meta.url), 'utf8');
const testBundle = new URL('fixture-test/content.js', out);
await writeFile(testBundle, probe + '\n' + await readFile(testBundle, 'utf8'));
await writeFile(new URL('index.html', preview), `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>構造診断v2・自作fixture review</title><style>body{font:16px/1.6 system-ui;margin:20px}li{margin:18px 0}</style><h1>構造診断v2の確認</h1><p>自作fixtureだけのpreviewです。実サイトへのアクセスはありません。確認対象：1tap、結果、コピー、小画面表示。全observationの監査は不要です。</p><ul>${links.join('')}</ul></html>`);
console.log('Built isolated unpacked v2 candidate, localhost test bundle and preview. No ZIP or signing.');
