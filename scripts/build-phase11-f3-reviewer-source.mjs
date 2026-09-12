/** Assemble AMO reviewer source without generated output, third-party data, or credentials. */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../amo/phase11-one-tap-reviewer-source/zip.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const template=path.join(root,'amo','phase11-f3-preflight-reviewer');
const staging=path.join(root,'generated','phase11-f3-extension','amo-reviewer-source');
const archive=path.join(root,'generated','phase11-f3-extension','phase11-f3-preflight-amo-reviewer-source.zip');
const copyPaths=[
  'prototypes/phase11-f3-prep-extension',
  'prototypes/phase11-f3-prep/fixtures.mjs',
  'prototypes/phase11-dokkaninfo-f1/fixtures.mjs',
  'tests/fixtures/phase11/dokkaninfo-source.mjs',
  'src/prototype',
  'src/data-foundation',
  'src/data-migration',
  'schemas/enemy-data-v2.canonical.schema.json',
  'schemas/enemy-data-runtime-v1.schema.json'
];
const forbidden=['.git','node_modules','.cache','generated','dist'];
await rm(staging,{recursive:true,force:true});await mkdir(staging,{recursive:true});
for(const entry of await readdir(template,{withFileTypes:true}))await cp(path.join(template,entry.name),path.join(staging,entry.name),{recursive:entry.isDirectory()});
for(const relative of copyPaths){const destination=path.join(staging,relative);await mkdir(path.dirname(destination),{recursive:true});await cp(path.join(root,relative),destination,{recursive:true});}
// Keep this historical reviewer package tied to its submitted F3-preflight
// source boundary. This later fixture-only diagnostic is not bundled by the
// submitted add-on and was not part of the submitted source archive.
await rm(path.join(staging,'src','prototype','phase11-f3-structure-diagnostic.mjs'),{force:true});
await cp(path.join(root,'amo','phase11-one-tap-reviewer-source','zip.mjs'),path.join(staging,'zip.mjs'));
const lock=JSON.parse(await readFile(path.join(root,'amo','phase11-one-tap-reviewer-source','package-lock.json'),'utf8'));
lock.name='phase11-f3-preflight-reviewer-source';lock.version='0.0.2';lock.packages[''].name=lock.name;lock.packages[''].version=lock.version;
await writeFile(path.join(staging,'package-lock.json'),`${JSON.stringify(lock,null,2)}\n`);
for(const name of forbidden){try{await stat(path.join(staging,name));throw new Error(`Forbidden reviewer-source path: ${name}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
await writeZip(staging,archive);
console.log(`F3 AMO reviewer source: ${archive} (${(await stat(archive)).size} bytes)`);
