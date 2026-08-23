import { validatePhase8Manifest, validatePhase8Runtime, verifyArtifactText } from './phase8-manifest.mjs';

const STATE_KEY = 'release-state';

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error);
  });
}

export class Phase8ReleaseStore {
  constructor({ indexedDB = globalThis.indexedDB, dbName = 'dokkan-phase8-rc-releases-v1' } = {}) {
    if (!indexedDB) throw new Error('IndexedDB is unavailable');
    this.indexedDB = indexedDB;
    this.dbName = dbName;
    this.db = null;
    this.active = null;
    this.knownGood = null;
    this.releases = new Map();
    this.failpoint = null;
  }

  async open() {
    if (this.db) return this.db;
    const request = this.indexedDB.open(this.dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('releases')) db.createObjectStore('releases', { keyPath: 'datasetVersion' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    this.db = await requestValue(request);
    return this.db;
  }

  async usable(release) {
    if (!release || validatePhase8Manifest(release.manifest).length > 0 || release.datasetVersion !== release.manifest.datasetVersion) return false;
    if (release.runtime) {
      if (validatePhase8Runtime(release.runtime).length > 0 || typeof release.payload?.text !== 'string') return false;
      if (!(await verifyArtifactText(release.payload.text, release.manifest.full.json)).valid) return false;
    }
    return true;
  }

  async initialize(seedRelease = null) {
    const db = await this.open();
    const transaction = db.transaction(['releases', 'meta'], 'readonly');
    const done = transactionDone(transaction);
    const releases = transaction.objectStore('releases');
    const meta = await requestValue(transaction.objectStore('meta').get(STATE_KEY));
    const active = meta?.activeVersion ? await requestValue(releases.get(meta.activeVersion)) : null;
    const knownGood = meta?.knownGoodVersion ? await requestValue(releases.get(meta.knownGoodVersion)) : null;
    const retained = await requestValue(releases.getAll());
    await done;
    const activeUsable = await this.usable(active);
    const knownGoodUsable = await this.usable(knownGood);
    let recovery = 'stored-active';
    if (activeUsable) {
      this.active = active;
      this.knownGood = knownGoodUsable ? knownGood : active;
    } else if (knownGoodUsable) {
      this.active = knownGood;
      this.knownGood = knownGood;
      recovery = 'known-good-restored';
    } else {
      const fallbackCandidates = retained
        .filter((release) => release?.datasetVersion !== active?.datasetVersion && release?.datasetVersion !== knownGood?.datasetVersion)
        .sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt));
      let fallback = null;
      for (const release of fallbackCandidates) {
        if (await this.usable(release)) {
          fallback = release;
          break;
        }
      }
      if (fallback) {
        this.active = fallback;
        this.knownGood = fallback;
        recovery = 'retained-release-restored';
      } else if (await this.usable(seedRelease)) {
        this.active = seedRelease;
        this.knownGood = seedRelease;
        recovery = meta ? 'bundled-seed-restored' : 'bundled-seed-initialized';
      } else {
        throw new Error('利用できるknown-good releaseがありません。');
      }
    }
    this.releases = new Map(retained.map((release) => [release.datasetVersion, release]));
    this.releases.set(this.active.datasetVersion, this.active);
    this.releases.set(this.knownGood.datasetVersion, this.knownGood);
    if (recovery !== 'stored-active' || !knownGoodUsable) await this.persistKnownGood(this.active, this.knownGood);
    return { recovery, activeVersion: this.active.datasetVersion, knownGoodVersion: this.knownGood.datasetVersion };
  }

  snapshot() {
    return { active: this.active, knownGood: this.knownGood, releases: new Map(this.releases) };
  }

  restore(snapshot) {
    this.active = snapshot.active;
    this.knownGood = snapshot.knownGood;
    this.releases = new Map(snapshot.releases);
  }

  async commit(release) {
    if (this.failpoint === 'before-pointer') throw new Error('simulated failure before candidate pointer');
    this.releases.set(release.datasetVersion, release);
    this.active = release;
    if (this.failpoint === 'after-pointer') throw new Error('simulated failure after candidate pointer');
  }

  async persistKnownGood(active, knownGood) {
    const db = await this.open();
    const transaction = db.transaction(['releases', 'meta'], 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('releases').put(active);
    transaction.objectStore('releases').put(knownGood);
    transaction.objectStore('meta').put({ activeVersion: active.datasetVersion, knownGoodVersion: knownGood.datasetVersion }, STATE_KEY);
    await done;
    await this.pruneReleases(new Set([active.datasetVersion, knownGood.datasetVersion]), 2);
  }

  async pruneReleases(protectedVersions, retainCount) {
    const db = await this.open();
    const read = db.transaction('releases', 'readonly');
    const readDone = transactionDone(read);
    const releases = await requestValue(read.objectStore('releases').getAll());
    await readDone;
    const keep = new Set(protectedVersions);
    for (const release of releases.sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt))) {
      if (keep.size >= retainCount) break;
      keep.add(release.datasetVersion);
    }
    const remove = releases.filter((release) => !keep.has(release.datasetVersion));
    if (remove.length === 0) return;
    const write = db.transaction('releases', 'readwrite');
    const writeDone = transactionDone(write);
    for (const release of remove) write.objectStore('releases').delete(release.datasetVersion);
    await writeDone;
    for (const release of remove) this.releases.delete(release.datasetVersion);
  }

  async markKnownGood(release) {
    if (this.failpoint === 'before-persist') throw new Error('simulated persistent apply failure');
    await this.persistKnownGood(release, release);
    this.knownGood = release;
  }

  async corruptActiveForTest() {
    const db = await this.open();
    const broken = { ...this.active, payload: { ...this.active.payload, text: '{broken' } };
    const transaction = db.transaction('releases', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('releases').put(broken);
    await done;
  }

  async deleteKnownGoodForTest() {
    const db = await this.open();
    const transaction = db.transaction('releases', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('releases').delete(this.knownGood.datasetVersion);
    await done;
  }

  async resetForTest() {
    this.db?.close();
    this.db = null;
    await requestValue(this.indexedDB.deleteDatabase(this.dbName));
  }
}
