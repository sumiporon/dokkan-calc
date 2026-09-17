/** v2-only allowlisted packages; original checkpoint source is the input. */
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE, OWN_SOURCES, buildCandidate } from '../amo/phase11-f3-structure-v2-reviewer/build.mjs';
import { writeZip } from '../amo/phase11-f3-structure-v2-reviewer/zip.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'generated/phase11-f3-structure-extension/v2/signing');
const template = path.join(root, 'amo/phase11-f3-structure-v2-reviewer');
const sourceZip = path.join(out, 'phase11-f3-structure-diagnostic-v2-0.0.2-reviewer-source.zip');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
await buildCandidate(root, out);
await mkdir(out, { recursive: true });
// Fresh staging prevents stale files from entering a subsequent source ZIP.
const staging = await mkdtemp(path.join(out, 'reviewer-staging-'));
const hashes = {};
const copy = async (source, relative) => {
  const destination = path.join(staging, relative); await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination); hashes[relative] = hash(await readFile(destination));
};
for (const name of ['README.md', 'package.json', 'package-lock.json', 'build.mjs', 'zip.mjs', 'verify.mjs']) await copy(path.join(template, name), name);
for (const name of [...OWN_SOURCES, 'prototypes/phase11-f3-structure-v2-extension/manifest.json']) await copy(path.join(root, name), name);
const unsignedHash = hash(await readFile(path.join(out, ARCHIVE)));
await writeFile(path.join(staging, 'expected-unsigned-sha256.txt'), unsignedHash + '\n');
await writeFile(path.join(staging, 'source-files.json'), JSON.stringify(hashes, null, 2) + '\n');
await writeZip(staging, sourceZip);
console.log(JSON.stringify({ unsigned: path.join(out, ARCHIVE), unsignedSha256: unsignedHash, reviewerSource: sourceZip, reviewerSourceSha256: hash(await readFile(sourceZip)) }, null, 2));
