/**
 * Source-neutral Phase 6 data contracts.
 *
 * These types are offline-only in Phase 6. The production application does
 * not import them yet.
 */

import type { FutureDataset } from '../data-migration/phase4-enemy-migration.js';

export type CanonicalFieldState = 'known' | 'unknown' | 'unavailable' | 'not-applicable';
export type CanonicalConfidence = 'high' | 'medium' | 'unconfirmed';

export interface CanonicalField<T> {
  state: CanonicalFieldState;
  value: T | null;
  evidenceIds: string[];
  confidence: CanonicalConfidence;
}

export type CanonicalEnemyType = 'agl' | 'teq' | 'int' | 'str' | 'phy';
export type CanonicalAlignment = 'super' | 'extreme' | 'neutral';
export type CanonicalRecordRole = 'combat' | 'non-combat';

export interface CanonicalSourceSnapshot {
  id: string;
  sourceKey: string;
  provider: string;
  region: string;
  acquiredAt: string;
  publishedAt: string | null;
  revisedAt: string | null;
  importMethod: string;
  policyStatus: string;
  parserVersion: string;
  sourceRootUrl: string | null;
  contentDigest: string | null;
  notes: string;
}

export interface CanonicalSourceRef {
  sourceSnapshotId: string;
  entityKind: 'event' | 'stage' | 'encounter' | 'enemy' | 'super-attack' | 'skill';
  sourceId: string | null;
  compositeKey: string;
  sourceUrl: string | null;
}

export interface CanonicalEvidence {
  id: string;
  sourceSnapshotId: string;
  sourceUrl: string | null;
  sourceFile: string | null;
  observedAt: string;
  confidence: CanonicalConfidence;
  notes: string;
}

export interface CanonicalTrigger {
  kind: string;
  start: CanonicalField<number>;
  end: CanonicalField<number>;
  hpMinPercent: CanonicalField<number>;
  hpMaxPercent: CanonicalField<number>;
  sourceText: CanonicalField<string>;
}

export interface CanonicalEffect {
  id: string;
  trigger: CanonicalTrigger;
  appliesTo: string;
  target: string;
  operation: string;
  value: CanonicalField<number>;
  cap: CanonicalField<number>;
  durationTurns: CanonicalField<number>;
  bracket: string;
  sourceSkillId: CanonicalField<string>;
  sourceText: CanonicalField<string>;
  evidenceIds: string[];
  confidence: CanonicalConfidence;
}

export interface CanonicalCritical {
  enabled: CanonicalField<boolean>;
  attackMultiplier: CanonicalField<number>;
  defenseIgnorePercent: CanonicalField<number>;
  rateRules: CanonicalEffect[];
}

export interface CanonicalSuperUsageRule {
  order: number;
  hpMinPercent: CanonicalField<number>;
  hpMaxPercent: CanonicalField<number>;
  probabilityPercent: CanonicalField<number>;
  maxPerTurn: CanonicalField<number>;
  cooldownTurns: CanonicalField<number>;
  sourceText: CanonicalField<string>;
}

export interface CanonicalSuperAttack {
  id: string;
  sourceRefs: CanonicalSourceRef[];
  name: CanonicalField<string>;
  description: CanonicalField<string>;
  displayedDamage: CanonicalField<number>;
  derivedMultiplier: CanonicalField<number>;
  probabilityPercent: CanonicalField<number>;
  maxPerTurn: CanonicalField<number>;
  cooldownTurns: CanonicalField<number>;
  slot: CanonicalField<number>;
  usageRules: CanonicalSuperUsageRule[];
  targetMode: CanonicalField<'single' | 'all'>;
  attackType: CanonicalField<string>;
  effects: CanonicalEffect[];
  criticalOverride: CanonicalField<CanonicalCritical>;
}

export interface CanonicalSkill {
  id: string;
  sourceRefs: CanonicalSourceRef[];
  description: CanonicalField<string>;
  probabilityPercent: CanonicalField<number>;
  sourceText: CanonicalField<string>;
}

export interface CanonicalEnemy {
  id: string;
  sourceRefs: CanonicalSourceRef[];
  orderInEncounter: number;
  role: CanonicalField<CanonicalRecordRole>;
  name: CanonicalField<string>;
  type: CanonicalField<CanonicalEnemyType>;
  alignment: CanonicalField<CanonicalAlignment>;
  externalIds: {
    sourceEnemyId: CanonicalField<string>;
    cardId: CanonicalField<string>;
    thumbId: CanonicalField<string>;
  };
  isEzaCardLink: CanonicalField<boolean>;
  stats: {
    hp: CanonicalField<number>;
    baseAttack: CanonicalField<number>;
    defense: CanonicalField<number>;
    damageReductionPercent: CanonicalField<number>;
    maxAttacksPerTurn: CanonicalField<number>;
  };
  superAttacks: CanonicalSuperAttack[];
  passiveEffects: CanonicalEffect[];
  critical: CanonicalCritical;
  skills: CanonicalSkill[];
}

export interface CanonicalAiAction {
  id: string;
  sequenceIndex: number;
  sourceOrder: number;
  kind: string;
  enemyId: CanonicalField<string>;
  slot: CanonicalField<number>;
  probabilityPercent: CanonicalField<number>;
  hpMinPercent: CanonicalField<number>;
  hpMaxPercent: CanonicalField<number>;
  maxUses: CanonicalField<number>;
  cooldownTurns: CanonicalField<number>;
  sourceText: CanonicalField<string>;
}

export interface CanonicalAreaAttack {
  id: string;
  sourceEnemyId: CanonicalField<string>;
  attackKind: CanonicalField<'normal' | 'super' | 'other'>;
  maxPerTurn: CanonicalField<number>;
  firstTargetDamage: CanonicalField<number>;
  additionalTargetDamage: CanonicalField<number>;
  firstTargetMultiplier: CanonicalField<number>;
  additionalTargetMultiplier: CanonicalField<number>;
  targetMode: CanonicalField<'all' | 'selected-and-others'>;
  sourceText: CanonicalField<string>;
}

export interface CanonicalEncounter {
  id: string;
  sourceRefs: CanonicalSourceRef[];
  order: number;
  phaseId: CanonicalField<string>;
  layoutKind: CanonicalField<'sequential' | 'simultaneous' | 'mixed'>;
  enemies: CanonicalEnemy[];
  aiActions: CanonicalAiAction[];
  areaAttacks: CanonicalAreaAttack[];
}

export interface CanonicalStage {
  id: string;
  sourceRefs: CanonicalSourceRef[];
  name: CanonicalField<string>;
  encounters: CanonicalEncounter[];
}

export interface CanonicalEvent {
  id: string;
  sourceRefs: CanonicalSourceRef[];
  name: CanonicalField<string>;
  category: CanonicalField<string>;
  stages: CanonicalStage[];
}

export interface CanonicalManualCorrection {
  id: string;
  sourceDatasetId: string;
  sourceContentDigest: string;
  targetEntityId: string;
  fieldPath: string;
  expectedOriginalValue: unknown;
  replacementValue: unknown;
  reason: string;
  evidenceUrls: string[];
  reviewedAt: string;
  reviewedBy: string;
}

export interface CanonicalEnemyDatasetV2 {
  schemaVersion: '2.0.0';
  datasetId: string;
  generatedAt: string;
  region: string;
  sourceSnapshots: CanonicalSourceSnapshot[];
  evidence: CanonicalEvidence[];
  events: CanonicalEvent[];
  manualCorrections: CanonicalManualCorrection[];
}

export interface SourceMaterialReference {
  sourceSnapshotId: string;
  inputFormat: string;
  inputDatasetId: string;
  inputPath: string;
  inputDigest: string;
  inputBytes: number;
  reproducibleBy: string;
  retainedInformation: string[];
}

export interface SourceAdapterDescriptor {
  adapterId: string;
  adapterVersion: string;
  sourceKey: string;
  inputFormat: string;
  outputSchemaVersion: '2.0.0';
  networkAccess: 'forbidden';
}

export interface SourceAdapterContext {
  inputPath: string;
  inputDigest: string;
  inputBytes: number;
  reproducibleBy: string;
}

export interface SourceAdapterResult {
  canonical: CanonicalEnemyDatasetV2;
  sourceMaterial: SourceMaterialReference;
}

export interface SourceAdapter<TInput> {
  descriptor: SourceAdapterDescriptor;
  canHandle(input: unknown): input is TInput;
  adapt(input: TInput, context: SourceAdapterContext): SourceAdapterResult;
}

export type Phase4OfflineSourceAdapter = SourceAdapter<FutureDataset>;

export interface RuntimeField<T> {
  state: CanonicalFieldState;
  value: T | null;
}

export interface RuntimeEffect {
  id: string;
  trigger: {
    kind: string;
    start: RuntimeField<number>;
    end: RuntimeField<number>;
    hpMinPercent: RuntimeField<number>;
    hpMaxPercent: RuntimeField<number>;
  };
  appliesTo: string;
  target: string;
  operation: string;
  value: RuntimeField<number>;
  cap: RuntimeField<number>;
  durationTurns: RuntimeField<number>;
  bracket: string;
}

export interface RuntimeCritical {
  enabled: RuntimeField<boolean>;
  attackMultiplier: RuntimeField<number>;
  defenseIgnorePercent: RuntimeField<number>;
  rateRules: RuntimeEffect[];
}

export interface RuntimeSuperAttack {
  id: string;
  name: RuntimeField<string>;
  displayedDamage: RuntimeField<number>;
  derivedMultiplier: RuntimeField<number>;
  probabilityPercent: RuntimeField<number>;
  maxPerTurn: RuntimeField<number>;
  cooldownTurns: RuntimeField<number>;
  slot: RuntimeField<number>;
  usageRules: Array<{
    order: number;
    hpMinPercent: RuntimeField<number>;
    hpMaxPercent: RuntimeField<number>;
    probabilityPercent: RuntimeField<number>;
    maxPerTurn: RuntimeField<number>;
    cooldownTurns: RuntimeField<number>;
  }>;
  targetMode: RuntimeField<'single' | 'all'>;
  effects: RuntimeEffect[];
  criticalOverride: RuntimeField<RuntimeCritical>;
}

export interface RuntimeEnemy {
  id: string;
  orderInEncounter: number;
  role: RuntimeField<CanonicalRecordRole>;
  name: RuntimeField<string>;
  type: RuntimeField<CanonicalEnemyType>;
  alignment: RuntimeField<CanonicalAlignment>;
  baseAttack: RuntimeField<number>;
  superAttacks: RuntimeSuperAttack[];
  passiveEffects: RuntimeEffect[];
  critical: RuntimeCritical;
}

export interface RuntimeAreaAttack {
  id: string;
  sourceEnemyId: RuntimeField<string>;
  attackKind: RuntimeField<'normal' | 'super' | 'other'>;
  maxPerTurn: RuntimeField<number>;
  firstTargetDamage: RuntimeField<number>;
  additionalTargetDamage: RuntimeField<number>;
  firstTargetMultiplier: RuntimeField<number>;
  additionalTargetMultiplier: RuntimeField<number>;
  targetMode: RuntimeField<'all' | 'selected-and-others'>;
}

export interface RuntimeEncounter {
  id: string;
  order: number;
  enemies: RuntimeEnemy[];
  areaAttacks: RuntimeAreaAttack[];
}

export interface RuntimeStage {
  id: string;
  name: RuntimeField<string>;
  encounters: RuntimeEncounter[];
}

export interface RuntimeEvent {
  id: string;
  name: RuntimeField<string>;
  category: RuntimeField<string>;
  stages: RuntimeStage[];
}

export interface RuntimeEnemyDatasetV1 {
  schemaVersion: '1.0.0';
  datasetId: string;
  canonicalDatasetId: string;
  generatedAt: string;
  region: string;
  events: RuntimeEvent[];
}

export interface RuntimeOmission {
  fieldFamily: string;
  reason: string;
  retainedInCanonical: boolean;
  retainedInSourceMaterial: boolean;
}

export interface RuntimeProjectionReport {
  reportVersion: '1.0.0';
  canonicalDatasetId: string;
  runtimeDatasetId: string;
  requiredCalculationLosses: string[];
  omitted: RuntimeOmission[];
  counts: Record<string, number>;
}

export type GateSeverity = 'hard-fail' | 'review-required' | 'informational';

export interface GateFinding {
  severity: GateSeverity;
  code: string;
  message: string;
  details: Record<string, string | number | boolean | null>;
}

export interface UpdateIntegrityChecks {
  canonicalSchemaValid: boolean;
  runtimeSchemaValid: boolean;
  canonicalDigestMatches: boolean;
  runtimeDigestMatches: boolean;
  canonicalGenerationSucceeded: boolean;
  runtimeGenerationSucceeded: boolean;
}

export interface UpdateSafetyReport {
  gateVersion: '1.0.0';
  evaluatedAt: string;
  status: 'passed' | 'review-required' | 'hard-fail';
  counts: Record<GateSeverity, number>;
  findings: GateFinding[];
  candidateCounts: Record<string, number>;
  previousCounts: Record<string, number> | null;
}

export type PermissionAcquisitionMode =
  | 'automatic-approved'
  | 'manual-approved'
  | 'written-permission-pending'
  | 'offline-existing-copy'
  | 'prohibited';

export type PermissionDecision = 'allowed' | 'denied' | 'unknown';

export interface PermissionEntry {
  sourceKey: string;
  displayName: string;
  acquisitionMode: PermissionAcquisitionMode;
  automaticFetch: PermissionDecision;
  manualFetch: PermissionDecision;
  offlineTransform: PermissionDecision;
  redistributeRaw: PermissionDecision;
  redistributeDerived: PermissionDecision;
  publishDerived: PermissionDecision;
  validFrom: string | null;
  validUntil: string | null;
  reviewedAt: string;
  evidenceUrls: string[];
  notes: string;
}

export interface PermissionLedger {
  schemaVersion: '1.0.0';
  ledgerId: string;
  generatedAt: string;
  entries: PermissionEntry[];
}

export type PermissionOperation =
  | 'automatic-fetch'
  | 'manual-fetch'
  | 'offline-transform'
  | 'redistribute-raw'
  | 'redistribute-derived'
  | 'publish-derived';

export interface PermissionGateResult {
  gateVersion: '1.0.0';
  sourceKey: string;
  operation: PermissionOperation;
  allowed: boolean;
  decision: PermissionDecision;
  message: string;
}

export interface ArtifactDescriptor {
  path: string;
  digest: string;
  bytes: number;
  schemaVersion: string;
}

export interface PreviousKnownGood {
  datasetVersion: string;
  artifactDigest: string;
  manifestDigest: string | null;
  kind: 'legacy-production' | 'phase6-release';
}

export interface ReleaseManifestV1 {
  manifestSchemaVersion: '1.0.0';
  manifestId: string;
  datasetVersion: string;
  generatedAt: string;
  channel: 'candidate' | 'stable';
  releaseState: 'candidate' | 'stable' | 'known-good' | 'quarantined';
  canonicalSchemaVersion: '2.0.0';
  runtimeSchemaVersion: '1.0.0';
  sourceSnapshots: Array<{
    id: string;
    sourceKey: string;
    acquiredAt: string;
    contentDigest: string | null;
    policyStatus: string;
  }>;
  artifacts: {
    sourceInput: ArtifactDescriptor;
    canonical: ArtifactDescriptor;
    runtime: ArtifactDescriptor;
    validationReport: ArtifactDescriptor;
    omissionReport: ArtifactDescriptor;
  };
  counts: Record<string, number>;
  compatibleAppVersion: {
    minimum: string;
    maximum: string | null;
    productionAppReadsArtifact: boolean;
  };
  previousKnownGood: PreviousKnownGood;
  validation: {
    status: UpdateSafetyReport['status'];
    gateVersion: UpdateSafetyReport['gateVersion'];
    hardFailCount: number;
    reviewRequiredCount: number;
    informationalCount: number;
    reportDigest: string;
  };
  permission: {
    ledgerDigest: string;
    offlineTransformAllowed: boolean;
    productionPublishAllowed: boolean;
  };
}

export interface ReleaseTransitionResult {
  allowed: boolean;
  manifest: ReleaseManifestV1;
  reason: string;
}

