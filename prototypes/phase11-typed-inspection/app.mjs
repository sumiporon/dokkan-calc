import { TypedInspectionReceiver } from '../../src/prototype/phase11-typed-one-tap-api.mjs';

const root = document.querySelector('#screen');
function render(title, text) {
  root.replaceChildren(); const heading = document.createElement('h2'); heading.textContent = title;
  const body = document.createElement('p'); body.textContent = text; root.append(heading, body);
}
function stateName(state) {
  return { full: '完全データ保存済み', partial: '部分材料保存済み', unusable: '利用不可', unvisited: '未取得' }[state];
}
function renderReview(review) {
  root.replaceChildren(); const heading = document.createElement('h2'); heading.textContent = 'typed inspection review'; root.append(heading);
  const counts = document.createElement('p');
  counts.textContent = `完全データ保存済み: ${review.counts.full}stage / 部分材料保存済み: ${review.counts.partial}stage / 利用不可: ${review.counts.unusable}stage / 未取得: ${review.counts.unvisited}stage / 合計: ${review.counts.total}stage`;
  root.append(counts);
  const note = document.createElement('p'); note.className = 'small'; note.textContent = '受信時に再検証した読み取り専用の確認結果です。数値計算や適用は行いません。'; root.append(note);
  const list = document.createElement('ul');
  for (const stage of review.stages) {
    const item = document.createElement('li'); item.textContent = `${stage.label}: ${stateName(stage.state)} — ${stage.ownerMessage}`; list.append(item);
  }
  root.append(list);
}
async function route() {
  try {
    const fragment = location.hash.startsWith('#batch=') ? location.hash.slice('#batch='.length) : null;
    if (!fragment) { render('確認結果がありません', 'one-tap fixtureから検証済みの確認用batchを開いてください。'); return; }
    const batch = JSON.parse(decodeURIComponent(fragment));
    renderReview(await new TypedInspectionReceiver().receive(batch));
  } catch (error) {
    render('確認結果を安全に表示できません', '受け渡しデータの再検証で停止しました。元の保存状態は変更していません。');
  }
}
await route();
