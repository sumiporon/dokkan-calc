import { DATABASE_NAME, makeSnapshot, validateSnapshot, checkApply } from './phase11-intake.mjs';
import { requireIntake } from './phase11-file.mjs';

const resultOf = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const finished = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('保存を完了できませんでした。')); });
/** Temporary, isolated IndexedDB. No production/localStorage/cache access. */
export class PrototypeStore {
  constructor({ indexedDB = globalThis.indexedDB, name = DATABASE_NAME } = {}) {
    requireIntake(name === DATABASE_NAME || name.startsWith(`${DATABASE_NAME}-test-`), 'DB_SCOPE', '試作以外の保存領域は利用できません。');
    requireIntake(indexedDB, 'DB_UNAVAILABLE', 'この開き方では端末内保存を利用できません。対応するブラウザで開いてください。');
    this.indexedDB = indexedDB; this.name = name; this.db = null;
  }
  async open() {
    if (!this.db) {
      const request = this.indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('trial-state');
      this.db = await resultOf(request);
      this.db.onversionchange = () => this.db.close();
    }
    return this.db;
  }
  async read() {
    const db = await this.open(); const tx = db.transaction('trial-state', 'readonly'); const done = finished(tx);
    const state = await resultOf(tx.objectStore('trial-state').get('state')); await done;
    return state;
  }
  async load() {
    const saved = await this.read();
    if (!saved) return { current: await makeSnapshot([]), previous: null, recovery: 'new' };
    try { await validateSnapshot(saved.current); return { ...saved, recovery: 'restored' }; }
    catch {
      if (saved.previous) {
        await validateSnapshot(saved.previous);
        return { current: saved.previous, previous: null, recovery: 'previous-recovered', corruptDigest: saved.current?.digest ?? null };
      }
      throw new Error('試作保存が壊れています。自動で初期化・上書きはしていません。');
    }
  }
  async write(current, expectedDigest, previous, { failBeforeCommit = false } = {}) {
    const db = await this.open();
    const tx = db.transaction('trial-state', 'readwrite'); const done = finished(tx);
    const store = tx.objectStore('trial-state');
    const request = store.get('state'); let reason;
    request.onsuccess = () => {
      const old = request.result;
      const actual = old?.current?.digest ?? null;
      if (actual !== expectedDigest) { reason = new Error('別の画面で保存内容が変わりました。再読み込みしてください。'); tx.abort(); return; }
      store.put({ current, previous }, 'state');
      if (failBeforeCommit) { reason = new Error('test-only atomic failure'); tx.abort(); }
    };
    try { await done; } catch (error) { throw reason ?? error; }
  }
  async apply(prepared, official, options) {
    const state = await this.load();
    const next = await checkApply(prepared, state.current, official);
    const saved = await this.read();
    // load/read may race; CAS in write catches a competing tab after this read.
    const expected = state.recovery === 'new' ? null : state.recovery === 'previous-recovered' ? state.corruptDigest : state.current.digest;
    requireIntake((saved?.current?.digest ?? null) === expected, 'STALE_PREVIEW', '保存が変わりました。再読み込みしてください。');
    await this.write(next, saved?.current?.digest ?? null, state.current, options);
    return this.load();
  }
  async rollback() {
    const state = await this.load();
    requireIntake(state.previous, 'NO_ROLLBACK', '戻せる試作データはまだありません。');
    await validateSnapshot(state.previous);
    await this.write(state.previous, state.current.digest, state.current);
    return this.load();
  }
  async clearAll() {
    const state = await this.load();
    if (state.current.packages.length === 0) return state;
    const saved = await this.read();
    const expected = state.recovery === 'previous-recovered' ? state.corruptDigest : state.current.digest;
    requireIntake(saved?.current?.digest === expected, 'STALE_PREVIEW', '保存が変わりました。再読み込みしてください。');
    const empty = await makeSnapshot([]);
    // Keep the removed personal snapshot as the one-step rollback point. The
    // active view is nevertheless production-only immediately after commit.
    await this.write(empty, expected, state.current);
    return this.load();
  }
  close() { this.db?.close(); this.db = null; }
}
