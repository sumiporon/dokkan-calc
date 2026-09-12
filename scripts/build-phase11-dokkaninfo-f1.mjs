/** Build only the isolated Phase F1 fixture adapter. */
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { readFile, writeFile, mkdir } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { build } from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), out=path.join(root,'generated/phase11/dokkaninfo-f1'); await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url), Ajv=require('ajv/dist/2020').default, ajv=new Ajv({strict:true,allowUnionTypes:true,allErrors:true,code:{source:true}}); require('ajv-formats')(ajv); const ids={};
for (const [key,name] of Object.entries({canonical:'enemy-data-v2.canonical',runtime:'enemy-data-runtime-v1'})) { const schema=JSON.parse(await readFile(path.join(root,'schemas',`${name}.schema.json`),'utf8')); ajv.addSchema(schema); ids[key]=schema.$id; }
const validators=path.join(out,'validators.cjs'); await writeFile(validators,require('ajv/dist/standalone').default(ajv,ids));
const plugin={name:'isolated-existing-validators',setup(builder){builder.onResolve({filter:/generated\/phase11\/validators\.cjs$/},()=>({path:validators}));}};
await build({absWorkingDir:root,entryPoints:[path.join(root,'src/prototype/phase11-dokkaninfo-f1-api.mjs')],outfile:path.join(out,'api.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',plugins:[plugin]});
console.log('Phase F1 DokkanInfo-shaped fixture adapter built: generated/phase11/dokkaninfo-f1/');
