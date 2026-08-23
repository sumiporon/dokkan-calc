/**
 * Phase 7 one-operation update prototype.
 * Pure/injected I/O keeps it production-separated and testable offline.
 */

const encoder = new TextEncoder();

export async function sha256Text(text) {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return `sha256:${[...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function runtimeCounts(runtime) {
  let stages = 0;
  let encounters = 0;
  let enemies = 0;
  for (const event of runtime.events) {
    stages += event.stages.length;
    for (const stage of event.stages) {
      encounters += stage.encounters.length;
      for (const encounter of stage.encounters) enemies += encounter.enemies.length;
    }
  }
  return { events: runtime.events.length, stages, encounters, enemies };
}

export function validateRuntime(runtime) {
  const errors = [];
  if (!runtime || typeof runtime !== 'object') return ['runtime must be an object'];
  if (runtime.schemaVersion !== '1.0.0') errors.push('runtime schemaVersion must be 1.0.0');
  if (typeof runtime.datasetId !== 'string' || runtime.datasetId.length === 0) errors.push('runtime datasetId is missing');
  if (!Array.isArray(runtime.events)) errors.push('runtime events must be an array');
  else {
    const ids = new Set();
    for (const event of runtime.events) {
      if (!event || typeof event.id !== 'string' || !Array.isArray(event.stages)) errors.push('invalid event structure');
      else if (ids.has(event.id)) errors.push(`duplicate event ID: ${event.id}`);
      else ids.add(event.id);
    }
  }
  return errors;
}

export function validateDeliveryManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest must be an object'];
  if (manifest.schemaVersion !== '1.0.0') errors.push('manifest schemaVersion must be 1.0.0');
  if (manifest.prototype !== true) errors.push('only a Phase 7 prototype manifest is accepted');
  if (typeof manifest.datasetVersion !== 'string') errors.push('datasetVersion is missing');
  if (manifest.validation?.status !== 'passed' || manifest.validation?.hardFailCount !== 0 || manifest.validation?.reviewRequiredCount !== 0) errors.push('manifest validation gate did not pass');
  if (manifest.permission?.offlinePrototypeAllowed !== true) errors.push('offline prototype permission gate did not pass');
  if (!manifest.full?.json || !manifest.chunked?.indexJson) errors.push('delivery artifacts are missing');
  return errors;
}

function safetyDiff(candidate, previous) {
  if (!previous) return [];
  const findings = [];
  const candidateCounts = runtimeCounts(candidate);
  const previousCounts = Array.isArray(previous.events)
    ? runtimeCounts(previous)
    : previous.counts;
  if (!previousCounts) return ['previous known-good counts are missing'];
  for (const key of ['events', 'stages', 'enemies']) {
    const before = previousCounts[key];
    const after = candidateCounts[key];
    if (before > 0 && after < before * 0.8) findings.push(`${key} reduced by more than 20%`);
  }
  return findings;
}

function assembleChunkRuntime(manifest, index, events) {
  return {
    schemaVersion: manifest.runtimeSchemaVersion,
    datasetId: manifest.datasetVersion,
    canonicalDatasetId: `phase7-chunk-assembly:${manifest.datasetVersion}`,
    generatedAt: manifest.generatedAt,
    region: index.region,
    events
  };
}

async function readAndVerify(getText, descriptor, code) {
  let text;
  try {
    text = await getText(descriptor.path);
  } catch (error) {
    throw new UpdateError(`${code}_MISSING`, `${descriptor.path}を取得できませんでした。`, error);
  }
  if (BufferByteLength(text) !== descriptor.bytes) throw new UpdateError(`${code}_SIZE_MISMATCH`, `${descriptor.path}のsizeがmanifestと一致しません。`);
  if (await sha256Text(text) !== descriptor.digest) throw new UpdateError(`${code}_DIGEST_MISMATCH`, `${descriptor.path}のdigestが一致しません。`);
  return text;
}

function BufferByteLength(text) {
  return encoder.encode(text).byteLength;
}

function parseJson(text, code) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UpdateError(`${code}_JSON_INVALID`, 'JSONを解析できません。', error);
  }
}

export class UpdateError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'UpdateError';
    this.code = code;
  }
}

export class MemoryReleaseStore {
  constructor(initialRelease = null) {
    this.active = initialRelease;
    this.knownGood = initialRelease;
    this.releases = new Map(initialRelease ? [[initialRelease.datasetVersion, initialRelease]] : []);
    this.failpoint = null;
  }

  snapshot() {
    return { active: this.active, knownGood: this.knownGood, releases: new Map(this.releases) };
  }

  restore(snapshot) {
    this.active = snapshot.active;
    this.knownGood = snapshot.knownGood;
    this.releases = new Map(snapshot.releases);
  }

  async commit(release) {
    if (this.failpoint === 'before-pointer') throw new Error('simulated failure before active pointer');
    this.releases.set(release.datasetVersion, release);
    this.active = release;
    if (this.failpoint === 'after-pointer') throw new Error('simulated failure after active pointer');
  }

  async markKnownGood(release) {
    this.knownGood = release;
  }
}

export async function performOneOperationUpdate({
  getText,
  manifestPath = 'delivery-manifest.json',
  mode = 'full',
  store,
  appVersion = 'phase7-prototype-1',
  healthCheck = async () => true,
  manifestValidator = validateDeliveryManifest,
  runtimeValidator = validateRuntime
}) {
  const startedAt = performance.now();
  let manifestText;
  try {
    manifestText = await getText(manifestPath);
  } catch (error) {
    return { status: 'rejected', code: 'MANIFEST_MISSING', message: 'manifestを取得できません。', retainedVersion: store.active?.datasetVersion ?? null };
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return { status: 'rejected', code: 'MANIFEST_JSON_INVALID', message: 'manifestが壊れています。', retainedVersion: store.active?.datasetVersion ?? null };
  }
  const manifestErrors = await manifestValidator(manifest);
  if (manifestErrors.length > 0) return { status: 'rejected', code: 'MANIFEST_GATE_REJECTED', message: manifestErrors.join(' / '), retainedVersion: store.active?.datasetVersion ?? null };
  if (manifest.appCompatibility?.minimum !== appVersion || (manifest.appCompatibility.maximum != null && manifest.appCompatibility.maximum !== appVersion)) {
    return { status: 'rejected', code: 'INCOMPATIBLE_APP_VERSION', message: 'このapp versionとは互換性がありません。', retainedVersion: store.active?.datasetVersion ?? null };
  }
  if (store.active?.datasetVersion === manifest.datasetVersion) return { status: 'unchanged', code: 'ALREADY_CURRENT', activeVersion: manifest.datasetVersion, milliseconds: performance.now() - startedAt };
  if (store.active && Date.parse(manifest.generatedAt) <= Date.parse(store.active.generatedAt)) {
    return { status: 'rejected', code: 'STALE_DATASET', message: '現在版より古いdatasetです。', retainedVersion: store.active.datasetVersion };
  }

  let runtime;
  let payload;
  try {
    if (mode === 'full') {
      const text = await readAndVerify(getText, manifest.full.json, 'FULL_RUNTIME');
      runtime = parseJson(text, 'FULL_RUNTIME');
      payload = { mode, text, digest: manifest.full.json.digest };
    } else if (mode === 'chunk') {
      const indexText = await readAndVerify(getText, manifest.chunked.indexJson, 'CHUNK_INDEX');
      const index = parseJson(indexText, 'CHUNK_INDEX');
      if (index.datasetVersion !== manifest.datasetVersion || !Array.isArray(index.events)) throw new UpdateError('CHUNK_INDEX_VERSION_MISMATCH', 'chunk indexのversionが一致しません。');
      const events = [];
      const chunkTexts = new Map();
      for (const entry of index.events) {
        const text = await readAndVerify(getText, entry.json, 'EVENT_CHUNK');
        const event = parseJson(text, 'EVENT_CHUNK');
        if (event.id !== entry.id) throw new UpdateError('EVENT_CHUNK_ID_MISMATCH', 'event chunkのIDがindexと一致しません。');
        events.push(event);
        chunkTexts.set(entry.id, text);
      }
      runtime = assembleChunkRuntime(manifest, index, events);
      payload = { mode, indexText, chunkTexts, digest: manifest.chunked.indexJson.digest };
    } else {
      throw new UpdateError('UNKNOWN_DELIVERY_MODE', '未知の配信方式です。');
    }
  } catch (error) {
    const updateError = error instanceof UpdateError ? error : new UpdateError('TRANSFER_FAILED', 'candidate取得中に失敗しました。', error);
    return { status: 'rejected', code: updateError.code, message: updateError.message, retainedVersion: store.active?.datasetVersion ?? null };
  }

  const runtimeErrors = await runtimeValidator(runtime);
  if (runtime.datasetId !== manifest.datasetVersion) runtimeErrors.push('runtime dataset version mismatch');
  if (runtimeErrors.length > 0) return { status: 'rejected', code: 'RUNTIME_SCHEMA_INVALID', message: runtimeErrors.join(' / '), retainedVersion: store.active?.datasetVersion ?? null };
  const safetyFindings = safetyDiff(runtime, store.active?.runtime ?? store.active ?? null);
  if (safetyFindings.length > 0) return { status: 'rejected', code: 'SAFETY_GATE_REJECTED', message: safetyFindings.join(' / '), retainedVersion: store.active?.datasetVersion ?? null };

  const release = { datasetVersion: manifest.datasetVersion, generatedAt: manifest.generatedAt, manifest, runtime, counts: runtimeCounts(runtime), payload };
  const before = store.snapshot();
  try {
    await store.commit(release);
    if (!await healthCheck(release)) throw new UpdateError('HEALTH_CHECK_FAILED', '適用後health checkに失敗しました。');
    await store.markKnownGood(release);
  } catch (error) {
    store.restore(before);
    const updateError = error instanceof UpdateError ? error : new UpdateError('ATOMIC_APPLY_FAILED', '適用途中で失敗したため元のknown-goodへ戻しました。', error);
    return { status: 'rolled-back', code: updateError.code, message: updateError.message, retainedVersion: store.active?.datasetVersion ?? null };
  }
  return {
    status: 'applied',
    code: 'UPDATE_APPLIED',
    activeVersion: release.datasetVersion,
    knownGoodVersion: store.knownGood.datasetVersion,
    counts: runtimeCounts(runtime),
    milliseconds: performance.now() - startedAt
  };
}

export function evaluateZeroOperationReadiness(evidence) {
  const checks = [
    ['writtenPermission', evidence.writtenPermission === true, '取得・派生公開・自動適用の書面許可'],
    ['successfulDays', (evidence.successfulDays ?? 0) >= 60, '60日以上のpilot運用'],
    ['successfulCandidates', (evidence.successfulCandidates ?? 0) >= 30, '30回以上の連続candidate成功'],
    ['falsePositiveRate', (evidence.falsePositiveRate ?? 1) <= 0.01, '安全gate誤停止率1%以下'],
    ['rollbackDrills', (evidence.rollbackDrills ?? 0) >= 3, 'PC/Android/iPhoneを含む3回以上のrollback drill'],
    ['updateSuccessRate', (evidence.updateSuccessRate ?? 0) >= 0.99, '100回以上の試行で99%以上の更新成功'],
    ['freshnessWithinSevenDaysRate', (evidence.freshnessWithinSevenDaysRate ?? 0) >= 0.95, '詳細値が7日以内に揃う率95%以上'],
    ['knownGoodReleases', (evidence.knownGoodReleases ?? 0) >= 3, '最低3世代のknown-good保持'],
    ['compatibleAppGate', evidence.compatibleAppGate === true, 'app version互換gate'],
    ['ownerApproval', evidence.ownerApproval === true, '0操作化のowner承認']
  ];
  return { ready: checks.every(([, passed]) => passed), checks: checks.map(([code, passed, description]) => ({ code, passed, description })) };
}
