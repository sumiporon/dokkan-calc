/** Assemble the self-contained AMO reviewer source archive for the fixture extension. */
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../amo/phase11-one-tap-reviewer-source/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(ROOT, 'amo', 'phase11-one-tap-reviewer-source');
const ADDON = path.join(ROOT, 'generated', 'phase11-one-tap', 'fixture');
const STAGING = path.join(ROOT, 'generated', 'phase11-one-tap', 'amo-reviewer-source');
const ARCHIVE = path.join(ROOT, 'generated', 'phase11-one-tap', 'phase11-fixture-amo-reviewer-source.zip');
const EXPECTED = JSON.parse(await readFile(path.join(TEMPLATE, 'expected-output-sha256.json'), 'utf8'));
const SOURCE_FILES = [
  'prototypes/phase11-one-tap-extension/background.mjs',
  'prototypes/phase11-one-tap-extension/content.mjs',
  'prototypes/phase11-one-tap-extension/manifest.fixture.json',
  'prototypes/phase11-one-tap-extension/review.css',
  'prototypes/phase11-one-tap-extension/review.html',
  'prototypes/phase11-one-tap-extension/review.mjs',
  'schemas/enemy-data-runtime-v1.schema.json',
  'schemas/enemy-data-v2.canonical.schema.json',
  'src/data-foundation/dokkaninfo-saved-stage-v1.mjs',
  'src/data-foundation/dokkaninfo-saved-stage.mjs',
  'src/data-foundation/phase10-review.ts',
  'src/data-foundation/phase6-canonical.ts',
  'src/data-foundation/phase6-gates.ts',
  'src/data-foundation/phase6-runtime.ts',
  'src/data-foundation/phase6-types.ts',
  'src/data-migration/phase4-enemy-migration.ts',
  'src/prototype/phase11-dokkaninfo-adapter.mjs',
  'src/prototype/phase11-file.mjs',
  'src/prototype/phase11-intake.mjs',
  'src/prototype/phase11-one-tap-adapter.mjs',
  'src/prototype/phase11-one-tap-receiver.mjs',
  'src/prototype/phase11-one-tap-session.mjs',
  'src/prototype/phase11-reference-adapter.mjs',
  'src/prototype/phase11-store.mjs'
];

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

for (const [name, expected] of Object.entries(EXPECTED)) {
  const file = path.join(ADDON, name);
  const bytes = await readFile(file);
  if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256) {
    throw new Error(`Current fixture add-on does not match submitted v2: ${name}`);
  }
}

const relativeStaging = path.relative(ROOT, STAGING);
if (!relativeStaging.startsWith(path.join('generated', 'phase11-one-tap') + path.sep)) {
  throw new Error(`Refusing to replace unexpected staging directory: ${STAGING}`);
}
await rm(STAGING, { recursive: true, force: true });
await mkdir(STAGING, { recursive: true });
for (const entry of await readdir(TEMPLATE, { withFileTypes: true })) {
  if (entry.name === 'package-lock.json') continue;
  await cp(path.join(TEMPLATE, entry.name), path.join(STAGING, entry.name), { recursive: entry.isDirectory() });
}
for (const relative of SOURCE_FILES) {
  const destination = path.join(STAGING, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(ROOT, relative), destination);
}
await cp(path.join(TEMPLATE, 'package-lock.json'), path.join(STAGING, 'package-lock.json'));
await mkdir(path.join(STAGING, 'source-data'), { recursive: true });
await cp(path.join(ADDON, 'baseline-runtime.json'), path.join(STAGING, 'source-data', 'baseline-runtime.json'));

const forbidden = ['.git', 'node_modules', '.cache', 'dist', 'generated'];
for (const name of forbidden) {
  try {
    await stat(path.join(STAGING, name));
    throw new Error(`Forbidden source-package path present: ${name}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await writeZip(STAGING, ARCHIVE);
console.log(`AMO reviewer source: ${ARCHIVE} (${(await stat(ARCHIVE)).size} bytes)`);
