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
      dokkan_calc_data_v22: JSON.stringify({
        durabilityLines: [{ name: '完封', value: 0 }, { name: '架空50万', value: 500000 }],
        savedCharacters: [
          { name: '架空の保存キャラクターA', scenarios: [{ scenario_title: '架空Aの基準状況', char_def: '100000', passive: '100', own_class: 'super', own_type: 'teq', attr_def_up: '10' }] },
          { name: '架空の保存キャラクターB', scenarios: [{ scenario_title: '架空Bのガード状況', char_def: '200000', passive: '50', own_class: 'extreme', own_type: 'agl', is_guard: true }] }
        ],
        savedEnemies: [{ eventType: '架空の手動敵', series: [{ seriesName: '架空シリーズ', stages: [{ stageName: '架空ステージ', bosses: [{ name: '架空の手動保存敵', class: 'extreme', type: 'str', baseAtk: 300000, attacks: [{ name: '通常', value: 300000 }, { name: '必殺', value: 900000 }] }] }] }] }],
        currentScenarios: [{ scenario_title: '架空の作業中状況', char_def: '150000', dr_input: '30', own_class: 'super', own_type: 'phy' }],
        theme: 'dark'
      }),
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
        status.textContent = accepted ? '架空保存データの移行が完了しました。GitHub PATは移していません。' : '移行できませんでした。元の保存データはそのままです。';
        status.classList.toggle('error', !accepted);
        const details = document.querySelector('#migration-result-details');
        if (accepted && details && event.data.summary) {
          const summary = event.data.summary;
          details.textContent = `移行結果：保存キャラクター${summary.characters}件、保存済み状況${summary.savedScenarios}件、作業中の状況${summary.currentScenarios}件、手動敵${summary.manualEnemies}件、設定${summary.settings}分類、会心補正${summary.criticalOverrides}件。GitHub PATは移行していません。イベント・ステージ・配布敵データは増えていません。開いた確認版の「計算する状況」で作業中カードを確認してください。`;
        }
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
