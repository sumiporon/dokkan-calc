import { MemoryReleaseStore, performOneOperationUpdate } from '../../src/prototype/phase7-update-engine.mjs';

const params = new URLSearchParams(location.search);
const dataRoot = params.get('dataRoot') || '../../generated/phase7/prototype-data';
const result = document.querySelector('#update-result');

async function textFromData(relativePath) {
  const response = await fetch(new URL(`${dataRoot}/${relativePath}`, location.href), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

document.querySelector('#update-button').addEventListener('click', async () => {
  globalThis.__phase7UpdateResult = null;
  const mode = document.querySelector('#update-mode').value;
  const scenario = document.querySelector('#failure-scenario').value;
  const manifest = JSON.parse(await textFromData('delivery-manifest.json'));
  const fullRuntime = JSON.parse(await textFromData(manifest.full.json.path));
  const olderRuntime = structuredClone(fullRuntime);
  olderRuntime.datasetId = 'phase7-prototype-older-known-good';
  const store = new MemoryReleaseStore({ datasetVersion: olderRuntime.datasetId, generatedAt: '2020-01-01T00:00:00.000Z', runtime: olderRuntime, payload: { mode: 'full' } });
  if (scenario === 'apply') store.failpoint = 'after-pointer';
  const getText = async (relativePath) => {
    if (scenario === 'missing' && relativePath.startsWith('chunked/chunks/event-')) throw new Error('simulated interrupted transfer');
    const text = await textFromData(relativePath);
    if (scenario === 'digest' && relativePath.endsWith('.json') && relativePath !== 'delivery-manifest.json') return `${text} `;
    return text;
  };
  result.textContent = 'manifest確認から開始しています…';
  const update = await performOneOperationUpdate({
    getText,
    mode,
    store,
    healthCheck: async () => scenario !== 'health'
  });
  result.textContent = `${update.status}: ${update.code} / 現在版 ${store.active?.datasetVersion ?? 'なし'} / known-good ${store.knownGood?.datasetVersion ?? 'なし'}`;
  globalThis.__phase7UpdateResult = update;
});
