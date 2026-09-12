/**
 * F3-prep scan for a single immutable, self-authored snapshot.
 *
 * This module deliberately accepts a string, never a Document.  It models the
 * full F3 contract (including fields that F1 intentionally did not cover)
 * without giving the scanner any calculation or navigation responsibility.
 */
import { load } from 'cheerio/lib/slim';
import { F1_PARTIAL_FORMAT, F1_RULES, F1_SOURCE, f1Digest, f1ExactKeys, f1SafeText, f1Stable } from './phase11-dokkaninfo-f1-rules.mjs';
import { validateDokkanInfoF1Partial } from './phase11-partial-material.mjs';

export const F3_SCAN_FORMAT = 'phase11-dokkaninfo-f3-scan-1';
export const F3_DOM_RULE = 'dokkaninfo-f3-fixture-structure-1';
export const F3_DOMAINS = Object.freeze([
  'event-stage-identity', 'encounter', 'enemy-identity', 'type-class', 'hp', 'atk', 'def', 'enemy-wide-attack-count',
  'super-header-name', 'super-atk', 'condition-hp-range', 'probability', 'super-max-per-turn', 'reuse',
  'super-effect', 'skill-passive', 'ai', 'aoe'
]);
const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }); };
const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const bounded = value => f1SafeText(value);

function numericOrText(value) {
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}
function evidence({ capture, source, node, ordinal, domain, state, labelText, valueText }) {
  const rawDisplayedText = compact(node.text());
  if (![labelText, valueText, rawDisplayedText].every(bounded)) fail('F3_EVIDENCE_BOUNDS', `${domain}: bounded evidence is required`);
  return {
    id: `e:${capture.id}:${ordinal.encounter}:${ordinal.enemy}:${ordinal.attack ?? '-'}:${ordinal.condition ?? '-'}:${domain}`,
    captureId: capture.id, snapshotDigest: capture.snapshotDigest, eventId: source.eventId, stageId: source.stageId,
    encounterOrdinal: ordinal.encounter, enemyOrdinal: ordinal.enemy, attackOrdinal: ordinal.attack ?? null, conditionOrdinal: ordinal.condition ?? null,
    fieldPath: domain, labelText, valueText, rawDisplayedText,
    structuralPath: `f3/${domain}/encounter[${ordinal.encounter}]/enemy[${ordinal.enemy}]`,
    selectorRule: F3_DOM_RULE, extractionRule: F1_RULES.extraction, interpretationRule: F1_RULES.interpretation,
    terminal: state === 'known' ? 'interpreted' : state === 'unavailable' ? 'blank' : state === 'unknown' ? 'unrecognized' : 'not-applicable'
  };
}
function ordinalFor(node) {
  const attr = name => node.attr(`data-f3-${name}`);
  const number = (name, fallback = null) => attr(name) == null ? fallback : Number(attr(name));
  const ordinal = { encounter: number('encounter', 0), enemy: number('enemy', 0), attack: number('attack'), condition: number('condition') };
  if (!Number.isSafeInteger(ordinal.encounter) || !Number.isSafeInteger(ordinal.enemy)
    || (ordinal.attack != null && !Number.isSafeInteger(ordinal.attack)) || (ordinal.condition != null && !Number.isSafeInteger(ordinal.condition))) fail('F3_ORDINAL');
  return ordinal;
}
function observation({ capture, source, node, domain }) {
  const state = node.attr('data-f3-state');
  const labelText = compact(node.attr('data-f3-label') ?? domain);
  const valueText = compact(node.attr('data-f3-value') ?? '');
  const ordinal = ordinalFor(node);
  if (!['known', 'unknown', 'unavailable', 'not-applicable'].includes(state)) fail('F3_FIELD_STATE');
  if (state === 'known' && valueText === '') fail('F3_KNOWN_EMPTY');
  if (state === 'unknown' && valueText === '') fail('F3_UNKNOWN_EMPTY');
  if (state === 'unavailable' && valueText !== '') fail('F3_UNAVAILABLE_VALUE');
  if (state === 'not-applicable' && valueText !== '') fail('F3_NOT_APPLICABLE_VALUE');
  const item = { encounterOrdinal: ordinal.encounter, enemyOrdinal: ordinal.enemy, attackOrdinal: ordinal.attack, conditionOrdinal: ordinal.condition,
    path: domain, state, value: state === 'known' ? numericOrText(valueText) : null,
    evidenceIds: [] };
  const itemEvidence = evidence({ capture, source, node, ordinal, domain, state, labelText, valueText });
  item.evidenceIds = [itemEvidence.id];
  return { item, evidence: itemEvidence, uninterpreted: state === 'unknown' ? { target: ordinal, field: domain, rawText: itemEvidence.rawDisplayedText, impact: 'meaning-not-interpreted' } : null };
}

export async function scanF3Snapshot({ snapshot, capture, expectedEventId, expectedStageId }) {
  if (typeof snapshot !== 'string' || !snapshot.trim()) fail('F3_SNAPSHOT_EMPTY');
  f1ExactKeys(capture, ['id', 'revision', 'observedAt', 'snapshotDigest']);
  if (await f1Digest(snapshot) !== capture.snapshotDigest) fail('F3_SNAPSHOT_DIGEST');
  const $ = load(snapshot), root = $('[data-f3-snapshot]').first();
  if (root.length !== 1) fail('F3_ROOT');
  const source = { key: F1_SOURCE.key, region: F1_SOURCE.region, eventId: root.attr('data-f3-event-id'), stageId: root.attr('data-f3-stage-id') };
  if (!/^\d+$/.test(source.eventId ?? '') || !/^\d+$/.test(source.stageId ?? '') || source.eventId !== expectedEventId || source.stageId !== expectedStageId) fail('F3_SNAPSHOT_OWNERSHIP');
  const structuralFailures = [];
  if (root.attr('data-f3-relationship') !== 'resolved') structuralFailures.push('F3_RELATIONSHIP_UNRESOLVED');
  const nodes = root.find('[data-f3-domain]').toArray().map(node => $(node));
  const byDomain = new Map();
  for (const node of nodes) {
    const domain = node.attr('data-f3-domain');
    if (!F3_DOMAINS.includes(domain)) structuralFailures.push('F3_UNEXPECTED_DOMAIN');
    else if (byDomain.has(domain)) structuralFailures.push('F3_DUPLICATE_DOMAIN');
    else byDomain.set(domain, node);
  }
  const missing = F3_DOMAINS.filter(domain => !byDomain.has(domain));
  if (missing.length) structuralFailures.push(...missing.map(domain => `F3_UNSCANNED_${domain.toUpperCase().replaceAll('-', '_')}`));
  const observations = [], evidenceItems = [], uninterpreted = [];
  if (!structuralFailures.length) for (const domain of F3_DOMAINS) {
    const item = observation({ capture, source, node: byDomain.get(domain), domain });
    observations.push(item.item); evidenceItems.push(item.evidence); if (item.uninterpreted) uninterpreted.push(item.uninterpreted);
  }
  const complete = structuralFailures.length === 0 && root.attr('data-f3-coverage') === 'complete';
  if (root.attr('data-f3-coverage') !== 'complete') structuralFailures.push('F3_COVERAGE_INCOMPLETE');
  return {
    formatVersion: F3_SCAN_FORMAT, source, capture: structuredClone(capture), rule: F3_DOM_RULE,
    observations, evidence: evidenceItems, uninterpreted,
    relationships: [{ encounterOrdinal: 0, enemyOrdinal: 0, attackOrdinal: 0, conditionOrdinal: 0, status: root.attr('data-f3-relationship') }],
    coverage: { complete, domains: F3_DOMAINS.map(domain => ({ domain, terminal: byDomain.has(domain) ? byDomain.get(domain).attr('data-f3-state') : 'unvisited' })),
      expectedFromSnapshot: nodes.length, observedFromSnapshot: byDomain.size, deliberatelyExcluded: [], structuralFailures },
    failures: structuralFailures
  };
}

/** Builds the established evidence-bound partial format; it does not infer values from an F1 error. */
export async function partialFromF3Scan(scan) {
  if (!scan?.coverage?.complete || scan.failures?.length) fail('F3_COVERAGE_INCOMPLETE');
  const body = { kind: 'partial', formatVersion: F1_PARTIAL_FORMAT, source: scan.source, capture: scan.capture, rules: F1_RULES,
    relationships: scan.relationships, fields: scan.observations, evidence: scan.evidence,
    coverage: scan.coverage, uninterpreted: scan.uninterpreted,
    fullCheck: { status: 'not-complete-from-observed-facts' } };
  const material = { ...body, contentDigest: await f1Digest(body) };
  return validateDokkanInfoF1Partial(material);
}
