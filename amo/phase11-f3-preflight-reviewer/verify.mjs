import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const archive=path.join(root,'dist','phase11-f3-preflight-unsigned.zip');
const actual=createHash('sha256').update(await readFile(archive)).digest('hex').toUpperCase();
const expected=(await readFile(path.join(root,'expected-output-sha256.txt'),'utf8')).trim();
if(actual!==expected)throw new Error(`Output SHA-256 mismatch: ${actual}`);
console.log(`Verified ${actual}`);
