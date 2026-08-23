/** Deterministic canonical v2 -> calculation runtime projection. */

import type {
  CanonicalCritical,
  CanonicalEffect,
  CanonicalEnemyDatasetV2,
  CanonicalField,
  CanonicalSuperAttack,
  RuntimeCritical,
  RuntimeEffect,
  RuntimeEnemyDatasetV1,
  RuntimeField,
  RuntimeProjectionReport,
  RuntimeSuperAttack
} from './phase6-types.js';

function runtimeField<T>(field: CanonicalField<T>): RuntimeField<T> {
  return { state: field.state, value: field.value };
}

function runtimeEffect(effect: CanonicalEffect): RuntimeEffect {
  return {
    id: effect.id,
    trigger: {
      kind: effect.trigger.kind,
      start: runtimeField(effect.trigger.start),
      end: runtimeField(effect.trigger.end),
      hpMinPercent: runtimeField(effect.trigger.hpMinPercent),
      hpMaxPercent: runtimeField(effect.trigger.hpMaxPercent)
    },
    appliesTo: effect.appliesTo,
    target: effect.target,
    operation: effect.operation,
    value: runtimeField(effect.value),
    cap: runtimeField(effect.cap),
    durationTurns: runtimeField(effect.durationTurns),
    bracket: effect.bracket
  };
}

function runtimeCritical(critical: CanonicalCritical): RuntimeCritical {
  return {
    enabled: runtimeField(critical.enabled),
    attackMultiplier: runtimeField(critical.attackMultiplier),
    defenseIgnorePercent: runtimeField(critical.defenseIgnorePercent),
    rateRules: critical.rateRules.map(runtimeEffect)
  };
}

function runtimeSuperAttack(attack: CanonicalSuperAttack): RuntimeSuperAttack {
  return {
    id: attack.id,
    name: runtimeField(attack.name),
    displayedDamage: runtimeField(attack.displayedDamage),
    derivedMultiplier: runtimeField(attack.derivedMultiplier),
    probabilityPercent: runtimeField(attack.probabilityPercent),
    maxPerTurn: runtimeField(attack.maxPerTurn),
    cooldownTurns: runtimeField(attack.cooldownTurns),
    slot: runtimeField(attack.slot),
    usageRules: attack.usageRules.map((rule) => ({
      order: rule.order,
      hpMinPercent: runtimeField(rule.hpMinPercent),
      hpMaxPercent: runtimeField(rule.hpMaxPercent),
      probabilityPercent: runtimeField(rule.probabilityPercent),
      maxPerTurn: runtimeField(rule.maxPerTurn),
      cooldownTurns: runtimeField(rule.cooldownTurns)
    })),
    targetMode: runtimeField(attack.targetMode),
    effects: attack.effects.map(runtimeEffect),
    criticalOverride: attack.criticalOverride.state === 'known' && attack.criticalOverride.value != null
      ? {
          state: 'known',
          value: runtimeCritical(attack.criticalOverride.value)
        }
      : {
          state: attack.criticalOverride.state,
          value: null
        }
  };
}

export function countCanonicalRecords(dataset: CanonicalEnemyDatasetV2): Record<string, number> {
  let stages = 0;
  let encounters = 0;
  let enemies = 0;
  let combatEnemies = 0;
  let superAttacks = 0;
  let usageRules = 0;
  let aiActions = 0;
  let areaAttacks = 0;
  let neutralEnemies = 0;
  let knownZeroFields = 0;
  let unknownFields = 0;
  let unavailableFields = 0;
  for (const event of dataset.events) {
    for (const stage of event.stages) {
      stages += 1;
      for (const encounter of stage.encounters) {
        encounters += 1;
        aiActions += encounter.aiActions.length;
        areaAttacks += encounter.areaAttacks.length;
        for (const enemy of encounter.enemies) {
          enemies += 1;
          if (enemy.role.state === 'known' && enemy.role.value === 'combat') combatEnemies += 1;
          if (enemy.alignment.state === 'known' && enemy.alignment.value === 'neutral') neutralEnemies += 1;
          superAttacks += enemy.superAttacks.length;
          for (const attack of enemy.superAttacks) {
            usageRules += attack.usageRules.length;
          }
        }
      }
    }
  }
  const visitFields = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visitFields(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.state === 'string'
      && Object.hasOwn(record, 'value')
      && Array.isArray(record.evidenceIds)
      && typeof record.confidence === 'string'
    ) {
      if (record.state === 'known' && record.value === 0) knownZeroFields += 1;
      if (record.state === 'unknown') unknownFields += 1;
      if (record.state === 'unavailable') unavailableFields += 1;
      if (record.state === 'known' && record.value && typeof record.value === 'object') visitFields(record.value);
      return;
    }
    for (const item of Object.values(record)) visitFields(item);
  };
  visitFields(dataset);
  return {
    events: dataset.events.length,
    stages,
    encounters,
    enemies,
    combatEnemies,
    superAttacks,
    usageRules,
    aiActions,
    areaAttacks,
    neutralEnemies,
    evidence: dataset.evidence.length,
    sourceSnapshots: dataset.sourceSnapshots.length,
    manualCorrections: dataset.manualCorrections.length,
    knownZeroFields,
    unknownFields,
    unavailableFields
  };
}

export function projectCanonicalToRuntime(dataset: CanonicalEnemyDatasetV2): {
  runtime: RuntimeEnemyDatasetV1;
  report: RuntimeProjectionReport;
} {
  const runtime: RuntimeEnemyDatasetV1 = {
    schemaVersion: '1.0.0',
    datasetId: `runtime:${dataset.datasetId}`,
    canonicalDatasetId: dataset.datasetId,
    generatedAt: dataset.generatedAt,
    region: dataset.region,
    events: dataset.events.map((event) => ({
      id: event.id,
      name: runtimeField(event.name),
      category: runtimeField(event.category),
      stages: event.stages.map((stage) => ({
        id: stage.id,
        name: runtimeField(stage.name),
        encounters: stage.encounters.map((encounter) => ({
          id: encounter.id,
          order: encounter.order,
          enemies: encounter.enemies.map((enemy) => ({
            id: enemy.id,
            orderInEncounter: enemy.orderInEncounter,
            role: runtimeField(enemy.role),
            name: runtimeField(enemy.name),
            type: runtimeField(enemy.type),
            alignment: runtimeField(enemy.alignment),
            baseAttack: runtimeField(enemy.stats.baseAttack),
            superAttacks: enemy.superAttacks.map(runtimeSuperAttack),
            passiveEffects: enemy.passiveEffects.map(runtimeEffect),
            critical: runtimeCritical(enemy.critical)
          })),
          areaAttacks: encounter.areaAttacks.map((area) => ({
            id: area.id,
            sourceEnemyId: runtimeField(area.sourceEnemyId),
            attackKind: runtimeField(area.attackKind),
            maxPerTurn: runtimeField(area.maxPerTurn),
            firstTargetDamage: runtimeField(area.firstTargetDamage),
            additionalTargetDamage: runtimeField(area.additionalTargetDamage),
            firstTargetMultiplier: runtimeField(area.firstTargetMultiplier),
            additionalTargetMultiplier: runtimeField(area.additionalTargetMultiplier),
            targetMode: runtimeField(area.targetMode)
          }))
        }))
      }))
    }))
  };
  const counts = countCanonicalRecords(dataset);
  const report: RuntimeProjectionReport = {
    reportVersion: '1.0.0',
    canonicalDatasetId: dataset.datasetId,
    runtimeDatasetId: runtime.datasetId,
    requiredCalculationLosses: [],
    omitted: [
      { fieldFamily: 'sourceSnapshots/sourceRefs/evidence/confidence', reason: '監査・再生成用で、計算時には不要。', retainedInCanonical: true, retainedInSourceMaterial: true },
      { fieldFamily: 'raw provider display fields and icon paths', reason: '正規化計算に使わず、取得元固有materialで再現できる。', retainedInCanonical: false, retainedInSourceMaterial: true },
      { fieldFamily: 'HP/DEF/damage reduction/max attack count', reason: '現行の被ダメージ計算入力として参照していない。将来必要ならprojectionへ追加できる。', retainedInCanonical: true, retainedInSourceMaterial: true },
      { fieldFamily: 'external/card/thumb IDs and EZA link flag', reason: '現在の計算式はcanonical IDだけで識別できる。', retainedInCanonical: true, retainedInSourceMaterial: true },
      { fieldFamily: 'skill rows and descriptive/source text', reason: '数値化済みeffect以外の説明文は計算エンジンが読まない。', retainedInCanonical: true, retainedInSourceMaterial: true },
      { fieldFamily: 'AI action sequences', reason: '現行計算は選択した攻撃値を評価し、敵行動順の自動シミュレーションをしない。', retainedInCanonical: true, retainedInSourceMaterial: true },
      { fieldFamily: 'manual correction audit records', reason: '適用済みcanonical値の監査情報であり、端末計算には不要。', retainedInCanonical: true, retainedInSourceMaterial: true }
    ],
    counts
  };
  return { runtime, report };
}
