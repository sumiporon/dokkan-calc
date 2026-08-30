/** Read-only, offline pre-publication review. Never fetches, applies, or writes data. */
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableJson } from '../generated/phase6/runtime/data-migration/phase4-enemy-migration.js';
import { projectCanonicalToRuntime } from '../generated/phase6/runtime/data-foundation/phase6-runtime.js';
import { evaluateUpdateSafety } from '../generated/phase6/runtime/data-foundation/phase6-gates.js';
import {
  sourcePreflight, reviewRuntimeDiff, runtimeReviewCounts,
  validateCanonicalReferences, validateSemanticFields
} from '../generated/phase6/runtime/data-foundation/phase10-review.js';
import { validatePhase9Manifest, validatePhase9Index, verifyArtifactText } from '../src/production/phase9-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
let validatorPromise;

async function validators() {
  validatorPromise ??= (async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    addFormats(ajv);
    const names = {
      canonical: 'enemy-data-v2.canonical', runtime: 'enemy-data-runtime-v1',
      permission: 'enemy-data-permission-ledger-v1', manifest: 'phase9-production-manifest-v1'
    };
    const schemas = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([key, name]) => [
      key, JSON.parse(await readFile(path.join(ROOT, 'schemas', `${name}.schema.json`), 'utf8'))
    ])));
    const result = Object.fromEntries(Object.entries(schemas).map(([key, schema]) => [key, ajv.compile(schema)]));
    // Generic field.value does not validate a known criticalOverride object.
    for (const key of ['canonical', 'runtime']) result[`${key}Critical`] = ajv.compile({ $ref: `${schemas[key].$id}#/$defs/critical` });
    return result;
  })();
  return validatorPromise;
}

export const sha256 = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
export const describeText = (text) => ({ digest: sha256(text), bytes: Buffer.byteLength(text) });

function validText(text, descriptor) {
  return typeof text === 'string' && descriptor?.digest === sha256(text)
    && descriptor?.bytes === Buffer.byteLength(text);
}

async function localArtifact(root, descriptor, label = 'PRODUCTION') {
  if (typeof descriptor?.path !== 'string' || descriptor.path.includes('\\') || /(^\/|:|[?#])/.test(descriptor.path)) throw new Error('LOCAL_ARTIFACT_PATH_INVALID');
  const resolvedRoot = await realpath(root);
  const target = await realpath(path.resolve(root, descriptor.path));
  const relative = path.relative(resolvedRoot, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('LOCAL_ARTIFACT_OUTSIDE_ROOT');
  const text = await readFile(target, 'utf8');
  if (!(await verifyArtifactText(text, descriptor)).valid) throw new Error(`${label}_ARTIFACT_DIGEST_MISMATCH`);
  return text;
}

function invalidCriticalOverrides(value, validate, at = '', invalid = []) {
  if (!value || typeof value !== 'object') return invalid;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'criticalOverride' && item?.state === 'known' && !validate(item.value)) invalid.push(`${at}/${key}`);
    invalidCriticalOverrides(item, validate, `${at}/${key}`, invalid);
  }
  return invalid;
}

/** Verify the actual deployed-format baseline without regenerating a single file. */
export async function readProductionBaseline() {
  const validate = await validators();
  const manifestText = await readFile(path.join(ROOT, 'data/release-manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  if (!validate.manifest(manifest) || validatePhase9Manifest(manifest).length) throw new Error('PRODUCTION_MANIFEST_INVALID');
  const sourceText = await readFile(path.join(ROOT, 'scraper/all_enemies.json'), 'utf8');
  if (sha256(sourceText) !== manifest.source.digest) throw new Error('PRODUCTION_SOURCE_DIGEST_MISMATCH');
  const root = path.join(ROOT, 'data');
  const fullText = await localArtifact(root, manifest.full.json);
  const runtime = JSON.parse(fullText);
  if (!validate.runtime(runtime)) throw new Error('PRODUCTION_RUNTIME_SCHEMA_INVALID');
  const index = JSON.parse(await localArtifact(root, manifest.chunked.indexJson));
  if (validatePhase9Index(index, manifest).length) throw new Error('PRODUCTION_INDEX_INVALID');
  const events = [];
  for (const entry of index.events) events.push(JSON.parse(await localArtifact(root, entry.json)));
  if (stableJson(events) !== stableJson(runtime.events)) throw new Error('PRODUCTION_CHUNK_FULL_MISMATCH');
  if (runtime.datasetId !== manifest.datasetVersion) throw new Error('PRODUCTION_VERSION_MISMATCH');
  const counts = runtimeReviewCounts(runtime);
  for (const [key, expected] of Object.entries(manifest.counts)) if (counts[key] !== expected) throw new Error(`PRODUCTION_COUNT_MISMATCH:${key}`);
  if (counts.attacks !== manifest.sourceCounts.attacks || counts.areaAttacks !== manifest.sourceCounts.areaAttacks) throw new Error('PRODUCTION_ATTACK_COUNT_MISMATCH');
  return { runtime, manifest, counts, manifestDigest: sha256(manifestText), fullDigest: sha256(fullText) };
}

/** Permission is checked BEFORE adapter code runs. The adapter remains offline-only. */
export async function runReviewedOfflineAdapter({ adapter, inputText, expectedInput, ledger, evaluatedAt }) {
  const validate = await validators();
  if (!validate.permission(ledger)) throw new Error('PERMISSION_LEDGER_SCHEMA_INVALID');
  const preflight = sourcePreflight(ledger, adapter.descriptor.sourceKey, evaluatedAt);
  if (!preflight.allowed) throw new Error(`SOURCE_PREFLIGHT_BLOCKED:${preflight.errors.join(',')}`);
  if (adapter.descriptor.networkAccess !== 'forbidden' || adapter.descriptor.outputSchemaVersion !== '2.0.0') throw new Error('OFFLINE_ADAPTER_CONTRACT_REQUIRED');
  if (!validText(inputText, expectedInput)) throw new Error('SOURCE_INPUT_DIGEST_MISMATCH');
  const input = JSON.parse(inputText);
  if (!adapter.canHandle(input)) throw new Error('SOURCE_INPUT_UNSUPPORTED');
  const result = adapter.adapt(input, {
    inputPath: 'offline-source-input', inputDigest: expectedInput.digest,
    inputBytes: expectedInput.bytes, reproducibleBy: 'offline source adapter + Phase 10 review'
  });
  if (!validate.canonical(result.canonical)) throw new Error('ADAPTER_CANONICAL_SCHEMA_INVALID');
  if (invalidCriticalOverrides(result.canonical, validate.canonicalCritical).length) throw new Error('ADAPTER_CRITICAL_OVERRIDE_INVALID');
  if (result.sourceMaterial?.inputDigest !== expectedInput.digest || result.sourceMaterial?.inputBytes !== expectedInput.bytes) throw new Error('ADAPTER_SOURCE_MATERIAL_MISMATCH');
  if (!result.canonical.sourceSnapshots.some((snapshot) => snapshot.id === result.sourceMaterial.sourceSnapshotId
    && snapshot.sourceKey === adapter.descriptor.sourceKey && snapshot.contentDigest === expectedInput.digest)) throw new Error('ADAPTER_SOURCE_IDENTITY_MISMATCH');
  for (const snapshot of result.canonical.sourceSnapshots) {
    if (!sourcePreflight(ledger, snapshot.sourceKey, evaluatedAt).allowed) throw new Error('ADAPTER_UNAPPROVED_SECONDARY_SOURCE');
  }
  return result;
}

/** This result is a review report, deliberately NOT a production manifest. */
export async function reviewCandidate({
  canonicalText, runtimeText, receipt, sourceInputs = [], ledger, previousRuntime, evaluatedAt
}) {
  const validate = await validators();
  const findings = [];
  const verifiedSourceInputs = [];
  const fail = (code, details = {}) => findings.push({ severity: 'hard-fail', code, details });
  const result = () => ({
    reportVersion: '1.0.0', evaluatedAt, networkRequests: 0, filesWritten: 0,
    productionApplyAllowed: false, verifiedSourceInputs, findings,
    status: findings.some((item) => item.severity === 'hard-fail') ? 'hard-fail' : 'review-required'
  });
  if (!Number.isFinite(Date.parse(evaluatedAt))) fail('INVALID_EVALUATION_TIME');
  if (!validText(canonicalText, receipt?.canonical)) fail('CANONICAL_DIGEST_MISMATCH');
  if (!validText(runtimeText, receipt?.runtime)) fail('RUNTIME_DIGEST_MISMATCH');
  if (!validate.permission(ledger)) fail('PERMISSION_LEDGER_SCHEMA_INVALID');
  let canonical, runtime;
  try { canonical = JSON.parse(canonicalText); runtime = JSON.parse(runtimeText); }
  catch { fail('CANDIDATE_JSON_INVALID'); return result(); }
  const canonicalValid = validate.canonical(canonical);
  if (!canonicalValid) fail('CANONICAL_SCHEMA_INVALID');
  const runtimeValid = validate.runtime(runtime);
  if (!runtimeValid) fail('RUNTIME_SCHEMA_INVALID');
  if (!validate.runtime(previousRuntime)) fail('BASELINE_SCHEMA_INVALID');
  if (!canonicalValid || !runtimeValid || findings.some((item) => item.code === 'BASELINE_SCHEMA_INVALID')) return result();
  const invalidOverrides = [
    ...invalidCriticalOverrides(canonical, validate.canonicalCritical, 'canonical'),
    ...invalidCriticalOverrides(runtime, validate.runtimeCritical, 'runtime')
  ];
  if (invalidOverrides.length) {
    fail('CRITICAL_OVERRIDE_SCHEMA_INVALID', { paths: invalidOverrides });
    return result(); // Do not pass an invalid nested object to projection/traversal.
  }
  const projection = projectCanonicalToRuntime(canonical);
  if (stableJson(projection.runtime) !== stableJson(runtime)) fail('RUNTIME_PROJECTION_MISMATCH');
  const counts = runtimeReviewCounts(runtime);
  if (stableJson(counts) !== stableJson(receipt?.counts)) fail('RECEIPT_COUNT_MISMATCH');
  if (canonical.region === 'synthetic' || canonical.region !== previousRuntime.region) fail('CANDIDATE_REGION_NOT_PRODUCTION');
  if (Date.parse(canonical.generatedAt) > Date.parse(evaluatedAt)) fail('CANDIDATE_FROM_FUTURE');
  const permission = [];
  if (validate.permission(ledger)) {
    for (const key of new Set(canonical.sourceSnapshots.map((snapshot) => snapshot.sourceKey))) {
      const check = sourcePreflight(ledger, key, evaluatedAt);
      permission.push(check);
      if (!check.allowed) fail('SOURCE_PERMISSION_BLOCKED', { sourceKey: key, errors: check.errors });
    }
  }
  const inputs = Array.isArray(sourceInputs) ? sourceInputs : [];
  const descriptors = Array.isArray(receipt?.sources) ? receipt.sources : [];
  const snapshotIds = new Set(canonical.sourceSnapshots.map((snapshot) => snapshot.id));
  for (const item of [...inputs, ...descriptors]) {
    if (!snapshotIds.has(item?.sourceSnapshotId)) fail('SOURCE_INPUT_UNDECLARED', { id: item?.sourceSnapshotId ?? null });
  }
  for (const snapshot of canonical.sourceSnapshots) {
    if (!snapshot.contentDigest) fail('SOURCE_DIGEST_MISSING', { id: snapshot.id });
    if (Date.parse(snapshot.acquiredAt) > Date.parse(evaluatedAt)) fail('SOURCE_FROM_FUTURE', { id: snapshot.id });
    const matches = inputs.filter((input) => input?.sourceSnapshotId === snapshot.id);
    const receipts = descriptors.filter((descriptor) => descriptor?.sourceSnapshotId === snapshot.id);
    if (matches.length !== 1 || receipts.length !== 1) {
      fail('SOURCE_INPUT_MISSING_OR_AMBIGUOUS', { id: snapshot.id });
    } else if (!validText(matches[0].text, receipts[0])
      || snapshot.contentDigest !== sha256(matches[0].text)) {
      fail('SOURCE_INPUT_DIGEST_MISMATCH', { id: snapshot.id });
    } else {
      verifiedSourceInputs.push({ sourceSnapshotId: snapshot.id, ...describeText(matches[0].text) });
    }
  }
  findings.push(...validateCanonicalReferences(canonical), ...validateSemanticFields(canonical));
  // Do not invent a canonical known-good by reverse-converting the legacy runtime.
  const safety = evaluateUpdateSafety({
    candidate: canonical, runtime, previousKnownGood: null, evaluatedAt,
    integrity: {
      canonicalSchemaValid: canonicalValid, runtimeSchemaValid: runtimeValid,
      canonicalDigestMatches: validText(canonicalText, receipt?.canonical),
      runtimeDigestMatches: validText(runtimeText, receipt?.runtime),
      canonicalGenerationSucceeded: true, runtimeGenerationSucceeded: true
    }
  });
  findings.push(...safety.findings);
  const diff = reviewRuntimeDiff(runtime, previousRuntime);
  findings.push(...diff.findings);
  findings.push({ severity: 'review-required', code: 'SOURCE_ONBOARDING_REQUIRES_REVIEW', details: {
    reason: 'Permission, full enemy/stage coverage, recent-event latency, AOE semantics, stable IDs and owner source approval must be reviewed before release generation.'
  } });
  return { ...result(), permission, counts, diff, canonicalSafety: safety };
}

async function main() {
  const args = process.argv.slice(2);
  const baseline = await readProductionBaseline();
  if (args.length === 0 || (args.length === 1 && args[0] === '--baseline')) {
    const diff = reviewRuntimeDiff(baseline.runtime, baseline.runtime);
    console.log(JSON.stringify({
      reportVersion: '1.0.0', classification: 'unchanged-production-audit-not-new-source',
      networkRequests: 0, filesWritten: 0, productionApplyAllowed: false,
      datasetVersion: baseline.manifest.datasetVersion, sourceDigest: baseline.manifest.source.digest,
      manifestDigest: baseline.manifestDigest, fullDigest: baseline.fullDigest,
      sourceCounts: baseline.manifest.sourceCounts, diff
    }, null, 2));
    if (diff.status !== 'passed') process.exitCode = 1;
    return;
  }
  if (args.length !== 4 || args[0] !== '--candidate') throw new Error('Usage: --baseline OR --candidate <canonical.json> <runtime.json> <receipt.json>');
  const [canonicalText, runtimeText, receiptText, ledgerText] = await Promise.all([
    ...args.slice(1).map((file) => readFile(path.resolve(file), 'utf8')),
    readFile(path.join(ROOT, 'artifacts/phase10/permission-ledger.json'), 'utf8')
  ]);
  const receipt = JSON.parse(receiptText);
  const receiptRoot = path.dirname(path.resolve(args[3]));
  const sourceInputs = [];
  for (const descriptor of Array.isArray(receipt?.sources) ? receipt.sources : []) {
    sourceInputs.push({ sourceSnapshotId: descriptor.sourceSnapshotId, text: await localArtifact(receiptRoot, descriptor, 'SOURCE_INPUT') });
  }
  const report = await reviewCandidate({
    canonicalText, runtimeText, receipt, sourceInputs, ledger: JSON.parse(ledgerText),
    previousRuntime: baseline.runtime, evaluatedAt: new Date().toISOString()
  });
  console.log(JSON.stringify(report, null, 2));
  // No source is onboarded in Phase 10; nonzero exit prevents accidental publication.
  process.exitCode = report.status === 'hard-fail' ? 1 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
