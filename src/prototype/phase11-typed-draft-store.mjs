/**
 * A typed draft is never a canonical package unless its
 * classification is full. Payload, typed reference, and session are written
 * in separate verified steps so a failed later step cannot replace a session.
 */
import { validatePackage } from './phase11-intake.mjs';
import { validatePartialMaterial } from './phase11-partial-material.mjs';
import { digest, exactKeys, insist, stable } from './phase11-partial-rules.mjs';

export const TYPED_DRAFT_FORMAT = 'phase11-typed-stage-draft-1';
export const UNUSABLE_FAILURE_FORMAT = 'phase11-unusable-stage-failure-1';
export const TYPED_DRAFT_DATABASE = 'dokkan-phase11-typed-one-tap-PROTOTYPE-v2';
const result = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('prototype保存に失敗しました。')); });
const clone = value => value == null ? value : structuredClone(value);
const fail = (code, message = code) => { const error = new Error(message); error.code = code; throw error; };
const stores = db => {
  if (!db.objectStoreNames.contains('payloads')) db.createObjectStore('payloads');
  if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts');
  if (!db.objectStoreNames.contains('failures')) db.createObjectStore('failures');
  if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions');
};

function validateCapture(capture) {
  exactKeys(capture, ['id', 'revision', 'observedAt']);
  insist(/^fictional-capture-[A-Za-z0-9-]{1,100}$/.test(capture.id) && Number.isSafeInteger(capture.revision) && capture.revision > 0
    && typeof capture.observedAt === 'string' && Number.isFinite(Date.parse(capture.observedAt)), 'CAPTURE_VERSION');
}
function validateTicketBinding(binding) {
  exactKeys(binding, ['sessionId', 'unitId', 'writerId', 'writerGeneration', 'sessionRevision']);
  insist(typeof binding.sessionId === 'string' && typeof binding.unitId === 'string' && typeof binding.writerId === 'string'
    && Number.isSafeInteger(binding.writerGeneration) && binding.writerGeneration > 0
    && Number.isSafeInteger(binding.sessionRevision) && binding.sessionRevision > 0, 'TICKET_BINDING');
}
function stageFromFull(pack) {
  const stage = pack.canonical?.events?.[0]?.stages?.[0];
  return typeof stage?.id === 'string' ? stage.id.split(':').at(-1) : null;
}
async function validatePayload(classification, payload, expectedDigest) {
  if (classification === 'full') {
    await validatePackage(payload);
    insist(payload.digest === expectedDigest, 'PAYLOAD_DIGEST');
    return payload;
  }
  if (classification === 'partial') {
    const material = await validatePartialMaterial(payload);
    insist(material.contentDigest === expectedDigest, 'PAYLOAD_DIGEST');
    return material;
  }
  fail('DRAFT_CLASSIFICATION');
}

export async function makeTypedDraft({ classification, stageId, capture, ticket, package: pack, material }) {
  insist(classification === 'full' || classification === 'partial', 'DRAFT_CLASSIFICATION');
  insist(typeof stageId === 'string' && stageId.length > 0, 'DRAFT_STAGE');
  validateCapture(capture); validateTicketBinding(ticket);
  insist(ticket.unitId === `stage:${stageId}`, 'TICKET_STAGE');
  insist((classification === 'full') === Boolean(pack) && (classification === 'partial') === Boolean(material), 'DRAFT_PAYLOAD');
  const payload = await validatePayload(classification, classification === 'full' ? pack : material,
    classification === 'full' ? pack?.digest : material?.contentDigest);
  const contentDigest = classification === 'full' ? payload.digest : payload.contentDigest;
  if (classification === 'full') insist(stageFromFull(payload) === stageId, 'DRAFT_STAGE');
  if (classification === 'partial') insist(payload.source.stageId === stageId && stable(payload.capture) === stable(capture), 'DRAFT_STAGE');
  const reference = { kind: classification === 'full' ? 'full-package' : 'partial-material', contentDigest };
  const core = { formatVersion: TYPED_DRAFT_FORMAT, classification, stageId, capture: clone(capture), contentDigest, reference, ticket: clone(ticket) };
  return { ...core, draftDigest: await digest(core), payload: clone(payload) };
}

export async function validateTypedDraft(input) {
  const value = clone(input); exactKeys(value, ['formatVersion', 'classification', 'stageId', 'capture', 'contentDigest', 'reference', 'ticket', 'draftDigest', 'payload']);
  insist(value.formatVersion === TYPED_DRAFT_FORMAT && (value.classification === 'full' || value.classification === 'partial')
    && typeof value.stageId === 'string' && /^sha256:[a-f0-9]{64}$/.test(value.contentDigest)
    && /^sha256:[a-f0-9]{64}$/.test(value.draftDigest), 'DRAFT_FORMAT');
  validateCapture(value.capture); validateTicketBinding(value.ticket);
  exactKeys(value.reference, ['kind', 'contentDigest']);
  insist(value.reference.kind === (value.classification === 'full' ? 'full-package' : 'partial-material')
    && value.reference.contentDigest === value.contentDigest, 'DRAFT_REFERENCE');
  const { draftDigest, payload, ...core } = value;
  insist(await digest(core) === draftDigest, 'DRAFT_DIGEST');
  await validatePayload(value.classification, payload, value.contentDigest);
  if (value.classification === 'full') insist(stageFromFull(payload) === value.stageId, 'DRAFT_STAGE');
  else insist(payload.source.stageId === value.stageId && stable(payload.capture) === stable(value.capture), 'DRAFT_STAGE');
  return value;
}

function validateFailureCode(value) { insist(typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,100}$/.test(value), 'UNUSABLE_FAILURE_CODE'); }
export async function makeUnusableFailure({ stageId, planIndex, ticket, fullFailureCode, partialFailureCode, ownerMessage }) {
  insist(typeof stageId === 'string' && stageId.length > 0 && Number.isSafeInteger(planIndex) && planIndex >= 0, 'UNUSABLE_FAILURE_FORMAT');
  validateTicketBinding(ticket); insist(ticket.unitId === `stage:${stageId}`, 'UNUSABLE_FAILURE_STAGE');
  validateFailureCode(fullFailureCode); validateFailureCode(partialFailureCode);
  insist(typeof ownerMessage === 'string' && ownerMessage.length > 0 && ownerMessage.length <= 180, 'UNUSABLE_FAILURE_MESSAGE');
  const core = { formatVersion: UNUSABLE_FAILURE_FORMAT, classification: 'unusable', stageId, planIndex, ticket: clone(ticket),
    fullFailureCode, partialFailureCode, ownerMessage };
  return { ...core, failureDigest: await digest(core) };
}
export async function validateUnusableFailure(input) {
  const value = clone(input); exactKeys(value, ['formatVersion', 'classification', 'stageId', 'planIndex', 'ticket', 'fullFailureCode', 'partialFailureCode', 'ownerMessage', 'failureDigest']);
  insist(value.formatVersion === UNUSABLE_FAILURE_FORMAT && value.classification === 'unusable' && typeof value.stageId === 'string'
    && Number.isSafeInteger(value.planIndex) && value.planIndex >= 0 && /^sha256:[a-f0-9]{64}$/.test(value.failureDigest), 'UNUSABLE_FAILURE_FORMAT');
  validateTicketBinding(value.ticket); insist(value.ticket.unitId === `stage:${value.stageId}`, 'UNUSABLE_FAILURE_STAGE');
  validateFailureCode(value.fullFailureCode); validateFailureCode(value.partialFailureCode);
  insist(typeof value.ownerMessage === 'string' && value.ownerMessage.length > 0 && value.ownerMessage.length <= 180, 'UNUSABLE_FAILURE_MESSAGE');
  const { failureDigest, ...core } = value; insist(await digest(core) === failureDigest, 'UNUSABLE_FAILURE_DIGEST');
  return value;
}

class BaseTypedDraftStore {
  async save(input) {
    const draft = await validateTypedDraft(input);
    await this.writePayload(draft.contentDigest, { classification: draft.classification, payload: draft.payload });
    const payload = await this.readPayload(draft.contentDigest);
    await validatePayload(payload?.classification, payload?.payload, draft.contentDigest);
    insist(stable(payload) === stable({ classification: draft.classification, payload: draft.payload }), 'PAYLOAD_READ_BACK');
    const stored = { ...draft }; delete stored.payload;
    await this.writeDraft(draft.draftDigest, stored);
    const verified = await this.readDraft(draft.draftDigest);
    return validateTypedDraft({ ...verified, payload: payload.payload });
  }
  async load(draftDigest) {
    const stored = await this.readDraft(draftDigest);
    insist(stored, 'DRAFT_MISSING');
    const payload = await this.readPayload(stored.contentDigest);
    insist(payload, 'PAYLOAD_MISSING');
    return validateTypedDraft({ ...stored, payload: payload.payload });
  }
  async saveFailure(input) {
    const failure = await validateUnusableFailure(input);
    await this.writeFailure(failure.failureDigest, failure);
    const verified = await this.readFailure(failure.failureDigest);
    return validateUnusableFailure(verified);
  }
  async loadFailure(failureDigest) {
    const stored = await this.readFailure(failureDigest); insist(stored, 'UNUSABLE_FAILURE_MISSING');
    return validateUnusableFailure(stored);
  }
}

export class MemoryTypedDraftStore extends BaseTypedDraftStore {
  constructor() { super(); this.payloads = new Map(); this.drafts = new Map(); this.failures = new Map(); this.failPayloadWrites = false; this.failDraftWrites = false; this.failFailureWrites = false; this.tamperNextPayloadKey = null; this.tamperNextDraftRead = false; this.tamperNextFailureRead = false; }
  async writePayload(key, value) { if (this.failPayloadWrites) fail('PAYLOAD_SAVE_FAILED'); this.payloads.set(key, clone(value)); }
  async readPayload(key) {
    const value = clone(this.payloads.get(key));
    if (value && this.tamperNextPayloadKey === key) {
      this.tamperNextPayloadKey = null;
      value.payload = value.classification === 'partial'
        ? { ...value.payload, contentDigest: 'sha256:' + '0'.repeat(64) }
        : { ...value.payload, digest: 'sha256:' + '0'.repeat(64) };
    }
    return value;
  }
  async writeDraft(key, value) { if (this.failDraftWrites) fail('TYPED_DRAFT_SAVE_FAILED'); this.drafts.set(key, clone(value)); }
  async readDraft(key) { const value = clone(this.drafts.get(key)); if (value && this.tamperNextDraftRead) { this.tamperNextDraftRead = false; value.draftDigest = 'sha256:' + '0'.repeat(64); } return value; }
  async writeFailure(key, value) { if (this.failFailureWrites) fail('UNUSABLE_FAILURE_SAVE_FAILED'); this.failures.set(key, clone(value)); }
  async readFailure(key) { const value = clone(this.failures.get(key)); if (value && this.tamperNextFailureRead) { this.tamperNextFailureRead = false; value.stageId = 'tampered-stage'; } return value; }
}

export class IndexedDbTypedDraftStore extends BaseTypedDraftStore {
  constructor({ indexedDB = globalThis.indexedDB, name = TYPED_DRAFT_DATABASE } = {}) {
    super();
    insist(indexedDB && (name === TYPED_DRAFT_DATABASE || name.startsWith(`${TYPED_DRAFT_DATABASE}-test-`)), 'DB_SCOPE');
    this.indexedDB = indexedDB; this.name = name; this.db = null;
  }
  async open() {
    if (!this.db) { const request = this.indexedDB.open(this.name, 1); request.onupgradeneeded = () => stores(request.result); this.db = await result(request); this.db.onversionchange = () => this.close(); }
    return this.db;
  }
  async write(store, key, value) { const tx = (await this.open()).transaction(store, 'readwrite'), finished = done(tx); tx.objectStore(store).put(clone(value), key); await finished; }
  async read(store, key) { const tx = (await this.open()).transaction(store, 'readonly'), finished = done(tx); const value = await result(tx.objectStore(store).get(key)); await finished; return value ?? null; }
  async writePayload(key, value) { return this.write('payloads', key, value); }
  async readPayload(key) { return this.read('payloads', key); }
  async writeDraft(key, value) { return this.write('drafts', key, value); }
  async readDraft(key) { return this.read('drafts', key); }
  async writeFailure(key, value) { return this.write('failures', key, value); }
  async readFailure(key) { return this.read('failures', key); }
  close() { this.db?.close(); this.db = null; }
}

export class IndexedDbTypedSessionBackend {
  constructor({ indexedDB = globalThis.indexedDB, name = TYPED_DRAFT_DATABASE, key = 'active' } = {}) {
    insist(indexedDB && (name === TYPED_DRAFT_DATABASE || name.startsWith(`${TYPED_DRAFT_DATABASE}-test-`)), 'DB_SCOPE');
    this.indexedDB = indexedDB; this.name = name; this.key = key; this.db = null; this.failWrites = false;
  }
  async open() {
    if (!this.db) { const request = this.indexedDB.open(this.name, 1); request.onupgradeneeded = () => stores(request.result); this.db = await result(request); this.db.onversionchange = () => this.close(); }
    return this.db;
  }
  async read() { const tx = (await this.open()).transaction('sessions', 'readonly'), finished = done(tx); const value = await result(tx.objectStore('sessions').get(this.key)); await finished; return value ?? null; }
  async write(value) { if (this.failWrites) fail('SESSION_SAVE_FAILED'); const tx = (await this.open()).transaction('sessions', 'readwrite'), finished = done(tx); tx.objectStore('sessions').put(clone(value), this.key); await finished; }
  async compareAndSwap(expected, value) {
    if (this.failWrites) fail('SESSION_SAVE_FAILED');
    const tx = (await this.open()).transaction('sessions', 'readwrite'), finished = done(tx), store = tx.objectStore('sessions');
    const current = await result(store.get(this.key));
    if (!current || stable(current) !== stable(expected)) { tx.abort(); try { await finished; } catch {} fail('SESSION_CONFLICT'); }
    store.put(clone(value), this.key); await finished;
  }
  close() { this.db?.close(); this.db = null; }
}

export class MemoryTypedSessionBackend {
  constructor(value = null) { this.value = clone(value); this.failWrites = false; this.tamperReads = false; }
  async read() { const value = clone(this.value); if (value && this.tamperReads) value.revision += 1; return value; }
  async write(value) { if (this.failWrites) fail('SESSION_SAVE_FAILED'); this.value = clone(value); }
  async compareAndSwap(expected, value) { if (this.failWrites) fail('SESSION_SAVE_FAILED'); if (stable(this.value) !== stable(expected)) fail('SESSION_CONFLICT'); this.value = clone(value); }
}
