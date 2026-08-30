import { createHash } from 'node:crypto';

export const LEGACY_PRODUCTION_GENERATED_AT = '2026-08-30T00:00:00.000Z';
export const LEGACY_PRODUCTION_SOURCE_PATH = 'scraper/all_enemies.json';

const known = (value) => ({ state: 'known', value });
const unknown = () => ({ state: 'unknown', value: null });

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function stableId(kind, parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 20);
  return `legacy-production:${kind}:${digest}`;
}

function semanticOccurrences(items, semanticParts) {
  const seen = new Map();
  return items.map((item) => {
    const parts = semanticParts(item);
    const key = JSON.stringify(parts);
    const duplicateOrdinal = seen.get(key) ?? 0;
    seen.set(key, duplicateOrdinal + 1);
    return { parts, duplicateOrdinal };
  });
}

function effect({ id, kind, value, start = null, end = null, hpMin = null, hpMax = null, cap = null, bracket = 'start-of-turn', appliesTo = 'enemy-stats', target = 'attack', durationTurns = null }) {
  return {
    id,
    trigger: {
      kind,
      start: start == null ? unknown() : known(start),
      end: end == null ? unknown() : known(end),
      hpMinPercent: hpMin == null ? unknown() : known(hpMin),
      hpMaxPercent: hpMax == null ? unknown() : known(hpMax)
    },
    appliesTo,
    target,
    operation: 'add-percent',
    value: known(value),
    cap: cap == null ? unknown() : known(cap),
    durationTurns: durationTurns == null ? unknown() : known(durationTurns),
    bracket
  };
}

function criticalRules(boss, enemyId) {
  const rules = [];
  if (boss.critHpRate > 0) {
    rules.push(effect({
      id: `${enemyId}:critical:hp`, kind: 'hp-range', value: boss.critHpRate,
      hpMin: 0, hpMax: boss.critHpThreshold, target: 'critical-rate'
    }));
  }
  if (boss.critTurnUp > 0) {
    rules.push(effect({
      id: `${enemyId}:critical:turn`, kind: 'elapsed-turn', value: boss.critTurnUp,
      start: 1, cap: boss.critTurnMax, target: 'critical-rate'
    }));
  }
  if (boss.critFixedRate > 0) {
    rules.push(effect({
      id: `${enemyId}:critical:fixed`, kind: 'always', value: boss.critFixedRate,
      target: 'critical-rate'
    }));
  }
  return rules;
}

function runtimeCritical(boss, enemyId) {
  return {
    enabled: known(Boolean(boss.isCriticalDefault)),
    attackMultiplier: known(1 + Number(boss.critAtkUp || 0) / 100),
    defenseIgnorePercent: known(Number(boss.critDefDown || 0)),
    rateRules: criticalRules(boss, enemyId)
  };
}

function passiveEffects(boss, enemyId) {
  const effects = [];
  if (boss.turnAtkUp > 0 && boss.turnAtkMax > 0) {
    effects.push(effect({
      id: `${enemyId}:attack:turn`, kind: 'elapsed-turn', value: boss.turnAtkUp,
      start: boss.turnAtkUpStartTurn, cap: boss.turnAtkMax
    }));
  }
  if (boss.hitAtkUp > 0 && boss.hitAtkMax > 0) {
    effects.push(effect({
      id: `${enemyId}:attack:hit`, kind: 'received-hit-count', value: boss.hitAtkUp,
      start: 1, cap: boss.hitAtkMax, bracket: 'mid-battle'
    }));
  }
  if (boss.hpAtkUp > 0) {
    effects.push(effect({
      id: `${enemyId}:attack:hp`, kind: 'hp-range', value: boss.hpAtkUp,
      hpMin: 0, hpMax: boss.hpAtkThreshold
    }));
  }
  let previous = 0;
  const appearances = semanticOccurrences(boss.appearEntries, (entry) => [entry.turn]);
  boss.appearEntries.forEach((entry, index) => {
    const increment = entry.cumulativeAtkUp - previous;
    effects.push(effect({
      id: stableId('appearance-effect', [enemyId, entry.turn, appearances[index].duplicateOrdinal]), kind: 'appearance-turn',
      value: increment, start: entry.turn
    }));
    previous = entry.cumulativeAtkUp;
  });
  return effects;
}

function postSuperEffect(boss, attackId) {
  if (!(boss.saBuffMod > 0)) return [];
  return [effect({
    id: `${attackId}:post-super`, kind: 'after-super', value: boss.saBuffMod * 100,
    bracket: 'post-super', appliesTo: 'subsequent-normal-attacks', durationTurns: 1
  })];
}

function superAttacks(boss, enemyId, checks) {
  const attacks = boss.attacks.filter((attack) => attack.name === '必殺' || attack.name === '必殺[会心]');
  const occurrences = semanticOccurrences(attacks, () => ['super']);
  const expectedDamage = Math.floor(boss.baseAtk * (boss.saMulti + boss.saBuffMod));
  for (const attack of attacks) {
    checks.superAttacks += 1;
    if (attack.value !== expectedDamage) {
      throw new Error(`Legacy Super mismatch for ${boss.name}: stored=${attack.value}, expected=${expectedDamage}`);
    }
  }
  return attacks.map((attack, index) => {
    const attackId = stableId('super-attack', [enemyId, 'super', occurrences[index].duplicateOrdinal]);
    const critical = Boolean(attack.isCrit || attack.name.includes('[会心]') || boss.hasSaCrit);
    return {
      id: attackId,
      name: known(critical ? '必殺攻撃（会心）' : '必殺攻撃'),
      displayedDamage: known(attack.value),
      derivedMultiplier: known(boss.saMulti + boss.saBuffMod),
      probabilityPercent: unknown(),
      maxPerTurn: unknown(),
      cooldownTurns: unknown(),
      slot: unknown(),
      usageRules: [],
      targetMode: known('single'),
      effects: postSuperEffect(boss, attackId),
      criticalOverride: critical ? known(runtimeCritical(boss, enemyId)) : unknown()
    };
  });
}

function areaAttacks(boss, enemyId) {
  if (!(boss.aoeDamage > 0)) return [];
  return [{
    id: stableId('area-attack', [enemyId, 'legacy-aoe']),
    sourceEnemyId: known(enemyId),
    attackKind: known('normal'),
    maxPerTurn: unknown(),
    firstTargetDamage: known(boss.aoeDamage),
    additionalTargetDamage: unknown(),
    firstTargetMultiplier: known(boss.aoeDamage / boss.baseAtk),
    additionalTargetMultiplier: unknown(),
    targetMode: known('all')
  }];
}

function duplicateAwareLabels(items, baseLabel) {
  const totals = new Map();
  for (const item of items) {
    const label = baseLabel(item);
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  const seen = new Map();
  return items.map((item) => {
    const label = baseLabel(item);
    const ordinal = (seen.get(label) ?? 0) + 1;
    seen.set(label, ordinal);
    return totals.get(label) > 1 ? `${label}（${ordinal}）` : label;
  });
}

function runtimeEnemy(boss, pathParts, orderInEncounter, displayName, checks) {
  const enemyId = stableId('enemy', pathParts);
  const normal = boss.attacks.find((attack) => attack.name === '通常');
  if (!normal || normal.value !== boss.baseAtk) {
    throw new Error(`Legacy normal mismatch for ${boss.name}`);
  }
  checks.normalAttacks += 1;
  const postSuper = boss.attacks.find((attack) => attack.name === '通常(必殺後)');
  const expectedPostSuper = boss.saBuffMod > 0
    ? Math.floor(boss.baseAtk * (1 + boss.saBuffMod))
    : null;
  if ((postSuper?.value ?? null) !== expectedPostSuper) {
    throw new Error(`Legacy post-Super mismatch for ${boss.name}`);
  }
  if (postSuper) checks.postSuperAttacks += 1;
  const enemy = {
    id: enemyId,
    orderInEncounter,
    role: known('combat'),
    name: known(displayName),
    type: known(boss.type),
    alignment: known(boss.class),
    baseAttack: known(normal.value),
    superAttacks: superAttacks(boss, enemyId, checks),
    passiveEffects: passiveEffects(boss, enemyId),
    critical: runtimeCritical(boss, enemyId)
  };
  return { enemy, areas: areaAttacks(boss, enemyId) };
}

function flattenStages(event) {
  const seriesOccurrences = semanticOccurrences(event.series, (series) => [series.seriesName]);
  return event.series.flatMap((series, seriesIndex) => {
    const stageOccurrences = semanticOccurrences(series.stages, (stage) => [stage.stageName]);
    return series.stages.map((stage, stageIndex) => ({
      series,
      seriesDuplicateOrdinal: seriesOccurrences[seriesIndex].duplicateOrdinal,
      stage,
      stageDuplicateOrdinal: stageOccurrences[stageIndex].duplicateOrdinal
    }));
  });
}

export function createLegacyProductionRuntime(legacy, sourceText, { generatedAt = LEGACY_PRODUCTION_GENERATED_AT } = {}) {
  if (!Array.isArray(legacy) || legacy.length === 0) throw new TypeError('Legacy production enemy data must be a non-empty array.');
  const sourceDigest = sha256(sourceText);
  const checks = { normalAttacks: 0, superAttacks: 0, postSuperAttacks: 0 };
  let seriesCount = 0;
  let stageCount = 0;
  let enemyCount = 0;
  let attackCount = 0;
  let areaAttackCount = 0;

  const eventOccurrences = semanticOccurrences(legacy, (event) => [event.eventType]);
  const events = legacy.map((event, eventIndex) => {
    seriesCount += event.series.length;
    const flattened = flattenStages(event);
    const stageLabels = duplicateAwareLabels(flattened, ({ series, stage }) => (
      series.seriesName === '-' ? stage.stageName : `${series.seriesName}｜${stage.stageName}`
    ));
    const eventId = stableId('event', [event.eventType, eventOccurrences[eventIndex].duplicateOrdinal]);
    const stages = flattened.map(({ series, seriesDuplicateOrdinal, stage, stageDuplicateOrdinal }, flattenedIndex) => {
      stageCount += 1;
      const stageId = stableId('stage', [
        eventId,
        series.seriesName,
        seriesDuplicateOrdinal,
        stage.stageName,
        stageDuplicateOrdinal
      ]);
      const enemyLabels = duplicateAwareLabels(stage.bosses, (boss) => boss.name);
      const enemyOccurrences = semanticOccurrences(stage.bosses, (boss) => [boss.name]);
      const enemies = [];
      const areas = [];
      stage.bosses.forEach((boss, bossIndex) => {
        enemyCount += 1;
        attackCount += boss.attacks.length;
        const result = runtimeEnemy(
          boss,
          [stageId, boss.name, enemyOccurrences[bossIndex].duplicateOrdinal],
          bossIndex,
          enemyLabels[bossIndex],
          checks
        );
        enemies.push(result.enemy);
        areas.push(...result.areas);
      });
      areaAttackCount += areas.length;
      return {
        id: stageId,
        name: known(stageLabels[flattenedIndex]),
        encounters: [{ id: `${stageId}:encounter:0`, order: 0, enemies, areaAttacks: areas }]
      };
    });
    return { id: eventId, name: known(event.eventType), category: unknown(), stages };
  });

  const runtime = {
    schemaVersion: '1.0.0',
    datasetId: `legacy-production-runtime:${sourceDigest.slice('sha256:'.length, 'sha256:'.length + 16)}`,
    canonicalDatasetId: `legacy-production-direct:${sourceDigest.slice('sha256:'.length, 'sha256:'.length + 16)}`,
    generatedAt,
    region: 'jpnja',
    events
  };
  const report = {
    reportVersion: '1.0.0',
    source: {
      kind: 'existing-production-repository-data',
      path: LEGACY_PRODUCTION_SOURCE_PATH,
      digest: sourceDigest,
      networkRequests: 0,
      savedCacheCandidateIncluded: false,
      syntheticFixtureIncluded: false
    },
    counts: {
      eventTypes: legacy.length,
      runtimeEvents: events.length,
      series: seriesCount,
      stages: stageCount,
      encounters: stageCount,
      enemies: enemyCount,
      attacks: attackCount,
      areaAttacks: areaAttackCount
    },
    exactProjectionChecks: checks
  };
  return { runtime, report };
}
