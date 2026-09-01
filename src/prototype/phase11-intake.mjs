/** Prototype-only pipeline. Reuses pure production-foundation validators, never publishes. */
import { decodeLocalFile, requireIntake, FILE_LIMIT } from './phase11-file.mjs';
import { parseReferencePage, mergeReferencePages, referenceToCanonical, validateReferenceMaterial, FORMAT, REFERENCE_SOURCE } from './phase11-reference-adapter.mjs';
import { projectCanonicalToRuntime } from '../data-foundation/phase6-runtime.ts';
import { reviewRuntimeDiff, runtimeReviewCounts, validateCanonicalReferences, validateSemanticFields } from '../data-foundation/phase10-review.ts';
import { stableJson } from '../data-migration/phase4-enemy-migration.ts';
import validators from '../../generated/phase11/validators.cjs';

export const PROTOTYPE_VERSION = 'phase11-private-prototype-1';
export const DATABASE_NAME = 'dokkan-phase11-private-PROTOTYPE-v1';
export { runtimeReviewCounts };
export async function digestBytes(bytes) {
  requireIntake(globalThis.crypto?.subtle, 'SECURE_CONTEXT', 'この開き方では安全なハッシュ検査が使えません。localhost・HTTPSまたは対応する単一HTMLで開いてください。');
  return `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) => value.toString(16).padStart(2, '0')).join('')}`;
}
export async function describe(text) {
  const bytes = new TextEncoder().encode(text);
  return { text, bytes: bytes.length, digest: await digestBytes(bytes) };
}
export function manualPurposeGate(sourceKey) {
  // Do NOT weaken Phase 10's automatic/public sourcePreflight. This separate,
  // fixed-purpose prototype can admit only self-authored, synthetic fixtures.
  return { allowed: sourceKey === REFERENCE_SOURCE, purpose: 'synthetic-private-prototype', automaticFetchAllowed: false, productionApplyAllowed: false, realSourceAllowed: false };
}
function schemaCheck(canonical, runtime) {
  requireIntake(validators.canonical(canonical), 'CANONICAL_SCHEMA', '共通データ形式の検査に失敗しました。');
  requireIntake(validators.runtime(runtime), 'RUNTIME_SCHEMA', '計算用データ形式の検査に失敗しました。');
  const findings = [...validateCanonicalReferences(canonical), ...validateSemanticFields(canonical)];
  requireIntake(!findings.some((item) => item.severity === 'hard-fail'), 'CANONICAL_MEANING', '出典・値・条件の整合性検査に失敗しました。');
}
function requireComplete(merged) {
  requireIntake(merged.missing.length === 0, 'INCOMPLETE_STAGE', merged.missing.join('\n'));
  requireIntake(merged.eventName && merged.stageName, 'SOURCE_NAMES', 'イベント名またはステージ名が不足しています。');
  requireIntake(merged.by('encounter').every((record) => ['sequential', 'simultaneous', 'mixed'].includes(record.fields.layout)), 'ENCOUNTER_LAYOUT', '出現区分の意味が未対応です。');
  for (const attack of merged.by('super')) requireIntake(attack.fields.target === 'single', 'SUPER_TARGET', 'この試作では単体必殺以外の対象指定は未対応です。全体攻撃は専用レコードが必要です。');
  for (const action of merged.by('ai')) {
    requireIntake(action.fields.kind === 'normal', 'AI_KIND', 'この試作では通常攻撃以外のAI指定は未対応です。推測せず停止しました。');
    requireIntake(merged.by('enemy', action.parent).some((enemy) => enemy.id === action.fields.enemy), 'AI_REFERENCE', '行動の敵参照が同じ出現区分にありません。');
  }
}
export async function packagePages(pages) {
  // Canonical snapshot IDs and the representative source URL must not depend
  // on Android file-picker ordering.
  pages = pages.map(validateReferenceMaterial).sort((a, b) => a.part.localeCompare(b.part));
  const merged = mergeReferencePages(pages);
  requireComplete(merged);
  requireIntake(Date.parse(merged.revision) <= Date.now(), 'FUTURE_REVISION', '未来の日付の入力は適用できません。');
  const materials = [];
  for (const page of [...pages].sort((a, b) => a.part.localeCompare(b.part))) {
    requireIntake(manualPurposeGate(page.sourceKey).allowed && page.format === FORMAT, 'MANUAL_PURPOSE', 'この試作では実sourceの保存・適用を許可していません。');
    materials.push({ ...await describe(stableJson(page)), page });
  }
  const canonical = referenceToCanonical(merged, materials);
  const runtime = projectCanonicalToRuntime(canonical).runtime;
  schemaCheck(canonical, runtime);
  const selfCheck = reviewRuntimeDiff(runtime, runtime);
  requireIntake(selfCheck.status !== 'hard-fail', 'ATTACK_COMPATIBILITY', `攻撃値・属性・対象の検査に失敗しました。${selfCheck.findings.map((item) => item.code).join(', ')}`);
  const content = {
    version: PROTOTYPE_VERSION, classification: 'synthetic-private-prototype', productionApplyAllowed: false,
    stageKey: `${encodeURIComponent(merged.eventId)}/${encodeURIComponent(merged.stageId)}`, revision: merged.revision,
    materials: materials.map(({ text, bytes, digest }) => ({ text, bytes, digest })),
    canonical, runtime, canonicalDigest: (await describe(stableJson(canonical))).digest, runtimeDigest: (await describe(stableJson(runtime))).digest
  };
  return { ...content, digest: (await describe(stableJson(content))).digest };
}
export async function validatePackage(value) {
  requireIntake(value?.version === PROTOTYPE_VERSION && value.classification === 'synthetic-private-prototype' && value.productionApplyAllowed === false && Array.isArray(value.materials) && value.materials.length > 0 && value.materials.length <= 10, 'PACKAGE_VERSION', '試作保存データの形式・版が不正です。');
  const pages = [];
  for (const material of value.materials) {
    requireIntake(typeof material.text === 'string' && material.text.length < FILE_LIMIT, 'PACKAGE_MATERIAL', '保存材料が不正です。');
    const actual = await describe(material.text);
    requireIntake(actual.digest === material.digest && actual.bytes === material.bytes, 'MATERIAL_HASH', '保存材料のハッシュが一致しません。');
    // Re-validate every persisted field by converting the normalized record back
    // through the same allowlisted HTML parser (not a trusted JSON import route).
    const page = JSON.parse(material.text);
    requireIntake(stableJson(page) === material.text, 'MATERIAL_NORMALIZATION', '保存材料の形式が変わっています。');
    pages.push(page);
  }
  const rebuilt = await packagePages(pages);
  requireIntake(stableJson(rebuilt) === stableJson(value), 'PACKAGE_HASH', '試作保存データの内容・変換結果・ハッシュが一致しません。');
  return rebuilt;
}
export async function makeSnapshot(packages) {
  const sorted = [...packages].sort((a, b) => a.stageKey.localeCompare(b.stageKey));
  const content = { version: PROTOTYPE_VERSION, packages: sorted };
  return { ...content, digest: (await describe(stableJson(content))).digest };
}
export async function validateSnapshot(snapshot) {
  requireIntake(snapshot?.version === PROTOTYPE_VERSION && Array.isArray(snapshot.packages) && snapshot.packages.length <= 20, 'STORAGE_VERSION', '試作保存の版・件数が未対応です。');
  const keys = new Set();
  for (const value of snapshot.packages) {
    await validatePackage(value);
    requireIntake(!keys.has(value.stageKey), 'STORAGE_DUPLICATE', '保存内でステージが重複しています。'); keys.add(value.stageKey);
  }
  const rebuilt = await makeSnapshot(snapshot.packages);
  requireIntake(stableJson(snapshot) === stableJson(rebuilt), 'STORAGE_HASH', '試作保存データが壊れています。');
  return snapshot;
}
export function compositeForReview(official, packages) {
  requireIntake(validators.runtime(official), 'OFFICIAL_SCHEMA', '比較用の正式データ形式が不正です。');
  const composite = structuredClone(official);
  const names = new Set(official.events.flatMap((event) => event.stages.map((stage) => `${event.name.value}/${stage.name.value}`)));
  for (const value of packages) {
    for (const event of value.runtime.events) {
      requireIntake(event.id.startsWith('phase11-fixture:'), 'SCOPE', '正式データを置き換える範囲は指定できません。');
      for (const stage of event.stages) requireIntake(!names.has(`${event.name.value}/${stage.name.value}`), 'IDENTITY_REVIEW', '正式データと同名のステージがあります。名前だけでは統合しません。');
      const previous = composite.events.find((entry) => entry.id === event.id);
      if (previous) {
        requireIntake(stableJson(previous.name) === stableJson(event.name), 'EVENT_CONFLICT', '個人追加のイベント名が一致しません。');
        previous.stages.push(...structuredClone(event.stages));
      } else composite.events.push(structuredClone(event));
    }
    if (Date.parse(value.revision) > Date.parse(composite.generatedAt)) composite.generatedAt = value.revision;
  }
  return composite;
}

export async function checkApply(prepared, previous, official) {
  requireIntake(prepared?.status === 'ready' && prepared.baseDigest === previous.digest, 'STALE_PREVIEW', '保存状態が変わりました。ファイルを選び直して検査してください。');
  await validateSnapshot(previous);
  await validateSnapshot(prepared.snapshot);
  const review = reviewSnapshots(prepared.snapshot, previous, official);
  requireIntake(review.status !== 'hard-fail', 'APPLY_RECHECK', '適用直前の安全検査で問題が見つかりました。旧データを維持します。');
  return prepared.snapshot;
}
export function reviewSnapshots(next, previous, official) {
  const review = reviewRuntimeDiff(compositeForReview(official, next.packages), compositeForReview(official, previous.packages));
  // Runtime intentionally omits HP/DEF/AI. Preserve those source facts too;
  // otherwise runtime-only review would miss a disappearing AI record.
  for (const old of previous.packages) {
    const current = next.packages.find((pack) => pack.stageKey === old.stageKey);
    if (!current) continue; // Phase 10 already rejects a removed stage.
    const records = (pack) => mergeReferencePages(pack.materials.map((material) => JSON.parse(material.text))).records;
    const before = records(old), after = records(current);
    for (const record of before) if (!after.some((value) => value.kind === record.kind && value.id === record.id)) review.findings.push({ severity: 'hard-fail', code: 'PRIVATE_SOURCE_RECORD_LOST', details: { stage: old.stageKey, kind: record.kind, id: record.id } });
    if (stableJson(before) !== stableJson(after)) review.findings.push({ severity: 'review-required', code: 'PRIVATE_SOURCE_FIELDS_CHANGED', details: { stage: old.stageKey } });
  }
  review.status = review.findings.some((item) => item.severity === 'hard-fail') ? 'hard-fail' : review.findings.length ? 'review-required' : 'passed';
  return review;
}
export async function prepareFiles(files, previous, official) {
  requireIntake(files.length > 0 && files.length <= 10, 'FILE_COUNT', '一度に選べるのは1～10ファイルです。');
  requireIntake(files.every((file) => file.size > 0 && file.size <= FILE_LIMIT) && files.reduce((sum, file) => sum + file.size, 0) <= 16 * 1024 * 1024, 'FILE_SIZE', 'ファイルは各8MB、合計16MBまでです。');
  await validateSnapshot(previous);
  const groups = new Map(); const receipts = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = decodeLocalFile(bytes);
    const page = parseReferencePage(decoded);
    requireIntake(manualPurposeGate(page.sourceKey).allowed, 'MANUAL_PURPOSE', 'この取得元は試作の許容範囲外です。');
    const key = `${page.eventId}/${page.stageId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(page);
    receipts.push({ format: decoded.format, rawDigest: await digestBytes(bytes), rawBytes: bytes.length });
  }
  const incomplete = [...groups.values()].map(mergeReferencePages).filter((stage) => stage.missing.length);
  if (incomplete.length) return { status: 'incomplete', missing: incomplete.flatMap((stage) => stage.missing), links: incomplete.flatMap((stage) => stage.links), baseDigest: previous.digest, receipts, productionApplyAllowed: false };
  const imports = [];
  for (const pages of groups.values()) imports.push(await packagePages(pages));
  const next = new Map(previous.packages.map((value) => [value.stageKey, value]));
  for (const value of imports) {
    const old = next.get(value.stageKey);
    requireIntake(!old || Date.parse(value.revision) >= Date.parse(old.revision), 'REVISION_REGRESSION', '古い版への置き換えを停止しました。');
    next.set(value.stageKey, value);
  }
  const snapshot = await makeSnapshot([...next.values()]);
  requireIntake(snapshot.packages.length <= 20, 'STORAGE_COUNT', '試作保存は20ステージまでです。既存保存は変更しません。');
  const review = reviewSnapshots(snapshot, previous, official);
  const stageChanges = { added: [], changed: [], removed: [] };
  for (const value of snapshot.packages) {
    const old = previous.packages.find((pack) => pack.stageKey === value.stageKey);
    if (!old) stageChanges.added.push(value.stageKey);
    else if (old.digest !== value.digest) stageChanges.changed.push(value.stageKey);
  }
  return { status: review.status === 'hard-fail' ? 'blocked' : snapshot.digest === previous.digest ? 'unchanged' : 'ready', snapshot, baseDigest: previous.digest, review, stageChanges, receipts, productionApplyAllowed: false };
}
