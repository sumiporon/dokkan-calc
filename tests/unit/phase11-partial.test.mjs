import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../../src/calculation-core.js';
import { inspectFictionalPartial, validatePartialMaterial, calculatePartial, validatePackage, sealMaterial } from '../../generated/phase11/partial/api.mjs';
import { sourceFixture, defenderFixture, CASES } from '../../prototypes/phase11-partial/fixtures.mjs';
const outputs = ['damage', 'zero-defense', 'target-defense'];
const noCore = new Proxy({}, { get() { throw new Error('Blocked evidence reached calculation-core'); } });
const materials = Object.fromEntries(await Promise.all(CASES.map(async id => [id, (await inspectFictionalPartial(sourceFixture(id))).material])));
const field = (m, path, hit = 0) => m.fields.find(f => f.slot === `hit-${hit}/${path}`);
const evidence = (m, path, hit = 0) => m.evidence.find(e => e.slot === `hit-${hit}/${path}`);

test('Same fictional stage: unchanged full validator passes full and rejects missing-count version', async () => {
  const full = await inspectFictionalPartial(sourceFixture('A', { full: true }));
  assert.equal(full.kind, 'full'); await validatePackage(full.package);
  assert.equal(full.package.canonical.events[0].stages[0].id, 'jpnja:event:990011:stage:99001101');
  const partial = await inspectFictionalPartial(sourceFixture('A'));
  assert.equal(partial.kind, 'partial'); assert.equal(partial.fullCheck.code, 'INCOMPLETE_STAGE');
  assert.match(partial.fullCheck.reason, /確率・回数・再使用条件/);
  await validatePartialMaterial(partial.material);
  await assert.rejects(validatePackage(partial.material), { code: 'PACKAGE_VERSION' });
  assert.equal(Object.hasOwn(partial.material, 'canonical'), false); assert.equal(Object.hasOwn(partial.material, 'runtime'), false);
});

for (const id of CASES) test(`Partial evidence route ${id}: correct numeric results or no core entry`, async () => {
  const m = await validatePartialMaterial(materials[id]);
  const expected = id === 'A' ? [{ minimum: 500000, maximum: 524000 }, 824000, 774000] : id === 'E' ? [{ minimum: 0, maximum: 0 }, 0, 0] : null;
  for (const [i, output] of outputs.entries()) {
    const result = await calculatePartial(m, output, defenderFixture(id), expected ? core : noCore);
    assert.equal(result.status, expected ? 'available' : 'blocked');
    if (expected) assert.deepEqual(result.value, expected[i]); else assert.equal(Object.hasOwn(result, 'value'), false);
  }
});

const attacks = [
  ['missing evidence ID', m => { field(m, 'attack.displayedDamage').evidenceIds = []; }],
  ['missing evidence record', m => { m.evidence.pop(); }],
  ['evidence from another enemy', m => { field(m, 'attack.displayedDamage').evidenceIds = [evidence(m, 'attack.displayedDamage', 2).id]; }],
  ['evidence from another attack', m => { field(m, 'attack.displayedDamage').evidenceIds = [evidence(m, 'attack.displayedDamage', 1).id]; }],
  ['evidence enemy association changed', m => { evidence(m, 'attack.displayedDamage').enemyId = m.targets[2].enemyId; }],
  ['stage membership mismatch', m => { m.source.stageId = '99009999'; }],
  ['event membership mismatch', m => { evidence(m, 'attack.displayedDamage').eventId = '990099'; }],
  ['revision mismatch', m => { m.capture.revision++; }],
  ['rule version mismatch', m => { m.versions.interpretation = 'unknown-rule'; }],
  ['evidence rule version mismatch', m => { evidence(m, 'attack.displayedDamage').ruleVersion = 'unknown-rule'; }],
  ['unknown coerced to zero', m => { const f = field(m, 'attack.displayedDamage'); f.state = 'known'; f.value = 0; f.confidence = 'high'; }, 'C'],
  ['unknown coerced to one', m => { const f = field(m, 'attack.displayedDamage'); f.state = 'known'; f.value = 1; f.confidence = 'high'; }, 'C'],
  ['unavailable treated as known', m => { const f = field(m, 'attack.maxPerTurn'); f.state = 'known'; f.value = 1; f.confidence = 'high'; }],
  ['not-applicable given a number', m => { field(m, 'attack.critical.attackUp').value = 0; }],
  ['partial relabelled full', m => { m.kind = 'full'; }],
  ['omitted required inspection scope', m => { m.coverage.omitted.push('unknown-section'); }],
  ['uninterpreted effect silently dropped', m => { m.uninterpreted = []; }, 'F'],
  ['source HTML smuggled into material', m => { m.rawHtml = '<script>secret</script>'; }],
  ['token smuggled into material', m => { m.token = 'not-a-real-token'; }]
];
for (const [name, mutate, caseId = 'A'] of attacks) test(`Reject ${name}, even after rehashing`, async () => {
  const m = structuredClone(materials[caseId]); mutate(m); const forged = await sealMaterial(m);
  await assert.rejects(validatePartialMaterial(forged));
  for (const output of outputs) {
    const result = await calculatePartial(forged, output, defenderFixture(caseId), noCore);
    assert.equal(result.status, 'blocked'); assert.equal(Object.hasOwn(result, 'value'), false);
  }
});
test('Digest mismatch stops before core', async () => {
  const m = structuredClone(materials.A); m.contentDigest = 'sha256:' + '0'.repeat(64);
  for (const output of outputs) assert.equal((await calculatePartial(m, output, defenderFixture(), noCore)).reasons[0].code, 'CONTENT_DIGEST');
});
test('Old revision known value cannot fill a newer unknown, even after rehashing', async () => {
  const next = (await inspectFictionalPartial(sourceFixture('C', { revision: 2 }))).material;
  Object.assign(field(next, 'attack.displayedDamage'), structuredClone(field(materials.A, 'attack.displayedDamage')));
  Object.assign(evidence(next, 'attack.displayedDamage'), structuredClone(evidence(materials.A, 'attack.displayedDamage')));
  const mixed = await sealMaterial(next);
  for (const output of outputs) assert.equal((await calculatePartial(mixed, output, defenderFixture(), noCore)).status, 'blocked');
});
test('Missing defender input blocks only the dependent output', async () => {
  const d = defenderFixture(); delete d.finalDefense;
  assert.equal((await calculatePartial(materials.A, 'damage', d, noCore)).status, 'blocked');
  assert.equal((await calculatePartial(materials.A, 'zero-defense', d, core)).status, 'available');
  delete d.targetDamage;
  assert.equal((await calculatePartial(materials.A, 'target-defense', d, noCore)).status, 'blocked');
});
test('Unsupported output and conditional scope do not reach core', async () => {
  assert.equal((await calculatePartial(materials.A, 'turn-total', defenderFixture(), noCore)).status, 'unsupported');
  const source = sourceFixture('A'); source.html = source.html.replace('data-proof="hit-0/condition.hpMinPercent">0', 'data-proof="hit-0/condition.hpMinPercent">50');
  const m = (await inspectFictionalPartial(source)).material;
  assert.equal((await calculatePartial(m, 'damage', defenderFixture(), noCore)).status, 'unsupported');
});
test('Stored record contains all four field states and no raw source markup', async () => {
  assert.equal(field(materials.C, 'attack.displayedDamage').state, 'unknown');
  assert.equal(field(materials.A, 'attack.maxPerTurn').state, 'unavailable');
  assert.equal(field(materials.A, 'attack.critical.attackUp').state, 'not-applicable');
  assert.equal(field(materials.E, 'attack.displayedDamage').value, 0);
  for (const m of Object.values(materials)) assert.doesNotMatch(JSON.stringify(m), /<html|<script|<img|cookie|token|sourceHtml/i);
});
