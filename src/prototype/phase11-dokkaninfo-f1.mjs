/**
 * Phase F1 only: immutable, self-authored DokkanInfo-shaped snapshots.
 *
 * This is deliberately separate from the live adapter.  It neither fetches
 * nor observes a document.  The full branch calls the existing adapter
 * unchanged; the partial branch is built only from this scan's facts.
 */
import { load } from 'cheerio/lib/slim';
import { parseDokkanInfoSavedPage } from './phase11-dokkaninfo-adapter.mjs';
import { inspectDokkanInfoDocument, buildDokkanInfoStagePackage } from './phase11-one-tap-adapter.mjs';
import { validateDokkanInfoF1Partial } from './phase11-partial-material.mjs';
import { F1_PARTIAL_FORMAT, F1_RULES, F1_SOURCE, f1Stable, f1Digest, f1SafeText, f1ExactKeys } from './phase11-dokkaninfo-f1-rules.mjs';

export const F1_FORMAT = 'phase11-dokkaninfo-f1-scan-1';
export { F1_PARTIAL_FORMAT, F1_RULES };
const SOURCE = F1_SOURCE;
const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }); };
const safe = f1SafeText;
export const stable = f1Stable;
export const digest = f1Digest;
const exactKeys = f1ExactKeys;
function numberValue(value) { return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.replaceAll(',', '')) ? Number(value.replaceAll(',', '')) : null; }
function sourceInput(html, capturedAt) { return { format: 'html', html, observedUrl: null, resources: new Map(), capturedAt }; }
function fieldText($, nodes, label) {
  const hits = nodes.filter(node => compact($(node).text()).startsWith(label));
  if (hits.length !== 1) return { status: hits.length ? 'duplicate' : 'missing', raw: null };
  const raw = compact($(hits[0]).text()); return { status: 'ok', raw, valueText: raw.slice(label.length).trim() };
}
function superSegments($, column) {
  const result = []; let current = null;
  for (const node of column.contents().toArray()) {
    if (node.type === 'text' && !compact(node.data)) continue;
    if (node.type === 'tag' && $(node).find('img[src*="sp_skill_icon_"]').length) { current = [node]; result.push(current); }
    else if (current) current.push(node);
    else if (/^HPレンジ\s*:/.test(compact($(node).text()))) result.push({ orphan: node });
  }
  return result;
}
function conditionNodes($, segment) {
  const groups = []; let current = null;
  for (const node of segment) {
    if (/^HPレンジ\s*:/.test(compact($(node).text()))) { current = [node]; groups.push(current); }
    else if (current) current.push(node);
  }
  return groups;
}
function evidenceFor(scan, target, field, labelText, valueText, rawText, terminal) {
  const id = `e:${scan.capture.id}:${target.encounterOrdinal}:${target.enemyOrdinal}:${target.attackOrdinal ?? '-'}:${target.conditionOrdinal ?? '-'}:${field}`;
  return { id, captureId: scan.capture.id, snapshotDigest: scan.capture.snapshotDigest, eventId: scan.source.eventId, stageId: scan.source.stageId,
    encounterOrdinal: target.encounterOrdinal, enemyOrdinal: target.enemyOrdinal, attackOrdinal: target.attackOrdinal ?? null, conditionOrdinal: target.conditionOrdinal ?? null,
    fieldPath: field, labelText, valueText, rawDisplayedText: rawText, structuralPath: `encounter[${target.encounterOrdinal}]/enemy[${target.enemyOrdinal}]${target.attackOrdinal == null ? '' : `/attack[${target.attackOrdinal}]`}${target.conditionOrdinal == null ? '' : `/condition[${target.conditionOrdinal}]`}/${field}`,
    selectorRule: F1_RULES.extraction, extractionRule: F1_RULES.extraction, interpretationRule: F1_RULES.interpretation, terminal }; }
function observation(scan, target, field, label, extracted, parsedValue, failures) {
  if (extracted.status !== 'ok') { failures.push({ code: extracted.status === 'duplicate' ? 'DUPLICATE_FIELD' : 'FIELD_NODE_MISSING', path: field }); return null; }
  const raw = extracted.raw, valueText = extracted.valueText;
  let state, value = null, terminal;
  if (valueText === '') { state = 'unavailable'; terminal = 'blank'; }
  else if (parsedValue != null) { state = 'known'; value = parsedValue; terminal = 'interpreted'; }
  else { state = 'unknown'; terminal = 'unrecognized'; scan.uninterpreted.push({ target, field, rawText: raw, impact: 'meaning-not-interpreted' }); }
  const evidence = evidenceFor(scan, target, field, label, valueText, raw, terminal); scan.evidence.push(evidence);
  return { path: field, state, value, evidenceIds: [evidence.id] };
}
function scanRow($, scan, row, encounterOrdinal, enemyOrdinal, parsedEnemy, failures) {
  const columns = row.children();
  if (columns.length < 4) { failures.push({ code: 'ENEMY_STRUCTURE', path: `enemy:${enemyOrdinal}` }); return null; }
  const identity = columns.eq(0), stats = columns.eq(1), supers = columns.eq(2);
  const typeIcon = identity.find('img[src*="cha_type_icon_"]').first().attr('src');
  if (!typeIcon || !parsedEnemy) { failures.push({ code: 'ENEMY_BOUNDARY_UNRESOLVED', path: `enemy:${enemyOrdinal}` }); return null; }
  const target = { encounterOrdinal, enemyOrdinal }; const fields = [];
  for (const [path, label, value] of [['enemy.hp', 'HP:', parsedEnemy.hp], ['enemy.atk', 'ATK:', parsedEnemy.atk], ['enemy.def', 'DEF:', parsedEnemy.def]]) {
    const item = observation(scan, target, path, label, fieldText($, stats.children().toArray(), label), value, failures); if (item) fields.push(item);
  }
  const segments = superSegments($, supers);
  if (segments.some(s => s.orphan) || segments.filter(Array.isArray).length !== (parsedEnemy.superAttacks?.length ?? 0)) failures.push({ code: 'ATTACK_OR_CONDITION_BOUNDARY_UNRESOLVED', path: `enemy:${enemyOrdinal}` });
  const attacks = [];
  for (const [attackOrdinal, segment] of segments.filter(Array.isArray).entries()) {
    const parsed = parsedEnemy.superAttacks?.[attackOrdinal]; if (!parsed) { failures.push({ code: 'ATTACK_BOUNDARY_UNRESOLVED', path: `attack:${attackOrdinal}` }); continue; }
    const conditions = conditionNodes($, segment);
    if (conditions.length !== (parsed.usageRules?.length ?? 0)) { failures.push({ code: 'CONDITION_PARENT_UNRESOLVED', path: `attack:${attackOrdinal}` }); continue; }
    const attack = { ordinal: attackOrdinal, name: compact($(segment[0]).find('b').first().text()), conditions: [] };
    for (const [conditionOrdinal, nodes] of conditions.entries()) {
      const rule = parsed.usageRules[conditionOrdinal]; const hit = { ...target, attackOrdinal, conditionOrdinal }; const conditionFields = [];
      const range = compact($(nodes[0]).text()).match(/^HPレンジ\s*:\s*([\d.]+)%\s*~\s*([\d.]+)%/);
      if (!range) { failures.push({ code: 'CONDITION_RANGE_UNRESOLVED', path: `attack:${attackOrdinal}/condition:${conditionOrdinal}` }); continue; }
      for (const [path, label, value] of [
        ['condition.hpMinPercent', 'HPレンジ:', Number(range[1])], ['condition.hpMaxPercent', 'HPレンジ:', Number(range[2])],
        ['attack.probabilityPercent', 'パーセンテージ:', rule.probabilityPercent], ['attack.maxPerTurn', '最大ATK/ターン:', rule.maxPerTurn], ['attack.cooldownTurns', '再使用までの時間:', rule.cooldownTurns]
      ]) { const item = observation(scan, hit, path, label, fieldText($, nodes, label), value, failures); if (item) conditionFields.push(item); }
      attack.conditions.push({ ordinal: conditionOrdinal, fields: conditionFields });
    }
    const description = compact($(segment[0]).find('.row.align-items-center .col-sm').first().text());
    if (description) { const e = evidenceFor(scan, { ...target, attackOrdinal }, 'attack.effectText', 'effect', description, description, 'unrecognized'); scan.evidence.push(e); scan.uninterpreted.push({ target: { ...target, attackOrdinal }, field: 'attack.effectText', rawText: description, impact: 'meaning-not-interpreted' }); attack.effect = { path: 'attack.effectText', state: 'unknown', value: null, evidenceIds: [e.id] }; }
    attacks.push(attack);
  }
  return { ordinal: enemyOrdinal, name: parsedEnemy.name, fields, attacks };
}

export async function scanDokkanInfoF1Snapshot({ html, captureId = 'f1-capture-1', revision = 1, capturedAt = '2026-09-12T00:00:00.000Z', expectedEventId = null, expectedStageId = null }) {
  if (typeof html !== 'string' || !html.trim()) fail('SNAPSHOT_EMPTY');
  const snapshotDigest = await digest(html); const page = parseDokkanInfoSavedPage(sourceInput(html, capturedAt), { capturedAt });
  if (page.pageKind !== 'stage') fail('STAGE_REQUIRED');
  if ((expectedEventId && page.eventId !== expectedEventId) || (expectedStageId && page.stageId !== expectedStageId)) fail('STAGE_OWNERSHIP');
  const scan = { kind: 'source-scan', formatVersion: F1_FORMAT, source: { ...SOURCE, eventId: page.eventId, stageId: page.stageId }, capture: { id: captureId, revision, observedAt: capturedAt, snapshotDigest }, rules: { ...F1_RULES }, encounters: [], evidence: [], coverage: null, uninterpreted: [], failures: [] };
  const $ = load(html); const boxes = $('.row.margin-5.border.border-1.border-main-box-darker.bg-main'); const allRows = [];
  boxes.each((encounterOrdinal, box) => {
    const rows = []; $(box).find('img[src*="cha_type_icon_"]').each((_, image) => { const row = $(image).closest('.row.d-flex.align-items-center'); if (row.length && !rows.some(v => v.get(0) === row.get(0))) rows.push(row); });
    const parsedGroup = page.parsedStage.groups[encounterOrdinal]; const enemies = rows.map((row, enemyOrdinal) => scanRow($, scan, row, encounterOrdinal, enemyOrdinal, parsedGroup?.enemies?.[enemyOrdinal], scan.failures)).filter(Boolean);
    if (!parsedGroup || rows.length !== (parsedGroup.enemies?.length ?? 0)) scan.failures.push({ code: 'ENEMY_ENUMERATION_UNRESOLVED', path: `encounter:${encounterOrdinal}` });
    allRows.push(...rows); scan.encounters.push({ ordinal: encounterOrdinal, enemies });
  });
  if (!boxes.length || page.parsedStage.orphanTypeIcons || !page.parsedStage.groups.length) scan.failures.push({ code: 'STRUCTURE_UNEXPECTED', path: 'stage' });
  const counts = { encounters: scan.encounters.length, enemies: scan.encounters.reduce((n, e) => n + e.enemies.length, 0), attacks: scan.encounters.flatMap(e => e.enemies).reduce((n, e) => n + e.attacks.length, 0), conditions: scan.encounters.flatMap(e => e.enemies).flatMap(e => e.attacks).reduce((n, a) => n + a.conditions.length, 0) };
  scan.coverage = { complete: scan.failures.length === 0, enumerated: counts, observedTerminalStates: scan.evidence.map(e => e.terminal), deliberatelyExcluded: ['AI', 'AOE', 'skills: F1 fixture scan scope only'], uninterpretedScope: scan.uninterpreted.map(v => v.field), structuralFailures: scan.failures.map(v => v.code) };
  return scan;
}
function flattenFields(scan) { const out=[]; for (const encounter of scan.encounters) for (const enemy of encounter.enemies) { for (const field of enemy.fields) out.push({ encounterOrdinal:encounter.ordinal,enemyOrdinal:enemy.ordinal,attackOrdinal:null,conditionOrdinal:null,...field }); for (const attack of enemy.attacks) { if (attack.effect) out.push({encounterOrdinal:encounter.ordinal,enemyOrdinal:enemy.ordinal,attackOrdinal:attack.ordinal,conditionOrdinal:null,...attack.effect}); for (const condition of attack.conditions) for (const field of condition.fields) out.push({encounterOrdinal:encounter.ordinal,enemyOrdinal:enemy.ordinal,attackOrdinal:attack.ordinal,conditionOrdinal:condition.ordinal,...field}); } } return out; }
export async function sealF1Partial(body) { const { contentDigest, ...rest } = body; return { ...rest, contentDigest: await digest(rest) }; }
export async function partialFromF1Scan(scan) {
  if (!scan.coverage.complete) fail('COVERAGE_INCOMPLETE');
  const fields = flattenFields(scan); if (!fields.some(field => field.state === 'unknown' || field.state === 'unavailable')) fail('PARTIAL_NOT_NEEDED');
  return sealF1Partial({ kind: 'partial', formatVersion: F1_PARTIAL_FORMAT, source: { ...scan.source }, capture: { ...scan.capture }, rules: { ...scan.rules }, relationships: scan.encounters.map(e => ({ ordinal:e.ordinal, enemies:e.enemies.map(n => ({ordinal:n.ordinal, attacks:n.attacks.map(a => ({ordinal:a.ordinal, conditions:a.conditions.map(c => c.ordinal)}))})) })), fields, evidence: scan.evidence, coverage: scan.coverage, uninterpreted: scan.uninterpreted, fullCheck: { status: 'not-complete-from-observed-facts' }, contentDigest: null });
}
export const validateF1Partial = validateDokkanInfoF1Partial;
async function unchangedFull({ eventHtml, stageHtml, capturedAt, expectedEventId = '990001', expectedStageId = '99000101' }) {
  const eventSource=`https://jpnja.dokkaninfo.com/events/challenge/${expectedEventId}`, stageSource=`${eventSource}/${expectedStageId}`;
  const event=inspectDokkanInfoDocument({html:eventHtml,currentUrl:'http://127.0.0.1/f1-event.html',sourceUrl:eventSource,fixtureMode:true,capturedAt}); const stage=inspectDokkanInfoDocument({html:stageHtml,currentUrl:'http://127.0.0.1/f1-stage.html',sourceUrl:stageSource,fixtureMode:true,capturedAt});
  if (event.state !== 'ready' || stage.state !== 'ready') return null; return buildDokkanInfoStagePackage(event.material,stage.material);
}
/** Test-only seam: invokes the pre-F1 full adapter/package route verbatim. */
export async function fullViaExistingF1Path(input) { return unchangedFull(input); }
export async function classifyDokkanInfoF1(input) {
  let scan;
  try { scan=await scanDokkanInfoF1Snapshot({ ...input, html: input.stageHtml }); }
  catch (error) { return { classification:'unusable', scan:null, code:error.code ?? 'SCAN_REJECTED' }; }
  if (!scan.coverage.complete) return { classification:'unusable', scan, code:scan.failures[0]?.code ?? 'COVERAGE_INCOMPLETE' };
  const full=await unchangedFull(input); if (full) return { classification:'full', scan, package:full };
  try { const material=await partialFromF1Scan(scan); await validateDokkanInfoF1Partial(material); return { classification:'partial', scan, material }; } catch (error) { return { classification:'unusable', scan, code:error.code ?? 'PARTIAL_REJECTED' }; }
}
