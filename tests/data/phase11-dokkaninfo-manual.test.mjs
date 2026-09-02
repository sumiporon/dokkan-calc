import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  decodeLocalFile, parseDokkanInfoSavedPage, resolveDokkanInfoSelection,
  packagePages, validatePackage, makeSnapshot, prepareFiles, checkApply,
  manualPurposeGate, HTML_LIMIT, DOKKANINFO_SOURCE
} from '../../generated/phase11/api.mjs';
import baseline from '../../generated/phase11/baseline.mjs';
import { dokkanInfoEventHtml, dokkanInfoStageHtml, dokkanInfoMhtml } from '../fixtures/phase11/dokkaninfo-source.mjs';

const CAPTURED_AT = '2026-02-23T08:11:11.385Z';
const CAPTURED_MS = Date.parse(CAPTURED_AT);
const bytes = (value) => typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
const errorCode = (code) => (error) => error.code === code;
const empty = await makeSnapshot([]);

async function cached(name) {
  const raw = await readFile(new URL(`../../scraper/html_cache/${name}`, import.meta.url));
  return parseDokkanInfoSavedPage(decodeLocalFile(raw), { fileName: name, capturedAt: CAPTURED_AT });
}

async function cachedEvent(eventId) {
  return cached(`event_${eventId}.html`);
}

function selectedFile(text, name, lastModified = CAPTURED_MS) {
  return new File([text], name, { type: name.endsWith('.mhtml') ? 'multipart/related' : 'text/html', lastModified });
}

async function selectedCachedFile(name) {
  return selectedFile(await readFile(new URL(`../../scraper/html_cache/${name}`, import.meta.url)), name);
}

test('Phase11 reuses the saved DokkanInfo parser through canonical/runtime for representative real offline pages', async () => {
  const cases = [
    ['stage_1749_17490015.html', (pack) => {
      const encounters = pack.canonical.events[0].stages[0].encounters;
      assert.ok(encounters.flatMap((item) => item.enemies).every((enemy) => enemy.stats.hp.value > 0 && enemy.stats.baseAttack.value > 0 && enemy.stats.defense.value > 0));
    }],
    ['stage_1714_17140015.html', (pack) => {
      const enemies = pack.canonical.events[0].stages[0].encounters.flatMap((item) => item.enemies);
      assert.ok(enemies.some((enemy) => enemy.superAttacks.length >= 2));
      assert.ok(enemies.flatMap((enemy) => enemy.superAttacks).some((attack) => attack.usageRules.length > 0));
    }],
    ['stage_1744_17440013.html', (pack) => {
      const stage = pack.canonical.events[0].stages[0];
      assert.ok(stage.encounters.flatMap((item) => item.aiActions).length > 0);
      assert.ok(stage.encounters.flatMap((item) => item.enemies).some((enemy) => enemy.superAttacks.length >= 2));
    }],
    ['stage_1702_17020095.html', (pack) => {
      const areas = pack.canonical.events[0].stages[0].encounters.flatMap((item) => item.areaAttacks);
      assert.ok(areas.some((area) => area.firstTargetDamage.value === 1400000 && area.additionalTargetDamage.value === 700000));
      assert.ok(areas.every((area) => area.attackKind.state === 'unknown'));
    }],
    ['stage_711_7110011.html', (pack) => {
      assert.ok(pack.canonical.events[0].stages[0].encounters.flatMap((item) => item.enemies).some((enemy) => enemy.alignment.value === 'neutral'));
    }],
    ['stage_1717_17170015.html', (pack) => {
      assert.ok(pack.canonical.events[0].stages[0].encounters.flatMap((item) => item.aiActions).length > 0);
    }],
    ['stage_701_7010013.html', (pack) => {
      assert.ok(pack.canonical.events[0].stages[0].encounters.flatMap((item) => item.enemies).flatMap((enemy) => enemy.skills).length > 0);
    }]
  ];
  for (const [name, verify] of cases) {
    const page = await cached(name);
    const event = await cachedEvent(page.eventId);
    assert.deepEqual(resolveDokkanInfoSelection([event, page]).missing, []);
    const pack = await packagePages([event, page]);
    assert.equal(pack.classification, 'manual-dokkaninfo-private-prototype');
    assert.equal(pack.productionApplyAllowed, false);
    assert.equal(pack.canonical.sourceSnapshots[0].sourceKey, DOKKANINFO_SOURCE);
    assert.equal(pack.canonical.sourceSnapshots[0].policyStatus, 'manual-private-prototype-permission-unverified');
    assert.deepEqual(await validatePackage(pack), pack);
    verify(pack);
  }
});

test('Phase11 accepts the audited 2.37MB stage within the evidence-based 4MB decoded limit', async () => {
  const raw = await readFile(new URL('../../scraper/html_cache/stage_701_7010013.html', import.meta.url));
  assert.ok(raw.length > 2 * 1024 * 1024 && raw.length < HTML_LIMIT);
  assert.equal((await cached('stage_701_7010013.html')).parsedStage.enemies.length, 9);
  const tooLarge = new Uint8Array(HTML_LIMIT + 1); tooLarge.fill(32); tooLarge.set(new TextEncoder().encode('<html>'));
  assert.throws(() => decodeLocalFile(tooLarge), errorCode('HTML_TOO_LARGE'));
});

test('Phase11 runs real offline saved pages through Phase10 review/apply and blocks unresolved real AOE', async () => {
  const ready = await prepareFiles([
    await selectedCachedFile('event_1714.html'),
    await selectedCachedFile('stage_1714_17140015.html')
  ], empty, baseline.runtime);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(await checkApply(ready, empty, baseline.runtime), ready.snapshot);

  const area = await prepareFiles([
    await selectedCachedFile('event_1702.html'),
    await selectedCachedFile('stage_1702_17020095.html')
  ], empty, baseline.runtime);
  assert.equal(area.status, 'blocked');
  assert.ok(area.review.findings.some((finding) => finding.code === 'AOE_SEMANTICS_UNRESOLVED'));
});

test('Phase11 plain HTML and a local synthetic MHTML wrapper produce identical normalized and canonical results', async () => {
  const name = 'stage_1714_17140015.html';
  const raw = await readFile(new URL(`../../scraper/html_cache/${name}`, import.meta.url), 'utf8');
  const location = 'https://jpnja.dokkaninfo.com/events/challenge/1714/17140015';
  const htmlPage = parseDokkanInfoSavedPage(decodeLocalFile(bytes(raw)), { fileName: name, capturedAt: CAPTURED_AT });
  const mhtmlPage = parseDokkanInfoSavedPage(decodeLocalFile(bytes(dokkanInfoMhtml(raw, location))), { fileName: name, capturedAt: CAPTURED_AT });
  const eventPage = await cachedEvent('1714');
  assert.deepEqual(mhtmlPage, htmlPage);
  assert.deepEqual(await packagePages([eventPage, mhtmlPage]), await packagePages([eventPage, htmlPage]));
});

test('Phase11 resolves DokkanInfo MHTML cid type and Super icons without loading resources', () => {
  const html = dokkanInfoStageHtml()
    .replace('/layout/cha_type_icon_22.png', 'cid:type-icon')
    .replaceAll('/sp_skill_icon_etc.png', 'cid:super-icon');
  const mhtml = dokkanInfoMhtml(html, 'https://jpnja.dokkaninfo.com/events/challenge/990001/99000101', [
    { id: 'type-icon', location: 'https://jpnja.dokkaninfo.com/layout/cha_type_icon_22.png' },
    { id: 'super-icon', location: 'https://jpnja.dokkaninfo.com/layout/sp_skill_icon_etc.png' }
  ]);
  const page = parseDokkanInfoSavedPage(decodeLocalFile(bytes(mhtml)), { fileName: 'stage.mhtml', capturedAt: CAPTURED_AT });
  assert.equal(page.parsedStage.enemies[0].class, 'extreme');
  assert.equal(page.parsedStage.enemies[0].type, 'int');
  assert.equal(page.parsedStage.enemies[0].superAttacks.length, 2);
});

test('Phase11 validates exact DokkanInfo host/path identity and MHTML Content-Location', () => {
  const good = dokkanInfoStageHtml();
  for (const bad of [
    good.replace('https://jpnja.dokkaninfo.com/', 'http://jpnja.dokkaninfo.com/'),
    good.replace('jpnja.dokkaninfo.com', 'jpnja.dokkaninfo.com.example.invalid'),
    good.replace('/events/challenge/990001/99000101', '/cards/99000101')
  ]) assert.throws(() => parseDokkanInfoSavedPage(decodeLocalFile(bytes(bad)), { fileName: 'bad.html', capturedAt: CAPTURED_AT }));
  const mismatch = dokkanInfoMhtml(good, 'https://jpnja.dokkaninfo.com/events/challenge/990001/99000199');
  assert.throws(() => parseDokkanInfoSavedPage(decodeLocalFile(bytes(mismatch)), { fileName: 'bad.mhtml', capturedAt: CAPTURED_AT }), errorCode('DOKKANINFO_IDENTITY'));
  const noSavedLocation = dokkanInfoMhtml(good)
    .replace(/^Snapshot-Content-Location:.*\r\n/m, '')
    .replace(/^Content-Location:.*\r\n/m, '');
  assert.throws(() => parseDokkanInfoSavedPage(decodeLocalFile(bytes(noSavedLocation)), { fileName: 'no-location.mhtml', capturedAt: CAPTURED_AT }), errorCode('DOKKANINFO_IDENTITY'));
});

test('Phase11 event page is guidance and evidence; every import needs one event page plus each selected stage', async () => {
  const realEvent = parseDokkanInfoSavedPage(decodeLocalFile(await readFile(new URL('../../scraper/html_cache/event_1702.html', import.meta.url))), { fileName: 'event_1702.html', capturedAt: CAPTURED_AT });
  assert.equal(realEvent.pageKind, 'event'); assert.equal(realEvent.stageLinks.length, 10);
  const eventOnly = await prepareFiles([selectedFile(await readFile(new URL('../../scraper/html_cache/event_1702.html', import.meta.url)), 'event_1702.html')], empty, baseline.runtime);
  assert.equal(eventOnly.status, 'incomplete'); assert.equal(eventOnly.links.length, 10);
  assert.ok(eventOnly.links.every((link) => realEvent.stageLinks.some((item) => item.href === link.href && item.observedInMaterial)));
  const savedStage = await cached('stage_1702_17020095.html');
  const stageOnly = resolveDokkanInfoSelection([savedStage]);
  assert.equal(stageOnly.bundles.length, 0);
  assert.ok(stageOnly.missing.some((message) => message.includes('eventページ')));

  const event = parseDokkanInfoSavedPage(decodeLocalFile(bytes(dokkanInfoEventHtml())), { fileName: 'event.html', capturedAt: CAPTURED_AT });
  const stage = parseDokkanInfoSavedPage(decodeLocalFile(bytes(dokkanInfoStageHtml())), { fileName: 'stage.html', capturedAt: CAPTURED_AT });
  assert.ok(resolveDokkanInfoSelection([stage]).missing.some((message) => message.includes('eventページ')));
  const resolved = resolveDokkanInfoSelection([event, stage]);
  assert.equal(resolved.bundles.length, 1); assert.deepEqual(resolved.missing, []);
});

test('Phase11 accepts an observed DEF of zero but still rejects a missing DEF', async () => {
  const result = await prepareFiles([
    selectedFile(dokkanInfoEventHtml(), 'event.html'),
    selectedFile(dokkanInfoStageHtml({ def: 0 }), 'stage.html')
  ], empty, baseline.runtime);
  assert.equal(result.status, 'ready');
  assert.equal(result.snapshot.packages[0].canonical.events[0].stages[0].encounters[0].enemies[0].stats.defense.value, 0);
});

test('Phase11 rejects a future timestamp on either selected DokkanInfo page', async () => {
  const future = Date.parse('2099-01-01T00:00:00Z');
  await assert.rejects(prepareFiles([
    selectedFile(dokkanInfoEventHtml(), 'event.html', future),
    selectedFile(dokkanInfoStageHtml(), 'stage.html')
  ], empty, baseline.runtime), errorCode('FUTURE_REVISION'));
  await assert.rejects(prepareFiles([
    selectedFile(dokkanInfoEventHtml(), 'event.html'),
    selectedFile(dokkanInfoStageHtml(), 'stage.html', future)
  ], empty, baseline.runtime), errorCode('FUTURE_REVISION'));
});

test('Phase11 imports one new event and multiple selected stages in one batch', async () => {
  const eventId = '990002';
  const stages = [
    { id: '99000201', name: '架空一括ステージ1' },
    { id: '99000202', name: '架空一括ステージ2' }
  ];
  const result = await prepareFiles([
    selectedFile(dokkanInfoEventHtml({ eventId, eventName: '取込確認用・架空一括イベント', stages }), 'event.html'),
    selectedFile(dokkanInfoStageHtml({ eventId, stageId: stages[0].id, stageName: stages[0].name }), 'stage-1.html'),
    selectedFile(dokkanInfoStageHtml({ eventId, stageId: stages[1].id, stageName: stages[1].name, normalAtk: 650000 }), 'stage-2.html')
  ], empty, baseline.runtime);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.stageChanges, {
    added: ['manual-dokkaninfo:990002/99000201', 'manual-dokkaninfo:990002/99000202'],
    changed: [],
    removed: []
  });
  assert.equal(result.snapshot.packages.length, 2);
  assert.equal(result.review.candidateCounts.enemies, baseline.counts.enemies + 2);
});

test('Phase11 self-authored DokkanInfo-shaped HTML/MHTML runs local parse → Phase10 review → explicit personal save', async () => {
  const event = dokkanInfoEventHtml(); const stage = dokkanInfoStageHtml();
  const result = await prepareFiles([
    selectedFile(event, 'event.html', Date.parse('2026-09-01T00:00:00Z')),
    selectedFile(dokkanInfoMhtml(stage), 'stage.mhtml', Date.parse('2026-09-01T00:00:00Z'))
  ], empty, baseline.runtime);
  assert.equal(result.status, 'ready'); assert.equal(result.productionApplyAllowed, false);
  assert.deepEqual(result.stageChanges, { added: ['manual-dokkaninfo:990001/99000101'], changed: [], removed: [] });
  assert.equal(result.review.previousCounts.enemies, baseline.counts.enemies);
  assert.equal(result.review.candidateCounts.enemies, baseline.counts.enemies + 1);
  const stored = result.snapshot.packages[0];
  const canonicalEvent = stored.canonical.events[0];
  const canonicalStage = canonicalEvent.stages[0];
  const evidenceById = new Map(stored.canonical.evidence.map((item) => [item.id, item]));
  assert.ok(canonicalEvent.name.evidenceIds.every((id) => evidenceById.get(id).sourceUrl.endsWith('/events/challenge/990001')));
  assert.ok(canonicalStage.name.evidenceIds.every((id) => evidenceById.get(id).sourceUrl.endsWith('/events/challenge/990001/99000101')));
  assert.deepEqual(stored.receipts.map((receipt) => receipt.format).sort(), ['html', 'mhtml']);
  assert.ok(stored.receipts.every((receipt) => /^sha256:[a-f0-9]{64}$/.test(receipt.rawDigest) && receipt.rawBytes > 0));
  assert.doesNotMatch(JSON.stringify(stored.materials), /<!doctype html>/i);
  const tampered = structuredClone(stored); tampered.receipts[0].rawDigest = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(validatePackage(tampered));
  assert.deepEqual(await checkApply(result, empty, baseline.runtime), result.snapshot);
  const sameDataDifferentWrappers = await prepareFiles([
    selectedFile(event, 'renamed-event.html', Date.parse('2026-09-01T00:00:00Z')),
    selectedFile(dokkanInfoMhtml(stage), 'renamed-stage.mhtml', Date.parse('2026-09-01T00:00:00Z'))
  ], result.snapshot, baseline.runtime);
  assert.equal(sameDataDifferentWrappers.status, 'unchanged');
  assert.deepEqual(sameDataDifferentWrappers.snapshot, result.snapshot);
  const gate = manualPurposeGate(DOKKANINFO_SOURCE);
  assert.equal(gate.allowed, true); assert.equal(gate.localProvidedMaterialAllowed, true);
  assert.equal(gate.sourcePermissionVerified, false); assert.equal(gate.automaticFetchAllowed, false);
  assert.equal(gate.productionApplyAllowed, false); assert.equal(gate.redistributeAllowed, false);
});

test('Phase11 never infers missing DokkanInfo HP/ATK/DEF/Super/AOE fields', async () => {
  const event = selectedFile(dokkanInfoEventHtml(), 'event.html');
  for (const missing of ['hp', 'atk', 'def', 'super-a']) {
    const result = await prepareFiles([event, selectedFile(dokkanInfoStageHtml({ missing }), `stage-${missing}.html`)], empty, baseline.runtime);
    assert.equal(result.status, 'incomplete'); assert.ok(result.missing.some((message) => /不足|0/.test(message)));
  }
  const area = await prepareFiles([event, selectedFile(dokkanInfoStageHtml({ includeArea: true, missing: 'area-additional' }), 'stage-area.html')], empty, baseline.runtime);
  assert.equal(area.status, 'incomplete'); assert.ok(area.missing.some((message) => message.includes('追加対象')));
});

test('Phase11 stops incomplete Super schedules and AI actions not bound to an enemy', () => {
  const event = parseDokkanInfoSavedPage(decodeLocalFile(bytes(dokkanInfoEventHtml())), { fileName: 'event.html', capturedAt: CAPTURED_AT });
  const stage = parseDokkanInfoSavedPage(decodeLocalFile(bytes(dokkanInfoStageHtml())), { fileName: 'stage.html', capturedAt: CAPTURED_AT });
  const incompleteSchedule = structuredClone(stage);
  const attack = incompleteSchedule.parsedStage.enemies[0].superAttacks[0];
  assert.ok(attack.probabilityPercent != null && attack.usageRules.length > 0);
  attack.usageRules[0].probabilityPercent = null;
  assert.ok(resolveDokkanInfoSelection([event, incompleteSchedule]).missing.some((message) => message.includes('確率・回数・再使用条件')));

  const unboundAi = structuredClone(stage);
  unboundAi.parsedStage.groups[0].actions[0].enemyOrder = null;
  assert.ok(resolveDokkanInfoSelection([event, unboundAi]).missing.some((message) => message.includes('対象の敵')));
});

test('Phase11 preserves target-specific AOE but blocks personal apply when saved layout cannot prove attack kind', async () => {
  const result = await prepareFiles([
    selectedFile(dokkanInfoEventHtml(), 'event.html'),
    selectedFile(dokkanInfoStageHtml({ includeArea: true }), 'stage.html')
  ], empty, baseline.runtime);
  assert.equal(result.status, 'blocked');
  assert.ok(result.review.findings.some((finding) => finding.code === 'AOE_SEMANTICS_UNRESOLVED'));
  const area = result.snapshot.packages[0].canonical.events[0].stages[0].encounters[0].areaAttacks[0];
  assert.equal(area.firstTargetDamage.value, 1200000); assert.equal(area.additionalTargetDamage.value, 720000);
  assert.equal(area.attackKind.state, 'unknown');
});

test('Phase11 manual adapter and preview remain source-I/O free and embed no real cached enemy page', async () => {
  const adapter = await readFile(new URL('../../src/prototype/phase11-dokkaninfo-adapter.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(adapter, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  const preview = await readFile(new URL('../../generated/phase11/preview.html', import.meta.url), 'utf8');
  assert.match(preview, /connect-src 'none'/);
  assert.doesNotMatch(preview, /ジレン\(フルパワー\)|宇宙サバイバル編|stage_1702_17020095/);
  assert.match(preview, /自作のDokkanInfo形サンプル/);
  assert.match(await readFile(new URL('../../generated/phase11/sample-dokkaninfo-stage.html', import.meta.url), 'utf8'), /取込確認用・架空の敵/);
  assert.equal(preview, await readFile(new URL('../../phase11-preview/index.html', import.meta.url), 'utf8'));
});
