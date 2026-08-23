import { importSavedDataMigrationPackage } from '../../src/prototype/phase7-saved-data-migration.mjs';
import { describeImportedStorage } from '../../src/release-candidate/phase8-ui-model.mjs';

const params = new URLSearchParams(location.search);
const nonce = params.get('nonce');
const expectedSourceOrigin = params.get('sourceOrigin');
const output = document.querySelector('#target-status');
const details = document.querySelector('#target-details');
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
  let summary = null;
  if (accepted) {
    try {
      summary = describeImportedStorage(JSON.parse(event.data.package.payload.dokkan_calc_data_v22 || '{}'));
    } catch {
      summary = describeImportedStorage({});
    }
  }
  output.textContent = accepted ? '保存データを安全に受け取りました。GitHub PATは移していません。' : '検査に失敗したため移行しませんでした。元のデータはそのままです。';
  output.classList.toggle('error', !accepted);
  if (summary) {
    const names = summary.characterNames.length ? `（${summary.characterNames.join('、')}）` : '';
    details.textContent = `移行した内容：保存キャラクター ${summary.characters}件${names}、保存済み状況 ${summary.savedScenarios}件、作業中の状況 ${summary.currentScenarios}件、手動敵 ${summary.manualEnemies}件、設定 ${summary.settings}分類。GitHub PATは0件です。イベント・ステージ・配布敵データは増えていません。下のボタンから確認版を開き、「キャラクター管理」で架空名を読み込んでください。`;
  }
  globalThis.__phase8MigrationTargetResult = result;
  globalThis.opener.postMessage({ type: 'phase8-migration-complete', nonce, status: result.status, summary, patPresent: localStorage.getItem('dokkan_phase8_rc_imported_dokkan_github_pat') != null }, event.origin === 'null' ? '*' : event.origin);
});

if (globalThis.opener && nonce) {
  announceReady();
  readyTimer = setInterval(announceReady, 250);
  setTimeout(() => clearInterval(readyTimer), 10_000);
}
