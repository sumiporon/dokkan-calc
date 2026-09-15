import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ARCHIVE, OWN_SOURCES, validateManifest, buildCandidate } from '../../amo/phase11-f3-structure-reviewer/build.mjs';
import { writeZip } from '../../amo/phase11-f3-structure-reviewer/zip.mjs';

const root = path.resolve('.'), out = path.join(root, 'generated/phase11-f3-structure-extension');
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
function entries(bytes) {
  const result = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'Stored entries only');
    assert.equal(bytes.readUInt16LE(offset + 10), 0); assert.equal(bytes.readUInt16LE(offset + 12), 0x21);
    const size = bytes.readUInt32LE(offset + 18), length = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString('utf8');
    assert.equal(result.has(name), false); assert.doesNotMatch(name, /(?:^|\/)\.\.(?:\/|$)|\\|^\//);
    const start = offset + 30 + length + extra; result.set(name, bytes.subarray(start, start + size)); offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  assert.deepEqual([...result.keys()], [...result.keys()].sort());
  return result;
}

test('packager rejects overlong names, permissions, wildcard, identity and extra entry points', async () => {
  const manifest = JSON.parse(await readFile(path.join(out, 'candidate/manifest.json'), 'utf8'));
  validateManifest(manifest);
  assert.equal(manifest.name, 'Phase 11 structure diagnostic');
  assert.equal([...manifest.name].length, 29);
  for (const name of ['Phase 11 limited structure diagnostic candidate', 'x'.repeat(46), '']) {
    assert.throws(() => validateManifest({ ...manifest, name }), /AMO manifest name must contain 1 to 45 characters/);
  }
  for (const change of [m => m.permissions.push('storage'), m => m.host_permissions[0] += '*', m => m.content_scripts[0].matches[0] += '/', m => m.background = { scripts: ['background.js'] }, m => m.browser_specific_settings.gecko.id = 'other@invalid', m => m.content_scripts[0].all_frames = true]) {
    const m = structuredClone(manifest); change(m); assert.throws(() => validateManifest(m));
  }
});
test('unsigned ZIP contains only the audited candidate bytes at archive root', async () => {
  const zip = entries(await readFile(path.join(out, ARCHIVE)));
  assert.deepEqual([...zip.keys()], ['content.js', 'manifest.json']);
  for (const [name, bytes] of zip) assert.deepEqual(bytes, await readFile(path.join(out, 'candidate', name)));
  assert.doesNotMatch(zip.get('content.js').toString(), /structureProbe|PRIVATE_CANARY|fixture\.invalid|sourceMappingURL/);
  assert.ok(zip.get('content.js').length < 5 * 1024 * 1024);
});
test('reviewer source allowlist contains original source, pinned minimal dependencies and exact expected hash', async () => {
  const zip = entries(await readFile(path.join(out, 'phase11-f3-structure-diagnostic-reviewer-source.zip')));
  const templates = ['README.md', 'package.json', 'package-lock.json', 'build.mjs', 'zip.mjs', 'verify.mjs'];
  const manifest = 'prototypes/phase11-f3-structure-extension/manifest.json';
  assert.deepEqual([...zip.keys()].sort(), [...templates, ...OWN_SOURCES, manifest, 'source-files.json', 'expected-unsigned-sha256.txt'].sort());
  for (const name of [...OWN_SOURCES, manifest]) assert.deepEqual(zip.get(name), await readFile(path.join(root, name)));
  for (const name of templates) assert.deepEqual(zip.get(name), await readFile(path.join(root, 'amo/phase11-f3-structure-reviewer', name)));
  for (const [name, digest] of Object.entries(JSON.parse(zip.get('source-files.json')))) assert.equal(sha(zip.get(name)), digest);
  assert.equal(zip.get('expected-unsigned-sha256.txt').toString().trim(), sha(await readFile(path.join(out, ARCHIVE))));
  const pkg = JSON.parse(zip.get('package.json')), lock = JSON.parse(zip.get('package-lock.json'));
  assert.deepEqual(pkg.devDependencies, { cheerio: '1.0.0-rc.12', esbuild: '0.28.2' });
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  assert.ok(Object.values(lock.packages).filter(p => p.resolved).every(p => p.resolved.startsWith('https://registry.npmjs.org/')));
});
test('ZIP bytes do not depend on source creation order or file timestamps', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'structure-zip-determinism-'));
  try {
    for (const dir of ['one', 'two']) await mkdir(path.join(temp, dir));
    for (const [dir, names] of [['one', ['z.txt', 'a.txt']], ['two', ['a.txt', 'z.txt']]]) {
      for (const name of names) { const file = path.join(temp, dir, name); await writeFile(file, `source ${name}\n`); await utimes(file, dir === 'one' ? 1 : 2000000000, dir === 'one' ? 1 : 2000000000); }
      await writeZip(path.join(temp, dir), path.join(temp, `${dir}.zip`));
    }
    assert.deepEqual(await readFile(path.join(temp, 'one.zip')), await readFile(path.join(temp, 'two.zip')));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('candidate packaging rejects stale foreign output instead of including or deleting it', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'structure-package-boundary-'));
  try {
    await mkdir(path.join(temp, 'candidate')); await writeFile(path.join(temp, 'candidate', 'private.txt'), 'keep');
    await assert.rejects(buildCandidate(root, temp), /Unexpected file in candidate output/);
    assert.equal(await readFile(path.join(temp, 'candidate', 'private.txt'), 'utf8'), 'keep');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
