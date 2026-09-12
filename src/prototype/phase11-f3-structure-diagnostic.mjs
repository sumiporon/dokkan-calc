/** Inert snapshot inspection only. No intake, classification, calculation or persistence. */
import { load } from 'cheerio/lib/slim';

export const STRUCTURE_RULE = 'phase11-f3-structure-candidates-1';
export const LIMITS = Object.freeze({ snapshot: 4_000_000, nodes: 30000, records: 700, text: 160, output: 250000 });
export const SELECTORS = Object.freeze({
  encounter: '.row.margin-5.border.border-1.border-main-box-darker.bg-main',
  enemy: '.row.d-flex.align-items-center', type: 'img[src*="cha_type_icon_"]',
  superIcon: 'img[src*="sp_skill_icon_"]', name: '.font-size-1_2 b',
  ai: '.row.border.border-1.border-main-box-darker.margin-3'
});
const fail = code => { throw Object.assign(new Error('構造を安全に確認できないため停止しました。'), { code }); };
const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const short = value => compact(value).replace(/[<>\u0000-\u001f]/g, '').slice(0, LIMITS.text);
const unique = nodes => [...new Set(nodes)];
export async function snapshotDigest(text) {
  return 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
}

/** Only the explicit run() call reads the page. Returned data never includes the snapshot. */
export function createStructureDiagnostic({ readUrl, readOuterHTML, expectedUrl, expectedEventId, expectedStageId }) {
  let started = false;
  return { async run() {
    if (started) fail('DIAGNOSTIC_ALREADY_RUN');
    started = true;
    const before = readUrl();
    const url = new URL(before);
    const match = url.pathname.match(/\/events\/challenge\/(\d+)\/(\d+)(?:\.html)?\/?$/);
    if (before !== expectedUrl || !match || match[1] !== expectedEventId || match[2] !== expectedStageId) fail('DIAGNOSTIC_URL');
    let snapshot = readOuterHTML();
    try {
      if (readUrl() !== before) fail('DIAGNOSTIC_URL_CHANGED');
      return await diagnoseStructureSnapshot({ snapshot, expectedEventId, expectedStageId });
    } finally { snapshot = null; }
  } };
}

export async function diagnoseStructureSnapshot({ snapshot, expectedEventId, expectedStageId }) {
  if (typeof snapshot !== 'string' || !snapshot.trim() || snapshot.length > LIMITS.snapshot) fail('DIAGNOSTIC_SNAPSHOT_LIMIT');
  const digest = await snapshotDigest(snapshot);
  const $ = load(snapshot);
  const all = $('*').toArray();
  if (all.length > LIMITS.nodes) fail('DIAGNOSTIC_NODE_LIMIT');
  // Paths use tag/sibling positions only: never arbitrary IDs, attributes or URLs.
  const paths = new Map();
  function pathFor(node) {
    if (!node || node.type === 'root') return '';
    if (paths.has(node)) return paths.get(node);
    const parent = pathFor(node.parent), siblings = (node.parent?.children ?? []).filter(n => n.name === node.name);
    const path = `${parent ? parent + '>' : ''}${node.name}:nth-of-type(${siblings.indexOf(node) + 1})`;
    if (path.length > 1000) fail('DIAGNOSTIC_PATH_LIMIT');
    paths.set(node, path); return path;
  }
  for (const node of all) pathFor(node);
  const exclusions = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'form', 'input', 'textarea', 'select', '[hidden]', '[aria-hidden="true"]', '#f3-structure-ui'];
  $(exclusions.join(',')).remove();
  const observations = [], issues = [];
  const addIssue = (code, parent = {}) => { if (issues.length >= LIMITS.records) fail('DIAGNOSTIC_RECORD_LIMIT'); issues.push({ code, parent }); };
  const text = node => compact($(node).text());
  function observe(field, nodes, parent, { structural = false, value = text, forceAmbiguous = false, selector = null } = {}) {
    nodes = unique(nodes);
    if (observations.length >= LIMITS.records || nodes.length > 40) fail('DIAGNOSTIC_RECORD_LIMIT');
    const values = nodes.map(value);
    const state = forceAmbiguous || nodes.length > 1 ? 'ambiguous' : !nodes.length ? 'missing' : structural ? 'detected' : values[0] === '' ? 'blank' : 'non-empty-unparsed';
    const item = { field, parent: { ...parent }, state, count: nodes.length, selector,
      candidates: nodes.map((node, i) => ({ path: pathFor(node), text: short(values[i]), truncated: compact(values[i]).length > LIMITS.text })) };
    observations.push(item);
    if (state === 'ambiguous' || state === 'missing') addIssue(`${state}:${field}`, parent);
    return item;
  }
  function field(label, nodes, parent, name) {
    const hits = nodes.filter(node => text(node).startsWith(label));
    return observe(name, hits, parent, { value: node => text(node).slice(label.length).trim(), selector: `direct-child text starts with ${label}` });
  }
  const identities = $('meta[property="og:url"],link[rel="canonical"]').toArray();
  const identity = observe('event-stage-identity', identities, {}, { structural: true, selector: 'meta[property="og:url"],link[rel="canonical"]', value: node => {
    try {
      const url = new URL($(node).attr(node.name === 'meta' ? 'content' : 'href'));
      const match = url.pathname.match(/^\/events\/challenge\/(\d+)\/(\d+)\/?$/);
      return match && !url.search && !url.hash && !url.username && !url.password ? `event ${match[1]} / stage ${match[2]}` : 'unrecognized identity';
    } catch { return 'unrecognized identity'; }
  } });
  if (identity.state !== 'detected' || identity.candidates[0]?.text !== `event ${expectedEventId} / stage ${expectedStageId}`) addIssue('identity-unconfirmed');

  const boxes = $(SELECTORS.encounter).toArray();
  const rows = $(SELECTORS.enemy).toArray().filter(row => $(row).find(SELECTORS.type).length);
  const icons = $(SELECTORS.type).toArray();
  if (!boxes.length) observe('encounter-root', [], {}, { structural: true, selector: SELECTORS.encounter });
  const rootAmbiguous = new Set();
  for (const row of rows) {
    const parents = $(row).parents(SELECTORS.encounter).toArray();
    if (parents.length !== 1 || $(row).parents(SELECTORS.enemy).length || $(row).find(SELECTORS.enemy).filter((_, n) => $(n).find(SELECTORS.type).length).length) rootAmbiguous.add(row);
    if (!parents.length) observe('unowned-enemy-root', [row], { candidate: rows.indexOf(row) }, { structural: true, forceAmbiguous: true, selector: SELECTORS.enemy });
  }
  for (const icon of icons) if ($(icon).parents(SELECTORS.enemy).length !== 1) addIssue('enemy-selector-conflict');
  let enemies = 0, supers = 0, conditions = 0;
  for (const [encounter, box] of boxes.entries()) {
    const scope = { encounter };
    const nested = $(box).parents(SELECTORS.encounter).length > 0 || $(box).find(SELECTORS.encounter).length > 0;
    observe('encounter-root', [box], scope, { structural: true, forceAmbiguous: nested, selector: SELECTORS.encounter });
    const owned = rows.filter(row => $(row).closest(SELECTORS.encounter).get(0) === box);
    if (!owned.length) observe('enemy-root', [], scope, { structural: true, selector: SELECTORS.enemy });
    for (const [enemy, row] of owned.entries()) {
      enemies++;
      const parent = { encounter, enemy };
      const columns = $(row).children().toArray();
      const ambiguous = nested || rootAmbiguous.has(row) || columns.length !== 4 || $(columns[0]).find(SELECTORS.type).length !== 1;
      observe('enemy-root', [row], parent, { structural: true, forceAmbiguous: ambiguous, selector: SELECTORS.enemy });
      if (ambiguous) { addIssue('enemy-relationship-unresolved', parent); continue; }
      observe('enemy-name', $(columns[0]).find(SELECTORS.name).toArray(), parent, { selector: SELECTORS.name });
      observe('type-class-candidate', $(columns[0]).find(SELECTORS.type).toArray(), parent, { value: n => $(n).attr('src')?.match(/cha_type_icon_[a-zA-Z0-9_]+\.png/)?.[0] ?? 'unrecognized icon', selector: SELECTORS.type });
      const stats = $(columns[1]).children().toArray();
      for (const [label, name] of [['HP:', 'hp'], ['ATK:', 'atk'], ['DEF:', 'def'], ['最大ATK/ターン:', 'enemy-wide-count']]) field(label, stats, parent, name);
      observe('skill-region', [columns[3]], parent, { selector: 'enemy-root > child[4]' });
      const children = $(columns[2]).children().toArray();
      const headerNodes = children.filter(n => $(n).is('.super-header') || $(n).find(SELECTORS.superIcon).length);
      if (!headerNodes.length) observe('super-root', [], parent, { structural: true });
      const first = headerNodes[0];
      const orphan = children.slice(0, first ? children.indexOf(first) : children.length).filter(n => /^HPレンジ\s*:/.test(text(n)));
      if (orphan.length) observe('orphan-condition', orphan, parent, { forceAmbiguous: true });
      for (const [attack, header] of headerNodes.entries()) {
        supers++;
        const ap = { ...parent, attack };
        const byClass = $(header).is('.super-header'), iconCount = $(header).find(SELECTORS.superIcon).length;
        const ambiguousHeader = !byClass || iconCount !== 1;
        observe('super-root', [header], ap, { structural: true, forceAmbiguous: ambiguousHeader, selector: '.super-header / child containing Super icon' });
        if (ambiguousHeader) { addIssue('super-selector-conflict', ap); continue; }
        observe('super-name', $(header).find('b').toArray(), ap);
        const segment = children.slice(children.indexOf(header) + 1, headerNodes[attack + 1] ? children.indexOf(headerNodes[attack + 1]) : children.length);
        const bands = segment.filter(n => /^HPレンジ\s*:/.test(text(n)));
        const base = segment.slice(0, bands[0] ? segment.indexOf(bands[0]) : segment.length);
        field('ダメージ:', base, ap, 'super-atk');
        for (const [label, name] of [['パーセンテージ:', 'probability'], ['最大ATK/ターン:', 'super-specific-count'], ['再使用までの時間:', 'reuse']]) field(label, base, ap, name);
        if (!bands.length) observe('hp-condition', [], ap);
        for (const [condition, band] of bands.entries()) {
          conditions++;
          const cp = { ...ap, condition };
          observe('hp-condition', [band], cp, { value: n => text(n).replace(/^HPレンジ\s*:/, '').trim() });
          const bandNodes = segment.slice(segment.indexOf(band) + 1, bands[condition + 1] ? segment.indexOf(bands[condition + 1]) : segment.length);
          for (const [label, name] of [['パーセンテージ:', 'probability'], ['最大ATK/ターン:', 'super-specific-count'], ['再使用までの時間:', 'reuse']]) field(label, bandNodes, cp, name);
        }
      }
      const aoe = children.filter(n => /^(?:エリア\/ターン|エリアダメージ|AOE)\s*[:：1-9]/.test(text(n)));
      if (!aoe.length) observe('aoe-region', [], parent);
      aoe.forEach((n, region) => observe('aoe-region', [n], { ...parent, region }));
    }
    const ai = $(box).find(SELECTORS.ai).toArray().filter(n => $(n).closest(SELECTORS.encounter).get(0) === box);
    if (!ai.length) observe('ai-region', [], scope, { selector: SELECTORS.ai });
    ai.forEach((n, region) => observe('ai-region', [n], { ...scope, region }, { selector: SELECTORS.ai }));
  }
  const result = { kind: 'structure-diagnostic', ruleVersion: STRUCTURE_RULE, snapshotDigest: digest,
    counts: { encounters: boxes.length, enemies, supers, conditions, observations: observations.length }, observations, issues,
    coverage: { status: 'unconfirmed', candidateTraversalFinished: true, unresolved: issues.length > 0,
      note: '候補selector内の走査です。ページ全体の網羅性・表示の可視性・ゲーム上の意味は未確認です。',
      excluded: ['scripts/styles', 'external resources', 'forms/hidden content', 'comments', 'extension UI', 'heap/storage', 'CSS visibility interpretation'] } };
  if (JSON.stringify(result).length > LIMITS.output) fail('DIAGNOSTIC_OUTPUT_LIMIT');
  return result;
}
