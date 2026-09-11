import { validatePartialMaterial } from './phase11-partial-material.mjs';
import { insist, stable } from './phase11-partial-rules.mjs';

export const PARTIAL_DB = 'dokkan-phase11-partial-OFFLINE-PROTOTYPE-v1';
const result = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('DB transaction aborted')); });
const empty = () => ({ version: 2, generation: 0, history: [], position: -1 });
const oldHead = head => head && head.version === 1
  && Number.isSafeInteger(head.generation) && head.generation >= 0
  && Object.keys(head).sort().join(',') === 'current,generation,previous,version';
const currentKey = head => head.position < 0 ? null : head.history[head.position];
const previousKey = head => head.position > 0 ? head.history[head.position - 1] : null;
function validateHead(head) {
  insist(head && head.version === 2 && Number.isSafeInteger(head.generation) && head.generation >= 0
    && Object.keys(head).sort().join(',') === 'generation,history,position,version'
    && Array.isArray(head.history) && head.history.every(key => /^sha256:[a-f0-9]{64}$/.test(key))
    && new Set(head.history).size === head.history.length
    && Number.isSafeInteger(head.position) && head.position >= -1 && head.position < head.history.length
    && (head.history.length === 0) === (head.position === -1), 'DB_HEAD');
  return head;
}

/** Isolated, one-stage proof. Immutable material first, verified active pointer second. */
export class PartialMaterialStore {
  constructor({ indexedDB = globalThis.indexedDB, name = PARTIAL_DB } = {}) {
    insist(indexedDB && (name === PARTIAL_DB || name.startsWith(`${PARTIAL_DB}-test-`)), 'DB_SCOPE');
    this.indexedDB = indexedDB; this.name = name; this.db = null;
  }
  async open() {
    if (!this.db) {
      const req = this.indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('materials'); req.result.createObjectStore('head'); };
      this.db = await result(req); this.db.onversionchange = () => this.close();
    }
    return this.db;
  }
  async read(store, key) {
    const tx = (await this.open()).transaction(store, 'readonly'), finished = done(tx);
    const value = await result(tx.objectStore(store).get(key)); await finished; return value;
  }
  async readMaterial(key) {
    if (key === null) return null;
    const m = await validatePartialMaterial(await this.read('materials', key));
    insist(m.contentDigest === key, 'DB_READ_BACK'); return m;
  }
  async migrateHead(raw) {
    const history = [raw.previous, raw.current].filter(key => key !== null);
    const migrated = { version: 2, generation: raw.generation, history, position: history.length - 1 };
    const tx = (await this.open()).transaction('head', 'readwrite'), finished = done(tx);
    const store = tx.objectStore('head'), req = store.get('active'); let conflict = false;
    req.onsuccess = () => {
      if (stable(req.result) !== stable(raw)) { conflict = true; tx.abort(); return; }
      store.put(migrated, 'active');
    };
    try { await finished; } catch (error) { if (conflict) return null; throw error; }
    return migrated;
  }
  async readHead() {
    for (;;) {
      const raw = await this.read('head', 'active');
      if (raw === undefined) return empty();
      if (oldHead(raw)) {
        const migrated = await this.migrateHead(raw);
        if (migrated) return validateHead(migrated);
        continue;
      }
      return validateHead(raw);
    }
  }
  async load() {
    const head = await this.readHead();
    return { head, current: await this.readMaterial(currentKey(head)), previous: await this.readMaterial(previousKey(head)) };
  }
  async activate(expected, next) {
    validateHead(expected); validateHead(next);
    const tx = (await this.open()).transaction('head', 'readwrite'), finished = done(tx);
    const store = tx.objectStore('head'), req = store.get('active'); let conflict = false;
    req.onsuccess = () => {
      if (stable(req.result ?? empty()) !== stable(expected)) { conflict = true; tx.abort(); return; }
      store.put(next, 'active');
    };
    try { await finished; } catch (error) { if (conflict) insist(false, 'STALE_SAVE'); throw error; }
  }
  async save(input) {
    const material = await validatePartialMaterial(input);
    const before = await this.load();
    if (before.current?.contentDigest === material.contentDigest) return { ...before, duplicate: true, readBackVerified: true };
    if (before.current) insist(material.capture.revision > before.current.capture.revision && material.capture.id !== before.current.capture.id, 'REVISION_CONFLICT');
    const tx = (await this.open()).transaction('materials', 'readwrite'), finished = done(tx);
    tx.objectStore('materials').put(material, material.contentDigest); await finished;
    // A failure here leaves the active head unchanged, rather than claiming a save.
    const verified = await this.readMaterial(material.contentDigest);
    insist(stable(verified) === stable(material), 'DB_READ_BACK');
    const history = [...before.head.history.slice(0, before.head.position + 1), material.contentDigest];
    await this.activate(before.head, { version: 2, generation: before.head.generation + 1, history, position: history.length - 1 });
    const after = await this.load(); insist(currentKey(after.head) === material.contentDigest, 'STALE_SAVE');
    return { ...after, duplicate: false, readBackVerified: true };
  }
  async rollback() {
    const before = await this.load(); insist(before.head.position > 0, 'NO_ROLLBACK');
    // Move the current position back only. A later save truncates the abandoned forward branch.
    await this.activate(before.head, { ...before.head, generation: before.head.generation + 1, position: before.head.position - 1 });
    return this.load();
  }
  close() { this.db?.close(); this.db = null; }
}
