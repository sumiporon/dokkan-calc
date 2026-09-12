import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../generated/phase11/typed-one-tap/api.mjs';
import { fullFixture, partialFixture, unusableFixture, f3Fixture } from '../../prototypes/phase11-f3-prep/fixtures.mjs';

const captureFor = fixture => ({ readUrl: () => fixture.url, readOuterHTML: () => fixture.stageHtml, expectedEventId:fixture.expectedEventId, expectedStageId:fixture.expectedStageId, captureId:`f1-f3-${fixture.expectedStageId}`, now:()=> '2026-09-12T00:00:00.000Z' });
const rejects = (task, code) => assert.rejects(task, error => error?.code === code);
test('F3 capture reads outerHTML once and binds immutable URL/snapshot', async () => {
  let reads=0; const captured=await api.captureF3ImmutableSnapshot(captureFor(fullFixture));
  const once=await api.captureF3ImmutableSnapshot({ ...captureFor(fullFixture), readOuterHTML:()=>{reads++;return fullFixture.stageHtml;} });
  assert.equal(reads,1); assert.equal(captured.capture.snapshotDigest, once.capture.snapshotDigest); assert.equal(once.snapshot.includes('<html'),true);
});
test('F3 capture rejects URL changes and ownership mismatch', async () => {
  let calls=0; await rejects(()=>api.captureF3ImmutableSnapshot({ ...captureFor(fullFixture), readUrl:()=>calls++ ? `${fullFixture.url}?changed` : fullFixture.url }), 'F3_URL_CHANGED');
  await rejects(()=>api.captureF3ImmutableSnapshot({ ...captureFor(fullFixture), expectedStageId:'00000000' }), 'F3_URL_OWNERSHIP');
});
test('F3 scan has complete contract and explicit zero remains known zero', async () => {
  const fixture=f3Fixture('full',{eventId:'991004',stageId:'99100401'}), zero=fixture.stageHtml;
  const capture=await api.captureF3ImmutableSnapshot({ ...captureFor(fixture), readOuterHTML:()=>zero, captureId:'f1-f3-zero' });
  const scan=await api.scanF3Snapshot({snapshot:capture.snapshot,capture:capture.capture,expectedEventId:'991004',expectedStageId:'99100401'});
  assert.equal(scan.coverage.complete,true); assert.equal(scan.observations.find(value=>value.path==='def').value,0);
});
test('F3 partial uses the shared evidence-bound partial validator', async () => {
  const captured=await api.captureF3ImmutableSnapshot(captureFor(partialFixture)); const scan=await api.scanF3Snapshot({snapshot:captured.snapshot,capture:captured.capture,expectedEventId:partialFixture.expectedEventId,expectedStageId:partialFixture.expectedStageId});
  const material=await api.partialFromF3Scan(scan); assert.equal(material.fields.find(value=>value.path==='super-max-per-turn').state,'unavailable'); assert.equal(material.coverage.complete,true);
});
test('F3 classification is full, partial, or unusable only from snapshot scan and validators', async () => {
  const run=fixture=>api.classifyF3Fixture({eventHtml:fixture.eventHtml,expectedEventId:fixture.expectedEventId,expectedStageId:fixture.expectedStageId,captureInput:captureFor(fixture)});
  assert.equal((await run(fullFixture)).classification,'full'); assert.equal((await run(partialFixture)).classification,'partial'); assert.equal((await run(unusableFixture)).classification,'unusable');
  assert.equal((await run(f3Fixture('unknown'))).classification,'partial');
});
test('F3 full output remains equivalent to the existing F1 full canonical/runtime path', async () => {
  const f1=await api.classifyDokkanInfoF1({eventHtml:fullFixture.eventHtml,stageHtml:fullFixture.stageHtml,captureId:'f1-f3-equivalence',revision:1,capturedAt:'2026-09-12T00:00:00.000Z',expectedEventId:fullFixture.expectedEventId,expectedStageId:fullFixture.expectedStageId});
  const f3=await api.classifyF3Fixture({eventHtml:fullFixture.eventHtml,expectedEventId:fullFixture.expectedEventId,expectedStageId:fullFixture.expectedStageId,captureInput:{...captureFor(fullFixture),captureId:'f1-f3-equivalence'}});
  assert.equal(f1.classification,'full');assert.equal(f3.classification,'full');assert.deepEqual(f3.package.canonical,f1.package.canonical);assert.deepEqual(f3.package.runtime,f1.package.runtime);
});
test('F3 fixture path reaches typed save/read-back and unusable retains only failure metadata', async () => {
  const prepare=async fixture=>{const drafts=new api.MemoryTypedDraftStore(),backend=new api.MemoryTypedSessionBackend(),session=new api.TypedOneTapSessionCoordinator({draftStore:drafts,backend}),writer='f3-prep-writer';await session.start({eventId:fixture.expectedEventId,eventName:'F3 fixture',writerId:writer,plan:[{id:`stage:${fixture.expectedStageId}`,kind:'stage-page',stageId:fixture.expectedStageId,url:fixture.url,label:'fixture'}]});return{drafts,backend,session,writer};};
  for (const [fixture, expected] of [[fullFixture,'full'],[partialFixture,'partial'],[unusableFixture,'unusable']]) {
    const state=await prepare(fixture), ticket=await state.session.beginCapture({writerId:state.writer,currentUrl:fixture.url});
    const result=await api.captureF3FixtureHtml({session:state.session,ticket,eventHtml:fixture.eventHtml,expectedEventId:fixture.expectedEventId,expectedStageId:fixture.expectedStageId,captureInput:captureFor(fixture)});
    assert.equal(result.classification,expected);
    const loaded=await state.session.load();
    if(expected==='unusable'){assert.equal(Object.keys(loaded.drafts).length,0);assert.equal(Object.keys(loaded.failures).length,1);assert.equal((await state.drafts.readPayload([...state.drafts.payloads.keys()][0]))??null,null);}
    else {const draft=await state.drafts.load(Object.values(loaded.drafts)[0].draftDigest);assert.equal(draft.classification,expected);assert.equal(draft.capture.snapshotDigest,result.scan.capture.snapshotDigest);if(expected==='partial')assert.equal(draft.payload.capture.snapshotDigest,result.scan.capture.snapshotDigest);}
  }
});
test('F3 coverage and field-state failures are fail closed', async () => {
  const run=async kind=>{const f=f3Fixture(kind);const c=await api.captureF3ImmutableSnapshot(captureFor(f));return api.scanF3Snapshot({snapshot:c.snapshot,capture:c.capture,expectedEventId:f.expectedEventId,expectedStageId:f.expectedStageId});};
  const incomplete=await run('coverage'); assert.equal(incomplete.coverage.complete,false); await rejects(()=>api.partialFromF3Scan(incomplete),'F3_COVERAGE_INCOMPLETE');
  const unknown=f3Fixture('full'); const bad=unknown.stageHtml.replace('data-f3-domain="ai" data-f3-state="known"','data-f3-domain="ai" data-f3-state="unavailable"').replace('data-f3-label="AI" data-f3-value="fixture AI"','data-f3-label="AI" data-f3-value="fixture AI"');
  const c=await api.captureF3ImmutableSnapshot({...captureFor(unknown),readOuterHTML:()=>bad}); await rejects(()=>api.scanF3Snapshot({snapshot:c.snapshot,capture:c.capture,expectedEventId:unknown.expectedEventId,expectedStageId:unknown.expectedStageId}),'F3_UNAVAILABLE_VALUE');
});
test('F3 rejects snapshot/evidence tamper, stale backfill, count substitution, and raw snapshot retention', async () => {
  const c=await api.captureF3ImmutableSnapshot(captureFor(partialFixture)), scan=await api.scanF3Snapshot({snapshot:c.snapshot,capture:c.capture,expectedEventId:partialFixture.expectedEventId,expectedStageId:partialFixture.expectedStageId}), material=await api.partialFromF3Scan(scan);
  const tampered=structuredClone(material);tampered.evidence[0].snapshotDigest='sha256:'+'0'.repeat(64);tampered.contentDigest=await api.digest(Object.fromEntries(Object.entries(tampered).filter(([key])=>key!=='contentDigest')));await rejects(()=>api.validateDokkanInfoF1Partial(tampered),'EVIDENCE_OWNERSHIP');
  const filled=structuredClone(material), count=filled.fields.find(field=>field.path==='super-max-per-turn');count.state='known';count.value=2;filled.contentDigest=await api.digest(Object.fromEntries(Object.entries(filled).filter(([key])=>key!=='contentDigest')));await rejects(()=>api.validateDokkanInfoF1Partial(filled),'PARTIAL_BOUNDARY');
  const retention=new api.MemoryF3RetentionStore();await rejects(()=>retention.save({captureId:'f1-f3-nohtml',createdAt:'2026-09-01T00:00:00.000Z',expiresAt:'2026-09-08T00:00:00.000Z',refs:{snapshot:'<html>forbidden</html>'}}),'F3_RETENTION_FORMAT');
});
test('F3 full persistability rejects forbidden and unbounded records without rewriting them', () => {
  assert.throws(()=>api.validateF3FullPersistability({canonical:{},runtime:{},html:'<html>'}), error=>['F3_FULL_FORBIDDEN_FIELD','F3_FULL_ALLOWLIST'].includes(error?.code));
  assert.throws(()=>api.validateF3FullPersistability({canonical:{},runtime:{},materials:'<script>forbidden</script>'}), error=>error?.code==='F3_FULL_RAW_SOURCE');
  assert.throws(()=>api.validateF3FullPersistability({canonical:{},runtime:{},materials:'x'.repeat(20000)}), error=>error?.code==='F3_FULL_UNBOUNDED_TEXT');
});
test('F3 extension candidate is minimal and contains no source-request or navigation API', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest=JSON.parse(await readFile(new URL('../../prototypes/phase11-f3-prep-extension/manifest.f3-preflight.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.permissions,['storage']); assert.equal(manifest.content_scripts[0].matches.length,1);
  const source=await readFile(new URL('../../prototypes/phase11-f3-prep-extension/f3-content.mjs',import.meta.url),'utf8');
  for(const forbidden of ['fetch(', 'XMLHttpRequest', 'location.assign', 'location.replace', '.reload(', 'window.open(', '<script']) assert.equal(source.includes(forbidden),false,forbidden);
});
test('F3 retention is seven-day, capture scoped, and delete failure never reports success', async () => {
  const store=new api.MemoryF3RetentionStore(), createdAt='2026-09-01T00:00:00.000Z'; const record={captureId:'f1-f3-retention',createdAt,expiresAt:api.expiryAfterSevenDays(createdAt),refs:{session:'s',draft:'d'}};
  await store.save(record); assert.equal((await store.list()).length,1); await rejects(()=>store.cleanup('2026-09-09T00:00:00.000Z',async()=>false),'F3_DELETE_FAILED'); assert.equal((await store.list()).length,1);
  assert.equal(await store.discard(record.captureId,async()=>true),true); assert.equal((await store.list()).length,0);
});
