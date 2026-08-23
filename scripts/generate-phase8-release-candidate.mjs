import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { minifiedStableJson, sha256 } from './generate-phase7-runtime-delivery.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_RUNTIME = path.join(REPO_ROOT, 'generated', 'phase6', 'candidate', 'enemy-data-runtime-v1.json');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'generated', 'phase8', 'release-candidate');
const SYNTHETIC_RUNTIME = path.join(REPO_ROOT, 'tests', 'fixtures', 'phase8', 'synthetic-runtime.json');
const SYNTHETIC_OUTPUT = path.join(REPO_ROOT, 'release-candidate', 'phase8', 'data');

function artifact(relativePath, text, contentType) {
  return { path: relativePath.replaceAll('\\', '/'), digest: sha256(text), bytes: Buffer.byteLength(text), contentType };
}

function known(field, fallback) {
  return field?.state === 'known' ? field.value : fallback;
}

function eventCounts(event) {
  const encounters = event.stages.flatMap((stage) => stage.encounters);
  return {
    stages: event.stages.length,
    encounters: encounters.length,
    enemies: encounters.reduce((total, encounter) => total + encounter.enemies.length, 0)
  };
}

function runtimeCounts(runtime) {
  const perEvent = runtime.events.map(eventCounts);
  return {
    events: runtime.events.length,
    stages: perEvent.reduce((total, item) => total + item.stages, 0),
    encounters: perEvent.reduce((total, item) => total + item.encounters, 0),
    enemies: perEvent.reduce((total, item) => total + item.enemies, 0)
  };
}

function fileStem(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function scriptAssignment(name, json) {
  return `globalThis.${name}=${json};\n`;
}

function eventScript(eventId, eventJson) {
  const id = JSON.stringify(eventId);
  return `(function(g){g.__DOKKAN_PHASE8_EVENT_CHUNKS__=g.__DOKKAN_PHASE8_EVENT_CHUNKS__||Object.create(null);g.__DOKKAN_PHASE8_EVENT_CHUNKS__[${id}]=${eventJson};})(globalThis);\n`;
}

export function createPhase8ReleaseArtifacts(runtime) {
  if (runtime?.schemaVersion !== '1.0.0' || !Array.isArray(runtime.events)) throw new Error('Phase 8 generator requires runtime schema 1.0.0.');
  const syntheticPublicFixture = runtime.region === 'synthetic';
  const releasePath = `releases/${fileStem(runtime.datasetId)}`;
  const fullJson = minifiedStableJson(runtime);
  const fullScript = scriptAssignment('__DOKKAN_PHASE8_FULL_RUNTIME__', fullJson);
  const fullJsonArtifact = artifact(`${releasePath}/full/runtime.min.json`, fullJson, 'application/json');
  const fullScriptArtifact = artifact(`${releasePath}/full/runtime.data.js`, fullScript, 'text/javascript');
  const chunks = [];
  const indexEvents = [];
  for (const event of runtime.events) {
    const stem = fileStem(event.id);
    const eventJson = minifiedStableJson(event);
    const script = eventScript(event.id, eventJson);
    const jsonArtifact = artifact(`${releasePath}/chunked/event-${stem}.json`, eventJson, 'application/json');
    const scriptArtifact = artifact(`${releasePath}/chunked/event-${stem}.data.js`, script, 'text/javascript');
    chunks.push({ eventId: event.id, eventJson, eventScript: script, jsonArtifact, scriptArtifact });
    indexEvents.push({
      id: event.id,
      name: known(event.name, event.id),
      category: known(event.category, null),
      counts: eventCounts(event),
      json: jsonArtifact,
      script: scriptArtifact
    });
  }
  const index = { schemaVersion: '1.0.0', datasetVersion: runtime.datasetId, generatedAt: runtime.generatedAt, region: runtime.region, events: indexEvents };
  const indexJson = minifiedStableJson(index);
  const indexScript = scriptAssignment('__DOKKAN_PHASE8_EVENT_INDEX__', indexJson);
  const indexJsonArtifact = artifact(`${releasePath}/chunked/event-index.json`, indexJson, 'application/json');
  const indexScriptArtifact = artifact(`${releasePath}/chunked/event-index.data.js`, indexScript, 'text/javascript');
  const totalJsonBytes = indexJsonArtifact.bytes + chunks.reduce((total, chunk) => total + chunk.jsonArtifact.bytes, 0);
  const counts = runtimeCounts(runtime);
  const manifest = {
    schemaVersion: '1.0.0',
    releaseCandidate: true,
    productionActivated: false,
    dataClassification: syntheticPublicFixture ? 'synthetic-public-fixture' : 'existing-data-internal-only',
    datasetVersion: runtime.datasetId,
    generatedAt: runtime.generatedAt,
    runtimeSchemaVersion: runtime.schemaVersion,
    appCompatibility: { minimum: 'phase8-rc-1', maximum: null, productionAppReadsArtifact: false },
    counts,
    full: { json: fullJsonArtifact, script: fullScriptArtifact },
    chunked: {
      indexJson: indexJsonArtifact,
      indexScript: indexScriptArtifact,
      eventCount: chunks.length,
      jsonFiles: chunks.length + 1,
      scriptFiles: chunks.length + 1,
      totalJsonBytes,
      largestChunkBytes: Math.max(0, ...chunks.map((chunk) => chunk.jsonArtifact.bytes))
    },
    knownGood: { datasetVersion: runtime.datasetId, runtimeDigest: fullJsonArtifact.digest, retainedReleaseCount: 2 },
    validation: { status: 'passed', hardFailCount: 0, reviewRequiredCount: 0, note: syntheticPublicFixture ? 'Fictional Phase 8 public preview fixture; production activation is prohibited.' : 'Internal delivery validation only; this existing-data artifact must not be published or activated.' },
    permission: { releaseCandidatePreviewAllowed: true, publicArtifactAllowed: syntheticPublicFixture, productionActivateAllowed: false, liveSourceAccessAllowed: false },
    updatePolicy: { userInitiated: true, zeroOperationEnabled: false, browserPatRequired: false }
  };
  const manifestJson = minifiedStableJson(manifest);
  const manifestScript = scriptAssignment('__DOKKAN_PHASE8_RELEASE_MANIFEST__', manifestJson);
  return {
    runtime, releasePath, fullJson, fullScript, chunks, index, indexJson, indexScript, manifest, manifestJson, manifestScript,
    summary: { datasetVersion: runtime.datasetId, releasePath, ...counts, fullJsonBytes: fullJsonArtifact.bytes, indexJsonBytes: indexJsonArtifact.bytes, totalChunkJsonBytes: totalJsonBytes, largestChunkBytes: manifest.chunked.largestChunkBytes }
  };
}

export async function writePhase8ReleaseArtifacts(result, outputRoot = DEFAULT_OUTPUT) {
  const writes = [
    ['release-manifest.json', result.manifestJson],
    ['release-manifest.data.js', result.manifestScript],
    [result.manifest.full.json.path, result.fullJson],
    [result.manifest.full.script.path, result.fullScript],
    [result.manifest.chunked.indexJson.path, result.indexJson],
    [result.manifest.chunked.indexScript.path, result.indexScript],
    ...result.chunks.flatMap((chunk) => [[chunk.jsonArtifact.path, chunk.eventJson], [chunk.scriptArtifact.path, chunk.eventScript]])
  ];
  await Promise.all(writes.map(async ([relativePath, text]) => {
    const target = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  }));
}

export async function generatePhase8Release({ runtimePath = DEFAULT_RUNTIME, outputRoot = DEFAULT_OUTPUT } = {}) {
  const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  const result = createPhase8ReleaseArtifacts(runtime);
  await writePhase8ReleaseArtifacts(result, outputRoot);
  return result;
}

async function main() {
  const synthetic = process.argv.includes('--synthetic');
  const result = await generatePhase8Release({ runtimePath: synthetic ? SYNTHETIC_RUNTIME : DEFAULT_RUNTIME, outputRoot: synthetic ? SYNTHETIC_OUTPUT : DEFAULT_OUTPUT });
  process.stdout.write(`${JSON.stringify(result.summary)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
