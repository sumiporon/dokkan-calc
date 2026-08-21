import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  cachedStageSignature,
  classifyCachedEvent,
  legacyStageSignature,
  parseCachedStageHtml
} from '../helpers/cached-enemy-source.mjs';

const CACHE_DIR = new URL('../../scraper/html_cache/', import.meta.url);

async function parse(file, metadata = {}) {
  const html = await readFile(new URL(file, CACHE_DIR), 'utf8');
  return parseCachedStageHtml(html, {
    eventId: 0,
    eventTitle: '-',
    eventType: '-',
    seriesName: '-',
    stageId: 0,
    sourceFile: file,
    ...metadata
  });
}

test('saved event titles retain the legacy event/series classification', () => {
  assert.deepEqual(classifyCachedEvent('究極のレッドゾーン 劇場版'), {
    eventType: 'レッドゾーン',
    seriesName: '劇場版'
  });
  assert.deepEqual(classifyCachedEvent('至上のバトルスペクタクル'), {
    eventType: 'バトルスペクタクル',
    seriesName: '-'
  });
});

test('enemy rows preserve encounter order, IDs, stats, skills, and rendered AI actions', async () => {
  const stage = await parse('stage_701_7010105.html', { eventId: 701, stageId: 7010105 });

  assert.equal(stage.stageName, '超激戦BOSSラッシュ10');
  assert.deepEqual(stage.groups.map((group) => group.enemyCount), [4, 4, 4, 4, 5]);
  assert.equal(stage.enemies.length, 21);
  assert.equal(stage.orphanTypeIcons, 0);
  assert.deepEqual(
    {
      name: stage.enemies[0].name,
      cardId: stage.enemies[0].cardId,
      class: stage.enemies[0].class,
      type: stage.enemies[0].type,
      atk: stage.enemies[0].atk,
      def: stage.enemies[0].def,
      superAttackDamage: stage.enemies[0].superAttack.damage
    },
    {
      name: '孫悟空(GT)',
      cardId: 1014481,
      class: 'super',
      type: 'str',
      atk: 47590,
      def: 5900,
      superAttackDamage: 118975
    }
  );
  assert.equal(stage.groups.at(-1).actions.length, 18);
  assert.ok(stage.enemies.at(-1).skills.every((skill) => Number.isInteger(skill.id)));
});

test('slot-qualified actions and neutral 0x type icons are represented explicitly', async () => {
  const [actionStage, neutralStage, areaDamageStage] = await Promise.all([
    parse('stage_1701_17010065.html'),
    parse('stage_711_7110011.html'),
    parse('stage_1702_17020095.html')
  ]);
  const actions = actionStage.groups.flatMap((group) => group.actions);

  assert.ok(actions.some((action) => action.order === 1 && action.slot === 0 && action.type === '必殺技'));
  assert.ok(actions.some((action) => action.conditionExpression === '[3 = ?]'));
  assert.equal(neutralStage.enemies[0].class, 'neutral');
  assert.equal(neutralStage.enemies[0].typeIconId, 0);
  assert.equal(neutralStage.enemies[0].atk, 1);
  assert.deepEqual(areaDamageStage.groups[0].areaDamage, {
    maxPerTurn: 3,
    firstTargetDamage: 1_400_000,
    additionalTargetDamage: 700_000
  });
});

test('a representative cached sequence exactly matches the corresponding legacy sequence', async () => {
  const [stage, legacyData] = await Promise.all([
    parse('stage_701_7010105.html'),
    readFile(new URL('../../scraper/all_enemies.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  const legacyStage = legacyData
    .find((event) => event.eventType === '超激戦BOSSラッシュ!!')
    .series.find((series) => series.seriesName === '-')
    .stages.find((entry) => entry.stageName === '超激戦BOSSラッシュ10');

  assert.equal(cachedStageSignature(stage), legacyStageSignature(legacyStage));
});
