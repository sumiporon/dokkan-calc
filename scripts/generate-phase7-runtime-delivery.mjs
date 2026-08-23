import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'generated', 'phase7', 'prototype-data');
const DEFAULT_RUNTIME = path.join(REPO_ROOT, 'generated', 'phase6', 'candidate', 'enemy-data-runtime-v1.json');
const REPRESENTATIVE_RUNTIME = path.join(REPO_ROOT, 'tests', 'fixtures', 'future', 'enemy-data-runtime-v1.representative.json');

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => [key, sortedValue(item)]));
  }
  return value;
}

export function minifiedStableJson(value) {
  return JSON.stringify(sortedValue(value));
}

export function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function artifact(relativePath, text, contentType) {
  return { path: relativePath.replaceAll('\\', '/'), digest: sha256(text), bytes: Buffer.byteLength(text), contentType };
}

function eventName(event) {
  return event.name?.state === 'known' ? event.name.value : event.id;
}

function eventCategory(event) {
  return event.category?.state === 'known' ? event.category.value : null;
}

function eventCounts(event) {
  const encounters = event.stages.flatMap((stage) => stage.encounters);
  return {
    stages: event.stages.length,
    encounters: encounters.length,
    enemies: encounters.reduce((total, encounter) => total + encounter.enemies.length, 0)
  };
}

function chunkFileStem(eventId) {
  return createHash('sha256').update(eventId).digest('hex').slice(0, 16);
}

function scriptAssignment(name, valueJson) {
  return `globalThis.${name}=${valueJson};\n`;
}

function chunkScript(eventIdJson, eventJson) {
  return `(function(g){g.__DOKKAN_PHASE7_EVENT_CHUNKS__=g.__DOKKAN_PHASE7_EVENT_CHUNKS__||Object.create(null);g.__DOKKAN_PHASE7_EVENT_CHUNKS__[${eventIdJson}]=${eventJson};if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new CustomEvent('phase7-chunk-loaded',{detail:{eventId:${eventIdJson}}}));})(globalThis);\n`;
}

export function createPhase7DeliveryArtifacts(runtime) {
  if (runtime?.schemaVersion !== '1.0.0' || !Array.isArray(runtime.events)) throw new Error('Phase 7 generator requires runtime schema 1.0.0.');
  const fullJson = minifiedStableJson(runtime);
  const fullScript = scriptAssignment('__DOKKAN_PHASE7_FULL_RUNTIME__', fullJson);
  const chunks = [];
  const indexEvents = [];
  for (const event of runtime.events) {
    const stem = chunkFileStem(event.id);
    const jsonPath = `chunked/chunks/event-${stem}.json`;
    const scriptPath = `chunked/chunks/event-${stem}.data.js`;
    const eventJson = minifiedStableJson(event);
    const eventScript = chunkScript(JSON.stringify(event.id), eventJson);
    const jsonArtifact = artifact(jsonPath, eventJson, 'application/json');
    const scriptArtifact = artifact(scriptPath, eventScript, 'text/javascript');
    chunks.push({ eventId: event.id, jsonPath, scriptPath, eventJson, eventScript, jsonArtifact, scriptArtifact });
    indexEvents.push({
      id: event.id,
      name: eventName(event),
      category: eventCategory(event),
      counts: eventCounts(event),
      json: jsonArtifact,
      script: scriptArtifact
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
  const indexScript = scriptAssignment('__DOKKAN_PHASE7_EVENT_INDEX__', indexJson);
  const fullJsonArtifact = artifact('full/runtime.min.json', fullJson, 'application/json');
  const fullScriptArtifact = artifact('full/runtime.data.js', fullScript, 'text/javascript');
  const indexJsonArtifact = artifact('chunked/event-index.json', indexJson, 'application/json');
  const indexScriptArtifact = artifact('chunked/event-index.data.js', indexScript, 'text/javascript');
  const totalJsonBytes = Buffer.byteLength(indexJson) + chunks.reduce((total, item) => total + item.jsonArtifact.bytes, 0);
  const manifest = {
    schemaVersion: '1.0.0',
    prototype: true,
    datasetVersion: runtime.datasetId,
    generatedAt: runtime.generatedAt,
    runtimeSchemaVersion: runtime.schemaVersion,
    appCompatibility: { minimum: 'phase7-prototype-1', maximum: null, productionAppReadsArtifact: false },
    full: { json: fullJsonArtifact, script: fullScriptArtifact },
    chunked: {
      indexJson: indexJsonArtifact,
      indexScript: indexScriptArtifact,
      eventCount: chunks.length,
      jsonFiles: chunks.length + 1,
      scriptFiles: chunks.length + 1,
      totalJsonBytes,
      largestChunkBytes: Math.max(0, ...chunks.map((item) => item.jsonArtifact.bytes))
    },
    knownGood: { datasetVersion: runtime.datasetId, manifestDigest: null, runtimeDigest: fullJsonArtifact.digest },
    validation: { status: 'passed', hardFailCount: 0, reviewRequiredCount: 0, note: 'Phase 7 offline prototype fixture only; not approved for production publication.' },
    permission: { offlinePrototypeAllowed: true, productionPublishAllowed: false }
  };
  const manifestJson = minifiedStableJson(manifest);
  const manifestScript = scriptAssignment('__DOKKAN_PHASE7_DELIVERY_MANIFEST__', manifestJson);
  return {
    runtime,
    fullJson,
    fullScript,
    index,
    indexJson,
    indexScript,
    chunks,
    manifest,
    manifestJson,
    manifestScript,
    summary: {
      datasetVersion: runtime.datasetId,
      events: runtime.events.length,
      fullJsonBytes: Buffer.byteLength(fullJson),
      fullScriptBytes: Buffer.byteLength(fullScript),
      indexJsonBytes: Buffer.byteLength(indexJson),
      totalChunkJsonBytes: totalJsonBytes,
      largestChunkBytes: manifest.chunked.largestChunkBytes,
      files: { fullJson: 2, fullScript: 2, chunkJson: chunks.length + 2, chunkScript: chunks.length + 2 }
    }
  };
}

export async function writePhase7DeliveryArtifacts(result, outputRoot = DEFAULT_OUTPUT) {
  const writes = [
    ['delivery-manifest.json', result.manifestJson],
    ['delivery-manifest.data.js', result.manifestScript],
    ['full/runtime.min.json', result.fullJson],
    ['full/runtime.data.js', result.fullScript],
    ['chunked/event-index.json', result.indexJson],
    ['chunked/event-index.data.js', result.indexScript]
  ];
  for (const chunk of result.chunks) {
    writes.push([chunk.jsonPath, chunk.eventJson], [chunk.scriptPath, chunk.eventScript]);
  }
  await Promise.all(writes.map(async ([relativePath, text]) => {
    const target = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  }));
}

export async function generatePhase7Delivery({ runtimePath = DEFAULT_RUNTIME, outputRoot = DEFAULT_OUTPUT, write = true } = {}) {
  const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  const result = createPhase7DeliveryArtifacts(runtime);
  if (write) await writePhase7DeliveryArtifacts(result, outputRoot);
  return result;
}

async function main() {
  const representative = process.argv.includes('--representative');
  const runtimePath = representative ? REPRESENTATIVE_RUNTIME : DEFAULT_RUNTIME;
  const outputRoot = representative ? path.join(REPO_ROOT, 'generated', 'phase7', 'representative-data') : DEFAULT_OUTPUT;
  const result = await generatePhase7Delivery({ runtimePath, outputRoot });
  process.stdout.write(`${minifiedStableJson({ outputRoot: path.relative(REPO_ROOT, outputRoot), ...result.summary })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
