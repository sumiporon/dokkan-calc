import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStructureDiagnostic, diagnoseStructureSnapshot, LIMITS } from '../../src/prototype/phase11-f3-structure-diagnostic.mjs';
import { DIAGNOSTIC_CASES, diagnosticFixture } from '../../prototypes/phase11-f3-structure-extension/fixtures.mjs';
const read = relative => readFile(new URL('../../' + relative, import.meta.url), 'utf8');
const inspect = f => diagnoseStructureSnapshot({ snapshot: f.html, expectedEventId: f.eventId, expectedStageId: f.stageId });
const sourceDir = 'prototypes/phase11-f3-structure-extension/';
const outputDir = 'generated/phase11-f3-structure-extension/';

test('candidate manifest: exact URL, separate ID, zero ordinary permissions/background/resources', async () => {
  const m = JSON.parse(await read(sourceDir + 'manifest.json'));
  const expected = 'https://jpnja.dokkaninfo.com/events/challenge/1705/17050015';
  assert.deepEqual(m.permissions, []); assert.deepEqual(m.host_permissions, [expected]);
  assert.deepEqual(m.content_scripts, [{ matches: [expected], js: ['content.js'], run_at: 'document_idle', all_frames: false }]);
  assert.equal(JSON.stringify(m).includes('*'), false);
  for (const key of ['background', 'web_accessible_resources', 'optional_permissions', 'optional_host_permissions', 'action']) assert.equal(key in m, false);
  const old = JSON.parse(await read('prototypes/phase11-f3-prep-extension/manifest.f3-preflight.json'));
  assert.notEqual(m.browser_specific_settings.gecko.id, old.browser_specific_settings.gecko.id);
  assert.deepEqual(JSON.parse(await read(outputDir + 'candidate/manifest.json')), m);
  const local = JSON.parse(await read(outputDir + 'fixture-test/manifest.json'));
  assert.ok(local.host_permissions.every(p => p.startsWith('http://127.0.0.1/events/challenge/992200/') && !p.includes('*')));
});
test('candidate source and bundle have no network, navigation, persistence, messages or intake dependencies', async () => {
  for (const file of [sourceDir + 'content.mjs', sourceDir + 'ui.mjs', 'src/prototype/phase11-f3-structure-diagnostic.mjs']) {
    const s = await read(file);
    assert.doesNotMatch(s, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|indexedDB|localStorage|sessionStorage|sendBeacon|postMessage)\s*[.(]|\b(?:chrome|browser)\.\s*(?:storage|tabs|runtime|downloads|cookies)|\.sendMessage\s*\(/, file);
    assert.doesNotMatch(s, /(?:location|window)\.(?:replace|assign|reload|open)\s*\(|location\.(?:href|pathname)\s*=\s*[^=]|document\.cookie|navigator\.clipboard|\b(?:preload|prerender)\b/, file);
  }
  // The bundle includes an inert HTML parsing dependency that may use a local
  // helper named "fetch". Audit browser network APIs specifically here.
  const bundle = await read(outputDir + 'candidate/content.js');
  assert.doesNotMatch(bundle, /(?:window|globalThis)\.fetch\s*\(|(?:window|globalThis)\.XMLHttpRequest\b|new\s+XMLHttpRequest\b|(?:window|globalThis)\.WebSocket\b|new\s+WebSocket\b|navigator\.sendBeacon\s*\(/);
  assert.doesNotMatch(bundle, /(?:location|window)\.(?:replace|assign|reload|open)\s*\(|location\.(?:href|pathname)\s*=\s*[^=]|document\.cookie|navigator\.clipboard|\b(?:chrome|browser)\.\s*(?:storage|tabs|runtime|downloads|cookies)|\.sendMessage\s*\(/);
  const ui = await read(sourceDir + 'ui.mjs');
  assert.equal((ui.match(/document\.documentElement\.outerHTML/g) ?? []).length, 1);
  assert.equal((await read(outputDir + 'candidate/content.js')).match(/document\.documentElement\.outerHTML/g).length, 1);
  assert.match(ui, /event\.isTrusted/); assert.match(ui, /copyEvent\.isTrusted/);
  assert.match(ui, /document\.execCommand\('copy'\)/);
  const inputs = JSON.parse(await read(outputDir + 'candidate-inputs.json'));
  assert.ok(inputs.includes('src/prototype/phase11-f3-structure-diagnostic.mjs'));
  assert.ok(inputs.every(p => p.startsWith('node_modules/') || [sourceDir + 'content.mjs', sourceDir + 'ui.mjs', 'src/prototype/phase11-f3-structure-diagnostic.mjs'].includes(p)));
  assert.doesNotMatch(bundle, /structureProbe|992200|PRIVATE_CANARY|fixture.invalid/);
});
test('one owner invocation: no reads before tap, URL checks sandwich exactly one snapshot, repeat rejected', async () => {
  const f = diagnosticFixture('blank'), url = `http://127.0.0.1/events/challenge/${f.eventId}/${f.stageId}`;
  const events = [];
  const controller = createStructureDiagnostic({ expectedUrl: url, expectedEventId: f.eventId, expectedStageId: f.stageId,
    readUrl: () => { events.push('url'); return url; }, readOuterHTML: () => { events.push('html'); return f.html; } });
  assert.deepEqual(events, []); await controller.run(); assert.deepEqual(events, ['url', 'html', 'url']);
  await assert.rejects(controller.run(), e => e.code === 'DIAGNOSTIC_ALREADY_RUN'); assert.equal(events.length, 3);
});
test('URL mismatch before capture and URL drift stop; snapshot ownership mismatch remains unresolved', async () => {
  const f = diagnosticFixture('normal'), url = `http://127.0.0.1/events/challenge/${f.eventId}/${f.stageId}`;
  let reads = 0, urls = 0;
  const options = { expectedUrl: url, expectedEventId: f.eventId, expectedStageId: f.stageId, readOuterHTML: () => { reads++; return f.html; } };
  await assert.rejects(createStructureDiagnostic({ ...options, readUrl: () => url + '?wrong' }).run(), e => e.code === 'DIAGNOSTIC_URL');
  assert.equal(reads, 0);
  await assert.rejects(createStructureDiagnostic({ ...options, readUrl: () => urls++ ? url + '?changed' : url }).run(), e => e.code === 'DIAGNOSTIC_URL_CHANGED');
  assert.equal(reads, 1);
  const wrong = await inspect(diagnosticFixture('ownership')); assert.ok(wrong.issues.some(i => i.code === 'identity-unconfirmed'));
});
for (const kind of Object.keys(DIAGNOSTIC_CASES)) test(`diagnostic-only fixture ${kind}: scoped observations, bounds, unresolved coverage`, async () => {
  const f = diagnosticFixture(kind), r = await inspect(f);
  assert.equal(r.kind, 'structure-diagnostic'); assert.equal(r.coverage.status, 'unconfirmed');
  assert.equal('classification' in r, false); assert.equal('snapshot' in r, false);
  assert.ok(JSON.stringify(r).length <= LIMITS.output); assert.doesNotMatch(JSON.stringify(r), /<html|<script|PRIVATE_CANARY/);
  for (const o of r.observations) for (const c of o.candidates) assert.ok(c.text.length <= 160);
  if (kind === 'normal') { assert.deepEqual(r.issues, []); assert.equal(r.counts.enemies, 2); assert.equal(r.counts.supers, 4); }
  if (kind === 'blank') {
    const counts = r.observations.filter(o => o.field === 'super-specific-count');
    assert.ok(counts.some(o => o.state === 'blank' && o.candidates[0].text === ''));
    assert.ok(counts.some(o => o.state === 'non-empty-unparsed' && o.candidates[0].text === '0'));
    assert.ok(r.observations.filter(o => o.field === 'enemy-wide-count').every(o => o.candidates[0].text === '7'));
  }
  if (kind === 'empty') { assert.equal(r.counts.enemies, 0); assert.ok(r.issues.some(i => i.code === 'missing:enemy-root')); }
  if (kind === 'ambiguous') assert.ok(r.observations.some(o => o.field === 'enemy-root' && o.state === 'ambiguous'));
  if (kind === 'orphan') assert.equal('attack' in r.observations.find(o => o.field === 'orphan-condition').parent, false);
  if (kind === 'duplicate') assert.ok(r.observations.some(o => o.field === 'atk' && o.state === 'ambiguous' && o.count === 2));
  if (!['normal', 'blank', 'long'].includes(kind)) assert.equal(r.coverage.unresolved, true);
});
