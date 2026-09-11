import { FORMAT, VERSIONS, SOURCE, SLOTS, TARGETS, PRIMARY, insist, stable, digest, exactKeys, interpret, safeText } from './phase11-partial-rules.mjs';
import { evaluateSingleHit, SINGLE_HIT_OUTPUTS } from './phase11-single-hit.mjs';

export async function sealMaterial(body) { const { contentDigest, ...content } = body; return { ...content, contentDigest: await digest(content) }; }
export function evidenceFor(slot, rawText, capture) {
  return { id: `fixture:${capture.id}:${slot.key}`, captureId: capture.id, revision: capture.revision,
    ...SOURCE, enemyId: slot.enemyId, attackId: slot.attackId, conditionId: slot.conditionId,
    slot: slot.key, label: slot.label, rawText, ruleVersion: VERSIONS.interpretation };
}
export async function materialFromObservations(observations, uninterpreted, capture, fullCheck) {
  const fields = observations.map(e => {
    const slot = SLOTS.find(s => s.key === e.slot);
    insist(slot, 'OBSERVATION_UNKNOWN');
    return { slot: slot.key, ...interpret(slot, e.rawText), evidenceIds: [e.id] };
  });
  const material = await sealMaterial({ kind: 'partial', formatVersion: FORMAT, source: { ...SOURCE }, capture: { ...capture },
    versions: { ...VERSIONS }, targets: structuredClone(TARGETS), fields, evidence: observations,
    uninterpreted, coverage: { scope: 'fictional-proof-cells-only', observed: SLOTS.map(s => s.key), uninterpretedIds: uninterpreted.map(e => e.id), omitted: [] }, fullCheck });
  return validatePartialMaterial(material);
}

export async function validatePartialMaterial(input) {
  // Snapshot before awaits: callers cannot mutate a record between validation and use.
  const m = structuredClone(input);
  exactKeys(m, ['kind', 'formatVersion', 'source', 'capture', 'versions', 'targets', 'fields', 'evidence', 'uninterpreted', 'coverage', 'fullCheck', 'contentDigest']);
  insist(m.kind === 'partial' && m.formatVersion === FORMAT, 'PARTIAL_FORMAT');
  insist(stable(m).length < 150000, 'MATERIAL_SIZE');
  insist(stable(m.source) === stable(SOURCE), 'SOURCE_MEMBERSHIP');
  insist(stable(m.versions) === stable(VERSIONS), 'RULE_VERSION');
  exactKeys(m.capture, ['id', 'revision', 'observedAt']);
  insist(/^fictional-capture-[A-Za-z0-9-]{1,100}$/.test(m.capture.id) && Number.isSafeInteger(m.capture.revision) && m.capture.revision > 0
    && typeof m.capture.observedAt === 'string' && Number.isFinite(Date.parse(m.capture.observedAt)), 'CAPTURE_VERSION');
  insist(stable(m.targets) === stable(TARGETS), 'TARGET_BINDING');
  const { contentDigest, ...body } = m;
  insist(await digest(body) === contentDigest, 'CONTENT_DIGEST');
  insist(Array.isArray(m.uninterpreted), 'UNINTERPRETED_FORMAT');
  insist(stable(m.coverage) === stable({ scope: 'fictional-proof-cells-only', observed: SLOTS.map(s => s.key), uninterpretedIds: m.uninterpreted.map(e => e.id), omitted: [] }), 'COVERAGE');
  insist(Array.isArray(m.fields) && m.fields.length === SLOTS.length && Array.isArray(m.evidence) && m.evidence.length === SLOTS.length, 'FIELD_COUNT');
  const seen = new Set(); const repeated = new Map();
  for (const slot of SLOTS) {
    const fields = m.fields.filter(f => f.slot === slot.key);
    const observations = m.evidence.filter(e => e.slot === slot.key);
    insist(fields.length === 1 && observations.length === 1, 'FIELD_DUPLICATE');
    const f = fields[0], e = observations[0];
    exactKeys(f, ['slot', 'state', 'value', 'confidence', 'evidenceIds']);
    const expectedEvidence = evidenceFor(slot, e.rawText, m.capture);
    insist(stable(e) === stable(expectedEvidence) && !seen.has(e.id), 'EVIDENCE_BINDING'); seen.add(e.id);
    const expectedField = { slot: slot.key, ...interpret(slot, e.rawText), evidenceIds: [e.id] };
    insist(stable(f) === stable(expectedField), 'FIELD_EVIDENCE_MISMATCH');
    if (slot.path.startsWith('enemy.')) {
      const key = `${slot.enemyId}/${slot.path}`;
      if (repeated.has(key)) insist(repeated.get(key) === e.rawText, 'ENEMY_CONFLICT');
      repeated.set(key, e.rawText);
    }
  }
  insist(Array.isArray(m.uninterpreted) && m.uninterpreted.length <= 8, 'UNINTERPRETED_FORMAT');
  for (const [i, effect] of m.uninterpreted.entries()) {
    exactKeys(effect, ['id', 'captureId', 'revision', 'enemyId', 'attackId', 'conditionId', 'rawText']);
    insist(effect.id === `fixture:${m.capture.id}:uninterpreted:${i}` && effect.captureId === m.capture.id && effect.revision === m.capture.revision, 'EFFECT_REVISION');
    insist(TARGETS.some(t => t.enemyId === effect.enemyId && t.attackId === effect.attackId && t.conditionId === effect.conditionId)
      && safeText(effect.rawText) && effect.rawText.length > 0, 'EFFECT_BINDING');
  }
  insist(stable(m.fullCheck) === stable({ status: 'failed', code: 'INCOMPLETE_STAGE' }), 'FULL_CLASSIFICATION');
  // This first prototype only stores stages with a missing per-Super count.
  // No full package can be re-labelled as partial to avoid its existing gate.
  insist(m.fields.find(f => f.slot === 'hit-0/attack.maxPerTurn').state !== 'known', 'NOT_PARTIAL');
  return m;
}

export async function calculatePartial(input, output, defender, core, target = PRIMARY) {
  let m;
  try { m = await validatePartialMaterial(input); }
  catch (error) { return { output, status: 'blocked', scope: 'この1発を受けた場合', reasons: [{ code: error.code ?? 'MATERIAL_INVALID', message: `材料の根拠検査で停止しました：${error.code ?? 'MATERIAL_INVALID'}` }] }; }
  const index = m.targets.findIndex(t => stable(t) === stable(target));
  if (index < 0) return { output, status: 'blocked', reasons: [{ code: 'TARGET_BINDING', message: '対象攻撃を確認できません。' }] };
  const field = path => {
    const { slot, ...f } = m.fields.find(f => f.slot === `hit-${index}/${path}`);
    return f;
  };
  const hpMin = field('condition.hpMinPercent'), hpMax = field('condition.hpMaxPercent');
  if (hpMin.state !== 'known' || hpMax.state !== 'known' || hpMin.value !== 0 || hpMax.value !== 100) {
    return { output, status: hpMin.state !== 'known' || hpMax.state !== 'known' ? 'blocked' : 'unsupported',
      scope: 'この1発を受けた場合', reasons: [{ code: 'CONDITION_SCOPE', message: '第1prototypeはHP 0～100%の明示条件だけを扱います。' }] };
  }
  // Owner/fixture defender settings are a separate input, never source evidence.
  const setting = key => defender?.[key] === undefined
    ? { state: 'unknown', value: null, evidenceIds: [], confidence: 'unconfirmed' }
    : { state: 'known', value: defender[key], evidenceIds: [`fixture:explicit-defender:${key}`], confidence: 'high' };
  const verified = {
    purpose: 'self-authored-single-hit-fixture', enemy: { alignment: field('enemy.alignment'), type: field('enemy.type') },
    attack: { id: target.attackId, displayedDamage: field('attack.displayedDamage'), maxPerTurn: field('attack.maxPerTurn'), targetMode: field('attack.targetMode'),
      critical: { enabled: field('attack.critical.enabled'), attackUp: field('attack.critical.attackUp'), defenseIgnore: field('attack.critical.defenseIgnore') } },
    condition: { id: target.conditionId, atkBasis: field('condition.atkBasis') },
    effectAudit: { coverage: field('effectAudit.coverage'), unresolved: m.uninterpreted.filter(e => e.attackId === target.attackId).map(e => ({ evidenceId: e.id, affects: [...SINGLE_HIT_OUTPUTS] })) },
    defender: Object.fromEntries(['alignment', 'type', 'finalDefense', 'reduction', 'guard', 'typeDefense'].map(key => [key, setting(key)])),
    targetDamage: setting('targetDamage')
  };
  const result = evaluateSingleHit(verified, output, core);
  return { ...result, materialDigest: m.contentDigest, captureId: m.capture.id, revision: m.capture.revision, interpretationVersion: m.versions.interpretation };
}
