(function migrationSource(root) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const targetUrl = params.get('target') || 'migration-target.html';
  const nonce = root.crypto.randomUUID();
  const result = document.querySelector('#migration-result');
  const fakePayload = {
    dokkan_calc_data_v22: JSON.stringify({ durabilityLines: [{ name: '完封', value: 0 }], savedCharacters: [{ name: '架空キャラ', scenarios: [] }], savedEnemies: [], currentScenarios: [], theme: 'dark' }),
    dokkan_crit_overrides: JSON.stringify({ '架空_event_stage_enemy': { critAtkUp: 200, critDefDown: 100 } })
  };

  async function digest(text) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return `sha256:${[...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  async function migrationPackage() {
    const sorted = JSON.stringify(Object.fromEntries(Object.entries(fakePayload).sort(([left], [right]) => left.localeCompare(right, 'en'))));
    return { schemaVersion: '1.0.0', exportedAt: new Date().toISOString(), sourceApplicationVersion: 'phase7-fake-source', payload: fakePayload, payloadDigest: await digest(sorted), excludedKeys: ['dokkan_github_pat'], note: 'fake data only' };
  }
  const packagePromise = migrationPackage();

  document.querySelector('#migration-button').addEventListener('click', async () => {
    const target = new URL(targetUrl, location.href);
    target.searchParams.set('nonce', nonce);
    let popup;
    const listener = async (event) => {
      if (event.source !== popup || event.data?.nonce !== nonce) return;
      if (event.data.type === 'phase7-migration-ready') {
        const payload = await packagePromise;
        popup.postMessage({ type: 'phase7-migration-payload', nonce, package: payload }, target.origin);
      } else if (event.data.type === 'phase7-migration-complete') {
        result.textContent = event.data.status === 'imported' ? '1回の移行に成功しました。PATは移していません。' : `移行停止: ${event.data.status}`;
        root.__phase7MigrationResult = event.data;
        root.removeEventListener('message', listener);
      }
    };
    root.addEventListener('message', listener);
    popup = root.open(target.href, 'phase7-migration-target');
    if (!popup) {
      root.removeEventListener('message', listener);
      result.textContent = '移行画面を開けませんでした。';
    }
  });
})(globalThis);
