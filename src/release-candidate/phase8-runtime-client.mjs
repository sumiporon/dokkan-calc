import { performOneOperationUpdate } from '../prototype/phase7-update-engine.mjs';
import { validatePhase8Index, validatePhase8Manifest, validatePhase8Runtime, verifyArtifactText } from './phase8-manifest.mjs';

const METRICS_KEY = 'dokkan_phase8_rc_update_history_v1';

function releaseFromManifest(manifest) {
  return { datasetVersion: manifest.datasetVersion, generatedAt: manifest.generatedAt, manifest, runtime: null, counts: manifest.counts, payload: { mode: 'manifest-seed' } };
}

export class Phase8RuntimeClient {
  constructor({ dataRoot = './data', store, fetchImpl = globalThis.fetch.bind(globalThis), cacheStorage = globalThis.caches, storage = globalThis.localStorage, locationHref = globalThis.location?.href } = {}) {
    this.dataRoot = dataRoot.replace(/\/$/, '');
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.cacheStorage = cacheStorage;
    this.storage = storage;
    this.locationHref = locationHref;
    this.manifest = null;
    this.index = null;
    this.eventCache = new Map();
    this.metrics = { cacheHits: 0, networkLoads: 0, corruptCacheEntries: 0 };
  }

  url(relativePath) {
    return new URL(`${this.dataRoot}/${relativePath}`, this.locationHref).href;
  }

  async networkText(relativePath) {
    const response = await this.fetchImpl(this.url(relativePath), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    this.metrics.networkLoads += 1;
    return response.text();
  }

  async fetchCandidateManifest() {
    const manifest = JSON.parse(await this.networkText('release-manifest.json'));
    const errors = validatePhase8Manifest(manifest);
    if (errors.length > 0) throw new Error(errors.join(' / '));
    return manifest;
  }

  async readVerified(descriptor) {
    const url = this.url(descriptor.path);
    const key = `${url}?phase8Digest=${encodeURIComponent(descriptor.digest)}`;
    const cache = this.cacheStorage ? await this.cacheStorage.open('dokkan-phase8-rc-artifacts-v1') : null;
    const cached = cache ? await cache.match(key) : null;
    if (cached) {
      const text = await cached.text();
      if ((await verifyArtifactText(text, descriptor)).valid) {
        this.metrics.cacheHits += 1;
        return text;
      }
      this.metrics.corruptCacheEntries += 1;
      await cache.delete(key);
    }
    const text = await this.networkText(descriptor.path);
    const verified = await verifyArtifactText(text, descriptor);
    if (!verified.valid) throw new Error(`${verified.code}: ${descriptor.path}`);
    if (cache) await cache.put(key, new Response(text, { headers: { 'Content-Type': descriptor.contentType } }));
    return text;
  }

  async loadIndex(manifest = this.manifest) {
    const text = await this.readVerified(manifest.chunked.indexJson);
    const index = JSON.parse(text);
    const errors = validatePhase8Index(index, manifest);
    if (errors.length > 0) throw new Error(errors.join(' / '));
    if (manifest === this.manifest) this.index = index;
    return index;
  }

  async initialize() {
    let candidate = null;
    try {
      candidate = await this.fetchCandidateManifest();
    } catch {
      // Stored known-good may still be usable. A visible friendly error is left to the UI only if it is not.
    }
    const recovery = await this.store.initialize(candidate ? releaseFromManifest(candidate) : null);
    this.manifest = this.store.active.manifest;
    await this.loadIndex();
    return recovery;
  }

  async event(eventId) {
    if (this.eventCache.has(eventId)) return this.eventCache.get(eventId);
    const entry = this.index.events.find((item) => item.id === eventId);
    if (!entry) return null;
    const text = await this.readVerified(entry.json);
    const event = JSON.parse(text);
    if (event.id !== eventId || !Array.isArray(event.stages)) throw new Error('EVENT_CHUNK_INVALID');
    this.eventCache.set(eventId, event);
    if (this.eventCache.size > 3) this.eventCache.delete(this.eventCache.keys().next().value);
    return event;
  }

  recordUpdate(result) {
    let history = [];
    try {
      const saved = JSON.parse(this.storage.getItem(METRICS_KEY) || '[]');
      if (Array.isArray(saved)) history = saved;
    } catch {}
    history.push({ at: new Date().toISOString(), status: result.status, code: result.code, version: result.activeVersion ?? result.retainedVersion ?? null, milliseconds: Math.round(result.milliseconds ?? 0) });
    this.storage.setItem(METRICS_KEY, JSON.stringify(history.slice(-50)));
  }

  async update() {
    const getText = (relativePath) => relativePath === 'release-manifest.json'
      ? this.networkText(relativePath)
      : this.networkText(relativePath);
    const result = await performOneOperationUpdate({
      getText,
      manifestPath: 'release-manifest.json',
      mode: 'full',
      store: this.store,
      appVersion: 'phase8-rc-1',
      manifestValidator: validatePhase8Manifest,
      runtimeValidator: validatePhase8Runtime,
      healthCheck: async (release) => {
        try {
          const index = await this.loadIndex(release.manifest);
          return index.events.length === release.counts.events;
        } catch {
          return false;
        }
      }
    });
    this.recordUpdate(result);
    if (result.status === 'applied') {
      this.manifest = this.store.active.manifest;
      this.index = await this.loadIndex();
      this.eventCache.clear();
    }
    return result;
  }
}
