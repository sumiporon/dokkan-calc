import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_PATH = path.join(ROOT, 'expected-output-sha256.json');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function verifyOutput(directory = path.join(ROOT, 'dist', 'fixture')) {
  const expected = JSON.parse(await readFile(EXPECTED_PATH, 'utf8'));
  const actualNames = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const expectedNames = Object.keys(expected).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Output file list differs. Expected ${expectedNames.join(', ')}; got ${actualNames.join(', ')}`);
  }
  for (const name of expectedNames) {
    const file = path.join(directory, name);
    const bytes = await readFile(file);
    const size = (await stat(file)).size;
    const digest = sha256(bytes);
    if (size !== expected[name].bytes || digest !== expected[name].sha256) {
      throw new Error(`${name} differs: expected ${expected[name].bytes} bytes / ${expected[name].sha256}; got ${size} bytes / ${digest}`);
    }
  }
  console.log(`Verified ${expectedNames.length} generated files: byte-for-byte identical to the submitted add-on contents.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyOutput();
}
