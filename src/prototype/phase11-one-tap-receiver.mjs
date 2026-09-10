/** Isolated calculator-side receiver for the one-tap prototype. */
import { describe, makeSnapshot, validatePackage, validateSnapshot, reviewSnapshots } from './phase11-intake.mjs';
import { PrototypeStore } from './phase11-store.mjs';
import { requireIntake } from './phase11-file.mjs';
import { stableJson } from '../data-migration/phase4-enemy-migration.ts';

export const RECEIVER_DATABASE_NAME = 'dokkan-phase11-one-tap-receiver-PROTOTYPE-v1';
const resultOf = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const finished = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('受領状態を保存できませんでした。')); });

export async function validateOneTapBatch(batch) {
  requireIntake(batch?.version === 'phase11-one-tap-batch-1' && typeof batch.batchId === 'string'
    && /^[-a-zA-Z0-9]{8,80}$/.test(batch.batchId) && batch.sourceKey === 'manual-dokkaninfo'
    && typeof batch.eventId === 'string' && Array.isArray(batch.packages) && batch.packages.length > 0 && batch.packages.length <= 200,
  'BATCH_FORMAT', '受け渡されたevent batchの形式が不正です。');
  const keys = new Set();
  for (const pack of batch.packages) {
    await validatePackage(pack);
    requireIntake(pack.canonical.events.length === 1 && pack.canonical.events[0].id === `jpnja:event:${batch.eventId}`, 'BATCH_EVENT', 'event batchとstage packageのevent IDが一致しません。');
    requireIntake(!keys.has(pack.stageKey), 'BATCH_DUPLICATE_STAGE', 'event batch内でstageが重複しています。');
    keys.add(pack.stageKey);
  }
  const core = { version: batch.version, batchId: batch.batchId, sourceKey: batch.sourceKey, eventId: batch.eventId, packages: batch.packages };
  requireIntake((await describe(stableJson(core))).digest === batch.digest, 'BATCH_DIGEST', 'event batchのハッシュが一致しません。');
  return batch;
}

export class BatchReceiverStore {
  constructor({ indexedDB = globalThis.indexedDB, name = RECEIVER_DATABASE_NAME, official, personalStore = null } = {}) {
    requireIntake(indexedDB, 'DB_UNAVAILABLE', 'このブラウザでは受領保存を利用できません。');
    requireIntake(name === RECEIVER_DATABASE_NAME || name.startsWith(`${RECEIVER_DATABASE_NAME}-test-`), 'DB_SCOPE', 'prototype以外の受領領域は利用できません。');
    this.indexedDB = indexedDB; this.name = name; this.official = official;
    this.personalStore = personalStore ?? new PrototypeStore({ indexedDB });
    this.db = null;
  }
  async open() {
    if (!this.db) {
      const request = this.indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('batches', { keyPath: 'batchId' });
      this.db = await resultOf(request); this.db.onversionchange = () => this.db.close();
    }
    return this.db;
  }
  async get(batchId) {
    const db = await this.open(); const tx = db.transaction('batches', 'readonly'); const done = finished(tx);
    const value = await resultOf(tx.objectStore('batches').get(batchId)); await done; return value ?? null;
  }
  async put(value) {
    const db = await this.open(); const tx = db.transaction('batches', 'readwrite'); const done = finished(tx);
    tx.objectStore('batches').put(value); await done; return this.get(value.batchId);
  }
  async receive(batch) {
    await validateOneTapBatch(batch);
    const prior = await this.get(batch.batchId);
    requireIntake(!prior || prior.digest === batch.digest, 'BATCH_CONFLICT', '同じbatch IDで異なる内容は受領しません。');
    if (prior) return { record: prior, duplicate: true };
    const current = await this.personalStore.load();
    const merged = new Map(current.current.packages.map((pack) => [pack.stageKey, pack]));
    for (const pack of batch.packages) merged.set(pack.stageKey, pack);
    const snapshot = await makeSnapshot([...merged.values()]); await validateSnapshot(snapshot);
    const review = reviewSnapshots(snapshot, current.current, this.official);
    const record = await this.put({
      batchId: batch.batchId, digest: batch.digest, state: 'received', receivedAt: new Date().toISOString(),
      batch, baseDigest: current.current.digest, snapshot, review
    });
    return { record, duplicate: false };
  }
  async markReviewed(batchId) {
    const record = await this.get(batchId);
    requireIntake(record && record.state !== 'applied', 'BATCH_STATE', '受領済みbatchを確認できません。');
    return this.put({ ...record, state: 'reviewed', reviewedAt: record.reviewedAt ?? new Date().toISOString() });
  }
  async apply(batchId) {
    const record = await this.get(batchId);
    requireIntake(record, 'BATCH_STATE', '受領済みbatchを確認できません。');
    if (record.state === 'applied') return { record, duplicate: true, personal: await this.personalStore.load() };
    requireIntake(record.state === 'reviewed', 'BATCH_NOT_REVIEWED', 'owner review後に適用してください。');
    requireIntake(record.review.status !== 'hard-fail', 'BATCH_BLOCKED', '安全検査で停止しているbatchは適用できません。');
    const personal = await this.personalStore.load();
    requireIntake(personal.current.digest === record.baseDigest, 'STALE_PREVIEW', '個人保存が受領後に変わりました。batchを送り直してください。');
    const prepared = { status: 'ready', baseDigest: record.baseDigest, snapshot: record.snapshot };
    const saved = await this.personalStore.apply(prepared, this.official);
    const applied = await this.put({ ...record, state: 'applied', appliedAt: new Date().toISOString(), appliedDigest: saved.current.digest });
    return { record: applied, duplicate: false, personal: saved };
  }
  async rollback(batchId) {
    const record = await this.get(batchId);
    requireIntake(record?.state === 'applied', 'BATCH_STATE', 'このbatchから戻せる適用状態がありません。');
    const personal = await this.personalStore.rollback();
    const restored = await this.put({ ...record, state: 'reviewed', rolledBackAt: new Date().toISOString(), appliedAt: null, appliedDigest: null, baseDigest: personal.current.digest });
    return { record: restored, personal };
  }
  close() { this.db?.close(); this.db = null; this.personalStore?.close(); }
}
