import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditFutureEnemyDataset } from '../helpers/future-enemy-schema-audit.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [schema, example] = await Promise.all([
  readFile(resolve(repositoryRoot, 'schemas', 'enemy-data-v1.draft.schema.json'), 'utf8').then(JSON.parse),
  readFile(resolve(repositoryRoot, 'tests', 'fixtures', 'future', 'enemy-data-v1.example.json'), 'utf8').then(JSON.parse)
]);

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function schemaErrorText() {
  return JSON.stringify(validateSchema.errors, null, 2);
}

test('将来敵データの架空exampleはdraft JSON Schemaへ実際に適合する', () => {
  assert.equal(validateSchema(example), true, schemaErrorText());
  assert.equal(example.sourceSnapshot.provider, 'phase3-design-fixture');
  assert.equal(example.sourceSnapshot.sourceRootUrl, null);
  assert.match(example.sourceSnapshot.notes, /完全な架空例/);
});

test('意味検査は複合出現ID、順序、派生倍率、null理由を確認する', () => {
  const report = auditFutureEnemyDataset(example);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.counts, {
    events: 1,
    stages: 1,
    encounters: 1,
    enemies: 1,
    skills: 1,
    passiveEffects: 2,
    superAttacks: 1,
    superEffects: 1,
    configuredCriticalProfiles: 0,
    aiActions: 1,
    areaAttacks: 1,
    fieldStates: 6
  });

  const mutated = structuredClone(example);
  const enemy = mutated.events[0].stages[0].encounters[0].enemies[0];
  enemy.occurrenceId = 'wrong-id';
  enemy.attacks.superAttacks[0].derivedMultiplier = 4;
  enemy.fieldStates = enemy.fieldStates.filter(({ fieldPath }) => fieldPath !== 'critical.attackMultiplier');
  enemy.passiveEffects[0].trigger.hpMinPercent = 80;
  enemy.passiveEffects[0].trigger.hpMaxPercent = 20;

  const codes = new Set(auditFutureEnemyDataset(mutated).errors.map(({ code }) => code));
  assert.ok(codes.has('OCCURRENCE_ID_MISMATCH'));
  assert.ok(codes.has('SUPER_MULTIPLIER_MISMATCH'));
  assert.ok(codes.has('MISSING_NULL_REASON'));
  assert.ok(codes.has('INVALID_HP_RANGE'));
});

test('表示のない必殺値から派生倍率を補完せず、全nullable値に理由を求める', () => {
  const mutated = structuredClone(example);
  const enemy = mutated.events[0].stages[0].encounters[0].enemies[0];
  const superAttack = enemy.attacks.superAttacks[0];
  superAttack.displayedDamage = null;
  enemy.fieldStates.push({
    fieldPath: 'attacks.superAttacks.0.displayedDamage',
    state: 'source-not-rendered',
    notes: '表示なしを3倍として補わない検査。'
  });
  enemy.stats.hp = null;

  const codes = new Set(auditFutureEnemyDataset(mutated).errors.map(({ code }) => code));
  assert.ok(codes.has('DERIVED_VALUE_WITHOUT_SOURCE'));
  assert.ok(codes.has('MISSING_NULL_REASON'));
});

test('手動補正は安定した敵ID、元dataset digest、補正前値を照合する', () => {
  const corrected = structuredClone(example);
  const enemy = corrected.events[0].stages[0].encounters[0].enemies[0];
  corrected.sourceSnapshot.contentDigest = 'sha256:phase3-design-example';
  corrected.manualCorrections.push({
    correctionId: 'correction-example',
    sourceDatasetId: corrected.datasetId,
    sourceContentDigest: corrected.sourceSnapshot.contentDigest,
    target: {
      occurrenceId: enemy.occurrenceId,
      fieldPath: 'stats.baseAttack'
    },
    expectedOriginalValue: 1_200_000,
    replacementValue: 1_300_000,
    reason: '補正が別の敵へずれないことを確認する架空例。',
    evidenceUrls: ['https://example.invalid/evidence'],
    reviewedAt: '2026-08-21T00:00:00.000Z',
    reviewedBy: 'phase3-test'
  });

  assert.equal(validateSchema(corrected), true, schemaErrorText());
  assert.deepEqual(auditFutureEnemyDataset(corrected).errors, []);

  corrected.manualCorrections[0].expectedOriginalValue = 999;
  assert.ok(
    auditFutureEnemyDataset(corrected).errors.some(
      ({ code }) => code === 'CORRECTION_ORIGINAL_VALUE_MISMATCH'
    )
  );

  corrected.manualCorrections.push({
    ...structuredClone(corrected.manualCorrections[0]),
    replacementValue: 1_400_000
  });
  const duplicateCodes = new Set(
    auditFutureEnemyDataset(corrected).errors.map(({ code }) => code)
  );
  assert.ok(duplicateCodes.has('DUPLICATE_CORRECTION_ID'));
  assert.ok(duplicateCodes.has('DUPLICATE_CORRECTION_TARGET'));
});

test('意味検査はID重複と主要件数の急減を検出する', () => {
  const duplicated = structuredClone(example);
  const encounter = duplicated.events[0].stages[0].encounters[0];
  encounter.enemies.push(structuredClone(encounter.enemies[0]));
  const duplicateCodes = new Set(
    auditFutureEnemyDataset(duplicated).errors.map(({ code }) => code)
  );
  assert.ok(duplicateCodes.has('DUPLICATE_ENEMY_ORDER'));
  assert.ok(duplicateCodes.has('DUPLICATE_OCCURRENCE_ID'));

  const empty = structuredClone(example);
  empty.events = [];
  const baseline = auditFutureEnemyDataset(example);
  assert.ok(
    auditFutureEnemyDataset(empty, { baseline }).errors.some(
      ({ code }) => code === 'COUNT_DROP'
    )
  );

  const stripped = structuredClone(example);
  const strippedEncounter = stripped.events[0].stages[0].encounters[0];
  const strippedEnemy = strippedEncounter.enemies[0];
  strippedEnemy.skills = [];
  strippedEnemy.passiveEffects = [];
  strippedEnemy.attacks.superAttacks[0].effects = [];
  strippedEncounter.aiActions = [];
  strippedEncounter.areaAttacks = [];
  const dropCodes = auditFutureEnemyDataset(stripped, { baseline })
    .errors.filter(({ code }) => code === 'COUNT_DROP');
  assert.ok(dropCodes.length >= 5);
});

test('AI行動とAOE派生値はencounter内の敵・順序・元ATKを参照する', () => {
  const mutated = structuredClone(example);
  const encounter = mutated.events[0].stages[0].encounters[0];
  encounter.aiActions[0].sourceOrder = 2;
  encounter.aiActions[0].enemyOrder = 99;
  encounter.aiActions[0].hpMinPercent = 80;
  encounter.aiActions[0].hpMaxPercent = 20;
  encounter.areaAttacks[0].sourceOccurrenceId = 'missing-occurrence';

  const codes = new Set(auditFutureEnemyDataset(mutated).errors.map(({ code }) => code));
  assert.ok(codes.has('AI_ACTION_SOURCE_ORDER_GAP'));
  assert.ok(codes.has('AI_ENEMY_REFERENCE_MISSING'));
  assert.ok(codes.has('INVALID_AI_HP_RANGE'));
  assert.ok(codes.has('AREA_SOURCE_MISSING'));
  assert.ok(codes.has('DERIVED_VALUE_WITHOUT_SOURCE'));
});

test('AI行動順は敵ごとの1始まりsource sequenceとして保持する', () => {
  const valid = structuredClone(example);
  const encounter = valid.events[0].stages[0].encounters[0];
  const first = encounter.aiActions[0];
  encounter.aiActions.push(
    { ...first, sequenceIndex: 0, sourceOrder: 2 },
    { ...first, sequenceIndex: 1, sourceOrder: 1, enemyOrder: null },
    { ...first, sequenceIndex: 1, sourceOrder: 2, enemyOrder: null }
  );
  assert.deepEqual(auditFutureEnemyDataset(valid).errors, []);

  const duplicate = structuredClone(valid);
  duplicate.events[0].stages[0].encounters[0].aiActions.push({
    ...first,
    sequenceIndex: 0,
    sourceOrder: 2
  });
  assert.ok(
    auditFutureEnemyDataset(duplicate).errors.some(
      ({ code }) => code === 'DUPLICATE_AI_ACTION_POSITION'
    )
  );
});
