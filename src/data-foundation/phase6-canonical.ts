/**
 * Offline Phase 4 saved-cache adapter -> source-neutral canonical v2.
 *
 * The adapter deliberately performs no filesystem or network I/O. Provider
 * details stay in sourceRefs/sourceSnapshots; application IDs use a stable
 * region/event/stage/encounter path and never contain a provider name.
 */

import type {
  FutureAiAction,
  FutureAreaAttack,
  FutureCritical,
  FutureDataset,
  FutureEffect,
  FutureEnemy,
  FutureEvidence,
  FutureSuperAttack
} from '../data-migration/phase4-enemy-migration.js';
import type {
  CanonicalAiAction,
  CanonicalAlignment,
  CanonicalAreaAttack,
  CanonicalConfidence,
  CanonicalCritical,
  CanonicalEffect,
  CanonicalEnemy,
  CanonicalEnemyDatasetV2,
  CanonicalEnemyType,
  CanonicalEvidence,
  CanonicalField,
  CanonicalFieldState,
  CanonicalSourceRef,
  CanonicalSuperAttack,
  CanonicalSuperUsageRule,
  Phase4OfflineSourceAdapter,
  SourceAdapterContext,
  SourceAdapterResult
} from './phase6-types.js';

interface Phase4FieldState {
  fieldPath: string;
  state: 'source-not-rendered' | 'not-applicable' | 'parse-failed' | 'unconfirmed';
  notes: string;
}

interface Phase4Skill {
  skillId: string | null;
  description: string | null;
  probabilityPercent: number | null;
  rawText: string | null;
}

function confidence(value: string | null | undefined): CanonicalConfidence {
  if (value === 'high' || value === 'medium') return value;
  return 'unconfirmed';
}

function safeId(value: string | number): string {
  return encodeURIComponent(String(value)).replaceAll('%', '~');
}

function eventId(region: string, sourceEventId: string): string {
  return `${region}:event:${safeId(sourceEventId)}`;
}

function stageId(parentId: string, sourceStageId: string): string {
  return `${parentId}:stage:${safeId(sourceStageId)}`;
}

function encounterId(parentId: string, order: number): string {
  return `${parentId}:encounter:${order}`;
}

function enemyId(parentId: string, order: number): string {
  return `${parentId}:enemy:${order}`;
}

function sourceRef(
  snapshotId: string,
  entityKind: CanonicalSourceRef['entityKind'],
  sourceId: string | null,
  compositeKey: string,
  sourceUrl: string | null
): CanonicalSourceRef {
  return { sourceSnapshotId: snapshotId, entityKind, sourceId, compositeKey, sourceUrl };
}

function normalizeFieldState(state: Phase4FieldState['state']): CanonicalFieldState {
  if (state === 'source-not-rendered') return 'unavailable';
  if (state === 'not-applicable') return 'not-applicable';
  return 'unknown';
}

function stateMap(enemy: FutureEnemy): Map<string, Phase4FieldState> {
  const map = new Map<string, Phase4FieldState>();
  for (const item of enemy.fieldStates) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<Phase4FieldState>;
    if (typeof candidate.fieldPath !== 'string' || typeof candidate.state !== 'string') continue;
    if (!['source-not-rendered', 'not-applicable', 'parse-failed', 'unconfirmed'].includes(candidate.state)) continue;
    map.set(candidate.fieldPath, {
      fieldPath: candidate.fieldPath,
      state: candidate.state as Phase4FieldState['state'],
      notes: typeof candidate.notes === 'string' ? candidate.notes : ''
    });
  }
  return map;
}

function field<T>(
  value: T | null,
  path: string,
  states: Map<string, Phase4FieldState>,
  evidenceIds: string[],
  knownConfidence: CanonicalConfidence = 'high'
): CanonicalField<T> {
  const sourceState = states.get(path);
  if (sourceState) {
    return {
      state: normalizeFieldState(sourceState.state),
      value: null,
      evidenceIds,
      confidence: sourceState.state === 'unconfirmed' ? 'unconfirmed' : knownConfidence
    };
  }
  if (value == null) return { state: 'unknown', value: null, evidenceIds, confidence: 'unconfirmed' };
  return { state: 'known', value, evidenceIds, confidence: knownConfidence };
}

function enumField<T extends string>(
  value: T | 'unknown',
  path: string,
  states: Map<string, Phase4FieldState>,
  evidenceIds: string[]
): CanonicalField<T> {
  return field(value === 'unknown' ? null : value, path, states, evidenceIds);
}

function evidenceId(snapshotId: string, evidence: FutureEvidence): string {
  const material = evidence.sourceFile || evidence.sourceUrl || evidence.checkedAt;
  return `${snapshotId}:evidence:${safeId(material)}`;
}

function canonicalEvidence(snapshotId: string, item: FutureEvidence): CanonicalEvidence {
  return {
    id: evidenceId(snapshotId, item),
    sourceSnapshotId: snapshotId,
    sourceUrl: item.sourceUrl,
    sourceFile: item.sourceFile,
    observedAt: item.checkedAt,
    confidence: confidence(item.confidence),
    notes: item.notes
  };
}

function mapEffect(
  effect: FutureEffect,
  id: string,
  path: string,
  states: Map<string, Phase4FieldState>,
  evidenceIds: string[]
): CanonicalEffect {
  const effectConfidence = confidence(effect.confidence);
  return {
    id,
    trigger: {
      kind: effect.trigger.kind,
      start: field(effect.trigger.start, `${path}.trigger.start`, states, evidenceIds, effectConfidence),
      end: field(effect.trigger.end, `${path}.trigger.end`, states, evidenceIds, effectConfidence),
      hpMinPercent: field(effect.trigger.hpMinPercent, `${path}.trigger.hpMinPercent`, states, evidenceIds, effectConfidence),
      hpMaxPercent: field(effect.trigger.hpMaxPercent, `${path}.trigger.hpMaxPercent`, states, evidenceIds, effectConfidence),
      sourceText: field(effect.trigger.raw, `${path}.trigger.raw`, states, evidenceIds, effectConfidence)
    },
    appliesTo: effect.appliesTo,
    target: effect.target,
    operation: effect.operation,
    value: field(effect.value, `${path}.value`, states, evidenceIds, effectConfidence),
    cap: field(effect.cap, `${path}.cap`, states, evidenceIds, effectConfidence),
    durationTurns: field(effect.durationTurns, `${path}.durationTurns`, states, evidenceIds, effectConfidence),
    bracket: effect.bracket,
    sourceSkillId: field(effect.sourceSkillId, `${path}.sourceSkillId`, states, evidenceIds, effectConfidence),
    sourceText: field(effect.rawText, `${path}.rawText`, states, evidenceIds, effectConfidence),
    evidenceIds,
    confidence: effectConfidence
  };
}

function mapCritical(
  critical: FutureCritical,
  id: string,
  path: string,
  states: Map<string, Phase4FieldState>,
  evidenceIds: string[]
): CanonicalCritical {
  return {
    enabled: field(critical.enabled, `${path}.enabled`, states, evidenceIds),
    attackMultiplier: field(critical.attackMultiplier, `${path}.attackMultiplier`, states, evidenceIds),
    defenseIgnorePercent: field(critical.defenseIgnorePercent, `${path}.defenseIgnorePercent`, states, evidenceIds),
    rateRules: critical.rateRules.map((effect, index) => mapEffect(
      effect,
      `${id}:rate-rule:${index}`,
      `${path}.rateRules.${index}`,
      states,
      evidenceIds
    ))
  };
}

function mapUsageRule(
  rule: FutureSuperAttack['usageRules'][number],
  path: string,
  states: Map<string, Phase4FieldState>,
  evidenceIds: string[]
): CanonicalSuperUsageRule {
  return {
    order: rule.sourceOrder,
    hpMinPercent: field(rule.hpMinPercent, `${path}.hpMinPercent`, states, evidenceIds),
    hpMaxPercent: field(rule.hpMaxPercent, `${path}.hpMaxPercent`, states, evidenceIds),
    probabilityPercent: field(rule.probabilityPercent, `${path}.probabilityPercent`, states, evidenceIds),
    maxPerTurn: field(rule.maxPerTurn, `${path}.maxPerTurn`, states, evidenceIds),
    cooldownTurns: field(rule.cooldownTurns, `${path}.cooldownTurns`, states, evidenceIds),
    sourceText: field(rule.rawText, `${path}.rawText`, states, evidenceIds)
  };
}

function mapSuperAttack(
  attack: FutureSuperAttack,
  index: number,
  parentId: string,
  snapshotId: string,
  sourceUrl: string | null,
  states: Map<string, Phase4FieldState>,
  evidenceIds: string[]
): CanonicalSuperAttack {
  const id = `${parentId}:super:${index}`;
  const path = `attacks.superAttacks.${index}`;
  const critical = attack.criticalOverride == null
    ? field<CanonicalCritical>(null, `${path}.criticalOverride`, states, evidenceIds)
    : field(mapCritical(attack.criticalOverride, `${id}:critical`, `${path}.criticalOverride`, states, evidenceIds), `${path}.criticalOverride`, states, evidenceIds);
  return {
    id,
    sourceRefs: [sourceRef(snapshotId, 'super-attack', attack.skillId, `${parentId}:${index}`, sourceUrl)],
    name: field(attack.name, `${path}.name`, states, evidenceIds),
    description: field(attack.description, `${path}.description`, states, evidenceIds),
    displayedDamage: field(attack.displayedDamage, `${path}.displayedDamage`, states, evidenceIds),
    derivedMultiplier: field(attack.derivedMultiplier, `${path}.derivedMultiplier`, states, evidenceIds),
    probabilityPercent: field(attack.probabilityPercent, `${path}.probabilityPercent`, states, evidenceIds),
    maxPerTurn: field(attack.maxPerTurn, `${path}.maxPerTurn`, states, evidenceIds),
    cooldownTurns: field(attack.cooldownTurns, `${path}.cooldownTurns`, states, evidenceIds),
    slot: field(attack.slot, `${path}.slot`, states, evidenceIds),
    usageRules: attack.usageRules.map((rule, ruleIndex) => mapUsageRule(rule, `${path}.usageRules.${ruleIndex}`, states, evidenceIds)),
    targetMode: field(
      attack.targetMode === 'single' || attack.targetMode === 'all' ? attack.targetMode : null,
      `${path}.targetMode`,
      states,
      evidenceIds
    ),
    attackType: field(attack.attackType, `${path}.attackType`, states, evidenceIds),
    effects: attack.effects.map((effect, effectIndex) => mapEffect(effect, `${id}:effect:${effectIndex}`, `${path}.effects.${effectIndex}`, states, evidenceIds)),
    criticalOverride: critical
  };
}

function mapEnemy(
  enemy: FutureEnemy,
  parentId: string,
  snapshotId: string,
  sourceUrl: string | null
): CanonicalEnemy {
  const id = enemyId(parentId, enemy.orderInEncounter);
  const states = stateMap(enemy);
  const evidenceIds = [evidenceId(snapshotId, enemy.evidence)];
  const role = enemy.stats.baseAttack == null ? 'non-combat' : 'combat';
  const skills = enemy.skills as Phase4Skill[];
  return {
    id,
    sourceRefs: [sourceRef(
      snapshotId,
      'enemy',
      enemy.identity.sourceEnemyId ?? enemy.identity.cardId,
      enemy.occurrenceId,
      sourceUrl
    )],
    orderInEncounter: enemy.orderInEncounter,
    role: field(role, 'role', states, evidenceIds),
    name: field(enemy.name, 'name', states, evidenceIds),
    type: enumField(enemy.type as CanonicalEnemyType | 'unknown', 'type', states, evidenceIds),
    alignment: enumField(enemy.alignment as CanonicalAlignment | 'unknown', 'alignment', states, evidenceIds),
    externalIds: {
      sourceEnemyId: field(enemy.identity.sourceEnemyId, 'identity.sourceEnemyId', states, evidenceIds),
      cardId: field(enemy.identity.cardId, 'identity.cardId', states, evidenceIds),
      thumbId: field(enemy.identity.thumbId, 'identity.thumbId', states, evidenceIds)
    },
    isEzaCardLink: field(enemy.identity.isEzaCardLink, 'identity.isEzaCardLink', states, evidenceIds),
    stats: {
      hp: field(enemy.stats.hp, 'stats.hp', states, evidenceIds),
      baseAttack: field(enemy.stats.baseAttack, 'stats.baseAttack', states, evidenceIds),
      defense: field(enemy.stats.defense, 'stats.defense', states, evidenceIds),
      damageReductionPercent: field(enemy.stats.damageReductionPercent, 'stats.damageReductionPercent', states, evidenceIds),
      maxAttacksPerTurn: field(enemy.stats.maxAttacksPerTurn, 'stats.maxAttacksPerTurn', states, evidenceIds)
    },
    superAttacks: enemy.attacks.superAttacks.map((attack, index) => mapSuperAttack(
      attack,
      index,
      id,
      snapshotId,
      sourceUrl,
      states,
      evidenceIds
    )),
    passiveEffects: enemy.passiveEffects.map((effect, index) => mapEffect(
      effect,
      `${id}:passive:${index}`,
      `passiveEffects.${index}`,
      states,
      evidenceIds
    )),
    critical: mapCritical(enemy.critical, `${id}:critical`, 'critical', states, evidenceIds),
    skills: skills.map((skill, index) => ({
      id: `${id}:skill:${index}`,
      sourceRefs: [sourceRef(snapshotId, 'skill', skill.skillId, `${enemy.occurrenceId}:skill:${index}`, sourceUrl)],
      description: field(skill.description, `skills.${index}.description`, states, evidenceIds),
      probabilityPercent: field(skill.probabilityPercent, `skills.${index}.probabilityPercent`, states, evidenceIds),
      sourceText: field(skill.rawText, `skills.${index}.rawText`, states, evidenceIds)
    }))
  };
}

function mapAiAction(action: FutureAiAction, index: number, parentId: string, enemies: CanonicalEnemy[]): CanonicalAiAction {
  const target = action.enemyOrder == null ? null : enemies.find((enemy) => enemy.orderInEncounter === action.enemyOrder)?.id ?? null;
  const noStates = new Map<string, Phase4FieldState>();
  const noEvidence: string[] = [];
  return {
    id: `${parentId}:ai:${index}`,
    sequenceIndex: action.sequenceIndex,
    sourceOrder: action.sourceOrder,
    kind: action.kind,
    enemyId: field(target, 'enemyId', noStates, noEvidence),
    slot: field(action.slot, 'slot', noStates, noEvidence),
    probabilityPercent: field(action.probabilityPercent, 'probabilityPercent', noStates, noEvidence),
    hpMinPercent: field(action.hpMinPercent, 'hpMinPercent', noStates, noEvidence),
    hpMaxPercent: field(action.hpMaxPercent, 'hpMaxPercent', noStates, noEvidence),
    maxUses: field(action.maxUses, 'maxUses', noStates, noEvidence),
    cooldownTurns: field(action.cooldownTurns, 'cooldownTurns', noStates, noEvidence),
    sourceText: field(action.rawText, 'sourceText', noStates, noEvidence)
  };
}

function mapAreaAttack(area: FutureAreaAttack, index: number, parentId: string, enemyIdsBySource: Map<string, string>): CanonicalAreaAttack {
  const noStates = new Map<string, Phase4FieldState>();
  const evidenceIds: string[] = [];
  const sourceEnemyId = area.sourceOccurrenceId == null ? null : enemyIdsBySource.get(area.sourceOccurrenceId) ?? null;
  const attackKind = area.attackKind === 'normal' || area.attackKind === 'super' ? area.attackKind : 'other';
  const targetMode = area.targetMode === 'all' || area.targetMode === 'selected-and-others' ? area.targetMode : null;
  return {
    id: `${parentId}:area:${index}`,
    sourceEnemyId: field(sourceEnemyId, 'sourceEnemyId', noStates, evidenceIds),
    attackKind: field(attackKind, 'attackKind', noStates, evidenceIds),
    maxPerTurn: field(area.maxPerTurn, 'maxPerTurn', noStates, evidenceIds),
    firstTargetDamage: field(area.firstTargetDamage, 'firstTargetDamage', noStates, evidenceIds),
    additionalTargetDamage: field(area.additionalTargetDamage, 'additionalTargetDamage', noStates, evidenceIds),
    firstTargetMultiplier: field(area.firstTargetMultiplierDerived, 'firstTargetMultiplier', noStates, evidenceIds),
    additionalTargetMultiplier: field(area.additionalTargetMultiplierDerived, 'additionalTargetMultiplier', noStates, evidenceIds),
    targetMode: field(targetMode, 'targetMode', noStates, evidenceIds),
    sourceText: field(area.rawText, 'sourceText', noStates, evidenceIds)
  };
}

export function adaptPhase4OfflineCandidate(dataset: FutureDataset, context: SourceAdapterContext): SourceAdapterResult {
  const snapshotId = `snapshot:${safeId(dataset.sourceSnapshot.region)}:${safeId(dataset.datasetId)}`;
  const evidence = new Map<string, CanonicalEvidence>();
  for (const event of dataset.events) {
    for (const stage of event.stages) {
      for (const encounter of stage.encounters) {
        for (const enemy of encounter.enemies) {
          const item = canonicalEvidence(snapshotId, enemy.evidence);
          evidence.set(item.id, item);
        }
        for (const area of encounter.areaAttacks) {
          const item = canonicalEvidence(snapshotId, area.evidence);
          evidence.set(item.id, item);
        }
      }
    }
  }
  const noStates = new Map<string, Phase4FieldState>();
  const noEvidence: string[] = [];
  const canonical: CanonicalEnemyDatasetV2 = {
    schemaVersion: '2.0.0',
    datasetId: `canonical:${dataset.sourceSnapshot.region}:${dataset.datasetId}`,
    generatedAt: dataset.generatedAt,
    region: dataset.sourceSnapshot.region,
    sourceSnapshots: [{
      id: snapshotId,
      sourceKey: 'dokkaninfo-saved-cache',
      provider: dataset.sourceSnapshot.provider,
      region: dataset.sourceSnapshot.region,
      acquiredAt: dataset.sourceSnapshot.acquiredAt,
      publishedAt: null,
      revisedAt: null,
      importMethod: dataset.sourceSnapshot.importMethod,
      policyStatus: dataset.sourceSnapshot.policyStatus,
      parserVersion: dataset.sourceSnapshot.parserVersion,
      sourceRootUrl: dataset.sourceSnapshot.sourceRootUrl,
      contentDigest: dataset.sourceSnapshot.contentDigest,
      notes: dataset.sourceSnapshot.notes
    }],
    evidence: [...evidence.values()].sort((left, right) => left.id.localeCompare(right.id, 'en')),
    events: dataset.events.map((event) => {
      const id = eventId(dataset.sourceSnapshot.region, event.eventId);
      return {
        id,
        sourceRefs: [sourceRef(snapshotId, 'event', event.eventId, event.eventId, event.sourceUrl)],
        name: field(event.name, 'name', noStates, noEvidence),
        category: field(event.category, 'category', noStates, noEvidence),
        stages: event.stages.map((stage) => {
          const stageCanonicalId = stageId(id, stage.stageId);
          return {
            id: stageCanonicalId,
            sourceRefs: [sourceRef(snapshotId, 'stage', stage.stageId, `${event.eventId}:${stage.stageId}`, stage.sourceUrl)],
            name: field(stage.name, 'name', noStates, noEvidence),
            encounters: stage.encounters.map((encounter) => {
              const encounterCanonicalId = encounterId(stageCanonicalId, encounter.encounterIndex);
              const enemies = encounter.enemies.map((enemy) => mapEnemy(enemy, encounterCanonicalId, snapshotId, stage.sourceUrl));
              const enemyIdsBySource = new Map(encounter.enemies.map((enemy, index) => [enemy.occurrenceId, enemies[index]!.id]));
              return {
                id: encounterCanonicalId,
                sourceRefs: [sourceRef(snapshotId, 'encounter', encounter.phaseId, `${event.eventId}:${stage.stageId}:${encounter.encounterIndex}`, stage.sourceUrl)],
                order: encounter.encounterIndex,
                phaseId: field(encounter.phaseId, 'phaseId', noStates, noEvidence),
                layoutKind: field(
                  encounter.layoutKind === 'sequential' || encounter.layoutKind === 'simultaneous' || encounter.layoutKind === 'mixed'
                    ? encounter.layoutKind
                    : null,
                  'layoutKind',
                  noStates,
                  noEvidence
                ),
                enemies,
                aiActions: encounter.aiActions.map((action, index) => mapAiAction(action, index, encounterCanonicalId, enemies)),
                areaAttacks: encounter.areaAttacks.map((area, index) => mapAreaAttack(area, index, encounterCanonicalId, enemyIdsBySource))
              };
            })
          };
        })
      };
    }),
    manualCorrections: dataset.manualCorrections.map((item, index) => {
      const correction = item as Record<string, unknown>;
      return {
        id: typeof correction.id === 'string' ? correction.id : `correction:${index}`,
        sourceDatasetId: dataset.datasetId,
        sourceContentDigest: dataset.sourceSnapshot.contentDigest ?? context.inputDigest,
        targetEntityId: String(correction.targetEntityId ?? ''),
        fieldPath: String(correction.fieldPath ?? ''),
        expectedOriginalValue: correction.expectedOriginalValue ?? null,
        replacementValue: correction.replacementValue ?? null,
        reason: String(correction.reason ?? ''),
        evidenceUrls: Array.isArray(correction.evidenceUrls) ? correction.evidenceUrls.map(String) : [],
        reviewedAt: String(correction.reviewedAt ?? dataset.generatedAt),
        reviewedBy: String(correction.reviewedBy ?? 'unreviewed-import')
      };
    })
  };
  return {
    canonical,
    sourceMaterial: {
      sourceSnapshotId: snapshotId,
      inputFormat: 'phase4-enemy-data-v1',
      inputDatasetId: dataset.datasetId,
      inputPath: context.inputPath,
      inputDigest: context.inputDigest,
      inputBytes: context.inputBytes,
      reproducibleBy: context.reproducibleBy,
      retainedInformation: [
        'provider-specific raw display fields',
        'HTML-derived text and icon paths',
        'Phase 4 field-state notes',
        'source occurrence IDs and page URLs'
      ]
    }
  };
}

export const phase4OfflineAdapter: Phase4OfflineSourceAdapter = {
  descriptor: {
    adapterId: 'phase4-offline-saved-cache-to-canonical-v2',
    adapterVersion: '1.0.0',
    sourceKey: 'dokkaninfo-saved-cache',
    inputFormat: 'phase4-enemy-data-v1',
    outputSchemaVersion: '2.0.0',
    networkAccess: 'forbidden'
  },
  canHandle(input: unknown): input is FutureDataset {
    if (!input || typeof input !== 'object') return false;
    const candidate = input as Partial<FutureDataset>;
    return candidate.schemaVersion === 1
      && typeof candidate.datasetId === 'string'
      && Array.isArray(candidate.events)
      && candidate.sourceSnapshot?.importMethod === 'saved-cache';
  },
  adapt(input: FutureDataset, context: SourceAdapterContext): SourceAdapterResult {
    if (!this.canHandle(input)) throw new Error('Phase 4 offline adapter rejected the input contract.');
    return adaptPhase4OfflineCandidate(input, context);
  }
};
