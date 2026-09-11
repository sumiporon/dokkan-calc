/**
 * Read-only typed inspection boundary.  This is deliberately separate from
 * phase11-one-tap-receiver.mjs: mixed full/partial/unusable material is never
 * a calculator intake batch and can never be applied from this receiver.
 */
import { validatePackage } from './phase11-intake.mjs';
import { validatePartialMaterial } from './phase11-partial-material.mjs';
import { validateTypedDraft, validateUnusableFailure } from './phase11-typed-draft-store.mjs';
import { digest, exactKeys, insist, stable } from './phase11-partial-rules.mjs';

export const TYPED_INSPECTION_BATCH_KIND = 'phase11-typed-inspection-batch';
export const TYPED_INSPECTION_BATCH_VERSION = 'phase11-typed-inspection-batch-1';
const clone = value => value == null ? value : structuredClone(value);

function validatePlan(plan) {
  insist(Array.isArray(plan) && plan.length >= 1 && plan.length <= 20, 'INSPECTION_PLAN');
  const ids = new Set(), urls = new Set();
  for (const unit of plan) {
    exactKeys(unit, ['id', 'kind', 'stageId', 'url', 'label']);
    insist(unit.kind === 'stage-page' && unit.id === `stage:${unit.stageId}` && typeof unit.stageId === 'string'
      && typeof unit.url === 'string' && typeof unit.label === 'string' && !ids.has(unit.id) && !urls.has(unit.url), 'INSPECTION_PLAN');
    ids.add(unit.id); urls.add(unit.url);
  }
}
function validateSessionIdentity(value) {
  exactKeys(value, ['sessionId', 'writerId', 'writerGeneration', 'revision', 'status']);
  insist(typeof value.sessionId === 'string' && typeof value.writerId === 'string'
    && Number.isSafeInteger(value.writerGeneration) && value.writerGeneration > 0
    && Number.isSafeInteger(value.revision) && value.revision > 0
    && ['collecting', 'ready-for-final-confirmation', 'stopped-unusable'].includes(value.status), 'INSPECTION_SESSION');
}
function stageFromFull(pack) {
  const event = pack?.canonical?.events?.[0], stage = event?.stages?.[0];
  return { eventId: typeof event?.id === 'string' ? event.id.replace(/^jpnja:event:/, '') : null,
    stageId: typeof stage?.id === 'string' ? stage.id.split(':').at(-1) : null };
}
function validateStageEnvelope(entry, unit, index) {
  insist(entry?.stageId === unit.stageId && entry.planIndex === index && typeof entry.classification === 'string', 'INSPECTION_STAGE');
}
async function validateStoredDraft(draft, unit, batch) {
  const verified = await validateTypedDraft(draft);
  insist(verified.stageId === unit.stageId && verified.ticket.unitId === unit.id && verified.ticket.sessionId === batch.session.sessionId, 'INSPECTION_DRAFT');
  if (verified.classification === 'full') {
    const pack = await validatePackage(verified.payload), owner = stageFromFull(pack);
    insist(owner.eventId === batch.eventId && owner.stageId === unit.stageId, 'INSPECTION_FULL_OWNERSHIP');
  } else {
    const material = await validatePartialMaterial(verified.payload);
    insist(material.source.eventId === batch.eventId && material.source.stageId === unit.stageId
      && stable(material.capture) === stable(verified.capture), 'INSPECTION_PARTIAL_OWNERSHIP');
  }
  return verified;
}
async function validateStage(entry, unit, index, batch) {
  validateStageEnvelope(entry, unit, index);
  if (entry.classification === 'full' || entry.classification === 'partial') {
    exactKeys(entry, ['stageId', 'planIndex', 'classification', 'draft']);
    const draft = await validateStoredDraft(entry.draft, unit, batch);
    insist(draft.classification === entry.classification, 'INSPECTION_CLASSIFICATION');
    return { stageId: unit.stageId, label: unit.label, classification: entry.classification, draft };
  }
  if (entry.classification === 'unusable') {
    exactKeys(entry, ['stageId', 'planIndex', 'classification', 'failure']);
    const failure = await validateUnusableFailure(entry.failure);
    insist(failure.stageId === unit.stageId && failure.planIndex === index && failure.ticket.unitId === unit.id
      && failure.ticket.sessionId === batch.session.sessionId, 'INSPECTION_FAILURE');
    return { stageId: unit.stageId, label: unit.label, classification: 'unusable', failure };
  }
  if (entry.classification === 'unvisited') {
    exactKeys(entry, ['stageId', 'planIndex', 'classification']);
    return { stageId: unit.stageId, label: unit.label, classification: 'unvisited' };
  }
  insist(false, 'INSPECTION_CLASSIFICATION');
}
function countsFor(stages) {
  const counts = Object.fromEntries(['full', 'partial', 'unusable', 'unvisited'].map(key => [key, stages.filter(stage => (stage.classification ?? stage.state) === key).length]));
  return { ...counts, total: stages.length };
}

/**
 * Contract validation used by both producer and receiver.  Each call clones
 * and validates the complete batch; a review never trusts a prior save.
 */
export async function validateTypedInspectionBatch(input) {
  const batch = clone(input);
  exactKeys(batch, ['kind', 'formatVersion', 'eventId', 'eventName', 'session', 'plan', 'planDigest', 'stages', 'counts', 'batchDigest']);
  insist(batch.kind === TYPED_INSPECTION_BATCH_KIND && batch.formatVersion === TYPED_INSPECTION_BATCH_VERSION
    && typeof batch.eventId === 'string' && typeof batch.eventName === 'string' && /^sha256:[a-f0-9]{64}$/.test(batch.planDigest)
    && /^sha256:[a-f0-9]{64}$/.test(batch.batchDigest), 'INSPECTION_FORMAT');
  validateSessionIdentity(batch.session); validatePlan(batch.plan);
  insist(await digest(batch.plan) === batch.planDigest && Array.isArray(batch.stages) && batch.stages.length === batch.plan.length, 'INSPECTION_PLAN_DIGEST');
  const seen = new Set(), stages = [];
  for (let index = 0; index < batch.plan.length; index += 1) {
    const unit = batch.plan[index], entry = batch.stages[index];
    insist(!seen.has(entry?.stageId), 'INSPECTION_STAGE_DUPLICATE'); seen.add(entry.stageId);
    stages.push(await validateStage(entry, unit, index, batch));
  }
  const counts = countsFor(stages);
  exactKeys(batch.counts, ['full', 'partial', 'unusable', 'unvisited', 'total']);
  insist(stable(batch.counts) === stable(counts), 'INSPECTION_COUNT');
  const { batchDigest, ...core } = batch;
  insist(await digest(core) === batchDigest, 'INSPECTION_BATCH_DIGEST');
  return batch;
}

/** Generate an immutable transfer record only after reloading all source state. */
export async function createTypedInspectionBatch({ session }) {
  insist(session?.draftStore && typeof session.load === 'function', 'INSPECTION_DEPENDENCY');
  const current = await session.load();
  insist(current, 'NO_SESSION');
  const stages = [];
  for (let index = 0; index < current.plan.length; index += 1) {
    const unit = current.plan[index], draftEntry = current.drafts[unit.id], failureEntry = current.failures[unit.id];
    if (draftEntry) {
      const draft = await session.draftStore.load(draftEntry.draftDigest);
      // load() already did this once; the duplicate check closes the boundary
      // between session validation and batch construction.
      insist(draft.draftDigest === draftEntry.draftDigest && draft.classification === draftEntry.classification
        && draft.stageId === unit.stageId && stable(draft.capture) === stable(draftEntry.capture), 'INSPECTION_DRAFT');
      stages.push({ stageId: unit.stageId, planIndex: index, classification: draft.classification, draft });
    } else if (failureEntry) {
      const failure = await session.draftStore.loadFailure(failureEntry.failureDigest);
      insist(failure.failureDigest === failureEntry.failureDigest && failure.stageId === unit.stageId && failure.planIndex === index, 'INSPECTION_FAILURE');
      stages.push({ stageId: unit.stageId, planIndex: index, classification: 'unusable', failure });
    } else stages.push({ stageId: unit.stageId, planIndex: index, classification: 'unvisited' });
  }
  const sessionIdentity = { sessionId: current.sessionId, writerId: current.writerId, writerGeneration: current.writerGeneration,
    revision: current.revision, status: current.status };
  const core = { kind: TYPED_INSPECTION_BATCH_KIND, formatVersion: TYPED_INSPECTION_BATCH_VERSION,
    eventId: current.eventId, eventName: current.eventName, session: sessionIdentity, plan: clone(current.plan),
    planDigest: current.planDigest, stages, counts: countsFor(stages) };
  return validateTypedInspectionBatch({ ...core, batchDigest: await digest(core) });
}

/** Separate, read-only receiver; it performs no persistence and exposes no apply API. */
export class TypedInspectionReceiver {
  async receive(batch) {
    const verified = await validateTypedInspectionBatch(batch);
    const stages = verified.stages.map((stage, index) => {
      const unit = verified.plan[index];
      if (stage.classification === 'full') return { stageId: unit.stageId, label: unit.label, state: 'full', ownerMessage: '完全データ保存済み' };
      if (stage.classification === 'partial') return { stageId: unit.stageId, label: unit.label, state: 'partial', ownerMessage: '材料のみ保存・現在は計算できません', capabilityCandidates: 0 };
      if (stage.classification === 'unusable') return { stageId: unit.stageId, label: unit.label, state: 'unusable', ownerMessage: stage.failure.ownerMessage };
      return { stageId: unit.stageId, label: unit.label, state: 'unvisited', ownerMessage: '未取得' };
    });
    return { batchDigest: verified.batchDigest, eventId: verified.eventId, eventName: verified.eventName, counts: countsFor(stages), stages };
  }
}
