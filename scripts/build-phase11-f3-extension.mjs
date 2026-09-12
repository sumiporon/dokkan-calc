/** Unsigned F3 preflight build. It uses only local source and self-authored fixture test assets. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { writeZip } from '../amo/phase11-one-tap-reviewer-source/zip.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'prototypes/phase11-f3-prep-extension');
const base=path.join(root,'generated/phase11-f3-extension');
const validators=path.join(root,'generated/phase11/typed-one-tap/validators.cjs');
const plugin={name:'f3-existing-validators',setup(builder){builder.onResolve({filter:/generated\/phase11\/validators\.cjs$/},()=>({path:validators}));}};
const entries={ 'content.js':'f3-content.mjs','background.js':'f3-background.mjs','review.js':'f3-review.mjs' };
for(const [mode,fixture] of [['preflight',false],['fixture-test',true]]){
  const out=path.join(base,mode);await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
  await cp(path.join(source,fixture?'manifest.chromium-test.json':'manifest.f3-preflight.json'),path.join(out,'manifest.json'));
  await cp(path.join(source,'review.html'),path.join(out,'review.html'));await cp(path.join(source,'review.css'),path.join(out,'review.css'));
  for(const [name,entry] of Object.entries(entries)){
    await build({absWorkingDir:root,entryPoints:[path.join(source,entry)],outfile:path.join(out,name),bundle:true,format:'iife',platform:'browser',target:'firefox128',minify:true,legalComments:'none',plugins:[plugin],define:{PHASE11_F3_FIXTURE_MODE:String(fixture)}});
    if((await readFile(path.join(out,name))).length>=5*1024*1024)throw new Error(`F3 JavaScript size limit exceeded: ${name}`);
  }
}
await writeZip(path.join(base,'preflight'),path.join(base,'phase11-f3-preflight-unsigned.zip'));
console.log(`Unsigned F3 preflight built: ${path.join(base,'phase11-f3-preflight-unsigned.zip')}`);
