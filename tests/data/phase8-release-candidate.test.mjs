import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

import { createPhase8ReleaseArtifacts } from '../../scripts/generate-phase8-release-candidate.mjs';
import { MemoryStorage, createSavedDataMigrationPackage, importSavedDataMigrationPackage } from '../../src/prototype/phase7-saved-data-migration.mjs';
import { MemoryReleaseStore, performOneOperationUpdate } from '../../src/prototype/phase7-update-engine.mjs';
import { validatePhase8Index, validatePhase8Manifest, validatePhase8Runtime } from '../../src/release-candidate/phase8-manifest.mjs';
import { LAST_EVENT_KEY, readLastEvent, saveLastEvent } from '../../src/release-candidate/phase8-selection-state.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const [runtime, runtimeSchema, manifestSchema] = await Promise.all([
  readFile(new URL('../fixtures/phase8/synthetic-runtime.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../schemas/enemy-data-runtime-v1.schema.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../schemas/phase8-release-candidate-manifest-v1.schema.json', import.meta.url), 'utf8').then(JSON.parse)
]);
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateRuntimeSchema = ajv.compile(runtimeSchema);
const validateManifestSchema = ajv.compile(manifestSchema);

function files(result, overrides = {}) {
  const map = new Map([
    ['release-manifest.json', result.manifestJson],
    [result.manifest.full.json.path, result.fullJson],
    [result.manifest.chunked.indexJson.path, result.indexJson],
    ...result.chunks.map((chunk) => [chunk.jsonArtifact.path, chunk.eventJson])
  ]);
  Object.entries(overrides).forEach(([key, value]) => value == null ? map.delete(key) : map.set(key, value));
  return async (key) => {
    if (!map.has(key)) throw new Error('missing ' + key);
    return map.get(key);
  };
}

function candidate(overrides = {}) {
  return createPhase8ReleaseArtifacts(Object.assign(structuredClone(runtime), overrides));
}

function seed(result = candidate()) {
  return {
    datasetVersion: result.manifest.datasetVersion,
    generatedAt: result.manifest.generatedAt,
    manifest: result.manifest,
    runtime: null,
    counts: result.manifest.counts,
    payload: { mode: 'manifest-seed' }
  };
}

function newerRuntime() {
  const value = structuredClone(runtime);
  value.datasetId = 'phase8-synthetic-preview-v2';
  value.canonicalDatasetId = 'phase8-synthetic-preview-canonical-v2';
  value.generatedAt = '2026-08-25T00:00:00.000Z';
  return value;
}

function validState(name = '移行対象') {
  return JSON.stringify({
    durabilityLines: [{ name: '完封', value: 0 }],
    savedCharacters: [{ name, scenarios: [] }],
    savedEnemies: [{ groupName: '旧2階層', enemies: [] }],
    currentScenarios: [{ scenario_title: '未保存作業' }],
    theme: 'dark'
  });
}

test('synthetic runtimeとPhase 8 manifestは正式schemaを通りproduction activationを拒否する', () => {
  const result = candidate();
  assert.equal(validateRuntimeSchema(runtime), true, JSON.stringify(validateRuntimeSchema.errors, null, 2));
  assert.equal(validateManifestSchema(result.manifest), true, JSON.stringify(validateManifestSchema.errors, null, 2));
  assert.deepEqual(validatePhase8Manifest(result.manifest), []);
  assert.deepEqual(validatePhase8Runtime(runtime), []);
  assert.equal(result.manifest.productionActivated, false);
  assert.equal(result.manifest.dataClassification, 'synthetic-public-fixture');
  assert.equal(result.manifest.permission.publicArtifactAllowed, true);
  assert.equal(result.manifest.permission.productionActivateAllowed, false);
  assert.equal(result.manifest.updatePolicy.zeroOperationEnabled, false);
  assert.equal(result.manifest.updatePolicy.browserPatRequired, false);
});

test('version付きrelease pathでfull・index・event chunkを決定的かつ無損失生成する', () => {
  const first = candidate();
  const second = candidate();
  assert.equal(first.manifestJson, second.manifestJson);
  assert.equal(first.indexJson, second.indexJson);
  assert.ok(first.manifest.full.json.path.startsWith(first.releasePath + '/'));
  assert.ok(first.chunks.every((chunk) => chunk.jsonArtifact.path.startsWith(first.releasePath + '/')));
  assert.deepEqual(validatePhase8Index(first.index, first.manifest), []);
  assert.deepEqual(first.chunks.map((chunk) => JSON.parse(chunk.eventJson)), runtime.events);
});

test('前回eventは初回・正常・旧raw形式・破損・削除済みを安全に扱う', () => {
  const ids = new Set(runtime.events.map((event) => event.id));
  const storage = new MemoryStorage();
  assert.equal(readLastEvent(storage, ids).reason, 'first-use');
  saveLastEvent(storage, 'preview:event:sky', runtime.datasetId);
  assert.deepEqual(readLastEvent(storage, ids), { eventId: 'preview:event:sky', reason: 'restored' });
  storage.setItem(LAST_EVENT_KEY, 'preview:event:forest');
  assert.deepEqual(readLastEvent(storage, ids), { eventId: 'preview:event:forest', reason: 'restored' });
  storage.setItem(LAST_EVENT_KEY, '{broken');
  assert.equal(readLastEvent(storage, ids).reason, 'invalid-storage');
  assert.equal(storage.getItem(LAST_EVENT_KEY), null);
  storage.setItem(LAST_EVENT_KEY, JSON.stringify({ schemaVersion: '1.0.0', eventId: 'deleted:event' }));
  assert.equal(readLastEvent(storage, ids).reason, 'missing-event');
  assert.equal(storage.getItem(LAST_EVENT_KEY), null);
});

test('countsだけのknown-goodから1操作full更新しhealth check後だけknown-good化する', async () => {
  const initial = candidate();
  const next = createPhase8ReleaseArtifacts(newerRuntime());
  const store = new MemoryReleaseStore(seed(initial));
  const result = await performOneOperationUpdate({
    getText: files(next),
    manifestPath: 'release-manifest.json',
    mode: 'full',
    store,
    appVersion: 'phase8-rc-1',
    manifestValidator: validatePhase8Manifest,
    runtimeValidator: validatePhase8Runtime,
    healthCheck: async (release) => validatePhase8Index(next.index, release.manifest).length === 0
  });
  assert.equal(result.status, 'applied');
  assert.equal(store.active.datasetVersion, 'phase8-synthetic-preview-v2');
  assert.equal(store.knownGood.datasetVersion, 'phase8-synthetic-preview-v2');
});

test('digest・schema・大量削除・互換性・health・適用途中失敗で旧known-goodを保持する', async () => {
  const initial = candidate();
  const base = newerRuntime();
  const normal = createPhase8ReleaseArtifacts(base);
  const duplicateRuntime = structuredClone(base);
  duplicateRuntime.events[1].id = duplicateRuntime.events[0].id;
  const duplicate = createPhase8ReleaseArtifacts(duplicateRuntime);
  const reducedRuntime = structuredClone(base);
  reducedRuntime.datasetId = 'phase8-reduced-v2';
  reducedRuntime.events = reducedRuntime.events.slice(0, 1);
  const reduced = createPhase8ReleaseArtifacts(reducedRuntime);
  const incompatibleManifest = structuredClone(normal.manifest);
  incompatibleManifest.appCompatibility.minimum = 'phase9-only';
  const cases = [
    { code: 'FULL_RUNTIME_MISSING', result: normal, getText: files(normal, { [normal.manifest.full.json.path]: null }) },
    { code: 'FULL_RUNTIME_SIZE_MISMATCH', result: normal, getText: files(normal, { [normal.manifest.full.json.path]: normal.fullJson + ' ' }) },
    { code: 'RUNTIME_SCHEMA_INVALID', result: duplicate, getText: files(duplicate) },
    { code: 'SAFETY_GATE_REJECTED', result: reduced, getText: files(reduced) },
    { code: 'INCOMPATIBLE_APP_VERSION', result: normal, getText: files(normal, { 'release-manifest.json': JSON.stringify(incompatibleManifest) }) },
    { code: 'HEALTH_CHECK_FAILED', result: normal, getText: files(normal), healthCheck: async () => false },
    { code: 'ATOMIC_APPLY_FAILED', result: normal, getText: files(normal), failpoint: 'after-pointer' }
  ];
  for (const item of cases) {
    const previous = seed(initial);
    const store = new MemoryReleaseStore(previous);
    store.failpoint = item.failpoint ?? null;
    const update = await performOneOperationUpdate({
      getText: item.getText,
      manifestPath: 'release-manifest.json',
      mode: 'full',
      store,
      appVersion: 'phase8-rc-1',
      manifestValidator: validatePhase8Manifest,
      runtimeValidator: validatePhase8Runtime,
      healthCheck: item.healthCheck ?? (async () => true)
    });
    assert.equal(update.code, item.code);
    assert.equal(store.active, previous);
    assert.equal(store.knownGood, previous);
  }
});

test('保存データはallowlistだけをRC namespaceへ移しPAT・未知keyを残す', async () => {
  const source = new MemoryStorage({
    dokkan_calc_data_v22: validState(),
    dokkan_crit_overrides: '{"enemy":{"critAtkUp":200}}',
    dokkan_github_pat: 'must-stay-at-source',
    unknown_key: 'unknown'
  });
  const packageValue = await createSavedDataMigrationPackage(source);
  const target = new MemoryStorage();
  const result = await importSavedDataMigrationPackage(target, packageValue, { targetPrefix: 'dokkan_phase8_rc_imported_', markerKey: 'marker', backupPrefix: 'backup_' });
  assert.equal(result.status, 'imported');
  assert.equal(target.getItem('dokkan_phase8_rc_imported_dokkan_calc_data_v22'), source.getItem('dokkan_calc_data_v22'));
  assert.equal(target.getItem('dokkan_phase8_rc_imported_dokkan_crit_overrides'), source.getItem('dokkan_crit_overrides'));
  assert.equal(target.getItem('dokkan_phase8_rc_imported_dokkan_github_pat'), null);
  assert.equal(target.getItem('dokkan_phase8_rc_imported_unknown_key'), null);
  assert.equal(source.getItem('dokkan_github_pat'), 'must-stay-at-source');
});

test('RC namespace移行は書込失敗・移行後validation失敗時に完全rollbackする', async () => {
  const source = new MemoryStorage({ dokkan_calc_data_v22: validState('新'), dokkan_crit_overrides: '{}' });
  const packageValue = await createSavedDataMigrationPackage(source);
  const old = validState('旧');
  const target = new MemoryStorage({ dokkan_phase8_rc_imported_dokkan_calc_data_v22: old });
  target.failAfterWrites = 1;
  const result = await importSavedDataMigrationPackage(target, packageValue, { targetPrefix: 'dokkan_phase8_rc_imported_', markerKey: 'marker', backupPrefix: 'backup_' });
  assert.equal(result.status, 'rolled-back');
  assert.equal(target.getItem('dokkan_phase8_rc_imported_dokkan_calc_data_v22'), old);
  assert.equal(target.getItem('dokkan_phase8_rc_imported_marker'), null);
});
