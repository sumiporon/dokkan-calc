import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ARCHIVE, validateManifest } from './build.mjs';
const root = new URL('./', import.meta.url);
const expected = (await readFile(new URL('expected-unsigned-sha256.txt', root), 'utf8')).trim();
assert.match(expected, /^[A-F0-9]{64}$/);
const actual = createHash('sha256').update(await readFile(new URL(`dist/${ARCHIVE}`, root))).digest('hex').toUpperCase();
assert.equal(actual, expected, 'Unsigned archive differs from the submission candidate');
validateManifest(JSON.parse(await readFile(new URL('dist/candidate/manifest.json', root), 'utf8')));
const sourceHashes = JSON.parse(await readFile(new URL('source-files.json', root), 'utf8'));
for (const [name, hash] of Object.entries(sourceHashes)) {
  assert.ok(!name.includes('..') && !name.includes('\\\\') && !name.startsWith('/'));
  assert.equal(createHash('sha256').update(await readFile(new URL(name, root))).digest('hex').toUpperCase(), hash, `Source differs: ${name}`);
}
console.log(`PASS unsigned ZIP SHA-256: ${actual}`);
