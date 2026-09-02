import baseline from '../../generated/phase11/baseline.mjs';
import samples from '../../generated/phase11/samples.mjs';
import { prepareFiles } from '../../src/prototype/phase11-intake.mjs';
import { PrototypeStore } from '../../src/prototype/phase11-store.mjs';

const $ = (selector) => document.querySelector(selector);
const element = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const num = (value) => typeof value === 'number' ? value.toLocaleString('ja-JP') : '不明';
const labels = { agl: '速', teq: '技', int: '知', str: '力', phy: '体', super: '超', extreme: '極', neutral: '中立' };
const sampleDownloads = {
  mhtml: ['sample-complete.mhtml', 'multipart/related'],
  complete: ['sample-complete.html', 'text/html;charset=utf-8'],
  main: ['sample-main.html', 'text/html;charset=utf-8'],
  detail: ['sample-detail.html', 'text/html;charset=utf-8'],
  updated: ['sample-updated.html', 'text/html;charset=utf-8'],
  second: ['sample-second.html', 'text/html;charset=utf-8'],
  dokkaninfoEvent: ['sample-dokkaninfo-event.html', 'text/html;charset=utf-8'],
  dokkaninfoStage: ['sample-dokkaninfo-stage.html', 'text/html;charset=utf-8'],
  dokkaninfoStageMhtml: ['sample-dokkaninfo-stage.mhtml', 'multipart/related']
};
let store, state, prepared, busy = false;
function status(message, error = false) { $('#status').textContent = message; $('#status').dataset.error = String(error); }
function controls() {
  $('#source-files').disabled = busy || !state;
  $('#apply').disabled = busy || prepared?.status !== 'ready';
  $('#discard').disabled = busy;
  $('#rollback').disabled = busy || !state?.previous;
  $('#clear-all').disabled = busy || !state?.current?.packages.length;
}
function fields(parent, rows) {
  const dl = element('dl');
  for (const [label, value] of rows) dl.append(element('dt', label), element('dd', value));
  parent.append(dl);
}
function displayPackages(target, packages) {
  target.replaceChildren();
  for (const pack of packages) {
    const stage = pack.runtime.events[0].stages[0];
    const article = element('article', null, 'stage'); article.append(element('h3', stage.name.value));
    for (const encounter of stage.encounters) {
      const sourceEncounter = pack.canonical.events[0].stages[0].encounters.find((entry) => entry.id === encounter.id);
      for (const enemy of encounter.enemies) {
        const sourceEnemy = sourceEncounter.enemies.find((entry) => entry.id === enemy.id);
        article.append(element('p', enemy.name.value));
        fields(article, [['属性', `${labels[enemy.alignment.value] ?? '不明'}${labels[enemy.type.value] ?? '不明'}`], ['HP / DEF', `${num(sourceEnemy.stats.hp.value)} / ${num(sourceEnemy.stats.defense.value)}`], ['通常ATK', num(enemy.baseAttack.value)]]);
        for (const attack of enemy.superAttacks) {
          fields(article, [[attack.name.value, num(attack.displayedDamage.value)], ['使用条件', attack.usageRules.map((rule) => `HP ${num(rule.hpMinPercent.value)}～${num(rule.hpMaxPercent.value)}%・${num(rule.probabilityPercent.value)}%・最大${num(rule.maxPerTurn.value)}回`).join(' / ')]]);
        }
      }
      for (const area of encounter.areaAttacks) fields(article, [['全体攻撃・最初', num(area.firstTargetDamage.value)], ['全体攻撃・追加', num(area.additionalTargetDamage.value)]]);
      fields(article, [['行動ルール', `${sourceEncounter.aiActions.length}件`]]);
      for (const action of sourceEncounter.aiActions) article.append(element('p', action.sourceText.value, 'small'));
    }
    const details = element('details'); details.append(element('summary', '出典・検査情報'));
    details.append(element('p', `${pack.classification === 'manual-dokkaninfo-private-prototype' ? 'ownerが選択したDokkanInfoローカル保存ページ（許可未確認・個人試作のみ）' : '自作の架空データ'} / ${pack.revision}`, 'small'));
    for (const snapshot of pack.canonical.sourceSnapshots) details.append(element('p', snapshot.sourceRootUrl, 'small'));
    details.append(element('p', pack.digest, 'small')); article.append(details); target.append(article);
  }
}
function displaySaved() {
  $('#saved-count').textContent = `${state.current.packages.length}ステージ（この試作だけ）`;
  displayPackages($('#saved-list'), state.current.packages); controls();
}
async function run(action) {
  if (busy) return;
  busy = true; controls();
  try { await action(); }
  catch (error) { prepared = null; status(`停止：${error.message}\n保存済みの試作データは変更していません。`, true); }
  finally { busy = false; controls(); }
}
function showPreview() {
  const body = $('#preview-body'); body.replaceChildren(); $('#preview').hidden = false;
  if (prepared.status === 'incomplete') {
    body.append(element('p', 'このページだけでは不足があります。保存せず停止しました。'));
    const ul = element('ul'); for (const item of prepared.missing) ul.append(element('li', item)); body.append(ul);
    for (const link of prepared.links) body.append(element('p', `${link.label}：${link.href}`, 'small'));
    body.append(element('p', '不足するページを通常のブラウザ操作で保存し、必要なファイルを一緒に選び直してください。表示したリンクは選択済みHTMLに実在する案内だけで、ツールが開くことはありません。'));
    status('不足するページがあります。保存済みの内容は維持しています。', true); return;
  }
  const rows = [
    ['イベント', prepared.review.changes.events], ['ステージ', prepared.review.changes.stages],
    ['敵', prepared.review.changes.enemies], ['必殺', prepared.review.changes.superAttacks],
    ['全体攻撃', prepared.review.changes.areaAttacks]
  ];
  const summary = element('dl');
  for (const [label, change] of rows) summary.append(element('dt', label), element('dd', `追加 ${change.added.length} / 変更 ${change.changed.length} / 削除 ${change.removed.length}`));
  const warningCount = prepared.review.findings.filter((item) => item.severity === 'review-required').length;
  const errorCount = prepared.review.findings.filter((item) => item.severity === 'hard-fail').length;
  summary.append(element('dt', '攻撃・候補合計'), element('dd', `${prepared.review.candidateCounts.attacks}件`), element('dt', '警告 / エラー'), element('dd', `${warningCount} / ${errorCount}`));
  body.append(summary);
  body.append(element('p', '正式データは読み取り専用で比較しています。この確認は本番への反映許可ではありません。'));
  if (prepared.status === 'blocked') {
    body.append(element('p', '既存データの消失・属性変更等を検出しました。適用できません。'));
    body.append(element('pre', prepared.review.findings.filter((item) => item.severity === 'hard-fail').map((item) => item.code).join('\n')));
  }
  const container = element('div'); displayPackages(container, prepared.snapshot.packages); body.append(container);
  const receipt = element('details'); receipt.append(element('summary', '入力ファイルの検査記録'));
  for (const item of prepared.receipts) receipt.append(element('p', `${item.format.toUpperCase()}・${item.rawBytes} bytes / ${item.rawDigest}`, 'small'));
  body.append(receipt);
  status(prepared.status === 'ready' ? '検査が終わりました。内容を確認してから試作へ保存してください。' : prepared.status === 'unchanged' ? '同じデータです。二重に追加・保存しません。' : '安全検査で停止しました。旧データを維持します。', prepared.status === 'blocked');
}
$('#source-files').addEventListener('change', () => run(async () => {
  prepared = null; $('#preview').hidden = true;
  if (!$('#source-files').files.length) return;
  status('端末内で解析・検査しています…');
  state = await store.load(); displaySaved();
  prepared = await prepareFiles([...$('#source-files').files], state.current, baseline.runtime); showPreview();
}));
$('#apply').addEventListener('click', () => run(async () => {
  status('再検査して試作専用の保存領域へ記録しています…');
  state = await store.apply(prepared, baseline.runtime); prepared = null; $('#preview').hidden = true; $('#source-files').value = '';
  displaySaved(); status('試作へ保存しました。下のステージで確認できます。再読み込みしても保持されます。正式版には反映していません。');
}));
$('#discard').addEventListener('click', () => { prepared = null; $('#preview').hidden = true; $('#source-files').value = ''; status('取り込みを取り消しました。保存は変わりません。'); controls(); });
$('#rollback').addEventListener('click', () => run(async () => {
  state = await store.rollback(); prepared = null; $('#preview').hidden = true; $('#source-files').value = ''; displaySaved(); status('試作データを1つ前の状態に戻しました。正式版は変更していません。');
}));
$('#clear-all').addEventListener('click', () => {
  if (!confirm('この試作に保存した個人追加をすべて削除し、正式データだけの状態へ戻します。よろしいですか？')) return;
  run(async () => {
    state = await store.clearAll(); prepared = null; $('#preview').hidden = true; $('#source-files').value = ''; displaySaved();
    status('個人追加をすべて削除しました。現在は正式データだけの状態です。正式データ自体は変更していません。');
  });
});
for (const button of document.querySelectorAll('[data-sample]')) button.addEventListener('click', () => {
  const key = button.dataset.sample; const [name, type] = sampleDownloads[key];
  const url = URL.createObjectURL(new Blob([samples[key]], { type }));
  const anchor = element('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
});
$('#baseline').textContent = `比較用正式データ：${baseline.counts.enemies}敵 / ${baseline.counts.stages}ステージ / ${baseline.fullDigest}`;
run(async () => { store = new PrototypeStore(); state = await store.load(); displaySaved(); status(state.recovery === 'new' ? '新しい試作状態です。ファイルを選んでください。' : state.recovery === 'previous-recovered' ? '直近の試作保存に不整合があったため、検査済みの1つ前を表示しています。自動上書きはしていません。' : '保存済みの試作データを再検査して復元しました。'); });
