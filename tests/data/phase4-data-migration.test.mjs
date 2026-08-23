import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

import { buildCandidateFromCache } from '../../scripts/generate-phase4-enemy-candidate.mjs';
import {
  candidateDatasetToLegacy,
  candidateEnemyToLegacy,
  classifyLegacyAndCandidateStages,
  legacyDatasetToFuture,
  stableJson
} from '../../src/data-migration/phase4-enemy-migration.ts';
import { auditFutureEnemyDataset } from '../helpers/future-enemy-schema-audit.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const [schema, representative, selection, manifest, legacy] = await Promise.all([
  readFile(new URL('../../schemas/enemy-data-v1.draft.schema.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../fixtures/future/enemy-data-v1.representative.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../artifacts/phase4/representative-selection.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../artifacts/phase4/candidate-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../scraper/all_enemies.json', import.meta.url), 'utf8').then(JSON.parse)
]);
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function allEnemies(dataset) {
  return dataset.events.flatMap((event) => event.stages.flatMap((stage) => stage.encounters.flatMap((encounter) => encounter.enemies)));
}

function allEncounters(dataset) {
  return dataset.events.flatMap((event) => event.stages.flatMap((stage) => stage.encounters));
}

function digest(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

test('保存HTMLの同じ入力はbyte-identicalな候補を再生成する', async () => {
  const stageFiles = [
    'stage_711_7110011.html',
    'stage_1702_17020095.html',
    'stage_766_7660045.html',
    'stage_1701_17010065.html'
  ];
  const [first, second] = await Promise.all([
    buildCandidateFromCache({ stageFiles }),
    buildCandidateFromCache({ stageFiles })
  ]);
  const firstBytes = stableJson(first.dataset);
  const secondBytes = stableJson(second.dataset);
  assert.equal(firstBytes, secondBytes);
  assert.equal(digest(first.dataset), digest(second.dataset));
  assert.equal(first.dataset.generatedAt, '2026-02-23T08:11:11.385Z');
  assert.equal(first.dataset.sourceSnapshot.importMethod, 'saved-cache');
  assert.match(first.dataset.sourceSnapshot.notes, /外部アクセス0/);
  assert.deepEqual(auditFutureEnemyDataset(first.dataset).errors, []);
  assert.equal(validateSchema(first.dataset), true, JSON.stringify(validateSchema.errors, null, 2));
});

test('代表数十体は中立・SA表示なし・AOE・DEF・AI・条件・0/null・全属性を含む', () => {
  assert.equal(validateSchema(representative), true, JSON.stringify(validateSchema.errors, null, 2));
  const audit = auditFutureEnemyDataset(representative);
  assert.deepEqual(audit.errors, []);
  assert.ok(audit.counts.enemies >= 30 && audit.counts.enemies <= 80);
  assert.deepEqual(selection.uncoveredFeatures, []);
  const features = new Set(selection.selection.flatMap((entry) => entry.features));
  for (const expected of [
    'neutral-alignment', 'missing-super-display', 'area-attack', 'multiple-ai-sequences',
    'multiple-super-attacks', 'defense', 'null-combat-stats', 'explicit-zero',
    'turn-condition', 'received-hit-condition', 'hp-condition', 'appearance-condition',
    'critical', 'type-agl', 'type-teq', 'type-int', 'type-str', 'type-phy'
  ]) assert.ok(features.has(expected), expected);

  const enemies = allEnemies(representative);
  assert.ok(enemies.some((enemy) => enemy.alignment === 'neutral'));
  assert.ok(enemies.some((enemy) => enemy.stats.baseAttack == null));
  assert.ok(enemies.some((enemy) => enemy.stats.damageReductionPercent === 0));
  assert.ok(enemies.some((enemy) => enemy.stats.defense != null));
  assert.ok(enemies.some((enemy) => (enemy.stats.baseAttack ?? 0) > 0 && !enemy.attacks.superAttacks.some((attack) => attack.displayedDamage != null)));
  assert.ok(enemies.some((enemy) => enemy.attacks.superAttacks.length > 1));
  assert.ok(enemies.every((enemy) => enemy.occurrenceId.startsWith('dokkaninfo-cache:jpnja:')));
  assert.ok(enemies.every((enemy) => enemy.identity.cardId != null && enemy.identity.thumbId != null));
  assert.equal(new Set(enemies.map((enemy) => enemy.occurrenceId)).size, enemies.length);
  assert.ok(allEncounters(representative).some((encounter) => new Set(encounter.aiActions.map((action) => action.sequenceIndex)).size > 1));
  assert.ok(allEncounters(representative).some((encounter) => encounter.areaAttacks.some((area) => area.sourceOccurrenceId != null)));
});

test('HP条件帯は1つの必殺へ帰属し、真の複数必殺と区別される', () => {
  const enemies = allEnemies(representative);
  const janemba = enemies.find((enemy) => enemy.occurrenceId === 'dokkaninfo-cache:jpnja:701:7010013:4:0');
  assert.ok(janemba);
  assert.equal(janemba.attacks.superAttacks.length, 1);
  assert.equal(janemba.attacks.superAttacks[0].name, 'ラピッドキャノン');
  assert.deepEqual(janemba.attacks.superAttacks[0].usageRules, [
    {
      sourceOrder: 1,
      hpMinPercent: 90,
      hpMaxPercent: 100,
      probabilityPercent: 100,
      maxPerTurn: 1,
      cooldownTurns: 0,
      rawText: 'HPレンジ: 90% ~ 100% パーセンテージ: 100% 最大ATK/ターン: 1 再使用までの時間: 0'
    },
    {
      sourceOrder: 2,
      hpMinPercent: 0,
      hpMaxPercent: 90,
      probabilityPercent: 30,
      maxPerTurn: 1,
      cooldownTurns: 2,
      rawText: 'HPレンジ: 0% ~ 90% パーセンテージ: 30% 最大ATK/ターン: 1 再使用までの時間: 2'
    }
  ]);
  const daimaGoku = enemies.find((enemy) => enemy.occurrenceId === 'dokkaninfo-cache:jpnja:1744:17440013:0:6');
  assert.ok(daimaGoku);
  assert.deepEqual(daimaGoku.attacks.superAttacks.map((attack) => attack.name), ['龍撃牙咆', '龍撃拳']);
  assert.ok(enemies.flatMap((enemy) => enemy.attacks.superAttacks).every(
    (attack) => !/^(?:HPレンジ|パーセンテージ|最大ATK\/ターン|再使用までの時間)\s*:/.test(attack.name ?? '')
  ));
});

test('安全な互換adapter既定値はneutralとSA欠損を黙って補完しない', () => {
  const enemies = allEnemies(representative);
  const neutral = enemies.find((enemy) => enemy.alignment === 'neutral' && (enemy.stats.baseAttack ?? 0) > 0)
    ?? allEnemies(buildSyntheticNeutralDataset()).at(0);
  const missingSuper = enemies.find((enemy) => (enemy.stats.baseAttack ?? 0) > 0 && !enemy.attacks.superAttacks.some((attack) => attack.displayedDamage != null));
  assert.ok(neutral);
  assert.ok(missingSuper);

  const neutralSafe = candidateEnemyToLegacy(neutral);
  assert.equal(neutralSafe.boss, null);
  assert.ok(neutralSafe.warnings.some((warning) => warning.code === 'UNKNOWN_ALIGNMENT'));
  const missingSafe = candidateEnemyToLegacy(missingSuper);
  assert.equal(missingSafe.boss?.saMulti, null);
  assert.ok(missingSafe.warnings.some((warning) => warning.code === 'MISSING_SUPER_PRESERVED'));

  const comparisonOnly = candidateEnemyToLegacy(missingSuper, {
    neutralPolicy: 'legacy-extreme',
    missingSuperPolicy: 'legacy-three'
  });
  assert.equal(comparisonOnly.boss?.saMulti, 3);
  assert.ok(comparisonOnly.warnings.some((warning) => warning.code === 'MISSING_SUPER_SYNTHESIZED'));
  const datasetResult = candidateDatasetToLegacy(representative);
  assert.equal(datasetResult.safeForProduction, false);
  assert.ok(datasetResult.warnings.length > 0);
});

test('AOE互換化は追加対象値等の消失をwarningにしてgateを失敗させる', () => {
  const encounter = allEncounters(representative).find((entry) => entry.areaAttacks.some((area) => area.sourceOccurrenceId != null));
  assert.ok(encounter);
  const area = encounter.areaAttacks.find((entry) => entry.sourceOccurrenceId != null);
  const enemy = encounter.enemies.find((entry) => entry.occurrenceId === area.sourceOccurrenceId);
  assert.ok(enemy);
  const result = candidateEnemyToLegacy(
    enemy,
    { neutralPolicy: 'legacy-extreme', missingSuperPolicy: 'legacy-three' },
    area.firstTargetDamage
  );
  assert.equal(result.boss?.aoeDamage, area.firstTargetDamage);
  assert.ok(result.warnings.some((warning) => warning.code === 'AOE_INFORMATION_LOSS'));
});

test('旧→新変換は比較用安定IDを持ち、無関係なevent挿入で既存IDが変わらない', () => {
  const sourceDigest = 'sha256:test-legacy-source';
  const generatedAt = '2026-02-23T08:11:11.385Z';
  const original = legacyDatasetToFuture(legacy.slice(0, 2), generatedAt, sourceDigest);
  const withUnrelatedPrefix = legacyDatasetToFuture([
    { eventType: '無関係な比較用event', series: [] },
    ...legacy.slice(0, 2)
  ], generatedAt, sourceDigest);
  const originalEvent = original.events[0];
  const shiftedEvent = withUnrelatedPrefix.events.find((event) => event.name === originalEvent.name);
  assert.ok(shiftedEvent);
  assert.equal(shiftedEvent.eventId, originalEvent.eventId);
  assert.deepEqual(shiftedEvent.stages.map((stage) => stage.stageId), originalEvent.stages.map((stage) => stage.stageId));
  assert.equal(
    shiftedEvent.stages[0].encounters[0].enemies[0].occurrenceId,
    originalEvent.stages[0].encounters[0].enemies[0].occurrenceId
  );
  assert.equal(digest(original), digest(legacyDatasetToFuture(legacy.slice(0, 2), generatedAt, sourceDigest)));
  const ids = allEnemies(original).map((enemy) => enemy.occurrenceId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(validateSchema(original), true, JSON.stringify(validateSchema.errors, null, 2));
  assert.deepEqual(auditFutureEnemyDataset(original).errors, []);
});

test('stage分類は候補だけを真の新規と断定せず、承認済みmanifest比較を待つ', () => {
  const classified = classifyLegacyAndCandidateStages(legacy, representative);
  assert.ok(classified.candidateClassifications.every((stage) => stage.status !== 'new-stage'));
  assert.ok(classified.candidateClassifications.some((stage) => stage.status === 'candidate-only-unconfirmed'));
});

test('versioned manifestは全ID索引・digest・production gateを小さく保持する', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.generatedAt, manifest.sourceSnapshot.acquiredAt);
  assert.match(manifest.sourceSnapshot.contentDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(manifest.counts.events, 88);
  assert.equal(manifest.counts.stages, 801);
  assert.equal(manifest.counts.enemies, 5032);
  assert.equal(manifest.counts.areaAttackEncounters, 65);
  assert.equal(manifest.counts.missingDisplayedSuperDamageOnCombatEnemy, 95);
  assert.equal(manifest.compatibilityGate.safeForProduction, false);
  const eventIds = manifest.stageIndex.map((event) => event.eventId);
  const stageIds = manifest.stageIndex.flatMap((event) => event.stageIds.map((stageId) => `${event.eventId}:${stageId}`));
  assert.equal(new Set(eventIds).size, 88);
  assert.equal(new Set(stageIds).size, 801);
  for (const artifact of Object.values(manifest.artifacts)) {
    assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(artifact.bytes > 0);
  }
  assert.deepEqual(manifest.safety, {
    generatedPathsOnly: true,
    networkRequests: 0,
    productionFilesWritten: 0,
    productionInputPaths: [
      'scraper/html_cache/index.json',
      'scraper/html_cache/stage_*.html',
      'scraper/all_enemies.json'
    ]
  });
});

function buildSyntheticNeutralDataset() {
  const dataset = structuredClone(representative);
  const enemy = allEnemies(dataset)[0];
  enemy.alignment = 'neutral';
  enemy.stats.baseAttack ??= 1;
  return { ...dataset, events: [{ ...dataset.events[0], stages: [{ ...dataset.events[0].stages[0], encounters: [{ ...dataset.events[0].stages[0].encounters[0], enemies: [enemy] }] }] }] };
}
