import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../generated/phase11/typed-one-tap/api.mjs';
import { validateOneTapBatch } from '../../generated/phase11/typed-one-tap/existing-full-receiver.mjs';
import { sourceFixture } from '../../prototypes/phase11-partial/fixtures.mjs';
import { dokkanInfoEventHtml, dokkanInfoStageHtml } from '../fixtures/phase11/dokkaninfo-source.mjs';

const failCode = code => error => error?.code === code;
const eventId = '990011', eventName = 'typed inspection用・架空event', eventUrl = `https://jpnja.dokkaninfo.com/events/challenge/${eventId}`;
const plan = [
  { id: 'stage:99001102', kind: 'stage-page', stageId: '99001102', url: 'https://fixture.invalid/phase-e#full', label: '架空stage 1（完全データ）' },
  { id: 'stage:99001101', kind: 'stage-page', stageId: '99001101', url: 'https://fixture.invalid/phase-e#partial', label: '架空stage 2（部分材料）' },
  { id: 'stage:99001103', kind: 'stage-page', stageId: '99001103', url: 'https://fixture.invalid/phase-e#unusable', label: '架空stage 3（利用不可）' },
  { id: 'stage:99001104', kind: 'stage-page', stageId: '99001104', url: 'https://fixture.invalid/phase-e#unvisited', label: '架空stage 4（未取得）' }
];

async function candidates() {
  const event = api.inspectDokkanInfoDocument({ html: dokkanInfoEventHtml({ eventId, eventName, stages: plan.map(unit => ({ id: unit.stageId, name: unit.label })) }), currentUrl: eventUrl, sourceUrl: eventUrl, capturedAt: '2026-09-01T00:00:00.000Z' });
  const stage = api.inspectDokkanInfoDocument({ html: dokkanInfoStageHtml({ eventId, stageId: plan[0].stageId, stageName: plan[0].label, normalAtk: 600000 }), currentUrl: `${eventUrl}/${plan[0].stageId}`, sourceUrl: `${eventUrl}/${plan[0].stageId}`, capturedAt: '2026-09-01T00:00:00.000Z' });
  const pack = await api.buildDokkanInfoStagePackage(event.material, stage.material);
  const partial = await api.inspectFictionalPartial(sourceFixture('C'));
  const full = { classification: 'full', capture: { id: 'fictional-capture-e-full', revision: 1, observedAt: '2026-09-01T00:00:00.000Z' }, package: pack, fingerprint: await api.dokkanInfoStageFingerprint(stage.material) };
  const part = { classification: 'partial', capture: partial.material.capture, material: partial.material, fingerprint: partial.material.contentDigest };
  return { full, partial: part, unusable: { fullInput: { capture: part.capture, package: part.material }, partialInput: { capture: part.capture, material: { ...part.material, contentDigest: 'sha256:' + '0'.repeat(64) } }, ownerMessage: '完全データにも部分材料にも安全に分類できません。' } };
}

async function stoppedFixture() {
  const draftStore = new api.MemoryTypedDraftStore(), backend = new api.MemoryTypedSessionBackend();
  const session = new api.TypedOneTapSessionCoordinator({ draftStore, backend });
  await session.start({ eventId, eventName, plan, writerId: 'tab:phase-e' });
  const candidate = await candidates();
  for (let index = 0; index < 2; index += 1) {
    const ticket = await session.beginCapture({ writerId: 'tab:phase-e', currentUrl: plan[index].url });
    await session.commitCapture(ticket, index === 0 ? candidate.full : candidate.partial);
  }
  const ticket = await session.beginCapture({ writerId: 'tab:phase-e', currentUrl: plan[2].url });
  await session.recordUnusable(ticket, candidate.unusable);
  return { draftStore, backend, session };
}

test('Phase E creates a typed inspection batch only after revalidation, and the separate receiver revalidates it read-only', async () => {
  const { draftStore, backend, session } = await stoppedFixture();
  const before = structuredClone(backend.value);
  const batch = await api.createTypedInspectionBatch({ session });
  assert.equal(batch.kind, api.TYPED_INSPECTION_BATCH_KIND);
  assert.deepEqual(batch.counts, { full: 1, partial: 1, unusable: 1, unvisited: 1, total: 4 });
  assert.deepEqual(batch.stages.map(stage => stage.classification), ['full', 'partial', 'unusable', 'unvisited']);
  assert.equal(batch.stages[0].draft.reference.kind, 'full-package');
  assert.equal(batch.stages[1].draft.reference.kind, 'partial-material');
  assert.equal('draft' in batch.stages[2], false); assert.equal('failure' in batch.stages[3], false);
  const review = await new api.TypedInspectionReceiver().receive(batch);
  assert.deepEqual(review.counts, batch.counts);
  assert.deepEqual(review.stages.map(stage => stage.state), ['full', 'partial', 'unusable', 'unvisited']);
  assert.match(review.stages[1].ownerMessage, /材料のみ保存・現在は計算できません/);
  assert.deepEqual(backend.value, before, 'batch generation/review must not update session or writer state');
  assert.equal((await session.load()).revision, before.revision);
  assert.equal(draftStore.payloads.size, 2); assert.equal(draftStore.drafts.size, 2); assert.equal(draftStore.failures.size, 1);
  await assert.rejects(validateOneTapBatch(batch), failCode('BATCH_FORMAT'));
});

test('Phase E rejects tampered or mismatched typed inspection batches before any review', async () => {
  const { backend, session } = await stoppedFixture(); const batch = await api.createTypedInspectionBatch({ session });
  const invalid = async (mutate, code) => {
    const value = structuredClone(batch); await mutate(value);
    await assert.rejects(api.validateTypedInspectionBatch(value), failCode(code));
  };
  await invalid(value => { value.batchDigest = 'sha256:' + '0'.repeat(64); }, 'INSPECTION_BATCH_DIGEST');
  await invalid(value => { value.planDigest = 'sha256:' + '0'.repeat(64); }, 'INSPECTION_PLAN_DIGEST');
  await invalid(value => { [value.stages[0], value.stages[1]] = [value.stages[1], value.stages[0]]; }, 'INSPECTION_STAGE');
  await invalid(value => { value.stages[1].stageId = value.stages[0].stageId; }, 'INSPECTION_STAGE_DUPLICATE');
  await invalid(value => { value.stages[0].classification = 'partial'; }, 'INSPECTION_CLASSIFICATION');
  await invalid(value => { value.stages[1].classification = 'full'; }, 'INSPECTION_CLASSIFICATION');
  await invalid(value => { value.stages[0].draft.payload = null; }, 'PACKAGE_VERSION');
  await invalid(value => { value.stages[1].draft.payload = null; }, 'FORMAT');
  await invalid(value => { value.stages[1].draft.payload.contentDigest = 'sha256:' + '0'.repeat(64); }, 'CONTENT_DIGEST');
  await invalid(value => { value.stages[2].failure.stageId = 'tampered'; }, 'UNUSABLE_FAILURE_STAGE');
  await invalid(value => { value.stages[2].classification = 'unvisited'; }, 'FORMAT');
  await invalid(value => { value.eventId = 'different-event'; }, 'INSPECTION_FULL_OWNERSHIP');
  await invalid(value => { value.counts.full = 2; }, 'INSPECTION_COUNT');

  const before = structuredClone(backend.value);
  backend.value = { ...backend.value, drafts: { ...backend.value.drafts, [plan[3].id]: backend.value.drafts[plan[0].id] } };
  await assert.rejects(api.createTypedInspectionBatch({ session }), failCode('SESSION_STAGE_ORDER'));
  backend.value = before;
  assert.deepEqual((await session.load()).failures[plan[2].id].stageId, plan[2].stageId);
});
