/** Build only the independent Phase E fixture prototype. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'generated/phase11/typed-one-tap'); await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url), Ajv = require('ajv/dist/2020').default;
const ajv = new Ajv({ strict: true, allowUnionTypes: true, allErrors: true, code: { source: true } });
require('ajv-formats')(ajv); const ids = {};
for (const [key, name] of Object.entries({ canonical: 'enemy-data-v2.canonical', runtime: 'enemy-data-runtime-v1' })) {
  const schema = JSON.parse(await readFile(path.join(root, 'schemas', `${name}.schema.json`), 'utf8'));
  ajv.addSchema(schema); ids[key] = schema.$id;
}
const validators = path.join(out, 'validators.cjs');
await writeFile(validators, require('ajv/dist/standalone').default(ajv, ids));
const plugin = { name: 'isolated-existing-validators', setup(builder) {
  builder.onResolve({ filter: /generated\/phase11\/validators\.cjs$/ }, () => ({ path: validators }));
} };
for (const [entry, name] of [['src/prototype/phase11-typed-one-tap-api.mjs', 'api.mjs'], ['src/prototype/phase11-one-tap-receiver.mjs', 'existing-full-receiver.mjs'], ['prototypes/phase11-typed-one-tap/app.mjs', 'app.mjs'], ['prototypes/phase11-typed-inspection/app.mjs', 'inspection-app.mjs']]) {
  await build({ absWorkingDir: root, entryPoints: [entry], outfile: path.join(out, name), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', plugins: [plugin] });
}
console.log('Phase E typed one-tap fixture built: generated/phase11/typed-one-tap/');
