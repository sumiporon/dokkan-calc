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
  await assert.rejects(session.load(), failCode('SESSION_STAGE_ORDER'));

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
