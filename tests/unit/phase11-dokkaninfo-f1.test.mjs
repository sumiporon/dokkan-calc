import test from 'node:test'; import assert from 'node:assert/strict';
import * as api from '../../generated/phase11/dokkaninfo-f1/api.mjs';
import { fixture } from '../../prototypes/phase11-dokkaninfo-f1/fixtures.mjs';
const reject = (code) => ({ code });
async function material(caseId) { const result=await api.classifyDokkanInfoF1(fixture(caseId)); assert.equal(result.classification,'partial'); return result.material; }
test('F1 A-F classify self-authored immutable snapshots without a live request', async () => {
  const a=await api.classifyDokkanInfoF1(fixture('A')); assert.equal(a.classification,'full'); assert.equal(Object.hasOwn(a.package,'canonical'),true); assert.equal(Object.hasOwn(a.package,'fields'),false);
  const b=await api.classifyDokkanInfoF1(fixture('B')); assert.equal(b.classification,'partial'); assert.ok(b.material.fields.some(f=>f.path==='attack.maxPerTurn'&&f.state==='unavailable')); assert.ok(b.material.evidence.some(e=>e.fieldPath==='attack.maxPerTurn'&&e.valueText===''&&e.terminal==='blank'));
  const c=await api.classifyDokkanInfoF1(fixture('C')); assert.equal(c.classification,'partial'); assert.ok(c.material.fields.some(f=>f.state==='unknown')); assert.ok(c.material.uninterpreted.length>0);
  const d=await api.classifyDokkanInfoF1(fixture('D')); assert.equal(d.classification,'unusable'); assert.match(d.code,/CONDITION|ATTACK/);
  const e=await api.classifyDokkanInfoF1(fixture('E')); assert.equal(e.classification,'unusable'); assert.equal(e.scan.coverage.complete,false);
  const f=await api.classifyDokkanInfoF1(fixture('F')); assert.equal(f.classification,'full'); assert.equal(f.scan.encounters[0].enemies[0].fields.find(x=>x.path==='enemy.def').value,0);
});
test('F1 uses the unchanged full package path for a complete snapshot', async () => {
  const input=fixture('A'); const old=await api.fullViaExistingF1Path(input); const viaF1=await api.classifyDokkanInfoF1(input); assert.equal(viaF1.classification,'full'); assert.deepEqual(viaF1.package.canonical,old.canonical); assert.deepEqual(viaF1.package.runtime,old.runtime);
});
test('F1 partial validator fail-closes field, evidence, version, snapshot, and digest tampering', async () => {
  for (const [name, change, code] of [
    ['blank as unknown',m=>{const f=m.fields.find(x=>x.state==='unavailable');f.state='unknown';},'UNKNOWN_INVALID'],
    ['nonempty unknown as unavailable',m=>{const f=m.fields.find(x=>x.state==='unknown');f.state='unavailable';},'UNAVAILABLE_INVALID'],
    ['capture mixed',m=>{m.evidence[0].captureId='other';},'EVIDENCE_OWNERSHIP'],
    ['rule mismatch',m=>{m.rules.extraction='other';},'PARTIAL_BOUNDARY'],
    ['snapshot mismatch',m=>{m.evidence[0].snapshotDigest='sha256:'+'0'.repeat(64);},'EVIDENCE_OWNERSHIP'],
    ['stage ownership mismatch',m=>{m.evidence[0].stageId='99000102';},'EVIDENCE_OWNERSHIP'],
    ['coverage incomplete',m=>{m.coverage.complete=false;},'PARTIAL_BOUNDARY'],
    ['known-value backfill',m=>{const f=m.fields.find(x=>x.state==='unavailable');f.state='known';f.value=1;},'KNOWN_INVALID'],
    ['unknown-value backfill',m=>{const f=m.fields.find(x=>x.state==='unknown');f.state='known';f.value=1;},'KNOWN_INVALID'],
    ['partial as full package',m=>{m.kind='full';},'PARTIAL_FORMAT'],
  ]) { const m=structuredClone(await material(name==='nonempty unknown as unavailable'?'C':'B')); change(m); m.contentDigest=await api.digest(Object.fromEntries(Object.entries(m).filter(([k])=>k!=='contentDigest'))); await assert.rejects(api.validateF1Partial(m),reject(code),name); }
  const partial=await material('B'); await assert.rejects(api.validatePackage(partial),reject('PACKAGE_VERSION'));
  assert.equal(JSON.stringify(partial).includes('<html'),false, 'partial material has bounded evidence, never source markup');
});
test('F1 fail-closes independently on enemy, attack, and condition ownership boundaries', async () => {
  const base=fixture('A');
  const enemy=base.stageHtml.replace('</body>','<img src="/layout/cha_type_icon_22.png"></body>');
  const attack=base.stageHtml.replace('/sp_skill_icon_etc.png','/not-a-super-icon.png');
  const condition=base.stageHtml.replace('<div class="super-header">','<div>HPレンジ: 0% ~ 100%</div><div class="super-header">');
  for (const html of [enemy,attack,condition]) { const result=await api.classifyDokkanInfoF1({...base,stageHtml:html}); assert.equal(result.classification,'unusable'); assert.equal(result.scan?.coverage.complete,false); }
});
test('F1 scan rejects missing nodes, duplicate/conflicting labels, ambiguous boundaries, ownership and unexpected structure', async () => {
  const base=fixture('A'); const variants=[
    base.stageHtml.replace('最大ATK/ターン: 1</div>',''),
    base.stageHtml.replace('最大ATK/ターン: 1</div>','最大ATK/ターン: 1</div><div>最大ATK/ターン: 2</div>'),
    base.stageHtml.replace('<div class="super-header">','<div>HPレンジ: 0% ~ 100%</div><div class="super-header">'),
    base.stageHtml.replace('https://jpnja.dokkaninfo.com/events/challenge/990001/99000101','https://jpnja.dokkaninfo.com/events/challenge/990001/99000102'),
    base.stageHtml.replace('row d-flex align-items-center','row unexpected-layout')
  ];
  for (const [index, html] of variants.entries()) { const r=await api.classifyDokkanInfoF1({...base,stageHtml:html}); assert.equal(r.classification,'unusable', `variant ${index}`); }
});
