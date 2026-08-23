(function migrationTarget(root) {
  'use strict';
  const nonce = new URLSearchParams(location.search).get('nonce');
  const output = document.querySelector('#target-result');
  const allowed = new Set(['dokkan_calc_data_v22', 'dokkan_crit_overrides']);

  async function digest(text) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return `sha256:${[...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  root.addEventListener('message', async (event) => {
    if (event.source !== root.opener || event.data?.type !== 'phase7-migration-payload' || event.data?.nonce !== nonce) return;
    const packageValue = event.data.package;
    const keys = Object.keys(packageValue?.payload || {});
    let status = 'rejected';
    if (packageValue?.schemaVersion === '1.0.0' && keys.every((key) => allowed.has(key)) && !keys.includes('dokkan_github_pat')) {
      const sorted = JSON.stringify(Object.fromEntries(Object.entries(packageValue.payload).sort(([left], [right]) => left.localeCompare(right, 'en'))));
      if (await digest(sorted) === packageValue.payloadDigest) {
        for (const [key, value] of Object.entries(packageValue.payload)) localStorage.setItem(`phase7_prototype_imported_${key}`, value);
        localStorage.setItem('phase7_prototype_migration_digest', packageValue.payloadDigest);
        status = 'imported';
      }
    }
    output.textContent = status === 'imported' ? '架空保存データを安全に受け取りました。' : '検査に失敗したため移行しませんでした。';
    root.opener.postMessage({ type: 'phase7-migration-complete', nonce, status, patPresent: localStorage.getItem('phase7_prototype_imported_dokkan_github_pat') != null }, event.origin === 'null' ? '*' : event.origin);
  });
  if (root.opener && nonce) root.opener.postMessage({ type: 'phase7-migration-ready', nonce }, '*');
})(globalThis);
