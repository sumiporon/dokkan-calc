import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStructureDiagnostic, diagnoseStructureSnapshot, LIMITS, snapshotDigest } from '../../src/prototype/phase11-f3-structure-diagnostic.mjs';
import { structureFixture, CASES } from '../../prototypes/phase11-f3-structure/fixtures.mjs';
const inspect = (f, snapshot=f.html) => diagnoseStructureSnapshot({ snapshot, expectedEventId:f.eventId, expectedStageId:f.stageId });
const field = (r,name,filter=()=>true) => r.observations.filter(o=>o.field===name && filter(o));

test('multiple enemies/Supers preserve distinct ordinals and bounded structural paths',async()=>{
  const f=structureFixture(),r=await inspect(f);
  assert.deepEqual(r.counts,{encounters:1,enemies:2,supers:4,conditions:4,observations:r.observations.length});
  assert.equal(new Set(field(r,'hp-condition').map(o=>JSON.stringify(o.parent))).size,4);
  assert.deepEqual(r.issues,[]);assert.equal(r.coverage.status,'unconfirmed');assert.equal(r.coverage.candidateTraversalFinished,true);
  assert.equal(r.snapshotDigest,await snapshotDigest(f.html));
  for(const o of r.observations)for(const c of o.candidates){assert.ok(c.path.length);assert.ok(c.text.length<=LIMITS.text);}
  assert.equal('classification' in r,false);assert.equal('snapshot' in r,false);
});
test('blank Super count never borrows enemy-wide count; literal zero is not blank',async()=>{
  const r=await inspect(structureFixture('blank'));
  const blank=field(r,'super-specific-count',o=>o.parent.enemy===0 && o.parent.attack===0);
  assert.equal(blank.length,2);assert.ok(blank.every(o=>o.state==='blank' && o.candidates[0].text===''));
  assert.ok(field(r,'enemy-wide-count').every(o=>o.candidates[0].text==='7'));
  assert.ok(field(r,'super-specific-count',o=>o.parent.enemy===1).every(o=>o.state==='non-empty-unparsed' && o.candidates[0].text==='0'));
});
test('orphan conditions remain ambiguous without manufactured attack parent',async()=>{
  const r=await inspect(structureFixture('orphan')),orphan=field(r,'orphan-condition')[0];
  assert.equal(orphan.state,'ambiguous');assert.equal('attack' in orphan.parent,false);assert.equal(r.coverage.unresolved,true);
});
test('nested/duplicate enemy roots refuse descendant field assignment',async()=>{
  const r=await inspect(structureFixture('ambiguous'));
  assert.ok(field(r,'enemy-root').some(o=>o.state==='ambiguous'));assert.ok(r.issues.some(i=>i.code==='enemy-selector-conflict'));
  for(const o of field(r,'enemy-root').filter(o=>o.state==='ambiguous'))assert.equal(field(r,'hp',v=>v.parent.enemy===o.parent.enemy).length,0);
});
test('AI/AOE/skill observed without attaching encounter AI to a guessed enemy',async()=>{
  const r=await inspect(structureFixture());
  assert.ok(field(r,'skill-region').every(o=>o.state==='non-empty-unparsed'));assert.equal(field(r,'aoe-region').length,4);
  assert.equal(field(r,'ai-region').length,1);assert.equal('enemy' in field(r,'ai-region')[0].parent,false);
});
test('missing important regions stay missing; duplicate values stay ambiguous',async()=>{
  const r=await inspect(structureFixture('missing'));
  assert.equal(field(r,'hp',o=>o.parent.enemy===0)[0].state,'missing');assert.equal(field(r,'ai-region')[0].state,'missing');
  const dup=await inspect(structureFixture('duplicate'));
  assert.equal(field(dup,'atk',o=>o.parent.enemy===0)[0].state,'ambiguous');assert.equal(field(dup,'atk',o=>o.parent.enemy===0)[0].count,2);
});
test('selector competition and ownership mismatches remain unconfirmed',async()=>{
  const f=structureFixture(),r=await inspect(f,f.html.replace('class="super-header"','class="different-header"'));
  assert.ok(r.issues.some(i=>i.code==='super-selector-conflict'));
  const wrong=await diagnoseStructureSnapshot({snapshot:f.html,expectedEventId:'1',expectedStageId:'2'});
  assert.ok(wrong.issues.some(i=>i.code==='identity-unconfirmed'));
  const dup=await inspect(f,f.html.replace('</head>','<link rel="canonical" href="https://fixture.invalid/events/challenge/1/2"></head>'));
  assert.equal(field(dup,'event-stage-identity')[0].state,'ambiguous');
  const outside=await inspect(f,f.html.replace('</body>','<div class="row d-flex align-items-center"><img src="/cha_type_icon_22.png"></div></body>'));
  assert.equal(field(outside,'unowned-enemy-root')[0].state,'ambiguous');
  assert.equal('encounter' in field(outside,'unowned-enemy-root')[0].parent,false);
});
test('tap boundary: no reads before run, one snapshot, second run rejected',async()=>{
  const f=structureFixture();let reads=0,urlReads=0;const url=`http://127.0.0.1/events/challenge/${f.eventId}/${f.stageId}`;
  const runner=createStructureDiagnostic({readUrl:()=>{urlReads++;return url;},readOuterHTML:()=>{reads++;return f.html;},expectedUrl:url,expectedEventId:f.eventId,expectedStageId:f.stageId});
  assert.equal(reads,0);assert.equal(urlReads,0);const r=await runner.run();assert.equal(reads,1);assert.equal(urlReads,2);assert.equal('snapshot' in r,false);
  await assert.rejects(runner.run(),e=>e.code==='DIAGNOSTIC_ALREADY_RUN');assert.equal(reads,1);
});
test('URL drift and wrong ownership stop without a second snapshot',async()=>{
  const f=structureFixture();let urls=0,reads=0;const url=`http://127.0.0.1/events/challenge/${f.eventId}/${f.stageId}`;
  const options={expectedUrl:url,expectedEventId:f.eventId,expectedStageId:f.stageId,readOuterHTML:()=>{reads++;return f.html;}};
  await assert.rejects(createStructureDiagnostic({...options,readUrl:()=>urls++?url+'?changed':url}).run(),e=>e.code==='DIAGNOSTIC_URL_CHANGED');assert.equal(reads,1);
  await assert.rejects(createStructureDiagnostic({...options,readUrl:()=>url+'?wrong'}).run(),e=>e.code==='DIAGNOSTIC_URL');assert.equal(reads,1);
});
test('no script/form/hidden/comment content or arbitrary attributes escape',async()=>{
  const f=structureFixture(),marker='PRIVATE_CANARY';
  const html=f.html.replace('架空の敵A',`架空の敵A<script>${marker}</script><input value="${marker}"><span hidden>${marker}</span><!--${marker}-->`).replace('class="col-md-2"',`id="${marker}" class="col-md-2" data-token="${marker}"`);
  const serialized=JSON.stringify(await inspect(f,html));assert.equal(serialized.includes(marker),false);assert.equal(/<html|<script/.test(serialized),false);assert.ok(serialized.length<=LIMITS.output);
});
test('long text explicitly truncated and oversize snapshots rejected',async()=>{
  const f=structureFixture(),r=await inspect(f,f.html.replace('架空の敵A','x'.repeat(2000)));
  const c=field(r,'enemy-name')[0].candidates[0];assert.equal(c.truncated,true);assert.equal(c.text.length,160);
  await assert.rejects(inspect(f,'x'.repeat(LIMITS.snapshot+1)),e=>e.code==='DIAGNOSTIC_SNAPSHOT_LIMIT');
});
test('all cases are observations only; source has no network/persistence/intake API',async()=>{
  for(const kind of Object.keys(CASES)){const r=await inspect(structureFixture(kind));assert.equal(r.kind,'structure-diagnostic');assert.equal(r.coverage.status,'unconfirmed');}
  for(const path of ['src/prototype/phase11-f3-structure-diagnostic.mjs','prototypes/phase11-f3-structure/app.mjs']){
    const source=await readFile(new URL('../../'+path,import.meta.url),'utf8');
    assert.equal(/\b(fetch|XMLHttpRequest|WebSocket|indexedDB|localStorage|sessionStorage|sendBeacon|postMessage|eval)\b|\.reload\s*\(|\.sendMessage\s*\(/.test(source),false,path);
    assert.equal(/import .*?(phase11-intake|calculation-core|one-tap-receiver|canonical)/.test(source),false,path);
  }
});
