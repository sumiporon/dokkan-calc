import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  auditEnemyData,
  BOSS_REQUIRED_FIELDS,
  CURRENT_ENEMY_DATA_BASELINE,
  extractEmbeddedEnemyPreset
} from '../helpers/enemy-data-audit.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [dataText, appSource] = await Promise.all([
  readFile(resolve(repositoryRoot, 'scraper', 'all_enemies.json'), 'utf8'),
  readFile(resolve(repositoryRoot, 'dokkan_calc_final.js'), 'utf8')
]);
const enemyData = JSON.parse(dataText);
const baselineReport = auditEnemyData(enemyData);

test('現行敵データは必須25項目・型・enum・計算整合の検査に合格する', () => {
  assert.equal(BOSS_REQUIRED_FIELDS.length, 25);
  assert.deepEqual(baselineReport.errors, []);
  assert.deepEqual(baselineReport.stats.counts, CURRENT_ENEMY_DATA_BASELINE.counts);
  assert.deepEqual(baselineReport.stats.conditions, CURRENT_ENEMY_DATA_BASELINE.conditions);
  assert.deepEqual(baselineReport.stats.classes, CURRENT_ENEMY_DATA_BASELINE.classes);
  assert.deepEqual(baselineReport.stats.types, CURRENT_ENEMY_DATA_BASELINE.types);
});

test('JSONとアプリ内の埋め込みプリセットは完全一致する', () => {
  const embedded = extractEmbeddedEnemyPreset(appSource);
  assert.deepEqual(embedded, enemyData);
});

test('既知のID・DEF・特殊データ欠落を成功を妨げない警告として可視化する', () => {
  const codes = new Set(baselineReport.warnings.map((warning) => warning.code));
  for (const code of [
    'KNOWN_MISSING_EVENT_IDS',
    'KNOWN_MISSING_STAGE_IDS',
    'KNOWN_MISSING_ENEMY_IDS',
    'KNOWN_MISSING_ENEMY_DEF',
    'KNOWN_EMPTY_AOE_DATA',
    'KNOWN_EMPTY_CRITICAL_EFFECTS',
    'NON_UNIQUE_HUMAN_BOSS_PATHS'
  ]) {
    assert.ok(codes.has(code), `${code} が警告に含まれていません。`);
  }
});

test('必須項目欠落と不正属性を破損として検出する', () => {
  const mutated = [...enemyData];
  const event = { ...mutated[0], series: [...mutated[0].series] };
  const series = { ...event.series[0], stages: [...event.series[0].stages] };
  const stage = { ...series.stages[0], bosses: [...series.stages[0].bosses] };
  const boss = { ...stage.bosses[0], type: 'unknown' };
  delete boss.baseAtk;
  stage.bosses[0] = boss;
  series.stages[0] = stage;
  event.series[0] = series;
  mutated[0] = event;

  const report = auditEnemyData(mutated);
  const codes = new Set(report.errors.map((error) => error.code));
  assert.ok(codes.has('MISSING_REQUIRED_FIELD'));
  assert.ok(codes.has('INVALID_TYPE'));
});

test('件数の急減と特殊条件件数の減少を検出する', () => {
  const countDropReport = auditEnemyData(enemyData.slice(0, 50));
  assert.ok(countDropReport.errors.some((error) => error.code === 'COUNT_DROP'));

  const conditionDropReport = auditEnemyData(enemyData, {
    baseline: {
      ...CURRENT_ENEMY_DATA_BASELINE,
      conditions: {
        ...CURRENT_ENEMY_DATA_BASELINE.conditions,
        turnAtk: CURRENT_ENEMY_DATA_BASELINE.conditions.turnAtk + 1
      }
    }
  });
  assert.ok(conditionDropReport.errors.some((error) => error.code === 'CONDITION_COUNT_DROP'));
});

test('現行データの重複基準を固定し、自動削除対象にはしない', () => {
  const duplicates = baselineReport.stats.duplicates;
  assert.equal(duplicates.stageNamesWithinSeries.groups, 43);
  assert.equal(duplicates.stageNamesWithinSeries.extra, 52);
  assert.equal(duplicates.exactStagesWithinSeries.groups, 5);
  assert.equal(duplicates.exactStagesWithinSeries.extra, 5);
  assert.equal(duplicates.bossNamesWithinStage.groups, 370);
  assert.equal(duplicates.bossNamesWithinStage.extra, 927);
  assert.equal(duplicates.exactBossesWithinStage.groups, 90);
  assert.equal(duplicates.exactBossesWithinStage.extra, 360);
});

test('最大値を増加量で割り切れない既存条件を基準として記録する', () => {
  assert.equal(baselineReport.stats.outliers.turnMaximumNotDivisible, 12);
  assert.equal(baselineReport.stats.outliers.hitMaximumNotDivisible, 5);
  assert.ok(baselineReport.warnings.some((warning) => warning.code === 'NON_DIVISIBLE_CONDITION_MAXIMUM'));
});

test('将来追加されるIDの空値・重複・同一ステージ内の曖昧さを検出する', () => {
  const mutated = structuredClone(enemyData.slice(0, 2));
  mutated[0].eventId = 'same-event-id';
  mutated[1].eventId = 'same-event-id';
  mutated[0].series[0].stages[0].stageId = '';

  const stage = mutated[0].series[0].stages[0];
  const firstBoss = stage.bosses[0];
  firstBoss.enemyId = 'same-enemy-id';
  stage.bosses.push({ ...structuredClone(firstBoss), name: `${firstBoss.name}（ID重複テスト）` });

  const report = auditEnemyData(mutated, { baseline: null });
  const errors = new Set(report.errors.map((error) => error.code));
  const warnings = new Set(report.warnings.map((warning) => warning.code));

  assert.ok(errors.has('DUPLICATE_EVENT_ID'));
  assert.ok(errors.has('INVALID_STAGE_ID'));
  assert.ok(warnings.has('DUPLICATE_ENEMY_ID_WITHIN_STAGE'));
});
