/**
 * Phase 4 trial types and pure migration functions.
 *
 * This module deliberately has no filesystem, browser, or network dependency.
 * The legacy application does not import it yet. It is used only by the offline
 * candidate generator and migration tests.
 */

export type EnemyType = 'agl' | 'teq' | 'int' | 'str' | 'phy' | 'unknown';
export type EnemyAlignment = 'super' | 'extreme' | 'neutral' | 'unknown';

export interface FutureEffect {
  effectId: string;
  trigger: {
    kind: string;
    start: number | null;
    end: number | null;
    hpMinPercent: number | null;
    hpMaxPercent: number | null;
    raw: string | null;
  };
  appliesTo: string;
  target: string;
  operation: string;
  value: number | null;
  cap: number | null;
  durationTurns: number | null;
  bracket: string;
  sourceSkillId: string | null;
  rawText: string | null;
  confidence: string;
}

export interface FutureSuperAttack {
  skillId: string | null;
  name: string | null;
  description: string | null;
  displayedDamage: number | null;
  derivedMultiplier: number | null;
  probabilityPercent: number | null;
  maxPerTurn: number | null;
  cooldownTurns: number | null;
  slot: number | null;
  usageRules: Array<{
    sourceOrder: number;
    hpMinPercent: number | null;
    hpMaxPercent: number | null;
    probabilityPercent: number | null;
    maxPerTurn: number | null;
    cooldownTurns: number | null;
    rawText: string;
  }>;
  targetMode: string;
  attackType: string | null;
  effectIcons: Array<{ alt: string | null; src: string | null }>;
  effects: FutureEffect[];
  criticalOverride: FutureCritical | null;
}

export interface FutureCritical {
  enabled: boolean | null;
  attackMultiplier: number | null;
  defenseIgnorePercent: number | null;
  rateRules: FutureEffect[];
}

export interface FutureEvidence {
  sourceUrl: string | null;
  sourceFile: string;
  checkedAt: string;
  confidence: string;
  notes: string;
}

export interface FutureAiAction {
  sequenceIndex: number;
  sourceOrder: number;
  kind: string;
  enemyOrder: number | null;
  slot: number | null;
  probabilityPercent: number | null;
  hpMinPercent: number | null;
  hpMaxPercent: number | null;
  maxUses: number | null;
  cooldownTurns: number | null;
  rawText: string;
}

export interface FutureAreaAttack {
  sourceOccurrenceId: string | null;
  attackKind: string;
  maxPerTurn: number | null;
  firstTargetDamage: number | null;
  additionalTargetDamage: number | null;
  firstTargetMultiplierDerived: number | null;
  additionalTargetMultiplierDerived: number | null;
  targetMode: string;
  evidence: FutureEvidence;
  rawText: string | null;
}

export interface FutureEnemy {
  occurrenceId: string;
  orderInEncounter: number;
  identity: {
    sourceEnemyId: string | null;
    cardId: string | null;
    thumbId: string | null;
    isEzaCardLink: boolean | null;
  };
  name: string;
  type: EnemyType;
  alignment: EnemyAlignment;
  stats: {
    hp: number | null;
    baseAttack: number | null;
    defense: number | null;
    damageReductionPercent: number | null;
    maxAttacksPerTurn: number | null;
  };
  attacks: { superAttacks: FutureSuperAttack[] };
  passiveEffects: FutureEffect[];
  critical: FutureCritical;
  skills: unknown[];
  evidence: FutureEvidence;
  fieldStates: unknown[];
  raw: Record<string, unknown>;
}

export interface FutureEncounter {
  encounterIndex: number;
  phaseId: string | null;
  layoutKind: string;
  enemies: FutureEnemy[];
  aiActions: FutureAiAction[];
  areaAttacks: FutureAreaAttack[];
}

export interface FutureStage {
  stageId: string;
  name: string;
  legacySeriesName: string | null;
  sourceUrl: string | null;
  encounters: FutureEncounter[];
}

export interface FutureEvent {
  eventId: string;
  name: string;
  category: string | null;
  legacyEventType: string | null;
  sourceUrl: string | null;
  stages: FutureStage[];
}

export interface FutureDataset {
  schemaVersion: number;
  datasetId: string;
  generatedAt: string;
  sourceSnapshot: {
    provider: string;
    region: string;
    acquiredAt: string;
    importMethod: string;
    policyStatus: string;
    parserVersion: string;
    sourceRootUrl: string | null;
    contentDigest: string | null;
    notes: string;
  };
  events: FutureEvent[];
  manualCorrections: unknown[];
}

export interface LegacyAttack {
  name: string;
  value: number;
  isCrit?: boolean;
}

export interface LegacyBoss {
  name: string;
  class: 'super' | 'extreme';
  type: Exclude<EnemyType, 'unknown'>;
  attacks: LegacyAttack[];
  baseAtk: number;
  saMulti: number | null;
  saBuffMod: number;
  aoeDamage: number;
  hasSaCrit: boolean;
  turnAtkUpStartTurn: number;
  turnAtkUp: number;
  turnAtkMax: number;
  hitAtkUp: number;
  hitAtkMax: number;
  hpAtkThreshold: number;
  hpAtkUp: number;
  appearEntries: Array<{ turn: number; cumulativeAtkUp: number }>;
  critAtkUp: number;
  critDefDown: number;
  isCriticalDefault: boolean;
  critHpThreshold: number;
  critHpRate: number;
  critTurnUp: number;
  critTurnMax: number;
  critFixedRate: number;
}

export interface LegacyStage {
  stageName: string;
  bosses: LegacyBoss[];
}

export interface LegacySeries {
  seriesName: string;
  stages: LegacyStage[];
}

export interface LegacyEvent {
  eventType: string;
  series: LegacySeries[];
}

export type NeutralCompatibilityPolicy = 'legacy-extreme' | 'reject';
export type MissingSuperCompatibilityPolicy = 'legacy-three' | 'preserve-null';

export interface CompatibilityOptions {
  neutralPolicy: NeutralCompatibilityPolicy;
  missingSuperPolicy: MissingSuperCompatibilityPolicy;
}

export type CompatibilitySeverity = 'loss' | 'warning' | 'informational';

export type CompatibilityCode =
  | 'NEUTRAL_MAPPED_TO_EXTREME'
  | 'UNKNOWN_ALIGNMENT'
  | 'UNKNOWN_TYPE'
  | 'MISSING_BASE_ATTACK'
  | 'MISSING_SUPER_SYNTHESIZED'
  | 'MISSING_SUPER_PRESERVED'
  | 'MULTIPLE_SUPER_ATTACKS_NOT_REPRESENTABLE'
  | 'SUPER_USAGE_RULES_NOT_REPRESENTABLE'
  | 'SUPER_CONDITION_NOT_REPRESENTABLE'
  | 'SUPER_EFFECT_NOT_REPRESENTABLE'
  | 'AOE_INFORMATION_LOSS'
  | 'AI_ACTIONS_NOT_REPRESENTABLE'
  | 'HP_CONDITION_NOT_REPRESENTABLE'
  | 'TURN_CONDITION_NOT_REPRESENTABLE'
  | 'PASSIVE_EFFECT_NOT_REPRESENTABLE'
  | 'CRITICAL_RULE_NOT_REPRESENTABLE'
  | 'HP_STAT_NOT_REPRESENTABLE'
  | 'DEFENSE_NOT_REPRESENTABLE'
  | 'DAMAGE_REDUCTION_NOT_REPRESENTABLE'
  | 'MAX_ATTACKS_NOT_REPRESENTABLE'
  | 'STABLE_AND_SOURCE_IDS_NOT_REPRESENTABLE'
  | 'EVIDENCE_NOT_REPRESENTABLE'
  | 'SKILLS_NOT_REPRESENTABLE'
  | 'SOURCE_SNAPSHOT_NOT_REPRESENTABLE'
  | 'MANUAL_CORRECTIONS_NOT_REPRESENTABLE';

export interface CompatibilityFinding {
  severity: CompatibilitySeverity;
  code: CompatibilityCode;
  scopeId: string;
  occurrenceId: string | null;
  fieldPaths: string[];
  message: string;
}

export interface EnemyCompatibilityResult {
  boss: LegacyBoss | null;
  findings: CompatibilityFinding[];
}

export interface CompatibilityFindingSummary {
  severity: CompatibilitySeverity;
  code: CompatibilityCode;
  affectedCount: number;
  sampleScopeIds: string[];
  fieldPaths: string[];
  message: string;
}

export interface CompatibilityReport {
  counts: Record<CompatibilitySeverity, number>;
  findings: CompatibilityFindingSummary[];
}

const DEFAULT_COMPATIBILITY_OPTIONS: CompatibilityOptions = {
  // A caller must consciously opt in to reproducing the old neutral->extreme
  // fallback. The safe default refuses that lossy conversion.
  neutralPolicy: 'reject',
  missingSuperPolicy: 'preserve-null'
};

function compatibilityFinding(
  severity: CompatibilitySeverity,
  code: CompatibilityCode,
  scopeId: string,
  fieldPaths: string[],
  message: string,
  occurrenceId: string | null = scopeId
): CompatibilityFinding {
  return { severity, code, scopeId, occurrenceId, fieldPaths, message };
}

function summarizeCompatibilityFindings(findings: CompatibilityFinding[]): CompatibilityReport {
  const grouped = new Map<string, CompatibilityFindingSummary>();
  const counts: CompatibilityReport['counts'] = { loss: 0, warning: 0, informational: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
    const key = JSON.stringify([finding.severity, finding.code, finding.fieldPaths, finding.message]);
    const existing = grouped.get(key);
    if (existing) {
      existing.affectedCount += 1;
      if (existing.sampleScopeIds.length < 5 && !existing.sampleScopeIds.includes(finding.scopeId)) {
        existing.sampleScopeIds.push(finding.scopeId);
      }
    } else {
      grouped.set(key, {
        severity: finding.severity,
        code: finding.code,
        affectedCount: 1,
        sampleScopeIds: [finding.scopeId],
        fieldPaths: finding.fieldPaths,
        message: finding.message
      });
    }
  }
  return {
    counts,
    findings: [...grouped.values()].sort((left, right) => (
      left.severity.localeCompare(right.severity, 'en')
      || left.code.localeCompare(right.code, 'en')
      || left.message.localeCompare(right.message, 'ja')
    ))
  };
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, item]) => [key, sortJsonValue(item)])
    );
  }
  return value;
}

/** Canonical pretty JSON: object keys sorted, array order retained, LF newline. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function matchingEffect(
  effects: FutureEffect[],
  triggerKind: string,
  target = 'attack'
): FutureEffect | undefined {
  return effects.find((effect) => effect.trigger.kind === triggerKind && effect.target === target);
}

function effectsByTrigger(effects: FutureEffect[], triggerKind: string): FutureEffect[] {
  return effects.filter((effect) => effect.trigger.kind === triggerKind && effect.target === 'attack');
}

function criticalRule(critical: FutureCritical, triggerKind: string): FutureEffect | undefined {
  return critical.rateRules.find((effect) => effect.trigger.kind === triggerKind);
}

function normalizeType(type: EnemyType): Exclude<EnemyType, 'unknown'> | null {
  return type === 'unknown' ? null : type;
}

/**
 * Convert one candidate enemy to the exact field family consumed by the old UI.
 * Lossy choices are explicit warnings; null and zero are never silently merged.
 */
export function candidateEnemyToLegacy(
  enemy: FutureEnemy,
  options: CompatibilityOptions = DEFAULT_COMPATIBILITY_OPTIONS,
  areaAttacks: FutureAreaAttack[] = []
): EnemyCompatibilityResult {
  const findings: CompatibilityFinding[] = [];
  const addFinding = (
    severity: CompatibilitySeverity,
    code: CompatibilityCode,
    fieldPaths: string[],
    message: string
  ): void => {
    findings.push(compatibilityFinding(severity, code, enemy.occurrenceId, fieldPaths, message));
  };

  addFinding(
    'loss',
    'STABLE_AND_SOURCE_IDS_NOT_REPRESENTABLE',
    ['occurrenceId', 'identity.sourceEnemyId', 'identity.cardId', 'identity.thumbId'],
    '現行boss形式には安定occurrence IDと取得元IDを保持する欄がありません。'
  );
  addFinding(
    'loss',
    'EVIDENCE_NOT_REPRESENTABLE',
    ['evidence', 'fieldStates'],
    '現行boss形式には出典・信頼度・field stateを保持する欄がありません。'
  );
  if (enemy.stats.hp != null) {
    addFinding('loss', 'HP_STAT_NOT_REPRESENTABLE', ['stats.hp'], '現行boss形式には敵HPを保持する欄がありません。');
  }
  if (enemy.stats.defense != null) {
    addFinding('loss', 'DEFENSE_NOT_REPRESENTABLE', ['stats.defense'], '現行boss形式には敵DEFを保持する欄がありません。');
  }
  if (enemy.stats.damageReductionPercent != null) {
    addFinding('loss', 'DAMAGE_REDUCTION_NOT_REPRESENTABLE', ['stats.damageReductionPercent'], '現行boss形式には敵ダメージ軽減率を保持する欄がありません。');
  }
  if (enemy.stats.maxAttacksPerTurn != null) {
    addFinding('loss', 'MAX_ATTACKS_NOT_REPRESENTABLE', ['stats.maxAttacksPerTurn'], '現行boss形式には最大攻撃回数を保持する欄がありません。');
  }
  if (enemy.skills.length > 0) {
    addFinding('loss', 'SKILLS_NOT_REPRESENTABLE', ['skills'], '現行boss形式には取得元のskill情報を保持する欄がありません。');
  }

  const superAttacks = enemy.attacks.superAttacks;
  if (superAttacks.length > 1) {
    addFinding(
      'loss',
      'MULTIPLE_SUPER_ATTACKS_NOT_REPRESENTABLE',
      ['attacks.superAttacks'],
      `現行boss形式は必殺を1種類しか表せないため、${superAttacks.length}種類のうち先頭以外が失われます。`
    );
  }
  if (superAttacks.some((attack) => attack.usageRules.length > 0)) {
    addFinding(
      'loss',
      'SUPER_USAGE_RULES_NOT_REPRESENTABLE',
      ['attacks.superAttacks[].usageRules'],
      '現行boss形式には必殺ごとのusage ruleを保持する欄がありません。'
    );
  }
  if (superAttacks.some((attack) => (
    attack.probabilityPercent != null
    || attack.maxPerTurn != null
    || attack.cooldownTurns != null
    || attack.slot != null
  ))) {
    addFinding(
      'loss',
      'SUPER_CONDITION_NOT_REPRESENTABLE',
      ['attacks.superAttacks[].probabilityPercent', 'attacks.superAttacks[].maxPerTurn', 'attacks.superAttacks[].cooldownTurns', 'attacks.superAttacks[].slot'],
      '現行boss形式には必殺の確率・回数・再使用・slot条件を保持する欄がありません。'
    );
  }
  if (superAttacks.some((attack) => attack.usageRules.some((rule) => rule.hpMinPercent != null || rule.hpMaxPercent != null))) {
    addFinding(
      'loss',
      'HP_CONDITION_NOT_REPRESENTABLE',
      ['attacks.superAttacks[].usageRules[].hpMinPercent', 'attacks.superAttacks[].usageRules[].hpMaxPercent'],
      '現行boss形式には必殺ごとのHP条件を保持する欄がありません。'
    );
  }
  if (superAttacks.some((attack) => attack.usageRules.some((rule) => rule.cooldownTurns != null))) {
    addFinding(
      'loss',
      'TURN_CONDITION_NOT_REPRESENTABLE',
      ['attacks.superAttacks[].usageRules[].cooldownTurns'],
      '現行boss形式には必殺ごとの再使用ターン条件を保持する欄がありません。'
    );
  }

  const firstSuper = superAttacks[0];
  const representedPostSuperEffect = firstSuper?.effects.find(
    (effect) => effect.target === 'attack' && effect.bracket === 'post-super' && effect.operation === 'add-percent'
  );
  const hasUnrepresentedSuperEffect = superAttacks.some((attack, attackIndex) => attack.effects.some(
    (effect) => attackIndex !== 0 || effect !== representedPostSuperEffect
  ));
  if (hasUnrepresentedSuperEffect) {
    addFinding(
      'loss',
      'SUPER_EFFECT_NOT_REPRESENTABLE',
      ['attacks.superAttacks[].effects'],
      '現行boss形式で表現できない必殺効果があります。'
    );
  }

  const supportedPassiveKinds = new Set(['elapsed-turn', 'received-hit-count', 'hp-range', 'appearance-turn']);
  const firstPassiveByKind = new Map<string, FutureEffect>();
  let hasUnrepresentedPassive = false;
  let hasUnrepresentedHpCondition = false;
  let hasUnrepresentedTurnCondition = false;
  for (const effect of enemy.passiveEffects) {
    const first = firstPassiveByKind.get(effect.trigger.kind);
    if (!first) firstPassiveByKind.set(effect.trigger.kind, effect);
    const commonSupported = effect.appliesTo === 'enemy-stats'
      && effect.target === 'attack'
      && effect.operation === 'add-percent'
      && effect.durationTurns == null;
    let supported = commonSupported && supportedPassiveKinds.has(effect.trigger.kind);
    if (effect.trigger.kind !== 'appearance-turn' && first && first !== effect) supported = false;
    if (effect.trigger.kind === 'elapsed-turn') {
      const lost = effect.trigger.end != null || effect.trigger.hpMinPercent != null || effect.trigger.hpMaxPercent != null;
      supported &&= !lost;
      hasUnrepresentedTurnCondition ||= lost || (first != null && first !== effect);
    } else if (effect.trigger.kind === 'received-hit-count') {
      supported &&= effect.trigger.start == null && effect.trigger.end == null
        && effect.trigger.hpMinPercent == null && effect.trigger.hpMaxPercent == null;
    } else if (effect.trigger.kind === 'hp-range') {
      const lost = effect.trigger.hpMaxPercent == null
        || (effect.trigger.hpMinPercent != null && effect.trigger.hpMinPercent !== 0)
        || effect.trigger.start != null || effect.trigger.end != null || effect.cap != null;
      supported &&= !lost;
      hasUnrepresentedHpCondition ||= lost || (first != null && first !== effect);
    } else if (effect.trigger.kind === 'appearance-turn') {
      const lost = effect.trigger.start == null || effect.trigger.end != null
        || effect.trigger.hpMinPercent != null || effect.trigger.hpMaxPercent != null || effect.cap != null;
      supported &&= !lost;
      hasUnrepresentedTurnCondition ||= lost;
    }
    hasUnrepresentedPassive ||= !supported;
  }
  if (hasUnrepresentedPassive) {
    addFinding('loss', 'PASSIVE_EFFECT_NOT_REPRESENTABLE', ['passiveEffects'], '現行boss形式で意味を保てないpassive effectがあります。');
  }
  const criticalKindCounts = new Map<string, number>();
  let hasUnrepresentedCritical = false;
  for (const rule of enemy.critical.rateRules) {
    criticalKindCounts.set(rule.trigger.kind, (criticalKindCounts.get(rule.trigger.kind) ?? 0) + 1);
    const supportedKind = rule.trigger.kind === 'hp-range' || rule.trigger.kind === 'elapsed-turn' || rule.trigger.kind === 'always';
    const commonSupported = rule.target === 'critical-rate' && rule.operation === 'add-percent' && rule.durationTurns == null;
    let supported = supportedKind && commonSupported;
    if (rule.trigger.kind === 'hp-range') {
      const lost = (rule.trigger.hpMinPercent != null && rule.trigger.hpMinPercent !== 0)
        || rule.trigger.hpMaxPercent == null || rule.trigger.start != null || rule.trigger.end != null;
      supported &&= !lost;
      hasUnrepresentedHpCondition ||= lost;
    } else if (rule.trigger.kind === 'elapsed-turn') {
      const lost = rule.trigger.start != null || rule.trigger.end != null
        || rule.trigger.hpMinPercent != null || rule.trigger.hpMaxPercent != null;
      supported &&= !lost;
      hasUnrepresentedTurnCondition ||= lost;
    }
    hasUnrepresentedCritical ||= !supported;
  }
  hasUnrepresentedCritical ||= [...criticalKindCounts.values()].some((count) => count > 1);
  if (hasUnrepresentedCritical) {
    addFinding('loss', 'CRITICAL_RULE_NOT_REPRESENTABLE', ['critical.rateRules'], '現行boss形式で意味を保てない会心条件があります。');
  }
  if (hasUnrepresentedHpCondition) {
    addFinding('loss', 'HP_CONDITION_NOT_REPRESENTABLE', ['passiveEffects[].trigger', 'critical.rateRules[].trigger'], '現行boss形式で意味を保てないHP条件があります。');
  }
  if (hasUnrepresentedTurnCondition) {
    addFinding('loss', 'TURN_CONDITION_NOT_REPRESENTABLE', ['passiveEffects[].trigger', 'critical.rateRules[].trigger'], '現行boss形式で意味を保てないターン条件があります。');
  }

  const baseAttack = enemy.stats.baseAttack;
  if (baseAttack == null || baseAttack <= 0) {
    addFinding('loss', 'MISSING_BASE_ATTACK', ['stats.baseAttack'], '現行UI用の基礎ATKがないため互換bossへ変換しません。');
    return { boss: null, findings };
  }

  let enemyClass: 'super' | 'extreme';
  if (enemy.alignment === 'super' || enemy.alignment === 'extreme') {
    enemyClass = enemy.alignment;
  } else if (enemy.alignment === 'neutral' && options.neutralPolicy === 'legacy-extreme') {
    enemyClass = 'extreme';
    addFinding('loss', 'NEUTRAL_MAPPED_TO_EXTREME', ['alignment'], '現行形式にneutralがないため、互換表示に限ってextremeへ写像しました。');
  } else {
    addFinding('loss', 'UNKNOWN_ALIGNMENT', ['alignment'], '現行形式へ安全に写像できる超/極区分がありません。');
    return { boss: null, findings };
  }

  const enemyType = normalizeType(enemy.type);
  if (!enemyType) {
    addFinding('loss', 'UNKNOWN_TYPE', ['type'], '現行形式へ安全に写像できる属性がありません。');
    return { boss: null, findings };
  }

  let saMulti: number | null = firstSuper?.derivedMultiplier ?? null;
  if (saMulti == null && firstSuper?.displayedDamage != null) {
    saMulti = firstSuper.displayedDamage / baseAttack;
  }
  if (saMulti == null && options.missingSuperPolicy === 'legacy-three') {
    saMulti = 3;
    addFinding('loss', 'MISSING_SUPER_SYNTHESIZED', ['attacks.superAttacks.0.displayedDamage', 'attacks.superAttacks.0.derivedMultiplier'], '取得元に表示値がない必殺を、旧挙動互換の3倍として一時補完しました。');
  } else if (saMulti == null) {
    addFinding('warning', 'MISSING_SUPER_PRESERVED', ['attacks.superAttacks.0.displayedDamage', 'attacks.superAttacks.0.derivedMultiplier'], '取得元に必殺表示値がないためnullを維持しました。');
  }

  const saBuffMod = finiteNumber(representedPostSuperEffect?.value) / 100;
  const turn = matchingEffect(enemy.passiveEffects, 'elapsed-turn');
  const hit = matchingEffect(enemy.passiveEffects, 'received-hit-count');
  const hp = matchingEffect(enemy.passiveEffects, 'hp-range');
  const appearances = effectsByTrigger(enemy.passiveEffects, 'appearance-turn')
    .sort((left, right) => finiteNumber(left.trigger.start) - finiteNumber(right.trigger.start));
  let appearanceCumulative = 0;
  const appearEntries = appearances.map((effect) => {
    appearanceCumulative += finiteNumber(effect.value);
    return {
      turn: finiteNumber(effect.trigger.start),
      cumulativeAtkUp: appearanceCumulative
    };
  });

  const hpCritical = criticalRule(enemy.critical, 'hp-range');
  const turnCritical = criticalRule(enemy.critical, 'elapsed-turn');
  const fixedCritical = criticalRule(enemy.critical, 'always');
  const hasSaCrit = firstSuper?.criticalOverride?.enabled === true;
  const attacks: LegacyAttack[] = [{ name: '通常', value: baseAttack }];
  if (saBuffMod > 0) {
    attacks.push({ name: '通常(必殺後)', value: Math.floor(baseAttack * (1 + saBuffMod)) });
  }
  if (saMulti != null) {
    const superAttack: LegacyAttack = {
      name: hasSaCrit ? '必殺[会心]' : '必殺',
      value: Math.floor(baseAttack * (saMulti + saBuffMod))
    };
    if (hasSaCrit) superAttack.isCrit = true;
    attacks.push(superAttack);
  }
  const primaryAreaAttack = areaAttacks.find((area) => area.firstTargetDamage != null) ?? areaAttacks[0];
  const areaDamage = primaryAreaAttack?.firstTargetDamage ?? 0;
  if (areaDamage > 0) attacks.push({ name: '全体攻撃', value: areaDamage });
  if (areaAttacks.length > 0) {
    addFinding(
      'loss',
      'AOE_INFORMATION_LOSS',
      ['encounter.areaAttacks'],
      '現行aoeDamageには先頭対象値1つだけを写し、追加対象値・倍率・対象attack・targetMode・出典は表現できません。'
    );
  }

  const boss: LegacyBoss = {
    name: enemy.name,
    class: enemyClass,
    type: enemyType,
    attacks,
    baseAtk: baseAttack,
    saMulti,
    saBuffMod,
    aoeDamage: areaDamage,
    hasSaCrit,
    turnAtkUpStartTurn: finiteNumber(turn?.trigger.start, 1),
    turnAtkUp: finiteNumber(turn?.value),
    turnAtkMax: finiteNumber(turn?.cap),
    hitAtkUp: finiteNumber(hit?.value),
    hitAtkMax: finiteNumber(hit?.cap),
    hpAtkThreshold: finiteNumber(hp?.trigger.hpMaxPercent),
    hpAtkUp: finiteNumber(hp?.value),
    appearEntries,
    critAtkUp: enemy.critical.attackMultiplier == null
      ? 0
      : (enemy.critical.attackMultiplier - 1) * 100,
    critDefDown: finiteNumber(enemy.critical.defenseIgnorePercent),
    isCriticalDefault: enemy.critical.enabled === true || enemy.critical.rateRules.length > 0 || hasSaCrit,
    critHpThreshold: finiteNumber(hpCritical?.trigger.hpMaxPercent),
    critHpRate: finiteNumber(hpCritical?.value),
    critTurnUp: finiteNumber(turnCritical?.value),
    critTurnMax: finiteNumber(turnCritical?.cap),
    critFixedRate: finiteNumber(fixedCritical?.value)
  };
  return { boss, findings };
}

export interface DatasetCompatibilityResult {
  data: LegacyEvent[];
  report: CompatibilityReport;
  safeForProduction: boolean;
}

/** Convert the complete candidate hierarchy to the current four-level format. */
export function candidateDatasetToLegacy(
  dataset: FutureDataset,
  options: CompatibilityOptions = DEFAULT_COMPATIBILITY_OPTIONS
): DatasetCompatibilityResult {
  const output: LegacyEvent[] = [];
  const eventMap = new Map<string, LegacyEvent>();
  const seriesMaps = new Map<string, Map<string, LegacySeries>>();
  const findings: CompatibilityFinding[] = [compatibilityFinding(
    'loss',
    'SOURCE_SNAPSHOT_NOT_REPRESENTABLE',
    dataset.datasetId,
    ['datasetId', 'sourceSnapshot'],
    '現行形式には候補datasetの版・取得元snapshot・digestを保持する欄がありません。',
    null
  )];
  if (dataset.manualCorrections.length > 0) {
    findings.push(compatibilityFinding(
      'loss',
      'MANUAL_CORRECTIONS_NOT_REPRESENTABLE',
      dataset.datasetId,
      ['manualCorrections'],
      '現行形式には根拠付きmanual correctionを保持する欄がありません。',
      null
    ));
  }

  for (const event of dataset.events) {
    const eventType = event.legacyEventType ?? event.name;
    let outputEvent = eventMap.get(eventType);
    if (!outputEvent) {
      outputEvent = { eventType, series: [] };
      output.push(outputEvent);
      eventMap.set(eventType, outputEvent);
      seriesMaps.set(eventType, new Map());
    }
    const seriesMap = seriesMaps.get(eventType)!;
    for (const stage of event.stages) {
      const seriesName = stage.legacySeriesName ?? '-';
      let outputSeries = seriesMap.get(seriesName);
      if (!outputSeries) {
        outputSeries = { seriesName, stages: [] };
        outputEvent.series.push(outputSeries);
        seriesMap.set(seriesName, outputSeries);
      }
      const bosses: LegacyBoss[] = [];
      for (const encounter of stage.encounters) {
        const encounterScopeId = `${event.eventId}:${stage.stageId}:${encounter.encounterIndex}`;
        if (encounter.aiActions.length > 0) {
          findings.push(compatibilityFinding(
            'loss',
            'AI_ACTIONS_NOT_REPRESENTABLE',
            encounterScopeId,
            ['encounter.aiActions'],
            '現行形式にはAI action・sequence・確率・対象・回数条件を保持する欄がありません。',
            null
          ));
          if (encounter.aiActions.some((action) => action.hpMinPercent != null || action.hpMaxPercent != null)) {
            findings.push(compatibilityFinding(
              'loss',
              'HP_CONDITION_NOT_REPRESENTABLE',
              encounterScopeId,
              ['encounter.aiActions[].hpMinPercent', 'encounter.aiActions[].hpMaxPercent'],
              '現行形式にはAI actionのHP条件を保持する欄がありません。',
              null
            ));
          }
          if (encounter.aiActions.some((action) => action.cooldownTurns != null || action.slot != null)) {
            findings.push(compatibilityFinding(
              'loss',
              'TURN_CONDITION_NOT_REPRESENTABLE',
              encounterScopeId,
              ['encounter.aiActions[].cooldownTurns', 'encounter.aiActions[].slot'],
              '現行形式にはAI actionの再使用・slot条件を保持する欄がありません。',
              null
            ));
          }
        }
        if (encounter.areaAttacks.some((area) => area.sourceOccurrenceId == null)) {
          findings.push(compatibilityFinding(
            'loss',
            'AOE_INFORMATION_LOSS',
            encounterScopeId,
            ['encounter.areaAttacks'],
            '取得元enemyへ結び付かないAOEがあり、現行boss形式へ安全に割り当てられません。',
            null
          ));
        }
        for (const enemy of encounter.enemies) {
          const enemyAreaAttacks = encounter.areaAttacks.filter((area) => area.sourceOccurrenceId === enemy.occurrenceId);
          const result = candidateEnemyToLegacy(
            enemy,
            options,
            enemyAreaAttacks
          );
          findings.push(...result.findings);
          if (result.boss) bosses.push(result.boss);
        }
      }
      outputSeries.stages.push({ stageName: stage.name, bosses });
    }
  }
  const report = summarizeCompatibilityFindings(findings);
  return { data: output, report, safeForProduction: report.counts.loss === 0 };
}

function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function fieldState(fieldPath: string, notes: string): { fieldPath: string; state: string; notes: string } {
  return { fieldPath, state: 'source-not-rendered', notes };
}

function legacyEffect(
  effectId: string,
  kind: string,
  start: number | null,
  hpMaxPercent: number | null,
  value: number,
  cap: number | null,
  rawText: string
): FutureEffect {
  return {
    effectId,
    trigger: { kind, start, end: null, hpMinPercent: null, hpMaxPercent, raw: rawText },
    appliesTo: 'enemy-stats',
    target: 'attack',
    operation: 'add-percent',
    value,
    cap,
    durationTurns: null,
    bracket: kind === 'received-hit-count' ? 'mid-battle' : 'start-of-turn',
    sourceSkillId: null,
    rawText,
    confidence: 'unconfirmed'
  };
}

export interface LegacyImportContext {
  provider: string;
  region: string;
  eventId: string;
  stageId: string;
  encounterIndex: number;
  orderInEncounter: number;
  generatedAt: string;
  sourceFile: string;
}

/** Convert one old boss without inventing source IDs, DEF, HP, or DR. */
export function legacyBossToFutureEnemy(boss: LegacyBoss, context: LegacyImportContext): FutureEnemy {
  const occurrenceId = [
    context.provider,
    context.region,
    context.eventId,
    context.stageId,
    context.encounterIndex,
    context.orderInEncounter
  ].join(':');
  // `attacks` may already include the post-super ATK buff. Preserve the old
  // pre-buff saMulti as the recoverable displayed/base pair and keep the full
  // old attack list under raw. This prevents applying saBuffMod twice.
  const superDamage = boss.saMulti == null ? null : Math.floor(boss.baseAtk * boss.saMulti);
  const superEffects: FutureEffect[] = boss.saBuffMod > 0
    ? [{
        ...legacyEffect(
          'legacy-post-super-attack-up',
          'after-super',
          null,
          null,
          boss.saBuffMod * 100,
          null,
          'legacy saBuffMod'
        ),
        appliesTo: 'subsequent-normal-attacks',
        durationTurns: 1,
        bracket: 'post-super'
      }]
    : [];
  const passiveEffects: FutureEffect[] = [];
  if (boss.turnAtkUp > 0) {
    passiveEffects.push(legacyEffect('legacy-turn-atk', 'elapsed-turn', boss.turnAtkUpStartTurn, null, boss.turnAtkUp, boss.turnAtkMax, 'legacy turnAtkUp'));
  }
  if (boss.hitAtkUp > 0) {
    passiveEffects.push(legacyEffect('legacy-hit-atk', 'received-hit-count', 1, null, boss.hitAtkUp, boss.hitAtkMax, 'legacy hitAtkUp'));
  }
  if (boss.hpAtkUp > 0) {
    passiveEffects.push(legacyEffect('legacy-hp-atk', 'hp-range', null, boss.hpAtkThreshold, boss.hpAtkUp, null, 'legacy hpAtkUp'));
  }
  let previousAppearance = 0;
  boss.appearEntries.forEach((entry, index) => {
    passiveEffects.push(legacyEffect(
      `legacy-appearance-${index}`,
      'appearance-turn',
      entry.turn,
      null,
      entry.cumulativeAtkUp - previousAppearance,
      null,
      'legacy appearEntries'
    ));
    previousAppearance = entry.cumulativeAtkUp;
  });

  const criticalRules: FutureEffect[] = [];
  if (boss.critHpRate > 0) {
    criticalRules.push(legacyEffect('legacy-crit-hp', 'hp-range', null, boss.critHpThreshold, boss.critHpRate, null, 'legacy critHpRate'));
  }
  if (boss.critTurnUp > 0) {
    criticalRules.push(legacyEffect('legacy-crit-turn', 'elapsed-turn', 1, null, boss.critTurnUp, boss.critTurnMax, 'legacy critTurnUp'));
  }
  if (boss.critFixedRate > 0) {
    criticalRules.push(legacyEffect('legacy-crit-fixed', 'always', null, null, boss.critFixedRate, null, 'legacy critFixedRate'));
  }
  for (const rule of criticalRules) {
    rule.target = 'critical-rate';
  }

  const fieldStates = [
    fieldState('identity.sourceEnemyId', '現行形式に取得元enemy IDがない。'),
    fieldState('identity.cardId', '現行形式にcard IDがない。'),
    fieldState('identity.thumbId', '現行形式にthumb IDがない。'),
    fieldState('identity.isEzaCardLink', '現行形式にEZAリンク情報がない。'),
    fieldState('stats.hp', '現行形式にHPがない。'),
    fieldState('stats.defense', '現行形式にDEFがない。'),
    fieldState('stats.damageReductionPercent', '現行形式にDR元値がない。'),
    fieldState('stats.maxAttacksPerTurn', '現行形式に攻撃回数上限がない。'),
    fieldState('attacks.superAttacks.0.skillId', '現行形式に必殺IDがない。'),
    fieldState('attacks.superAttacks.0.name', '現行形式は表示名を単に「必殺」へ丸めている。'),
    fieldState('attacks.superAttacks.0.description', '現行形式に必殺説明文がない。'),
    fieldState('attacks.superAttacks.0.probabilityPercent', '現行形式に必殺確率元値がない。'),
    fieldState('attacks.superAttacks.0.maxPerTurn', '現行形式に必殺回数上限元値がない。'),
    fieldState('attacks.superAttacks.0.cooldownTurns', '現行形式に再使用間隔元値がない。'),
    fieldState('attacks.superAttacks.0.slot', '現行形式に必殺slot元値がない。'),
    fieldState('attacks.superAttacks.0.attackType', '現行形式に必殺属性表示がない。')
  ];
  const critical: FutureCritical = {
    enabled: boss.isCriticalDefault,
    attackMultiplier: boss.critAtkUp > 0 ? 1 + boss.critAtkUp / 100 : 1,
    defenseIgnorePercent: boss.critDefDown,
    rateRules: criticalRules
  };
  const criticalOverride: FutureCritical | null = boss.hasSaCrit
    ? { enabled: true, attackMultiplier: critical.attackMultiplier, defenseIgnorePercent: critical.defenseIgnorePercent, rateRules: [] }
    : null;
  if (!criticalOverride) {
    fieldStates.push(fieldState('attacks.superAttacks.0.criticalOverride', '現行bossは必殺限定会心として設定されていない。'));
  }

  return {
    occurrenceId,
    orderInEncounter: context.orderInEncounter,
    identity: { sourceEnemyId: null, cardId: null, thumbId: null, isEzaCardLink: null },
    name: boss.name,
    type: boss.type,
    alignment: boss.class,
    stats: {
      hp: null,
      baseAttack: boss.baseAtk,
      defense: null,
      damageReductionPercent: null,
      maxAttacksPerTurn: null
    },
    attacks: {
      superAttacks: [{
        skillId: null,
        name: null,
        description: null,
        displayedDamage: superDamage,
        derivedMultiplier: boss.saMulti,
        probabilityPercent: null,
        maxPerTurn: null,
        cooldownTurns: null,
        slot: null,
        usageRules: [],
        targetMode: 'unknown',
        attackType: null,
        effectIcons: [],
        effects: superEffects,
        criticalOverride
      }]
    },
    passiveEffects,
    critical,
    skills: [],
    evidence: {
      sourceUrl: null,
      sourceFile: context.sourceFile,
      checkedAt: context.generatedAt,
      confidence: 'unconfirmed',
      notes: '現行all_enemies.jsonからの可逆性試験。取得元の事実とは扱わない。'
    },
    fieldStates,
    raw: { legacyBoss: boss }
  };
}

/** Full old -> draft conversion used to prove that a migration path exists. */
export function legacyDatasetToFuture(
  legacy: LegacyEvent[],
  generatedAt: string,
  sourceDigest: string
): FutureDataset {
  const provider = 'legacy-all-enemies';
  const region = 'jpnja';
  const eventOrdinals = new Map<string, number>();
  const occurrenceIds = new Set<string>();
  const events: FutureEvent[] = legacy.map((event) => {
    const eventOrdinal = eventOrdinals.get(event.eventType) ?? 0;
    eventOrdinals.set(event.eventType, eventOrdinal + 1);
    const eventId = `legacy-event-${fnv1a64(event.eventType)}-${eventOrdinal}`;
    const stages: FutureStage[] = [];
    const stageOrdinals = new Map<string, number>();
    for (const series of event.series) {
      for (const stage of series.stages) {
        const signature = stage.bosses.map((boss) => `${boss.name}:${boss.type}:${boss.baseAtk}`).join('|');
        const stageHumanIdentity = `${event.eventType}\u0000${series.seriesName}\u0000${stage.stageName}\u0000${signature}`;
        const stageOrdinal = stageOrdinals.get(stageHumanIdentity) ?? 0;
        stageOrdinals.set(stageHumanIdentity, stageOrdinal + 1);
        const stageId = `legacy-stage-${fnv1a64(stageHumanIdentity)}-${stageOrdinal}`;
        const enemies = stage.bosses.map((boss, orderInEncounter) => legacyBossToFutureEnemy(boss, {
          provider,
          region,
          eventId,
          stageId,
          encounterIndex: 0,
          orderInEncounter,
          generatedAt,
          sourceFile: 'scraper/all_enemies.json'
        }));
        for (const enemy of enemies) {
          if (occurrenceIds.has(enemy.occurrenceId)) {
            throw new Error(`legacy変換でoccurrenceIdが重複しました: ${enemy.occurrenceId}`);
          }
          occurrenceIds.add(enemy.occurrenceId);
        }
        stages.push({
          stageId,
          name: stage.stageName,
          legacySeriesName: series.seriesName,
          sourceUrl: null,
          encounters: [{
            encounterIndex: 0,
            phaseId: null,
            layoutKind: 'unknown',
            enemies,
            aiActions: [],
            areaAttacks: []
          }]
        });
      }
    }
    return {
      eventId,
      name: event.eventType,
      category: null,
      legacyEventType: event.eventType,
      sourceUrl: null,
      stages
    };
  });
  return {
    schemaVersion: 1,
    datasetId: `legacy-import-${sourceDigest.replace(/^sha256:/, '').slice(0, 12)}`,
    generatedAt,
    sourceSnapshot: {
      provider,
      region,
      acquiredAt: generatedAt,
      importMethod: 'saved-cache',
      policyStatus: 'offline-existing-copy',
      parserVersion: 'phase4-legacy-adapter-1',
      sourceRootUrl: null,
      contentDigest: sourceDigest,
      notes: '比較専用。現行JSONの欠損を補完しない。'
    },
    events,
    manualCorrections: []
  };
}

interface FlatLegacyStage {
  legacyPath: string;
  eventType: string;
  seriesName: string;
  stageName: string;
  bosses: LegacyBoss[];
}

interface FlatFutureStage {
  candidatePath: string;
  eventId: string;
  stageId: string;
  eventType: string;
  seriesName: string;
  stageName: string;
  enemies: FutureEnemy[];
  encounterByOccurrenceId: Map<string, FutureEncounter>;
}

function flattenLegacy(legacy: LegacyEvent[]): FlatLegacyStage[] {
  const stages: FlatLegacyStage[] = [];
  legacy.forEach((event, eventIndex) => {
    event.series.forEach((series, seriesIndex) => {
      series.stages.forEach((stage, stageIndex) => {
        stages.push({
          legacyPath: `${eventIndex}/${seriesIndex}/${stageIndex}`,
          eventType: event.eventType,
          seriesName: series.seriesName,
          stageName: stage.stageName,
          bosses: stage.bosses
        });
      });
    });
  });
  return stages;
}

function flattenFuture(dataset: FutureDataset): FlatFutureStage[] {
  const stages: FlatFutureStage[] = [];
  dataset.events.forEach((event, eventIndex) => {
    event.stages.forEach((stage, stageIndex) => {
      const encounterByOccurrenceId = new Map<string, FutureEncounter>();
      const enemies = stage.encounters.flatMap((encounter) => encounter.enemies)
        .filter((enemy) => (enemy.stats.baseAttack ?? 0) > 0);
      for (const encounter of stage.encounters) {
        for (const enemy of encounter.enemies) encounterByOccurrenceId.set(enemy.occurrenceId, encounter);
      }
      stages.push({
        candidatePath: `${eventIndex}/${stageIndex}`,
        eventId: event.eventId,
        stageId: stage.stageId,
        eventType: event.legacyEventType ?? event.name,
        seriesName: stage.legacySeriesName ?? '-',
        stageName: stage.name,
        enemies,
        encounterByOccurrenceId
      });
    });
  });
  return stages;
}

function humanStageKey(stage: { eventType: string; seriesName: string; stageName: string }): string {
  return JSON.stringify([stage.eventType, stage.seriesName, stage.stageName]);
}

function legacySignature(stage: FlatLegacyStage, tier: 'exact' | 'alignment-ignored' | 'attack-only'): string {
  return JSON.stringify(stage.bosses.map((boss) => {
    const damage = boss.saMulti == null ? null : Math.round(boss.baseAtk * boss.saMulti);
    if (tier === 'exact') return [boss.name, boss.class, boss.type, boss.baseAtk, damage];
    if (tier === 'alignment-ignored') return [boss.name, boss.type, boss.baseAtk, damage];
    return [boss.name, boss.type, boss.baseAtk];
  }));
}

function futureSignature(stage: FlatFutureStage, tier: 'exact' | 'alignment-ignored' | 'attack-only'): string {
  return JSON.stringify(stage.enemies.map((enemy) => {
    const damage = enemy.attacks.superAttacks[0]?.displayedDamage ?? null;
    if (tier === 'exact') return [enemy.name, enemy.alignment, enemy.type, enemy.stats.baseAttack, damage];
    if (tier === 'alignment-ignored') return [enemy.name, enemy.type, enemy.stats.baseAttack, damage];
    return [enemy.name, enemy.type, enemy.stats.baseAttack];
  }));
}

export type StageMatchTier = 'exact' | 'alignment-ignored' | 'attack-only' | 'human-key' | 'unmatched';

export interface StageMatch {
  legacyPath: string;
  humanKey: string;
  tier: StageMatchTier;
  cardinality: 'unique' | 'ambiguous' | 'none';
  candidatePaths: string[];
  candidateStageIds: string[];
}

export interface CandidateStageClassification {
  candidatePath: string;
  eventId: string;
  stageId: string;
  status: 'existing-exact' | 'existing-changed' | 'ambiguous-existing' | 'candidate-only-unconfirmed';
  legacyPaths: string[];
  matchTiers: StageMatchTier[];
}

/**
 * Match stages without using array position as identity. Ambiguity is retained;
 * no first-match shortcut is allowed.
 */
export function classifyLegacyAndCandidateStages(
  legacy: LegacyEvent[],
  dataset: FutureDataset
): { legacyMatches: StageMatch[]; candidateClassifications: CandidateStageClassification[] } {
  const legacyStages = flattenLegacy(legacy);
  const candidateStages = flattenFuture(dataset);
  const candidatesByHuman = new Map<string, FlatFutureStage[]>();
  for (const stage of candidateStages) {
    const key = humanStageKey(stage);
    candidatesByHuman.set(key, [...(candidatesByHuman.get(key) ?? []), stage]);
  }

  const legacyMatches: StageMatch[] = legacyStages.map((legacyStage) => {
    const humanKey = humanStageKey(legacyStage);
    const humanCandidates = candidatesByHuman.get(humanKey) ?? [];
    let tier: StageMatchTier = 'unmatched';
    let candidates: FlatFutureStage[] = [];
    for (const signatureTier of ['exact', 'alignment-ignored', 'attack-only'] as const) {
      const expected = legacySignature(legacyStage, signatureTier);
      const matches = humanCandidates.filter((candidate) => futureSignature(candidate, signatureTier) === expected);
      if (matches.length > 0) {
        tier = signatureTier;
        candidates = matches;
        break;
      }
    }
    if (candidates.length === 0 && humanCandidates.length > 0) {
      tier = 'human-key';
      candidates = humanCandidates;
    }
    return {
      legacyPath: legacyStage.legacyPath,
      humanKey,
      tier,
      cardinality: candidates.length === 0 ? 'none' : candidates.length === 1 ? 'unique' : 'ambiguous',
      candidatePaths: candidates.map((candidate) => candidate.candidatePath),
      candidateStageIds: candidates.map((candidate) => candidate.stageId)
    };
  });

  const matchesByCandidate = new Map<string, StageMatch[]>();
  for (const match of legacyMatches) {
    for (const candidatePath of match.candidatePaths) {
      matchesByCandidate.set(candidatePath, [...(matchesByCandidate.get(candidatePath) ?? []), match]);
    }
  }
  const candidateClassifications = candidateStages.map((stage): CandidateStageClassification => {
    const matches = matchesByCandidate.get(stage.candidatePath) ?? [];
    const uniqueExact = matches.filter((match) => match.cardinality === 'unique' && match.tier === 'exact');
    const hasAmbiguity = matches.some((match) => match.cardinality === 'ambiguous') || matches.length > 1;
    let status: CandidateStageClassification['status'];
    if (hasAmbiguity) status = 'ambiguous-existing';
    else if (uniqueExact.length === 1) status = 'existing-exact';
    else if (matches.length > 0) status = 'existing-changed';
    else status = 'candidate-only-unconfirmed';
    return {
      candidatePath: stage.candidatePath,
      eventId: stage.eventId,
      stageId: stage.stageId,
      status,
      legacyPaths: matches.map((match) => match.legacyPath),
      matchTiers: matches.map((match) => match.tier)
    };
  });
  return { legacyMatches, candidateClassifications };
}

export interface FieldDifference {
  field: string;
  legacyValue: unknown;
  candidateCompatibilityValue: unknown;
  equal: boolean;
  representation: 'legacy-field' | 'candidate-only';
}

const COMPARED_BOSS_FIELDS: Array<keyof LegacyBoss> = [
  'name', 'class', 'type', 'baseAtk', 'saMulti', 'saBuffMod', 'aoeDamage', 'hasSaCrit',
  'turnAtkUpStartTurn', 'turnAtkUp', 'turnAtkMax', 'hitAtkUp', 'hitAtkMax',
  'hpAtkThreshold', 'hpAtkUp', 'appearEntries', 'critAtkUp', 'critDefDown',
  'isCriticalDefault', 'critHpThreshold', 'critHpRate', 'critTurnUp', 'critTurnMax',
  'critFixedRate', 'attacks'
];

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface MigrationComparison {
  schemaVersion: 1;
  datasetId: string;
  legacyMatches: StageMatch[];
  candidateStages: CandidateStageClassification[];
  aggregate: {
    uniqueMatchedStages: number;
    detailedMatchedStages: number;
    comparedBosses: number;
    fullyEqualBosses: number;
    detailedBosses: number;
  };
  matchedStageDetails: Array<{
    legacyPath: string;
    candidatePath: string;
    candidateSourceIdentity: { eventId: string; stageId: string };
    tier: StageMatchTier;
    bossCountLegacy: number;
    bossCountCandidate: number;
    bosses: Array<{
      index: number;
      occurrenceId: string | null;
      sourceIds: {
        sourceEnemyId: string | null;
        cardId: string | null;
        thumbId: string | null;
      } | null;
      candidateEvidence: unknown;
      differences: FieldDifference[];
      findings: CompatibilityFinding[];
    }>;
  }>;
}

/** Machine-readable field diff for every uniquely matched stage. */
export function compareLegacyAndCandidate(
  legacy: LegacyEvent[],
  dataset: FutureDataset
): MigrationComparison {
  const legacyStages = new Map(flattenLegacy(legacy).map((stage) => [stage.legacyPath, stage]));
  const futureStages = new Map(flattenFuture(dataset).map((stage) => [stage.candidatePath, stage]));
  const classified = classifyLegacyAndCandidateStages(legacy, dataset);
  const matchedStageDetails: MigrationComparison['matchedStageDetails'] = [];
  let uniqueMatchedStages = 0;
  let comparedBosses = 0;
  let fullyEqualBosses = 0;
  for (const match of classified.legacyMatches) {
    if (match.cardinality !== 'unique') continue;
    uniqueMatchedStages += 1;
    const legacyStage = legacyStages.get(match.legacyPath);
    const candidateStage = futureStages.get(match.candidatePaths[0]!);
    if (!legacyStage || !candidateStage) continue;
    const bossCount = Math.max(legacyStage.bosses.length, candidateStage.enemies.length);
    const bosses: MigrationComparison['matchedStageDetails'][number]['bosses'] = [];
    for (let index = 0; index < bossCount; index += 1) {
      comparedBosses += 1;
      const legacyBoss = legacyStage.bosses[index];
      const candidateEnemy = candidateStage.enemies[index];
      if (!legacyBoss || !candidateEnemy) {
        bosses.push({
          index,
          occurrenceId: candidateEnemy?.occurrenceId ?? null,
          sourceIds: candidateEnemy ? {
            sourceEnemyId: candidateEnemy.identity.sourceEnemyId,
            cardId: candidateEnemy.identity.cardId,
            thumbId: candidateEnemy.identity.thumbId
          } : null,
          candidateEvidence: candidateEnemy?.evidence ?? null,
          differences: [{
            field: 'enemy-presence',
            legacyValue: Boolean(legacyBoss),
            candidateCompatibilityValue: Boolean(candidateEnemy),
            equal: false,
            representation: 'legacy-field'
          }],
          findings: []
        });
        continue;
      }
      const encounter = candidateStage.encounterByOccurrenceId.get(candidateEnemy.occurrenceId);
      const candidateAreaAttacks = encounter?.areaAttacks.filter(
        (area) => area.sourceOccurrenceId === candidateEnemy.occurrenceId
      ) ?? [];
      const converted = candidateEnemyToLegacy(candidateEnemy, {
        neutralPolicy: 'legacy-extreme',
        missingSuperPolicy: 'legacy-three'
      }, candidateAreaAttacks);
      const differences: FieldDifference[] = [];
      for (const field of COMPARED_BOSS_FIELDS) {
        const candidateValue = converted.boss?.[field];
        const difference = {
          field,
          legacyValue: legacyBoss[field],
          candidateCompatibilityValue: candidateValue,
          equal: sameValue(legacyBoss[field], candidateValue),
          representation: 'legacy-field' as const
        };
        if (!difference.equal) differences.push(difference);
      }

      const superAttacks = candidateEnemy.attacks.superAttacks;
      if (superAttacks.length > 1 || superAttacks.some((attack) => attack.usageRules.length > 0)) {
        differences.push({
          field: 'attacks.superAttacks.detail',
          legacyValue: {
            present: legacyBoss.saMulti != null,
            representedCount: legacyBoss.saMulti == null ? 0 : 1,
            saMulti: legacyBoss.saMulti,
            attacks: legacyBoss.attacks.filter((attack) => attack.name.includes('必殺'))
          },
          candidateCompatibilityValue: {
            present: superAttacks.length > 0,
            attacks: superAttacks.map((attack) => ({
              skillId: attack.skillId,
              name: attack.name,
              displayedDamage: attack.displayedDamage,
              derivedMultiplier: attack.derivedMultiplier,
              probabilityPercent: attack.probabilityPercent,
              maxPerTurn: attack.maxPerTurn,
              cooldownTurns: attack.cooldownTurns,
              slot: attack.slot,
              targetMode: attack.targetMode,
              usageRules: attack.usageRules
            }))
          },
          equal: false,
          representation: 'candidate-only'
        });
      }
      if (candidateAreaAttacks.length > 0 || legacyBoss.aoeDamage > 0) {
        differences.push({
          field: 'encounter.areaAttacks',
          legacyValue: {
            present: legacyBoss.aoeDamage > 0,
            aoeDamage: legacyBoss.aoeDamage
          },
          candidateCompatibilityValue: {
            present: candidateAreaAttacks.length > 0,
            attacks: candidateAreaAttacks
          },
          equal: false,
          representation: 'candidate-only'
        });
      }
      const candidateAiActions = candidateEnemy.orderInEncounter === 0
        ? encounter?.aiActions ?? []
        : [];
      if (candidateAiActions.length > 0) {
        differences.push({
          field: 'encounter.aiActions',
          legacyValue: { present: false, actions: [] },
          candidateCompatibilityValue: { present: true, actions: candidateAiActions },
          equal: false,
          representation: 'candidate-only'
        });
      }

      const detailedFindingCodes = new Set<CompatibilityCode>([
        'NEUTRAL_MAPPED_TO_EXTREME',
        'MISSING_SUPER_SYNTHESIZED',
        'MULTIPLE_SUPER_ATTACKS_NOT_REPRESENTABLE',
        'SUPER_USAGE_RULES_NOT_REPRESENTABLE',
        'SUPER_EFFECT_NOT_REPRESENTABLE',
        'AOE_INFORMATION_LOSS',
        'PASSIVE_EFFECT_NOT_REPRESENTABLE',
        'CRITICAL_RULE_NOT_REPRESENTABLE'
      ]);
      const hasDetailedFinding = converted.findings.some((finding) => detailedFindingCodes.has(finding.code));
      if (differences.length === 0 && !hasDetailedFinding) {
        fullyEqualBosses += 1;
      } else {
        bosses.push({
          index,
          occurrenceId: candidateEnemy.occurrenceId,
          sourceIds: {
            sourceEnemyId: candidateEnemy.identity.sourceEnemyId,
            cardId: candidateEnemy.identity.cardId,
            thumbId: candidateEnemy.identity.thumbId
          },
          candidateEvidence: candidateEnemy.evidence,
          differences,
          findings: converted.findings
        });
      }
    }
    if (bosses.length > 0 || match.tier !== 'exact' || legacyStage.bosses.length !== candidateStage.enemies.length) {
      matchedStageDetails.push({
        legacyPath: legacyStage.legacyPath,
        candidatePath: candidateStage.candidatePath,
        candidateSourceIdentity: { eventId: candidateStage.eventId, stageId: candidateStage.stageId },
        tier: match.tier,
        bossCountLegacy: legacyStage.bosses.length,
        bossCountCandidate: candidateStage.enemies.length,
        bosses
      });
    }
  }
  return {
    schemaVersion: 1,
    datasetId: dataset.datasetId,
    legacyMatches: classified.legacyMatches,
    candidateStages: classified.candidateClassifications,
    aggregate: {
      uniqueMatchedStages,
      detailedMatchedStages: matchedStageDetails.length,
      comparedBosses,
      fullyEqualBosses,
      detailedBosses: comparedBosses - fullyEqualBosses
    },
    matchedStageDetails
  };
}
