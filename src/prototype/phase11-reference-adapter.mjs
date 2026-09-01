/** Self-authored reference HTML adapter. NOT a France/Info parser or permission grant. */
import { parseDocument } from 'htmlparser2';
import { requireIntake } from './phase11-file.mjs';
export const REFERENCE_SOURCE = 'phase11-self-authored-reference';
export const FORMAT = 'phase11-reference-html-v1';
export const KINDS = ['encounter', 'enemy', 'super', 'area', 'ai'];
const FIELDS = {
  encounter: ['layout'],
  enemy: ['name', 'type', 'alignment', 'hp', 'atk', 'def', 'reduction', 'max-attacks', 'critical', 'critical-multiplier', 'critical-ignore'],
  super: ['name', 'atk', 'target', 'hp-min', 'hp-max', 'probability', 'max-per-turn', 'cooldown'],
  area: ['enemy', 'kind', 'first', 'additional', 'max-per-turn', 'target'],
  ai: ['enemy', 'kind', 'slot', 'hp-min', 'hp-max', 'probability', 'max-uses', 'cooldown', 'text']
};
const NUMBERS = new Set(['hp', 'atk', 'def', 'reduction', 'max-attacks', 'critical-multiplier', 'critical-ignore', 'hp-min', 'hp-max', 'probability', 'max-per-turn', 'cooldown', 'first', 'additional', 'slot', 'max-uses']);
const OMIT = new Set(['script', 'style', 'iframe', 'object', 'form', 'input', 'textarea']);
function walk(node, predicate, stopRecords = false) {
  const found = []; const stack = [...(node.children ?? [])];
  while (stack.length) {
    const next = stack.shift();
    if (OMIT.has(next.name)) continue;
    if (predicate(next)) found.push(next);
    if (!(stopRecords && next.attribs?.['data-kind'])) stack.unshift(...(next.children ?? []));
  }
  return found;
}
function textOf(node) {
  if (node.type === 'text') return node.data;
  if (OMIT.has(node.name)) return '';
  return (node.children ?? []).map(textOf).join('').trim();
}
function token(text, label) {
  requireIntake(typeof text === 'string' && /^[a-z0-9][a-z0-9:_-]{0,100}$/i.test(text), 'REFERENCE_ID', `${label}のIDを確認できません。`);
  return text;
}
function number(text, label) {
  requireIntake(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text), 'REFERENCE_NUMBER', `${label}の数値が不正です。`);
  const value = Number(text.replaceAll(',', ''));
  requireIntake(Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER, 'REFERENCE_NUMBER', `${label}の数値が大きすぎます。`);
  return value;
}
export function parseReferencePage(decoded) {
  const document = parseDocument(decoded.html, { decodeEntities: true });
  const stack = [[document, 0]]; let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop();
    requireIntake(++count <= 30000 && depth <= 64, 'HTML_COMPLEXITY', '本文の構造が試作の上限を超えています。');
    for (const child of node.children ?? []) stack.push([child, depth + 1]);
  }
  const roots = walk(document, (node) => node.name === 'main' && node.attribs?.['data-manual-source']);
  requireIntake(roots.length === 1 && roots[0].attribs['data-manual-source'] === FORMAT, 'SOURCE_UNSUPPORTED', 'この保存ページにはまだ対応していません。試作は架空の確認用ページ専用です。France等の実データは保存・適用しません。');
  const root = roots[0]; const attr = root.attribs;
  requireIntake(attr['data-absent-features'] === 'passive-effects super-effects skills', 'SOURCE_FEATURES', '効果・スキルの有無を確認できません。試作の対応範囲外です。');
  const sourceUrl = attr['data-source-url'];
  requireIntake(/^https:\/\/manual-fixture\.invalid\/stages\/[a-z0-9:_/-]+$/i.test(sourceUrl ?? ''), 'SOURCE_IDENTITY', '確認用sourceの識別情報が一致しません。');
  const stageId = token(attr['data-stage-id'], 'ステージ');
  requireIntake(sourceUrl === `https://manual-fixture.invalid/stages/${stageId}/${attr['data-part']}`, 'SOURCE_IDENTITY', '出典とステージ・ページIDが一致しません。');
  const revision = attr['data-revision'];
  requireIntake(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(revision ?? '') && Number.isFinite(Date.parse(revision)), 'SOURCE_REVISION', 'データの日付を確認できません。');
  const requiredParts = (attr['data-required-parts'] ?? '').split(' ').map((part) => token(part, '必要ページ'));
  const part = token(attr['data-part'], 'ページ');
  requireIntake(requiredParts.includes(part) && new Set(requiredParts).size === requiredParts.length && requiredParts.length <= 10, 'SOURCE_PARTS', '必要ページの指定が不正です。');
  const expectedCounts = Object.fromEntries(KINDS.map((kind) => [kind, number(attr[`data-count-${kind}`] ?? '', kind)]));
  requireIntake(Object.values(expectedCounts).every((value) => Number.isInteger(value) && value <= 1000), 'SOURCE_COUNTS', '確認用ページの件数が不正です。');
  const records = walk(root, (node) => !!node.attribs?.['data-kind']).map((node) => {
    const kind = node.attribs['data-kind'];
    requireIntake(KINDS.includes(kind), 'SOURCE_LAYOUT_CHANGED', '未対応の敵情報があります。取込を停止しました。');
    const fields = {};
    for (const field of walk(node, (child) => !!child.attribs?.['data-field'], true)) {
      const key = field.attribs['data-field'];
      requireIntake(FIELDS[kind].includes(key) && !(key in fields), 'SOURCE_FIELDS', '敵情報の項目が未対応、または重複しています。');
      let value = textOf(field);
      if (field.name === 'img' && key === 'type') {
        const src = decoded.resources.get(field.attribs.src) ?? field.attribs.src ?? '';
        value = /type-(agl|teq|int|str|phy)\.svg(?:$|[?#])/.exec(src)?.[1] ?? '?';
      }
      requireIntake(value.length <= 2000, 'SOURCE_FIELD_SIZE', '敵情報の項目が長すぎます。');
      if (value === '?' || value === '') fields[key] = null;
      else if (NUMBERS.has(key)) fields[key] = number(value, key);
      else if (key === 'critical') {
        requireIntake(['true', 'false'].includes(value), 'SOURCE_BOOLEAN', '会心の有無が不正です。');
        fields[key] = value === 'true';
      } else fields[key] = value;
    }
    return { kind, id: token(node.attribs['data-id'], kind), parent: token(node.attribs['data-parent'], '所属'), order: number(node.attribs['data-order'] ?? '', '順序'), fields };
  });
  const recordKeys = records.map((record) => `${record.kind}:${record.id}`);
  requireIntake(new Set(recordKeys).size === recordKeys.length, 'DUPLICATE_SOURCE_ID', '同じページ内で敵情報のIDが重複しています。');
  const links = walk(root, (node) => node.name === 'a' && node.attribs?.['data-required-part']).map((node) => {
    const targetPart = token(node.attribs['data-required-part'], '補足ページ');
    const href = node.attribs.href;
    requireIntake(requiredParts.includes(targetPart) && href === `https://manual-fixture.invalid/stages/${stageId}/${targetPart}`, 'SOURCE_LINK', '補足ページのリンクを安全に確認できません。');
    return { part: targetPart, href, label: textOf(node).slice(0, 160) };
  });
  return {
    format: FORMAT, sourceKey: REFERENCE_SOURCE, sourceUrl, revision,
    eventId: token(attr['data-event-id'], 'イベント'), eventName: (attr['data-event-name'] ?? '').slice(0, 160),
    stageId, stageName: (attr['data-stage-name'] ?? '').slice(0, 160), part, requiredParts, expectedCounts, records, links
  };
}

export function mergeReferencePages(pages) {
  const first = pages[0];
  requireIntake(first && pages.every((page) => ['eventId', 'eventName', 'stageId', 'stageName', 'revision'].every((key) => page[key] === first[key])
    && JSON.stringify(page.expectedCounts) === JSON.stringify(first.expectedCounts) && JSON.stringify(page.requiredParts) === JSON.stringify(first.requiredParts)), 'SOURCE_CONFLICT', '同じステージのページ間で日付・所属・件数が一致しません。');
  const parts = new Set(); const records = new Map();
  for (const page of pages) {
    requireIntake(!parts.has(page.part), 'DUPLICATE_PAGE', '同じページが複数選択されています。');
    parts.add(page.part);
    for (const record of page.records) {
      const key = `${record.kind}:${record.id}`; const previous = records.get(key);
      if (!previous) records.set(key, structuredClone(record));
      else {
        requireIntake(previous.parent === record.parent && previous.order === record.order, 'SOURCE_CONFLICT', '補足ページで敵の所属が変わっています。');
        for (const [field, value] of Object.entries(record.fields)) {
          requireIntake(!(field in previous.fields) || previous.fields[field] === null || value === null || previous.fields[field] === value, 'SOURCE_CONFLICT', 'ページ間で敵の値が食い違っています。');
          if (value !== null) previous.fields[field] = value;
        }
      }
    }
  }
  const missing = first.requiredParts.filter((part) => !parts.has(part)).map((part) => `補足ページ「${part}」が不足しています。`);
  const values = [...records.values()];
  for (const kind of KINDS) if (values.filter((record) => record.kind === kind).length !== first.expectedCounts[kind]) missing.push(`${kind}の件数がページの宣言と一致しません。`);
  for (const record of values) for (const key of FIELDS[record.kind]) if (record.fields[key] === null || record.fields[key] === undefined) missing.push(`${record.kind} ${record.id}: ${key}が不足しています。`);
  requireIntake(values.some((record) => record.kind === 'enemy') && values.some((record) => record.kind === 'encounter'), 'EMPTY_STAGE', '敵または出現区分がありません。');
  const by = (kind, parent) => values.filter((record) => record.kind === kind && (parent === undefined || record.parent === parent));
  for (const record of values) {
    const parentKind = record.kind === 'super' ? 'enemy' : record.kind === 'encounter' ? null : 'encounter';
    requireIntake(parentKind ? by(parentKind).some((parent) => parent.id === record.parent) : record.parent === first.stageId, 'SOURCE_PARENT', '敵情報の所属を確認できません。');
    requireIntake(Number.isInteger(record.order) && record.order >= 1 && record.order <= 1000, 'SOURCE_ORDER', '敵情報の順序が不正です。');
  }
  return { ...first, records: values, missing, links: pages.flatMap((page) => page.links), by };
}

export function referenceToCanonical(merged, sourceMaterials) {
  const snapshotIds = sourceMaterials.map((material) => `phase11:snapshot:${material.digest.slice(7)}`);
  const evidenceIds = snapshotIds.map((id) => `${id}:evidence`);
  const known = (value) => ({ state: value === null || value === undefined ? 'unknown' : 'known', value: value ?? null, evidenceIds, confidence: 'high' });
  const unknown = () => ({ state: 'unknown', value: null, evidenceIds: [], confidence: 'unconfirmed' });
  const notApplicable = () => ({ state: 'not-applicable', value: null, evidenceIds: [], confidence: 'high' });
  const id = (kind, key) => `phase11-fixture:${encodeURIComponent(merged.eventId)}:${encodeURIComponent(merged.stageId)}:${kind}:${encodeURIComponent(key)}`;
  const ref = (kind, key) => [{ sourceSnapshotId: snapshotIds[0], entityKind: kind, sourceId: key, compositeKey: id(kind, key), sourceUrl: merged.sourceUrl }];
  const critical = (fields) => ({ enabled: known(fields.critical), attackMultiplier: known(fields['critical-multiplier']), defenseIgnorePercent: known(fields['critical-ignore']), rateRules: [] });
  return {
    schemaVersion: '2.0.0', datasetId: id('dataset', 'private-test'), generatedAt: merged.revision, region: 'synthetic',
    sourceSnapshots: sourceMaterials.map((material, index) => ({
      id: snapshotIds[index], sourceKey: REFERENCE_SOURCE, provider: 'Self-authored Phase 11 fixture, not a live site', region: 'synthetic',
      acquiredAt: merged.revision, publishedAt: null, revisedAt: merged.revision, importMethod: 'local-sanitized-reference-html', policyStatus: 'synthetic-test-only', parserVersion: FORMAT,
      sourceRootUrl: material.page.sourceUrl, contentDigest: material.digest, notes: 'Digest covers sanitized local input, not raw HTML or a permission grant. Fixture date, not owner capture time.'
    })),
    evidence: snapshotIds.map((snapshot, index) => ({ id: evidenceIds[index], sourceSnapshotId: snapshot, sourceUrl: sourceMaterials[index].page.sourceUrl, sourceFile: null, observedAt: merged.revision, confidence: 'high', notes: 'Self-authored reference fields; no real-source completeness claim.' })),
    events: [{ id: `phase11-fixture:event:${encodeURIComponent(merged.eventId)}`, sourceRefs: ref('event', merged.eventId), name: known(merged.eventName), category: known('手動取込の架空試験'), stages: [{
      id: id('stage', merged.stageId), sourceRefs: ref('stage', merged.stageId), name: known(merged.stageName),
      encounters: merged.by('encounter').map((encounter) => ({
        id: id('encounter', encounter.id), sourceRefs: ref('encounter', encounter.id), order: encounter.order, phaseId: known(encounter.id), layoutKind: known(encounter.fields.layout),
        enemies: merged.by('enemy', encounter.id).map((enemy) => ({
          id: id('enemy', enemy.id), sourceRefs: ref('enemy', enemy.id), orderInEncounter: enemy.order, role: known('combat'), name: known(enemy.fields.name), type: known(enemy.fields.type), alignment: known(enemy.fields.alignment),
          externalIds: { sourceEnemyId: known(enemy.id), cardId: unknown(), thumbId: unknown() }, isEzaCardLink: notApplicable(),
          stats: { hp: known(enemy.fields.hp), baseAttack: known(enemy.fields.atk), defense: known(enemy.fields.def), damageReductionPercent: known(enemy.fields.reduction), maxAttacksPerTurn: known(enemy.fields['max-attacks']) },
          passiveEffects: [], critical: critical(enemy.fields), skills: [],
          superAttacks: merged.by('super', enemy.id).map((attack) => ({
            id: id('super', attack.id), sourceRefs: ref('super-attack', attack.id), name: known(attack.fields.name), description: unknown(), displayedDamage: known(attack.fields.atk), derivedMultiplier: unknown(),
            probabilityPercent: known(attack.fields.probability), maxPerTurn: known(attack.fields['max-per-turn']), cooldownTurns: known(attack.fields.cooldown), slot: known(attack.order), targetMode: known(attack.fields.target), attackType: unknown(), effects: [], criticalOverride: notApplicable(),
            usageRules: [{ order: 1, hpMinPercent: known(attack.fields['hp-min']), hpMaxPercent: known(attack.fields['hp-max']), probabilityPercent: known(attack.fields.probability), maxPerTurn: known(attack.fields['max-per-turn']), cooldownTurns: known(attack.fields.cooldown), sourceText: known('確認用ページのHP条件') }]
          }))
        })),
        areaAttacks: merged.by('area', encounter.id).map((area) => ({
          id: id('area', area.id), sourceEnemyId: known(id('enemy', area.fields.enemy)), attackKind: known(area.fields.kind), maxPerTurn: known(area.fields['max-per-turn']), firstTargetDamage: known(area.fields.first), additionalTargetDamage: known(area.fields.additional), firstTargetMultiplier: unknown(), additionalTargetMultiplier: unknown(), targetMode: known(area.fields.target), sourceText: known('確認用ページの対象別ATK'), evidenceIds, confidence: 'high'
        })),
        aiActions: merged.by('ai', encounter.id).map((action) => ({
          id: id('ai', action.id), sequenceIndex: action.order, sourceOrder: action.order, kind: action.fields.kind, enemyId: known(id('enemy', action.fields.enemy)), slot: known(action.fields.slot), probabilityPercent: known(action.fields.probability), hpMinPercent: known(action.fields['hp-min']), hpMaxPercent: known(action.fields['hp-max']), maxUses: known(action.fields['max-uses']), cooldownTurns: known(action.fields.cooldown), sourceText: known(action.fields.text), evidenceIds, confidence: 'high'
        }))
      }))
    }] }], manualCorrections: []
  };
}

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
/** Reference-format serializer only: no real-source HTML reconstruction. */
export function renderReferenceHtml(page) {
  const attr = (name, value) => ` data-${name}="${escapeHtml(value)}"`;
  const header = { 'manual-source': FORMAT, 'absent-features': 'passive-effects super-effects skills', 'source-url': page.sourceUrl, revision: page.revision, 'event-id': page.eventId, 'event-name': page.eventName, 'stage-id': page.stageId, 'stage-name': page.stageName, part: page.part, 'required-parts': page.requiredParts.join(' ') };
  const main = Object.entries(header).map(([key, value]) => attr(key, value)).join('') + KINDS.map((kind) => attr(`count-${kind}`, page.expectedCounts[kind])).join('');
  const records = page.records.map((record) => `<section${attr('kind', record.kind)}${attr('id', record.id)}${attr('parent', record.parent)}${attr('order', record.order)}><h2>${escapeHtml(record.kind)}: ${escapeHtml(record.id)}</h2><dl>${Object.entries(record.fields).map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd data-field="${escapeHtml(key)}">${escapeHtml(value ?? '?')}</dd>`).join('')}</dl></section>`).join('\n');
  const links = page.links.map((link) => `<a data-required-part="${escapeHtml(link.part)}" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('\n');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 11 架空の保存確認ページ</title><style>body{font:16px sans-serif;margin:16px;max-width:760px}section{border:1px solid #ccd;padding:12px;margin:10px 0}dl{display:grid;grid-template-columns:1fr 1fr;gap:4px}dd{margin:0;overflow-wrap:anywhere}h2{font-size:17px}</style></head><body><h1>架空の保存確認ページ</h1><p>実在する敵やサイトのデータではありません。表示済みページの保存だけを確認します。</p><main${main}><h2>${escapeHtml(page.stageName)}</h2>${records}${links}</main></body></html>`;
}
export function validateReferenceMaterial(page) {
  const normalized = parseReferencePage({ html: renderReferenceHtml(page), resources: new Map() });
  const stable = (value) => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  requireIntake(JSON.stringify(stable(normalized)) === JSON.stringify(stable(page)), 'MATERIAL_FIELDS', '保存材料に未知の項目または不正な値があります。');
  return normalized;
}
