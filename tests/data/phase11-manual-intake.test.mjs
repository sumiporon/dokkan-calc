import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  decodeLocalFile, parseReferencePage, mergeReferencePages, renderReferenceHtml,
  packagePages, validatePackage, makeSnapshot, validateSnapshot, prepareFiles,
  checkApply, manualPurposeGate, compositeForReview, reviewSnapshots, FILE_LIMIT
} from '../../generated/phase11/api.mjs';
import baseline from '../../generated/phase11/baseline.mjs';
import { referencePage, referenceMhtml } from '../fixtures/phase11/reference-source.mjs';
import { enemyAttackState, superAttackAvailableInState, createAreaAttackSelection, parseAreaAttackSelection } from '../../src/release-candidate/phase8-ui-model.mjs';

const core = createRequire(import.meta.url)('../../src/calculation-core.js');
const bytes = (text) => new TextEncoder().encode(text);
const decode = (text) => decodeLocalFile(bytes(text));
const parsed = (page = referencePage()) => parseReferencePage(decode(renderReferenceHtml(page)));
const file = (page = referencePage()) => new File([renderReferenceHtml(page)], 'sample.html', { type: 'text/html' });
const errorCode = (code) => (error) => error.code === code;
const change = (kind, field, value) => { const page = referencePage(); page.records.find((row) => row.kind === kind).fields[field] = value; return page; };
const empty = await makeSnapshot([]);
const initial = await packagePages([referencePage()]);
const saved = await makeSnapshot([initial]);

test('Phase11 UTF-8 HTML parses self-authored fields without losing Japanese names', () => {
  assert.deepEqual(parsed(), referencePage());
});
test('Phase11 MHTML quoted-printable/base64 and start root decode identically', () => {
  const html = renderReferenceHtml(referencePage());
  for (const encoding of ['quoted-printable', 'base64']) for (const start of [true, false]) {
    const result = decode(referenceMhtml(html, { encoding, start }));
    assert.equal(result.format, 'mhtml'); assert.deepEqual(parseReferencePage(result), referencePage());
  }
});
test('Phase11 MHTML ignores resource bodies and resolves saved cid type metadata only', () => {
  const html = renderReferenceHtml(referencePage()).replace('<dd data-field="type">teq</dd>', '<img data-field="type" src="cid:icon">');
  const mhtml = referenceMhtml(html, { boundary: 'B' }).replace('--B--', '--B\r\nContent-Type: image/svg+xml\r\nContent-ID: <icon>\r\nContent-Location: https://manual-fixture.invalid/type-teq.svg\r\n\r\n<script>must-not-run</script>\r\n--B--');
  assert.equal(parseReferencePage(decode(mhtml)).records.find((row) => row.kind === 'enemy').fields.type, 'teq');
});
test('Phase11 rejects truncated, ambiguous, nested and invalid MHTML', () => {
  const mhtml = referenceMhtml(renderReferenceHtml(referencePage()), { boundary: 'B' });
  assert.throws(() => decode(mhtml.replace('--B--', '')), errorCode('MIME_INCOMPLETE'));
  assert.throws(() => decode(mhtml.replace('start="<root>"', 'start="<unknown>"')), errorCode('MIME_ROOT'));
  assert.throws(() => decode(mhtml.replace('Content-Type: text/html;', 'Content-Type: multipart/related;')), errorCode('MIME_NESTED'));
  assert.throws(() => decode(mhtml.replace('Content-ID: <root>', 'Content-ID: <root>\r\nContent-ID: <root>')), errorCode('MIME_HEADERS'));
  assert.throws(() => decode(mhtml.replace('=3C', '=XX')), errorCode('MIME_QP'));
  assert.throws(() => decode(mhtml.replace('charset="utf-8"', 'charset="unsupported"')), errorCode('HTML_CHARSET'));
  assert.throws(() => decode(mhtml.replace('Snapshot-Content-Location: https:', 'Snapshot-Content-Location: http:')), errorCode('MIME_URL_CONFLICT'));
});
test('Phase11 size/count/depth budgets reject bad inputs before import', async () => {
  assert.throws(() => decodeLocalFile(new Uint8Array(FILE_LIMIT + 1)), errorCode('FILE_SIZE'));
  assert.throws(() => decodeLocalFile(new Uint8Array([0xff])), errorCode('HTML_DECODE'));
  assert.throws(() => parseReferencePage(decode('<html>' + '<div>'.repeat(70) + '</div>'.repeat(70) + '</html>')), errorCode('HTML_COMPLEXITY'));
  await assert.rejects(prepareFiles(Array(11).fill(file()), empty, baseline.runtime), errorCode('FILE_COUNT'));
});
test('Phase11 URL, plain clipboard text and unknown real-source HTML are not fetch instructions', async () => {
  assert.throws(() => decode('https://example.invalid/stage'), errorCode('HTML_REQUIRED'));
  assert.throws(() => parseReferencePage(decode('<html><body>Unknown source</body></html>')), errorCode('SOURCE_UNSUPPORTED'));
  for (const source of ['dokkanstats', 'dokkan-battle-france', 'dokkaninfo', 'unknown']) assert.equal(manualPurposeGate(source).allowed, false);
  const gate = manualPurposeGate('phase11-self-authored-reference');
  assert.equal(gate.allowed, true); assert.equal(gate.automaticFetchAllowed, false); assert.equal(gate.productionApplyAllowed, false); assert.equal(gate.realSourceAllowed, false);
});
test('Phase11 scripts, credentials, forms, tracking images are discarded from normalized material', async () => {
  const html = renderReferenceHtml(referencePage()).replace('</main>', '<script>secret-test-token</script><form><input value="fake-pat" data-field="atk"></form><img src="https://example.invalid/track"></main>');
  const pack = await packagePages([parseReferencePage(decode(html))]);
  const text = JSON.stringify(pack);
  assert.doesNotMatch(text, /secret-test-token|fake-pat|example.invalid\/track|<script/);
  assert.equal(pack.digest, initial.digest);
});
test('Phase11 incomplete AOE stops and guides only to a link actually received', async () => {
  const result = await prepareFiles([file(referencePage({ split: true }))], empty, baseline.runtime);
  assert.equal(result.status, 'incomplete'); assert.ok(result.missing.some((text) => text.includes('additional')));
  assert.equal(result.links[0].part, 'detail'); assert.equal(result.snapshot, undefined);
  await assert.rejects(packagePages([referencePage({ split: true })]), errorCode('INCOMPLETE_STAGE'));
});
test('Phase11 two complementary pages merge by IDs; conflicting/duplicate pages stop', async () => {
  const main = referencePage({ split: true }), detail = referencePage({ split: true, detail: true });
  const pack = await packagePages([parsed(main), parsed(detail)]);
  assert.equal(pack.canonical.sourceSnapshots.length, 2);
  assert.equal(pack.runtime.events[0].stages[0].encounters[0].areaAttacks[0].additionalTargetDamage.value, 720000);
  assert.throws(() => mergeReferencePages([main, main]), errorCode('DUPLICATE_PAGE'));
  detail.records[0].fields.first = 999;
  assert.throws(() => mergeReferencePages([main, detail]), errorCode('SOURCE_CONFLICT'));
});
test('Phase11 unknown attributes, missing values and unsupported fields are never inferred', async () => {
  for (const [kind, key] of [['enemy', 'atk'], ['enemy', 'type'], ['super', 'atk'], ['area', 'additional'], ['ai', 'text']]) {
    await assert.rejects(packagePages([change(kind, key, null)]), errorCode('INCOMPLETE_STAGE'));
  }
  await assert.rejects(packagePages([change('enemy', 'type', 'water')]));
  await assert.rejects(packagePages([change('super', 'target', 'unknown-target')]), errorCode('SUPER_TARGET'));
  await assert.rejects(packagePages([change('ai', 'kind', 'unknown-rule')]), errorCode('AI_KIND'));
  assert.throws(() => parsed(change('enemy', 'unknown-stat', 1)), errorCode('SOURCE_FIELDS'));
});
test('Phase11 rejects invalid numbers, impossible percentages and inverted HP ranges', async () => {
  assert.throws(() => parsed(change('enemy', 'atk', '1,23')), errorCode('REFERENCE_NUMBER'));
  await assert.rejects(packagePages([change('enemy', 'reduction', 101)]), errorCode('CANONICAL_MEANING'));
  await assert.rejects(packagePages([change('super', 'hp-min', 101)]), errorCode('CANONICAL_MEANING'));
  await assert.rejects(packagePages([change('enemy', 'critical', 'perhaps')]), errorCode('SOURCE_BOOLEAN'));
});
test('Phase11 retains canonical HP/DEF, AI, multiple Supers, usage rules and target-specific AOE', () => {
  const encounter = initial.canonical.events[0].stages[0].encounters[0];
  assert.equal(encounter.enemies[0].stats.hp.value, 10000000);
  assert.equal(encounter.enemies[0].stats.defense.value, 150000);
  assert.equal(encounter.aiActions.length, 1);
  assert.equal(encounter.enemies[0].superAttacks.length, 2);
  assert.equal(encounter.areaAttacks[0].firstTargetDamage.value, 1200000);
  assert.equal(encounter.areaAttacks[0].additionalTargetDamage.value, 720000);
});
test('Phase11 runtime is compatible with existing attack/HP/colon-AOE selection helpers', () => {
  const encounter = initial.runtime.events[0].stages[0].encounters[0], enemy = encounter.enemies[0];
  const attacks = enemyAttackState(enemy, { turn: 1, hp: 100, hits: 0 }, core);
  assert.deepEqual(attacks.normalValues, [600000]); assert.deepEqual(attacks.supers.map((value) => value.value), [1500000, 2500000]);
  assert.equal(superAttackAvailableInState(enemy.superAttacks[0], { hp: 100 }), true);
  assert.equal(superAttackAvailableInState(enemy.superAttacks[1], { hp: 100 }), false);
  assert.equal(superAttackAvailableInState(enemy.superAttacks[1], { hp: 50 }), true);
  for (const target of ['first', 'additional']) assert.deepEqual(parseAreaAttackSelection(createAreaAttackSelection(encounter.areaAttacks[0].id, target)), { id: encounter.areaAttacks[0].id, target });
});
test('Phase11 packages and snapshots are reproducible, versioned and hash validated', async () => {
  assert.equal((await packagePages([referencePage()])).digest, initial.digest);
  assert.deepEqual(await validatePackage(initial), initial); assert.deepEqual(await validateSnapshot(saved), saved);
  const modified = structuredClone(initial); modified.runtime.events[0].stages[0].encounters[0].enemies[0].baseAttack.value++;
  await assert.rejects(validatePackage(modified), errorCode('PACKAGE_HASH'));
  modified.materials[0].text += ' ';
  await assert.rejects(validatePackage(modified), errorCode('MATERIAL_HASH'));
  await assert.rejects(validateSnapshot({ ...saved, version: 'future' }), errorCode('STORAGE_VERSION'));
  await assert.rejects(validateSnapshot(await makeSnapshot([initial, initial])), errorCode('STORAGE_DUPLICATE'));
});
test('Phase11 multi-stage addition keeps every official record unchanged and cannot publish', async () => {
  const result = await prepareFiles([file(), file(referencePage({ stageId: 'forest-2' }))], empty, baseline.runtime);
  assert.equal(result.status, 'ready'); assert.equal(result.stageChanges.added.length, 2);
  const merged = compositeForReview(baseline.runtime, result.snapshot.packages);
  assert.deepEqual(merged.events.slice(0, baseline.runtime.events.length), baseline.runtime.events);
  assert.equal(result.review.candidateCounts.enemies, 4247); assert.equal(result.productionApplyAllowed, false);
  assert.equal(result.review.productionApplyAllowed, false);
});
test('Phase11 exact duplicate is a no-op and existing stage ATK update is an explicit review', async () => {
  assert.equal((await prepareFiles([file()], saved, baseline.runtime)).status, 'unchanged');
  const result = await prepareFiles([file(referencePage({ normalAtk: 660000 }))], saved, baseline.runtime);
  assert.equal(result.status, 'ready'); assert.equal(result.stageChanges.changed.length, 1);
  assert.ok(result.review.findings.some((item) => item.code === 'EXISTING_RECORD_CHANGED'));
  assert.deepEqual(await checkApply(result, saved, baseline.runtime), result.snapshot);
  await assert.rejects(checkApply(result, empty, baseline.runtime), errorCode('STALE_PREVIEW'));
});
test('Phase11 Phase10 gate stops attribute changes, missing Supers and removed AOE', async () => {
  const attribute = await prepareFiles([file(change('enemy', 'type', 'str'))], saved, baseline.runtime);
  assert.equal(attribute.status, 'blocked');
  for (const kind of ['super', 'area']) {
    const page = referencePage(); page.records = page.records.filter((row) => row.kind !== kind); page.expectedCounts[kind] = 0;
    const result = await prepareFiles([file(page)], saved, baseline.runtime);
    assert.equal(result.status, 'blocked'); assert.ok(result.review.findings.some((item) => item.severity === 'hard-fail'));
  }
});
test('Phase11 canonical-only AI disappearance stops and HP/DEF changes are reported', async () => {
  const page = referencePage(); page.records = page.records.filter((row) => row.kind !== 'ai'); page.expectedCounts.ai = 0;
  const result = await prepareFiles([file(page)], saved, baseline.runtime);
  assert.equal(result.status, 'blocked'); assert.ok(result.review.findings.some((item) => item.code === 'PRIVATE_SOURCE_RECORD_LOST'));
  const hp = await prepareFiles([file(change('enemy', 'hp', 11000000))], saved, baseline.runtime);
  assert.equal(hp.stageChanges.changed.length, 1); assert.ok(hp.review.findings.some((item) => item.code === 'PRIVATE_SOURCE_FIELDS_CHANGED'));
});
test('Phase11 rejects time regression/future data and parent/duplicate ID conflicts', async () => {
  await assert.rejects(prepareFiles([file(referencePage({ revision: '2026-08-30T00:00:00Z' }))], saved, baseline.runtime), errorCode('REVISION_REGRESSION'));
  await assert.rejects(packagePages([referencePage({ revision: '2999-01-01T00:00:00Z' })]), errorCode('FUTURE_REVISION'));
  const page = referencePage(); page.records[1].parent = 'missing';
  await assert.rejects(packagePages([page]), errorCode('SOURCE_PARENT'));
  const duplicate = referencePage(); duplicate.records.push(duplicate.records[1]);
  assert.throws(() => parsed(duplicate), errorCode('DUPLICATE_SOURCE_ID'));
});
test('Phase11 app source has no production/localStorage/network/transfer integration', async () => {
  const app = await readFile(new URL('../../prototypes/phase11-manual-intake/app.mjs', import.meta.url), 'utf8');
  const store = await readFile(new URL('../../src/prototype/phase11-store.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app + store, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage\.|postMessage\(|serviceWorker\./);
  const html = await readFile(new URL('../../generated/phase11/preview.html', import.meta.url), 'utf8');
  assert.match(html, /connect-src 'none'/); assert.match(html, /script-src 'sha256-/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});
