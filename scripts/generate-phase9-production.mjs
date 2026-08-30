import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { minifiedStableJson, sha256 } from './generate-phase7-runtime-delivery.mjs';
import { createLegacyProductionRuntime } from '../src/production/legacy-production-runtime.mjs';
import { validatePhase9Index, validatePhase9Manifest, validatePhase9Runtime } from '../src/production/phase9-manifest.mjs';
import { auditEnemyData, extractEmbeddedEnemyPreset } from '../tests/helpers/enemy-data-audit.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = path.join(REPO_ROOT, 'scraper', 'all_enemies.json');
const EMBEDDED_APP_PATH = path.join(REPO_ROOT, 'dokkan_calc_final.js');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'data');
const REPORT_PATH = path.join(REPO_ROOT, 'artifacts', 'phase9', 'production-release-report.json');

function artifact(relativePath, text) {
  return {
    path: relativePath.replaceAll('\\', '/'),
    digest: sha256(text),
    bytes: Buffer.byteLength(text),
    contentType: 'application/json'
  };
}

function fileStem(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function known(field, fallback) {
  return field?.state === 'known' ? field.value : fallback;
}

function eventCounts(event) {
  const encounters = event.stages.flatMap((stage) => stage.encounters);
  return {
    stages: event.stages.length,
    encounters: encounters.length,
    enemies: encounters.reduce((sum, encounter) => sum + encounter.enemies.length, 0)
  };
}

function runtimeCounts(runtime) {
  const counts = runtime.events.map(eventCounts);
  return {
    events: runtime.events.length,
    stages: counts.reduce((sum, value) => sum + value.stages, 0),
    encounters: counts.reduce((sum, value) => sum + value.encounters, 0),
    enemies: counts.reduce((sum, value) => sum + value.enemies, 0)
  };
}

async function schemaValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const [runtimeSchema, manifestSchema] = await Promise.all([
    readFile(path.join(REPO_ROOT, 'schemas', 'enemy-data-runtime-v1.schema.json'), 'utf8').then(JSON.parse),
    readFile(path.join(REPO_ROOT, 'schemas', 'phase9-production-manifest-v1.schema.json'), 'utf8').then(JSON.parse)
  ]);
  return { runtime: ajv.compile(runtimeSchema), manifest: ajv.compile(manifestSchema) };
}

function assertSchema(validate, value, label) {
  if (!validate(value)) throw new Error(`${label} schema validation failed:\n${JSON.stringify(validate.errors, null, 2)}`);
}

export function createPhase9ProductionArtifacts(legacy, sourceText, { generatedAt } = {}) {
  const projected = createLegacyProductionRuntime(legacy, sourceText, generatedAt ? { generatedAt } : undefined);
  const { runtime, report: projectionReport } = projected;
  const fullJson = minifiedStableJson(runtime);
  const releasePath = `releases/${fileStem(runtime.datasetId)}`;
  const fullJsonArtifact = artifact(`${releasePath}/full/runtime.min.json`, fullJson);
  const chunks = [];
  const indexEvents = [];
  for (const event of runtime.events) {
    const eventJson = minifiedStableJson(event);
    const jsonArtifact = artifact(`${releasePath}/chunked/event-${fileStem(event.id)}.json`, eventJson);
    chunks.push({ eventId: event.id, eventJson, jsonArtifact });
    indexEvents.push({
      id: event.id,
      name: known(event.name, event.id),
      category: known(event.category, null),
      counts: eventCounts(event),
      json: jsonArtifact
    });
  }
  const index = {
    schemaVersion: '1.0.0',
    datasetVersion: runtime.datasetId,
    generatedAt: runtime.generatedAt,
    region: runtime.region,
    events: indexEvents
  };
  const indexJson = minifiedStableJson(index);
  const indexJsonArtifact = artifact(`${releasePath}/chunked/event-index.json`, indexJson);
  const counts = runtimeCounts(runtime);
  const totalJsonBytes = indexJsonArtifact.bytes + chunks.reduce((sum, chunk) => sum + chunk.jsonArtifact.bytes, 0);
  const manifest = {
    schemaVersion: '1.0.0',
    releaseCandidate: false,
    productionActivated: true,
    dataClassification: 'legacy-production-baseline',
    datasetVersion: runtime.datasetId,
    generatedAt: runtime.generatedAt,
    runtimeSchemaVersion: runtime.schemaVersion,
    source: { ...projectionReport.source, embeddedPresetMatches: true },
    appCompatibility: { minimum: 'phase9-production-1', maximum: null, productionAppReadsArtifact: true },
    counts,
    sourceCounts: {
      eventTypes: projectionReport.counts.eventTypes,
      series: projectionReport.counts.series,
      stages: projectionReport.counts.stages,
      enemies: projectionReport.counts.enemies,
      attacks: projectionReport.counts.attacks,
      areaAttacks: projectionReport.counts.areaAttacks
    },
    full: { json: fullJsonArtifact },
    chunked: {
      indexJson: indexJsonArtifact,
      eventCount: chunks.length,
      jsonFiles: chunks.length + 1,
      totalJsonBytes,
      largestChunkBytes: Math.max(...chunks.map((chunk) => chunk.jsonArtifact.bytes))
    },
    knownGood: { datasetVersion: runtime.datasetId, runtimeDigest: fullJsonArtifact.digest, retainedReleaseCount: 2 },
    validation: {
      status: 'passed', hardFailCount: 0, reviewRequiredCount: 0,
      sourceAuditErrorCount: 0, projectionErrorCount: 0,
      note: 'Repositoryで既に本番利用中の敵JSONだけを、外部通信なしでruntime/event chunksへ決定的に変換した。'
    },
    permission: {
      publicArtifactAllowed: true,
      productionActivateAllowed: true,
      liveSourceAccessAllowed: false,
      unapprovedDerivedDataIncluded: false,
      syntheticDataIncluded: false
    },
    updatePolicy: { userInitiated: true, zeroOperationEnabled: false, browserPatRequired: false }
  };
  const manifestJson = minifiedStableJson(manifest);
  return {
    runtime,
    projectionReport,
    releasePath,
    fullJson,
    chunks,
    index,
    indexJson,
    manifest,
    manifestJson,
    summary: { datasetVersion: runtime.datasetId, ...counts, ...manifest.sourceCounts, fullJsonBytes: fullJsonArtifact.bytes, totalChunkJsonBytes: totalJsonBytes }
  };
}

export async function validatePhase9ProductionArtifacts(result) {
  const validators = await schemaValidators();
  assertSchema(validators.runtime, result.runtime, 'production runtime');
  assertSchema(validators.manifest, result.manifest, 'production manifest');
  assert.deepEqual(validatePhase9Runtime(result.runtime), []);
  assert.deepEqual(validatePhase9Manifest(result.manifest), []);
  assert.deepEqual(validatePhase9Index(result.index, result.manifest), []);
}

export async function writePhase9ProductionArtifacts(result, outputRoot = OUTPUT_ROOT) {
  const writes = [
    ['release-manifest.json', result.manifestJson],
    [result.manifest.full.json.path, result.fullJson],
    [result.manifest.chunked.indexJson.path, result.indexJson],
    ...result.chunks.map((chunk) => [chunk.jsonArtifact.path, chunk.eventJson])
  ];
  await Promise.all(writes.map(async ([relativePath, text]) => {
    const target = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  }));
}

export async function generatePhase9Production({ outputRoot = OUTPUT_ROOT, reportPath = REPORT_PATH } = {}) {
  const [sourceText, appSource] = await Promise.all([
    readFile(SOURCE_PATH, 'utf8'),
    readFile(EMBEDDED_APP_PATH, 'utf8')
  ]);
  const legacy = JSON.parse(sourceText);
  const audit = auditEnemyData(legacy);
  if (audit.errors.length > 0) throw new Error(`Legacy production audit failed:\n${JSON.stringify(audit.errors, null, 2)}`);
  assert.deepEqual(extractEmbeddedEnemyPreset(appSource), legacy, 'embedded production preset must match scraper/all_enemies.json');
  const result = createPhase9ProductionArtifacts(legacy, sourceText);
  await validatePhase9ProductionArtifacts(result);
  await writePhase9ProductionArtifacts(result, outputRoot);
  const compactReport = {
    reportVersion: '1.0.0',
    generatedAt: result.runtime.generatedAt,
    datasetVersion: result.runtime.datasetId,
    source: result.manifest.source,
    sourceCounts: result.manifest.sourceCounts,
    runtimeCounts: result.manifest.counts,
    exactProjectionChecks: result.projectionReport.exactProjectionChecks,
    sourceAudit: { errors: audit.errors.length, warnings: audit.warnings.map((warning) => warning.code) },
    artifacts: {
      full: result.manifest.full.json,
      index: result.manifest.chunked.indexJson,
      eventChunks: result.manifest.chunked.eventCount,
      totalChunkJsonBytes: result.manifest.chunked.totalJsonBytes,
      largestChunkBytes: result.manifest.chunked.largestChunkBytes
    },
    gates: {
      runtimeSchema: 'passed', manifestSchema: 'passed', digestDescriptors: 'passed',
      externalNetworkRequests: 0, savedCacheCandidateIncluded: false, syntheticFixtureIncluded: false
    }
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(compactReport, null, 2)}\n`, 'utf8');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generatePhase9Production().then((result) => {
    process.stdout.write(`${JSON.stringify(result.summary)}\n`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
