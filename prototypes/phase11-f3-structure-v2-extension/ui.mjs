import { createStructureDiagnosticV2 } from '../../src/prototype/phase11-f3-structure-v2.mjs';

const states = { detected: '構造を検出', blank: '空欄', 'non-empty-unparsed': '表示あり・意味未解釈', missing: 'この範囲で未検出', ambiguous: '対応が曖昧', 'not-observed': '未観測・観測不十分' };
const names = { 'super-root': '必殺候補', 'super-name': '必殺名候補', 'super-atk': '必殺ダメージ表示', probability: '確率', 'hp-condition': 'HP条件候補', 'super-specific-count': '必殺固有の最大ATK/ターン', reuse: '再使用', 'skill-row': 'スキル行', 'ai-region': 'AI候補', 'aoe-region': 'AOE候補' };
export function mountDiagnosticV2(expected) {
  if (document.getElementById('f3-structure-ui')) return;
  const host = document.createElement('section'); host.id = 'f3-structure-ui';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;display:block;background:#132239;color:#edf4ff;font:15px/1.5 system-ui}*{box-sizing:border-box}section{max-width:850px;padding:14px;margin:auto}h1{font-size:21px}h2{font-size:18px}button{width:100%;min-height:48px;padding:12px;margin:8px 0;background:#245ba1;color:white;border:1px solid #95bae9;border-radius:6px;font:inherit}button:disabled{opacity:.55}p,li,details{overflow-wrap:anywhere}textarea{width:100%;height:180px;color:#edf4ff;background:#091727;border:1px solid #95bae9;white-space:pre-wrap;overflow-wrap:anywhere}summary{padding:10px 0;cursor:pointer}ul{padding-left:18px}pre{white-space:pre-wrap;overflow-wrap:anywhere}`;
  shadow.append(style); const section = document.createElement('section'); shadow.append(section);
  const add = (tag, text, parent = section) => { const n = document.createElement(tag); n.textContent = text; parent.append(n); return n; };
  add('h1', 'stage構造の限定確認 v2');
  add('p', '候補 0.0.2・診断のみ。計算や取込の判定は行いません。');
  const status = add('p', 'ボタンを押す前は取得・診断・保存を行いません。'); status.setAttribute('role', 'status');
  add('p', '結果はこの画面のメモリだけに保持します。コピーした結果は貼り付け先に残ります。');
  const run = add('button', 'このstageの構造を確認'); run.type = 'button';
  const output = add('div', '');
  const runner = createStructureDiagnosticV2({ ...expected, expectedUrl: expected.url, expectedEventId: expected.eventId, expectedStageId: expected.stageId,
    readUrl: () => location.href, readOuterHTML: () => document.documentElement.outerHTML });
  run.addEventListener('click', async event => {
    if (!event.isTrusted || run.disabled) return;
    run.disabled = true; status.textContent = '表示済みのページを確認しています。';
    try {
      const result = await runner.run();
      add('h2', '構造診断結果', output);
      status.textContent = result.coverage.unresolved ? '構造を安全に判定できない箇所があります。観測できた範囲を表示します。' : '構造診断が完了しました。';
      add('p', 'raw HTMLは保存していません。ページ全体のcoverage・ゲーム上の意味は未確定です。', output);
      const count = n => n === null ? '未確定' : String(n);
      add('p', `候補数：戦闘区画 ${count(result.counts.encounters)} / 敵 ${count(result.counts.enemies)} / 必殺 ${count(result.counts.superCandidates)} / HP条件 ${count(result.counts.conditionCandidates)}`, output);
      if (result.coverage.limitsReached.length) add('p', '観測上限に達した箇所があります。省略箇所は確認済みとして扱いません。', output);
      const copy = add('button', '診断結果をコピー', output); copy.type = 'button';
      const copyStatus = add('p', '', output); copyStatus.setAttribute('role', 'status');
      const label = add('label', 'コピー対象（診断結果全文）', output); label.htmlFor = 'diagnostic-json';
      const json = add('textarea', '', output); json.id = 'diagnostic-json'; json.readOnly = true; json.value = JSON.stringify(result);
      copy.addEventListener('click', copyEvent => {
        if (!copyEvent.isTrusted) return;
        json.focus({ preventScroll: true }); json.select(); let ok = false;
        try { ok = document.execCommand('copy'); } catch { /* Keep selectable bounded JSON. */ }
        copyStatus.textContent = ok ? '診断結果をコピーしました。' : 'コピーできませんでした。診断結果の欄を長押しして手動でコピーできます。';
      });
      const list = add('ul', '', output);
      for (const o of result.observations.filter(o => Object.hasOwn(names, o.field))) {
        const li = add('li', '', list); add('strong', `${names[o.field]}：${states[o.state]}`, li);
        const texts = o.candidateNodeRefs.map(id => result.nodes.find(n => n.id === id)).filter(Boolean);
        add('p', texts.map(n => `${n.text || '（文字表示なし）'}${n.truncated ? '（省略あり）' : ''}`).join(' / ') || '位置を確定できません。', li);
        if (o.field === 'super-root') add('p', `クラス一致：${o.metadata.byClass ? 'あり' : 'なし'} / 必殺アイコン：${o.metadata.iconCount}個。所属は${o.metadata.relationshipStatus === 'unresolved' ? '未確定' : '構造上の候補'}です。`, li);
      }
      const detail = add('details', '', output); add('summary', '技術情報・補助code', detail);
      add('p', `${result.ruleVersion} / ${result.snapshotDigest ?? 'digest未取得'}`, detail);
      add('p', result.issues.map(i => i.code).join(' / ') || '候補範囲内の問題は検出されませんでした。', detail);
    } catch (error) {
      status.textContent = error.code === 'DIAGNOSTIC_URL_CHANGED' ? '取得中にページのURLが変わったため停止しました。' : error.code === 'DIAGNOSTIC_URL' ? '対象stageのURLが一致しないため停止しました。' : '診断処理を完了できませんでした。追加の取得は行いません。';
    }
  });
  document.body.prepend(host);
}
