/** New diagnostic packages only; the previous F3 packages are never inputs. */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE, OWN_SOURCES, buildCandidate } from '../amo/phase11-f3-structure-reviewer/build.mjs';
import { writeZip } from '../amo/phase11-f3-structure-reviewer/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'generated/phase11-f3-structure-extension');
const template = path.join(root, 'amo/phase11-f3-structure-reviewer');
const staging = path.join(out, 'reviewer-source');
const sourceZip = path.join(out, 'phase11-f3-structure-diagnostic-reviewer-source.zip');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
await buildCandidate(root, out);
// Only this fixed, generated staging child is replaced; no other package is touched.
await rm(staging, { recursive: true, force: true }); await mkdir(staging, { recursive: true });
const hashes = {};
const copy = async (source, relative) => {
  const destination = path.join(staging, relative); await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination); hashes[relative] = hash(await readFile(destination));
};
for (const name of ['README.md', 'package.json', 'package-lock.json', 'build.mjs', 'zip.mjs', 'verify.mjs']) await copy(path.join(template, name), name);
for (const name of [...OWN_SOURCES, 'prototypes/phase11-f3-structure-extension/manifest.json']) await copy(path.join(root, name), name);
const unsignedHash = hash(await readFile(path.join(out, ARCHIVE)));
await writeFile(path.join(staging, 'expected-unsigned-sha256.txt'), unsignedHash + '\n');
await writeFile(path.join(staging, 'source-files.json'), JSON.stringify(hashes, null, 2) + '\n');
await writeZip(staging, sourceZip);
console.log(JSON.stringify({ unsigned: path.join(out, ARCHIVE), unsignedSha256: unsignedHash, reviewerSource: sourceZip, reviewerSourceSha256: hash(await readFile(sourceZip)) }, null, 2));
