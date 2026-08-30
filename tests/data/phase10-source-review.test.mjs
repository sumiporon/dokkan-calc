import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  describeText, readProductionBaseline, reviewCandidate, runReviewedOfflineAdapter
} from '../../scripts/review-phase10-candidate.mjs';
import {
  sourcePreflight, reviewRuntimeDiff, runtimeReviewCounts
} from '../../generated/phase6/runtime/data-foundation/phase10-review.js';
import { projectCanonicalToRuntime } from '../../generated/phase6/runtime/data-foundation/phase6-runtime.js';

const readJson = async (file) => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
const fixture = await readJson('../fixtures/phase8/synthetic-runtime.json');
const ledger = await readJson('../../artifacts/phase10/permission-ledger.json');
const baseline = await readProductionBaseline();
const evaluatedAt = '2026-08-31T12:00:00.000Z';
const inputText = '{"fictionalFixture":true}';
const expectedInput = describeText(inputText);
const firstEncounter = (data) => data.events[0].stages[0].encounters[0];
const firstEnemy = (data) => firstEncounter(data).enemies[0];
const codes = (report) => report.findings.map((item) => item.code);
const field = (value) => ({ state: value === null ? 'unknown' : 'known', value, evidenceIds: ['fixture:evidence'], confidence: 'high' });
const ref = (entityKind, id) => [{ sourceSnapshotId: 'fixture:snapshot', entityKind, sourceId: id, compositeKey: id, sourceUrl: 'https://example.invalid/fixture' }];
const annotate = (value) => {
  if (Array.isArray(value)) return value.map(annotate);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, annotate(item)]));
  return 'state' in result && 'value' in result ? { ...result, evidenceIds: ['fixture:evidence'], confidence: 'high' } : result;
};
const effect = (item) => ({ ...annotate(item), trigger: { ...annotate(item.trigger), sourceText: field(null) }, sourceSkillId: field(null), sourceText: field(null), evidenceIds: ['fixture:evidence'], confidence: 'high' });
const critical = (item) => ({ ...annotate(item), rateRules: item.rateRules.map(effect) });

/** Synthetic test builder only. Never reverse-converts real production into canonical. */
function fictionalCanonical() {
  return {
    schemaVersion: '2.0.0', datasetId: 'fixture:canonical', generatedAt: fixture.generatedAt, region: 'synthetic',
    sourceSnapshots: [{
      id: 'fixture:snapshot', sourceKey: 'fictional-test-only', provider: 'fictional unit test', region: 'synthetic',
      acquiredAt: fixture.generatedAt, publishedAt: null, revisedAt: null, importMethod: 'test-only',
      policyStatus: 'synthetic-test', parserVersion: 'test-1', sourceRootUrl: 'https://example.invalid',
      contentDigest: expectedInput.digest, notes: 'Not a real source. Never publish as production.'
    }],
    evidence: [{ id: 'fixture:evidence', sourceSnapshotId: 'fixture:snapshot', sourceUrl: 'https://example.invalid/fixture', sourceFile: null, observedAt: fixture.generatedAt, confidence: 'high', notes: 'Fictional test evidence.' }],
    events: fixture.events.map((event) => ({
      id: event.id, sourceRefs: ref('event', event.id), name: annotate(event.name), category: annotate(event.category),
      stages: event.stages.map((stage) => ({
        id: stage.id, sourceRefs: ref('stage', stage.id), name: annotate(stage.name),
        encounters: stage.encounters.map((encounter) => ({
          id: encounter.id, sourceRefs: ref('encounter', encounter.id), order: encounter.order,
          phaseId: field(null), layoutKind: field('sequential'), aiActions: [],
          areaAttacks: encounter.areaAttacks.map((area) => ({ ...annotate(area), sourceText: field(null), evidenceIds: ['fixture:evidence'], confidence: 'high' })),
          enemies: encounter.enemies.map((enemy) => ({
            id: enemy.id, sourceRefs: ref('enemy', enemy.id), orderInEncounter: enemy.orderInEncounter,
            role: annotate(enemy.role), name: annotate(enemy.name), type: annotate(enemy.type), alignment: annotate(enemy.alignment),
            externalIds: { sourceEnemyId: field(null), cardId: field(null), thumbId: field(null) }, isEzaCardLink: field(null),
            stats: { hp: field(null), baseAttack: annotate(enemy.baseAttack), defense: field(null), damageReductionPercent: field(null), maxAttacksPerTurn: field(null) },
            superAttacks: enemy.superAttacks.map((attack) => ({
              ...annotate(attack), sourceRefs: ref('super-attack', attack.id), description: field(null), attackType: field(null),
              effects: attack.effects.map(effect), usageRules: attack.usageRules.map((rule) => ({ ...annotate(rule), sourceText: field(null) })),
              criticalOverride: attack.criticalOverride.state === 'known'
                ? { ...field(null), state: 'known', value: critical(attack.criticalOverride.value) } : annotate(attack.criticalOverride)
            })),
            passiveEffects: enemy.passiveEffects.map(effect), critical: critical(enemy.critical), skills: []
          }))
        }))
      }))
    })), manualCorrections: []
  };
}

function fictionalPermission() {
  return { ...structuredClone(ledger), entries: [{
    sourceKey: 'fictional-test-only', displayName: 'Fictional permission test, not a real grant', acquisitionMode: 'automatic-approved',
    automaticFetch: 'allowed', manualFetch: 'unknown', offlineTransform: 'allowed', redistributeRaw: 'denied',
    redistributeDerived: 'allowed', publishDerived: 'allowed', validFrom: null, validUntil: null,
    reviewedAt: fixture.generatedAt, evidenceUrls: ['https://example.invalid/fixture-permission'], notes: 'Unit test only.'
  }] };
}

function candidateInput(canonical = fictionalCanonical()) {
  const runtime = projectCanonicalToRuntime(canonical).runtime;
  const canonicalText = JSON.stringify(canonical);
  const runtimeText = JSON.stringify(runtime);
  return {
    canonicalText, runtimeText, receipt: {
      canonical: describeText(canonicalText), runtime: describeText(runtimeText), counts: runtimeReviewCounts(runtime),
      sources: [{ sourceSnapshotId: 'fixture:snapshot', ...expectedInput }]
    },
    sourceInputs: [{ sourceSnapshotId: 'fixture:snapshot', text: inputText }],
    ledger: fictionalPermission(), previousRuntime: runtime, evaluatedAt
  };
}

function fixtureAdapter(canonical = fictionalCanonical()) {
  return {
    descriptor: { adapterId: 'fictional', adapterVersion: '1', sourceKey: 'fictional-test-only', inputFormat: 'test-json', outputSchemaVersion: '2.0.0', networkAccess: 'forbidden' },
    canHandle: (input) => input?.fictionalFixture === true,
    adapt: (_input, context) => ({ canonical, sourceMaterial: { sourceSnapshotId: 'fixture:snapshot', inputDigest: context.inputDigest, inputBytes: context.inputBytes } })
  };
}

test('Phase 10 reads all actual production artifacts without regeneration; 4,245 enemies / 8,899 attacks are unchanged', () => {
  assert.deepEqual(baseline.counts, { events: 56, stages: 647, encounters: 647, enemies: 4245, superAttacks: 4245, areaAttacks: 0, normalAttacks: 4245, postSuperAttacks: 409, attacks: 8899 });
  assert.equal(baseline.manifest.source.digest, 'sha256:f1cb27a2e5cae9627be61934aaabec79e4af0b42d3e21ad0cc7945eb6d7a0b40');
  const report = reviewRuntimeDiff(baseline.runtime, baseline.runtime);
  assert.equal(report.status, 'passed');
  assert.ok(Object.values(report.changes).every((change) => !change.added.length && !change.changed.length && !change.removed.length));
  assert.equal(report.productionApplyAllowed, false);
});

test('all researched sources are blocked; DokkanStats remains pending and unused', () => {
  for (const entry of ledger.entries) assert.equal(sourcePreflight(ledger, entry.sourceKey, evaluatedAt).allowed, false, entry.sourceKey);
  const stats = ledger.entries.find((entry) => entry.sourceKey === 'dokkanstats');
  assert.equal(stats.acquisitionMode, 'written-permission-pending');
  assert.equal(stats.automaticFetch, 'unknown');
  assert.match(stats.notes, /permission: pending/);
});

test('source admission fails closed for expiry, not-yet-valid, future review and missing evidence', () => {
  assert.equal(sourcePreflight(fictionalPermission(), 'fictional-test-only', evaluatedAt).allowed, true);
  for (const override of [
    { validUntil: evaluatedAt }, { validFrom: '2027-01-01T00:00:00Z' },
    { reviewedAt: '2027-01-01T00:00:00Z' }, { evidenceUrls: [] }, { publishDerived: 'unknown' }, { redistributeDerived: 'denied' }
  ]) {
    const permissions = fictionalPermission();
    Object.assign(permissions.entries[0], override);
    assert.equal(sourcePreflight(permissions, 'fictional-test-only', evaluatedAt).allowed, false, JSON.stringify(override));
  }
});

test('duplicate/missing ledger source and invalid evaluation time cannot grant access', () => {
  const permissions = fictionalPermission();
  permissions.entries.push(structuredClone(permissions.entries[0]));
  assert.equal(sourcePreflight(permissions, 'fictional-test-only', evaluatedAt).allowed, false);
  assert.equal(sourcePreflight(permissions, 'not-registered', evaluatedAt).allowed, false);
  assert.equal(sourcePreflight(fictionalPermission(), 'fictional-test-only', 'invalid').allowed, false);
});

test('permission rejection occurs before either adapter method executes (no source I/O)', async () => {
  let calls = 0;
  const adapter = fixtureAdapter();
  adapter.descriptor.sourceKey = 'dokkanstats';
  adapter.canHandle = adapter.adapt = () => { calls += 1; throw new Error('must not run'); };
  await assert.rejects(runReviewedOfflineAdapter({ adapter, inputText, expectedInput, ledger, evaluatedAt }), /SOURCE_PREFLIGHT_BLOCKED/);
  assert.equal(calls, 0);
});

test('existing offline adapter contract is reusable with verified synthetic input, without a network adapter', async () => {
  const result = await runReviewedOfflineAdapter({ adapter: fixtureAdapter(), inputText, expectedInput, ledger: fictionalPermission(), evaluatedAt });
  assert.equal(result.canonical.schemaVersion, '2.0.0');
  assert.equal(result.sourceMaterial.inputDigest, expectedInput.digest);
  const report = await reviewCandidate(candidateInput(result.canonical));
  assert.ok(!codes(report).includes('CANONICAL_SCHEMA_INVALID'));
  assert.equal(report.productionApplyAllowed, false);
  assert.ok(codes(report).includes('CANDIDATE_REGION_NOT_PRODUCTION'));
});

test('adapter rejects tampered source bytes and wrong snapshot identity', async () => {
  const args = { adapter: fixtureAdapter(), inputText, expectedInput, ledger: fictionalPermission(), evaluatedAt };
  await assert.rejects(runReviewedOfflineAdapter({ ...args, inputText: `${inputText} ` }), /SOURCE_INPUT_DIGEST_MISMATCH/);
  const canonical = fictionalCanonical();
  canonical.sourceSnapshots[0].contentDigest = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(runReviewedOfflineAdapter({ ...args, adapter: fixtureAdapter(canonical) }), /ADAPTER_SOURCE_IDENTITY_MISMATCH/);
});

test('adapter cannot smuggle an unapproved secondary source or a network-enabled contract', async () => {
  const canonical = fictionalCanonical();
  canonical.sourceSnapshots.push({ ...canonical.sourceSnapshots[0], id: 'secondary', sourceKey: 'dokkanstats' });
  await assert.rejects(runReviewedOfflineAdapter({ adapter: fixtureAdapter(canonical), inputText, expectedInput, ledger: fictionalPermission(), evaluatedAt }), /ADAPTER_UNAPPROVED_SECONDARY_SOURCE/);
  const adapter = fixtureAdapter();
  adapter.descriptor.networkAccess = 'allowed';
  await assert.rejects(runReviewedOfflineAdapter({ adapter, inputText, expectedInput, ledger: fictionalPermission(), evaluatedAt }), /OFFLINE_ADAPTER_CONTRACT_REQUIRED/);
});

test('candidate checks actual byte digests, not self-declared schema/digest booleans', async () => {
  const args = candidateInput();
  args.canonicalText += ' ';
  args.runtimeText += ' ';
  const report = await reviewCandidate(args);
  assert.ok(codes(report).includes('CANONICAL_DIGEST_MISMATCH'));
  assert.ok(codes(report).includes('RUNTIME_DIGEST_MISMATCH'));
});

test('direct candidate review verifies original source bytes as well as generated artifacts', async () => {
  const good = await reviewCandidate(candidateInput());
  assert.deepEqual(good.verifiedSourceInputs, [{ sourceSnapshotId: 'fixture:snapshot', ...expectedInput }]);
  const canonical = fictionalCanonical();
  canonical.sourceSnapshots[0].contentDigest = `sha256:${'0'.repeat(64)}`;
  assert.ok(codes(await reviewCandidate(candidateInput(canonical))).includes('SOURCE_INPUT_DIGEST_MISMATCH'));
  const args = candidateInput();
  args.sourceInputs[0].text += ' ';
  assert.ok(codes(await reviewCandidate(args)).includes('SOURCE_INPUT_DIGEST_MISMATCH'));
  args.receipt.sources[0].bytes += 1;
  assert.ok(codes(await reviewCandidate(args)).includes('SOURCE_INPUT_DIGEST_MISMATCH'));
});

test('every source snapshot needs exactly one real input and receipt, without undeclared inputs', async () => {
  for (const mutate of [
    (args) => { args.sourceInputs = []; },
    (args) => { args.receipt.sources = []; },
    (args) => { args.sourceInputs.push({ ...args.sourceInputs[0] }); },
    (args) => { args.receipt.sources.push({ ...args.receipt.sources[0] }); }
  ]) {
    const args = candidateInput(); mutate(args);
    assert.ok(codes(await reviewCandidate(args)).includes('SOURCE_INPUT_MISSING_OR_AMBIGUOUS'));
  }
  const canonical = fictionalCanonical();
  canonical.sourceSnapshots.push({ ...canonical.sourceSnapshots[0], id: 'second-snapshot' });
  assert.ok(codes(await reviewCandidate(candidateInput(canonical))).includes('SOURCE_INPUT_MISSING_OR_AMBIGUOUS'));
  const args = candidateInput();
  args.sourceInputs.push({ sourceSnapshotId: 'not-declared', text: inputText });
  assert.ok(codes(await reviewCandidate(args)).includes('SOURCE_INPUT_UNDECLARED'));
});

test('malformed JSON or missing required fields fails without crashing traversal', async () => {
  const args = candidateInput();
  assert.ok(codes(await reviewCandidate({ ...args, canonicalText: '{' })).includes('CANDIDATE_JSON_INVALID'));
  assert.ok(codes(await reviewCandidate({ ...args, canonicalText: '{}' })).includes('CANONICAL_SCHEMA_INVALID'));
  assert.ok(codes(await reviewCandidate({ ...args, runtimeText: '{}' })).includes('RUNTIME_SCHEMA_INVALID'));
});

test('runtime must be the exact canonical projection even when its recomputed digest is valid', async () => {
  const args = candidateInput();
  const runtime = JSON.parse(args.runtimeText);
  firstEnemy(runtime).baseAttack.value += 1;
  args.runtimeText = JSON.stringify(runtime);
  args.receipt.runtime = describeText(args.runtimeText);
  assert.ok(codes(await reviewCandidate(args)).includes('RUNTIME_PROJECTION_MISMATCH'));
});

test('declared event/stage/enemy/attack counts must equal recomputed counts', async () => {
  const args = candidateInput();
  args.receipt.counts.attacks += 1;
  assert.ok(codes(await reviewCandidate(args)).includes('RECEIPT_COUNT_MISMATCH'));
});

test('duplicate IDs are detected at every hierarchy level and across kinds', () => {
  for (const mutate of [
    (data) => { data.events.push(structuredClone(data.events[0])); },
    (data) => { data.events[0].stages[0].id = data.events[0].id; },
    (data) => { firstEncounter(data).id = data.events[0].id; },
    (data) => { firstEnemy(data).id = data.events[0].id; },
    (data) => { firstEnemy(data).superAttacks[0].id = data.events[0].id; },
    (data) => { firstEncounter(data).areaAttacks[0].id = data.events[0].id; }
  ]) {
    const data = structuredClone(fixture); mutate(data);
    assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('DUPLICATE_RUNTIME_ID'));
  }
});

test('same-count record replacement and mass disappearance cannot bypass the gate', () => {
  const data = structuredClone(fixture);
  firstEnemy(data).id = 'different-identity';
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('RECORD_LOSS_OR_ID_RECONCILIATION_REQUIRED'));
  data.events = [];
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('MASS_RECORD_DISAPPEARANCE'));
});

test('an existing enemy cannot silently move to another encounter', () => {
  const data = structuredClone(fixture);
  data.events[1].stages[0].encounters[0].enemies.push(firstEncounter(data).enemies.shift());
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('PARENT_ID_MISMATCH'));
});

test('normal attack loss, zero/unknown confusion and non-combat relabeling are blocked', () => {
  const data = structuredClone(fixture);
  firstEnemy(data).baseAttack = { state: 'unknown', value: null };
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('NORMAL_ATTACK_MISSING_OR_INVALID'));
  firstEnemy(data).baseAttack = { state: 'known', value: 0 };
  assert.ok(!codes(reviewRuntimeDiff(data, fixture)).includes('NORMAL_ATTACK_MISSING_OR_INVALID'));
  firstEnemy(data).role.value = 'non-combat';
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('ENEMY_ROLE_CHANGED'));
});

test('one missing Super among multiple Supers is rejected even with a replacement attack', () => {
  const data = structuredClone(fixture);
  assert.ok(firstEnemy(data).superAttacks.length > 1);
  firstEnemy(data).superAttacks[0].id = 'new-super';
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('SUPER_ATTACK_LOSS'));
});

test('one missing AOE is rejected even when another attack keeps total counts unchanged', () => {
  const data = structuredClone(fixture);
  firstEncounter(data).areaAttacks[0].id = 'new-area';
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('AOE_LOSS'));
});

test('AOE first/additional target values and source enemy reference must be independently known', () => {
  for (const [target, code] of [['first', 'AOE_FIRST_TARGET_MISSING'], ['additional', 'AOE_ADDITIONAL_TARGET_MISSING']]) {
    const data = structuredClone(fixture);
    const area = firstEncounter(data).areaAttacks[0];
    area[`${target}TargetDamage`] = area[`${target}TargetMultiplier`] = { state: 'unknown', value: null };
    assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes(code));
  }
  const data = structuredClone(fixture);
  firstEncounter(data).areaAttacks[0].sourceEnemyId.value = 'other-encounter-enemy';
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('AOE_ENEMY_REFERENCE_INVALID'));
});

test('new multiplier-only Super and AOE entries cannot silently become zero in the Phase 9 consumer', () => {
  const data = structuredClone(fixture);
  const attack = structuredClone(firstEnemy(data).superAttacks[0]);
  attack.id = 'new-multiplier-only-super';
  attack.displayedDamage = { state: 'unknown', value: null };
  attack.derivedMultiplier = { state: 'known', value: 3 };
  firstEnemy(data).superAttacks.push(attack);
  assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('SUPER_ATTACK_VALUE_MISSING'));
  for (const [target, code] of [['first', 'AOE_FIRST_TARGET_MISSING'], ['additional', 'AOE_ADDITIONAL_TARGET_MISSING']]) {
    const candidate = structuredClone(fixture);
    const area = structuredClone(firstEncounter(candidate).areaAttacks[0]);
    area.id = `new-multiplier-only-area-${target}`;
    area[`${target}TargetDamage`] = { state: 'unknown', value: null };
    area[`${target}TargetMultiplier`] = { state: 'known', value: 3 };
    firstEncounter(candidate).areaAttacks.push(area);
    const report = reviewRuntimeDiff(candidate, fixture);
    assert.equal(report.status, 'hard-fail');
    assert.ok(codes(report).includes(code));
    assert.ok(!codes(report).includes('KNOWN_VALUE_LOST')); // New ID, not a regression against an old row.
  }
});

test('attribute/neutral mismatches and known-to-unknown regressions cannot auto-apply', () => {
  const data = structuredClone(fixture);
  firstEnemy(data).alignment.value = 'neutral';
  firstEnemy(data).type = { state: 'unknown', value: null };
  const report = reviewRuntimeDiff(data, fixture);
  assert.ok(codes(report).includes('ATTRIBUTE_MISMATCH'));
  assert.ok(codes(report).includes('KNOWN_VALUE_LOST'));
});

test('loss of post-Super effects or HP usage rules is blocked', () => {
  const data = structuredClone(fixture);
  firstEnemy(data).superAttacks.forEach((attack) => { attack.effects = []; attack.usageRules = []; });
  const report = reviewRuntimeDiff(data, fixture);
  assert.ok(codes(report).includes('RULE_OR_EFFECT_LOST'));
  assert.ok(codes(report).includes('ATTACK_COUNT_LOSS'));
});

test('negative, string numeric, percentage over 100 and inverted HP bounds fail semantic checks', () => {
  for (const value of [-1, '500000', Infinity]) {
    const data = structuredClone(fixture);
    firstEnemy(data).baseAttack.value = value;
    assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('IMPOSSIBLE_NUMERIC_VALUE'));
  }
  const data = structuredClone(fixture);
  const rule = firstEnemy(data).superAttacks.flatMap((attack) => attack.usageRules)[0];
  rule.hpMinPercent = { state: 'known', value: 90 };
  rule.hpMaxPercent = { state: 'known', value: 20 };
  rule.probabilityPercent = { state: 'known', value: 101 };
  const report = reviewRuntimeDiff(data, fixture);
  assert.ok(codes(report).includes('IMPOSSIBLE_NUMERIC_VALUE'));
  assert.ok(codes(report).includes('INVERTED_HP_RANGE'));
});

test('new effects require finite numeric value/cap; legitimate negative debuffs are not rejected as a type error', () => {
  const previous = structuredClone(fixture);
  const row = firstEnemy(previous);
  const sampleEffect = structuredClone([...row.passiveEffects, ...row.superAttacks.flatMap((attack) => attack.effects)][0]);
  const addEffect = (key, value) => {
    const data = structuredClone(previous);
    const effect = structuredClone(sampleEffect);
    effect.id = 'new-effect';
    effect[key] = { state: 'known', value };
    firstEnemy(data).passiveEffects.push(effect);
    return reviewRuntimeDiff(data, previous);
  };
  for (const key of ['value', 'cap']) {
    for (const value of ['not-a-number', Infinity, NaN, true]) {
      assert.ok(codes(addEffect(key, value)).includes('IMPOSSIBLE_EFFECT_VALUE'));
    }
    assert.ok(!codes(addEffect(key, -20)).includes('IMPOSSIBLE_EFFECT_VALUE'));
  }
});

test('critical enabled flags cannot coerce strings into boolean game rules', () => {
  for (const value of ['false', 0, 1, []]) {
    const data = structuredClone(fixture);
    firstEnemy(data).critical.enabled = { state: 'known', value };
    assert.ok(codes(reviewRuntimeDiff(data, fixture)).includes('INVALID_BOOLEAN_VALUE'));
  }
});

test('known critical overrides must satisfy their nested schema before projection runs', async () => {
  for (const value of ['false', {}, { enabled: { state: 'known', value: true }, rateRules: [] }]) {
    const args = candidateInput();
    const canonical = JSON.parse(args.canonicalText);
    firstEnemy(canonical).superAttacks[0].criticalOverride = field(value);
    args.canonicalText = JSON.stringify(canonical);
    args.receipt.canonical = describeText(args.canonicalText);
    const report = await reviewCandidate(args);
    assert.equal(report.status, 'hard-fail');
    assert.ok(codes(report).includes('CRITICAL_OVERRIDE_SCHEMA_INVALID'));
  }
  const canonical = fictionalCanonical();
  firstEnemy(canonical).superAttacks[0].criticalOverride = field(critical(firstEnemy(fixture).critical));
  firstEnemy(canonical).superAttacks[0].criticalOverride.value.enabled = field('false');
  assert.ok(codes(await reviewCandidate(candidateInput(canonical))).includes('INVALID_BOOLEAN_VALUE'));
});

test('ordinary additions pass the diff, but valid changes require review rather than promotion', () => {
  const previous = structuredClone(fixture);
  previous.events = previous.events.slice(0, 1);
  assert.equal(reviewRuntimeDiff(fixture, previous).status, 'passed');
  const changed = structuredClone(fixture);
  firstEnemy(changed).baseAttack.value += 1;
  const report = reviewRuntimeDiff(changed, fixture);
  assert.equal(report.status, 'review-required');
  assert.equal(report.productionApplyAllowed, false);
});

test('older source revisions and different regions cannot masquerade as new production releases', () => {
  const data = structuredClone(fixture);
  data.generatedAt = '2000-01-01T00:00:00Z';
  data.region = 'wrong-region';
  const report = reviewRuntimeDiff(data, fixture);
  assert.ok(codes(report).includes('DATASET_TIME_REGRESSION'));
  assert.ok(codes(report).includes('REGION_MISMATCH'));
});

test('canonical provenance rejects dangling references and claimed known values without evidence', async () => {
  const data = fictionalCanonical();
  data.evidence[0].sourceSnapshotId = 'missing-snapshot';
  firstEnemy(data).stats.baseAttack.evidenceIds = ['missing-evidence'];
  firstEnemy(data).name.evidenceIds = [];
  const report = await reviewCandidate(candidateInput(data));
  assert.ok(codes(report).includes('DANGLING_SOURCE_REFERENCE'));
  assert.ok(codes(report).includes('DANGLING_EVIDENCE_REFERENCE'));
  assert.ok(codes(report).includes('KNOWN_FIELD_WITHOUT_EVIDENCE'));
});

test('review cannot publish synthetic fixtures or treat legacy runtime as canonical known-good', async () => {
  const report = await reviewCandidate(candidateInput());
  assert.ok(codes(report).includes('CANDIDATE_REGION_NOT_PRODUCTION'));
  assert.ok(codes(report).includes('NO_CANONICAL_KNOWN_GOOD_BASELINE'));
  assert.ok(codes(report).includes('SOURCE_ONBOARDING_REQUIRES_REVIEW'));
  assert.equal(report.productionApplyAllowed, false);
  assert.equal(report.networkRequests, 0);
  assert.equal(report.filesWritten, 0);
});

test('branch legacy workflow has no runnable scrape/publish job and no write permission', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/scrape.yml', import.meta.url), 'utf8');
  assert.match(workflow, /if: \$\{\{ false \}\}/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /^\s+contents: write/m);
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
  assert.match(workflow, /scrape-all-events\.js/); // Legacy implementation remains preserved, never run.
});
