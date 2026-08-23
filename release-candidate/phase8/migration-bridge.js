(function phase8MigrationBridge(root) {
  'use strict';
  const allowedKeys = ['dokkan_calc_data_v22', 'dokkan_crit_overrides'];
  const params = new URLSearchParams(location.search);
  const targetUrl = params.get('target') || 'migration-target.html';
  const nonce = root.crypto.randomUUID();
  const status = document.querySelector('#migration-status');

  async function digest(text) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return 'sha256:' + [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  function payloadFromStorage() {
    if (root.__PHASE8_SYNTHETIC_MIGRATION__ === true) return {
      dokkan_calc_data_v22: JSON.stringify({ durabilityLines: [{ name: '架空の完封目安', value: 0 }], savedCharacters: [{ name: '架空の保存キャラクター', scenarios: [] }], savedEnemies: [], currentScenarios: [], theme: 'dark' }),
      dokkan_crit_overrides: JSON.stringify({ 'preview:enemy': { critAtkUp: 200, critDefDown: 100 } })
    };
    const payload = {};
    for (const key of allowedKeys) {
      const value = localStorage.getItem(key);
      if (value != null) payload[key] = value;
    }
    return payload;
  }

  async function migrationPackage() {
    const payload = payloadFromStorage();
    const sorted = JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([left], [right]) => left.localeCompare(right, 'en'))));
    return {
      schemaVersion: '1.0.0', exportedAt: new Date().toISOString(), sourceApplicationVersion: root.__PHASE8_SYNTHETIC_MIGRATION__ === true ? 'phase8-fictional-device-check' : 'legacy-v22', payload,
      payloadDigest: await digest(sorted), excludedKeys: ['dokkan_github_pat'], note: 'Allowlisted calculator data only. PAT and unknown keys excluded.'
    };
  }

  document.querySelector('#migration-button').addEventListener('click', () => {
    const target = new URL(targetUrl, location.href);
    target.searchParams.set('nonce', nonce);
    target.searchParams.set('sourceOrigin', location.protocol === 'file:' ? 'null' : location.origin);
    let popup;
    const listener = async (event) => {
      if (event.data?.nonce !== nonce || (popup && event.source !== popup)) return;
      if (event.data.type === 'phase8-migration-ready') {
        popup = event.source;
        const packageValue = await migrationPackage();
        popup.postMessage({ type: 'phase8-migration-payload', nonce, package: packageValue }, target.origin === 'null' ? '*' : target.origin);
      } else if (event.data.type === 'phase8-migration-complete') {
        const accepted = event.data.status === 'imported' || event.data.status === 'unchanged';
        status.textContent = accepted ? '保存データの移行が完了しました。GitHub PATは移していません。' : '移行できませんでした。元の保存データはそのままです。';
        status.classList.toggle('error', !accepted);
        root.__phase8MigrationResult = event.data;
        root.removeEventListener('message', listener);
      }
    };
    root.addEventListener('message', listener);
    popup = root.open(target.href, 'phase8-pages-migration');
    if (!popup) {
      root.removeEventListener('message', listener);
      status.textContent = 'Pages画面を開けませんでした。popupを許可してもう一度お試しください。';
      status.classList.add('error');
    } else status.textContent = 'Pages確認版を開いています…';
  });
})(globalThis);
