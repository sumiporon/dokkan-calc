/** Local-only standalone artifact. Does not fetch, publish, or change production. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { readProductionBaseline } from './review-phase10-candidate.mjs';
import { referencePage, referenceMhtml } from '../tests/fixtures/phase11/reference-source.mjs';
import { renderReferenceHtml } from '../src/prototype/phase11-reference-adapter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'generated/phase11');
const FIXED = path.join(ROOT, 'phase11-preview');
const require = createRequire(import.meta.url);
const Ajv = require('ajv/dist/2020').default;
const standalone = require('ajv/dist/standalone').default;
const ajv = new Ajv({ strict: true, allowUnionTypes: true, allErrors: true, code: { source: true } });
require('ajv-formats')(ajv);
const ids = {};
for (const [key, name] of Object.entries({ canonical: 'enemy-data-v2.canonical', runtime: 'enemy-data-runtime-v1' })) {
  const schema = JSON.parse(await readFile(path.join(ROOT, 'schemas', `${name}.schema.json`), 'utf8'));
  ajv.addSchema(schema); ids[key] = schema.$id;
}
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'validators.cjs'), standalone(ajv, ids));
const baseline = await readProductionBaseline();
await writeFile(path.join(OUT, 'baseline.mjs'), `export default ${JSON.stringify(baseline)};\n`);
await build({ absWorkingDir: ROOT, entryPoints: ['src/prototype/phase11-test-api.mjs'], outfile: 'generated/phase11/api.mjs', bundle: true, format: 'esm', platform: 'neutral', target: 'es2022' });
const samples = {
  complete: renderReferenceHtml(referencePage()),
  main: renderReferenceHtml(referencePage({ split: true })),
  detail: renderReferenceHtml(referencePage({ split: true, detail: true })),
  updated: renderReferenceHtml(referencePage({ normalAtk: 660000 })),
  second: renderReferenceHtml(referencePage({ stageId: 'forest-2' }))
};
for (const [name, html] of Object.entries(samples)) await writeFile(path.join(OUT, `sample-${name}.html`), html);
samples.mhtml = referenceMhtml(samples.complete);
await writeFile(path.join(OUT, 'sample-complete.mhtml'), samples.mhtml);
await writeFile(path.join(OUT, 'samples.mjs'), `export default ${JSON.stringify(samples)};\n`);
const built = await build({ absWorkingDir: ROOT, entryPoints: ['prototypes/phase11-manual-intake/app.mjs'], write: false, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none' });
// Escape literal end tags before computing CSP; the exact embedded script is hashed.
const js = built.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const hash = createHash('sha256').update(js).digest('base64');
const css = await readFile(path.join(ROOT, 'prototypes/phase11-manual-intake/style.css'), 'utf8');
const template = await readFile(path.join(ROOT, 'prototypes/phase11-manual-intake/index.template.html'), 'utf8');
const html = template.replace('%%SCRIPT_HASH%%', hash).replace('%%STYLE%%', () => css).replace('%%SCRIPT%%', () => js);
await writeFile(path.join(OUT, 'preview.html'), html);
if (process.argv.includes('--fixed-preview')) {
  await mkdir(FIXED, { recursive: true });
  await writeFile(path.join(FIXED, 'index.html'), html);
}
console.log(`Phase 11 private preview: ${path.join(OUT, 'preview.html')} (${Buffer.byteLength(html)} bytes); baseline ${baseline.fullDigest}; production unchanged.`);
