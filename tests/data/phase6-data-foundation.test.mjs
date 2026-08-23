import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

import { stableJson } from '../../generated/phase6/runtime/data-migration/phase4-enemy-migration.js';
import { phase4OfflineAdapter } from '../../generated/phase6/runtime/data-foundation/phase6-canonical.js';
import { projectCanonicalToRuntime } from '../../generated/phase6/runtime/data-foundation/phase6-runtime.js';
import {
  createPhase6PermissionLedger,
  createReleaseManifest,
  evaluatePermission,
  evaluateUpdateSafety,
  promoteRelease,
  verifyArtifactDescriptor
} from '../../generated/phase6/runtime/data-foundation/phase6-gates.js';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const generatedAt = '2026-02-23T08:11:11.385Z';
const [sourceText, canonical, runtime, manifest, permissionLedger, schemas] = await Promise.all([
  readFile(new URL('../fixtures/future/enemy-data-v1.representative.json', import.meta.url), 'utf8'),
  readFile(new URL('../fixtures/future/enemy-data-v2.canonical.representative.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../fixtures/future/enemy-data-runtime-v1.representative.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../artifacts/phase6/candidate-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../artifacts/phase6/permission-ledger.json', import.meta.url), 'utf8').then(JSON.parse),
  Promise.all([
    'enemy-data-v2.canonical.schema.json',
    'enemy-data-runtime-v1.schema.json',
    'enemy-data-release-manifest-v1.schema.json',
    'enemy-data-permission-ledger-v1.schema.json'
  ].map((name) => readFile(new URL(`../../schemas/${name}`, import.meta.url), 'utf8').then(JSON.parse)))
]);
const source = JSON.parse(sourceText);
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
addFormats(ajv);
const [validateCanonical, validateRuntime, validateManifest, validatePermission] = schemas.map((schema) => ajv.compile(schema));

function sha(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function context() {
  return { inputPath: 'representative.json', inputDigest: sha(sourceText), inputBytes: Buffer.byteLength(sourceText), reproducibleBy: 'npm test' };
}

function allEncounters(dataset) {
  return dataset.events.flatMap((event) => event.stages.flatMap((stage) => stage.encounters));
}

function allEnemies(dataset) {
  return allEncounters(dataset).flatMap((encounter) => encounter.enemies);
}

function validIntegrity(overrides = {}) {
  return { canonicalSchemaValid: true, runtimeSchemaValid: true, canonicalDigestMatches: true, runtimeDigestMatches: true, canonicalGenerationSucceeded: true, runtimeGenerationSucceeded: true, ...overrides };
}

function safety(candidate = canonical, previousKnownGood = canonical, integrity = validIntegrity()) {
  return evaluateUpdateSafety({ candidate, runtime: projectCanonicalToRuntime(candidate).runtime, integrity, previousKnownGood, evaluatedAt: generatedAt });
}

test('canonical v2・runtime・manifest・permission ledgerは各schemaを通る', () => {
  assert.equal(validateCanonical(canonical), true, JSON.stringify(validateCanonical.errors, null, 2));
  assert.equal(validateRuntime(runtime), true, JSON.stringify(validateRuntime.errors, null, 2));
  assert.equal(validateManifest(manifest), true, JSON.stringify(validateManifest.errors, null, 2));
  assert.equal(validatePermission(permissionLedger), true, JSON.stringify(validatePermission.errors, null, 2));
});

test('offline adapterは同じ入力からbyte-identical canonicalを生成しnetworkを要求しない', () => {
  assert.equal(phase4OfflineAdapter.canHandle(source), true);
  assert.equal(phase4OfflineAdapter.descriptor.networkAccess, 'forbidden');
  const first = phase4OfflineAdapter.adapt(source, context());
  const second = phase4OfflineAdapter.adapt(structuredClone(source), context());
  assert.equal(stableJson(first.canonical), stableJson(second.canonical));
  assert.equal(stableJson(first.canonical), stableJson(canonical));
  assert.match(first.sourceMaterial.retainedInformation.join(' '), /raw/);
});

test('canonical IDは取得元名を含まず、source IDとprovenanceはsourceRefsへ残る', () => {
  const enemies = allEnemies(canonical);
  assert.ok(enemies.every((enemy) => !enemy.id.includes('dokkaninfo')));
  assert.ok(enemies.every((enemy) => enemy.sourceRefs.length > 0));
  assert.ok(enemies.some((enemy) => enemy.sourceRefs[0].compositeKey.startsWith('dokkaninfo-cache:')));
  assert.ok(canonical.sourceSnapshots.every((snapshot) => snapshot.sourceKey.length > 0));
  assert.ok(canonical.evidence.length > 0);
});

test('複数必殺・usage rule・neutral・AOE・AIをcanonicalが保持する', () => {
  const encounters = allEncounters(canonical);
  const enemies = allEnemies(canonical);
  assert.ok(enemies.some((enemy) => enemy.superAttacks.length > 1));
  assert.ok(enemies.some((enemy) => enemy.superAttacks.some((attack) => attack.usageRules.length > 1)));
  assert.ok(enemies.some((enemy) => enemy.alignment.state === 'known' && enemy.alignment.value === 'neutral'));
  assert.ok(encounters.some((encounter) => encounter.areaAttacks.length > 0));
  assert.ok(encounters.some((encounter) => encounter.aiActions.length > 1));
});

test('known zero・unknown・unavailableをnull補完せず区別する', () => {
  const enemies = allEnemies(canonical);
  assert.ok(enemies.some((enemy) => enemy.stats.damageReductionPercent.state === 'known' && enemy.stats.damageReductionPercent.value === 0));
  assert.ok(enemies.some((enemy) => enemy.critical.attackMultiplier.state === 'unknown' && enemy.critical.attackMultiplier.value === null));
  assert.ok(enemies.some((enemy) => Object.values(enemy.stats).some((field) => field.state === 'unavailable' && field.value === null)));
  assert.ok(enemies.every((enemy) => Object.values(enemy.stats).every((field) => field.state === 'known' || field.value === null)));
});

test('runtime projectionは決定的で、必須計算情報とAOEを保持し監査情報だけを省略する', () => {
  const first = projectCanonicalToRuntime(canonical);
  const second = projectCanonicalToRuntime(structuredClone(canonical));
  assert.equal(stableJson(first.runtime), stableJson(second.runtime));
  assert.equal(stableJson(first.runtime), stableJson(runtime));
  assert.deepEqual(first.report.requiredCalculationLosses, []);
  assert.ok(first.report.omitted.some((item) => item.fieldFamily.includes('evidence') && item.retainedInCanonical));
  assert.ok(allEnemies(first.runtime).some((enemy) => enemy.superAttacks.length > 1));
  assert.ok(allEncounters(first.runtime).some((encounter) => encounter.areaAttacks.length > 0));
});

test('安全gateは正常な同一known-good比較を通し、初回baselineなしはreviewで止める', () => {
  const passed = safety();
  assert.equal(passed.status, 'passed');
  assert.equal(passed.counts['hard-fail'], 0);
  const initial = safety(canonical, null);
  assert.equal(initial.status, 'review-required');
  assert.ok(initial.findings.some((finding) => finding.code === 'NO_CANONICAL_KNOWN_GOOD_BASELINE'));
});

test('安全gateはschema・digest・生成失敗、ATK欠損、ID衝突をhard failにする', () => {
  const integrityFailure = safety(canonical, canonical, validIntegrity({ canonicalSchemaValid: false, runtimeDigestMatches: false, runtimeGenerationSucceeded: false }));
  assert.equal(integrityFailure.status, 'hard-fail');
  for (const code of ['CANONICAL_SCHEMA_INVALID', 'RUNTIME_DIGEST_MISMATCH', 'RUNTIME_GENERATION_FAILED']) assert.ok(integrityFailure.findings.some((finding) => finding.code === code));

  const missingAttack = structuredClone(canonical);
  const combat = allEnemies(missingAttack).find((enemy) => enemy.role.value === 'combat');
  combat.stats.baseAttack = { ...combat.stats.baseAttack, state: 'unknown', value: null };
  assert.ok(safety(missingAttack).findings.some((finding) => finding.code === 'COMBAT_ATTACK_MISSING'));

  const collision = structuredClone(canonical);
  collision.events[1].id = collision.events[0].id;
  assert.ok(safety(collision).findings.some((finding) => finding.code === 'DUPLICATE_CANONICAL_ID'));
});

test('安全gateは大量0・属性欠損・件数急減・snapshot後退を止める', () => {
  const massZero = structuredClone(canonical);
  allEnemies(massZero).filter((enemy) => enemy.role.value === 'combat').slice(0, 6).forEach((enemy) => { enemy.stats.baseAttack = { ...enemy.stats.baseAttack, state: 'known', value: 0 }; });
  assert.ok(safety(massZero).findings.some((finding) => finding.code === 'MASS_ZERO_ATTACK'));

  const missingTypes = structuredClone(canonical);
  allEnemies(missingTypes).filter((enemy) => enemy.role.value === 'combat').slice(0, 6).forEach((enemy) => { enemy.type = { ...enemy.type, state: 'unknown', value: null }; });
  assert.ok(safety(missingTypes).findings.some((finding) => finding.code === 'MASS_UNKNOWN_ATTRIBUTE'));

  const reduced = structuredClone(canonical);
  reduced.events = reduced.events.slice(0, 1);
  assert.ok(safety(reduced).findings.some((finding) => finding.code.includes('SEVERE_REDUCTION')));

  const older = structuredClone(canonical);
  older.sourceSnapshots[0].acquiredAt = '2020-01-01T00:00:00.000Z';
  assert.ok(safety(older).findings.some((finding) => finding.code === 'SOURCE_SNAPSHOT_REGRESSION'));
});

test('正常な新event追加はinformationalであり追加だけを危険扱いしない', () => {
  const previous = structuredClone(canonical);
  previous.events = previous.events.slice(0, Math.ceil(previous.events.length / 2));
  const result = safety(canonical, previous);
  assert.equal(result.status, 'passed');
  assert.ok(result.findings.some((finding) => finding.code === 'COUNT_EVENTS_ADDITION' && finding.severity === 'informational'));
});

test('permission gateは操作単位でallowed/denied/unknownをfail closed判定する', () => {
  assert.equal(evaluatePermission(permissionLedger, 'dokkaninfo-saved-cache', 'offline-transform').allowed, true);
  assert.equal(evaluatePermission(permissionLedger, 'dokkaninfo-saved-cache', 'automatic-fetch').decision, 'denied');
  assert.equal(evaluatePermission(permissionLedger, 'dokkanstats', 'automatic-fetch').decision, 'unknown');
  assert.equal(evaluatePermission(permissionLedger, 'missing-source', 'publish-derived').allowed, false);
});

test('manifestはartifact digest/version/known-good rollback metadataを保持する', () => {
  assert.equal(manifest.manifestSchemaVersion, '1.0.0');
  assert.equal(manifest.canonicalSchemaVersion, '2.0.0');
  assert.equal(manifest.runtimeSchemaVersion, '1.0.0');
  assert.equal(manifest.compatibleAppVersion.productionAppReadsArtifact, false);
  assert.equal(manifest.previousKnownGood.kind, 'legacy-production');
  assert.match(manifest.previousKnownGood.artifactDigest, /^sha256:[a-f0-9]{64}$/);
  for (const artifact of Object.values(manifest.artifacts)) assert.equal(verifyArtifactDescriptor(artifact), true);
});

test('candidate→stable→known-goodは安全・permission・health checkなしに昇格しない', () => {
  assert.equal(promoteRelease(manifest, 'stable').allowed, false);
  const validation = safety();
  const fake = (name) => ({ path: `${name}.json`, digest: `sha256:${'a'.repeat(64)}`, bytes: 1, schemaVersion: '1.0.0' });
  const promotable = createReleaseManifest({
    manifestId: 'test-manifest', datasetVersion: 'test-v1', generatedAt, candidate: canonical,
    artifacts: { sourceInput: fake('source'), canonical: fake('canonical'), runtime: fake('runtime'), validationReport: fake('validation'), omissionReport: fake('omission') },
    validation, validationReportDigest: `sha256:${'b'.repeat(64)}`, permissionLedgerDigest: `sha256:${'c'.repeat(64)}`,
    offlineTransformAllowed: true, productionPublishAllowed: true,
    previousKnownGood: { datasetVersion: 'previous', artifactDigest: `sha256:${'d'.repeat(64)}`, manifestDigest: null, kind: 'phase6-release' }
  });
  const stable = promoteRelease(promotable, 'stable');
  assert.equal(stable.allowed, true);
  assert.equal(stable.manifest.releaseState, 'stable');
  assert.equal(promoteRelease(stable.manifest, 'known-good', false).allowed, false);
  assert.equal(promoteRelease(stable.manifest, 'known-good', true).manifest.releaseState, 'known-good');
});
