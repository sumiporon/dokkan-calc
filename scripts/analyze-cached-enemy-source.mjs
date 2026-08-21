#!/usr/bin/env node

/**
 * Read-only Phase 3 analysis of the saved DokkanInfo HTML cache.
 *
 * This script never performs network access and never writes scraper/all_enemies.json.
 * Its only optional output is a compact report under artifacts/phase3/.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cachedEnemyFingerprint,
  cachedStageSignature,
  classifyCachedEvent,
  legacyEnemyFingerprint,
  legacyStageSignature,
  parseCachedStageHtml
} from '../tests/helpers/cached-enemy-source.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(REPO_ROOT, 'scraper', 'html_cache');
const INDEX_PATH = path.join(CACHE_DIR, 'index.json');
const LEGACY_DATA_PATH = path.join(REPO_ROOT, 'scraper', 'all_enemies.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'artifacts', 'phase3', 'cached-source-analysis.json');

function percent(count, total) {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
}

function coverage(count, total) {
  return { count, total, percent: percent(count, total) };
}

function numberFromUrl(url, pattern) {
  const match = String(url ?? '').match(pattern);
  return match ? Number.parseInt(match[1], 10) : null;
}

function stageHumanKey(stage) {
  return JSON.stringify([stage.eventType, stage.seriesName, stage.stageName]);
}

function stageExactKey(stage, signature) {
  return `${stageHumanKey(stage)}\u0000${signature}`;
}

function legacyStageSignatureWithoutClass(stage) {
  return JSON.stringify(stage.bosses.map((enemy) => [
    enemy.name,
    enemy.type,
    enemy.baseAtk,
    enemy.baseAtk != null && enemy.saMulti != null ? Math.round(enemy.baseAtk * enemy.saMulti) : null
  ]));
}

function cachedStageSignatureWithoutClass(stage) {
  return JSON.stringify(stage.enemies.filter((enemy) => enemy.atk > 0).map((enemy) => [
    enemy.name,
    enemy.type,
    enemy.atk,
    enemy.superAttack.damage
  ]));
}

function legacyStageSignatureAtkOnly(stage) {
  return JSON.stringify(stage.bosses.map((enemy) => [enemy.name, enemy.type, enemy.baseAtk]));
}

function cachedStageSignatureAtkOnly(stage) {
  return JSON.stringify(stage.enemies.filter((enemy) => enemy.atk > 0).map((enemy) => [enemy.name, enemy.type, enemy.atk]));
}

function addToMapList(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function flattenLegacy(data) {
  const stages = [];
  for (const event of data) {
    for (const series of event.series ?? []) {
      for (const stage of series.stages ?? []) {
        stages.push({
          eventType: event.eventType,
          seriesName: series.seriesName,
          stageName: stage.stageName,
          bosses: stage.bosses ?? []
        });
      }
    }
  }
  return stages;
}

function countPresent(items, getter, predicate = (value) => value != null) {
  return items.reduce((count, item) => count + (predicate(getter(item)) ? 1 : 0), 0);
}

function duplicateStats(values) {
  const counts = new Map();
  for (const value of values) {
    if (value == null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const duplicateGroups = [...counts.values()].filter((count) => count > 1);
  return {
    distinct: counts.size,
    duplicateValueCount: duplicateGroups.length,
    duplicateOccurrencesBeyondFirst: duplicateGroups.reduce((sum, count) => sum + count - 1, 0),
    maximumOccurrences: duplicateGroups.length ? Math.max(...duplicateGroups) : 1
  };
}

function valueCounts(values) {
  const counts = {};
  for (const value of values) {
    const key = value == null ? '(missing)' : String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function conditionCounts(enemies) {
  const patterns = {
    critical: /会心/,
    turn: /ターン|ラウンド/,
    receivedHit: /攻撃される|攻撃を受け|被弾/,
    hp: /HP\s*\d+%|HPが|残りHP/,
    appearance: /登場から|登場時/,
    attackUp: /ATK.*(?:UP|アップ|上昇)/i,
    defenseDown: /DEF.*(?:DOWN|ダウン|低下)|DEFを.*低下/i,
    stun: /気絶/,
    seal: /必殺技.*封じ|必殺技封じ/,
    attackDisable: /攻撃無効|無効化/,
    areaOrAllTarget: /全体攻撃|エリアダメージ/,
    countdown: /カウントダウン/
  };
  const counts = Object.fromEntries(Object.keys(patterns).map((key) => [key, 0]));
  for (const enemy of enemies) {
    const text = [
      enemy.superAttack.name,
      enemy.superAttack.description,
      ...enemy.skills.map((skill) => skill.description)
    ].filter(Boolean).join(' ');
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) counts[key] += 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, coverage(count, enemies.length)]));
}

function summarizeFields(stages) {
  const enemies = stages.flatMap((stage) => stage.enemies);
  const combatEnemies = enemies.filter((enemy) => enemy.atk > 0);
  const groups = stages.flatMap((stage) => stage.groups);
  const skills = enemies.flatMap((enemy) => enemy.skills);
  const actions = groups.flatMap((group) => group.actions);
  const total = enemies.length;

  const enemyFields = {
    eventId: countPresent(enemies, (enemy) => enemy.eventId),
    stageId: countPresent(enemies, (enemy) => enemy.stageId),
    encounterAndOrder: countPresent(enemies, (enemy) => enemy.encounterIndex, Number.isInteger),
    name: countPresent(enemies, (enemy) => enemy.name, Boolean),
    cardId: countPresent(enemies, (enemy) => enemy.cardId),
    thumbId: countPresent(enemies, (enemy) => enemy.thumbId),
    class: countPresent(enemies, (enemy) => enemy.class),
    type: countPresent(enemies, (enemy) => enemy.type),
    hp: countPresent(enemies, (enemy) => enemy.hp),
    atk: countPresent(enemies, (enemy) => enemy.atk),
    def: countPresent(enemies, (enemy) => enemy.def),
    damageReductionPercent: countPresent(enemies, (enemy) => enemy.damageReductionPercent),
    maxAttacksPerTurn: countPresent(enemies, (enemy) => enemy.maxAttacksPerTurn),
    superAttackName: countPresent(enemies, (enemy) => enemy.superAttack.name),
    superAttackDescription: countPresent(enemies, (enemy) => enemy.superAttack.description),
    superAttackDamage: countPresent(enemies, (enemy) => enemy.superAttack.damage),
    superAttackMultiplier: countPresent(enemies, (enemy) => enemy.superAttack.multiplier),
    superAttackProbabilityPercent: countPresent(enemies, (enemy) => enemy.superAttack.probabilityPercent),
    superAttackMaxPerTurn: countPresent(enemies, (enemy) => enemy.superAttack.maxPerTurn),
    superAttackCooldownTurns: countPresent(enemies, (enemy) => enemy.superAttack.cooldownTurns),
    superAttackType: countPresent(enemies, (enemy) => enemy.superAttack.attackType),
    superAttackEffectIcons: countPresent(enemies, (enemy) => enemy.superAttack.effectIcons, (icons) => icons.length > 0),
    oneOrMoreSkills: countPresent(enemies, (enemy) => enemy.skills, (entries) => entries.length > 0)
  };

  const actionTypes = {};
  for (const action of actions) {
    const key = action.type || '(unparsed)';
    actionTypes[key] = (actionTypes[key] ?? 0) + 1;
  }

  const multiEnemyGroups = groups.filter((group) => group.enemyCount > 1);
  const areaDamageGroups = groups.filter((group) => group.areaDamage != null);

  return {
    enemyFields: Object.fromEntries(Object.entries(enemyFields).map(([key, count]) => [key, coverage(count, total)])),
    skills: {
      enemiesWithSkills: coverage(enemyFields.oneOrMoreSkills, total),
      entries: skills.length,
      entriesWithStableId: coverage(countPresent(skills, (skill) => skill.id), skills.length),
      entriesWithDescription: coverage(countPresent(skills, (skill) => skill.description, Boolean), skills.length),
      entriesWithProbability: coverage(countPresent(skills, (skill) => skill.probabilityPercent), skills.length),
      entriesWithIcon: coverage(countPresent(skills, (skill) => skill.icons, (icons) => icons.length > 0), skills.length),
      uniqueSkillIds: new Set(skills.map((skill) => skill.id).filter((id) => id != null)).size,
      uniqueDescriptions: new Set(skills.map((skill) => skill.description).filter(Boolean)).size
    },
    combatRows: {
      rowsWithPositiveAtk: coverage(combatEnemies.length, total),
      def: coverage(countPresent(combatEnemies, (enemy) => enemy.def), combatEnemies.length),
      classSuperOrExtreme: coverage(combatEnemies.filter((enemy) => enemy.class === 'super' || enemy.class === 'extreme').length, combatEnemies.length),
      superAttackDamage: coverage(countPresent(combatEnemies, (enemy) => enemy.superAttack.damage), combatEnemies.length)
    },
    distributions: {
      class: valueCounts(enemies.map((enemy) => enemy.class)),
      type: valueCounts(enemies.map((enemy) => enemy.type)),
      typeIconId: valueCounts(enemies.map((enemy) => enemy.typeIconId))
    },
    identifiers: {
      cardLinks: coverage(countPresent(enemies, (enemy) => enemy.cardId), total),
      distinctCardIds: new Set(enemies.map((enemy) => enemy.cardId).filter((id) => id != null)).size,
      distinctThumbIds: new Set(enemies.map((enemy) => enemy.thumbId).filter((id) => id != null)).size,
      ezaCardLinks: enemies.filter((enemy) => enemy.isEzaCardLink).length,
      cardIdEqualsThumbId: enemies.filter((enemy) => enemy.cardId != null && enemy.cardId === enemy.thumbId).length,
      cardIdDiffersFromThumbId: enemies.filter((enemy) => enemy.cardId != null && enemy.thumbId != null && enemy.cardId !== enemy.thumbId).length
    },
    aiActions: {
      groupsWithRenderedActions: coverage(groups.filter((group) => group.actions.length > 0).length, groups.length),
      entries: actions.length,
      parsedEntries: coverage(actions.filter((action) => action.type && action.order != null && action.probabilityPercent != null).length, actions.length),
      types: actionTypes,
      maximumRenderedPosition: actions.length ? Math.max(...actions.map((action) => action.order ?? 0)) : 0
    },
    areaDamage: {
      groupsWithRenderedAreaDamage: coverage(areaDamageGroups.length, groups.length),
      maxPerTurn: coverage(areaDamageGroups.filter((group) => group.areaDamage.maxPerTurn != null).length, areaDamageGroups.length),
      firstTargetDamage: coverage(areaDamageGroups.filter((group) => group.areaDamage.firstTargetDamage != null).length, areaDamageGroups.length),
      additionalTargetDamage: coverage(areaDamageGroups.filter((group) => group.areaDamage.additionalTargetDamage != null).length, areaDamageGroups.length)
    },
    grouping: {
      groups: groups.length,
      singleEnemyGroups: groups.filter((group) => group.enemyCount === 1).length,
      multiEnemyGroups: multiEnemyGroups.length,
      maximumEnemiesInGroup: groups.length ? Math.max(...groups.map((group) => group.enemyCount)) : 0,
      note: 'Encounter/order is recoverable; whether multiple rows are phases or simultaneous enemies is not encoded reliably in the HTML.'
    },
    conditions: conditionCounts(enemies)
  };
}

function emptyMatchTier() {
  return { uniqueStages: 0, ambiguousStages: 0, unmatchedStages: 0, uniqueBosses: 0, ambiguousBosses: 0, unmatchedBosses: 0 };
}

function addMatchTier(tier, candidateCount, bosses) {
  if (candidateCount === 1) {
    tier.uniqueStages += 1;
    tier.uniqueBosses += bosses;
  } else if (candidateCount > 1) {
    tier.ambiguousStages += 1;
    tier.ambiguousBosses += bosses;
  } else {
    tier.unmatchedStages += 1;
    tier.unmatchedBosses += bosses;
  }
}

function finalizeMatchTier(tier, totalStages, totalBosses) {
  return {
    ...tier,
    anyCandidateStages: coverage(tier.uniqueStages + tier.ambiguousStages, totalStages),
    uniqueCandidateStages: coverage(tier.uniqueStages, totalStages),
    anyCandidateBosses: coverage(tier.uniqueBosses + tier.ambiguousBosses, totalBosses),
    uniqueCandidateBosses: coverage(tier.uniqueBosses, totalBosses)
  };
}

function matchLegacyToCache(legacyStages, cachedStages) {
  const exactMap = new Map();
  const withoutClassMap = new Map();
  const atkOnlyMap = new Map();
  const humanMap = new Map();
  for (const stage of cachedStages) {
    addToMapList(exactMap, stageExactKey(stage, cachedStageSignature(stage)), stage);
    addToMapList(withoutClassMap, stageExactKey(stage, cachedStageSignatureWithoutClass(stage)), stage);
    addToMapList(atkOnlyMap, stageExactKey(stage, cachedStageSignatureAtkOnly(stage)), stage);
    addToMapList(humanMap, stageHumanKey(stage), stage);
  }

  const result = {
    uniqueStages: 0,
    ambiguousStages: 0,
    unmatchedStages: 0,
    uniqueBosses: 0,
    ambiguousStageBosses: 0,
    unmatchedStageBosses: 0,
    candidateMultiplicity: {},
    resolvedEventAndStageIds: 0,
    bossCardId: { stableComplete: 0, stableButSomeMissing: 0, ambiguous: 0, missing: 0 },
    ambiguousSamples: [],
    unmatchedSamples: [],
    fallbackBossesWithinSameHumanPath: { unique: 0, ambiguous: 0, unmatched: 0 }
  };
  const alternateTiers = {
    withoutClass: emptyMatchTier(),
    withoutClassAndSuperAttackDamage: emptyMatchTier(),
    humanPathOnly: emptyMatchTier()
  };
  let neutralIconRowsPreviouslyDefaultedExtreme = 0;
  const uniqueAtkSequenceFieldComparison = {
    pairedBosses: 0,
    classExact: 0,
    neutralSourceVersusLegacyExtreme: 0,
    otherClassMismatch: 0,
    superAttackDamageExact: 0,
    sourceHasNoSuperAttackDamageButLegacySynthesizedOne: 0,
    otherSuperAttackDamageMismatch: 0
  };
  const atkOnlyUnmatchedSamples = [];
  const matchedCachedStageIds = new Set();

  for (const legacyStage of legacyStages) {
    const signature = legacyStageSignature(legacyStage);
    const candidates = exactMap.get(stageExactKey(legacyStage, signature)) ?? [];
    const withoutClassCandidates = withoutClassMap.get(stageExactKey(legacyStage, legacyStageSignatureWithoutClass(legacyStage))) ?? [];
    const atkOnlyCandidates = atkOnlyMap.get(stageExactKey(legacyStage, legacyStageSignatureAtkOnly(legacyStage))) ?? [];
    const pathCandidates = humanMap.get(stageHumanKey(legacyStage)) ?? [];
    addMatchTier(alternateTiers.withoutClass, withoutClassCandidates.length, legacyStage.bosses.length);
    addMatchTier(alternateTiers.withoutClassAndSuperAttackDamage, atkOnlyCandidates.length, legacyStage.bosses.length);
    addMatchTier(alternateTiers.humanPathOnly, pathCandidates.length, legacyStage.bosses.length);
    if (atkOnlyCandidates.length === 0 && atkOnlyUnmatchedSamples.length < 10) {
      atkOnlyUnmatchedSamples.push({
        eventType: legacyStage.eventType,
        seriesName: legacyStage.seriesName,
        stageName: legacyStage.stageName,
        bosses: legacyStage.bosses.map((boss) => ({ name: boss.name, class: boss.class, type: boss.type, baseAtk: boss.baseAtk }))
      });
    }
    if (atkOnlyCandidates.length === 1) {
      const cachedCombatEnemies = atkOnlyCandidates[0].enemies.filter((enemy) => enemy.atk > 0);
      for (let index = 0; index < legacyStage.bosses.length; index += 1) {
        const legacyBoss = legacyStage.bosses[index];
        const cachedEnemy = cachedCombatEnemies[index];
        if (!cachedEnemy) continue;
        uniqueAtkSequenceFieldComparison.pairedBosses += 1;
        if (legacyBoss.class === cachedEnemy.class) uniqueAtkSequenceFieldComparison.classExact += 1;
        else if (legacyBoss.class === 'extreme' && cachedEnemy.class === 'neutral') uniqueAtkSequenceFieldComparison.neutralSourceVersusLegacyExtreme += 1;
        else uniqueAtkSequenceFieldComparison.otherClassMismatch += 1;

        const legacyDamage = legacyBoss.baseAtk != null && legacyBoss.saMulti != null
          ? Math.round(legacyBoss.baseAtk * legacyBoss.saMulti)
          : null;
        const cachedDamage = cachedEnemy.superAttack.damage;
        if (legacyDamage === cachedDamage) uniqueAtkSequenceFieldComparison.superAttackDamageExact += 1;
        else if (cachedDamage == null && legacyDamage != null) uniqueAtkSequenceFieldComparison.sourceHasNoSuperAttackDamageButLegacySynthesizedOne += 1;
        else uniqueAtkSequenceFieldComparison.otherSuperAttackDamageMismatch += 1;
      }
    }
    if (withoutClassCandidates.length === 1) {
      const cachedCombatEnemies = withoutClassCandidates[0].enemies.filter((enemy) => enemy.atk > 0);
      for (let index = 0; index < legacyStage.bosses.length; index += 1) {
        if (legacyStage.bosses[index]?.class === 'extreme' && cachedCombatEnemies[index]?.class === 'neutral') {
          neutralIconRowsPreviouslyDefaultedExtreme += 1;
        }
      }
    }
    const multiplicity = String(candidates.length);
    result.candidateMultiplicity[multiplicity] = (result.candidateMultiplicity[multiplicity] ?? 0) + 1;

    if (candidates.length === 1) {
      result.uniqueStages += 1;
      result.uniqueBosses += legacyStage.bosses.length;
      result.resolvedEventAndStageIds += 1;
      matchedCachedStageIds.add(`${candidates[0].eventId}:${candidates[0].stageId}`);
    } else if (candidates.length > 1) {
      result.ambiguousStages += 1;
      result.ambiguousStageBosses += legacyStage.bosses.length;
      for (const candidate of candidates) matchedCachedStageIds.add(`${candidate.eventId}:${candidate.stageId}`);
      if (result.ambiguousSamples.length < 10) {
        result.ambiguousSamples.push({
          eventType: legacyStage.eventType,
          seriesName: legacyStage.seriesName,
          stageName: legacyStage.stageName,
          candidates: candidates.map((candidate) => ({ eventId: candidate.eventId, stageId: candidate.stageId, sourceFile: candidate.sourceFile }))
        });
      }
    } else {
      result.unmatchedStages += 1;
      result.unmatchedStageBosses += legacyStage.bosses.length;
      if (result.unmatchedSamples.length < 30) {
        result.unmatchedSamples.push({
          eventType: legacyStage.eventType,
          seriesName: legacyStage.seriesName,
          stageName: legacyStage.stageName,
          bosses: legacyStage.bosses.length,
          cachedHumanPathCandidates: (humanMap.get(stageHumanKey(legacyStage)) ?? []).length
        });
      }
    }

    if (candidates.length > 0) {
      for (let index = 0; index < legacyStage.bosses.length; index += 1) {
        const values = candidates.map((candidate) => candidate.enemies.filter((enemy) => enemy.atk > 0)[index]?.cardId ?? null);
        const nonNull = new Set(values.filter((value) => value != null));
        if (nonNull.size === 0) result.bossCardId.missing += 1;
        else if (nonNull.size > 1) result.bossCardId.ambiguous += 1;
        else if (values.some((value) => value == null)) result.bossCardId.stableButSomeMissing += 1;
        else result.bossCardId.stableComplete += 1;
      }
    } else {
      const cachedEnemies = pathCandidates.flatMap((stage) => stage.enemies.filter((enemy) => enemy.atk > 0));
      for (const legacyBoss of legacyStage.bosses) {
        const fingerprint = legacyEnemyFingerprint(legacyBoss);
        const matches = cachedEnemies.filter((enemy) => cachedEnemyFingerprint(enemy) === fingerprint);
        if (matches.length === 1) result.fallbackBossesWithinSameHumanPath.unique += 1;
        else if (matches.length > 1) result.fallbackBossesWithinSameHumanPath.ambiguous += 1;
        else result.fallbackBossesWithinSameHumanPath.unmatched += 1;
      }
    }
  }

  const totalStages = legacyStages.length;
  const totalBosses = legacyStages.reduce((sum, stage) => sum + stage.bosses.length, 0);
  return {
    legacyStages: totalStages,
    legacyBosses: totalBosses,
    ...result,
    exactStageMatch: coverage(result.uniqueStages + result.ambiguousStages, totalStages),
    uniqueStageIdentityMatch: coverage(result.uniqueStages, totalStages),
    exactBossSequenceMatch: coverage(result.uniqueBosses + result.ambiguousStageBosses, totalBosses),
    uniqueBossIdentityMatch: coverage(result.uniqueBosses, totalBosses),
    alternateMatching: {
      withoutClass: finalizeMatchTier(alternateTiers.withoutClass, totalStages, totalBosses),
      withoutClassAndSuperAttackDamage: finalizeMatchTier(alternateTiers.withoutClassAndSuperAttackDamage, totalStages, totalBosses),
      humanPathOnly: finalizeMatchTier(alternateTiers.humanPathOnly, totalStages, totalBosses)
    },
    uniqueAtkSequenceFieldComparison,
    atkOnlyUnmatchedSamples,
    neutralIconRowsPreviouslyDefaultedExtreme,
    matchedCachedStageCandidates: matchedCachedStageIds.size,
    cachedStagesNotUsedByAnyExactMatch: cachedStages.length - matchedCachedStageIds.size
  };
}

async function main() {
  const [index, legacyData] = await Promise.all([
    readFile(INDEX_PATH, 'utf8').then(JSON.parse),
    readFile(LEGACY_DATA_PATH, 'utf8').then(JSON.parse)
  ]);

  const cachedStages = [];
  const missingFiles = [];
  let processed = 0;

  for (const event of index.events ?? []) {
    const eventId = numberFromUrl(event.url, /\/events\/challenge\/(\d+)/) ?? numberFromUrl(event.file, /event_(\d+)/);
    const classification = classifyCachedEvent(event.title);
    for (const stageIndexEntry of event.stages ?? []) {
      const stageId = numberFromUrl(stageIndexEntry.url, /\/events\/challenge\/\d+\/(\d+)/)
        ?? numberFromUrl(stageIndexEntry.file, /stage_\d+_(\d+)/);
      try {
        const html = await readFile(path.join(CACHE_DIR, stageIndexEntry.file), 'utf8');
        cachedStages.push(parseCachedStageHtml(html, {
          eventId,
          eventTitle: event.title,
          ...classification,
          stageId,
          sourceFile: stageIndexEntry.file
        }));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        missingFiles.push(stageIndexEntry.file);
      }
      processed += 1;
      if (process.stdout.isTTY && processed % 100 === 0) process.stdout.write(`Parsed ${processed} cached stages...\r`);
    }
  }

  const legacyStages = flattenLegacy(legacyData);
  const enemies = cachedStages.flatMap((stage) => stage.enemies);
  const groups = cachedStages.flatMap((stage) => stage.groups);
  const stageIds = cachedStages.map((stage) => stage.stageId);
  const eventIds = cachedStages.map((stage) => stage.eventId);
  const sourceIdentityKeys = enemies.map((enemy) => `${enemy.eventId}:${enemy.stageId}:${enemy.encounterIndex}:${enemy.orderInEncounter}`);
  const withinStageFingerprints = enemies.map((enemy) => `${enemy.eventId}:${enemy.stageId}:${cachedEnemyFingerprint(enemy)}`);
  const stageSignatures = cachedStages.map(cachedStageSignature);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    analysisMode: 'offline-read-only',
    source: {
      cacheIndex: path.relative(REPO_ROOT, INDEX_PATH).replaceAll('\\', '/'),
      cacheDownloadedAt: index.downloadedAt,
      productionComparisonData: path.relative(REPO_ROOT, LEGACY_DATA_PATH).replaceAll('\\', '/'),
      networkRequests: 0,
      productionFilesWritten: 0
    },
    inventory: {
      indexedEvents: index.events?.length ?? 0,
      distinctEventIds: new Set(eventIds.filter((id) => id != null)).size,
      indexedStages: processed,
      parsedStages: cachedStages.length,
      missingStageFiles: missingFiles,
      encounterGroups: cachedStages.reduce((sum, stage) => sum + stage.groups.length, 0),
      cachedEnemyRows: enemies.length,
      cachedEnemyRowsWithPositiveAtk: enemies.filter((enemy) => enemy.atk > 0).length,
      orphanTypeIcons: cachedStages.reduce((sum, stage) => sum + stage.orphanTypeIcons, 0),
      distinctCardIds: new Set(enemies.map((enemy) => enemy.cardId).filter((id) => id != null)).size,
      distinctThumbIds: new Set(enemies.map((enemy) => enemy.thumbId).filter((id) => id != null)).size
    },
    recoverability: summarizeFields(cachedStages),
    matching: matchLegacyToCache(legacyStages, cachedStages),
    duplicatesAndAmbiguity: {
      eventIdsAcrossStageFiles: duplicateStats(eventIds),
      stageIds: duplicateStats(stageIds),
      structuralEnemyIdentity: duplicateStats(sourceIdentityKeys),
      cardIds: duplicateStats(enemies.map((enemy) => enemy.cardId)),
      sameEnemyFingerprintWithinStage: duplicateStats(withinStageFingerprints),
      stageBossSequenceSignaturesIgnoringPath: duplicateStats(stageSignatures),
      explanation: 'Repeated card IDs and fingerprints are expected reuse, not automatically data corruption. Structural identity must include eventId, stageId, encounterIndex, and orderInEncounter.'
    },
    representativeSamples: {
      rowsWithoutBattleStats: enemies.filter((enemy) => enemy.atk == null).slice(0, 10).map((enemy) => ({
        eventId: enemy.eventId,
        stageId: enemy.stageId,
        stageName: enemy.stageName,
        encounterIndex: enemy.encounterIndex,
        orderInEncounter: enemy.orderInEncounter,
        name: enemy.name,
        cardId: enemy.cardId,
        class: enemy.class,
        type: enemy.type
      })),
      neutralClassRows: enemies.filter((enemy) => enemy.class === 'neutral').slice(0, 10).map((enemy) => ({
        eventId: enemy.eventId,
        stageId: enemy.stageId,
        name: enemy.name,
        cardId: enemy.cardId,
        typeIconId: enemy.typeIconId,
        atk: enemy.atk
      })),
      combatRowsWithoutRenderedSuperAttackDamage: enemies.filter((enemy) => enemy.atk > 0 && enemy.superAttack.damage == null).slice(0, 10).map((enemy) => ({
        eventId: enemy.eventId,
        stageId: enemy.stageId,
        name: enemy.name,
        cardId: enemy.cardId,
        superAttackName: enemy.superAttack.name
      })),
      unparsedActionEntries: groups.flatMap((group) => group.actions).filter((action) => !action.type || action.probabilityPercent == null).slice(0, 20)
    },
    limitations: [
      'The cache is a point-in-time rendered snapshot, not an official stable API contract.',
      'eventId and stageId come from saved URLs; cardId comes from /cards links. A dedicated internal enemy-instance ID is not rendered for every row.',
      'encounterIndex/orderInEncounter are reproducible positions, but HTML alone does not consistently distinguish sequential phases from simultaneous enemies.',
      'Rendered action slots exist only for some encounter groups, so exact attack-position AI cannot be reconstructed for every enemy.',
      'Skill IDs and descriptions are recoverable where rendered, but internal parameters/triggers not shown in the page cannot be inferred safely.',
      'A card link may refer to an EZA/display record and the thumbnail ID can differ; retain both raw IDs and source URLs.',
      'No anti-bot measure was bypassed and no new request was made to DokkanInfo.'
    ],
    recommendedIdentity: {
      event: ['source', 'region', 'eventId'],
      stage: ['source', 'region', 'eventId', 'stageId'],
      enemyOccurrence: ['source', 'region', 'eventId', 'stageId', 'encounterIndex', 'orderInEncounter'],
      enemyEntityReference: ['cardId', 'thumbId'],
      warning: 'Do not use cardId alone as an occurrence ID; it repeats across stages and can differ from thumbId.'
    }
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    output: path.relative(REPO_ROOT, OUTPUT_PATH).replaceAll('\\', '/'),
    inventory: report.inventory,
    keyRecoverability: {
      cardId: report.recoverability.enemyFields.cardId,
      def: report.recoverability.enemyFields.def,
      maxAttacksPerTurn: report.recoverability.enemyFields.maxAttacksPerTurn,
      skills: report.recoverability.skills,
      aiActions: report.recoverability.aiActions,
      areaDamage: report.recoverability.areaDamage
    },
    matching: report.matching,
    duplicatesAndAmbiguity: report.duplicatesAndAmbiguity
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
