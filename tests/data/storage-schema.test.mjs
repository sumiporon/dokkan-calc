import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditEnemyData } from '../helpers/enemy-data-audit.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureDirectory = resolve(repositoryRoot, 'tests', 'fixtures', 'storage');

async function readFixture(name) {
  return JSON.parse(await readFile(resolve(fixtureDirectory, name), 'utf8'));
}

function migrateLegacySavedEnemies(savedEnemies) {
  if (!Array.isArray(savedEnemies) || savedEnemies.length === 0) return savedEnemies;
  if ('groupName' in savedEnemies[0]) {
    return savedEnemies.map((group) => ({
      eventType: group.groupName || 'その他',
      series: [{
        seriesName: '-',
        stages: [{ stageName: 'ステージ1', bosses: group.enemies || [] }]
      }]
    }));
  }
  if ('categoryName' in savedEnemies[0]) {
    return savedEnemies.map((category) => ({
      eventType: category.categoryName || 'その他',
      series: (category.events || []).map((event) => ({
        seriesName: event.eventName || '-',
        stages: [{ stageName: 'ステージ1', bosses: event.bosses || [] }]
      }))
    }));
  }
  return savedEnemies;
}

function visitJson(value, callback, path = '$') {
  callback(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitJson(item, callback, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      callback(key, `${path}.${key}`, true);
      visitJson(child, callback, `${path}.${key}`);
    }
  }
}

test('実装が使用するlocalStorageキーは既知の3種類だけである', async () => {
  const source = await readFile(resolve(repositoryRoot, 'dokkan_calc_final.js'), 'utf8');
  const stateKey = source.match(/const STORAGE_KEY = '([^']+)'/)?.[1];
  const explicitKeys = [...source.matchAll(/localStorage\.(?:getItem|setItem)\('([^']+)'/g)].map((match) => match[1]);
  const keys = [...new Set([stateKey, ...explicitKeys])].sort();

  assert.deepEqual(keys, [
    'dokkan_calc_data_v22',
    'dokkan_crit_overrides',
    'dokkan_github_pat'
  ]);
  assert.match(source, /localStorage\.clear\(\)/, '全消去の既知リスクがコードから消えた場合は文書とテストを見直してください。');
});

test('代表的なv22状態は現在の保存型を固定している', async () => {
  const state = await readFixture('v22-representative.json');
  assert.deepEqual(Object.keys(state).sort(), [
    'currentScenarios',
    'durabilityLines',
    'savedCharacters',
    'savedEnemies',
    'theme'
  ]);
  assert.ok(['light', 'dark'].includes(state.theme));
  assert.ok(state.durabilityLines.every((line) => typeof line.name === 'string' && Number.isFinite(line.value)));
  assert.ok(state.savedCharacters.every((character) => typeof character.name === 'string' && Array.isArray(character.scenarios)));

  const scenario = state.savedCharacters[0].scenarios[0];
  assert.equal(typeof scenario.originalIndex, 'number');
  assert.equal(typeof scenario.char_def, 'string');
  assert.equal(typeof scenario.is_guard, 'boolean');
  assert.equal(typeof scenario.is_critical, 'boolean');
  assert.equal(typeof scenario.loadedEnemy, 'object');

  const enemyReport = auditEnemyData(state.savedEnemies, { baseline: null });
  assert.deepEqual(enemyReport.errors, []);
});

test('旧2階層・3階層fixtureを現行4階層へ変換できる', async () => {
  const source = await readFile(resolve(repositoryRoot, 'dokkan_calc_final.js'), 'utf8');
  assert.match(source, /typeof savedEnemies\[0\]\.groupName !== 'undefined'/);
  assert.match(source, /typeof savedEnemies\[0\]\.categoryName !== 'undefined'/);
  assert.match(source, /seriesName: evt\.eventName \|\| "-"/);

  const [twoTier, threeTier] = await Promise.all([
    readFixture('legacy-two-tier.json'),
    readFixture('legacy-three-tier.json')
  ]);

  const migratedTwoTier = migrateLegacySavedEnemies(twoTier.savedEnemies);
  assert.equal(migratedTwoTier[0].eventType, '旧テストグループ');
  assert.equal(migratedTwoTier[0].series[0].stages[0].bosses[0].name, '旧テスト敵');

  const migratedThreeTier = migrateLegacySavedEnemies(threeTier.savedEnemies);
  assert.equal(migratedThreeTier[0].eventType, '旧テストカテゴリ');
  assert.equal(migratedThreeTier[0].series[0].seriesName, '旧テストイベント');
  assert.equal(migratedThreeTier[0].series[0].stages[0].bosses[0].name, '旧テスト敵');
});

test('会心上書きfixtureは現在の名前キー形式を記録する', async () => {
  const overrides = await readFixture('critical-overrides.json');
  const entries = Object.entries(overrides);
  assert.equal(entries.length, 1);
  assert.match(entries[0][0], /_/);
  assert.deepEqual(entries[0][1], { critAtkUp: 30, critDefDown: 70 });
});

test('保存fixtureに認証情報らしいキーや値を含めない', async () => {
  const names = (await readdir(fixtureDirectory)).filter((name) => name.endsWith('.json'));
  const forbiddenKey = /(?:^|[_-])(token|pat|secret|password|cookie|authorization|api[_-]?key|private[_-]?key)(?:$|[_-])/i;
  const forbiddenValue = /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{12,})/;

  for (const name of names) {
    const fixture = await readFixture(name);
    visitJson(fixture, (value, path, isKey = false) => {
      if (isKey && forbiddenKey.test(value)) assert.fail(`${name} の ${path} に秘密情報用のキーがあります。`);
      if (!isKey && typeof value === 'string' && forbiddenValue.test(value)) assert.fail(`${name} の ${path} に認証情報らしい値があります。`);
    });
  }
});
