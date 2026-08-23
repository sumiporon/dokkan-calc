import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPhase4Artifacts } from './generate-phase4-enemy-candidate.mjs';
import { stableJson } from '../generated/phase6/runtime/data-migration/phase4-enemy-migration.js';
import { phase4OfflineAdapter } from '../generated/phase6/runtime/data-foundation/phase6-canonical.js';
import { countCanonicalRecords, projectCanonicalToRuntime } from '../generated/phase6/runtime/data-foundation/phase6-runtime.js';
import {
  createPhase6PermissionLedger,
  createReleaseManifest,
  evaluatePermission,
  evaluateUpdateSafety,
  promoteRelease
} from '../generated/phase6/runtime/data-foundation/phase6-gates.js';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_ROOT = path.join(REPO_ROOT, 'artifacts', 'phase6');
const GENERATED_ROOT = path.join(REPO_ROOT, 'generated', 'phase6', 'candidate');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'tests', 'fixtures', 'future');

const PATHS = {
  canonical: path.join(GENERATED_ROOT, 'enemy-data-v2.canonical.json'),
  runtime: path.join(GENERATED_ROOT, 'enemy-data-runtime-v1.json'),
  manifest: path.join(ARTIFACT_ROOT, 'candidate-manifest.json'),
  validation: path.join(ARTIFACT_ROOT, 'validation-report.json'),
  omission: path.join(ARTIFACT_ROOT, 'runtime-omission-report.json'),
  verification: path.join(ARTIFACT_ROOT, 'large-scale-verification.json'),
  permission: path.join(ARTIFACT_ROOT, 'permission-ledger.json'),
  sourceMaterial: path.join(ARTIFACT_ROOT, 'source-material-reference.json'),
  representativeCanonical: path.join(FIXTURE_ROOT, 'enemy-data-v2.canonical.representative.json'),
  representativeRuntime: path.join(FIXTURE_ROOT, 'enemy-data-runtime-v1.representative.json')
};

function digest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function descriptor(relativePath, serialized, schemaVersion) {
  return {
    path: relativePath,
    digest: digest(serialized),
    bytes: Buffer.byteLength(serialized),
    schemaVersion
  };
}

async function validators() {
  const schemaPaths = {
    canonical: 'schemas/enemy-data-v2.canonical.schema.json',
    runtime: 'schemas/enemy-data-runtime-v1.schema.json',
    manifest: 'schemas/enemy-data-release-manifest-v1.schema.json',
    permission: 'schemas/enemy-data-permission-ledger-v1.schema.json'
  };
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
  addFormats(ajv);
  return Object.fromEntries(await Promise.all(Object.entries(schemaPaths).map(async ([key, relativePath]) => {
    const schema = JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
    return [key, ajv.compile(schema)];
  })));
}

function assertValid(validate, value, label) {
  if (!validate(value)) throw new Error(`${label} schema validation failed:\n${JSON.stringify(validate.errors, null, 2)}`);
}

function sourceContext(dataset, serialized, inputPath) {
  return {
    inputPath,
    inputDigest: digest(serialized),
    inputBytes: Buffer.byteLength(serialized),
    reproducibleBy: 'npm run generate:phase6 (offline saved-cache fixture only)'
  };
}

function featureProof(canonical) {
  const encounters = canonical.events.flatMap((event) => event.stages.flatMap((stage) => stage.encounters));
  const enemies = encounters.flatMap((encounter) => encounter.enemies);
  return {
    multipleSuperEnemies: enemies.filter((enemy) => enemy.superAttacks.length > 1).length,
    usageRules: enemies.flatMap((enemy) => enemy.superAttacks).reduce((total, attack) => total + attack.usageRules.length, 0),
    neutralEnemies: enemies.filter((enemy) => enemy.alignment.state === 'known' && enemy.alignment.value === 'neutral').length,
    areaAttacks: encounters.reduce((total, encounter) => total + encounter.areaAttacks.length, 0),
    aiActions: encounters.reduce((total, encounter) => total + encounter.aiActions.length, 0),
    knownExplicitZeroStats: enemies.flatMap((enemy) => Object.values(enemy.stats)).filter((field) => field.state === 'known' && field.value === 0).length,
    unknownCriticalFields: enemies.flatMap((enemy) => [enemy.critical.enabled, enemy.critical.attackMultiplier, enemy.critical.defenseIgnorePercent]).filter((field) => field.state === 'unknown').length,
    unavailableFields: enemies.flatMap((enemy) => [enemy.stats.hp, enemy.stats.baseAttack, enemy.stats.defense, enemy.stats.damageReductionPercent, enemy.stats.maxAttacksPerTurn]).filter((field) => field.state === 'unavailable').length
  };
}

export async function createPhase6Artifacts({
  candidateDataset = null,
  candidateSerialized = null,
  write = false
} = {}) {
  let phase4Result = null;
  if (candidateDataset == null) {
    phase4Result = await createPhase4Artifacts();
    candidateDataset = phase4Result.dataset;
    candidateSerialized = phase4Result.serialized.candidate;
  }
  candidateSerialized ??= stableJson(candidateDataset);
  const validate = await validators();
  const context = sourceContext(candidateDataset, candidateSerialized, 'generated/phase4/candidate/enemy-data-v1.candidate.json');
  if (!phase4OfflineAdapter.canHandle(candidateDataset)) throw new Error('Offline source adapter contract rejected the Phase 4 candidate.');

  const adapted = phase4OfflineAdapter.adapt(candidateDataset, context);
  const canonical = adapted.canonical;
  const projection = projectCanonicalToRuntime(canonical);
  const runtime = projection.runtime;
  const omissionReport = projection.report;
  assertValid(validate.canonical, canonical, 'canonical v2');
  assertValid(validate.runtime, runtime, 'runtime projection');

  const canonicalJson = stableJson(canonical);
  const runtimeJson = stableJson(runtime);
  const omissionJson = stableJson(omissionReport);
  const permissionLedger = createPhase6PermissionLedger(candidateDataset.generatedAt);
  assertValid(validate.permission, permissionLedger, 'permission ledger');
  const permissionJson = stableJson(permissionLedger);
  const offlinePermission = evaluatePermission(permissionLedger, 'dokkaninfo-saved-cache', 'offline-transform');
  const publishPermission = evaluatePermission(permissionLedger, 'dokkaninfo-saved-cache', 'publish-derived');
  const validationReport = evaluateUpdateSafety({
    candidate: canonical,
    runtime,
    integrity: {
      canonicalSchemaValid: true,
      runtimeSchemaValid: true,
      canonicalDigestMatches: true,
      runtimeDigestMatches: true,
      canonicalGenerationSucceeded: true,
      runtimeGenerationSucceeded: true
    },
    previousKnownGood: null,
    evaluatedAt: candidateDataset.generatedAt
  });
  const validationJson = stableJson(validationReport);

  const legacyRaw = await readFile(path.join(REPO_ROOT, 'scraper', 'all_enemies.json'), 'utf8');
  const manifest = createReleaseManifest({
    manifestId: `manifest:${canonical.datasetId}`,
    datasetVersion: canonical.datasetId,
    generatedAt: canonical.generatedAt,
    candidate: canonical,
    artifacts: {
      sourceInput: descriptor('generated/phase4/candidate/enemy-data-v1.candidate.json', candidateSerialized, '1'),
      canonical: descriptor('generated/phase6/candidate/enemy-data-v2.canonical.json', canonicalJson, '2.0.0'),
      runtime: descriptor('generated/phase6/candidate/enemy-data-runtime-v1.json', runtimeJson, '1.0.0'),
      validationReport: descriptor('artifacts/phase6/validation-report.json', validationJson, validationReport.gateVersion),
      omissionReport: descriptor('artifacts/phase6/runtime-omission-report.json', omissionJson, omissionReport.reportVersion)
    },
    validation: validationReport,
    validationReportDigest: digest(validationJson),
    permissionLedgerDigest: digest(permissionJson),
    offlineTransformAllowed: offlinePermission.allowed,
    productionPublishAllowed: publishPermission.allowed,
    previousKnownGood: {
      datasetVersion: 'legacy-production-current',
      artifactDigest: digest(legacyRaw),
      manifestDigest: null,
      kind: 'legacy-production'
    }
  });
  assertValid(validate.manifest, manifest, 'release manifest');
  const manifestJson = stableJson(manifest);
  const stableTransition = promoteRelease(manifest, 'stable');

  const sourceMaterialJson = stableJson(adapted.sourceMaterial);
  const counts = countCanonicalRecords(canonical);
  const legacySummary = phase4Result?.summary
    ?? JSON.parse(await readFile(path.join(REPO_ROOT, 'artifacts', 'phase4', 'legacy-comparison-summary.json'), 'utf8'));
  const verification = {
    reportVersion: '1.0.0',
    datasetId: canonical.datasetId,
    generatedAt: canonical.generatedAt,
    classification: 'offline-migration-test-material-not-production',
    networkRequests: 0,
    productionFilesWritten: 0,
    adapter: phase4OfflineAdapter.descriptor,
    schemas: { canonical: true, runtime: true, manifest: true, permissionLedger: true },
    counts,
    featureProof: featureProof(canonical),
    byteSizes: {
      phase4Candidate: Buffer.byteLength(candidateSerialized),
      canonical: Buffer.byteLength(canonicalJson),
      runtime: Buffer.byteLength(runtimeJson),
      runtimeVsCanonicalPercent: Math.round(Buffer.byteLength(runtimeJson) / Buffer.byteLength(canonicalJson) * 1000) / 10,
      runtimeVsPhase4Percent: Math.round(Buffer.byteLength(runtimeJson) / Buffer.byteLength(candidateSerialized) * 1000) / 10
    },
    safety: {
      status: validationReport.status,
      hardFailCount: validationReport.counts['hard-fail'],
      reviewRequiredCount: validationReport.counts['review-required'],
      candidateToStableAllowed: stableTransition.allowed,
      blockReason: stableTransition.reason
    },
    permission: { offlineTransform: offlinePermission.decision, publishDerived: publishPermission.decision },
    oldFormatCompatibility: {
      phase4StructuredLosses: legacySummary.fullCompatibilityReport.counts.loss,
      policy: '旧形式は比較・preview・一時互換に限定し、canonical v2を旧形式へ合わせて肥大化しない。runtimeからcanonicalへの逆変換もしない。'
    },
    deterministicGeneration: {
      canonicalInput: context.inputDigest,
      canonicalOutput: digest(canonicalJson),
      runtimeOutput: digest(runtimeJson),
      manifestOutput: digest(manifestJson)
    },
    deviceAssessment: '実測値はperformance-report.jsonへ分離。full runtimeを一括parseする設計はスマホ向け最終形とせず、Phase 7以降にmanifest/indexとevent単位chunkを比較する。'
  };
  const verificationJson = stableJson(verification);

  const representativeSource = await readFile(path.join(FIXTURE_ROOT, 'enemy-data-v1.representative.json'), 'utf8');
  const representativeV1 = JSON.parse(representativeSource);
  const representativeAdapted = phase4OfflineAdapter.adapt(
    representativeV1,
    sourceContext(representativeV1, representativeSource, 'tests/fixtures/future/enemy-data-v1.representative.json')
  );
  const representativeProjection = projectCanonicalToRuntime(representativeAdapted.canonical);
  assertValid(validate.canonical, representativeAdapted.canonical, 'representative canonical v2');
  assertValid(validate.runtime, representativeProjection.runtime, 'representative runtime');
  const representativeCanonicalJson = stableJson(representativeAdapted.canonical);
  const representativeRuntimeJson = stableJson(representativeProjection.runtime);

  const serialized = {
    canonical: canonicalJson,
    runtime: runtimeJson,
    manifest: manifestJson,
    validation: validationJson,
    omission: omissionJson,
    verification: verificationJson,
    permission: permissionJson,
    sourceMaterial: sourceMaterialJson,
    representativeCanonical: representativeCanonicalJson,
    representativeRuntime: representativeRuntimeJson
  };
  if (write) {
    await Promise.all([mkdir(GENERATED_ROOT, { recursive: true }), mkdir(ARTIFACT_ROOT, { recursive: true }), mkdir(FIXTURE_ROOT, { recursive: true })]);
    await Promise.all([
      writeFile(PATHS.canonical, canonicalJson, 'utf8'),
      writeFile(PATHS.runtime, runtimeJson, 'utf8'),
      writeFile(PATHS.manifest, manifestJson, 'utf8'),
      writeFile(PATHS.validation, validationJson, 'utf8'),
      writeFile(PATHS.omission, omissionJson, 'utf8'),
      writeFile(PATHS.verification, verificationJson, 'utf8'),
      writeFile(PATHS.permission, permissionJson, 'utf8'),
      writeFile(PATHS.sourceMaterial, sourceMaterialJson, 'utf8'),
      writeFile(PATHS.representativeCanonical, representativeCanonicalJson, 'utf8'),
      writeFile(PATHS.representativeRuntime, representativeRuntimeJson, 'utf8')
    ]);
  }
  return { canonical, runtime, manifest, validationReport, omissionReport, permissionLedger, verification, sourceMaterial: adapted.sourceMaterial, representativeCanonical: representativeAdapted.canonical, representativeRuntime: representativeProjection.runtime, serialized };
}

async function main() {
  const result = await createPhase6Artifacts({ write: true });
  process.stdout.write(stableJson({
    datasetId: result.canonical.datasetId,
    counts: result.verification.counts,
    byteSizes: result.verification.byteSizes,
    safety: result.verification.safety,
    paths: Object.fromEntries(Object.entries(PATHS).map(([key, value]) => [key, path.relative(REPO_ROOT, value)]))
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
