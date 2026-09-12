import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../generated/phase11/typed-one-tap/api.mjs';
import { eventA, eventB, eventZero } from '../../prototypes/phase11-f2/fixtures.mjs';
import { fixture } from '../../prototypes/phase11-dokkaninfo-f1/fixtures.mjs';

const fails = code => error => error?.code === code;
const writer = 'f2-fixture-writer';
async function ready(event) {
  const draftStore = new api.MemoryTypedDraftStore(), backend = new api.MemoryTypedSessionBackend();
  const session = new api.TypedOneTapSessionCoordinator({ draftStore, backend });
  await session.start({ eventId: event.eventId, eventName: event.eventName, plan: event.plan, writerId: writer });
  return { draftStore, backend, session, event };
}
async function capture(value, index) {
  const ticket = await value.session.beginCapture({ writerId: writer, currentUrl: value.event.plan[index].url });
  return api.captureF2FixtureHtml({ session: value.session, ticket, html: value.event.pages[index] });
}
async function next(value, index) { return value.session.nextNavigation({ writerId: writer, currentUrl: value.event.plan[index].url }); }
const expectation = value => ({ sessionId:value.sessionId, writerId:value.writerId, writerGeneration:value.writerGeneration, revision:value.revision });

test('F2 Event A routes each HTML fixture through F1 then preserves ordered full → partial → full drafts', async () => {
  const value = await ready(eventA);
  const first = await capture(value, 0); assert.equal(first.classification, 'full'); assert.equal((await next(value, 0)).kind, 'navigate');
  const second = await capture(value, 1); assert.equal(second.classification, 'partial'); assert.equal((await next(value, 1)).kind, 'navigate');
  const third = await capture(value, 2); assert.equal(third.classification, 'full'); assert.equal((await next(value, 2)).kind, 'final-confirmation');
  const summary = await value.session.finalSummary();
  assert.deepEqual({full:summary.full,partial:summary.partial,total:summary.total},{full:2,partial:1,total:3});
  assert.deepEqual(summary.ordered.map(stage => [stage.stageId,stage.classification,stage.reference.kind]), [
    ['99002101','full','full-package'], ['99002102','partial','partial-material'], ['99002103','full','full-package']
  ]);
  const saved = await value.session.load();
  const partial = await value.draftStore.load(saved.drafts['stage:99002102'].draftDigest);
  const finalFull = await value.draftStore.load(saved.drafts['stage:99002103'].draftDigest);
  assert.equal(partial.payload.formatVersion, 'phase11-dokkaninfo-f1-partial-1');
  assert.ok(partial.payload.evidence.length > 0); assert.equal(partial.payload.coverage.complete, true);
  assert.equal(finalFull.payload.kind, undefined); assert.equal(Object.hasOwn(finalFull.payload, 'fields'), false);
  const direct = await api.fullViaExistingF1Path(eventA.pages[2]);
  assert.deepEqual(finalFull.payload.canonical, direct.canonical); assert.deepEqual(finalFull.payload.runtime, direct.runtime);
});

test('F2 Event B retains full/partial, stores only F1 failure evidence, and makes an inspection batch', async () => {
  const value = await ready(eventB); await capture(value,0); await next(value,0); await capture(value,1); await next(value,1);
  const stopped = await capture(value,2); assert.equal(stopped.classification,'unusable');
  const saved = await value.session.load(); assert.equal(saved.status,'stopped-unusable'); assert.equal(saved.currentIndex,2);
  assert.deepEqual(Object.keys(saved.drafts),['stage:99002201','stage:99002202']); assert.deepEqual(Object.keys(saved.failures),['stage:99002203']);
  assert.equal(value.draftStore.payloads.size,2); assert.equal(value.draftStore.drafts.size,2); assert.equal(value.draftStore.failures.size,1);
  await assert.rejects(next(value,2),fails('UNUSABLE_STOP'));
  const summary = await value.session.readOnlySummary(); assert.deepEqual({full:summary.full,partial:summary.partial,unusable:summary.unusable,unvisited:summary.unvisited,total:summary.total},{full:1,partial:1,unusable:1,unvisited:1,total:4});
  assert.deepEqual(summary.stages.map(stage=>stage.state),['full','partial','unusable','unvisited']);
  const failure = await value.draftStore.loadFailure(saved.failures['stage:99002203'].failureDigest);
  assert.equal(failure.formatVersion,'phase11-unusable-stage-failure-f1-1'); assert.equal(failure.sourceEvidence.stageId,'99002203'); assert.match(failure.sourceEvidence.snapshotDigest,/^sha256:/);
  const batch = await api.createTypedInspectionBatch({session:value.session}); const review = await new api.TypedInspectionReceiver().receive(batch);
  assert.deepEqual(review.counts,{full:1,partial:1,unusable:1,unvisited:1,total:4});
  assert.equal(review.stages[1].ownerMessage,'部分材料保存済み・計算可否は未判定です');
  assert.equal(batch.stages[1].draft.payload.coverage.complete,true); assert.ok(batch.stages[1].draft.payload.evidence.length > 0);
  assert.equal(batch.stages[3].classification,'unvisited');
});

test('F2 accepts only an HTML receipt and rejects forged classification, ownership, incomplete coverage, and type masquerading', async () => {
  const value = await ready(eventA); const ticket = await value.session.beginCapture({writerId:writer,currentUrl:eventA.plan[0].url});
  await assert.rejects(api.captureF2FixtureHtml({session:value.session,ticket,html:{classification:'full'}}),fails('FORMAT'));
  await assert.rejects(api.captureF2FixtureHtml({session:value.session,ticket,html:eventB.pages[0]}),fails('F2_PLAN_OWNERSHIP'));
  const coveragePage=fixture('E',{eventId:'990024',stageId:'99002401',stageName:'coverage',stages:[{id:'99002401',name:'coverage'}]});
  const incomplete=await ready({eventId:'990024',eventName:'coverage',plan:[{id:'stage:99002401',kind:'stage-page',stageId:'99002401',url:'https://fixture.invalid/f2/990024/99002401',label:'coverage'}],pages:[coveragePage]});
  const stopped=await capture(incomplete,0); assert.equal(stopped.classification,'unusable'); assert.equal((await incomplete.session.load()).status,'stopped-unusable');
  const partial = await api.classifyDokkanInfoF1(eventA.pages[1]);
  await assert.rejects(api.makeTypedDraft({classification:'full',stageId:'99002102',capture:partial.material.capture,ticket:{sessionId:'x',unitId:'stage:99002102',writerId:'w',writerGeneration:1,sessionRevision:1},package:partial.material}),fails('PACKAGE_VERSION'));
  const full = await api.classifyDokkanInfoF1(eventA.pages[0]);
  await assert.rejects(api.makeTypedDraft({classification:'partial',stageId:'99002101',capture:full.scan.capture,ticket:{sessionId:'x',unitId:'stage:99002101',writerId:'w',writerGeneration:1,sessionRevision:1},material:full.package}),fails('FORMAT'));
});

test('F2 detects stored F1 evidence, rule, snapshot, draft, session, and old-value tampering before it can navigate', async () => {
  const value = await ready(eventA); await capture(value,0); await next(value,0); await capture(value,1);
  const session = await value.session.load(), entry = session.drafts['stage:99002102']; const stored = value.draftStore.payloads.get(entry.contentDigest);
  const material = structuredClone(stored.payload); material.evidence[0].captureId='f1-other'; material.contentDigest=await api.digest(Object.fromEntries(Object.entries(material).filter(([key])=>key!=='contentDigest')));
  value.draftStore.payloads.set(entry.contentDigest,{classification:'partial',payload:material});
  await assert.rejects(value.session.load(),fails('EVIDENCE_OWNERSHIP'));

  const other = await ready(eventA); await capture(other,0); await next(other,0); await capture(other,1);
  const loaded=await other.session.load(), otherEntry=loaded.drafts['stage:99002102'], payload=structuredClone(other.draftStore.payloads.get(otherEntry.contentDigest));
  const unavailable=payload.payload.fields.find(field=>field.state==='unavailable'); unavailable.state='known'; unavailable.value=1; payload.payload.contentDigest=await api.digest(Object.fromEntries(Object.entries(payload.payload).filter(([key])=>key!=='contentDigest')));
  other.draftStore.payloads.set(otherEntry.contentDigest,payload);
  await assert.rejects(other.session.load(),fails('KNOWN_INVALID'));

  const draftTamper=await ready(eventA); await capture(draftTamper,0); const d=(await draftTamper.session.load()).drafts['stage:99002101'];
  draftTamper.draftStore.drafts.set(d.draftDigest,{...draftTamper.draftStore.drafts.get(d.draftDigest),reference:{kind:'partial-material',contentDigest:d.contentDigest}});
  await assert.rejects(draftTamper.session.load(),fails('DRAFT_REFERENCE'));
});

test('F2 keeps the typed save gate closed for snapshot/rule/read-back/session conflicts', async () => {
  const snapshot=await ready(eventA); await capture(snapshot,0); await next(snapshot,0); await capture(snapshot,1);
  const snapshotState=await snapshot.session.load(), snapshotEntry=snapshotState.drafts['stage:99002102'], snapshotPayload=structuredClone(snapshot.draftStore.payloads.get(snapshotEntry.contentDigest));
  snapshotPayload.payload.evidence[0].snapshotDigest='sha256:'+'0'.repeat(64); snapshotPayload.payload.contentDigest=await api.digest(Object.fromEntries(Object.entries(snapshotPayload.payload).filter(([key])=>key!=='contentDigest')));
  snapshot.draftStore.payloads.set(snapshotEntry.contentDigest,snapshotPayload); await assert.rejects(snapshot.session.load(),fails('EVIDENCE_OWNERSHIP'));

  const rules=await ready(eventA); await capture(rules,0); await next(rules,0); await capture(rules,1);
  const ruleState=await rules.session.load(), ruleEntry=ruleState.drafts['stage:99002102'], rulePayload=structuredClone(rules.draftStore.payloads.get(ruleEntry.contentDigest));
  rulePayload.payload.rules.interpretation='unexpected-rule'; rulePayload.payload.contentDigest=await api.digest(Object.fromEntries(Object.entries(rulePayload.payload).filter(([key])=>key!=='contentDigest')));
  rules.draftStore.payloads.set(ruleEntry.contentDigest,rulePayload); await assert.rejects(rules.session.load(),fails('PARTIAL_BOUNDARY'));

  const readBack=await ready(eventA); const classified=await api.classifyDokkanInfoF1(eventA.pages[1]); readBack.draftStore.tamperNextPayloadKey=classified.material.contentDigest;
  const readTicket=await readBack.session.beginCapture({writerId:writer,currentUrl:eventA.plan[0].url});
  await assert.rejects(api.captureF2FixtureHtml({session:readBack.session,ticket:readTicket,html:eventA.pages[1]}),fails('F2_PLAN_OWNERSHIP'));
  const partialOnly=await ready({eventId:'990021',eventName:'partial',plan:[eventA.plan[1]],pages:[eventA.pages[1]]}); partialOnly.draftStore.tamperNextPayloadKey=classified.material.contentDigest;
  await assert.rejects(capture(partialOnly,0),fails('CONTENT_DIGEST'));

  const conflict=await ready(eventA); const original=conflict.draftStore.save.bind(conflict.draftStore);
  conflict.draftStore.save=async value=>{const stored=await original(value);conflict.backend.value={...conflict.backend.value,revision:conflict.backend.value.revision+1};return stored;};
  await assert.rejects(capture(conflict,0),fails('STALE_CAPTURE')); assert.equal(Object.keys((await conflict.session.load()).drafts).length,0);
});

test('F2 retains explicit known zero and Phase D restart/takeover safeguards for F1-derived material', async () => {
  const zero=await ready(eventZero); const result=await capture(zero,0); assert.equal(result.classification,'full');
  assert.equal(result.scan.encounters[0].enemies[0].fields.find(field=>field.path==='enemy.def').value,0);
  const zeroDraft=await zero.draftStore.load((await zero.session.load()).drafts['stage:99002301'].draftDigest);
  assert.ok(JSON.stringify(zeroDraft.payload).includes('\\"def\\": 0'), 'existing full package preserves the displayed zero through save/read-back');

  const value=await ready(eventA); await capture(value,0); await next(value,0); await capture(value,1);
  const oldTicket=await value.session.beginCapture({writerId:writer,currentUrl:eventA.plan[2].url});
  const reloaded=new api.TypedOneTapSessionCoordinator({draftStore:value.draftStore,backend:value.backend}); const before=await reloaded.load();
  await assert.rejects(reloaded.beginCapture({writerId:'f2-new-writer',currentUrl:eventA.plan[2].url}),fails('WRITER_MISMATCH'));
  const taken=await reloaded.takeover({writerId:'f2-new-writer',expected:expectation(before)}); assert.equal(taken.writerGeneration,before.writerGeneration+1);
  await assert.rejects(api.captureF2FixtureHtml({session:value.session,ticket:oldTicket,html:eventA.pages[2]}),fails('STALE_CAPTURE'));
  const ticket=await reloaded.beginCapture({writerId:'f2-new-writer',currentUrl:eventA.plan[2].url}); const final=await api.captureF2FixtureHtml({session:reloaded,ticket,html:eventA.pages[2]}); assert.equal(final.classification,'full');
});
