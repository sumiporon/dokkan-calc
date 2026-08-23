import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

import {
  createPhase7DeliveryArtifacts,
  minifiedStableJson,
  sha256
} from '../../scripts/generate-phase7-runtime-delivery.mjs';
import {
  evaluateZeroOperationReadiness,
  MemoryReleaseStore,
  performOneOperationUpdate
} from '../../src/prototype/phase7-update-engine.mjs';
import {
  createSavedDataMigrationPackage,
  importSavedDataMigrationPackage,
  MemoryStorage,
  validateSavedDataMigrationPackage
} from '../../src/prototype/phase7-saved-data-migration.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const [runtime, manifestSchema, runtimeSchema] = await Promise.all([
  readFile(new URL('../fixtures/future/enemy-data-runtime-v1.representative.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../schemas/phase7-runtime-delivery-manifest-v1.schema.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../schemas/enemy-data-runtime-v1.schema.json', import.meta.url), 'utf8').then(JSON.parse)
]);
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateManifestSchema = ajv.compile(manifestSchema);
const validateRuntimeSchema = ajv.compile(runtimeSchema);

function delivery(overrides = {}) {
  const candidate = structuredClone(runtime);
  Object.assign(candidate, overrides);
  return createPhase7DeliveryArtifacts(candidate);
}

function deliveryFiles(result, overrides = {}) {
  const files = new Map([
    ['delivery-manifest.json', result.manifestJson],
    [result.manifest.full.json.path, result.fullJson],
    [result.manifest.chunked.indexJson.path, result.indexJson],
    ...result.chunks.map((chunk) => [chunk.jsonPath, chunk.eventJson])
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) files.delete(key);
    else files.set(key, value);
  }
  return async (relativePath) => {
    if (!files.has(relativePath)) throw new Error(`missing fixture: ${relativePath}`);
    return files.get(relativePath);
  };
}

function oldRelease(sourceRuntime = runtime, overrides = {}) {
  const previous = structuredClone(sourceRuntime);
  previous.datasetId = 'phase7-previous-known-good';
  return {
    datasetVersion: previous.datasetId,
    generatedAt: '2020-01-01T00:00:00.000Z',
    runtime: previous,
    payload: { mode: 'full' },
    ...overrides
  };
}

function validSavedState(name) {
  return JSON.stringify({ durabilityLines: [], savedCharacters: [{ name, scenarios: [] }], savedEnemies: [], currentScenarios: [], theme: 'dark' });
}

test('manifest・full runtimeはschemaを通りproduction publicationを拒否する', () => {
  const result = delivery();
  assert.equal(validateManifestSchema(result.manifest), true, JSON.stringify(validateManifestSchema.errors, null, 2));
  assert.equal(validateRuntimeSchema(JSON.parse(result.fullJson)), true, JSON.stringify(validateRuntimeSchema.errors, null, 2));
  assert.equal(result.manifest.prototype, true);
  assert.equal(result.manifest.permission.productionPublishAllowed, false);
  assert.equal(result.manifest.appCompatibility.productionAppReadsArtifact, false);
});

test('同一runtimeからfull・index・chunkをbyte-identicalに決定生成する', () => {
  const first = delivery();
  const second = delivery();
  assert.equal(first.manifestJson, second.manifestJson);
  assert.equal(first.fullJson, second.fullJson);
  assert.equal(first.indexJson, second.indexJson);
  assert.deepEqual(first.chunks.map((item) => item.eventJson), second.chunks.map((item) => item.eventJson));
  assert.equal(first.manifest.full.json.digest, sha256(first.fullJson));
  assert.equal(first.manifest.chunked.indexJson.digest, sha256(first.indexJson));
});

test('event chunksをindex順に連結するとfull runtimeの全eventへ戻る', () => {
  const result = delivery();
  const reconstructed = { ...JSON.parse(result.fullJson), events: result.chunks.map((chunk) => JSON.parse(chunk.eventJson)) };
  assert.equal(minifiedStableJson(reconstructed), result.fullJson);
  assert.deepEqual(result.index.events.map((entry) => entry.id), runtime.events.map((event) => event.id));
  assert.ok(result.index.events.every((entry) => entry.json.path.startsWith('chunked/chunks/')));
});

test('file-compatible scriptはfull・index・各eventをJSONと同内容で公開する', () => {
  const result = delivery();
  const context = vm.createContext({});
  vm.runInContext(result.manifestScript, context);
  vm.runInContext(result.fullScript, context);
  vm.runInContext(result.indexScript, context);
  for (const chunk of result.chunks) vm.runInContext(chunk.eventScript, context);
  assert.equal(minifiedStableJson(context.__DOKKAN_PHASE7_DELIVERY_MANIFEST__), result.manifestJson);
  assert.equal(minifiedStableJson(context.__DOKKAN_PHASE7_FULL_RUNTIME__), result.fullJson);
  assert.equal(minifiedStableJson(context.__DOKKAN_PHASE7_EVENT_INDEX__), result.indexJson);
  assert.deepEqual(Object.keys(context.__DOKKAN_PHASE7_EVENT_CHUNKS__), runtime.events.map((event) => event.id));
});

test('一操作full更新はdigest・schema・安全性確認後にknown-good化する', async () => {
  const result = delivery();
  const store = new MemoryReleaseStore(oldRelease());
  const update = await performOneOperationUpdate({ getText: deliveryFiles(result), mode: 'full', store });
  assert.equal(update.status, 'applied');
  assert.equal(store.active.datasetVersion, runtime.datasetId);
  assert.equal(store.knownGood.datasetVersion, runtime.datasetId);
  assert.deepEqual(update.counts.events, runtime.events.length);
});

test('一操作chunk更新は全chunk検証後だけ一括適用する', async () => {
  const result = delivery();
  const store = new MemoryReleaseStore(oldRelease());
  const update = await performOneOperationUpdate({ getText: deliveryFiles(result), mode: 'chunk', store });
  assert.equal(update.status, 'applied');
  assert.equal(store.active.runtime.events.length, runtime.events.length);
  assert.equal(store.active.payload.chunkTexts.size, runtime.events.length);
});

test('壊れたmanifest・full digest・欠損chunkは既存known-goodを維持する', async () => {
  const result = delivery();
  const corruptedChunk = ` ${result.chunks[0].eventJson.slice(1)}`;
  const cases = [
    { expected: 'MANIFEST_JSON_INVALID', mode: 'full', getText: deliveryFiles(result, { 'delivery-manifest.json': '{' }) },
    { expected: 'FULL_RUNTIME_SIZE_MISMATCH', mode: 'full', getText: deliveryFiles(result, { [result.manifest.full.json.path]: `${result.fullJson} ` }) },
    { expected: 'EVENT_CHUNK_DIGEST_MISMATCH', mode: 'chunk', getText: deliveryFiles(result, { [result.chunks[0].jsonPath]: corruptedChunk }) },
    { expected: 'EVENT_CHUNK_MISSING', mode: 'chunk', getText: deliveryFiles(result, { [result.chunks[0].jsonPath]: null }) }
  ];
  for (const item of cases) {
    const store = new MemoryReleaseStore(oldRelease());
    const update = await performOneOperationUpdate({ getText: item.getText, mode: item.mode, store });
    assert.equal(update.status, 'rejected');
    assert.equal(update.code, item.expected);
    assert.equal(store.active.datasetVersion, 'phase7-previous-known-good');
  }
});

test('manifestとchunk indexのdataset version不一致はcache候補を適用しない', async () => {
  const result = delivery();
  const mismatchedIndex = structuredClone(result.index);
  mismatchedIndex.datasetVersion = 'stale-cache-version';
  const indexText = minifiedStableJson(mismatchedIndex);
  const mismatchedManifest = structuredClone(result.manifest);
  mismatchedManifest.chunked.indexJson.bytes = Buffer.byteLength(indexText);
  mismatchedManifest.chunked.indexJson.digest = sha256(indexText);
  const getText = deliveryFiles(result, {
    'delivery-manifest.json': minifiedStableJson(mismatchedManifest),
    [result.manifest.chunked.indexJson.path]: indexText
  });
  const store = new MemoryReleaseStore(oldRelease());
  const update = await performOneOperationUpdate({ getText, mode: 'chunk', store });
  assert.equal(update.status, 'rejected');
  assert.equal(update.code, 'CHUNK_INDEX_VERSION_MISMATCH');
  assert.equal(store.active.datasetVersion, 'phase7-previous-known-good');
});

test('schema不正・大量削除・古い版・非互換appは適用前に拒否する', async () => {
  const duplicate = structuredClone(runtime);
  duplicate.events[1].id = duplicate.events[0].id;
  const invalidResult = createPhase7DeliveryArtifacts(duplicate);
  const invalidStore = new MemoryReleaseStore(oldRelease());
  assert.equal((await performOneOperationUpdate({ getText: deliveryFiles(invalidResult), store: invalidStore })).code, 'RUNTIME_SCHEMA_INVALID');

  const reduced = structuredClone(runtime);
  reduced.events = reduced.events.slice(0, 1);
  reduced.datasetId = 'phase7-reduced-candidate';
  reduced.generatedAt = '2026-08-24T00:00:00.000Z';
  const reducedResult = createPhase7DeliveryArtifacts(reduced);
  const reducedStore = new MemoryReleaseStore(oldRelease(runtime));
  assert.equal((await performOneOperationUpdate({ getText: deliveryFiles(reducedResult), store: reducedStore })).code, 'SAFETY_GATE_REJECTED');

  const result = delivery();
  const staleStore = new MemoryReleaseStore(oldRelease(runtime, { generatedAt: '2099-01-01T00:00:00.000Z' }));
  assert.equal((await performOneOperationUpdate({ getText: deliveryFiles(result), store: staleStore })).code, 'STALE_DATASET');

  const incompatible = structuredClone(result.manifest);
  incompatible.appCompatibility.minimum = 'phase8-only';
  const incompatibleStore = new MemoryReleaseStore(oldRelease());
  const getIncompatible = deliveryFiles(result, { 'delivery-manifest.json': minifiedStableJson(incompatible) });
  assert.equal((await performOneOperationUpdate({ getText: getIncompatible, store: incompatibleStore })).code, 'INCOMPATIBLE_APP_VERSION');
});

test('適用中断とhealth check失敗はactive pointer・known-good・release一覧を復元する', async () => {
  const result = delivery();
  for (const scenario of ['after-pointer', 'health']) {
    const previous = oldRelease();
    const store = new MemoryReleaseStore(previous);
    if (scenario === 'after-pointer') store.failpoint = 'after-pointer';
    const update = await performOneOperationUpdate({
      getText: deliveryFiles(result),
      store,
      healthCheck: async () => scenario !== 'health'
    });
    assert.equal(update.status, 'rolled-back');
    assert.equal(store.active, previous);
    assert.equal(store.knownGood, previous);
    assert.deepEqual([...store.releases.keys()], [previous.datasetVersion]);
  }
});

test('同じversionの再実行はdownloadせずunchangedになる', async () => {
  const result = delivery();
  const current = { datasetVersion: runtime.datasetId, generatedAt: runtime.generatedAt, runtime };
  const store = new MemoryReleaseStore(current);
  let calls = 0;
  const base = deliveryFiles(result);
  const update = await performOneOperationUpdate({ getText: async (path) => { calls += 1; return base(path); }, store });
  assert.equal(update.status, 'unchanged');
  assert.equal(calls, 1, 'manifestだけを確認する');
});

test('0操作更新はpermission・pilot・成功率・rollback・owner承認が全て揃うまで不可', () => {
  const empty = evaluateZeroOperationReadiness({});
  assert.equal(empty.ready, false);
  assert.ok(empty.checks.every((item) => !item.passed));
  const ready = evaluateZeroOperationReadiness({
    writtenPermission: true,
    successfulDays: 60,
    successfulCandidates: 30,
    falsePositiveRate: 0.01,
    rollbackDrills: 3,
    updateSuccessRate: 0.99,
    freshnessWithinSevenDaysRate: 0.95,
    knownGoodReleases: 3,
    compatibleAppGate: true,
    ownerApproval: true
  });
  assert.equal(ready.ready, true);
});

test('保存データpackageはallowlistだけを含みPAT・未知keyを除外する', async () => {
  const storage = new MemoryStorage({
    dokkan_calc_data_v22: validSavedState('移行元'),
    dokkan_crit_overrides: JSON.stringify({ enemy: { critAtkUp: 200 } }),
    dokkan_github_pat: 'ghp_never_export',
    unknown_setting: 'do-not-copy'
  });
  const packageValue = await createSavedDataMigrationPackage(storage, { exportedAt: '2026-08-24T00:00:00.000Z' });
  assert.deepEqual(Object.keys(packageValue.payload).sort(), ['dokkan_calc_data_v22', 'dokkan_crit_overrides']);
  assert.ok(!JSON.stringify(packageValue).includes('ghp_never_export'));
  assert.deepEqual(await validateSavedDataMigrationPackage(packageValue), []);
});

test('保存データ一回移行は重複をbackup後置換し同じpackage再実行は冪等', async () => {
  const source = new MemoryStorage({ dokkan_calc_data_v22: validSavedState('新') });
  const packageValue = await createSavedDataMigrationPackage(source);
  const old = validSavedState('旧');
  const target = new MemoryStorage({ dokkan_calc_data_v22: old, dokkan_github_pat: 'keep-local-only' });
  const first = await importSavedDataMigrationPackage(target, packageValue);
  assert.equal(first.status, 'imported');
  assert.deepEqual(first.duplicates, ['dokkan_calc_data_v22']);
  assert.equal(target.getItem('phase7_prototype_backup_dokkan_calc_data_v22'), old);
  assert.equal(target.getItem('dokkan_github_pat'), 'keep-local-only');
  const second = await importSavedDataMigrationPackage(target, packageValue);
  assert.equal(second.status, 'unchanged');
});

test('保存データのdigest破損・PAT混入を拒否し書込中断時は完全rollbackする', async () => {
  const source = new MemoryStorage({ dokkan_calc_data_v22: validSavedState('新'), dokkan_crit_overrides: '{}' });
  const packageValue = await createSavedDataMigrationPackage(source);
  const corrupted = structuredClone(packageValue);
  corrupted.payload.dokkan_calc_data_v22 = validSavedState('改ざん');
  assert.match((await validateSavedDataMigrationPackage(corrupted)).join(' '), /digest/);
  const withPat = structuredClone(packageValue);
  withPat.payload.dokkan_github_pat = 'secret';
  assert.match((await validateSavedDataMigrationPackage(withPat)).join(' '), /PAT|allowlisted/);

  const oldState = validSavedState('旧');
  const target = new MemoryStorage({ dokkan_calc_data_v22: oldState, dokkan_crit_overrides: '{"old":true}' });
  target.failAfterWrites = 1;
  const update = await importSavedDataMigrationPackage(target, packageValue);
  assert.equal(update.status, 'rolled-back');
  assert.equal(target.getItem('dokkan_calc_data_v22'), oldState);
  assert.equal(target.getItem('dokkan_crit_overrides'), '{"old":true}');
  assert.equal(target.getItem('phase7_prototype_backup_dokkan_calc_data_v22'), null);
  assert.equal(target.getItem('phase7_prototype_migration_marker'), null);
});
