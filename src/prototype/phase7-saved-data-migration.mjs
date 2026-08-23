/** Production-separated one-time saved-data migration prototype. */

import { sha256Text } from './phase7-update-engine.mjs';

export const MIGRATABLE_KEYS = Object.freeze(['dokkan_calc_data_v22', 'dokkan_crit_overrides']);
export const EXCLUDED_KEYS = Object.freeze(['dokkan_github_pat']);

function stablePayloadJson(payload) {
  return JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([left], [right]) => left.localeCompare(right, 'en'))));
}

function validateCalculatorState(raw) {
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('calculator state must be an object');
  for (const key of ['durabilityLines', 'savedCharacters', 'savedEnemies', 'currentScenarios']) {
    if (!Array.isArray(value[key])) throw new Error(`${key} must be an array`);
  }
  if (!['light', 'dark'].includes(value.theme)) throw new Error('theme is invalid');
}

function validateCriticalOverrides(raw) {
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('critical overrides must be an object');
}

export async function createSavedDataMigrationPackage(storage, {
  exportedAt = new Date().toISOString(),
  sourceApplicationVersion = 'legacy-v22'
} = {}) {
  const payload = {};
  for (const key of MIGRATABLE_KEYS) {
    const value = storage.getItem(key);
    if (value != null) payload[key] = value;
  }
  const payloadDigest = await sha256Text(stablePayloadJson(payload));
  return {
    schemaVersion: '1.0.0',
    exportedAt,
    sourceApplicationVersion,
    payload,
    payloadDigest,
    excludedKeys: [...EXCLUDED_KEYS],
    note: 'GitHub PAT and all non-allowlisted localStorage keys are excluded.'
  };
}

export async function validateSavedDataMigrationPackage(packageValue) {
  const errors = [];
  if (!packageValue || typeof packageValue !== 'object') return ['migration package must be an object'];
  if (packageValue.schemaVersion !== '1.0.0') errors.push('unsupported migration schema');
  if (!packageValue.payload || typeof packageValue.payload !== 'object') errors.push('payload is missing');
  else {
    for (const key of Object.keys(packageValue.payload)) if (!MIGRATABLE_KEYS.includes(key)) errors.push(`non-allowlisted key: ${key}`);
    if (Object.hasOwn(packageValue.payload, 'dokkan_github_pat')) errors.push('PAT must not be included');
    try {
      if (packageValue.payload.dokkan_calc_data_v22 != null) validateCalculatorState(packageValue.payload.dokkan_calc_data_v22);
      if (packageValue.payload.dokkan_crit_overrides != null) validateCriticalOverrides(packageValue.payload.dokkan_crit_overrides);
    } catch (error) {
      errors.push(error.message);
    }
    if (typeof packageValue.payloadDigest === 'string') {
      const actual = await sha256Text(stablePayloadJson(packageValue.payload));
      if (actual !== packageValue.payloadDigest) errors.push('payload digest mismatch');
    } else errors.push('payload digest is missing');
  }
  return errors;
}

export async function importSavedDataMigrationPackage(storage, packageValue, {
  markerKey = 'phase7_prototype_migration_marker',
  backupPrefix = 'phase7_prototype_backup_',
  targetPrefix = ''
} = {}) {
  const errors = await validateSavedDataMigrationPackage(packageValue);
  if (errors.length > 0) return { status: 'rejected', errors };
  const targetMarkerKey = `${targetPrefix}${markerKey}`;
  const targetKey = (key) => `${targetPrefix}${key}`;
  if (storage.getItem(targetMarkerKey) === packageValue.payloadDigest) return { status: 'unchanged', digest: packageValue.payloadDigest, duplicates: Object.keys(packageValue.payload) };

  const previous = new Map();
  const previousBackups = new Map();
  const duplicates = [];
  const unchanged = [];
  for (const key of MIGRATABLE_KEYS) {
    const current = storage.getItem(targetKey(key));
    previous.set(key, current);
    const incoming = packageValue.payload[key];
    if (current != null && incoming != null) {
      if (current === incoming) unchanged.push(key);
      else duplicates.push(key);
    }
  }
  const previousMarker = storage.getItem(targetMarkerKey);
  try {
    for (const [key, current] of previous) {
      const backupKey = `${targetPrefix}${backupPrefix}${key}`;
      previousBackups.set(backupKey, storage.getItem(backupKey));
      if (current != null) storage.setItem(backupKey, current);
    }
    for (const [key, value] of Object.entries(packageValue.payload)) storage.setItem(targetKey(key), value);
    const writtenPackage = { ...packageValue, payload: Object.fromEntries(Object.keys(packageValue.payload).map((key) => [key, storage.getItem(targetKey(key))])) };
    const writtenErrors = await validateSavedDataMigrationPackage(writtenPackage);
    if (writtenErrors.length > 0) throw new Error(`post-import validation failed: ${writtenErrors.join(' / ')}`);
    storage.setItem(targetMarkerKey, packageValue.payloadDigest);
  } catch (error) {
    for (const [key, value] of previous) {
      if (value == null) storage.removeItem(targetKey(key));
      else storage.setItem(targetKey(key), value);
    }
    for (const [key, value] of previousBackups) {
      if (value == null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    if (previousMarker == null) storage.removeItem(targetMarkerKey);
    else storage.setItem(targetMarkerKey, previousMarker);
    return { status: 'rolled-back', error: String(error), duplicates };
  }
  return { status: 'imported', digest: packageValue.payloadDigest, duplicates, unchanged, strategy: 'replace-with-backup' };
}

export class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.failAfterWrites = null;
    this.writeCount = 0;
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    this.writeCount += 1;
    if (this.failAfterWrites != null && this.writeCount > this.failAfterWrites) {
      this.failAfterWrites = null;
      throw new Error('simulated storage failure');
    }
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}
