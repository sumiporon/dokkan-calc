import { sha256Text, validateRuntime } from '../prototype/phase7-update-engine.mjs';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FIELD_STATES = new Set(['known', 'unknown', 'unavailable', 'not-applicable']);

function isArtifact(value, type) {
  return value && typeof value.path === 'string' && value.path.length > 0
    && DIGEST_PATTERN.test(value.digest) && Number.isInteger(value.bytes) && value.bytes > 0
    && value.contentType === type;
}

function fieldValid(field) {
  return field && FIELD_STATES.has(field.state)
    && (field.state === 'known' ? field.value != null : field.value === null);
}

export function validatePhase8Manifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest must be an object'];
  if (manifest.schemaVersion !== '1.0.0') errors.push('unsupported manifest schema');
  if (manifest.releaseCandidate !== true || manifest.productionActivated !== false) errors.push('release candidate boundary is invalid');
  if (!['synthetic-public-fixture', 'existing-data-internal-only'].includes(manifest.dataClassification)) errors.push('data classification is invalid');
  if (typeof manifest.datasetVersion !== 'string' || manifest.datasetVersion.length === 0) errors.push('dataset version is missing');
  if (!Number.isFinite(Date.parse(manifest.generatedAt))) errors.push('generatedAt is invalid');
  if (manifest.runtimeSchemaVersion !== '1.0.0') errors.push('runtime schema is incompatible');
  if (typeof manifest.appCompatibility?.minimum !== 'string' || manifest.appCompatibility.minimum.length === 0 || manifest.appCompatibility?.productionAppReadsArtifact !== false) errors.push('app compatibility declaration is invalid');
  if (!isArtifact(manifest.full?.json, 'application/json') || !isArtifact(manifest.full?.script, 'text/javascript')) errors.push('full artifacts are invalid');
  if (!isArtifact(manifest.chunked?.indexJson, 'application/json') || !isArtifact(manifest.chunked?.indexScript, 'text/javascript')) errors.push('chunk index artifacts are invalid');
  if (!manifest.counts || !['events', 'stages', 'encounters', 'enemies'].every((key) => Number.isInteger(manifest.counts[key]) && manifest.counts[key] >= 0)) errors.push('record counts are invalid');
  if (manifest.chunked?.eventCount !== manifest.counts?.events) errors.push('event count mismatch');
  if (manifest.validation?.status !== 'passed' || manifest.validation?.hardFailCount !== 0 || manifest.validation?.reviewRequiredCount !== 0) errors.push('validation gate did not pass');
  if (manifest.permission?.releaseCandidatePreviewAllowed !== true || typeof manifest.permission?.publicArtifactAllowed !== 'boolean' || manifest.permission?.productionActivateAllowed !== false || manifest.permission?.liveSourceAccessAllowed !== false) errors.push('permission boundary is invalid');
  if (manifest.permission?.publicArtifactAllowed === true && manifest.dataClassification !== 'synthetic-public-fixture') errors.push('only synthetic fixtures may be public artifacts');
  if (manifest.updatePolicy?.userInitiated !== true || manifest.updatePolicy?.zeroOperationEnabled !== false || manifest.updatePolicy?.browserPatRequired !== false) errors.push('update policy is invalid');
  if (manifest.knownGood?.datasetVersion !== manifest.datasetVersion || manifest.knownGood?.runtimeDigest !== manifest.full?.json?.digest) errors.push('known-good metadata mismatch');
  return errors;
}

export function validatePhase8Runtime(runtime) {
  const errors = validateRuntime(runtime);
  if (!Array.isArray(runtime?.events)) return errors;
  for (const event of runtime.events) {
    if (!fieldValid(event.name) || !fieldValid(event.category)) errors.push(`invalid event fields: ${event.id ?? '?'}`);
    if (!Array.isArray(event.stages)) continue;
    for (const stage of event.stages) {
      if (typeof stage.id !== 'string' || !fieldValid(stage.name) || !Array.isArray(stage.encounters)) errors.push(`invalid stage: ${stage?.id ?? '?'}`);
      for (const encounter of stage.encounters ?? []) {
        if (typeof encounter.id !== 'string' || !Array.isArray(encounter.enemies) || !Array.isArray(encounter.areaAttacks)) errors.push(`invalid encounter: ${encounter?.id ?? '?'}`);
        for (const enemy of encounter.enemies ?? []) {
          if (typeof enemy.id !== 'string' || !fieldValid(enemy.name) || !fieldValid(enemy.type) || !fieldValid(enemy.alignment) || !fieldValid(enemy.baseAttack)) errors.push(`invalid enemy fields: ${enemy?.id ?? '?'}`);
          if (!Array.isArray(enemy.superAttacks) || !Array.isArray(enemy.passiveEffects) || !enemy.critical) errors.push(`invalid enemy arrays: ${enemy?.id ?? '?'}`);
          for (const attack of enemy.superAttacks ?? []) {
            if (typeof attack.id !== 'string' || !fieldValid(attack.name) || !fieldValid(attack.displayedDamage) || !Array.isArray(attack.usageRules) || !Array.isArray(attack.effects)) errors.push(`invalid super attack: ${attack?.id ?? '?'}`);
          }
        }
      }
    }
  }
  return errors;
}

export function validatePhase8Index(index, manifest) {
  const errors = [];
  if (!index || typeof index !== 'object' || index.schemaVersion !== '1.0.0') return ['event index is invalid'];
  if (index.datasetVersion !== manifest.datasetVersion) errors.push('event index version mismatch');
  if (!Array.isArray(index.events) || index.events.length !== manifest.counts.events) errors.push('event index count mismatch');
  const ids = new Set();
  for (const entry of index.events ?? []) {
    if (typeof entry.id !== 'string' || ids.has(entry.id)) errors.push(`invalid or duplicate event index ID: ${entry?.id ?? '?'}`);
    ids.add(entry.id);
    if (!isArtifact(entry.json, 'application/json') || !isArtifact(entry.script, 'text/javascript')) errors.push(`invalid event artifact: ${entry?.id ?? '?'}`);
  }
  return errors;
}

export async function verifyArtifactText(text, descriptor) {
  if (new TextEncoder().encode(text).byteLength !== descriptor.bytes) return { valid: false, code: 'SIZE_MISMATCH' };
  if (await sha256Text(text) !== descriptor.digest) return { valid: false, code: 'DIGEST_MISMATCH' };
  return { valid: true, code: 'OK' };
}
