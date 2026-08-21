const VALID_CLASSES = new Set(['super', 'extreme']);
const VALID_TYPES = new Set(['agl', 'teq', 'int', 'str', 'phy']);

const NUMBER_FIELDS = [
  'baseAtk',
  'saMulti',
  'saBuffMod',
  'aoeDamage',
  'turnAtkUpStartTurn',
  'turnAtkUp',
  'turnAtkMax',
  'hitAtkUp',
  'hitAtkMax',
  'hpAtkThreshold',
  'hpAtkUp',
  'critAtkUp',
  'critDefDown',
  'critHpThreshold',
  'critHpRate',
  'critTurnUp',
  'critTurnMax',
  'critFixedRate'
];

export const BOSS_REQUIRED_FIELDS = Object.freeze([
  'name',
  'class',
  'type',
  'attacks',
  ...NUMBER_FIELDS.slice(0, 4),
  'hasSaCrit',
  ...NUMBER_FIELDS.slice(4, 13),
  'appearEntries',
  ...NUMBER_FIELDS.slice(13),
  'isCriticalDefault'
]);

export const CURRENT_ENEMY_DATA_BASELINE = Object.freeze({
  counts: Object.freeze({
    eventTypes: 56,
    series: 73,
    stages: 647,
    bosses: 4245,
    attacks: 8899
  }),
  conditions: Object.freeze({
    saBuff: 409,
    turnAtk: 112,
    hitAtk: 52,
    hpAtk: 13,
    appearBosses: 38,
    appearEntries: 39,
    criticalBosses: 52,
    criticalAttacks: 52,
    aoeBosses: 0
  }),
  classes: Object.freeze({ super: 2004, extreme: 2241 }),
  types: Object.freeze({ agl: 840, teq: 827, int: 875, str: 857, phy: 846 })
});

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function addIssue(collection, code, message, path = '$', details = undefined) {
  collection.push({ code, message, path, ...(details === undefined ? {} : { details }) });
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function duplicateSummary(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const duplicates = [...groups.values()].filter((group) => group.length > 1);
  return {
    groups: duplicates.length,
    records: duplicates.reduce((total, group) => total + group.length, 0),
    extra: duplicates.reduce((total, group) => total + group.length - 1, 0),
    maxGroupSize: duplicates.length === 0 ? 0 : Math.max(...duplicates.map((group) => group.length)),
    samples: duplicates.slice(0, 5).map((group) => group.slice(0, 5).map((item) => item.path))
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkRequiredObjectField(report, object, field, expectedType, path) {
  if (!(field in object)) {
    addIssue(report.errors, 'MISSING_REQUIRED_FIELD', `必須項目 ${field} がありません。`, path);
    return false;
  }
  if (valueType(object[field]) !== expectedType) {
    addIssue(
      report.errors,
      'INVALID_FIELD_TYPE',
      `${field} は ${expectedType} である必要があります。`,
      `${path}.${field}`,
      { actual: valueType(object[field]) }
    );
    return false;
  }
  return true;
}

function compareAgainstBaseline(report, baseline) {
  if (!baseline) return;

  for (const [name, expected] of Object.entries(baseline.counts ?? {})) {
    const actual = report.stats.counts[name];
    const minimum = Math.ceil(expected * 0.95);
    if (actual < minimum) {
      addIssue(
        report.errors,
        'COUNT_DROP',
        `${name} が基準 ${expected} から ${actual} へ5%以上減少しています。`,
        '$',
        { name, expected, actual, minimum }
      );
    }
  }

  for (const [name, expected] of Object.entries(baseline.conditions ?? {})) {
    const actual = report.stats.conditions[name];
    if (actual < expected) {
      addIssue(
        report.errors,
        'CONDITION_COUNT_DROP',
        `${name} の条件件数が基準 ${expected} から ${actual} へ減少しています。`,
        '$',
        { name, expected, actual }
      );
    }
  }

  for (const [groupName, expectedValues] of [
    ['classes', baseline.classes],
    ['types', baseline.types]
  ]) {
    for (const [name, expected] of Object.entries(expectedValues ?? {})) {
      const actual = report.stats[groupName][name] ?? 0;
      const permittedChange = Math.max(10, Math.ceil(expected * 0.05));
      if (Math.abs(actual - expected) > permittedChange) {
        addIssue(
          report.warnings,
          'ATTRIBUTE_DISTRIBUTION_SHIFT',
          `${groupName}.${name} が基準から大きく変化しています。ID単位の確認が必要です。`,
          '$',
          { expected, actual, permittedChange }
        );
      }
    }
  }
}

export function extractEmbeddedEnemyPreset(source) {
  const assignment = 'const DEFAULT_ENEMIES_PRESET = ';
  const start = source.indexOf(assignment);
  if (start < 0) throw new Error('DEFAULT_ENEMIES_PRESET の開始位置が見つかりません。');

  const valueStart = start + assignment.length;
  const end = source.indexOf('// --- PRESET END ---', valueStart);
  if (end < 0) throw new Error('DEFAULT_ENEMIES_PRESET の終了位置が見つかりません。');

  const jsonText = source.slice(valueStart, end).trim().replace(/;\s*$/, '');
  return JSON.parse(jsonText);
}

export function auditEnemyData(data, { baseline = CURRENT_ENEMY_DATA_BASELINE } = {}) {
  const report = {
    errors: [],
    warnings: [],
    stats: {
      counts: { eventTypes: 0, series: 0, stages: 0, bosses: 0, attacks: 0 },
      classes: {},
      types: {},
      attackNames: {},
      conditions: {
        saBuff: 0,
        turnAtk: 0,
        hitAtk: 0,
        hpAtk: 0,
        appearBosses: 0,
        appearEntries: 0,
        criticalBosses: 0,
        criticalAttacks: 0,
        aoeBosses: 0
      },
      identifierCoverage: { eventId: 0, stageId: 0, enemyId: 0, enemyDef: 0 },
      numericRanges: {
        baseAtk: { min: Infinity, max: -Infinity },
        attackValue: { min: Infinity, max: -Infinity },
        saMulti: { min: Infinity, max: -Infinity }
      },
      outliers: {
        saMultiAbove10: 0,
        saMultiAbove100: 0,
        turnMaximumNotDivisible: 0,
        hitMaximumNotDivisible: 0
      },
      duplicates: {}
    }
  };

  if (!Array.isArray(data)) {
    addIssue(report.errors, 'INVALID_ROOT', '敵データのルートは配列である必要があります。');
    return report;
  }

  const events = [];
  const seriesRecords = [];
  const stages = [];
  const bosses = [];
  const eventIds = [];
  const stageIds = [];
  const enemyIdsWithinStage = [];

  for (const [eventIndex, event] of data.entries()) {
    const eventPath = `$[${eventIndex}]`;
    report.stats.counts.eventTypes++;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      addIssue(report.errors, 'INVALID_EVENT', 'イベント種別はオブジェクトである必要があります。', eventPath);
      continue;
    }

    events.push({ value: event, path: eventPath, physicalParent: '$' });
    if (!checkRequiredObjectField(report, event, 'eventType', 'string', eventPath)) continue;
    if (!isNonEmptyString(event.eventType)) {
      addIssue(report.errors, 'EMPTY_NAME', 'eventType は空にできません。', `${eventPath}.eventType`);
    }
    if ('eventId' in event) {
      report.stats.identifierCoverage.eventId++;
      const id = event.eventId;
      if (!((typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && Number.isFinite(id)))) {
        addIssue(report.errors, 'INVALID_EVENT_ID', 'eventId は空でない文字列または有限の数値である必要があります。', `${eventPath}.eventId`);
      } else {
        eventIds.push({ id: String(id), path: `${eventPath}.eventId` });
      }
    }
    if (!checkRequiredObjectField(report, event, 'series', 'array', eventPath)) continue;
    if (event.series.length === 0) {
      addIssue(report.errors, 'EMPTY_COLLECTION', 'series は1件以上必要です。', `${eventPath}.series`);
    }

    for (const [seriesIndex, series] of event.series.entries()) {
      const seriesPath = `${eventPath}.series[${seriesIndex}]`;
      report.stats.counts.series++;
      if (!series || typeof series !== 'object' || Array.isArray(series)) {
        addIssue(report.errors, 'INVALID_SERIES', 'シリーズはオブジェクトである必要があります。', seriesPath);
        continue;
      }

      seriesRecords.push({
        value: series,
        path: seriesPath,
        physicalParent: eventPath,
        humanParent: event.eventType
      });
      if (!checkRequiredObjectField(report, series, 'seriesName', 'string', seriesPath)) continue;
      if (!isNonEmptyString(series.seriesName)) {
        addIssue(report.errors, 'EMPTY_NAME', 'seriesName は空にできません。', `${seriesPath}.seriesName`);
      }
      if (!checkRequiredObjectField(report, series, 'stages', 'array', seriesPath)) continue;
      if (series.stages.length === 0) {
        addIssue(report.errors, 'EMPTY_COLLECTION', 'stages は1件以上必要です。', `${seriesPath}.stages`);
      }

      for (const [stageIndex, stage] of series.stages.entries()) {
        const stagePath = `${seriesPath}.stages[${stageIndex}]`;
        report.stats.counts.stages++;
        if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
          addIssue(report.errors, 'INVALID_STAGE', 'ステージはオブジェクトである必要があります。', stagePath);
          continue;
        }

        stages.push({
          value: stage,
          path: stagePath,
          physicalParent: seriesPath,
          humanParent: `${event.eventType}\u0000${series.seriesName}`
        });
        if (!checkRequiredObjectField(report, stage, 'stageName', 'string', stagePath)) continue;
        if (!isNonEmptyString(stage.stageName)) {
          addIssue(report.errors, 'EMPTY_NAME', 'stageName は空にできません。', `${stagePath}.stageName`);
        }
        if ('stageId' in stage) {
          report.stats.identifierCoverage.stageId++;
          const id = stage.stageId;
          if (!((typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && Number.isFinite(id)))) {
            addIssue(report.errors, 'INVALID_STAGE_ID', 'stageId は空でない文字列または有限の数値である必要があります。', `${stagePath}.stageId`);
          } else {
            stageIds.push({ id: String(id), path: `${stagePath}.stageId` });
          }
        }
        if (!checkRequiredObjectField(report, stage, 'bosses', 'array', stagePath)) continue;
        if (stage.bosses.length === 0) {
          addIssue(report.errors, 'EMPTY_COLLECTION', 'bosses は1件以上必要です。', `${stagePath}.bosses`);
        }

        for (const [bossIndex, boss] of stage.bosses.entries()) {
          const bossPath = `${stagePath}.bosses[${bossIndex}]`;
          report.stats.counts.bosses++;
          if (!boss || typeof boss !== 'object' || Array.isArray(boss)) {
            addIssue(report.errors, 'INVALID_BOSS', 'ボスはオブジェクトである必要があります。', bossPath);
            continue;
          }

          bosses.push({
            value: boss,
            path: bossPath,
            physicalParent: stagePath,
            humanPath: `${event.eventType}\u0000${series.seriesName}\u0000${stage.stageName}\u0000${boss.name ?? ''}`
          });

          const expectedTypes = {
            name: 'string',
            class: 'string',
            type: 'string',
            attacks: 'array',
            hasSaCrit: 'boolean',
            appearEntries: 'array',
            isCriticalDefault: 'boolean'
          };
          for (const field of NUMBER_FIELDS) expectedTypes[field] = 'number';
          for (const field of BOSS_REQUIRED_FIELDS) {
            checkRequiredObjectField(report, boss, field, expectedTypes[field], bossPath);
          }

          if (typeof boss.name === 'string' && !isNonEmptyString(boss.name)) {
            addIssue(report.errors, 'EMPTY_NAME', 'ボス名は空にできません。', `${bossPath}.name`);
          }
          if (typeof boss.class === 'string') {
            increment(report.stats.classes, boss.class);
            if (!VALID_CLASSES.has(boss.class)) {
              addIssue(report.errors, 'INVALID_CLASS', `未知の超／極区分です: ${boss.class}`, `${bossPath}.class`);
            }
          }
          if (typeof boss.type === 'string') {
            increment(report.stats.types, boss.type);
            if (!VALID_TYPES.has(boss.type)) {
              addIssue(report.errors, 'INVALID_TYPE', `未知の属性です: ${boss.type}`, `${bossPath}.type`);
            }
          }

          for (const field of NUMBER_FIELDS) {
            const value = boss[field];
            if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
              addIssue(report.errors, 'INVALID_NUMBER', `${field} は有限の0以上である必要があります。`, `${bossPath}.${field}`);
            }
          }
          if (typeof boss.baseAtk === 'number' && boss.baseAtk <= 0) {
            addIssue(report.errors, 'INVALID_BASE_ATK', 'baseAtk は0より大きい必要があります。', `${bossPath}.baseAtk`);
          }
          if (typeof boss.saMulti === 'number' && boss.saMulti <= 0) {
            addIssue(report.errors, 'INVALID_SA_MULTIPLIER', 'saMulti は0より大きい必要があります。', `${bossPath}.saMulti`);
          }
          if (typeof boss.turnAtkUpStartTurn === 'number' && (!Number.isInteger(boss.turnAtkUpStartTurn) || boss.turnAtkUpStartTurn < 1)) {
            addIssue(report.errors, 'INVALID_START_TURN', 'turnAtkUpStartTurn は1以上の整数である必要があります。', `${bossPath}.turnAtkUpStartTurn`);
          }

          if ('enemyId' in boss) {
            report.stats.identifierCoverage.enemyId++;
            const id = boss.enemyId;
            if (!((typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && Number.isFinite(id)))) {
              addIssue(report.errors, 'INVALID_ENEMY_ID', 'enemyId は空でない文字列または有限の数値である必要があります。', `${bossPath}.enemyId`);
            } else {
              enemyIdsWithinStage.push({ id: String(id), stagePath, path: `${bossPath}.enemyId` });
            }
          }
          if ('def' in boss || 'enemyDef' in boss) report.stats.identifierCoverage.enemyDef++;

          if (Number.isFinite(boss.baseAtk)) {
            report.stats.numericRanges.baseAtk.min = Math.min(report.stats.numericRanges.baseAtk.min, boss.baseAtk);
            report.stats.numericRanges.baseAtk.max = Math.max(report.stats.numericRanges.baseAtk.max, boss.baseAtk);
          }
          if (Number.isFinite(boss.saMulti)) {
            report.stats.numericRanges.saMulti.min = Math.min(report.stats.numericRanges.saMulti.min, boss.saMulti);
            report.stats.numericRanges.saMulti.max = Math.max(report.stats.numericRanges.saMulti.max, boss.saMulti);
            if (boss.saMulti > 10) report.stats.outliers.saMultiAbove10++;
            if (boss.saMulti > 100) report.stats.outliers.saMultiAbove100++;
          }

          if (boss.saBuffMod > 0) report.stats.conditions.saBuff++;
          if (boss.turnAtkUp > 0 || boss.turnAtkMax > 0 || boss.turnAtkUpStartTurn !== 1) report.stats.conditions.turnAtk++;
          if (boss.hitAtkUp > 0 || boss.hitAtkMax > 0) report.stats.conditions.hitAtk++;
          if (boss.hpAtkThreshold > 0 || boss.hpAtkUp > 0) report.stats.conditions.hpAtk++;
          if (Array.isArray(boss.appearEntries) && boss.appearEntries.length > 0) report.stats.conditions.appearBosses++;
          if (Array.isArray(boss.appearEntries)) report.stats.conditions.appearEntries += boss.appearEntries.length;
          if (boss.aoeDamage > 0) report.stats.conditions.aoeBosses++;

          const hasCriticalContext = Boolean(
            boss.hasSaCrit ||
            boss.isCriticalDefault ||
            boss.critAtkUp ||
            boss.critDefDown ||
            boss.critHpThreshold ||
            boss.critHpRate ||
            boss.critTurnUp ||
            boss.critTurnMax ||
            boss.critFixedRate
          );
          if (hasCriticalContext) report.stats.conditions.criticalBosses++;

          const pairedConditions = [
            ['turnAtkUp', 'turnAtkMax'],
            ['hitAtkUp', 'hitAtkMax'],
            ['hpAtkThreshold', 'hpAtkUp'],
            ['critHpThreshold', 'critHpRate'],
            ['critTurnUp', 'critTurnMax']
          ];
          for (const [left, right] of pairedConditions) {
            if ((boss[left] > 0) !== (boss[right] > 0)) {
              addIssue(report.errors, 'INCOMPLETE_CONDITION_PAIR', `${left} と ${right} の片方だけが設定されています。`, bossPath);
            }
          }

          if (boss.turnAtkUp > 0 && boss.turnAtkMax % boss.turnAtkUp !== 0) {
            report.stats.outliers.turnMaximumNotDivisible++;
          }
          if (boss.hitAtkUp > 0 && boss.hitAtkMax % boss.hitAtkUp !== 0) {
            report.stats.outliers.hitMaximumNotDivisible++;
          }

          if (Array.isArray(boss.appearEntries)) {
            let previousTurn = 0;
            let previousCumulative = 0;
            for (const [entryIndex, entry] of boss.appearEntries.entries()) {
              const entryPath = `${bossPath}.appearEntries[${entryIndex}]`;
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                addIssue(report.errors, 'INVALID_APPEAR_ENTRY', '登場条件はオブジェクトである必要があります。', entryPath);
                continue;
              }
              if (!Number.isInteger(entry.turn) || entry.turn < 1) {
                addIssue(report.errors, 'INVALID_APPEAR_TURN', 'turn は1以上の整数である必要があります。', `${entryPath}.turn`);
              }
              if (typeof entry.cumulativeAtkUp !== 'number' || !Number.isFinite(entry.cumulativeAtkUp) || entry.cumulativeAtkUp < 0) {
                addIssue(report.errors, 'INVALID_APPEAR_BONUS', 'cumulativeAtkUp は有限の0以上である必要があります。', `${entryPath}.cumulativeAtkUp`);
              }
              if (entry.turn <= previousTurn || entry.cumulativeAtkUp < previousCumulative) {
                addIssue(report.errors, 'UNSORTED_APPEAR_ENTRIES', '登場条件はターン昇順・累積値非減少である必要があります。', entryPath);
              }
              previousTurn = entry.turn;
              previousCumulative = entry.cumulativeAtkUp;
            }
          }

          if (!Array.isArray(boss.attacks)) continue;
          if (boss.attacks.length === 0) {
            addIssue(report.errors, 'EMPTY_COLLECTION', 'attacks は1件以上必要です。', `${bossPath}.attacks`);
          }

          for (const [attackIndex, attack] of boss.attacks.entries()) {
            const attackPath = `${bossPath}.attacks[${attackIndex}]`;
            report.stats.counts.attacks++;
            if (!attack || typeof attack !== 'object' || Array.isArray(attack)) {
              addIssue(report.errors, 'INVALID_ATTACK', '攻撃はオブジェクトである必要があります。', attackPath);
              continue;
            }
            if (!isNonEmptyString(attack.name)) {
              addIssue(report.errors, 'INVALID_ATTACK_NAME', '攻撃名は空でない文字列である必要があります。', `${attackPath}.name`);
            } else {
              increment(report.stats.attackNames, attack.name);
            }
            if (typeof attack.value !== 'number' || !Number.isFinite(attack.value) || attack.value < 0 || !Number.isInteger(attack.value)) {
              addIssue(report.errors, 'INVALID_ATTACK_VALUE', '攻撃値は0以上の有限な整数である必要があります。', `${attackPath}.value`);
            } else {
              report.stats.numericRanges.attackValue.min = Math.min(report.stats.numericRanges.attackValue.min, attack.value);
              report.stats.numericRanges.attackValue.max = Math.max(report.stats.numericRanges.attackValue.max, attack.value);
            }
            if ('isCrit' in attack && typeof attack.isCrit !== 'boolean') {
              addIssue(report.errors, 'INVALID_CRIT_FLAG', 'isCrit はbooleanである必要があります。', `${attackPath}.isCrit`);
            }
            if (attack.isCrit === true) report.stats.conditions.criticalAttacks++;
          }

          const normal = boss.attacks.find((attack) => attack?.name === '通常');
          const superAttack = boss.attacks.find((attack) => attack?.name?.startsWith('必殺'));
          const postSuperNormal = boss.attacks.find((attack) => attack?.name === '通常(必殺後)');
          if (!normal) {
            addIssue(report.errors, 'MISSING_NORMAL_ATTACK', '通常攻撃がありません。', `${bossPath}.attacks`);
          } else if (Number.isFinite(boss.baseAtk) && normal.value !== boss.baseAtk) {
            addIssue(report.errors, 'BASE_ATK_MISMATCH', '通常攻撃値とbaseAtkが一致しません。', `${bossPath}.attacks`);
          }
          if (!superAttack) {
            addIssue(report.errors, 'MISSING_SUPER_ATTACK', '必殺攻撃がありません。', `${bossPath}.attacks`);
          } else if (Number.isFinite(boss.baseAtk) && Number.isFinite(boss.saMulti) && Number.isFinite(boss.saBuffMod)) {
            const expected = Math.floor(boss.baseAtk * (boss.saMulti + boss.saBuffMod));
            if (superAttack.value !== expected) {
              addIssue(report.errors, 'SUPER_ATTACK_MISMATCH', '必殺値がbaseAtk・saMulti・saBuffModから得られる値と一致しません。', `${bossPath}.attacks`, { expected, actual: superAttack.value });
            }
          }
          if (boss.saBuffMod > 0) {
            const expected = Math.floor(boss.baseAtk * (1 + boss.saBuffMod));
            if (!postSuperNormal || postSuperNormal.value !== expected) {
              addIssue(report.errors, 'POST_SUPER_ATTACK_MISMATCH', '必殺後通常攻撃の値が一致しません。', `${bossPath}.attacks`, { expected, actual: postSuperNormal?.value });
            }
          }

          const criticalAttacks = boss.attacks.filter((attack) => attack?.isCrit === true);
          if (boss.hasSaCrit === true && criticalAttacks.length === 0) {
            addIssue(report.errors, 'MISSING_CRITICAL_ATTACK', 'hasSaCrit=trueですが会心攻撃がありません。', bossPath);
          }
          if (boss.hasSaCrit === false && criticalAttacks.length > 0) {
            addIssue(report.errors, 'UNEXPECTED_CRITICAL_ATTACK', 'hasSaCrit=falseですが会心攻撃があります。', bossPath);
          }
        }
      }
    }
  }

  report.stats.duplicates = {
    eventTypeNames: duplicateSummary(events, ({ value }) => value.eventType),
    seriesNamesWithinEvent: duplicateSummary(seriesRecords, (item) => `${item.physicalParent}\u0000${item.value.seriesName}`),
    stageNamesWithinSeries: duplicateSummary(stages, (item) => `${item.physicalParent}\u0000${item.value.stageName}`),
    exactStagesWithinSeries: duplicateSummary(stages, (item) => `${item.physicalParent}\u0000${JSON.stringify(item.value)}`),
    bossNamesWithinStage: duplicateSummary(bosses, (item) => `${item.physicalParent}\u0000${item.value.name}`),
    exactBossesWithinStage: duplicateSummary(bosses, (item) => `${item.physicalParent}\u0000${JSON.stringify(item.value)}`),
    humanBossPaths: duplicateSummary(bosses, (item) => item.humanPath),
    enemyIdsWithinStage: duplicateSummary(enemyIdsWithinStage, (item) => `${item.stagePath}\u0000${item.id}`)
  };

  const duplicateEventIds = duplicateSummary(eventIds, ({ id }) => id);
  const duplicateStageIds = duplicateSummary(stageIds, ({ id }) => id);
  if (duplicateEventIds.groups > 0) {
    addIssue(report.errors, 'DUPLICATE_EVENT_ID', 'eventId が重複しています。', '$', duplicateEventIds);
  }
  if (duplicateStageIds.groups > 0) {
    addIssue(report.errors, 'DUPLICATE_STAGE_ID', 'stageId が重複しています。', '$', duplicateStageIds);
  }
  if (report.stats.duplicates.enemyIdsWithinStage.groups > 0) {
    addIssue(
      report.warnings,
      'DUPLICATE_ENEMY_ID_WITHIN_STAGE',
      '同一ステージ内でenemyIdが重複しています。正当な複数体か、phase/order欠落かを確認してください。',
      '$',
      report.stats.duplicates.enemyIdsWithinStage
    );
  }

  const idCoverage = report.stats.identifierCoverage;
  if (idCoverage.eventId === 0) addIssue(report.warnings, 'KNOWN_MISSING_EVENT_IDS', '現行形式にはeventIdがありません。', '$');
  else if (idCoverage.eventId !== report.stats.counts.eventTypes) addIssue(report.warnings, 'PARTIAL_EVENT_ID_COVERAGE', 'eventIdが一部のイベントにしかありません。', '$', idCoverage);
  if (idCoverage.stageId === 0) addIssue(report.warnings, 'KNOWN_MISSING_STAGE_IDS', '現行形式にはstageIdがありません。', '$');
  else if (idCoverage.stageId !== report.stats.counts.stages) addIssue(report.warnings, 'PARTIAL_STAGE_ID_COVERAGE', 'stageIdが一部のステージにしかありません。', '$', idCoverage);
  if (idCoverage.enemyId === 0) addIssue(report.warnings, 'KNOWN_MISSING_ENEMY_IDS', '現行形式にはenemyIdがありません。', '$');
  else if (idCoverage.enemyId !== report.stats.counts.bosses) addIssue(report.warnings, 'PARTIAL_ENEMY_ID_COVERAGE', 'enemyIdが一部の敵にしかありません。', '$', idCoverage);
  if (idCoverage.enemyDef === 0) addIssue(report.warnings, 'KNOWN_MISSING_ENEMY_DEF', '現行形式には敵DEFがありません。', '$');
  else if (idCoverage.enemyDef !== report.stats.counts.bosses) addIssue(report.warnings, 'PARTIAL_ENEMY_DEF_COVERAGE', '敵DEFが一部の敵にしかありません。', '$', idCoverage);

  if (report.stats.duplicates.stageNamesWithinSeries.groups > 0) {
    addIssue(report.warnings, 'DUPLICATE_STAGE_NAMES', '同一シリーズ内に同名ステージがあります。IDなしで自動統合しないでください。', '$', report.stats.duplicates.stageNamesWithinSeries);
  }
  if (report.stats.duplicates.exactStagesWithinSeries.groups > 0) {
    addIssue(report.warnings, 'EXACT_DUPLICATE_STAGES', '内容が完全一致するステージがあります。ID・難易度を確認するまで削除しないでください。', '$', report.stats.duplicates.exactStagesWithinSeries);
  }
  if (report.stats.duplicates.bossNamesWithinStage.groups > 0) {
    addIssue(report.warnings, 'DUPLICATE_BOSS_NAMES', '同一ステージ内に同名ボスがあります。複数体・複数フェーズの可能性があります。', '$', report.stats.duplicates.bossNamesWithinStage);
  }
  if (report.stats.duplicates.exactBossesWithinStage.groups > 0) {
    addIssue(report.warnings, 'EXACT_DUPLICATE_BOSSES', '同一ステージ内に内容が完全一致する敵があります。自動削除はしないでください。', '$', report.stats.duplicates.exactBossesWithinStage);
  }
  if (report.stats.duplicates.humanBossPaths.groups > 0) {
    addIssue(report.warnings, 'NON_UNIQUE_HUMAN_BOSS_PATHS', '名前4階層だけでは敵を一意に識別できません。', '$', report.stats.duplicates.humanBossPaths);
  }
  if (report.stats.conditions.aoeBosses === 0) {
    addIssue(report.warnings, 'KNOWN_EMPTY_AOE_DATA', 'aoeDamageが全件0です。既存キャッシュにはエリアダメージ表記があります。', '$');
  }
  if (report.stats.conditions.criticalBosses > 0 && bosses.every(({ value }) => value.critAtkUp === 0 && value.critDefDown === 0)) {
    addIssue(report.warnings, 'KNOWN_EMPTY_CRITICAL_EFFECTS', '会心対象はありますがcritAtkUp/critDefDownが全件0です。', '$');
  }
  if (report.stats.outliers.saMultiAbove10 > 0) {
    addIssue(report.warnings, 'SA_MULTIPLIER_OUTLIERS', 'saMultiが10を超える敵があります。原文に存在する値もあるため、自動拒否せず個別確認してください。', '$', report.stats.outliers);
  }
  if (report.stats.outliers.turnMaximumNotDivisible > 0 || report.stats.outliers.hitMaximumNotDivisible > 0) {
    addIssue(report.warnings, 'NON_DIVISIBLE_CONDITION_MAXIMUM', '増加量で最大値を割り切れない条件があります。現行UIでは最大値を選べない可能性があります。', '$', report.stats.outliers);
  }

  compareAgainstBaseline(report, baseline);

  for (const range of Object.values(report.stats.numericRanges)) {
    if (range.min === Infinity) range.min = null;
    if (range.max === -Infinity) range.max = null;
  }

  return report;
}

export function formatEnemyDataAudit(report) {
  const { counts, conditions, identifierCoverage, duplicates, numericRanges, outliers } = report.stats;
  const lines = [
    '敵データ監査',
    `結果: ${report.errors.length === 0 ? '成功' : '失敗'}（エラー ${report.errors.length} / 警告 ${report.warnings.length}）`,
    `件数: 種別 ${counts.eventTypes}, シリーズ ${counts.series}, ステージ ${counts.stages}, ボス ${counts.bosses}, 攻撃 ${counts.attacks}`,
    `条件: 必殺後 ${conditions.saBuff}, ターン ${conditions.turnAtk}, 被弾 ${conditions.hitAtk}, HP ${conditions.hpAtk}, 登場 ${conditions.appearBosses}/${conditions.appearEntries}, 会心 ${conditions.criticalBosses}, 範囲 ${conditions.aoeBosses}`,
    `ID/DEF: eventId ${identifierCoverage.eventId}, stageId ${identifierCoverage.stageId}, enemyId ${identifierCoverage.enemyId}, DEF ${identifierCoverage.enemyDef}`,
    `数値範囲: baseAtk ${numericRanges.baseAtk.min}..${numericRanges.baseAtk.max}, saMulti ${numericRanges.saMulti.min}..${numericRanges.saMulti.max}, attack ${numericRanges.attackValue.min}..${numericRanges.attackValue.max}`,
    `重複警告対象: 同名ステージ ${duplicates.stageNamesWithinSeries?.groups ?? 0}群, 完全同一ステージ ${duplicates.exactStagesWithinSeries?.groups ?? 0}群, 同名ボス ${duplicates.bossNamesWithinStage?.groups ?? 0}群, 完全同一ボス ${duplicates.exactBossesWithinStage?.groups ?? 0}群`,
    `外れ値: saMulti>10 ${outliers.saMultiAbove10}, saMulti>100 ${outliers.saMultiAbove100}, ターン最大非整除 ${outliers.turnMaximumNotDivisible}, 被弾最大非整除 ${outliers.hitMaximumNotDivisible}`
  ];

  if (report.errors.length > 0) {
    lines.push('', 'エラー:');
    for (const issue of report.errors.slice(0, 30)) lines.push(`- [${issue.code}] ${issue.path}: ${issue.message}`);
    if (report.errors.length > 30) lines.push(`- ほか ${report.errors.length - 30}件`);
  }
  if (report.warnings.length > 0) {
    lines.push('', '既知の警告:');
    for (const issue of report.warnings) lines.push(`- [${issue.code}] ${issue.message}`);
  }
  return lines.join('\n');
}
