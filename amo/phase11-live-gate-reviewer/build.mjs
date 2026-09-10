import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { verifyOutput } from './verify.mjs';
import { writeZip } from './zip.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'prototypes', 'phase11-one-tap-extension');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'fixture');
const GENERATED = path.join(ROOT, 'generated', 'phase11');
const require = createRequire(import.meta.url);
const Ajv = require('ajv/dist/2020').default;
const standalone = require('ajv/dist/standalone').default;

await rm(DIST, { recursive: true, force: true });
await rm(path.join(ROOT, 'generated'), { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await mkdir(GENERATED, { recursive: true });

const ajv = new Ajv({ strict: true, allowUnionTypes: true, allErrors: true, code: { source: true } });
require('ajv-formats')(ajv);
const schemaIds = {};
for (const [key, name] of Object.entries({ canonical: 'enemy-data-v2.canonical', runtime: 'enemy-data-runtime-v1' })) {
  const schema = JSON.parse(await readFile(path.join(ROOT, 'schemas', `${name}.schema.json`), 'utf8'));
  ajv.addSchema(schema);
  schemaIds[key] = schema.$id;
}
await writeFile(path.join(GENERATED, 'validators.cjs'), standalone(ajv, schemaIds));

await cp(path.join(SRC, 'manifest.live-gate.json'), path.join(OUT, 'manifest.json'));
await cp(path.join(SRC, 'live-gate-review.html'), path.join(OUT, 'review.html'));
await cp(path.join(SRC, 'review.css'), path.join(OUT, 'review.css'));
await cp(path.join(ROOT, 'source-data', 'baseline-runtime.json'), path.join(OUT, 'baseline-runtime.json'));

for (const [entry, outfile] of [['live-gate-background.mjs', 'background.js'], ['live-gate-review.mjs', 'review.js']]) {
  await build({
    absWorkingDir: ROOT,
    entryPoints: [path.join(SRC, entry)],
    outfile: path.join(OUT, outfile),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'firefox128',
    minify: true,
    legalComments: 'none',
    banner: { js: 'const browser=globalThis.browser??globalThis.chrome;' },
    define: { PHASE11_FIXTURE_MODE: 'false' }
  });
}
await build({
  absWorkingDir: ROOT,
  entryPoints: [path.join(SRC, 'live-gate-content.mjs')],
  outfile: path.join(OUT, 'content.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'firefox128',
  minify: true,
  legalComments: 'none',
  banner: { js: 'const browser=globalThis.browser??globalThis.chrome;' },
  define: { PHASE11_FIXTURE_MODE: 'false' }
});

const parseLimit = 5 * 1024 * 1024;
for (const name of ['background.js', 'content.js', 'review.js']) {
  const size = (await stat(path.join(OUT, name))).size;
  if (size >= parseLimit) throw new Error(`${name} exceeds AMO's 5 MiB text parse limit: ${size} bytes`);
}
await verifyOutput(OUT);
const archive = path.join(DIST, 'phase11-live-gate-amo-upload.zip');
await writeZip(OUT, archive);
console.log(`Reviewer build complete: ${archive}`);
