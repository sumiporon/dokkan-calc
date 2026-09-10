import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectDokkanInfoDocument, buildDokkanInfoStagePackage, dokkanInfoStageFingerprint, ONE_TAP_ADAPTER_VERSION,
  MemorySessionBackend, OneTapSessionCoordinator, validateOneTapBatch
} from '../../generated/phase11/api.mjs';
import { dokkanInfoEventHtml, dokkanInfoStageHtml } from '../fixtures/phase11/dokkaninfo-source.mjs';

const eventId = '990001';
const stages = [1, 2, 3].map((number) => ({ id: `9900010${number}`, name: `架空ステージ${number}` }));
const eventUrl = `https://jpnja.dokkaninfo.com/events/challenge/${eventId}`;
const at = '2026-09-10T00:00:00.000Z';
const inspect = (html, currentUrl, readyState = 'complete') => inspectDokkanInfoDocument({ html, currentUrl, readyState, capturedAt: at });
const event = inspect(dokkanInfoEventHtml({ eventId, stages }), eventUrl);
const stageResult = (index, options = {}) => {
  const entry = stages[index]; const url = `${eventUrl}/${entry.id}`;
  return inspect(dokkanInfoStageHtml({ eventId, stageId: entry.id, stageName: entry.name, normalAtk: 600000 + index * 100000, ...options }), url);
};
const errorCode = (code) => (error) => error?.code === code;

test('one-tap adapter reports coverage and distinguishes rendering/incomplete/unsupported', () => {
  assert.equal(event.state, 'ready'); assert.equal(event.pageKind, 'event'); assert.equal(event.coverage.visitUnits.length, 3);
  assert.equal(stageResult(0).coverage.phaseCount, 1);
  assert.equal(inspect('<html></html>', eventUrl, 'loading').state, 'rendering');
  assert.notEqual(inspect('<html></html>', eventUrl).state, 'ready');
  assert.equal(inspect(dokkanInfoEventHtml({ eventId, stages }), `${eventUrl}/wrong`).state, 'unsupported');
});

test('three-stage session persists each validated package before owner navigation and resumes', async () => {
  const backend = new MemorySessionBackend(); const session = new OneTapSessionCoordinator(backend);
  const started = await session.start({ eventMaterial: event.material, plan: event.coverage.visitUnits, writerId: 'tab:1', adapterVersion: ONE_TAP_ADAPTER_VERSION });
  assert.equal(started.currentIndex, 0);
  for (let index = 0; index < stages.length; index += 1) {
    const currentUrl = event.coverage.visitUnits[index].url;
    const ticket = await session.beginCapture({ writerId: 'tab:1', currentUrl });
    const pack = await buildDokkanInfoStagePackage(ticket.eventMaterial, stageResult(index).material);
    const result = await session.commitCapture(ticket, pack, await dokkanInfoStageFingerprint(stageResult(index).material));
    assert.equal(result.readyForNext, true);
    const restored = await new OneTapSessionCoordinator(backend).load();
    assert.equal(Object.keys(restored.completed).length, index + 1);
    const next = await session.nextNavigation({ writerId: 'tab:1', currentUrl });
    assert.equal(next.kind, index === stages.length - 1 ? 'review' : 'navigate');
  }
  const batch = await session.createBatch();
  assert.equal(batch.packages.length, 3); assert.equal((await validateOneTapBatch(batch)).digest, batch.digest);
  await session.markSent(batch); const restored = await session.load();
  assert.equal(restored.status, 'ready-for-review'); assert.equal(restored.sentBatches[batch.batchId].digest, batch.digest);
});

test('session rejects early navigation, old completion, wrong event/tab and changed duplicate', async () => {
  const backend = new MemorySessionBackend(); const session = new OneTapSessionCoordinator(backend);
  await session.start({ eventMaterial: event.material, plan: event.coverage.visitUnits, writerId: 'tab:1', adapterVersion: ONE_TAP_ADAPTER_VERSION });
  const url = event.coverage.visitUnits[0].url;
  await assert.rejects(session.nextNavigation({ writerId: 'tab:1', currentUrl: url }), errorCode('NOT_READY'));
  await assert.rejects(session.beginCapture({ writerId: 'tab:2', currentUrl: url }), errorCode('WRITER_MISMATCH'));
  await assert.rejects(session.beginCapture({ writerId: 'tab:1', currentUrl: 'https://jpnja.dokkaninfo.com/events/challenge/999/1' }), errorCode('EVENT_MISMATCH'));
  const stale = await session.beginCapture({ writerId: 'tab:1', currentUrl: url });
  await session.takeOver('tab:2');
  const pack = await buildDokkanInfoStagePackage(stale.eventMaterial, stageResult(0).material);
  await assert.rejects(session.commitCapture(stale, pack), errorCode('STALE_CAPTURE'));
  const ticket = await session.beginCapture({ writerId: 'tab:2', currentUrl: url });
  await session.commitCapture(ticket, pack, await dokkanInfoStageFingerprint(stageResult(0).material));
  const changedTicket = await session.beginCapture({ writerId: 'tab:2', currentUrl: url });
  const changed = await buildDokkanInfoStagePackage(changedTicket.eventMaterial, stageResult(0, { normalAtk: 999999 }).material);
  await assert.rejects(session.commitCapture(changedTicket, changed, await dokkanInfoStageFingerprint(stageResult(0, { normalAtk: 999999 }).material)), errorCode('CAPTURE_CHANGED'));
});

test('parse/validation and durable-save failures stop without completion', async () => {
  assert.notEqual(stageResult(0, { missing: 'atk' }).state, 'ready');
  const backend = new MemorySessionBackend(); const session = new OneTapSessionCoordinator(backend);
  await session.start({ eventMaterial: event.material, plan: event.coverage.visitUnits, writerId: 'tab:1', adapterVersion: ONE_TAP_ADAPTER_VERSION });
  const ticket = await session.beginCapture({ writerId: 'tab:1', currentUrl: event.coverage.visitUnits[0].url });
  const pack = await buildDokkanInfoStagePackage(ticket.eventMaterial, stageResult(0).material);
  backend.failWrites = true;
  await assert.rejects(session.commitCapture(ticket, pack), errorCode('DRAFT_SAVE_FAILED'));
  backend.failWrites = false;
  assert.equal(Object.keys((await session.load()).completed).length, 0);
});

test('adapter/session/extension source boundaries contain no acquisition mechanism', async () => {
  const { readFile } = await import('node:fs/promises');
  const names = [
    '../../src/prototype/phase11-one-tap-adapter.mjs',
    '../../src/prototype/phase11-one-tap-session.mjs',
    '../../prototypes/phase11-one-tap-extension/background.mjs',
    '../../prototypes/phase11-one-tap-extension/content.mjs'
  ];
  const text = (await Promise.all(names.map((name) => readFile(new URL(name, import.meta.url), 'utf8')))).join('\n');
  assert.doesNotMatch(text, /\bfetch\s*\(|XMLHttpRequest|GM_xmlhttpRequest|sendBeacon|WebSocket|EventSource|setInterval\s*\(|location\.reload\s*\(|\.click\s*\(/);
  assert.doesNotMatch(await readFile(new URL('../../prototypes/phase11-one-tap-extension/manifest.source.json', import.meta.url), 'utf8'), /<all_urls>|cookies|downloads|clipboard|webRequest/);
});
