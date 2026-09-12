/** Rebuild the unsigned F3 preflight archive from readable source. */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { writeZip } from './zip.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const out=path.join(root,'dist'),addon=path.join(out,'preflight');
const require=createRequire(import.meta.url),Ajv=require('ajv/dist/2020').default;
const ajv=new Ajv({strict:true,allowUnionTypes:true,allErrors:true,code:{source:true}});
require('ajv-formats')(ajv);
const ids={};
for(const [key,name] of Object.entries({canonical:'enemy-data-v2.canonical',runtime:'enemy-data-runtime-v1'})){
  const schema=JSON.parse(await readFile(path.join(root,'schemas',`${name}.schema.json`),'utf8'));
  ajv.addSchema(schema);ids[key]=schema.$id;
}
const validatorDir=path.join(root,'generated','phase11','typed-one-tap');
await mkdir(validatorDir,{recursive:true});
const validators=path.join(validatorDir,'validators.cjs');
await writeFile(validators,require('ajv/dist/standalone').default(ajv,ids));
const plugin={name:'f3-existing-validators',setup(builder){builder.onResolve({filter:/generated\/phase11\/validators\.cjs$/},()=>({path:validators}));}};
const source=path.join(root,'prototypes','phase11-f3-prep-extension');
await rm(out,{recursive:true,force:true});await mkdir(addon,{recursive:true});
await cp(path.join(source,'manifest.f3-preflight.json'),path.join(addon,'manifest.json'));
await cp(path.join(source,'review.html'),path.join(addon,'review.html'));
await cp(path.join(source,'review.css'),path.join(addon,'review.css'));
for(const [name,entry] of Object.entries({'content.js':'f3-content.mjs','background.js':'f3-background.mjs','review.js':'f3-review.mjs'})){
  await build({absWorkingDir:root,entryPoints:[path.join(source,entry)],outfile:path.join(addon,name),bundle:true,format:'iife',platform:'browser',target:'firefox128',minify:true,legalComments:'none',plugins:[plugin],define:{PHASE11_F3_FIXTURE_MODE:'false'}});
  if((await stat(path.join(addon,name))).size>=5*1024*1024)throw new Error(`AMO JavaScript size limit exceeded: ${name}`);
}
const archive=path.join(out,'phase11-f3-preflight-unsigned.zip');
await writeZip(addon,archive);
const digest=createHash('sha256').update(await readFile(archive)).digest('hex').toUpperCase();
const expected=(await readFile(path.join(root,'expected-output-sha256.txt'),'utf8')).trim();
if(digest!==expected)throw new Error(`Output SHA-256 mismatch: ${digest}`);
console.log(`Rebuilt ${archive} (${digest})`);
