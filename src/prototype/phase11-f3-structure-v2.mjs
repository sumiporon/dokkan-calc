/** Bounded diagnostic observations only. Never an intake/evidence adapter. */
import { load } from 'cheerio/lib/slim';
import { SELECTORS, snapshotDigest } from './phase11-f3-structure-diagnostic.mjs';

export const RULE = 'phase11-f3-structure-candidates-2';
export const LIMITS = Object.freeze({ snapshot: 4_000_000, elements: 30_000, nodes: 1_000, observations: 700, issues: 700, candidates: 40, text: 160, classes: 160, classTokens: 8, path: 1_000, children: 64, depth: 2, skills: 32, icons: 8, output: 250_000 });
const compact = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const safe = s => compact(s).replace(/[<>\u0000-\u001f]/g, '');
const bounded = s => safe(s).slice(0, LIMITS.text);
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const stop = code => { throw Object.assign(new Error(code), { code }); };
const unique = list => [...new Set(list)];
const labels = Object.freeze({ 'ダメージ:': 'super-atk', 'パーセンテージ:': 'probability', 'HPレンジ:': 'hp-condition', '最大ATK/ターン:': 'super-specific-count', '再使用までの時間:': 'reuse' });

export function createStructureDiagnosticV2({ readUrl, readOuterHTML, expectedUrl, expectedEventId, expectedStageId }) {
  let started = false;
  return { async run() {
    if (started) stop('DIAGNOSTIC_ALREADY_RUN');
    started = true;
    const before = readUrl();
    if (before !== expectedUrl) stop('DIAGNOSTIC_URL');
    const url = new URL(before), ids = url.pathname.match(/^\/events\/challenge\/(\d+)\/(\d+)(?:\.html)?$/);
    if (!ids || ids[1] !== expectedEventId || ids[2] !== expectedStageId || url.search || url.hash) stop('DIAGNOSTIC_URL');
    let snapshot;
    try {
      snapshot = readOuterHTML();
      if (readUrl() !== before) stop('DIAGNOSTIC_URL_CHANGED');
      return await diagnoseStructureV2({ snapshot, expectedEventId, expectedStageId });
    } finally { snapshot = null; }
  } };
}

export async function diagnoseStructureV2({ snapshot, expectedEventId, expectedStageId }) {
  const result = {
    kind: 'structure-diagnostic', formatVersion: 2, ruleVersion: RULE,
    snapshotDigest: null, snapshotDigestEncoding: 'utf8-outerHTML',
    source: { eventId: expectedEventId, stageId: expectedStageId, identityState: 'unconfirmed' },
    counts: { encounters: null, enemies: null, superCandidates: null, conditionCandidates: null, observations: 0 },
    nodes: [], observations: [], issues: [],
    coverage: { status: 'unconfirmed', candidateTraversalFinished: false, unresolved: true, scopes: [], limitsReached: [],
      excluded: ['scripts/styles', 'external resources', 'forms/hidden content', 'comments', 'extension UI', 'heap/storage', 'CSS visibility interpretation', 'outside declared local scopes'] }
  };
  let $;
  const nodeMap = new Map(), originalPosition = new Map(), scopeMap = new Map();
  function fatal(code) { stop(code); }
  function issue(code, scope = null, nodeRef = null) {
    if (result.issues.some(i => i.code === code && i.scope === scope && i.nodeRef === nodeRef)) return;
    if (result.issues.length >= LIMITS.issues) fatal('LIMIT_ISSUES');
    result.issues.push({ code, scope, nodeRef });
    if (code.startsWith('LIMIT_') && !result.coverage.limitsReached.includes(code)) result.coverage.limitsReached.push(code);
    if (code.startsWith('LIMIT_') && scopeMap.has(scope)) scopeMap.get(scope).status = 'incomplete';
  }
  function observe(field, state, refs, parent = {}, metadata = {}, count = refs.length) {
    if (result.observations.length >= LIMITS.observations) fatal('LIMIT_OBSERVATIONS');
    const o = { id: `o${result.observations.length}`, field, state, count, parent, candidateNodeRefs: refs, metadata };
    result.observations.push(o);
    if (state === 'missing' || state === 'ambiguous' || state === 'not-observed') issue(`${state}:${field}`, metadata.scope ?? null);
    return o;
  }
  function pathFor(n) {
    const parts = [];
    for (let p = n; p && p.type !== 'root'; p = p.parent) {
      const pos = originalPosition.get(p);
      parts.unshift(p.type === 'text' ? `#text:nth-child(${pos?.all ?? 0})` : `${p.name}:nth-of-type(${pos?.tag ?? 0})`);
      if (parts.join('>').length > LIMITS.path) fatal('LIMIT_PATH');
    }
    return parts.join('>');
  }
  const children = n => (n.children ?? []).filter(c => c.type === 'tag' || (c.type === 'text' && compact(c.data)));
  function ref(n, scope) {
    if (nodeMap.has(n)) return nodeMap.get(n).id;
    if (result.nodes.length >= LIMITS.nodes) fatal('LIMIT_NODES');
    const tokens = safe(n.attribs?.class).split(' ').filter(Boolean);
    const classText = tokens.slice(0, LIMITS.classTokens).join(' ').slice(0, LIMITS.classes);
    const raw = n.type === 'text' ? n.data : (n.children ?? []).filter(c => c.type === 'text').map(c => c.data).join('');
    const entry = { id: `n${result.nodes.length}`, parentNodeId: null, siblingOrdinal: (originalPosition.get(n)?.all ?? 1) - 1,
      path: pathFor(n), nodeType: n.type === 'text' ? 'text' : 'element', tag: n.name ?? null,
      classes: classText, classesTruncated: tokens.length > LIMITS.classTokens || tokens.join(' ').length > LIMITS.classes,
      ownText: bounded(raw), text: bounded(raw), truncated: safe(raw).length > LIMITS.text,
      directChildCount: children(n).length, emittedChildCount: 0, childRefs: [] };
    nodeMap.set(n, entry); result.nodes.push(entry);
    if (entry.truncated) issue('LIMIT_TEXT', scope, entry.id);
    if (entry.classesTruncated) issue('LIMIT_CLASSES', scope, entry.id);
    return entry.id;
  }
  function scope(root, name, parent) {
    const rootRef = ref(root, null), key = `${name}:${rootRef}`;
    if (scopeMap.has(key)) return scopeMap.get(key);
    const s = { id: key, rootRef, name, parent, maxDepth: LIMITS.depth, status: 'finished', nodeRefs: [], omitted: [] };
    scopeMap.set(key, s); result.coverage.scopes.push(s);
    function walk(n, depth) {
      const id = ref(n, key); s.nodeRefs.push(id);
      const entry = nodeMap.get(n), kids = children(n);
      if (entry.truncated || entry.classesTruncated) s.status = 'incomplete';
      const capped = kids.slice(0, LIMITS.children);
      const allowed = depth === LIMITS.depth ? capped.filter(c => c.type === 'text') : capped;
      if (allowed.length !== capped.length) {
        s.omitted.push({ parentRef: id, reason: 'depth', count: capped.length - allowed.length }); issue('LIMIT_DEPTH', key, id);
      }
      if (kids.length > LIMITS.children) { s.omitted.push({ parentRef: id, reason: 'children', count: kids.length - LIMITS.children }); issue('LIMIT_CHILDREN', key, id); }
      for (const child of allowed) {
        walk(child, depth + (child.type === 'text' ? 0 : 1)); const item = nodeMap.get(child); item.parentNodeId = id;
        if (!entry.childRefs.includes(item.id)) entry.childRefs.push(item.id);
      }
      entry.emittedChildCount = entry.childRefs.length;
    }
    walk(root, 0); return s;
  }
  // Read only text nodes included in this scope. Never aggregate unseen descendants.
  function parts(n, s) {
    if (!s.nodeRefs.includes(nodeMap.get(n)?.id)) return [];
    if (n.type === 'text') return [{ nodeRef: nodeMap.get(n).id, raw: safe(n.data) }];
    return children(n).flatMap(c => parts(c, s));
  }
  function textView(n, s) {
    const ps = parts(n, s), raw = ps.map(p => p.raw).join(' ');
    return { raw, text: bounded(raw), truncated: safe(raw).length > LIMITS.text, parts: ps };
  }
  function completeSubtree(n, s) {
    const p = pathFor(n);
    return !s.omitted.some(o => { const e = result.nodes.find(e => e.id === o.parentRef); return e && (e.path === p || e.path.startsWith(p + '>')); })
      && !s.nodeRefs.some(id => { const e = result.nodes.find(e => e.id === id); return e && (e.path === p || e.path.startsWith(p + '>')) && (e.truncated || e.classesTruncated); });
  }
  function clipText(n, s) {
    const v = textView(n, s), entry = nodeMap.get(n);
    if (entry) { entry.text = v.text; entry.truncated ||= v.truncated; }
    if (v.truncated) issue('LIMIT_TEXT', s.id, entry?.id); return v;
  }
  function limited(list, s) {
    if (list.length > LIMITS.candidates) { issue('LIMIT_CANDIDATES', s?.id); return { nodes: list.slice(0, LIMITS.candidates), count: null }; }
    return { nodes: list, count: list.length };
  }
  function inspectSuper(column, parent) {
    const colScope = scope(column, 'super-column', parent), direct = children(column);
    const position = n => { const p = []; for (let c = n; c && c.type !== 'root'; c = c.parent) p.unshift(originalPosition.get(c)?.all ?? 0); return p; };
    const compare = (a, b) => { const x = position(a), y = position(b); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; };
    const headers = direct.filter(n => n.type === 'tag' && ($(n).is('.super-header') || $(n).find(SELECTORS.superIcon).length));
    const pool = limited(headers, colScope); let conditionCount = 0;
    const headerInfo = pool.nodes.map((n, index) => {
      const hs = scope(n, 'super-candidate', { ...parent, superCandidate: index });
      const icons = $(n).find(SELECTORS.superIcon).toArray(), byClass = $(n).is('.super-header');
      const ambiguous = !byClass || icons.length !== 1;
      if (icons.length > LIMITS.icons) issue('LIMIT_ICONS', hs.id);
      const iconRefs = icons.slice(0, LIMITS.icons).map(icon => ({ nodeRef: ref(icon, hs.id), basename: $(icon).attr('src')?.match(/sp_skill_icon_[a-zA-Z0-9_]+\.png/)?.[0]?.slice(0, LIMITS.text) ?? null }));
      const rootRef = ref(n, hs.id);
      observe('super-root', ambiguous ? 'ambiguous' : 'detected', [rootRef], { ...parent, superCandidate: index },
        { scope: hs.id, byClass, iconCount: icons.length, iconRefs, matchedBy: [...(byClass ? ['class'] : []), ...(icons.length ? ['icon'] : [])], relationshipStatus: ambiguous ? 'unresolved' : 'structural-only' });
      if (ambiguous) issue('super-selector-conflict', hs.id, rootRef);
      const names = hs.nodeRefs.map(id => result.nodes.find(e => e.id === id)).filter(e => e.tag === 'b');
      const nameLimit = limited(names, hs);
      observe('super-name', hs.status !== 'finished' || nameLimit.count === null ? 'not-observed' : names.length !== 1 || ambiguous ? (names.length ? 'ambiguous' : 'missing') : 'non-empty-unparsed', nameLimit.nodes.map(n => n.id),
        { ...parent, superCandidate: index }, { scope: hs.id, relationshipStatus: ambiguous ? 'unresolved' : 'structural-only' }, nameLimit.count);
      for (const n2 of hs.nodeRefs) { const dom = [...nodeMap].find(([, e]) => e.id === n2)?.[0]; if (dom) clipText(dom, hs); }
      return { n, rootRef, index, ambiguous, scope: hs };
    });
    if (!headers.length) observe('super-root', 'missing', [], parent, { scope: colScope.id });
    // A field region is a column child or its immediate element child; wrappers
    // containing multiple labels stay unresolved instead of being regex-split.
    const fieldRoots = [];
    function collect(roots, s, ownerHint = null) {
      for (const n of roots.slice(0, LIMITS.children)) {
        const candidates = [n, ...children(n).filter(c => c.type === 'tag').slice(0, LIMITS.children)];
        for (const c of candidates) {
          if (fieldRoots.some(r => r.n === c || $(c).parents().toArray().includes(r.n))) continue;
          const v = textView(c, s);
          if (Object.keys(labels).some(label => v.raw.startsWith(label))) fieldRoots.push({ n: c, scope: s, ownerHint });
        }
      }
    }
    collect(direct.filter(n => !headers.includes(n)), colScope);
    // A selector-conflicting root may enclose the whole Super block. Observe
    // its own bounded children too, but never upgrade its unresolved ownership.
    for (const h of headerInfo) collect(children(h.n), h.scope, h);
    fieldRoots.sort((a, b) => compare(a.n, b.n));
    const fieldPool = limited(fieldRoots, colScope);
    const bands = fieldPool.nodes.filter(e => textView(e.n, e.scope).raw.startsWith('HPレンジ:'));
    conditionCount = bands.length;
    const bandInfos = bands.map((e, i) => ({ n: e.n, id: ref(e.n, e.scope.id), index: i }));
    const summaries = [];
    const ordered = unique([...headerInfo.map(h => h.n), ...fieldPool.nodes.map(e => e.n)]).sort(compare);
    for (const entry of fieldPool.nodes) {
      const { n, scope: fieldScope, ownerHint } = entry;
      const v = clipText(n, fieldScope), label = Object.keys(labels).find(l => v.raw.startsWith(l)), field = labels[label];
      const rootRef = ref(n, fieldScope.id), order = ordered.indexOf(n);
      const owner = ownerHint ?? headerInfo.filter(h => compare(h.n, n) < 0).at(-1) ?? null;
      const next = headerInfo.find(h => compare(h.n, n) > 0) ?? null;
      const previousBand = bandInfos.filter(b => compare(b.n, n) <= 0 && (!owner || compare(b.n, owner.n) > 0)).at(-1) ?? null;
      const nextBand = bandInfos.find(b => compare(b.n, n) > 0 && (!next || compare(b.n, next.n) < 0)) ?? null;
      const multiLabel = Object.keys(labels).reduce((sum, l) => sum + v.raw.split(l).length - 1, 0) !== 1;
      const nested = n.parent !== (ownerHint ? ownerHint.n : column);
      const ambiguous = !owner || owner.ambiguous || multiLabel || nested || pool.count === null;
      const valueText = v.raw.slice(label.length).trim();
      let offset = 0;
      const relevant = v.parts.map((p, i) => {
        const start = offset; offset += p.raw.length + 1;
        const labelEnd = Math.max(0, Math.min(p.raw.length, label.length - start));
        const valueStart = Math.max(0, Math.min(p.raw.length, label.length - start));
        return { nodeRef: p.nodeRef, ordinal: i,
          labelRange: labelEnd ? [0, Math.min(labelEnd, LIMITS.text)] : null,
          valueRange: valueStart < p.raw.length ? [Math.min(valueStart, LIMITS.text), Math.min(p.raw.length, LIMITS.text)] : null,
          offsetEncoding: 'compact-sanitized-text-utf16' };
      });
      const incomplete = !completeSubtree(n, fieldScope) || v.truncated || direct.length > LIMITS.children || fieldPool.count === null;
      const metadata = { scope: fieldScope.id, label, valueText: bounded(valueText), truncated: v.truncated,
        labelValueParts: relevant, commonParentRef: n.type === 'text' ? ref(n.parent, fieldScope.id) : rootRef,
        domOrder: order, domOrderBasis: 'ordered-header-and-field-candidates', placement: ownerHint ? 'inside-header-candidate' : 'column-sibling', headerCandidateRef: owner?.rootRef ?? null, nextHeaderCandidateRef: next?.rootRef ?? null,
        conditionCandidateRef: previousBand?.id ?? null, nextConditionCandidateRef: nextBand?.id ?? null,
        boundaryEnd: nextBand?.id ?? next?.rootRef ?? ref(column, colScope.id),
        relationshipStatus: ambiguous || incomplete ? 'unresolved' : 'structural-only' };
      const o = observe(field, incomplete ? 'not-observed' : ambiguous ? 'ambiguous' : valueText === '' ? 'blank' : 'non-empty-unparsed', [rootRef], parent, metadata);
      summaries.push(o);
    }
    // Duplicate field within one structural header/condition interval never wins.
    for (const o of summaries) {
      const same = summaries.filter(other => other.field === o.field && other.metadata.headerCandidateRef === o.metadata.headerCandidateRef && other.metadata.conditionCandidateRef === o.metadata.conditionCandidateRef);
      if (same.length > 1) { o.state = 'ambiguous'; o.metadata.relationshipStatus = 'unresolved'; issue('duplicate-field', colScope.id, o.candidateNodeRefs[0]); }
    }
    for (const h of headerInfo) for (const field of Object.values(labels)) {
      if (!summaries.some(o => o.field === field && o.metadata.headerCandidateRef === h.rootRef)) observe(field, colScope.status === 'finished' && !h.ambiguous ? 'missing' : 'not-observed', [], { ...parent, superCandidate: h.index }, { scope: colScope.id, relationshipStatus: 'unresolved' });
    }
    return { supers: pool.count, conditions: colScope.status === 'finished' && fieldPool.count !== null ? conditionCount : null };
  }
  function inspectSkills(column, parent) {
    const rawRows = children(column), rows = rawRows.slice(0, LIMITS.skills);
    const rootRef = ref(column, null);
    observe('skill-region', rawRows.length ? 'detected' : 'blank', [rootRef], parent, { rowCount: rawRows.length, emittedRows: rows.length });
    if (rawRows.length > LIMITS.skills) issue('LIMIT_SKILL_ROWS', null, rootRef);
    for (const [row, n] of rows.entries()) {
      const s = scope(n, 'skill-row', { ...parent, row }), v = clipText(n, s);
      const candidates = s.nodeRefs.map(id => result.nodes.find(e => e.id === id));
      const descriptions = limited(candidates.filter(e => e.classes.split(' ').includes('col-sm-9')), s);
      const values = limited(candidates.filter(e => e.classes.split(' ').includes('col-sm-3')), s);
      const ids = limited(candidates.filter(e => /ID:\s*\d+/.test(e.ownText)), s);
      const descriptionRefs = descriptions.nodes.map(e => e.id), valueRefs = values.nodes.map(e => e.id);
      const displayedIds = ids.nodes.map(e => ({ nodeRef: e.id, text: e.ownText }));
      observe('skill-row', s.status !== 'finished' ? 'not-observed' : v.raw ? 'non-empty-unparsed' : 'blank', [ref(n, s.id)], { ...parent, row }, { scope: s.id, text: v.text, truncated: v.truncated, descriptionRefs, valueRefs, displayedIds, descriptionCandidateCount: descriptions.count, valueCandidateCount: values.count, idCandidateCount: ids.count, relationshipStatus: 'uninterpreted' });
    }
  }
  function inspectNearby(box, row, columns, parent) {
    const siblings = children(row.parent), at = siblings.indexOf(row);
    const roots = unique([columns[1], columns[2], ...siblings.slice(Math.max(0, at - 2), at), ...siblings.slice(at + 1, at + 3)]);
    // Parent/encounter own text only. Recursing through the parent would bypass
    // the +/-2 sibling boundary and accidentally inspect every enemy/region.
    const nearby = new Set([ref(box, null), ref(row.parent, null)]); const scopes = [];
    for (const n of roots) {
      const s = scope(n, 'AI-AOE-local', { encounter: parent.encounter }); scopes.push(s);
      // Only nodes explicitly included at depth <= 2 are eligible. No fallback
      // descendant search, ancestor text aggregation, or adjacent event scan.
      for (const id of s.nodeRefs) nearby.add(id);
    }
    for (const [field, pattern, selector] of [['ai-region', /アクション|スロット|^AI\s*[:：]/, SELECTORS.ai], ['aoe-region', /エリア\/ターン|エリアダメージ|\bAOE\b/, null]]) {
      const nodes = [...nodeMap].filter(([, e]) => nearby.has(e.id)).filter(([n, e]) => (selector && $(n).is(selector)) || pattern.test(e.ownText));
      const pool = limited(nodes, scopes[0]);
      observe(field, pool.count === null ? 'not-observed' : nodes.length ? 'non-empty-unparsed' : 'missing', pool.nodes.map(([, e]) => e.id), parent,
        { scope: scopes[0].id, parentOwnTextRefs: unique([ref(box, null), ref(row.parent, null)]), searchedScopes: scopes.map(s => s.id), relationshipStatus: 'unresolved', absenceMeaning: 'not-found-in-declared-scopes-only', scopeComplete: scopes.every(s => s.status === 'finished') }, pool.count);
    }
  }
  try {
    if (typeof snapshot !== 'string' || !snapshot.trim() || snapshot.length > LIMITS.snapshot) fatal('LIMIT_SNAPSHOT');
    result.snapshotDigest = await snapshotDigest(snapshot);
    $ = load(snapshot);
    const all = $('*').toArray(); if (all.length > LIMITS.elements) fatal('LIMIT_ELEMENTS');
    for (const parent of [$.root().get(0), ...all]) {
      const tags = new Map(); (parent.children ?? []).forEach((n, i) => { const t = (tags.get(n.name) ?? 0) + 1; tags.set(n.name, t); originalPosition.set(n, { all: i + 1, tag: t }); });
    }
    $('script,style,iframe,object,embed,template,form,input,textarea,select,[hidden],[aria-hidden="true"],#f3-structure-ui').remove();
    const identities = $('meta[property="og:url"],link[rel="canonical"]').toArray();
    const identityValues = identities.map(n => { try { const u = new URL($(n).attr(n.name === 'meta' ? 'content' : 'href')); return !u.search && !u.hash && !u.username && !u.password && u.pathname === `/events/challenge/${expectedEventId}/${expectedStageId}`; } catch { return false; } });
    if (identities.length !== 1 || !identityValues[0]) { observe('event-stage-identity', identities.length > 1 ? 'ambiguous' : 'missing', [], {}, { relationshipStatus: 'unresolved' }); fatal('IDENTITY_UNCONFIRMED'); }
    result.source.identityState = 'confirmed'; observe('event-stage-identity', 'detected', [ref(identities[0], null)], {}, {});
    const boxes = $(SELECTORS.encounter).toArray(), pool = limited(boxes, null);
    result.counts.encounters = pool.count; result.counts.enemies = 0; result.counts.superCandidates = 0; result.counts.conditionCandidates = 0;
    if (!boxes.length) observe('encounter-root', 'missing', [], {});
    for (const [encounter, box] of pool.nodes.entries()) {
      const parent = { encounter }, boxRef = ref(box, null);
      const nested = $(box).parents(SELECTORS.encounter).length || $(box).find(SELECTORS.encounter).length;
      observe('encounter-root', nested ? 'ambiguous' : 'detected', [boxRef], parent);
      if (nested) { result.counts.enemies = result.counts.superCandidates = result.counts.conditionCandidates = null; continue; }
      const rows = $(box).find(SELECTORS.enemy).toArray().filter(n => $(n).find(SELECTORS.type).length), rowPool = limited(rows, null);
      result.counts.enemies = result.counts.enemies === null || rowPool.count === null ? null : result.counts.enemies + rowPool.count;
      if (!rows.length) observe('enemy-root', 'missing', [], parent);
      for (const [enemy, row] of rowPool.nodes.entries()) {
        const ep = { encounter, enemy }, columns = $(row).children().toArray();
        const ambiguous = columns.length !== 4 || $(columns[0]).find(SELECTORS.type).length !== 1 || $(row).parents(SELECTORS.enemy).length || $(row).parents(SELECTORS.encounter).length !== 1 || $(row).find(SELECTORS.enemy).toArray().some(n => $(n).find(SELECTORS.type).length);
        observe('enemy-root', ambiguous ? 'ambiguous' : 'detected', [ref(row, null)], ep);
        if (ambiguous) { result.counts.superCandidates = result.counts.conditionCandidates = null; continue; }
        const nameNodes = limited($(columns[0]).find(SELECTORS.name).toArray(), null);
        const nameRefs = nameNodes.nodes.map(n => { const s = scope(n, 'enemy-name', ep); clipText(n, s); return ref(n, s.id); });
        observe('enemy-name', nameNodes.count === null ? 'not-observed' : nameRefs.length === 1 ? 'non-empty-unparsed' : nameRefs.length ? 'ambiguous' : 'missing', nameRefs, ep, {}, nameNodes.count);
        const type = $(columns[0]).find(SELECTORS.type).get(0);
        observe('type-class-candidate', 'non-empty-unparsed', [ref(type, null)], ep, { basename: $(type).attr('src')?.match(/cha_type_icon_[a-zA-Z0-9_]+\.png/)?.[0]?.slice(0, LIMITS.text) ?? null });
        const ss = scope(columns[1], 'enemy-stats', ep);
        for (const [label, field] of [['HP:', 'hp'], ['ATK:', 'atk'], ['DEF:', 'def'], ['最大ATK/ターン:', 'enemy-wide-count']]) {
          const hits = children(columns[1]).filter(n => textView(n, ss).raw.startsWith(label)), boundedHits = limited(hits, ss);
          const refs = boundedHits.nodes.map(n => { clipText(n, ss); return ref(n, ss.id); });
          observe(field, ss.status !== 'finished' || boundedHits.count === null ? 'not-observed' : refs.length === 1 ? textView(hits[0], ss).raw.slice(label.length).trim() ? 'non-empty-unparsed' : 'blank' : refs.length ? 'ambiguous' : 'missing', refs, ep, { scope: ss.id }, boundedHits.count);
        }
        const counts = inspectSuper(columns[2], ep);
        for (const [key, val] of [['superCandidates', counts.supers], ['conditionCandidates', counts.conditions]]) result.counts[key] = result.counts[key] === null || val === null ? null : result.counts[key] + val;
        inspectSkills(columns[3], ep); inspectNearby(box, row, columns, ep);
      }
    }
    // Fill physical parent references only when both nodes were observed.
    for (const [n, entry] of nodeMap) if (nodeMap.has(n.parent)) entry.parentNodeId = nodeMap.get(n.parent).id;
    result.counts.observations = result.observations.length;
    result.coverage.candidateTraversalFinished = !result.coverage.limitsReached.length;
    result.coverage.unresolved = result.issues.length > 0;
    if (bytes(result) > LIMITS.output) fatal('LIMIT_OUTPUT');
    return result;
  } catch (error) {
    // No partially referenced graph is returned after a global stop.
    if (!error.code) throw error;
    result.nodes = []; result.observations = [{ id: 'o0', field: 'diagnostic-scope', state: 'not-observed', count: null, parent: {}, candidateNodeRefs: [], metadata: { reason: error.code } }];
    result.issues = [{ code: error.code, scope: null, nodeRef: null }];
    result.counts = { encounters: null, enemies: null, superCandidates: null, conditionCandidates: null, observations: 1 };
    result.coverage.scopes = []; result.coverage.candidateTraversalFinished = false; result.coverage.unresolved = true;
    result.coverage.limitsReached = error.code.startsWith('LIMIT_') ? [error.code] : [];
    return result;
  } finally { snapshot = null; $ = null; nodeMap.clear(); originalPosition.clear(); scopeMap.clear(); }
}
