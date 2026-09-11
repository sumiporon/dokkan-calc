import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../generated/phase11/typed-one-tap/api.mjs';
import { sourceFixture } from '../../prototypes/phase11-partial/fixtures.mjs';
import { dokkanInfoEventHtml, dokkanInfoStageHtml } from '../fixtures/phase11/dokkaninfo-source.mjs';

const eventId = '990011', eventUrl = `https://jpnja.dokkaninfo.com/events/challenge/${eventId}`;
const plan = [
  { id: 'stage:99001102', kind: 'stage-page', stageId: '99001102', url: 'https://fixture.invalid/#full', label: '完全stage' },
  { id: 'stage:99001101', kind: 'stage-page', stageId: '99001101', url: 'https://fixture.invalid/#partial', label: '部分stage' }
];
async function candidates() {
  const event = api.inspectDokkanInfoDocument({ html: dokkanInfoEventHtml({ eventId, stages: [{ id: '99001102', name: '完全stage' }, { id: '99001101', name: '部分stage' }] }), currentUrl: eventUrl, sourceUrl: eventUrl, capturedAt: '2026-09-01T00:00:00.000Z' });
  const stageUrl = `${eventUrl}/99001102`;
  const stage = api.inspectDokkanInfoDocument({ html: dokkanInfoStageHtml({ eventId, stageId: '99001102', stageName: '完全stage', normalAtk: 600000 }), currentUrl: stageUrl, sourceUrl: stageUrl, capturedAt: '2026-09-01T00:00:00.000Z' });
  const pack = await api.buildDokkanInfoStagePackage(event.material, stage.material);
  const partial = await api.inspectFictionalPartial(sourceFixture('C'));
  return {
    full: { classification: 'full', capture: { id: 'fictional-capture-full-stage-1', revision: 1, observedAt: '2026-09-01T00:00:00.000Z' }, package: pack, fingerprint: await api.dokkanInfoStageFingerprint(stage.material) },
    partial: { classification: 'partial', capture: partial.material.capture, material: partial.material, fingerprint: partial.material.contentDigest }
  };
}
const failCode = code => error => error?.code === code;
const takeoverExpected = value => ({ sessionId: value.sessionId, writerId: value.writerId, writerGeneration: value.writerGeneration, revision: value.revision });
async function ready() {
  const draftStore = new api.MemoryTypedDraftStore(), backend = new api.MemoryTypedSessionBackend();
  const session = new api.TypedOneTapSessionCoordinator({ draftStore, backend });
  await session.start({ eventId, eventName: '架空event', plan, writerId: 'tab:1' });
  return { draftStore, backend, session, candidate: await candidates() };
}
async function ticket(session, index, writerId = 'tab:1') { return session.beginCapture({ writerId, currentUrl: plan[index].url }); }

test('Phase A typed one-tap persists a full stage then a zero-capability partial stage before each next navigation', async () => {
  const { session, candidate } = await ready();
  const first = await ticket(session, 0); const full = await session.commitCapture(first, candidate.full);
  assert.equal(full.session.drafts[first.unitId].classification, 'full');
  assert.equal((await session.nextNavigation({ writerId: 'tab:1', currentUrl: plan[0].url })).kind, 'navigate');
  const second = await ticket(session, 1); const partial = await session.commitCapture(second, candidate.partial);
  assert.equal(partial.session.drafts[second.unitId].classification, 'partial');
  const noCore = new Proxy({}, { get() { throw new Error('core must not receive unknown ATK'); } });
  assert.equal((await api.calculatePartial(candidate.partial.material, 'damage', {}, noCore)).status, 'blocked');
  assert.equal((await session.nextNavigation({ writerId: 'tab:1', currentUrl: plan[1].url })).kind, 'final-confirmation');
});

test('Full failure is not rescued as partial, and partial cannot masquerade as full', async () => {
  const { session, candidate } = await ready(); const first = await ticket(session, 0);
  await assert.rejects(session.commitCapture(first, { ...candidate.full, package: candidate.partial.material }), failCode('PACKAGE_VERSION'));
  assert.equal(Object.keys((await session.load()).drafts).length, 0);
  const next = await ready(); const validFirst = await ticket(next.session, 0); await next.session.commitCapture(validFirst, next.candidate.full);
  const second = await ticket(next.session, 1);
  await assert.rejects(next.session.commitCapture(second, { ...next.candidate.partial, classification: 'full', package: next.candidate.partial.material, material: undefined }), failCode('PACKAGE_VERSION'));
});

for (const [name, setup, code] of [
  ['partial validator failure', async ({ candidate }) => { candidate.partial.material.contentDigest = 'sha256:' + '0'.repeat(64); }, 'CONTENT_DIGEST'],
  ['payload save failure', async ({ draftStore }) => { draftStore.failPayloadWrites = true; }, 'PAYLOAD_SAVE_FAILED'],
  ['payload read-back mismatch', async ({ draftStore, candidate }) => { draftStore.tamperNextPayloadKey = candidate.partial.material.contentDigest; }, 'CONTENT_DIGEST'],
  ['typed draft save failure', async ({ draftStore }) => { draftStore.failDraftWrites = true; }, 'TYPED_DRAFT_SAVE_FAILED'],
  ['typed draft read-back mismatch', async ({ draftStore }) => { draftStore.tamperNextDraftRead = true; }, 'DRAFT_DIGEST'],
  ['session save failure', async ({ backend }) => { backend.failWrites = true; }, 'SESSION_SAVE_FAILED'],
  ['stale ticket', async ({ backend }) => { backend.value = { ...backend.value, revision: backend.value.revision + 1 }; }, 'STALE_CAPTURE'],
  ['writer generation changed', async ({ backend }) => { backend.value = { ...backend.value, writerGeneration: backend.value.writerGeneration + 1, revision: backend.value.revision + 1 }; }, 'STALE_CAPTURE'],
  ['session revision changed after payload save', async ({ draftStore, backend }) => { const save = draftStore.save.bind(draftStore); draftStore.save = async value => { const stored = await save(value); backend.value = { ...backend.value, revision: backend.value.revision + 1 }; return stored; }; }, 'STALE_CAPTURE']
]) test(`Phase A stops on ${name} and keeps an earlier valid stage/session`, async () => {
  const value = await ready(); const first = await ticket(value.session, 0); await value.session.commitCapture(first, value.candidate.full);
  const second = await ticket(value.session, 1); await setup(value);
  await assert.rejects(value.session.commitCapture(second, value.candidate.partial), failCode(code));
  const restored = await value.session.load(); assert.equal(Object.keys(restored.drafts).length, 1); assert.equal(restored.drafts[first.unitId].classification, 'full');
  await assert.rejects(value.session.nextNavigation({ writerId: 'tab:1', currentUrl: plan[1].url }), failCode('NOT_READY'));
});

test('Digest change in a previously saved partial is detected before navigation', async () => {
  const { session, draftStore, candidate } = await ready(); const first = await ticket(session, 0); await session.commitCapture(first, candidate.full);
  const second = await ticket(session, 1); const saved = await session.commitCapture(second, candidate.partial);
  const entry = saved.session.drafts[second.unitId]; const stored = draftStore.drafts.get(entry.draftDigest); draftStore.drafts.set(entry.draftDigest, { ...stored, contentDigest: 'sha256:' + '0'.repeat(64) });
  await assert.rejects(session.nextNavigation({ writerId: 'tab:1', currentUrl: plan[1].url }));
});

const mixedPlan = [
  { id: 'stage:99001102', kind: 'stage-page', stageId: '99001102', url: 'https://fixture.invalid/#full-1', label: '完全stage 1' },
  { id: 'stage:99001101', kind: 'stage-page', stageId: '99001101', url: 'https://fixture.invalid/#partial', label: '部分stage' },
  { id: 'stage:99001103', kind: 'stage-page', stageId: '99001103', url: 'https://fixture.invalid/#full-2', label: '完全stage 2' }
];
async function mixedCandidates() {
  const event = api.inspectDokkanInfoDocument({ html: dokkanInfoEventHtml({ eventId, stages: mixedPlan.map(stage => ({ id: stage.stageId, name: stage.label })) }), currentUrl: eventUrl, sourceUrl: eventUrl, capturedAt: '2026-09-01T00:00:00.000Z' });
  const full = async (stageId, label, normalAtk) => {
    const stageUrl = `${eventUrl}/${stageId}`;
    const stage = api.inspectDokkanInfoDocument({ html: dokkanInfoStageHtml({ eventId, stageId, stageName: label, normalAtk }), currentUrl: stageUrl, sourceUrl: stageUrl, capturedAt: '2026-09-01T00:00:00.000Z' });
    const pack = await api.buildDokkanInfoStagePackage(event.material, stage.material);
    return { classification: 'full', capture: { id: `fictional-capture-full-${stageId}`, revision: 1, observedAt: '2026-09-01T00:00:00.000Z' }, package: pack, fingerprint: await api.dokkanInfoStageFingerprint(stage.material) };
  };
  const partial = await api.inspectFictionalPartial(sourceFixture('C'));
  return { first: await full('99001102', '完全stage 1', 600000), partial: { classification: 'partial', capture: partial.material.capture, material: partial.material, fingerprint: partial.material.contentDigest }, last: await full('99001103', '完全stage 2', 700000) };
}
async function readyMixed() {
  const draftStore = new api.MemoryTypedDraftStore(), backend = new api.MemoryTypedSessionBackend();
  const session = new api.TypedOneTapSessionCoordinator({ draftStore, backend });
  await session.start({ eventId, eventName: '架空mixed event', plan: mixedPlan, writerId: 'tab:mixed' });
  return { draftStore, backend, session, candidate: await mixedCandidates() };
}
async function mixedTicket(session, index) { return session.beginCapture({ writerId: 'tab:mixed', currentUrl: mixedPlan[index].url }); }

test('Phase B preserves ordered full → partial → full typed drafts and derives the final count from those drafts', async () => {
  const { session, draftStore, candidate } = await readyMixed();
  const first = await mixedTicket(session, 0); await session.commitCapture(first, candidate.first);
  assert.equal((await session.nextNavigation({ writerId: 'tab:mixed', currentUrl: mixedPlan[0].url })).kind, 'navigate');
  const second = await mixedTicket(session, 1); await session.commitCapture(second, candidate.partial);
  assert.equal((await session.nextNavigation({ writerId: 'tab:mixed', currentUrl: mixedPlan[1].url })).kind, 'navigate');
  const third = await mixedTicket(session, 2); await session.commitCapture(third, candidate.last);
  assert.equal((await session.nextNavigation({ writerId: 'tab:mixed', currentUrl: mixedPlan[2].url })).kind, 'final-confirmation');
  const summary = await session.finalSummary();
  assert.deepEqual({ full: summary.full, partial: summary.partial, total: summary.total }, { full: 2, partial: 1, total: 3 });
  assert.deepEqual(summary.ordered.map(value => [value.stageId, value.classification, value.reference.kind]), [
    ['99001102', 'full', 'full-package'], ['99001101', 'partial', 'partial-material'], ['99001103', 'full', 'full-package']
  ]);
  const storedSession = await session.load();
  const drafts = await Promise.all(summary.ordered.map(value => draftStore.load(storedSession.drafts[`stage:${value.stageId}`].draftDigest)));
  assert.equal(drafts[0].payload.kind, undefined); assert.equal(drafts[1].payload.kind, 'partial'); assert.equal(drafts[2].payload.kind, undefined);
  assert.notEqual(drafts[0].contentDigest, drafts[1].contentDigest); assert.notEqual(drafts[1].contentDigest, drafts[2].contentDigest);
});

test('Phase B rejects out-of-order or duplicate plans and refuses mismatched final draft references or counts', async () => {
  const { session, backend, candidate } = await readyMixed();
  await assert.rejects(mixedTicket(session, 1), failCode('STAGE_ORDER'));
  const duplicate = new api.TypedOneTapSessionCoordinator({ draftStore: new api.MemoryTypedDraftStore(), backend: new api.MemoryTypedSessionBackend() });
  await assert.rejects(duplicate.start({ eventId, eventName: 'duplicate', plan: [...mixedPlan, { ...mixedPlan[2], url: 'https://fixture.invalid/#duplicate' }], writerId: 'tab:duplicate' }), failCode('PLAN_INVALID'));
  const first = await mixedTicket(session, 0); await session.commitCapture(first, candidate.first);
  backend.value = { ...backend.value, plan: [backend.value.plan[1], backend.value.plan[0], backend.value.plan[2]] };
  await assert.rejects(session.load(), failCode('PLAN_DIGEST'));

  const complete = await readyMixed();
  for (const [index, value] of [[0, complete.candidate.first], [1, complete.candidate.partial], [2, complete.candidate.last]]) {
    const current = await mixedTicket(complete.session, index); await complete.session.commitCapture(current, value);
  }
  const finalSession = await complete.session.load();
  const firstKey = mixedPlan[0].id;
  complete.backend.value = { ...complete.backend.value, drafts: { ...finalSession.drafts, [firstKey]: { ...finalSession.drafts[firstKey], stageId: '99001101' } } };
  await assert.rejects(complete.session.finalSummary(), failCode('SESSION_DRAFT'));

  const missing = await readyMixed();
  for (const [index, value] of [[0, missing.candidate.first], [1, missing.candidate.partial], [2, missing.candidate.last]]) {
    const current = await mixedTicket(missing.session, index); await missing.session.commitCapture(current, value);
  }
  const finished = await missing.session.load();
  const { [mixedPlan[2].id]: removed, ...drafts } = finished.drafts;
  missing.backend.value = { ...missing.backend.value, drafts };
  await assert.rejects(missing.session.finalSummary(), failCode('SESSION_STAGE_ORDER'));
});

const stoppedPlan = [
  { id: 'stage:99001102', kind: 'stage-page', stageId: '99001102', url: 'https://fixture.invalid/#full-1', label: 'stage 1' },
  { id: 'stage:99001101', kind: 'stage-page', stageId: '99001101', url: 'https://fixture.invalid/#partial', label: 'stage 2' },
  { id: 'stage:99001103', kind: 'stage-page', stageId: '99001103', url: 'https://fixture.invalid/#unusable', label: 'stage 3' },
  { id: 'stage:99001104', kind: 'stage-page', stageId: '99001104', url: 'https://fixture.invalid/#unvisited', label: 'stage 4' }
];
async function readyStopped() {
  const draftStore = new api.MemoryTypedDraftStore(), backend = new api.MemoryTypedSessionBackend();
  const session = new api.TypedOneTapSessionCoordinator({ draftStore, backend });
  await session.start({ eventId, eventName: '架空停止event', plan: stoppedPlan, writerId: 'tab:stopped' });
  const mixed = await mixedCandidates();
  const unusable = { fullInput: { capture: mixed.partial.capture, package: mixed.partial.material },
    partialInput: { capture: mixed.partial.capture, material: { ...mixed.partial.material, contentDigest: 'sha256:' + '0'.repeat(64) } },
    ownerMessage: '完全データにも部分材料にも安全に分類できません。' };
  return { draftStore, backend, session, candidate: { first: mixed.first, partial: mixed.partial, unusable } };
}
async function stoppedTicket(session, index) { return session.beginCapture({ writerId: 'tab:stopped', currentUrl: stoppedPlan[index].url }); }

test('Phase C stops only after both full and partial validation fail, retaining full/partial and leaving stage 4 unvisited', async () => {
  const { session, draftStore, backend, candidate } = await readyStopped();
  const first = await stoppedTicket(session, 0); await session.commitCapture(first, candidate.first);
  const second = await stoppedTicket(session, 1);
  await assert.rejects(session.recordUnusable(second, { ...candidate.unusable, partialInput: { capture: candidate.partial.capture, material: candidate.partial.material } }), failCode('UNUSABLE_NOT_PROVEN'));
  assert.equal(Object.keys((await session.load()).failures).length, 0);
  await session.commitCapture(second, candidate.partial);
  const payloadCount = draftStore.payloads.size, draftCount = draftStore.drafts.size;
  const third = await stoppedTicket(session, 2); const stopped = await session.recordUnusable(third, candidate.unusable);
  assert.equal(stopped.session.status, 'stopped-unusable'); assert.equal(stopped.session.currentIndex, 2);
  assert.equal(draftStore.payloads.size, payloadCount); assert.equal(draftStore.drafts.size, draftCount); assert.equal(draftStore.failures.size, 1);
  assert.deepEqual(Object.keys(stopped.session.drafts), [stoppedPlan[0].id, stoppedPlan[1].id]);
  await assert.rejects(session.nextNavigation({ writerId: 'tab:stopped', currentUrl: stoppedPlan[2].url }), failCode('UNUSABLE_STOP'));
  await assert.rejects(stoppedTicket(session, 3), failCode('UNUSABLE_STOP'));
  assert.equal((await draftStore.load(stopped.session.drafts[stoppedPlan[0].id].draftDigest)).classification, 'full');
  assert.equal((await draftStore.load(stopped.session.drafts[stoppedPlan[1].id].draftDigest)).classification, 'partial');
  const beforeReview = structuredClone(backend.value); const summary = await session.readOnlySummary();
  assert.deepEqual({ full: summary.full, partial: summary.partial, unusable: summary.unusable, unvisited: summary.unvisited, total: summary.total }, { full: 1, partial: 1, unusable: 1, unvisited: 1, total: 4 });
  assert.deepEqual(summary.stages.map(stage => stage.state), ['full', 'partial', 'unusable', 'unvisited']);
  assert.deepEqual(backend.value, beforeReview);
});

test('Phase C rejects tampered failure metadata, plan order, and inconsistent read-only counts without replacing earlier drafts', async () => {
  const { session, draftStore, backend, candidate } = await readyStopped();
  for (const [index, value] of [[0, candidate.first], [1, candidate.partial]]) { const ticket = await stoppedTicket(session, index); await session.commitCapture(ticket, value); }
  const third = await stoppedTicket(session, 2); await session.recordUnusable(third, candidate.unusable);
  const priorDrafts = structuredClone(backend.value.drafts);
  draftStore.tamperNextFailureRead = true;
  await assert.rejects(session.readOnlySummary(), failCode('UNUSABLE_FAILURE_STAGE'));
  assert.deepEqual(backend.value.drafts, priorDrafts);
  const restored = await session.load();
  backend.value = { ...backend.value, plan: [backend.value.plan[1], backend.value.plan[0], backend.value.plan[2], backend.value.plan[3]] };
  await assert.rejects(session.readOnlySummary(), failCode('PLAN_DIGEST'));
  backend.value = restored;
  const { [stoppedPlan[2].id]: removed, ...failures } = restored.failures;
  backend.value = { ...restored, failures };
  await assert.rejects(session.readOnlySummary(), failCode('SESSION_STAGE_ORDER'));
  assert.deepEqual((await draftStore.load(priorDrafts[stoppedPlan[0].id].draftDigest)).classification, 'full');
  assert.deepEqual((await draftStore.load(priorDrafts[stoppedPlan[1].id].draftDigest)).classification, 'partial');
});

test('Phase C failure metadata save failure leaves prior full and partial drafts active', async () => {
  const { session, draftStore, candidate } = await readyStopped();
  for (const [index, value] of [[0, candidate.first], [1, candidate.partial]]) { const ticket = await stoppedTicket(session, index); await session.commitCapture(ticket, value); }
  const before = await session.load(); draftStore.failFailureWrites = true;
  const third = await stoppedTicket(session, 2);
  await assert.rejects(session.recordUnusable(third, candidate.unusable), failCode('UNUSABLE_FAILURE_SAVE_FAILED'));
  const after = await session.load();
  assert.deepEqual(after.drafts, before.drafts); assert.deepEqual(after.failures, {}); assert.equal(after.status, 'collecting');
  assert.equal((await draftStore.load(after.drafts[stoppedPlan[0].id].draftDigest)).classification, 'full');
  assert.equal((await draftStore.load(after.drafts[stoppedPlan[1].id].draftDigest)).classification, 'partial');
});

async function savedProgressSession() {
  const value = await readyMixed();
  for (const [index, candidate] of [[0, value.candidate.first], [1, value.candidate.partial]]) { const ticket = await mixedTicket(value.session, index); await value.session.commitCapture(ticket, candidate); }
  return value;
}

test('Phase D restart restores a progressing session as non-writer; explicit takeover alone advances writer generation and invalidates old tickets', async () => {
  const { session: oldTab, draftStore, backend, candidate } = await savedProgressSession();
  const oldTicket = await mixedTicket(oldTab, 2), before = await oldTab.load();
  const reloaded = new api.TypedOneTapSessionCoordinator({ draftStore, backend }); const restored = await reloaded.load();
  assert.equal(restored.writerId, 'tab:mixed'); assert.equal(restored.writerGeneration, 1); assert.equal(restored.revision, before.revision);
  assert.equal(restored.currentIndex, 2); assert.equal(restored.drafts[mixedPlan[0].id].classification, 'full'); assert.equal(restored.drafts[mixedPlan[1].id].classification, 'partial');
  await assert.rejects(reloaded.beginCapture({ writerId: 'tab:reloaded-123', currentUrl: mixedPlan[2].url }), failCode('WRITER_MISMATCH'));
  await assert.rejects(reloaded.nextNavigation({ writerId: 'tab:reloaded-123', currentUrl: mixedPlan[1].url }), failCode('WRITER_MISMATCH'));
  const taken = await reloaded.takeover({ writerId: 'tab:reloaded-123', expected: takeoverExpected(restored) });
  assert.equal(taken.writerId, 'tab:reloaded-123'); assert.equal(taken.writerGeneration, 2); assert.equal(taken.revision, before.revision + 1);
  await assert.rejects(oldTab.commitCapture(oldTicket, candidate.last), failCode('STALE_CAPTURE'));
  await assert.rejects(oldTab.recordUnusable(oldTicket, {}), failCode('STALE_CAPTURE'));
  await assert.rejects(oldTab.nextNavigation({ writerId: 'tab:mixed', currentUrl: mixedPlan[1].url }), failCode('WRITER_MISMATCH'));
  await assert.rejects(oldTab.takeover({ writerId: 'tab:old-reclaim-123', expected: takeoverExpected(before) }), failCode('SESSION_CONFLICT'));
  const newTicket = await reloaded.beginCapture({ writerId: 'tab:reloaded-123', currentUrl: mixedPlan[2].url }); await reloaded.commitCapture(newTicket, candidate.last);
  assert.deepEqual({ full: (await reloaded.finalSummary()).full, partial: (await reloaded.finalSummary()).partial }, { full: 2, partial: 1 });
});

test('Phase D concurrent takeover and revision conflict allow at most one new writer', async () => {
  const { draftStore, backend } = await savedProgressSession(); const observed = takeoverExpected(await new api.TypedOneTapSessionCoordinator({ draftStore, backend }).load());
  const first = new api.TypedOneTapSessionCoordinator({ draftStore, backend }), second = new api.TypedOneTapSessionCoordinator({ draftStore, backend });
  const results = await Promise.allSettled([first.takeover({ writerId: 'tab:first-123', expected: observed }), second.takeover({ writerId: 'tab:second-123', expected: observed })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const active = await first.load(); assert.equal(active.writerGeneration, 2); assert.ok(['tab:first-123', 'tab:second-123'].includes(active.writerId));

  const conflict = await savedProgressSession(); const contender = new api.TypedOneTapSessionCoordinator({ draftStore: conflict.draftStore, backend: conflict.backend });
  const original = conflict.backend.compareAndSwap.bind(conflict.backend); conflict.backend.compareAndSwap = async (expected, next) => { conflict.backend.value = { ...conflict.backend.value, revision: conflict.backend.value.revision + 1 }; return original(expected, next); };
  await assert.rejects(contender.takeover({ writerId: 'tab:conflict-123', expected: takeoverExpected(await contender.load()) }), failCode('SESSION_CONFLICT'));
  assert.equal((await contender.load()).writerId, 'tab:mixed');
});

test('Phase D restart revalidates plan, draft/payload and failure references, and takeover does not clear unusable', async () => {
  const progress = await savedProgressSession(); const restart = () => new api.TypedOneTapSessionCoordinator({ draftStore: progress.draftStore, backend: progress.backend });
  progress.backend.value = { ...progress.backend.value, plan: [...progress.backend.value.plan].reverse() };
  await assert.rejects(restart().load(), failCode('PLAN_DIGEST'));

  const draftCase = await savedProgressSession(); const draftEntry = (await draftCase.session.load()).drafts[mixedPlan[0].id];
  draftCase.draftStore.drafts.set(draftEntry.draftDigest, { ...draftCase.draftStore.drafts.get(draftEntry.draftDigest), draftDigest: 'sha256:' + '0'.repeat(64) });
  await assert.rejects(new api.TypedOneTapSessionCoordinator({ draftStore: draftCase.draftStore, backend: draftCase.backend }).load(), failCode('DRAFT_DIGEST'));

  const partialCase = await savedProgressSession(); const partialEntry = (await partialCase.session.load()).drafts[mixedPlan[1].id]; partialCase.draftStore.payloads.delete(partialEntry.contentDigest);
  await assert.rejects(new api.TypedOneTapSessionCoordinator({ draftStore: partialCase.draftStore, backend: partialCase.backend }).load(), failCode('PAYLOAD_MISSING'));
  const fullCase = await savedProgressSession(); const fullEntry = (await fullCase.session.load()).drafts[mixedPlan[0].id]; fullCase.draftStore.payloads.delete(fullEntry.contentDigest);
  await assert.rejects(new api.TypedOneTapSessionCoordinator({ draftStore: fullCase.draftStore, backend: fullCase.backend }).load(), failCode('PAYLOAD_MISSING'));

  const stopped = await readyStopped(); for (const [index, candidate] of [[0, stopped.candidate.first], [1, stopped.candidate.partial]]) { const ticket = await stoppedTicket(stopped.session, index); await stopped.session.commitCapture(ticket, candidate); }
  const third = await stoppedTicket(stopped.session, 2); await stopped.session.recordUnusable(third, stopped.candidate.unusable);
  const reloadedStopped = new api.TypedOneTapSessionCoordinator({ draftStore: stopped.draftStore, backend: stopped.backend }); const before = await reloadedStopped.readOnlySummary();
  assert.deepEqual(before.stages.map(stage => stage.state), ['full', 'partial', 'unusable', 'unvisited']);
  const taken = await reloadedStopped.takeover({ writerId: 'tab:stopped-reloaded-123', expected: takeoverExpected(await reloadedStopped.load()) }); assert.equal(taken.status, 'stopped-unusable');
  await assert.rejects(reloadedStopped.nextNavigation({ writerId: 'tab:stopped-reloaded-123', currentUrl: stoppedPlan[2].url }), failCode('UNUSABLE_STOP'));
  const failureEntry = taken.failures[stoppedPlan[2].id]; stopped.draftStore.failures.set(failureEntry.failureDigest, { ...stopped.draftStore.failures.get(failureEntry.failureDigest), stageId: 'tampered' });
  await assert.rejects(new api.TypedOneTapSessionCoordinator({ draftStore: stopped.draftStore, backend: stopped.backend }).load(), failCode('UNUSABLE_FAILURE_STAGE'));
});
