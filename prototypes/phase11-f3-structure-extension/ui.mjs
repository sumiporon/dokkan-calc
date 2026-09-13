import { createStructureDiagnostic } from '../../src/prototype/phase11-f3-structure-diagnostic.mjs';

const states = { detected: '検出', blank: '空欄', 'non-empty-unparsed': '表示あり・意味未解釈', missing: '欄が見つかりません', ambiguous: '対応が曖昧です' };
const fields = {
  'event-stage-identity': 'event / stage識別候補', 'encounter-root': '戦闘区画候補',
  'enemy-root': '敵欄候補', 'unowned-enemy-root': '所属不明の敵欄候補', 'enemy-name': '敵名',
  'type-class-candidate': '属性・区分候補', hp: 'HP', atk: 'ATK', def: 'DEF',
  'enemy-wide-count': '敵全体の攻撃回数', 'skill-region': 'スキル領域',
  'super-root': '必殺欄候補', 'super-name': '必殺名', 'super-atk': '必殺ダメージ表示',
  probability: '確率', 'super-specific-count': '必殺固有の最大ATK/ターン', reuse: '再使用',
  'hp-condition': 'HP条件', 'orphan-condition': '所属不明のHP条件',
  'ai-region': 'AI領域', 'aoe-region': 'AOE領域'
};
const scopeText = parent => Object.entries(parent).map(([key, ordinal]) =>
  `${({ encounter: '戦闘区画', enemy: '敵', attack: '必殺', condition: '条件', region: '領域', candidate: '候補' })[key] ?? key} ${ordinal + 1}`).join(' / ');
const stopReasons = {
  DIAGNOSTIC_URL: '対象stageのURLが一致しないため停止しました。',
  DIAGNOSTIC_URL_CHANGED: '取得中にページのURLが変わったため停止しました。',
  DIAGNOSTIC_ALREADY_RUN: 'このページでの診断は実行済みです。',
  DIAGNOSTIC_SNAPSHOT_LIMIT: 'ページの大きさが診断範囲を超えています。',
  DIAGNOSTIC_NODE_LIMIT: 'ページの要素数が診断範囲を超えています。',
  DIAGNOSTIC_PATH_LIMIT: 'ページの構造が深すぎるため停止しました。',
  DIAGNOSTIC_RECORD_LIMIT: '観測候補の数が診断範囲を超えています。',
  DIAGNOSTIC_OUTPUT_LIMIT: '診断結果の大きさが上限を超えています。'
};

/** Only bounded result text remains in this UI. No background, messages or persistence. */
export function mountDiagnostic(expected) {
  if (document.getElementById('f3-structure-ui')) return;
  const host = document.createElement('section'); host.id = 'f3-structure-ui';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;display:block;position:relative;z-index:2147483647;color:#eef3ff;background:#142033;font:15px/1.5 system-ui;text-align:left;color-scheme:dark}
    *{box-sizing:border-box}section{max-width:850px;margin:auto;padding:16px}h1{font-size:21px;margin:0 0 12px}h2{font-size:18px}p{overflow-wrap:anywhere}
    button{font:inherit;min-height:48px;width:100%;margin:6px 0;padding:12px;border:1px solid #93b8ed;border-radius:6px;background:#285da0;color:white;cursor:pointer}button:disabled{opacity:.55;cursor:default}
    textarea{width:100%;height:200px;font:12px/1.4 monospace;background:#0d1420;color:#edf3ff;border:1px solid #789;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere}
    li{margin:8px 0;overflow-wrap:anywhere}ul{padding-left:20px}.muted,summary{color:#b8cae3;font-size:13px}details{overflow-wrap:anywhere}strong{font-weight:700}`;
  root.append(style);
  const section = document.createElement('section'); root.append(section);
  const add = (tag, text, parent = section) => { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; };
  const title = add('h1', 'stage構造の限定確認');
  const status = add('p', 'ボタンを押す前は取得・診断・保存を行いません。'); status.setAttribute('role', 'status');
  add('p', '診断結果はこの画面だけに保持します。ページを閉じると失われます。コピーした結果は貼り付け先に残ります。');
  const runButton = add('button', 'このstageの構造を確認'); runButton.type = 'button';
  const resultPanel = add('div', ''); resultPanel.id = 'diagnostic-result';
  // Mounting creates controls only. Readers are invoked exclusively by run().
  const runner = createStructureDiagnostic({ expectedUrl: expected.url, expectedEventId: expected.eventId, expectedStageId: expected.stageId,
    readUrl: () => location.href, readOuterHTML: () => document.documentElement.outerHTML });
  runButton.addEventListener('click', async event => {
    if (!event.isTrusted || runButton.disabled) return;
    runButton.disabled = true; status.textContent = '表示済みのページを確認しています。';
    try {
      const result = await runner.run();
      title.textContent = result.issues.length ? '構造を安全に判定できませんでした' : '構造診断が完了しました';
      status.textContent = 'raw HTMLは保存していません。計算・取込判定なし。ページ全体のcoverageは未確定です。';
      add('h2', '構造診断結果', resultPanel);
      add('p', `候補数：戦闘区画 ${result.counts.encounters} / 敵 ${result.counts.enemies} / 必殺 ${result.counts.supers} / HP条件 ${result.counts.conditions}`, resultPanel);
      if (result.issues.length) add('p', '欄の欠落、重複、所属不明などがあります。以下の観測結果を確認してください。値の補完は行っていません。', resultPanel);
      const copyButton = add('button', '診断結果をコピー', resultPanel); copyButton.type = 'button';
      const copyStatus = add('p', '', resultPanel); copyStatus.setAttribute('role', 'status'); copyStatus.id = 'copy-status';
      const label = add('label', 'コピー対象（診断結果全文）', resultPanel); label.htmlFor = 'diagnostic-json';
      const json = add('textarea', '', resultPanel); json.id = 'diagnostic-json'; json.readOnly = true;
      json.value = JSON.stringify(result, null, 2);
      copyButton.addEventListener('click', copyEvent => {
        if (!copyEvent.isTrusted) return;
        // Firefox's user-gesture copy path; no clipboardRead/clipboardWrite permission.
        json.focus({ preventScroll: true }); json.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } catch { /* Keep selectable text. */ }
        copyStatus.textContent = copied ? '診断結果をコピーしました。' : 'コピーできませんでした。診断結果の欄を長押しして手動でコピーできます。';
      });
      const list = add('ul', '', resultPanel);
      for (const o of result.observations) {
        const item = add('li', '', list);
        add('strong', `${fields[o.field] ?? o.field}：${states[o.state]}`, item);
        add('p', `${scopeText(o.parent)}${o.candidates.length ? ' — ' + o.candidates.map(c => `${c.text || '（空欄）'}${c.truncated ? '（160文字で省略）' : ''}`).join(' / ') : ''}`, item);
        const detail = add('details', '', item); add('summary', '位置・候補数', detail);
        add('p', `候補 ${o.count} / ${o.candidates.map(c => c.path).join(' / ') || o.selector || '位置未確定'}`, detail);
      }
      const info = add('details', '', resultPanel); add('summary', '技術情報・補助code', info);
      add('p', `${result.ruleVersion} / ${result.snapshotDigest}`, info);
      add('p', result.issues.map(i => i.code).join(' / ') || '候補走査内の問題は検出されませんでした。', info);
    } catch (error) {
      title.textContent = '構造を安全に判定できませんでした';
      status.textContent = stopReasons[error.code] ?? '診断処理を完了できませんでした。追加の取得は行いません。';
      add('p', 'raw HTMLや診断結果は永続保存していません。', resultPanel);
      const detail = add('details', '', resultPanel); add('summary', '補助code', detail);
      add('p', Object.hasOwn(stopReasons, error.code) ? error.code : 'DIAGNOSTIC_EXECUTION_FAILED', detail);
    }
  });
  document.body.prepend(host);
}
