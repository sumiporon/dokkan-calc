/** Phase A typed one-tap coordinator. It does not send batches or navigate live sites. */
import { exactKeys, insist, stable } from './phase11-partial-rules.mjs';
import { makeTypedDraft } from './phase11-typed-draft-store.mjs';

export const TYPED_ONE_TAP_SESSION_VERSION = 'phase11-typed-one-tap-session-1';
const clone = value => value == null ? value : structuredClone(value);
const fail = (code, message = code) => { const error = new Error(message); error.code = code; throw error; };

function validatePlan(plan) {
  insist(Array.isArray(plan) && plan.length >= 1 && plan.length <= 20, 'PLAN_INVALID');
  const ids = new Set(), urls = new Set();
  for (const unit of plan) {
    exactKeys(unit, ['id', 'kind', 'stageId', 'url', 'label']);
    insist(unit.kind === 'stage-page' && typeof unit.stageId === 'string' && unit.id === `stage:${unit.stageId}`
      && typeof unit.url === 'string' && typeof unit.label === 'string' && !ids.has(unit.id) && !urls.has(unit.url), 'PLAN_INVALID');
    ids.add(unit.id); urls.add(unit.url);
  }
}
function validateTicket(ticket) {
  exactKeys(ticket, ['sessionId', 'eventId', 'unitId', 'unitUrl', 'revision', 'writerId', 'writerGeneration']);
  insist(typeof ticket.sessionId === 'string' && typeof ticket.eventId === 'string' && typeof ticket.unitId === 'string' && typeof ticket.unitUrl === 'string'
    && typeof ticket.writerId === 'string' && Number.isSafeInteger(ticket.revision) && ticket.revision > 0
    && Number.isSafeInteger(ticket.writerGeneration) && ticket.writerGeneration > 0, 'TICKET_FORMAT');
}
function boundTicket(ticket) {
  return { sessionId: ticket.sessionId, unitId: ticket.unitId, writerId: ticket.writerId,
    writerGeneration: ticket.writerGeneration, sessionRevision: ticket.revision };
}
function validateBoundTicket(ticket) {
  exactKeys(ticket, ['sessionId', 'unitId', 'writerId', 'writerGeneration', 'sessionRevision']);
  insist(typeof ticket.sessionId === 'string' && typeof ticket.unitId === 'string' && typeof ticket.writerId === 'string'
    && Number.isSafeInteger(ticket.writerGeneration) && ticket.writerGeneration > 0
    && Number.isSafeInteger(ticket.sessionRevision) && ticket.sessionRevision > 0, 'TICKET_BINDING');
}
function sameTicket(current, ticket) {
  return current.sessionId === ticket.sessionId && current.eventId === ticket.eventId && current.revision === ticket.revision
    && current.writerId === ticket.writerId && current.writerGeneration === ticket.writerGeneration;
}
function validateDraftEntry(entry, plan) {
  exactKeys(entry, ['classification', 'stageId', 'capture', 'contentDigest', 'draftDigest', 'fingerprint', 'ticket']);
  const unit = plan.find(value => value.stageId === entry.stageId);
  insist(unit && entry.ticket.unitId === unit.id
    && (entry.classification === 'full' || entry.classification === 'partial')
    && typeof entry.contentDigest === 'string' && typeof entry.draftDigest === 'string' && typeof entry.fingerprint === 'string', 'SESSION_DRAFT');
  validateBoundTicket(entry.ticket);
}

export class TypedOneTapSessionCoordinator {
  constructor({ backend, draftStore }) { insist(backend && draftStore, 'SESSION_DEPENDENCY'); this.backend = backend; this.draftStore = draftStore; }

  async load() {
    const value = await this.backend.read(); if (!value) return null;
    exactKeys(value, ['version', 'sessionId', 'eventId', 'eventName', 'plan', 'currentIndex', 'drafts', 'writerId', 'writerGeneration', 'revision', 'status']);
    insist(value.version === TYPED_ONE_TAP_SESSION_VERSION && typeof value.sessionId === 'string' && typeof value.eventId === 'string'
      && typeof value.eventName === 'string' && typeof value.writerId === 'string' && Number.isSafeInteger(value.writerGeneration) && value.writerGeneration > 0
      && Number.isSafeInteger(value.revision) && value.revision > 0 && Number.isSafeInteger(value.currentIndex) && value.currentIndex >= 0 && value.currentIndex <= value.plan.length
      && ['collecting', 'ready-for-final-confirmation'].includes(value.status) && value.drafts && typeof value.drafts === 'object' && !Array.isArray(value.drafts), 'SESSION_FORMAT');
    validatePlan(value.plan);
    for (const [unitId, entry] of Object.entries(value.drafts)) {
      const unit = value.plan.find(item => item.id === unitId); insist(unit, 'SESSION_DRAFT'); validateDraftEntry(entry, value.plan);
      const draft = await this.draftStore.load(entry.draftDigest);
      insist(draft.classification === entry.classification && draft.stageId === entry.stageId && draft.contentDigest === entry.contentDigest
        && stable(draft.capture) === stable(entry.capture) && stable(draft.ticket) === stable(entry.ticket), 'SESSION_DRAFT_READ_BACK');
    }
    return value;
  }
  async persist(next) {
    await this.backend.write(next); const verified = await this.backend.read();
    insist(stable(verified) === stable(next), 'SESSION_SAVE_VERIFY_FAILED');
    return this.load();
  }
  async start({ eventId, eventName, plan, writerId }) {
    insist(typeof eventId === 'string' && typeof eventName === 'string' && typeof writerId === 'string' && writerId.length > 0, 'EVENT_INVALID');
    validatePlan(plan);
    return this.persist({ version: TYPED_ONE_TAP_SESSION_VERSION, sessionId: crypto.randomUUID(), eventId, eventName, plan: clone(plan), currentIndex: 0,
      drafts: {}, writerId, writerGeneration: 1, revision: 1, status: 'collecting' });
  }
  async beginCapture({ writerId, currentUrl }) {
    const current = await this.load(); if (!current) fail('NO_SESSION', '開始済みeventがありません。');
    if (writerId !== current.writerId) fail('WRITER_MISMATCH', 'このタブは書き込み担当ではありません。');
    const unit = current.plan.find(entry => entry.url === currentUrl); if (!unit) fail('EVENT_MISMATCH', '表示中ページは取得計画に含まれていません。');
    return { sessionId: current.sessionId, eventId: current.eventId, unitId: unit.id, unitUrl: unit.url, revision: current.revision, writerId: current.writerId, writerGeneration: current.writerGeneration };
  }
  async commitCapture(ticket, input) {
    validateTicket(ticket); const before = await this.load();
    if (!before || !sameTicket(before, ticket)) fail('STALE_CAPTURE', '古い解析結果は保存しませんでした。');
    const unit = before.plan.find(entry => entry.id === ticket.unitId && entry.url === ticket.unitUrl);
    if (!unit) fail('STALE_CAPTURE', '解析対象が現在の取得計画と一致しません。');
    const prior = before.drafts[unit.id];
    if (prior) {
      if (prior.fingerprint !== input?.fingerprint) fail('CAPTURE_CHANGED', '同じstageの内容が以前のdraftと異なります。');
      return { session: before, duplicate: true, readyForNext: true };
    }
    const prepared = await makeTypedDraft({ ...input, stageId: unit.stageId, ticket: boundTicket(ticket) });
    const typed = await this.draftStore.save(prepared);
    // A payload may have been written, but an old ticket must never alter the active session.
    const latest = await this.load();
    if (!latest || !sameTicket(latest, ticket)) fail('STALE_CAPTURE', '保存中にsessionが変わったため、stageを有効化しませんでした。');
    const entry = { classification: typed.classification, stageId: typed.stageId, capture: typed.capture, contentDigest: typed.contentDigest,
      draftDigest: typed.draftDigest, fingerprint: input.fingerprint, ticket: typed.ticket };
    const drafts = { ...latest.drafts, [unit.id]: entry };
    const firstUnfinished = latest.plan.findIndex(item => !drafts[item.id]);
    const next = { ...latest, drafts, currentIndex: firstUnfinished < 0 ? latest.plan.length : firstUnfinished,
      revision: latest.revision + 1, status: firstUnfinished < 0 ? 'ready-for-final-confirmation' : 'collecting' };
    const saved = await this.persist(next);
    return { session: saved, duplicate: false, readyForNext: true };
  }
  async nextNavigation({ writerId, currentUrl }) {
    const current = await this.load(); if (!current || writerId !== current.writerId) fail('WRITER_MISMATCH', 'このタブからは次へ進めません。');
    const unit = current.plan.find(entry => entry.url === currentUrl);
    if (!unit || !current.drafts[unit.id]) fail('NOT_READY', '検査・保存・照合が完了するまで次へ進めません。');
    await this.draftStore.load(current.drafts[unit.id].draftDigest);
    const index = current.plan.findIndex(entry => entry.id === unit.id);
    if (index < current.plan.length - 1) return { kind: 'navigate', url: current.plan[index + 1].url };
    insist(Object.keys(current.drafts).length === current.plan.length && current.status === 'ready-for-final-confirmation', 'NOT_READY');
    return { kind: 'final-confirmation' };
  }
}
