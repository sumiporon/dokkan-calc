/** Typed one-tap coordinator. It does not send batches or navigate live sites. */
import { digest, exactKeys, insist, stable } from './phase11-partial-rules.mjs';
import { makeTypedDraft, makeUnusableFailure } from './phase11-typed-draft-store.mjs';

export const TYPED_ONE_TAP_SESSION_VERSION = 'phase11-typed-one-tap-session-2';
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
function writerExpectation(value) { return { sessionId: value.sessionId, writerId: value.writerId, writerGeneration: value.writerGeneration, revision: value.revision }; }
function validateWriterExpectation(value) {
  exactKeys(value, ['sessionId', 'writerId', 'writerGeneration', 'revision']);
  insist(typeof value.sessionId === 'string' && typeof value.writerId === 'string' && Number.isSafeInteger(value.writerGeneration)
    && value.writerGeneration > 0 && Number.isSafeInteger(value.revision) && value.revision > 0, 'WRITER_EXPECTATION');
}
function validateDraftEntry(entry, plan) {
  exactKeys(entry, ['classification', 'stageId', 'capture', 'contentDigest', 'draftDigest', 'fingerprint', 'ticket']);
  const unit = plan.find(value => value.stageId === entry.stageId);
  insist(unit && entry.ticket.unitId === unit.id
    && (entry.classification === 'full' || entry.classification === 'partial')
    && typeof entry.contentDigest === 'string' && typeof entry.draftDigest === 'string' && typeof entry.fingerprint === 'string', 'SESSION_DRAFT');
  validateBoundTicket(entry.ticket);
}
function validateFailureEntry(entry, plan) {
  exactKeys(entry, ['stageId', 'planIndex', 'failureDigest', 'ticket']);
  const unit = plan[entry.planIndex];
  insist(unit && unit.stageId === entry.stageId && entry.ticket.unitId === unit.id && typeof entry.failureDigest === 'string', 'SESSION_FAILURE');
  validateBoundTicket(entry.ticket);
}
function expectedCurrentIndex(value) {
  const failed = value.plan.findIndex(unit => value.failures[unit.id]);
  if (failed >= 0) return failed;
  const firstUnfinished = value.plan.findIndex(unit => !value.drafts[unit.id]);
  return firstUnfinished < 0 ? value.plan.length : firstUnfinished;
}
function validateProgress(value) {
  const expected = expectedCurrentIndex(value);
  insist(value.currentIndex === expected, 'SESSION_STAGE_ORDER');
  const failed = value.plan.findIndex(unit => value.failures[unit.id]);
  if (failed >= 0) {
    insist(value.status === 'stopped-unusable', 'SESSION_STAGE_ORDER');
    for (let index = 0; index < value.plan.length; index += 1) {
      const unit = value.plan[index];
      if (index < failed) insist(Boolean(value.drafts[unit.id]) && !value.failures[unit.id], 'SESSION_STAGE_ORDER');
      if (index === failed) insist(!value.drafts[unit.id] && Boolean(value.failures[unit.id]), 'SESSION_STAGE_ORDER');
      if (index > failed) insist(!value.drafts[unit.id] && !value.failures[unit.id], 'SESSION_STAGE_ORDER');
    }
    return;
  }
  insist(value.status !== 'stopped-unusable', 'SESSION_STAGE_ORDER');
  insist((value.status === 'ready-for-final-confirmation') === (expected === value.plan.length), 'SESSION_STAGE_ORDER');
}
function assertDraftMatchesEntry(draft, entry) {
  insist(draft.classification === entry.classification && draft.stageId === entry.stageId && draft.contentDigest === entry.contentDigest
    && stable(draft.capture) === stable(entry.capture) && stable(draft.ticket) === stable(entry.ticket), 'SESSION_DRAFT_READ_BACK');
}
function assertFailureMatchesEntry(failure, entry) {
  insist(failure.classification === 'unusable' && failure.stageId === entry.stageId && failure.planIndex === entry.planIndex
    && failure.failureDigest === entry.failureDigest && stable(failure.ticket) === stable(entry.ticket), 'SESSION_FAILURE_READ_BACK');
}
async function failureCode(task) {
  try { await task(); return null; } catch (error) { return error?.code ?? 'VALIDATION_FAILED'; }
}

export class TypedOneTapSessionCoordinator {
  constructor({ backend, draftStore }) { insist(backend && draftStore, 'SESSION_DEPENDENCY'); this.backend = backend; this.draftStore = draftStore; }

  async load() {
    const value = await this.backend.read(); if (!value) return null;
    exactKeys(value, ['version', 'sessionId', 'eventId', 'eventName', 'plan', 'planDigest', 'currentIndex', 'drafts', 'failures', 'writerId', 'writerGeneration', 'revision', 'status']);
    insist(value.version === TYPED_ONE_TAP_SESSION_VERSION && typeof value.sessionId === 'string' && typeof value.eventId === 'string'
      && typeof value.eventName === 'string' && /^sha256:[a-f0-9]{64}$/.test(value.planDigest) && typeof value.writerId === 'string' && Number.isSafeInteger(value.writerGeneration) && value.writerGeneration > 0
      && Number.isSafeInteger(value.revision) && value.revision > 0 && Number.isSafeInteger(value.currentIndex) && value.currentIndex >= 0 && value.currentIndex <= value.plan.length
      && ['collecting', 'ready-for-final-confirmation', 'stopped-unusable'].includes(value.status) && value.drafts && typeof value.drafts === 'object' && !Array.isArray(value.drafts)
      && value.failures && typeof value.failures === 'object' && !Array.isArray(value.failures), 'SESSION_FORMAT');
    validatePlan(value.plan);
    insist(await digest(value.plan) === value.planDigest, 'PLAN_DIGEST');
    validateProgress(value);
    for (const [unitId, entry] of Object.entries(value.drafts)) {
      const unit = value.plan.find(item => item.id === unitId); insist(unit, 'SESSION_DRAFT'); validateDraftEntry(entry, value.plan);
      const draft = await this.draftStore.load(entry.draftDigest);
      assertDraftMatchesEntry(draft, entry);
    }
    for (const [unitId, entry] of Object.entries(value.failures)) {
      const unit = value.plan.find(item => item.id === unitId); insist(unit, 'SESSION_FAILURE'); validateFailureEntry(entry, value.plan);
      const failure = await this.draftStore.loadFailure(entry.failureDigest);
      assertFailureMatchesEntry(failure, entry);
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
    const savedPlan = clone(plan);
    return this.persist({ version: TYPED_ONE_TAP_SESSION_VERSION, sessionId: crypto.randomUUID(), eventId, eventName, plan: savedPlan, planDigest: await digest(savedPlan), currentIndex: 0,
      drafts: {}, failures: {}, writerId, writerGeneration: 1, revision: 1, status: 'collecting' });
  }
  async beginCapture({ writerId, currentUrl }) {
    const current = await this.load(); if (!current) fail('NO_SESSION', '開始済みeventがありません。');
    if (current.status === 'stopped-unusable') fail('UNUSABLE_STOP', 'このeventは利用不可stageで停止しています。');
    if (writerId !== current.writerId) fail('WRITER_MISMATCH', '別のタブに担当が移っています。');
    const unit = current.plan.find(entry => entry.url === currentUrl); if (!unit) fail('EVENT_MISMATCH', '表示中ページは取得計画に含まれていません。');
    if (unit.id !== current.plan[current.currentIndex]?.id) fail('STAGE_ORDER', '取得計画の順番どおりに進めてください。');
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
    const nextDraftState = { ...latest, drafts };
    const nextIndex = expectedCurrentIndex(nextDraftState);
    const next = { ...nextDraftState, currentIndex: nextIndex,
      revision: latest.revision + 1, status: nextIndex === latest.plan.length ? 'ready-for-final-confirmation' : 'collecting' };
    const saved = await this.persist(next);
    return { session: saved, duplicate: false, readyForNext: true };
  }
  async recordUnusable(ticket, { fullInput, partialInput, ownerMessage, sourceEvidence = null }) {
    validateTicket(ticket); const before = await this.load();
    if (!before || !sameTicket(before, ticket) || before.status === 'stopped-unusable') fail('STALE_CAPTURE', '古い解析結果は保存しませんでした。');
    const unit = before.plan.find(entry => entry.id === ticket.unitId && entry.url === ticket.unitUrl);
    if (!unit || unit.id !== before.plan[before.currentIndex]?.id) fail('STALE_CAPTURE', '解析対象が現在の取得計画と一致しません。');
    const binding = boundTicket(ticket);
    const fullFailureCode = await failureCode(() => makeTypedDraft({ classification: 'full', stageId: unit.stageId, ticket: binding, ...fullInput }));
    const partialFailureCode = await failureCode(() => makeTypedDraft({ classification: 'partial', stageId: unit.stageId, ticket: binding, ...partialInput }));
    if (!fullFailureCode || !partialFailureCode) fail('UNUSABLE_NOT_PROVEN', '完全または部分材料として安全に保存できるため停止しません。');
    const failure = await makeUnusableFailure({ stageId: unit.stageId, planIndex: before.currentIndex, ticket: binding, fullFailureCode, partialFailureCode, ownerMessage, sourceEvidence });
    const savedFailure = await this.draftStore.saveFailure(failure);
    const latest = await this.load();
    if (!latest || !sameTicket(latest, ticket)) fail('STALE_CAPTURE', '保存中にsessionが変わったため、停止状態を有効化しませんでした。');
    const entry = { stageId: savedFailure.stageId, planIndex: savedFailure.planIndex, failureDigest: savedFailure.failureDigest, ticket: savedFailure.ticket };
    const next = { ...latest, failures: { ...latest.failures, [unit.id]: entry }, revision: latest.revision + 1, status: 'stopped-unusable' };
    const saved = await this.persist(next);
    return { session: saved, failure: savedFailure };
  }
  async nextNavigation({ writerId, currentUrl }) {
    const current = await this.load(); if (!current || writerId !== current.writerId) fail('WRITER_MISMATCH', '別のタブに担当が移っています。');
    if (current.status === 'stopped-unusable') fail('UNUSABLE_STOP', '利用不可stageがあるため次へ進めません。');
    const unit = current.plan.find(entry => entry.url === currentUrl);
    if (!unit || !current.drafts[unit.id]) fail('NOT_READY', '検査・保存・照合が完了するまで次へ進めません。');
    await this.draftStore.load(current.drafts[unit.id].draftDigest);
    const index = current.plan.findIndex(entry => entry.id === unit.id);
    if (index < current.plan.length - 1) return { kind: 'navigate', url: current.plan[index + 1].url };
    await this.finalSummary();
    return { kind: 'final-confirmation' };
  }
  async takeover({ writerId, expected }) {
    insist(typeof writerId === 'string' && writerId.length >= 12, 'WRITER_ID');
    validateWriterExpectation(expected); const current = await this.load(); if (!current) fail('NO_SESSION', '開始済みeventがありません。');
    if (stable(expected) !== stable(writerExpectation(current))) fail('SESSION_CONFLICT', '別のタブに担当が移っています。');
    if (current.writerId === writerId) fail('ALREADY_WRITER', 'このタブはすでに担当です。');
    const next = { ...current, writerId, writerGeneration: current.writerGeneration + 1, revision: current.revision + 1 };
    await this.backend.compareAndSwap(current, next);
    const verified = await this.backend.read();
    insist(stable(verified) === stable(next), 'SESSION_TAKEOVER_VERIFY_FAILED');
    return this.load();
  }
  async finalSummary() {
    const current = await this.load();
    if (!current || current.status !== 'ready-for-final-confirmation' || current.currentIndex !== current.plan.length) fail('NOT_READY', '全stageの保存と照合が完了していません。');
    const ordered = [];
    for (const unit of current.plan) {
      const entry = current.drafts[unit.id];
      if (!entry) fail('FINAL_DRAFT_COUNT', '最終集計に必要なstageが保存されていません。');
      const draft = await this.draftStore.load(entry.draftDigest);
      assertDraftMatchesEntry(draft, entry);
      if (draft.stageId !== unit.stageId) fail('FINAL_DRAFT_REFERENCE', 'stageとtyped draftの参照が一致しません。');
      ordered.push({ stageId: draft.stageId, classification: draft.classification, contentDigest: draft.contentDigest, reference: draft.reference });
    }
    const full = ordered.filter(value => value.classification === 'full').length;
    const partial = ordered.filter(value => value.classification === 'partial').length;
    if (full + partial !== current.plan.length || ordered.length !== current.plan.length) fail('FINAL_DRAFT_COUNT', '最終集計とtyped draftが一致しません。');
    return { full, partial, total: ordered.length, ordered };
  }
  async readOnlySummary() {
    const current = await this.load(); if (!current) fail('NO_SESSION', '開始済みeventがありません。');
    const stages = [];
    for (let index = 0; index < current.plan.length; index += 1) {
      const unit = current.plan[index], draftEntry = current.drafts[unit.id], failureEntry = current.failures[unit.id];
      if (draftEntry) {
        const draft = await this.draftStore.load(draftEntry.draftDigest); assertDraftMatchesEntry(draft, draftEntry);
        const f1 = draft.payload?.formatVersion === 'phase11-dokkaninfo-f1-partial-1';
        stages.push({ stageId: unit.stageId, label: unit.label, state: draft.classification, ownerMessage: draft.classification === 'partial' ? (f1 ? '部分材料保存済み・計算可否は未判定です' : '材料のみ保存・現在は計算できません') : '完全データ保存済み' });
      } else if (failureEntry) {
        const failure = await this.draftStore.loadFailure(failureEntry.failureDigest); assertFailureMatchesEntry(failure, failureEntry);
        stages.push({ stageId: unit.stageId, label: unit.label, state: 'unusable', ownerMessage: failure.ownerMessage, stopCode: failure.fullFailureCode });
      } else stages.push({ stageId: unit.stageId, label: unit.label, state: 'unvisited', ownerMessage: '未取得' });
    }
    const full = stages.filter(value => value.state === 'full').length, partial = stages.filter(value => value.state === 'partial').length;
    const unusable = stages.filter(value => value.state === 'unusable').length, unvisited = stages.filter(value => value.state === 'unvisited').length;
    if (full + partial + unusable + unvisited !== current.plan.length) fail('READ_ONLY_COUNT', '確認結果とsessionが一致しません。');
    return { full, partial, unusable, unvisited, total: stages.length, stages };
  }
}
