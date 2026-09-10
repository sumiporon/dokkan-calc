/** Local-only live gate packaging. No external source request. */
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { writeZip } from '../amo/phase11-one-tap-reviewer-source/zip.mjs';
// Assemble the unchanged, verified fixture reviewer sources for shared parser inputs.
import './build-phase11-one-tap-amo-source.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'generated/phase11-one-tap');
const SRC = path.join(ROOT, 'prototypes/phase11-one-tap-extension');
const entries = { 'background.js': 'live-gate-background.mjs', 'content.js': 'live-gate-content.mjs', 'review.js': 'live-gate-review.mjs' };
for (const mode of ['live-gate', 'live-gate-test']) {
  const out = path.join(BASE, mode); await mkdir(out, { recursive: true });
  await cp(path.join(BASE, 'fixture/baseline-runtime.json'), path.join(out, 'baseline-runtime.json'));
  await cp(path.join(SRC, 'live-gate-review.html'), path.join(out, 'review.html'));
  await cp(path.join(SRC, 'review.css'), path.join(out, 'review.css'));
  await cp(path.join(SRC, mode === 'live-gate' ? 'manifest.live-gate.json' : 'manifest.chromium-test.json'), path.join(out, 'manifest.json'));
  for (const [outfile, entry] of Object.entries(entries)) {
    await build({ absWorkingDir: ROOT, entryPoints: [path.join(SRC, entry)], outfile: path.join(out, outfile), bundle: true, format: 'iife', platform: 'browser', target: 'firefox128', minify: true, legalComments: 'none', banner: { js: 'const browser=globalThis.browser??globalThis.chrome;' }, define: { PHASE11_FIXTURE_MODE: mode === 'live-gate-test' ? 'true' : 'false' } });
    if ((await readFile(path.join(out, outfile))).length >= 5 * 1024 * 1024) throw new Error('AMO JavaScript size limit exceeded');
  }
}
const addon = path.join(BASE, 'live-gate');
const staging = path.join(BASE, 'live-gate-reviewer-source'); await mkdir(staging, { recursive: true });
await cp(path.join(BASE, 'amo-reviewer-source'), staging, { recursive: true });
for (const entry of [...Object.values(entries), 'live-gate-policy.mjs', 'manifest.live-gate.json', 'live-gate-review.html']) await cp(path.join(SRC, entry), path.join(staging, 'prototypes/phase11-one-tap-extension', entry));
await cp(path.join(ROOT, 'amo/phase11-live-gate-reviewer/build.mjs'), path.join(staging, 'build.mjs'));
await cp(path.join(ROOT, 'amo/phase11-live-gate-reviewer/README.md'), path.join(staging, 'README.md'));
const expected = {};
for (const name of await readdir(addon)) { const bytes = await readFile(path.join(addon, name)); expected[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; }
await writeFile(path.join(staging, 'expected-output-sha256.json'), JSON.stringify(expected, null, 2) + '\n');
await writeZip(addon, path.join(BASE, 'phase11-live-gate-amo-upload.zip'));
await writeZip(staging, path.join(BASE, 'phase11-live-gate-amo-reviewer-source.zip'));
console.log('Live gate upload and reviewer source ZIPs ready: ' + BASE);
