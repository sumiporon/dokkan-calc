import { validatePhase8Runtime, verifyArtifactText } from '../release-candidate/phase8-manifest.mjs';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

function isJsonArtifact(value) {
  return value && typeof value.path === 'string' && value.path.length > 0
    && DIGEST_PATTERN.test(value.digest)
    && Number.isInteger(value.bytes) && value.bytes > 0
    && value.contentType === 'application/json';
}

export function validatePhase9Manifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest must be an object'];
  if (manifest.schemaVersion !== '1.0.0') errors.push('unsupported manifest schema');
  if (manifest.releaseCandidate !== false || manifest.productionActivated !== true) errors.push('production activation boundary is invalid');
  if (manifest.dataClassification !== 'legacy-production-baseline') errors.push('production data classification is invalid');
  if (typeof manifest.datasetVersion !== 'string' || manifest.datasetVersion.length === 0) errors.push('dataset version is missing');
  if (!Number.isFinite(Date.parse(manifest.generatedAt))) errors.push('generatedAt is invalid');
  if (manifest.runtimeSchemaVersion !== '1.0.0') errors.push('runtime schema is incompatible');
  if (manifest.source?.kind !== 'existing-production-repository-data'
    || manifest.source?.path !== 'scraper/all_enemies.json'
    || !DIGEST_PATTERN.test(manifest.source?.digest ?? '')
    || manifest.source?.networkRequests !== 0
    || manifest.source?.embeddedPresetMatches !== true
    || manifest.source?.savedCacheCandidateIncluded !== false
    || manifest.source?.syntheticFixtureIncluded !== false) errors.push('source boundary is invalid');
  if (manifest.appCompatibility?.minimum !== 'phase9-production-1'
    || manifest.appCompatibility?.productionAppReadsArtifact !== true) errors.push('app compatibility declaration is invalid');
  if (!isJsonArtifact(manifest.full?.json) || !isJsonArtifact(manifest.chunked?.indexJson)) errors.push('delivery artifacts are invalid');
  if (!manifest.counts || !['events', 'stages', 'encounters', 'enemies'].every((key) => Number.isInteger(manifest.counts[key]) && manifest.counts[key] > 0)) errors.push('runtime counts are invalid');
  if (!manifest.sourceCounts || !['eventTypes', 'series', 'stages', 'enemies', 'attacks', 'areaAttacks'].every((key) => Number.isInteger(manifest.sourceCounts[key]) && manifest.sourceCounts[key] >= 0)) errors.push('source counts are invalid');
  if (manifest.chunked?.eventCount !== manifest.counts?.events || manifest.chunked?.jsonFiles !== manifest.counts?.events + 1) errors.push('chunk counts are invalid');
  if (manifest.validation?.status !== 'passed'
    || manifest.validation?.hardFailCount !== 0
    || manifest.validation?.reviewRequiredCount !== 0
    || manifest.validation?.sourceAuditErrorCount !== 0
    || manifest.validation?.projectionErrorCount !== 0) errors.push('validation gate did not pass');
  if (manifest.permission?.publicArtifactAllowed !== true
    || manifest.permission?.productionActivateAllowed !== true
    || manifest.permission?.liveSourceAccessAllowed !== false
    || manifest.permission?.unapprovedDerivedDataIncluded !== false
    || manifest.permission?.syntheticDataIncluded !== false) errors.push('permission boundary is invalid');
  if (manifest.updatePolicy?.userInitiated !== true
    || manifest.updatePolicy?.zeroOperationEnabled !== false
    || manifest.updatePolicy?.browserPatRequired !== false) errors.push('update policy is invalid');
  if (manifest.knownGood?.datasetVersion !== manifest.datasetVersion
    || manifest.knownGood?.runtimeDigest !== manifest.full?.json?.digest
    || manifest.knownGood?.retainedReleaseCount !== 2) errors.push('known-good metadata mismatch');
  return errors;
}

export const validatePhase9Runtime = validatePhase8Runtime;

export function validatePhase9Index(index, manifest) {
  const errors = [];
  if (!index || typeof index !== 'object' || index.schemaVersion !== '1.0.0') return ['event index is invalid'];
  if (index.datasetVersion !== manifest.datasetVersion) errors.push('event index version mismatch');
  if (!Array.isArray(index.events) || index.events.length !== manifest.counts.events) errors.push('event index count mismatch');
  const ids = new Set();
  for (const entry of index.events ?? []) {
    if (typeof entry.id !== 'string' || ids.has(entry.id)) errors.push(`invalid or duplicate event index ID: ${entry?.id ?? '?'}`);
    ids.add(entry.id);
    if (!isJsonArtifact(entry.json)) errors.push(`invalid event artifact: ${entry?.id ?? '?'}`);
  }
  return errors;
}

export { verifyArtifactText };
