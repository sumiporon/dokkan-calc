import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { minifiedStableJson, sha256 } from '../../scripts/generate-phase7-runtime-delivery.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'generated', 'phase7', 'prototype-data');
const [manifest, index, fullRuntime, expected] = await Promise.all([
  readFile(path.join(OUTPUT_ROOT, 'delivery-manifest.json'), 'utf8').then(JSON.parse),
  readFile(path.join(OUTPUT_ROOT, 'chunked', 'event-index.json'), 'utf8').then(JSON.parse),
  readFile(path.join(OUTPUT_ROOT, 'full', 'runtime.min.json'), 'utf8').then(JSON.parse),
  readFile(path.join(REPO_ROOT, 'artifacts', 'phase7', 'full-scale-delivery-summary.json'), 'utf8').then(JSON.parse)
]);

test('5,032体full runtimeは88 event chunkへ無損失分割され全descriptorが一致する', async () => {
  assert.equal(manifest.prototype, true);
  assert.equal(manifest.permission.productionPublishAllowed, false);
  assert.equal(index.datasetVersion, manifest.datasetVersion);
  assert.equal(fullRuntime.datasetId, manifest.datasetVersion);
  assert.equal(index.events.length, fullRuntime.events.length);

  let totalChunkBytes = Buffer.byteLength(minifiedStableJson(index));
  let enemyCount = 0;
  for (const [position, entry] of index.events.entries()) {
    const text = await readFile(path.join(OUTPUT_ROOT, entry.json.path), 'utf8');
    assert.equal(Buffer.byteLength(text), entry.json.bytes, entry.id);
    assert.equal(sha256(text), entry.json.digest, entry.id);
    assert.equal(text, minifiedStableJson(fullRuntime.events[position]), entry.id);
    const event = JSON.parse(text);
    enemyCount += event.stages.flatMap((stage) => stage.encounters).reduce((total, encounter) => total + encounter.enemies.length, 0);
    totalChunkBytes += entry.json.bytes;
  }

  const actual = {
    datasetVersion: manifest.datasetVersion,
    events: fullRuntime.events.length,
    enemies: enemyCount,
    fullJsonBytes: manifest.full.json.bytes,
    indexJsonBytes: manifest.chunked.indexJson.bytes,
    totalChunkJsonBytes: totalChunkBytes,
    largestChunkBytes: manifest.chunked.largestChunkBytes,
    fullRuntimeDigest: manifest.full.json.digest,
    eventIndexDigest: manifest.chunked.indexJson.digest
  };
  assert.deepEqual(actual, expected);
});
