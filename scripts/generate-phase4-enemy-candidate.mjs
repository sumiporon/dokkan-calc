#!/usr/bin/env node

/**
 * Phase 4 offline-only migration experiment.
 *
 * Reads the saved HTML cache and current JSON, writes only clearly separated
 * non-production artifacts, and never performs a network request.
 * The TypeScript adapter is compiled to ordinary JavaScript before this runs:
 *   npm run generate:phase4
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  candidateDatasetToLegacy,
  compareLegacyAndCandidate,
  legacyDatasetToFuture,
  stableJson
} from '../generated/phase4/runtime/phase4-enemy-migration.js';
import { classifyCachedEvent, parseCachedStageHtml } from '../tests/helpers/cached-enemy-source.mjs';
import { auditFutureEnemyDataset } from '../tests/helpers/future-enemy-schema-audit.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(REPO_ROOT, 'scraper', 'html_cache');
const CACHE_INDEX_PATH = path.join(CACHE_DIR, 'index.json');
const LEGACY_PATH = path.join(REPO_ROOT, 'scraper', 'all_enemies.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'enemy-data-v1.draft.schema.json');
const GENERATED_ROOT = path.join(REPO_ROOT, 'generated', 'phase4');
const CANDIDATE_PATH = path.join(GENERATED_ROOT, 'candidate', 'enemy-data-v1.candidate.json');
const COMPATIBILITY_PATH = path.join(GENERATED_ROOT, 'candidate', 'legacy-compatible.from-candidate.json');
const DIFF_PATH = path.join(REPO_ROOT, 'artifacts', 'phase4', 'legacy-vs-candidate.diff.json');
const REPRESENTATIVE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'future', 'enemy-data-v1.representative.json');
const ARTIFACT_ROOT = path.join(REPO_ROOT, 'artifacts', 'phase4');
const MANIFEST_PATH = path.join(ARTIFACT_ROOT, 'candidate-manifest.json');
const SUMMARY_PATH = path.join(ARTIFACT_ROOT, 'legacy-comparison-summary.json');
const SELECTION_PATH = path.join(ARTIFACT_ROOT, 'representative-selection.json');

const PROVIDER = 'dokkaninfo-cache';
const REGION = 'jpnja';
const PARSER_VERSION = 'phase4-cache-parser-1';

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function idFromUrl(url, pattern) {
  return String(url ?? '').match(pattern)?.[1] ?? null;
}

function evidence(stageUrl, sourceFile, checkedAt, confidence = 'high', notes = '保存済みHTMLに表示された値。') {
  return {
    sourceUrl: stageUrl,
    sourceFile: `scraper/html_cache/${sourceFile}`,
    checkedAt,
    confidence,
    notes
  };
}

function stateCollector() {
  const states = new Map();
  return {
    add(fieldPath, value, state, notes) {
      if (value === null && !states.has(fieldPath)) states.set(fieldPath, { fieldPath, state, notes });
    },
    list() {
      return [...states.values()].sort((left, right) => left.fieldPath.localeCompare(right.fieldPath, 'en'));
    }
  };
}

function makeEffect({
  effectId,
  kind,
  start = null,
  end = null,
  hpMinPercent = null,
  hpMaxPercent = null,
  appliesTo = 'enemy-stats',
  target = 'attack',
  operation = 'add-percent',
  value,
  cap = null,
  durationTurns = null,
  bracket = 'start-of-turn',
  sourceSkillId = null,
  rawText,
  confidence = 'medium'
}) {
  return {
    effectId,
    trigger: { kind, start, end, hpMinPercent, hpMaxPercent, raw: rawText },
    appliesTo,
    target,
    operation,
    value,
    cap,
    durationTurns,
    bracket,
    sourceSkillId,
    rawText,
    confidence
  };
}

function parsePercentEffects(sourceEnemy, occurrenceId) {
  const passiveEffects = [];
  const rateRules = [];
  let effectIndex = 0;
  const nextId = (label) => `${occurrenceId}:effect:${String(effectIndex++).padStart(2, '0')}:${label}`;

  for (const skill of sourceEnemy.skills) {
    const rawText = [skill.description, skill.valueText].filter(Boolean).join(' ');
    const compact = rawText.replace(/\s+/g, '');
    const sourceSkillId = skill.id == null ? null : String(skill.id);

    const turn = compact.match(/(?:(\d+)ターン目以降、?)?ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/i);
    if (turn) {
      passiveEffects.push(makeEffect({
        effectId: nextId('turn-atk'),
        kind: 'elapsed-turn',
        start: turn[1] ? Number(turn[1]) : 1,
        value: Number(turn[2]),
        cap: Number(turn[3]),
        sourceSkillId,
        rawText
      }));
    }

    const hit = compact.match(/(?:攻撃されるたびに?|攻撃を受けるたび)ATK(\d+)%UP\(最大(\d+)%\)/i);
    if (hit) {
      passiveEffects.push(makeEffect({
        effectId: nextId('received-hit-atk'),
        kind: 'received-hit-count',
        start: 1,
        value: Number(hit[1]),
        cap: Number(hit[2]),
        bracket: 'mid-battle',
        sourceSkillId,
        rawText
      }));
    }

    const hp = compact.match(/HP(\d+)%以下でATK(\d+)%UP/i);
    if (hp) {
      passiveEffects.push(makeEffect({
        effectId: nextId('hp-atk'),
        kind: 'hp-range',
        hpMinPercent: 0,
        hpMaxPercent: Number(hp[1]),
        value: Number(hp[2]),
        sourceSkillId,
        rawText
      }));
    }

    const appearance = /登場から(\d+)ターン目にATK(\d+)%UP/gi;
    let appearanceMatch;
    while ((appearanceMatch = appearance.exec(compact)) !== null) {
      passiveEffects.push(makeEffect({
        effectId: nextId('appearance-atk'),
        kind: 'appearance-turn',
        start: Number(appearanceMatch[1]),
        value: Number(appearanceMatch[2]),
        sourceSkillId,
        rawText
      }));
    }

    const criticalHp = compact.match(/HP(\d+)%以下で会心発動率(\d+)%UP/);
    if (criticalHp) {
      rateRules.push(makeEffect({
        effectId: nextId('critical-hp'),
        kind: 'hp-range',
        hpMinPercent: 0,
        hpMaxPercent: Number(criticalHp[1]),
        target: 'critical-rate',
        value: Number(criticalHp[2]),
        sourceSkillId,
        rawText
      }));
    }
    const criticalTurn = compact.match(/ターン経過ごとに会心発動率(\d+)%UP\(最大(\d+)%\)/);
    if (criticalTurn) {
      rateRules.push(makeEffect({
        effectId: nextId('critical-turn'),
        kind: 'elapsed-turn',
        start: 1,
        target: 'critical-rate',
        value: Number(criticalTurn[1]),
        cap: Number(criticalTurn[2]),
        sourceSkillId,
        rawText
      }));
    }
    if (!criticalHp && !criticalTurn) {
      const fixed = compact.match(/会心発動率(\d+)%UP/);
      if (fixed) {
        rateRules.push(makeEffect({
          effectId: nextId('critical-fixed'),
          kind: 'always',
          target: 'critical-rate',
          value: Number(fixed[1]),
          sourceSkillId,
          rawText
        }));
      }
    }
  }
  return { passiveEffects, rateRules, nextId };
}

function parseSuperEffects(superAttack, nextId) {
  const effects = [];
  const description = superAttack.description ?? '';
  const compact = description.replace(/\s+/g, '');
  let value = null;
  if (/ATK(?:とDEF)?が(?:超)?大幅(?:に)?上昇/.test(compact)) value = /超大幅/.test(compact) ? 100 : 50;
  else if (/ATK(?:とDEF)?が上昇/.test(compact)) value = 30;
  if (value != null) {
    const duration = Number(compact.match(/(\d+)ターンATK/)?.[1] ?? 1);
    effects.push(makeEffect({
      effectId: nextId('post-super-atk'),
      kind: 'after-super',
      appliesTo: 'subsequent-normal-attacks',
      value,
      durationTurns: duration,
      bracket: 'post-super',
      rawText: description,
      confidence: 'unconfirmed'
    }));
  }
  return effects;
}

function futureSuperAttack(superAttack, index, sourceEnemy, states, nextId) {
  const prefix = `attacks.superAttacks.${index}`;
  const displayedDamage = superAttack.damage;
  const derivedMultiplier = sourceEnemy.atk > 0 && displayedDamage != null
    ? displayedDamage / sourceEnemy.atk
    : null;
  const explicitCritical = /(会心が発動|必ず会心|高確率で会心)/.test(superAttack.description ?? '');
  const criticalOverride = explicitCritical
    ? { enabled: true, attackMultiplier: null, defenseIgnorePercent: null, rateRules: [] }
    : null;
  const output = {
    skillId: null,
    name: superAttack.name,
    description: superAttack.description,
    displayedDamage,
    derivedMultiplier,
    probabilityPercent: superAttack.probabilityPercent,
    maxPerTurn: superAttack.maxPerTurn,
    cooldownTurns: superAttack.cooldownTurns,
    slot: null,
    usageRules: superAttack.usageRules.map((rule) => ({ ...rule })),
    targetMode: 'unknown',
    attackType: superAttack.attackType,
    effectIcons: superAttack.effectIcons,
    effects: parseSuperEffects(superAttack, nextId),
    criticalOverride
  };
  for (const field of ['skillId', 'name', 'description', 'displayedDamage', 'derivedMultiplier', 'probabilityPercent', 'maxPerTurn', 'cooldownTurns', 'slot', 'attackType', 'criticalOverride']) {
    states.add(`${prefix}.${field}`, output[field], field === 'criticalOverride' ? 'not-applicable' : 'source-not-rendered', '保存HTMLにこの値が表示されていない。');
  }
  if (criticalOverride) {
    states.add(`${prefix}.criticalOverride.attackMultiplier`, criticalOverride.attackMultiplier, 'unconfirmed', '会心ATK倍率は保存HTMLから確定できない。');
    states.add(`${prefix}.criticalOverride.defenseIgnorePercent`, criticalOverride.defenseIgnorePercent, 'unconfirmed', '会心DEF無視率は保存HTMLから確定できない。');
  }
  output.usageRules.forEach((rule, ruleIndex) => {
    for (const field of ['hpMinPercent', 'hpMaxPercent', 'probabilityPercent', 'maxPerTurn', 'cooldownTurns']) {
      states.add(`${prefix}.usageRules.${ruleIndex}.${field}`, rule[field], 'source-not-rendered', 'このusage ruleに値が表示されていない。');
    }
  });
  return output;
}

function futureEnemy(sourceEnemy, context) {
  const occurrenceId = [
    PROVIDER,
    REGION,
    context.eventId,
    context.stageId,
    sourceEnemy.encounterIndex,
    sourceEnemy.orderInEncounter
  ].join(':');
  const states = stateCollector();
  const parsed = parsePercentEffects(sourceEnemy, occurrenceId);
  const critical = {
    enabled: parsed.rateRules.length > 0 ? true : null,
    attackMultiplier: null,
    defenseIgnorePercent: null,
    rateRules: parsed.rateRules
  };
  const identity = {
    sourceEnemyId: null,
    cardId: sourceEnemy.cardId == null ? null : String(sourceEnemy.cardId),
    thumbId: sourceEnemy.thumbId == null ? null : String(sourceEnemy.thumbId),
    isEzaCardLink: sourceEnemy.isEzaCardLink
  };
  const stats = {
    hp: sourceEnemy.hp,
    baseAttack: sourceEnemy.atk,
    defense: sourceEnemy.def,
    damageReductionPercent: sourceEnemy.damageReductionPercent,
    maxAttacksPerTurn: sourceEnemy.maxAttacksPerTurn
  };
  for (const [field, value] of Object.entries(identity)) {
    states.add(`identity.${field}`, value, 'source-not-rendered', field === 'sourceEnemyId'
      ? '保存HTMLにcard/thumbとは別のenemy専用IDが表示されていない。'
      : '保存HTMLにこの識別値が表示されていない。');
  }
  for (const [field, value] of Object.entries(stats)) {
    states.add(`stats.${field}`, value, 'source-not-rendered', '保存HTMLのこの敵行にステータスが表示されていない。');
  }
  states.add('critical.enabled', critical.enabled, 'unconfirmed', '会心記述がないことだけでは会心なしと断定できない。');
  states.add('critical.attackMultiplier', critical.attackMultiplier, 'unconfirmed', '会心ATK倍率は保存HTMLから確定できない。');
  states.add('critical.defenseIgnorePercent', critical.defenseIgnorePercent, 'unconfirmed', '会心DEF無視率は保存HTMLから確定できない。');

  const superAttacks = sourceEnemy.superAttacks.map((attack, index) => futureSuperAttack(
    attack,
    index,
    sourceEnemy,
    states,
    parsed.nextId
  ));
  const skills = sourceEnemy.skills.map((skill, index) => {
    const rawText = [skill.description, skill.valueText].filter(Boolean).join(' ') || null;
    const output = {
      skillId: skill.id == null ? null : String(skill.id),
      description: skill.description || null,
      probabilityPercent: skill.probabilityPercent,
      icons: skill.icons,
      rawText
    };
    for (const field of ['skillId', 'description', 'probabilityPercent', 'rawText']) {
      states.add(`skills.${index}.${field}`, output[field], 'source-not-rendered', '保存HTMLのskill行にこの値が表示されていない。');
    }
    return output;
  });
  return {
    occurrenceId,
    orderInEncounter: sourceEnemy.orderInEncounter,
    identity,
    name: sourceEnemy.name,
    type: sourceEnemy.type ?? 'unknown',
    alignment: sourceEnemy.class ?? 'unknown',
    stats,
    attacks: { superAttacks },
    passiveEffects: parsed.passiveEffects,
    critical,
    skills,
    evidence: evidence(context.stageUrl, sourceEnemy.sourceFile, context.checkedAt),
    fieldStates: states.list(),
    raw: {
      cardHref: sourceEnemy.cardHref,
      rarity: sourceEnemy.rarity,
      thumbSource: sourceEnemy.thumbSource,
      typeIconId: sourceEnemy.typeIconId,
      typeIconSource: sourceEnemy.typeIconSource,
      sourceAreaDamage: sourceEnemy.areaDamage,
      sourceSuperAttacks: sourceEnemy.superAttacks.map((attack) => ({
        attackTypeIcon: attack.attackTypeIcon,
        rawText: attack.rawText,
        usageRules: attack.usageRules
      }))
    }
  };
}

function actionKind(type) {
  if (type === 'ノーマル') return 'normal';
  if (type === '必殺技') return 'super';
  if (type === 'カウントダウン') return 'countdown';
  if (type === 'ヒール') return 'heal';
  return 'other';
}

function futureEncounter(group, context) {
  const enemies = group.enemies.map((enemy) => futureEnemy(enemy, context));
  const byOrder = new Map(enemies.map((enemy) => [enemy.orderInEncounter, enemy]));
  const aiActions = group.actionSequences.flatMap((sequence) => sequence.actions.map((action) => ({
    sequenceIndex: action.sequenceIndex,
    sourceOrder: action.sourceOrder,
    kind: actionKind(action.type),
    enemyOrder: action.enemyOrder,
    slot: action.slot,
    probabilityPercent: action.probabilityPercent,
    hpMinPercent: null,
    hpMaxPercent: null,
    maxUses: null,
    cooldownTurns: null,
    rawText: action.rawText
  })));

  const rowAreaSources = group.enemies.filter((enemy) => enemy.areaDamage != null);
  const makeAreaAttack = (area, sourceEnemy = null) => {
    const areaSource = sourceEnemy == null ? null : byOrder.get(sourceEnemy.orderInEncounter);
    return {
      sourceOccurrenceId: areaSource?.occurrenceId ?? null,
      attackKind: 'unknown',
      maxPerTurn: area.maxPerTurn,
      firstTargetDamage: area.firstTargetDamage,
      additionalTargetDamage: area.additionalTargetDamage,
      firstTargetMultiplierDerived: areaSource?.stats.baseAttack > 0 && area.firstTargetDamage != null
        ? area.firstTargetDamage / areaSource.stats.baseAttack
        : null,
      additionalTargetMultiplierDerived: areaSource?.stats.baseAttack > 0 && area.additionalTargetDamage != null
        ? area.additionalTargetDamage / areaSource.stats.baseAttack
        : null,
      targetMode: 'selected-and-others',
      evidence: evidence(
        context.stageUrl,
        sourceEnemy?.sourceFile ?? group.enemies[0]?.sourceFile ?? context.sourceFile,
        context.checkedAt,
        areaSource ? 'high' : 'unconfirmed',
        areaSource
          ? '同じ敵行に表示されたAOE元値。倍率はその行の基礎ATKから派生。'
          : 'encounterにはAOE表示があるが、元敵を一意に関連付けられない。'
      ),
      rawText: `エリア/ターン: ${area.maxPerTurn}; エリアダメージ 1: ${area.firstTargetDamage}; エリアダメージ 2+: ${area.additionalTargetDamage}`
    };
  };
  // Six encounters render more than one AOE-capable enemy. Preserve all 75
  // row-level AOE records instead of collapsing them to the first of 65 groups.
  const areaAttacks = rowAreaSources.length > 0
    ? rowAreaSources.map((sourceEnemy) => makeAreaAttack(sourceEnemy.areaDamage, sourceEnemy))
    : group.areaDamage == null ? [] : [makeAreaAttack(group.areaDamage)];
  return {
    encounterIndex: group.encounterIndex,
    phaseId: null,
    layoutKind: 'unknown',
    enemies,
    aiActions,
    areaAttacks
  };
}

function countCandidate(dataset) {
  const counts = {
    events: 0,
    stages: 0,
    encounters: 0,
    enemies: 0,
    combatEnemies: 0,
    superAttacks: 0,
    superAttackUsageRules: 0,
    missingDisplayedSuperDamageOnCombatEnemy: 0,
    neutralEnemies: 0,
    defenseValues: 0,
    aiActions: 0,
    aiSequences: 0,
    areaAttacks: 0,
    areaAttackEncounters: 0,
    attributedAreaAttacks: 0,
    passiveEffects: 0,
    criticalRateRules: 0,
    manualCorrections: dataset.manualCorrections.length
  };
  for (const event of dataset.events) {
    counts.events += 1;
    for (const stage of event.stages) {
      counts.stages += 1;
      for (const encounter of stage.encounters) {
        counts.encounters += 1;
        counts.aiActions += encounter.aiActions.length;
        counts.aiSequences += new Set(encounter.aiActions.map((action) => action.sequenceIndex)).size;
        counts.areaAttacks += encounter.areaAttacks.length;
        if (encounter.areaAttacks.length > 0) counts.areaAttackEncounters += 1;
        counts.attributedAreaAttacks += encounter.areaAttacks.filter((area) => area.sourceOccurrenceId != null).length;
        for (const enemy of encounter.enemies) {
          counts.enemies += 1;
          const combat = (enemy.stats.baseAttack ?? 0) > 0;
          if (combat) counts.combatEnemies += 1;
          counts.superAttacks += enemy.attacks.superAttacks.length;
          counts.superAttackUsageRules += enemy.attacks.superAttacks.reduce((sum, attack) => sum + attack.usageRules.length, 0);
          if (combat && !enemy.attacks.superAttacks.some((attack) => attack.displayedDamage != null)) {
            counts.missingDisplayedSuperDamageOnCombatEnemy += 1;
          }
          if (enemy.alignment === 'neutral') counts.neutralEnemies += 1;
          if (enemy.stats.defense != null) counts.defenseValues += 1;
          counts.passiveEffects += enemy.passiveEffects.length;
          counts.criticalRateRules += enemy.critical.rateRules.length;
        }
      }
    }
  }
  return counts;
}

function encounterFeatures(encounter) {
  const features = new Set();
  if (encounter.enemies.some((enemy) => enemy.alignment === 'neutral')) features.add('neutral-alignment');
  if (encounter.enemies.some((enemy) => (enemy.stats.baseAttack ?? 0) > 0 && !enemy.attacks.superAttacks.some((attack) => attack.displayedDamage != null))) features.add('missing-super-display');
  if (encounter.areaAttacks.length > 0) features.add('area-attack');
  if (encounter.aiActions.length > 0) features.add('ai-actions');
  if (new Set(encounter.aiActions.map((action) => action.sequenceIndex)).size > 1) features.add('multiple-ai-sequences');
  if (encounter.enemies.some((enemy) => enemy.attacks.superAttacks.length > 1)) features.add('multiple-super-attacks');
  if (encounter.enemies.some((enemy) => enemy.attacks.superAttacks.some((attack) => attack.usageRules.length > 0))) features.add('super-usage-rules');
  if (encounter.aiActions.some((action) => action.hpMinPercent != null || action.hpMaxPercent != null)) features.add('hp-conditioned-ai');
  if (encounter.aiActions.some((action) => action.cooldownTurns != null || action.slot != null)) features.add('turn-conditioned-ai');
  if (encounter.enemies.some((enemy) => enemy.stats.defense != null)) features.add('defense');
  if (encounter.enemies.some((enemy) => enemy.stats.baseAttack == null)) features.add('null-combat-stats');
  if (encounter.enemies.some((enemy) => enemy.stats.damageReductionPercent === 0)) features.add('explicit-zero');
  if (encounter.enemies.some((enemy) => enemy.passiveEffects.some((effect) => effect.trigger.kind === 'elapsed-turn'))) features.add('turn-condition');
  if (encounter.enemies.some((enemy) => enemy.passiveEffects.some((effect) => effect.trigger.kind === 'received-hit-count'))) features.add('received-hit-condition');
  if (encounter.enemies.some((enemy) => enemy.passiveEffects.some((effect) => effect.trigger.kind === 'hp-range'))) features.add('hp-condition');
  if (encounter.enemies.some((enemy) => enemy.passiveEffects.some((effect) => effect.trigger.kind === 'appearance-turn'))) features.add('appearance-condition');
  if (encounter.enemies.some((enemy) => enemy.critical.rateRules.length > 0 || enemy.attacks.superAttacks.some((attack) => attack.criticalOverride != null))) features.add('critical');
  for (const type of ['agl', 'teq', 'int', 'str', 'phy']) {
    if (encounter.enemies.some((enemy) => enemy.type === type)) features.add(`type-${type}`);
  }
  if (encounter.enemies.some((enemy) => enemy.alignment === 'super')) features.add('alignment-super');
  if (encounter.enemies.some((enemy) => enemy.alignment === 'extreme')) features.add('alignment-extreme');
  return features;
}

function selectRepresentative(dataset) {
  const all = [];
  dataset.events.forEach((event) => event.stages.forEach((stage) => stage.encounters.forEach((encounter) => {
    all.push({ event, stage, encounter, features: encounterFeatures(encounter) });
  })));
  const required = new Set([
    'neutral-alignment', 'missing-super-display', 'area-attack', 'ai-actions', 'multiple-ai-sequences',
    'multiple-super-attacks', 'super-usage-rules', 'turn-conditioned-ai',
    'defense', 'null-combat-stats', 'explicit-zero', 'turn-condition',
    'received-hit-condition', 'hp-condition', 'appearance-condition', 'critical',
    'type-agl', 'type-teq', 'type-int', 'type-str', 'type-phy', 'alignment-super', 'alignment-extreme'
  ]);
  const selected = [];
  const selectedKeys = new Set();
  // Pin high-risk regression cases even if a smaller greedy combination could
  // technically cover the same feature label.
  const forcedKeys = new Set([
    '711:7110011:0', // neutral combat rows (old parser mapped them to extreme)
    '701:7010013:4', // Janemba: one SA with two HP usage bands
    '1702:17020095:0', // concrete AOE first/additional target values
    '1744:17440013:0', // true multiple SAs and multiple AI sequences
    '701:7010014:9' // positive ATK with no displayed SA damage
  ]);
  for (const entry of all) {
    const key = `${entry.event.eventId}:${entry.stage.stageId}:${entry.encounter.encounterIndex}`;
    if (!forcedKeys.has(key)) continue;
    selected.push(entry);
    selectedKeys.add(key);
    entry.features.forEach((feature) => required.delete(feature));
  }
  while (required.size > 0) {
    const candidates = all.map((entry) => {
      const newFeatures = [...entry.features].filter((feature) => required.has(feature));
      return { entry, newFeatures, score: newFeatures.length * 100 - entry.encounter.enemies.length };
    }).filter(({ entry, newFeatures }) => newFeatures.length > 0 && !selectedKeys.has(`${entry.event.eventId}:${entry.stage.stageId}:${entry.encounter.encounterIndex}`));
    candidates.sort((left, right) => right.score - left.score
      || String(left.entry.event.eventId).localeCompare(String(right.entry.event.eventId), 'en')
      || String(left.entry.stage.stageId).localeCompare(String(right.entry.stage.stageId), 'en')
      || left.entry.encounter.encounterIndex - right.entry.encounter.encounterIndex);
    if (candidates.length === 0) break;
    const chosen = candidates[0];
    selected.push(chosen.entry);
    selectedKeys.add(`${chosen.entry.event.eventId}:${chosen.entry.stage.stageId}:${chosen.entry.encounter.encounterIndex}`);
    chosen.newFeatures.forEach((feature) => required.delete(feature));
  }
  let selectedEnemyCount = selected.reduce((sum, entry) => sum + entry.encounter.enemies.length, 0);
  while (selectedEnemyCount < 40) {
    const selectedEvents = new Set(selected.map((entry) => entry.event.eventId));
    const selectedStages = new Set(selected.map((entry) => `${entry.event.eventId}:${entry.stage.stageId}`));
    const candidates = all.filter((entry) => !selectedKeys.has(`${entry.event.eventId}:${entry.stage.stageId}:${entry.encounter.encounterIndex}`));
    candidates.sort((left, right) => {
      const leftNewEvent = selectedEvents.has(left.event.eventId) ? 0 : 1;
      const rightNewEvent = selectedEvents.has(right.event.eventId) ? 0 : 1;
      const leftNewStage = selectedStages.has(`${left.event.eventId}:${left.stage.stageId}`) ? 0 : 1;
      const rightNewStage = selectedStages.has(`${right.event.eventId}:${right.stage.stageId}`) ? 0 : 1;
      return rightNewEvent - leftNewEvent
        || rightNewStage - leftNewStage
        || left.encounter.enemies.length - right.encounter.enemies.length
        || String(left.event.eventId).localeCompare(String(right.event.eventId), 'en')
        || String(left.stage.stageId).localeCompare(String(right.stage.stageId), 'en')
        || left.encounter.encounterIndex - right.encounter.encounterIndex;
    });
    const entry = candidates[0];
    if (!entry) break;
    selected.push(entry);
    selectedKeys.add(`${entry.event.eventId}:${entry.stage.stageId}:${entry.encounter.encounterIndex}`);
    selectedEnemyCount += entry.encounter.enemies.length;
  }

  const eventMap = new Map();
  for (const entry of selected) {
    let event = eventMap.get(entry.event.eventId);
    if (!event) {
      event = { ...entry.event, stages: [] };
      eventMap.set(entry.event.eventId, event);
    }
    let stage = event.stages.find((item) => item.stageId === entry.stage.stageId);
    if (!stage) {
      stage = { ...entry.stage, encounters: [] };
      event.stages.push(stage);
    }
    stage.encounters.push(structuredClone(entry.encounter));
  }
  const representative = {
    ...dataset,
    datasetId: `${dataset.datasetId}-representative`,
    sourceSnapshot: {
      ...dataset.sourceSnapshot,
      notes: `${dataset.sourceSnapshot.notes} Phase 4 representative subset; production use prohibited.`
    },
    events: [...eventMap.values()]
  };
  const selection = selected.map((entry) => ({
    eventId: entry.event.eventId,
    stageId: entry.stage.stageId,
    stageName: entry.stage.name,
    encounterIndex: entry.encounter.encounterIndex,
    enemyCount: entry.encounter.enemies.length,
    occurrenceIds: entry.encounter.enemies.map((enemy) => enemy.occurrenceId),
    features: [...entry.features].sort()
  }));
  return { representative, selection, uncoveredFeatures: [...required].sort() };
}

export async function buildCandidateFromCache(options = {}) {
  const selectedFiles = options.stageFiles ? new Set(options.stageFiles) : null;
  const showProgress = options.progress ?? !selectedFiles;
  const indexBytes = await readFile(CACHE_INDEX_PATH);
  const index = JSON.parse(indexBytes.toString('utf8'));
  const sourceHash = createHash('sha256');
  sourceHash.update('scraper/html_cache/index.json\0');
  sourceHash.update(indexBytes);
  sourceHash.update('\0');
  const events = [];
  let parsedStageCount = 0;

  for (const indexedEvent of index.events) {
    const eventId = idFromUrl(indexedEvent.url, /\/challenge\/(\d+)(?:\/|$)/);
    if (!eventId) throw new Error(`event IDをURLから取得できません: ${indexedEvent.url}`);
    const classification = classifyCachedEvent(indexedEvent.title);
    const stages = [];
    for (const indexedStage of indexedEvent.stages) {
      if (selectedFiles && !selectedFiles.has(indexedStage.file)) continue;
      const stageId = idFromUrl(indexedStage.url, /\/challenge\/\d+\/(\d+)(?:\/|$)/);
      if (!stageId) throw new Error(`stage IDをURLから取得できません: ${indexedStage.url}`);
      const bytes = await readFile(path.join(CACHE_DIR, indexedStage.file));
      sourceHash.update(`scraper/html_cache/${indexedStage.file}\0`);
      sourceHash.update(bytes);
      sourceHash.update('\0');
      const parsed = parseCachedStageHtml(bytes.toString('utf8'), {
        eventId,
        eventTitle: indexedEvent.title,
        eventType: classification.eventType,
        seriesName: classification.seriesName,
        stageId,
        sourceFile: indexedStage.file
      });
      const suspiciousSuperAttack = parsed.enemies
        .flatMap((enemy) => enemy.superAttacks.map((attack) => ({ enemy, attack })))
        .find(({ attack }) => /^(?:HPレンジ|パーセンテージ|最大ATK\/ターン|再使用までの時間)\s*:/.test(attack.name ?? ''));
      if (suspiciousSuperAttack) {
        throw new Error(`condition blockを必殺として誤解析しました: ${indexedStage.file} / ${suspiciousSuperAttack.enemy.name} / ${suspiciousSuperAttack.attack.name}`);
      }
      stages.push({
        stageId,
        name: parsed.stageName,
        legacySeriesName: classification.seriesName,
        sourceUrl: indexedStage.url,
        encounters: parsed.groups.map((group) => futureEncounter(group, {
          eventId,
          stageId,
          stageUrl: indexedStage.url,
          sourceFile: indexedStage.file,
          checkedAt: index.downloadedAt
        }))
      });
      parsedStageCount += 1;
      if (showProgress && parsedStageCount % 50 === 0) process.stdout.write(`parsed ${parsedStageCount}/${index.events.reduce((sum, event) => sum + event.stages.length, 0)} stages\n`);
    }
    if (stages.length > 0) {
      events.push({
        eventId,
        name: indexedEvent.title,
        category: 'challenge',
        legacyEventType: classification.eventType,
        sourceUrl: indexedEvent.url,
        stages
      });
    }
  }
  const contentDigest = `sha256:${sourceHash.digest('hex')}`;
  const dataset = {
    schemaVersion: 1,
    datasetId: `phase4-cache-${contentDigest.slice(7, 19)}`,
    generatedAt: index.downloadedAt,
    sourceSnapshot: {
      provider: PROVIDER,
      region: REGION,
      acquiredAt: index.downloadedAt,
      importMethod: 'saved-cache',
      policyStatus: 'offline-existing-copy',
      parserVersion: PARSER_VERSION,
      sourceRootUrl: 'https://jpnja.dokkaninfo.com/events/challenge',
      contentDigest,
      notes: `外部アクセス0。index.jsonと${parsedStageCount}件の保存stage HTMLだけから決定論的に再解析した非本番候補。`
    },
    events,
    manualCorrections: []
  };
  return { dataset, parsedStageCount };
}

function countLegacy(legacy) {
  let stages = 0;
  let bosses = 0;
  for (const event of legacy) for (const series of event.series) for (const stage of series.stages) {
    stages += 1;
    bosses += stage.bosses.length;
  }
  return { events: legacy.length, stages, bosses };
}

function comparisonSummary(diff, candidateCounts, legacyCounts, compatibilityReport) {
  const matchCounts = {};
  for (const match of diff.legacyMatches) {
    const key = `${match.tier}:${match.cardinality}`;
    matchCounts[key] = (matchCounts[key] ?? 0) + 1;
  }
  const candidateStatusCounts = {};
  for (const stage of diff.candidateStages) candidateStatusCounts[stage.status] = (candidateStatusCounts[stage.status] ?? 0) + 1;
  const changedFields = {};
  let bossesWithAnyDifference = 0;
  let missingSuperSynthesizedOnUniqueMatch = 0;
  let neutralMappedOnUniqueMatch = 0;
  for (const stage of diff.matchedStageDetails) for (const boss of stage.bosses) {
    const differences = boss.differences.filter((field) => !field.equal);
    if (differences.length > 0) bossesWithAnyDifference += 1;
    for (const difference of differences) changedFields[difference.field] = (changedFields[difference.field] ?? 0) + 1;
    if (boss.findings.some((finding) => finding.code === 'MISSING_SUPER_SYNTHESIZED')) missingSuperSynthesizedOnUniqueMatch += 1;
    if (boss.findings.some((finding) => finding.code === 'NEUTRAL_MAPPED_TO_EXTREME')) neutralMappedOnUniqueMatch += 1;
  }
  const findingCounts = {};
  for (const finding of compatibilityReport.findings) {
    const existing = findingCounts[finding.code];
    if (existing) existing.affectedCount += finding.affectedCount;
    else findingCounts[finding.code] = {
      severity: finding.severity,
      affectedCount: finding.affectedCount
    };
  }
  return {
    schemaVersion: 1,
    datasetId: diff.datasetId,
    generatedAt: null,
    comparisonMode: 'offline-saved-cache-vs-current-json',
    legacyCounts,
    candidateCounts,
    legacyStageMatches: matchCounts,
    candidateStageClassifications: candidateStatusCounts,
    uniqueMatchedBossComparison: {
      comparedBosses: diff.aggregate.comparedBosses,
      fullyEqualBosses: diff.aggregate.fullyEqualBosses,
      detailedBosses: diff.aggregate.detailedBosses,
      bossesWithAnyDifference,
      changedFields,
      missingSuperSynthesizedOnUniqueMatch,
      neutralMappedOnUniqueMatch
    },
    fullCompatibilityReport: {
      counts: compatibilityReport.counts,
      findings: findingCounts
    },
    interpretation: {
      neutral: 'neutral→extremeは現行形式にneutral列挙値がないための互換写像であり、元候補はneutralを保持する。',
      missingSuper: '保存HTMLに必殺ダメージがない行はnull。legacy-threeは旧挙動比較専用で、本番候補へ書き戻さない。',
      corrections: '根拠とレビューのない現行値をmanualCorrectionsとして自動採用しない。'
    }
  };
}

async function validateDataset(dataset, schema) {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(dataset)) throw new Error(`JSON Schema validation failed:\n${JSON.stringify(validate.errors, null, 2)}`);
  const semantic = auditFutureEnemyDataset(dataset);
  if (semantic.errors.length > 0) throw new Error(`Semantic validation failed:\n${JSON.stringify(semantic.errors.slice(0, 50), null, 2)}`);
  return semantic.counts;
}

export async function createPhase4Artifacts({ write = false } = {}) {
  const [legacy, schema] = await Promise.all([
    readFile(LEGACY_PATH, 'utf8').then(JSON.parse),
    readFile(SCHEMA_PATH, 'utf8').then(JSON.parse)
  ]);
  const { dataset } = await buildCandidateFromCache({ progress: write });
  const semanticCounts = await validateDataset(dataset, schema);
  const candidateCounts = countCandidate(dataset);
  const candidateJson = stableJson(dataset);
  const candidateDigest = sha256(candidateJson);

  const { representative, selection, uncoveredFeatures } = selectRepresentative(dataset);
  const representativeSemanticCounts = await validateDataset(representative, schema);
  const representativeJson = stableJson(representative);
  const representativeDigest = sha256(representativeJson);

  const compatibility = candidateDatasetToLegacy(dataset, {
    neutralPolicy: 'legacy-extreme',
    missingSuperPolicy: 'legacy-three'
  });
  const compatibilityJson = stableJson(compatibility.data);
  const compatibilityDigest = sha256(compatibilityJson);
  const diff = compareLegacyAndCandidate(legacy, dataset);
  const diffJson = stableJson(diff);
  const diffDigest = sha256(diffJson);
  const summary = comparisonSummary(diff, candidateCounts, countLegacy(legacy), compatibility.report);
  summary.generatedAt = dataset.generatedAt;
  const summaryJson = stableJson(summary);
  const summaryDigest = sha256(summaryJson);

  // Exercise the complete legacy -> future path without persisting another
  // large candidate. The result is represented by deterministic counts/digest.
  const legacySourceDigest = sha256(stableJson(legacy));
  const legacyImport = legacyDatasetToFuture(legacy, dataset.generatedAt, legacySourceDigest);
  const legacyImportProof = {
    sourceDigest: legacySourceDigest,
    datasetDigest: sha256(stableJson(legacyImport)),
    counts: countCandidate(legacyImport)
  };

  const stageIndex = dataset.events.map((event) => ({
    eventId: event.eventId,
    stageIds: event.stages.map((stage) => stage.stageId)
  }));
  const manifest = {
    schemaVersion: 1,
    manifestVersion: 1,
    datasetId: dataset.datasetId,
    generatedAt: dataset.generatedAt,
    sourceSnapshot: dataset.sourceSnapshot,
    counts: candidateCounts,
    semanticCounts,
    stageIndex,
    artifacts: {
      candidate: { path: 'generated/phase4/candidate/enemy-data-v1.candidate.json', digest: candidateDigest, bytes: Buffer.byteLength(candidateJson) },
      compatibility: { path: 'generated/phase4/candidate/legacy-compatible.from-candidate.json', digest: compatibilityDigest, bytes: Buffer.byteLength(compatibilityJson) },
      comparison: { path: 'artifacts/phase4/legacy-vs-candidate.diff.json', digest: diffDigest, bytes: Buffer.byteLength(diffJson) },
      representative: { path: 'tests/fixtures/future/enemy-data-v1.representative.json', digest: representativeDigest, bytes: Buffer.byteLength(representativeJson) },
      summary: { path: 'artifacts/phase4/legacy-comparison-summary.json', digest: summaryDigest, bytes: Buffer.byteLength(summaryJson) }
    },
    representative: {
      selectionCount: selection.length,
      semanticCounts: representativeSemanticCounts,
      uncoveredFeatures
    },
    compatibilityGate: {
      safeForProduction: compatibility.safeForProduction,
      counts: compatibility.report.counts,
      findings: compatibility.report.findings,
      note: '比較用lossy policyを明示指定した出力。本番採用gateは重大なlossが0件の場合だけ成功とする。'
    },
    legacyImportProof,
    safety: {
      networkRequests: 0,
      productionFilesWritten: 0,
      productionInputPaths: ['scraper/html_cache/index.json', 'scraper/html_cache/stage_*.html', 'scraper/all_enemies.json'],
      generatedPathsOnly: true
    },
    updateCheckDesign: 'UI may fetch this small manifest, compare sourceSnapshot.contentDigest or candidate digest, and fetch the candidate only when changed. candidate-only-unconfirmed is not a true new-stage verdict; that requires comparison with a previously approved manifest ID set.'
  };
  const selectionArtifact = {
    schemaVersion: 1,
    datasetId: representative.datasetId,
    generatedAt: dataset.generatedAt,
    selection,
    uncoveredFeatures
  };

  if (write) {
    await Promise.all([
      mkdir(path.dirname(CANDIDATE_PATH), { recursive: true }),
      mkdir(path.dirname(DIFF_PATH), { recursive: true }),
      mkdir(path.dirname(REPRESENTATIVE_PATH), { recursive: true }),
      mkdir(ARTIFACT_ROOT, { recursive: true })
    ]);
    await Promise.all([
      writeFile(CANDIDATE_PATH, candidateJson, 'utf8'),
      writeFile(COMPATIBILITY_PATH, compatibilityJson, 'utf8'),
      writeFile(DIFF_PATH, diffJson, 'utf8'),
      writeFile(REPRESENTATIVE_PATH, representativeJson, 'utf8'),
      writeFile(SUMMARY_PATH, summaryJson, 'utf8'),
      writeFile(SELECTION_PATH, stableJson(selectionArtifact), 'utf8'),
      writeFile(MANIFEST_PATH, stableJson(manifest), 'utf8')
    ]);
  }
  const cliSummary = {
    candidate: { path: path.relative(REPO_ROOT, CANDIDATE_PATH), digest: candidateDigest, counts: candidateCounts },
    representative: { path: path.relative(REPO_ROOT, REPRESENTATIVE_PATH), digest: representativeDigest, enemies: representativeSemanticCounts.enemies },
    comparison: { path: path.relative(REPO_ROOT, DIFF_PATH), digest: diffDigest },
    summary,
    manifest: path.relative(REPO_ROOT, MANIFEST_PATH)
  };
  return {
    dataset,
    compatibility,
    diff,
    representative,
    summary,
    selectionArtifact,
    manifest,
    serialized: {
      candidate: candidateJson,
      compatibility: compatibilityJson,
      comparison: diffJson,
      representative: representativeJson,
      summary: summaryJson,
      selection: stableJson(selectionArtifact),
      manifest: stableJson(manifest)
    },
    cliSummary
  };
}

async function main() {
  const result = await createPhase4Artifacts({ write: true });
  process.stdout.write(stableJson(result.cliSummary));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
