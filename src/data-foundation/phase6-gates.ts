/** Offline update safety, permission, manifest, and release lifecycle gates. */

import type {
  ArtifactDescriptor,
  CanonicalEnemy,
  CanonicalEnemyDatasetV2,
  GateFinding,
  GateSeverity,
  PermissionDecision,
  PermissionEntry,
  PermissionGateResult,
  PermissionLedger,
  PermissionOperation,
  PreviousKnownGood,
  ReleaseManifestV1,
  ReleaseTransitionResult,
  RuntimeEnemyDatasetV1,
  UpdateIntegrityChecks,
  UpdateSafetyReport
} from './phase6-types.js';
import { countCanonicalRecords } from './phase6-runtime.js';

function allEnemies(dataset: CanonicalEnemyDatasetV2): CanonicalEnemy[] {
  return dataset.events.flatMap((event) => event.stages.flatMap((stage) => stage.encounters.flatMap((encounter) => encounter.enemies)));
}

function addFinding(
  findings: GateFinding[],
  severity: GateSeverity,
  code: string,
  message: string,
  details: GateFinding['details'] = {}
): void {
  findings.push({ severity, code, message, details });
}

function collectIds(dataset: CanonicalEnemyDatasetV2): string[] {
  const ids = [dataset.datasetId, ...dataset.sourceSnapshots.map((snapshot) => snapshot.id), ...dataset.evidence.map((item) => item.id)];
  for (const event of dataset.events) {
    ids.push(event.id);
    for (const stage of event.stages) {
      ids.push(stage.id);
      for (const encounter of stage.encounters) {
        ids.push(encounter.id, ...encounter.aiActions.map((item) => item.id), ...encounter.areaAttacks.map((item) => item.id));
        for (const enemy of encounter.enemies) {
          ids.push(enemy.id, ...enemy.superAttacks.map((item) => item.id), ...enemy.passiveEffects.map((item) => item.id), ...enemy.skills.map((item) => item.id));
          for (const attack of enemy.superAttacks) ids.push(...attack.effects.map((item) => item.id));
        }
      }
    }
  }
  return ids;
}

function compareCount(
  findings: GateFinding[],
  key: string,
  candidate: number,
  previous: number
): void {
  if (previous === 0) return;
  const ratio = (candidate - previous) / previous;
  if (ratio <= -0.2) {
    addFinding(findings, 'hard-fail', `COUNT_${key.toUpperCase()}_SEVERE_REDUCTION`, `${key}が前版から20%以上減少しました。`, { candidate, previous, percent: Math.round(ratio * 1000) / 10 });
  } else if (ratio <= -0.05) {
    addFinding(findings, 'review-required', `COUNT_${key.toUpperCase()}_REDUCTION`, `${key}が前版から5%以上減少しました。`, { candidate, previous, percent: Math.round(ratio * 1000) / 10 });
  } else if (ratio > 0) {
    addFinding(findings, 'informational', `COUNT_${key.toUpperCase()}_ADDITION`, `${key}が追加されました。追加だけでは危険扱いしません。`, { candidate, previous, added: candidate - previous });
  }
}

export function evaluateUpdateSafety(input: {
  candidate: CanonicalEnemyDatasetV2;
  runtime: RuntimeEnemyDatasetV1;
  integrity: UpdateIntegrityChecks;
  previousKnownGood: CanonicalEnemyDatasetV2 | null;
  evaluatedAt: string;
}): UpdateSafetyReport {
  const findings: GateFinding[] = [];
  const integrityLabels: Array<[keyof UpdateIntegrityChecks, string]> = [
    ['canonicalSchemaValid', 'CANONICAL_SCHEMA_INVALID'],
    ['runtimeSchemaValid', 'RUNTIME_SCHEMA_INVALID'],
    ['canonicalDigestMatches', 'CANONICAL_DIGEST_MISMATCH'],
    ['runtimeDigestMatches', 'RUNTIME_DIGEST_MISMATCH'],
    ['canonicalGenerationSucceeded', 'CANONICAL_GENERATION_FAILED'],
    ['runtimeGenerationSucceeded', 'RUNTIME_GENERATION_FAILED']
  ];
  for (const [key, code] of integrityLabels) {
    if (!input.integrity[key]) addFinding(findings, 'hard-fail', code, `${key}の安全検査に失敗しました。`);
  }

  const ids = collectIds(input.candidate);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) addFinding(findings, 'hard-fail', 'DUPLICATE_CANONICAL_ID', 'canonical IDが衝突しています。', { duplicateCount: new Set(duplicateIds).size, sample: duplicateIds[0] ?? null });

  const missingProvenance = input.candidate.events.reduce((total, event) => total
    + (event.sourceRefs.length === 0 ? 1 : 0)
    + event.stages.reduce((stageTotal, stage) => stageTotal
      + (stage.sourceRefs.length === 0 ? 1 : 0)
      + stage.encounters.reduce((encounterTotal, encounter) => encounterTotal
        + (encounter.sourceRefs.length === 0 ? 1 : 0)
        + encounter.enemies.filter((enemy) => enemy.sourceRefs.length === 0).length, 0), 0), 0);
  if (missingProvenance > 0 || input.candidate.sourceSnapshots.length === 0) {
    addFinding(findings, 'hard-fail', 'MISSING_PROVENANCE', '出典情報がないrecordを検出しました。', { missingRecords: missingProvenance, sourceSnapshots: input.candidate.sourceSnapshots.length });
  }

  const combat = allEnemies(input.candidate).filter((enemy) => enemy.role.state === 'known' && enemy.role.value === 'combat');
  const missingAttack = combat.filter((enemy) => enemy.stats.baseAttack.state !== 'known' || enemy.stats.baseAttack.value == null || enemy.stats.baseAttack.value < 0);
  if (missingAttack.length > 0) addFinding(findings, 'hard-fail', 'COMBAT_ATTACK_MISSING', '計算対象の敵に必須ATK欠損があります。', { affected: missingAttack.length, sample: missingAttack[0]?.id ?? null });
  const zeroAttack = combat.filter((enemy) => enemy.stats.baseAttack.state === 'known' && enemy.stats.baseAttack.value === 0);
  if (zeroAttack.length > Math.max(5, Math.ceil(combat.length * 0.01))) addFinding(findings, 'hard-fail', 'MASS_ZERO_ATTACK', 'ATK=0が不自然に大量発生しています。', { affected: zeroAttack.length, combatEnemies: combat.length });
  const unknownAttributes = combat.filter((enemy) => enemy.type.state !== 'known' || enemy.alignment.state !== 'known');
  if (unknownAttributes.length > Math.max(5, Math.ceil(combat.length * 0.02))) addFinding(findings, 'hard-fail', 'MASS_UNKNOWN_ATTRIBUTE', '属性または超極中立の欠損が大量発生しています。', { affected: unknownAttributes.length, combatEnemies: combat.length });

  const candidateCounts = countCanonicalRecords(input.candidate);
  const previousCounts = input.previousKnownGood == null ? null : countCanonicalRecords(input.previousKnownGood);
  if (input.previousKnownGood == null) {
    addFinding(findings, 'review-required', 'NO_CANONICAL_KNOWN_GOOD_BASELINE', '比較可能なcanonical known-goodがまだありません。初回候補は自動昇格させません。');
  } else {
    for (const key of ['events', 'stages', 'enemies'] as const) compareCount(findings, key, candidateCounts[key] ?? 0, previousCounts![key] ?? 0);
    const previousById = new Map(allEnemies(input.previousKnownGood).map((enemy) => [enemy.id, enemy]));
    let common = 0;
    let changedAttack = 0;
    let newlyUnknown = 0;
    for (const enemy of allEnemies(input.candidate)) {
      const previous = previousById.get(enemy.id);
      if (!previous) continue;
      common += 1;
      if (enemy.stats.baseAttack.state !== previous.stats.baseAttack.state || enemy.stats.baseAttack.value !== previous.stats.baseAttack.value) changedAttack += 1;
      if (previous.stats.baseAttack.state === 'known' && enemy.stats.baseAttack.state !== 'known') newlyUnknown += 1;
    }
    if (common > 0 && changedAttack / common > 0.3) addFinding(findings, 'hard-fail', 'MASS_ATTACK_CHANGE', '共通enemyのATKが30%超で一斉変更されています。', { common, changedAttack });
    else if (common > 0 && changedAttack / common > 0.1) addFinding(findings, 'review-required', 'MANY_ATTACK_CHANGES', '共通enemyのATKが10%超で変更されています。', { common, changedAttack });
    if (newlyUnknown > Math.max(5, Math.ceil(common * 0.01))) addFinding(findings, 'hard-fail', 'KNOWN_ATTACK_BECAME_UNKNOWN', '既知ATKが大量にunknownへ後退しました。', { common, newlyUnknown });
    const previousSnapshots = new Map(input.previousKnownGood.sourceSnapshots.map((snapshot) => [snapshot.sourceKey, snapshot]));
    for (const snapshot of input.candidate.sourceSnapshots) {
      const previous = previousSnapshots.get(snapshot.sourceKey);
      if (previous && Date.parse(snapshot.acquiredAt) < Date.parse(previous.acquiredAt)) addFinding(findings, 'hard-fail', 'SOURCE_SNAPSHOT_REGRESSION', 'source snapshotの取得時刻がknown-goodより後退しています。', { sourceKey: snapshot.sourceKey, candidate: snapshot.acquiredAt, previous: previous.acquiredAt });
    }
  }

  if (findings.length === 0) addFinding(findings, 'informational', 'ALL_SAFETY_CHECKS_PASSED', '異常を検出しませんでした。');
  const counts: Record<GateSeverity, number> = { 'hard-fail': 0, 'review-required': 0, informational: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return {
    gateVersion: '1.0.0',
    evaluatedAt: input.evaluatedAt,
    status: counts['hard-fail'] > 0 ? 'hard-fail' : counts['review-required'] > 0 ? 'review-required' : 'passed',
    counts,
    findings,
    candidateCounts,
    previousCounts
  };
}

const permissionProperty: Record<PermissionOperation, keyof Pick<PermissionEntry,
  'automaticFetch' | 'manualFetch' | 'offlineTransform' | 'redistributeRaw' | 'redistributeDerived' | 'publishDerived'>> = {
  'automatic-fetch': 'automaticFetch',
  'manual-fetch': 'manualFetch',
  'offline-transform': 'offlineTransform',
  'redistribute-raw': 'redistributeRaw',
  'redistribute-derived': 'redistributeDerived',
  'publish-derived': 'publishDerived'
};

export function evaluatePermission(ledger: PermissionLedger, sourceKey: string, operation: PermissionOperation): PermissionGateResult {
  const entry = ledger.entries.find((item) => item.sourceKey === sourceKey);
  const decision: PermissionDecision = entry?.[permissionProperty[operation]] ?? 'unknown';
  return {
    gateVersion: '1.0.0',
    sourceKey,
    operation,
    allowed: decision === 'allowed',
    decision,
    message: decision === 'allowed'
      ? `${sourceKey}の${operation}は台帳で許可されています。`
      : `${sourceKey}の${operation}は${decision}のため実行しません。`
  };
}

export function createPhase6PermissionLedger(generatedAt: string): PermissionLedger {
  return {
    schemaVersion: '1.0.0',
    ledgerId: 'dokkan-calc-source-permissions-v1',
    generatedAt,
    entries: [
      {
        sourceKey: 'dokkaninfo-saved-cache', displayName: 'Saved DokkanInfo HTML cache', acquisitionMode: 'offline-existing-copy',
        automaticFetch: 'denied', manualFetch: 'unknown', offlineTransform: 'allowed', redistributeRaw: 'denied', redistributeDerived: 'unknown', publishDerived: 'unknown',
        validFrom: null, validUntil: null, reviewedAt: generatedAt, evidenceUrls: [],
        notes: '既に保存済みのcacheだけをoffline fixtureとして変換可能。新規取得・本番公開の根拠にはしない。'
      },
      {
        sourceKey: 'dokkanstats', displayName: 'DokkanStats', acquisitionMode: 'written-permission-pending',
        automaticFetch: 'unknown', manualFetch: 'unknown', offlineTransform: 'unknown', redistributeRaw: 'unknown', redistributeDerived: 'unknown', publishDerived: 'unknown',
        validFrom: null, validUntil: null, reviewedAt: generatedAt, evidenceUrls: [],
        notes: 'ownerが問い合わせる予定。明示回答を記録するまで取得・変換・公開しない。'
      },
      {
        sourceKey: 'dokkaninfo-live', displayName: 'DokkanInfo live site', acquisitionMode: 'prohibited',
        automaticFetch: 'denied', manualFetch: 'unknown', offlineTransform: 'unknown', redistributeRaw: 'denied', redistributeDerived: 'unknown', publishDerived: 'unknown',
        validFrom: null, validUntil: null, reviewedAt: generatedAt, evidenceUrls: [],
        notes: '技術的access可否と許可を分離。現在の自動取得方式を再開しない。'
      },
      {
        sourceKey: 'dokkandb-live', displayName: 'DokkanDB live site', acquisitionMode: 'prohibited',
        automaticFetch: 'denied', manualFetch: 'unknown', offlineTransform: 'unknown', redistributeRaw: 'denied', redistributeDerived: 'unknown', publishDerived: 'unknown',
        validFrom: null, validUntil: null, reviewedAt: generatedAt, evidenceUrls: [],
        notes: 'Phase 5調査時点で正式feed・再配布許可が確認できていない。'
      }
    ]
  };
}

export function createReleaseManifest(input: {
  manifestId: string;
  datasetVersion: string;
  generatedAt: string;
  candidate: CanonicalEnemyDatasetV2;
  artifacts: ReleaseManifestV1['artifacts'];
  validation: UpdateSafetyReport;
  validationReportDigest: string;
  permissionLedgerDigest: string;
  offlineTransformAllowed: boolean;
  productionPublishAllowed: boolean;
  previousKnownGood: PreviousKnownGood;
}): ReleaseManifestV1 {
  return {
    manifestSchemaVersion: '1.0.0',
    manifestId: input.manifestId,
    datasetVersion: input.datasetVersion,
    generatedAt: input.generatedAt,
    channel: 'candidate',
    releaseState: 'candidate',
    canonicalSchemaVersion: '2.0.0',
    runtimeSchemaVersion: '1.0.0',
    sourceSnapshots: input.candidate.sourceSnapshots.map((snapshot) => ({
      id: snapshot.id,
      sourceKey: snapshot.sourceKey,
      acquiredAt: snapshot.acquiredAt,
      contentDigest: snapshot.contentDigest,
      policyStatus: snapshot.policyStatus
    })),
    artifacts: input.artifacts,
    counts: countCanonicalRecords(input.candidate),
    compatibleAppVersion: { minimum: 'future-phase7', maximum: null, productionAppReadsArtifact: false },
    previousKnownGood: input.previousKnownGood,
    validation: {
      status: input.validation.status,
      gateVersion: input.validation.gateVersion,
      hardFailCount: input.validation.counts['hard-fail'],
      reviewRequiredCount: input.validation.counts['review-required'],
      informationalCount: input.validation.counts.informational,
      reportDigest: input.validationReportDigest
    },
    permission: {
      ledgerDigest: input.permissionLedgerDigest,
      offlineTransformAllowed: input.offlineTransformAllowed,
      productionPublishAllowed: input.productionPublishAllowed
    }
  };
}

export function promoteRelease(
  manifest: ReleaseManifestV1,
  target: 'stable' | 'known-good',
  healthCheckPassed = false
): ReleaseTransitionResult {
  if (target === 'stable') {
    const allowed = manifest.releaseState === 'candidate'
      && manifest.validation.status === 'passed'
      && manifest.validation.hardFailCount === 0
      && manifest.validation.reviewRequiredCount === 0
      && manifest.permission.productionPublishAllowed;
    return {
      allowed,
      manifest: allowed ? { ...manifest, channel: 'stable', releaseState: 'stable' } : manifest,
      reason: allowed ? '安全・permission gateを通過したcandidateをstableへ昇格できます。' : '安全検査、review、または公開許可が未完了のためstableへ昇格できません。'
    };
  }
  const allowed = manifest.releaseState === 'stable' && healthCheckPassed;
  return {
    allowed,
    manifest: allowed ? { ...manifest, channel: 'stable', releaseState: 'known-good' } : manifest,
    reason: allowed ? 'stable版の端末health checkを通過したためknown-goodへ昇格できます。' : 'stable版と端末health check成功の両方が必要です。'
  };
}

export function verifyArtifactDescriptor(descriptor: ArtifactDescriptor): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(descriptor.digest) && descriptor.bytes > 0 && descriptor.path.length > 0;
}
