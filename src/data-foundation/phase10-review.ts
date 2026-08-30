/** Offline-only source admission and record-level review. No I/O or promotion. */
import type {
  CanonicalEnemyDatasetV2, GateFinding, PermissionLedger, PermissionOperation,
  RuntimeEnemyDatasetV1, RuntimeField
} from './phase6-types.js';
import { evaluatePermission } from './phase6-gates.js';
import { stableJson } from '../data-migration/phase4-enemy-migration.js';

const REQUIRED_OPERATIONS: PermissionOperation[] = [
  'automatic-fetch', 'offline-transform', 'redistribute-derived', 'publish-derived'
];

export function sourcePreflight(ledger: PermissionLedger, sourceKey: string, evaluatedAt: string) {
  const errors: string[] = [];
  const entries = ledger.entries.filter((entry) => entry.sourceKey === sourceKey);
  const entry = entries[0];
  const now = Date.parse(evaluatedAt);
  if (!Number.isFinite(now)) errors.push('INVALID_EVALUATION_TIME');
  if (entries.length !== 1) errors.push('SOURCE_MISSING_OR_AMBIGUOUS');
  if (entry) {
    if (entry.acquisitionMode !== 'automatic-approved') errors.push('SOURCE_NOT_APPROVED');
    if (entry.evidenceUrls.length === 0) errors.push('PERMISSION_EVIDENCE_MISSING');
    const reviewed = Date.parse(entry.reviewedAt);
    if (!Number.isFinite(reviewed) || reviewed > now) errors.push('INVALID_PERMISSION_REVIEW_TIME');
    const from = entry.validFrom === null ? -Infinity : Date.parse(entry.validFrom);
    const until = entry.validUntil === null ? Infinity : Date.parse(entry.validUntil);
    if (Number.isNaN(from) || Number.isNaN(until) || from > until || now < from || now >= until) {
      errors.push('PERMISSION_OUTSIDE_VALIDITY');
    }
  }
  const operations = REQUIRED_OPERATIONS.map((operation) => evaluatePermission(ledger, sourceKey, operation));
  for (const operation of operations) if (!operation.allowed) errors.push(`PERMISSION_${operation.operation.toUpperCase().replaceAll('-', '_')}_${operation.decision.toUpperCase()}`);
  return { sourceKey, allowed: errors.length === 0, errors, operations };
}

type Kind = 'events' | 'stages' | 'encounters' | 'enemies' | 'superAttacks' | 'areaAttacks';
const KINDS: Kind[] = ['events', 'stages', 'encounters', 'enemies', 'superAttacks', 'areaAttacks'];
interface Row { id: string; parentId: string | null; value: unknown }
interface Inventory {
  records: Record<Kind, Map<string, Row>>;
  counts: Record<string, number>;
  findings: GateFinding[];
}

function finding(findings: GateFinding[], code: string, details: GateFinding['details'] = {}, review = false) {
  findings.push({ severity: review ? 'review-required' : 'hard-fail', code, message: code, details });
}

function knownNumber(field: RuntimeField<unknown>, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return field.state === 'known' && typeof field.value === 'number'
    && Number.isFinite(field.value) && field.value >= minimum && field.value <= maximum;
}

/** Schemas check object shape; these checks also check the meaning of field.value. */
function inventory(runtime: RuntimeEnemyDatasetV1): Inventory {
  const records = Object.fromEntries(KINDS.map((kind) => [kind, new Map<string, Row>()])) as Inventory['records'];
  const findings: GateFinding[] = [];
  const seen = new Set<string>();
  let normalAttacks = 0;
  let postSuperAttacks = 0;
  const add = (kind: Kind, id: string, parentId: string | null, value: unknown) => {
    if (seen.has(id)) finding(findings, 'DUPLICATE_RUNTIME_ID', { kind, id });
    seen.add(id);
    records[kind].set(id, { id, parentId, value });
  };
  for (const event of runtime.events) {
    add('events', event.id, null, { name: event.name, category: event.category });
    for (const stage of event.stages) {
      add('stages', stage.id, event.id, { name: stage.name });
      for (const encounter of stage.encounters) {
        add('encounters', encounter.id, stage.id, { order: encounter.order });
        for (const enemy of encounter.enemies) {
          const { superAttacks, ...values } = enemy;
          add('enemies', enemy.id, encounter.id, values);
          if (enemy.role.state !== 'known' || !['combat', 'non-combat'].includes(enemy.role.value ?? '')) finding(findings, 'ENEMY_ROLE_UNKNOWN', { id: enemy.id });
          if (enemy.role.value === 'combat') {
            if (!knownNumber(enemy.baseAttack)) finding(findings, 'NORMAL_ATTACK_MISSING_OR_INVALID', { id: enemy.id });
            else normalAttacks += 1;
            if (enemy.type.state !== 'known' || !['agl', 'teq', 'int', 'str', 'phy'].includes(enemy.type.value ?? '')
              || enemy.alignment.state !== 'known' || !['super', 'extreme', 'neutral'].includes(enemy.alignment.value ?? '')) {
              finding(findings, 'ATTRIBUTE_MISSING_OR_INVALID', { id: enemy.id });
            }
          }
          if (superAttacks.some((attack) => attack.effects.some((effect) => effect.appliesTo === 'subsequent-normal-attacks' && effect.trigger.kind === 'after-super'))) postSuperAttacks += 1;
          for (const attack of superAttacks) {
            add('superAttacks', attack.id, enemy.id, attack);
            // Phase 9 consumes fixed ATK, not multiplier-only entries. Do not let
            // a schema-valid but unsupported representation silently become 0.
            if (!knownNumber(attack.displayedDamage)) finding(findings, 'SUPER_ATTACK_VALUE_MISSING', { id: attack.id, required: 'displayedDamage' });
          }
        }
        const enemyIds = new Set(encounter.enemies.map((enemy) => enemy.id));
        for (const area of encounter.areaAttacks) {
          add('areaAttacks', area.id, encounter.id, area);
          if (area.sourceEnemyId.state !== 'known' || !enemyIds.has(area.sourceEnemyId.value ?? '')) finding(findings, 'AOE_ENEMY_REFERENCE_INVALID', { id: area.id });
          if (!knownNumber(area.firstTargetDamage)) finding(findings, 'AOE_FIRST_TARGET_MISSING', { id: area.id, required: 'firstTargetDamage' });
          if (!knownNumber(area.additionalTargetDamage)) finding(findings, 'AOE_ADDITIONAL_TARGET_MISSING', { id: area.id, required: 'additionalTargetDamage' });
          if (area.attackKind.state !== 'known' || !['normal', 'super'].includes(area.attackKind.value ?? '')
            || area.targetMode.state !== 'known' || !['all', 'selected-and-others'].includes(area.targetMode.value ?? '')) finding(findings, 'AOE_SEMANTICS_UNRESOLVED', { id: area.id });
        }
      }
    }
  }
  const counts: Record<string, number> = Object.fromEntries(KINDS.map((kind) => [kind, records[kind].size]));
  counts.normalAttacks = normalAttacks;
  counts.postSuperAttacks = postSuperAttacks;
  // Attack definitions, not rolls, conditions, or number of targets hit.
  counts.attacks = normalAttacks + postSuperAttacks + records.superAttacks.size + records.areaAttacks.size;
  return { records, counts, findings };
}

export function runtimeReviewCounts(runtime: RuntimeEnemyDatasetV1) {
  return inventory(runtime).counts;
}

function knownRegressions(before: unknown, after: unknown, path: string, findings: GateFinding[]) {
  if (!before || typeof before !== 'object' || !after || typeof after !== 'object') return;
  const old = before as Record<string, unknown>;
  const next = after as Record<string, unknown>;
  if (old.state === 'known' && next.state !== 'known') {
    finding(findings, 'KNOWN_VALUE_LOST', { path });
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    before.forEach((item, index) => {
      const id = item && typeof item === 'object' ? (item as { id?: string }).id : null;
      const matched = id ? after.find((other) => other?.id === id) : after[index];
      if (matched === undefined) finding(findings, 'RULE_OR_EFFECT_LOST', { path, id: id ?? String(index) });
      else knownRegressions(item, matched, `${path}/${id ?? index}`, findings);
    });
    return;
  }
  for (const key of Object.keys(old)) knownRegressions(old[key], next[key], `${path}/${key}`, findings);
}

const NUMERIC_FIELDS = new Set([
  'hp', 'baseAttack', 'defense', 'damageReductionPercent', 'maxAttacksPerTurn',
  'displayedDamage', 'derivedMultiplier', 'probabilityPercent', 'maxPerTurn', 'cooldownTurns', 'slot',
  'hpMinPercent', 'hpMaxPercent', 'attackMultiplier', 'defenseIgnorePercent',
  'firstTargetDamage', 'additionalTargetDamage', 'firstTargetMultiplier', 'additionalTargetMultiplier',
  'maxUses', 'durationTurns', 'start', 'end'
]);
const PERCENT_FIELDS = new Set(['damageReductionPercent', 'probabilityPercent', 'hpMinPercent', 'hpMaxPercent', 'defenseIgnorePercent']);
const BOOLEAN_FIELDS = new Set(['enabled', 'isEzaCardLink']);

export function validateSemanticFields(value: unknown, path = '', findings: GateFinding[] = []): GateFinding[] {
  if (!value || typeof value !== 'object') return findings;
  const record = value as Record<string, unknown>;
  const isEffect = typeof record.operation === 'string' && typeof record.appliesTo === 'string' && 'trigger' in record;
  for (const [key, item] of Object.entries(record)) {
    if (item && typeof item === 'object' && 'state' in item && 'value' in item) {
      const field = item as RuntimeField<unknown>;
      if (field.state === 'known' && NUMERIC_FIELDS.has(key) && !knownNumber(field, 0, PERCENT_FIELDS.has(key) ? 100 : Number.MAX_SAFE_INTEGER)) {
        finding(findings, 'IMPOSSIBLE_NUMERIC_VALUE', { path: `${path}/${key}` });
      }
      if (field.state === 'known' && isEffect && ['value', 'cap'].includes(key)
        && !knownNumber(field, -Number.MAX_SAFE_INTEGER)) {
        // Negative percentages can represent a legitimate debuff. A string,
        // NaN or infinity cannot be treated as an absent (zero) effect.
        finding(findings, 'IMPOSSIBLE_EFFECT_VALUE', { path: `${path}/${key}` });
      }
      if (field.state === 'known' && BOOLEAN_FIELDS.has(key) && typeof field.value !== 'boolean') {
        finding(findings, 'INVALID_BOOLEAN_VALUE', { path: `${path}/${key}` });
      }
    }
    validateSemanticFields(item, `${path}/${key}`, findings);
  }
  const min = record.hpMinPercent as RuntimeField<unknown> | undefined;
  const max = record.hpMaxPercent as RuntimeField<unknown> | undefined;
  if (min && max && knownNumber(min) && knownNumber(max) && Number(min.value) > Number(max.value)) finding(findings, 'INVERTED_HP_RANGE', { path });
  return findings;
}

export function reviewRuntimeDiff(candidate: RuntimeEnemyDatasetV1, previous: RuntimeEnemyDatasetV1) {
  const after = inventory(candidate);
  const before = inventory(previous);
  const findings = [...after.findings, ...validateSemanticFields(candidate)];
  if (candidate.region !== previous.region) finding(findings, 'REGION_MISMATCH', { candidate: candidate.region, previous: previous.region });
  if (Date.parse(candidate.generatedAt) < Date.parse(previous.generatedAt)) finding(findings, 'DATASET_TIME_REGRESSION');
  const changes: Record<string, { added: string[]; changed: string[]; removed: string[]; unchanged: number }> = {};
  for (const kind of KINDS) {
    const old = before.records[kind];
    const next = after.records[kind];
    const added = [...next.keys()].filter((id) => !old.has(id)).sort();
    const removed = [...old.keys()].filter((id) => !next.has(id)).sort();
    const changed: string[] = [];
    let unchanged = 0;
    for (const [id, row] of next) {
      const previousRow = old.get(id);
      if (!previousRow) continue;
      if (previousRow.parentId !== row.parentId) finding(findings, 'PARENT_ID_MISMATCH', { kind, id });
      if (stableJson(row) === stableJson(previousRow)) unchanged += 1;
      else {
        changed.push(id);
        knownRegressions(previousRow.value, row.value, `${kind}/${id}`, findings);
        if (kind === 'enemies') {
          const was = previousRow.value as { type: unknown; alignment: unknown; role: unknown };
          const now = row.value as typeof was;
          if (stableJson(was.type) !== stableJson(now.type) || stableJson(was.alignment) !== stableJson(now.alignment)) finding(findings, 'ATTRIBUTE_MISMATCH', { id });
          if (stableJson(was.role) !== stableJson(now.role)) finding(findings, 'ENEMY_ROLE_CHANGED', { id });
        }
      }
    }
    if (removed.length) {
      const code = kind === 'superAttacks' ? 'SUPER_ATTACK_LOSS' : kind === 'areaAttacks' ? 'AOE_LOSS' : 'RECORD_LOSS_OR_ID_RECONCILIATION_REQUIRED';
      finding(findings, code, { kind, removed: removed.length, sample: removed[0] ?? null });
      if (old.size > 0 && removed.length / old.size >= 0.2) finding(findings, 'MASS_RECORD_DISAPPEARANCE', { kind, previous: old.size, removed: removed.length });
    }
    if (changed.length) finding(findings, 'EXISTING_RECORD_CHANGED', { kind, changed: changed.length }, true);
    changes[kind] = { added, changed: changed.sort(), removed, unchanged };
  }
  for (const kind of ['normalAttacks', 'postSuperAttacks', 'attacks']) {
    if ((after.counts[kind] ?? 0) < (before.counts[kind] ?? 0)) finding(findings, 'ATTACK_COUNT_LOSS', { kind, previous: before.counts[kind] ?? 0, candidate: after.counts[kind] ?? 0 });
  }
  return {
    gateVersion: 'phase10-offline-review-1',
    status: findings.some((item) => item.severity === 'hard-fail') ? 'hard-fail' : findings.length ? 'review-required' : 'passed',
    previousCounts: before.counts, candidateCounts: after.counts, changes, findings,
    productionApplyAllowed: false as const
  };
}

export function validateCanonicalReferences(candidate: CanonicalEnemyDatasetV2): GateFinding[] {
  const findings: GateFinding[] = [];
  const snapshots = new Set(candidate.sourceSnapshots.map((snapshot) => snapshot.id));
  const evidence = new Set(candidate.evidence.map((item) => item.id));
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.sourceSnapshotId === 'string' && !snapshots.has(record.sourceSnapshotId)) finding(findings, 'DANGLING_SOURCE_REFERENCE', { path });
    if (Array.isArray(record.evidenceIds)) {
      for (const id of record.evidenceIds) if (!evidence.has(id)) finding(findings, 'DANGLING_EVIDENCE_REFERENCE', { path, id });
      if (record.state === 'known' && record.evidenceIds.length === 0) finding(findings, 'KNOWN_FIELD_WITHOUT_EVIDENCE', { path });
    }
    for (const [key, item] of Object.entries(record)) visit(item, `${path}/${key}`);
  };
  visit(candidate, '');
  return findings;
}
