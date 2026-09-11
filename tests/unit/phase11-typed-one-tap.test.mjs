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
  const second = await ticket(session, 1);
  await assert.rejects(session.commitCapture(second, { ...candidate.partial, classification: 'full', package: candidate.partial.material, material: undefined }), failCode('PACKAGE_VERSION'));
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
