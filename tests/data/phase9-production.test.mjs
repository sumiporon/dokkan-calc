import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createPhase9ProductionArtifacts,
  validatePhase9ProductionArtifacts
} from '../../scripts/generate-phase9-production.mjs';
import { createLegacyProductionRuntime } from '../../src/production/legacy-production-runtime.mjs';
import {
  validatePhase9Index,
  validatePhase9Manifest,
  validatePhase9Runtime,
  verifyArtifactText
} from '../../src/production/phase9-manifest.mjs';
import {
  CURRENT_ENEMY_DATA_BASELINE,
  auditEnemyData,
  extractEmbeddedEnemyPreset
} from '../helpers/enemy-data-audit.mjs';

const EXPECTED_SOURCE_DIGEST = 'sha256:f1cb27a2e5cae9627be61934aaabec79e4af0b42d3e21ad0cc7945eb6d7a0b40';
const GENERATED_AT = '2026-08-30T00:00:00.000Z';
const [sourceText, embeddedAppText] = await Promise.all([
  readFile(new URL('../../scraper/all_enemies.json', import.meta.url), 'utf8'),
  readFile(new URL('../../dokkan_calc_final.js', import.meta.url), 'utf8')
]);
const legacy = JSON.parse(sourceText);
const result = createPhase9ProductionArtifacts(legacy, sourceText, { generatedAt: GENERATED_AT });

function digest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function flattenedSourceStages(event) {
  return event.series.flatMap((series) => series.stages);
}

function runtimeEntity(runtime, { eventName, stageName, enemyName }) {
  const event = runtime.events.find((item) => item.name.value === eventName);
  const stage = event?.stages.find((item) => item.name.value === stageName);
  const enemy = stage?.encounters[0].enemies.find((item) => item.name.value === enemyName);
  assert.ok(event && stage && enemy, `runtime entity not found: ${eventName} / ${stageName} / ${enemyName}`);
  return { event, stage, encounter: stage.encounters[0], enemy };
}

test('Phase 9 production source is the exact existing 4,245-enemy repository baseline', () => {
  const audit = auditEnemyData(legacy, CURRENT_ENEMY_DATA_BASELINE);
  assert.deepEqual(audit.errors, []);
  assert.equal(digest(sourceText), EXPECTED_SOURCE_DIGEST);
  assert.deepEqual(extractEmbeddedEnemyPreset(embeddedAppText), legacy);
  assert.deepEqual(result.manifest.sourceCounts, {
    eventTypes: 56,
    series: 73,
    stages: 647,
    enemies: 4245,
    attacks: 8899,
    areaAttacks: 0
  });
  assert.deepEqual(result.manifest.counts, { events: 56, stages: 647, encounters: 647, enemies: 4245 });
});

test('normal, Super, and post-Super values are projected exactly without inferred enemy values', () => {
  let normalCount = 0;
  let superCount = 0;
  let postSuperCount = 0;
  legacy.forEach((sourceEvent, eventIndex) => {
    const runtimeEvent = result.runtime.events[eventIndex];
    const sourceStages = flattenedSourceStages(sourceEvent);
    assert.equal(runtimeEvent.stages.length, sourceStages.length);
    sourceStages.forEach((sourceStage, stageIndex) => {
      const runtimeEnemies = runtimeEvent.stages[stageIndex].encounters[0].enemies;
      assert.equal(runtimeEnemies.length, sourceStage.bosses.length);
      sourceStage.bosses.forEach((boss, enemyIndex) => {
        const runtimeEnemyValue = runtimeEnemies[enemyIndex];
        const normal = boss.attacks.find((attack) => attack.name === '通常');
        const supers = boss.attacks.filter((attack) => attack.name === '必殺' || attack.name === '必殺[会心]');
        const postSuper = boss.attacks.find((attack) => attack.name === '通常(必殺後)');
        assert.equal(runtimeEnemyValue.baseAttack.value, normal.value);
        assert.deepEqual(runtimeEnemyValue.superAttacks.map((attack) => attack.displayedDamage.value), supers.map((attack) => attack.value));
        const postSuperEffects = runtimeEnemyValue.superAttacks.flatMap((attack) => attack.effects)
          .filter((effect) => effect.appliesTo === 'subsequent-normal-attacks');
        assert.equal(postSuperEffects.length, postSuper ? 1 : 0);
        if (postSuper) {
          assert.equal(Math.floor(normal.value * (1 + postSuperEffects[0].value.value / 100)), postSuper.value);
          postSuperCount += 1;
        }
        normalCount += 1;
        superCount += supers.length;
      });
    });
  });
  assert.deepEqual({ normalCount, superCount, postSuperCount }, {
    normalCount: 4245,
    superCount: 4245,
    postSuperCount: 409
  });
  assert.deepEqual(result.projectionReport.exactProjectionChecks, {
    normalAttacks: 4245,
    superAttacks: 4245,
    postSuperAttacks: 409
  });
});

test('production artifacts exclude synthetic and unapproved saved-cache candidate sources', () => {
  assert.equal(result.manifest.dataClassification, 'legacy-production-baseline');
  assert.deepEqual(result.manifest.source, {
    kind: 'existing-production-repository-data',
    path: 'scraper/all_enemies.json',
    digest: EXPECTED_SOURCE_DIGEST,
    networkRequests: 0,
    savedCacheCandidateIncluded: false,
    syntheticFixtureIncluded: false,
    embeddedPresetMatches: true
  });
  assert.deepEqual(result.manifest.permission, {
    publicArtifactAllowed: true,
    productionActivateAllowed: true,
    liveSourceAccessAllowed: false,
    unapprovedDerivedDataIncluded: false,
    syntheticDataIncluded: false
  });
  assert.equal(result.projectionReport.source.savedCacheCandidateIncluded, false);
  assert.equal(result.projectionReport.source.syntheticFixtureIncluded, false);
});

test('runtime, manifest, index, and every artifact pass schema and digest gates', async () => {
  await validatePhase9ProductionArtifacts(result);
  assert.deepEqual(validatePhase9Runtime(result.runtime), []);
  assert.deepEqual(validatePhase9Manifest(result.manifest), []);
  assert.deepEqual(validatePhase9Index(result.index, result.manifest), []);
  const artifacts = [
    [result.fullJson, result.manifest.full.json],
    [result.indexJson, result.manifest.chunked.indexJson],
    ...result.chunks.map((chunk) => [chunk.eventJson, chunk.jsonArtifact])
  ];
  for (const [text, descriptor] of artifacts) {
    assert.deepEqual(await verifyArtifactText(text, descriptor), { valid: true, code: 'OK' });
  }
  assert.equal((await verifyArtifactText(`${result.fullJson} `, result.manifest.full.json)).valid, false);

  const candidateLeak = structuredClone(result.manifest);
  candidateLeak.source.savedCacheCandidateIncluded = true;
  assert.ok(validatePhase9Manifest(candidateLeak).includes('source boundary is invalid'));
  const syntheticLeak = structuredClone(result.manifest);
  syntheticLeak.permission.syntheticDataIncluded = true;
  assert.ok(validatePhase9Manifest(syntheticLeak).includes('permission boundary is invalid'));
});

test('semantic IDs survive unrelated event, series, stage, and enemy insertions', () => {
  const baselineLegacy = structuredClone(legacy.slice(0, 1));
  const sourceEvent = baselineLegacy[0];
  const sourceSeries = sourceEvent.series[0];
  const sourceStage = sourceSeries.stages[0];
  const sourceBoss = sourceStage.bosses[0];
  const stageLabel = sourceSeries.seriesName === '-'
    ? sourceStage.stageName
    : `${sourceSeries.seriesName}｜${sourceStage.stageName}`;
  const baseline = createLegacyProductionRuntime(baselineLegacy, JSON.stringify(baselineLegacy), { generatedAt: GENERATED_AT }).runtime;
  const baselineEntity = runtimeEntity(baseline, {
    eventName: sourceEvent.eventType,
    stageName: stageLabel,
    enemyName: sourceBoss.name
  });

  const changedLegacy = structuredClone(baselineLegacy);
  const unrelatedBoss = structuredClone(sourceBoss);
  unrelatedBoss.name = '無関係な追加敵';
  changedLegacy[0].series[0].stages[0].bosses.unshift(unrelatedBoss);
  const unrelatedStage = structuredClone(sourceStage);
  unrelatedStage.stageName = '無関係な追加ステージ';
  unrelatedStage.bosses = [structuredClone(unrelatedBoss)];
  changedLegacy[0].series[0].stages.unshift(unrelatedStage);
  const unrelatedSeries = structuredClone(sourceSeries);
  unrelatedSeries.seriesName = '無関係な追加シリーズ';
  unrelatedSeries.stages = [structuredClone(unrelatedStage)];
  changedLegacy[0].series.unshift(unrelatedSeries);
  const unrelatedEvent = structuredClone(sourceEvent);
  unrelatedEvent.eventType = '無関係な追加イベント';
  unrelatedEvent.series = [structuredClone(unrelatedSeries)];
  changedLegacy.unshift(unrelatedEvent);

  const changed = createLegacyProductionRuntime(changedLegacy, JSON.stringify(changedLegacy), { generatedAt: GENERATED_AT }).runtime;
  const changedEntity = runtimeEntity(changed, {
    eventName: sourceEvent.eventType,
    stageName: stageLabel,
    enemyName: sourceBoss.name
  });
  assert.equal(changedEntity.event.id, baselineEntity.event.id);
  assert.equal(changedEntity.stage.id, baselineEntity.stage.id);
  assert.equal(changedEntity.encounter.id, baselineEntity.encounter.id);
  assert.equal(changedEntity.enemy.id, baselineEntity.enemy.id);
  assert.deepEqual(changedEntity.enemy.superAttacks.map((attack) => attack.id), baselineEntity.enemy.superAttacks.map((attack) => attack.id));
  assert.notEqual(changed.datasetId, baseline.datasetId);
});
