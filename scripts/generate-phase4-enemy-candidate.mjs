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
import { classifyCachedEvent, parseCachedStageHtml } from '../src/data-foundation/dokkaninfo-saved-stage.mjs';
import { futureEncounter } from '../src/data-foundation/dokkaninfo-saved-stage-v1.mjs';
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
