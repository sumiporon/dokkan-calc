import { importSavedDataMigrationPackage } from '../../src/prototype/phase7-saved-data-migration.mjs';

const params = new URLSearchParams(location.search);
const nonce = params.get('nonce');
const expectedSourceOrigin = params.get('sourceOrigin');
const output = document.querySelector('#target-status');
let readyTimer = null;

function announceReady() {
  globalThis.opener?.postMessage({ type: 'phase8-migration-ready', nonce }, '*');
}

globalThis.addEventListener('message', async (event) => {
  if (event.source !== globalThis.opener || event.data?.type !== 'phase8-migration-payload' || event.data?.nonce !== nonce) return;
  if (expectedSourceOrigin && event.origin !== expectedSourceOrigin) return;
  clearInterval(readyTimer);
  const result = await importSavedDataMigrationPackage(localStorage, event.data.package, {
    markerKey: 'migration_marker_v1',
    backupPrefix: 'migration_backup_',
    targetPrefix: 'dokkan_phase8_rc_imported_'
  });
  const accepted = result.status === 'imported' || result.status === 'unchanged';
  output.textContent = accepted ? '保存データを安全に受け取りました。GitHub PATは移していません。' : '検査に失敗したため移行しませんでした。元のデータはそのままです。';
  output.classList.toggle('error', !accepted);
  globalThis.__phase8MigrationTargetResult = result;
  globalThis.opener.postMessage({ type: 'phase8-migration-complete', nonce, status: result.status, patPresent: localStorage.getItem('dokkan_phase8_rc_imported_dokkan_github_pat') != null }, event.origin === 'null' ? '*' : event.origin);
});

if (globalThis.opener && nonce) {
  announceReady();
  readyTimer = setInterval(announceReady, 250);
  setTimeout(() => clearInterval(readyTimer), 10_000);
}
