/** Shared candidate/reviewer build. Contains no source-site acquisition step. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip.mjs';

export const ARCHIVE = 'phase11-f3-structure-diagnostic-unsigned.zip';
export const OWN_SOURCES = [
  'prototypes/phase11-f3-structure-extension/content.mjs',
  'prototypes/phase11-f3-structure-extension/ui.mjs',
  'src/prototype/phase11-f3-structure-diagnostic.mjs'
];
export function validateManifest(manifest) {
  const exact = 'https://jpnja.dokkaninfo.com/events/challenge/1705/17050015';
  assert.deepEqual(Object.keys(manifest).sort(), ['manifest_version', 'name', 'version', 'description', 'permissions', 'host_permissions', 'content_scripts', 'browser_specific_settings'].sort());
  assert.equal(manifest.manifest_version, 3); assert.equal(manifest.version, '0.0.1');
  assert.equal(typeof manifest.name, 'string');
  assert.ok([...manifest.name].length >= 1 && [...manifest.name].length <= 45, 'AMO manifest name must contain 1 to 45 characters');
  assert.equal(manifest.name, 'Phase 11 structure diagnostic');
  assert.deepEqual(manifest.permissions, []); assert.deepEqual(manifest.host_permissions, [exact]);
  assert.deepEqual(manifest.content_scripts, [{ matches: [exact], js: ['content.js'], run_at: 'document_idle', all_frames: false }]);
  assert.deepEqual(manifest.browser_specific_settings, {
    gecko: { id: 'phase11-f3-structure-diagnostic@sumiporon.invalid', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
    gecko_android: { strict_min_version: '142.0' }
  });
  assert.equal(JSON.stringify(manifest).includes('*'), false);
}
export async function buildCandidate(root, out, { archive = true } = {}) {
  if (process.version !== 'v22.17.0') throw new Error('Reproducible build requires Node.js 22.17.0');
  const manifest = JSON.parse(await readFile(path.join(root, 'prototypes/phase11-f3-structure-extension/manifest.json'), 'utf8'));
  validateManifest(manifest);
  const candidate = path.join(out, 'candidate'); await mkdir(candidate, { recursive: true });
  const existing = await readdir(candidate);
  assert.ok(existing.every(name => ['manifest.json', 'content.js'].includes(name)), 'Unexpected file in candidate output; use a fresh output directory');
  await writeFile(path.join(candidate, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const result = await build({ absWorkingDir: root, entryPoints: [OWN_SOURCES[0]], outfile: path.join(candidate, 'content.js'), bundle: true, format: 'iife', platform: 'browser', target: 'firefox140', minifyIdentifiers: true, legalComments: 'none', sourcemap: false, metafile: true });
  const inputs = Object.keys(result.metafile.inputs).map(p => p.replaceAll('\\', '/'));
  assert.ok(inputs.every(p => p.startsWith('node_modules/') || OWN_SOURCES.includes(p)), 'Unexpected candidate source dependency');
  assert.ok(OWN_SOURCES.every(p => inputs.includes(p)));
  await writeFile(path.join(out, 'candidate-inputs.json'), JSON.stringify(inputs, null, 2) + '\n');
  const bundle = await readFile(path.join(candidate, 'content.js'), 'utf8');
  assert.equal((bundle.match(/document\.documentElement\.outerHTML/g) ?? []).length, 1);
  assert.doesNotMatch(bundle, /structureProbe|PRIVATE_CANARY|fixture\.invalid/);
  assert.ok(Buffer.byteLength(bundle) < 5 * 1024 * 1024, 'AMO JavaScript parse size limit');
  if (archive) await writeZip(candidate, path.join(out, ARCHIVE));
  return { inputs, candidate };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  await buildCandidate(root, path.join(root, 'dist'));
  console.log(`Built dist/${ARCHIVE}; no signing, installation or source-site access.`);
}
