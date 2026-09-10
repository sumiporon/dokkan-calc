import { BatchReceiverStore } from '../../src/prototype/phase11-one-tap-receiver.mjs';

const status = document.querySelector('#status'); const summary = document.querySelector('#summary');
const reviewed = document.querySelector('#reviewed'); const apply = document.querySelector('#apply'); const rollback = document.querySelector('#rollback');
let store; let record;
const showError = (error) => { status.textContent = `停止：${error?.message ?? error}`; status.dataset.state = 'error'; apply.disabled = true; };
const render = () => {
  status.textContent = record.state === 'applied' ? 'このbatchは適用済みです。' : record.state === 'reviewed' ? 'owner確認済み。適用できます。' : 'calculatorが検証し、端末へ永続受領しました。';
  summary.replaceChildren();
  const values = [
    ['batch', record.batchId], ['受領状態', record.state], ['event', record.batch.eventId], ['stage数', record.batch.packages.length],
    ['安全検査', record.review.status], ['警告 / エラー', `${record.review.findings.filter((x) => x.severity !== 'hard-fail').length} / ${record.review.findings.filter((x) => x.severity === 'hard-fail').length}`]
  ];
  for (const [key, value] of values) { const dt = document.createElement('dt'); dt.textContent = key; const dd = document.createElement('dd'); dd.textContent = String(value); summary.append(dt, dd); }
  reviewed.checked = ['reviewed', 'applied'].includes(record.state); reviewed.disabled = record.state === 'applied';
  apply.disabled = record.state !== 'reviewed' || record.review.status === 'hard-fail';
  rollback.disabled = record.state !== 'applied';
};
async function init() {
  try {
    const baselineResponse = await fetch(browser.runtime.getURL('baseline-runtime.json'));
    if (!baselineResponse.ok) throw new Error('比較用baselineを拡張内から読み込めません。');
    const official = await baselineResponse.json();
    const response = await browser.runtime.sendMessage({ type: 'batch:get' });
    if (!response?.ok || !response.value) throw new Error(response?.error?.message ?? 'extensionから送信済みbatchを確認できません。');
    store = new BatchReceiverStore({ official });
    ({ record } = await store.receive(response.value)); render();
  } catch (error) { showError(error); }
}
reviewed.addEventListener('change', async () => {
  if (!reviewed.checked || !record || record.state !== 'received') return;
  try { record = await store.markReviewed(record.batchId); render(); } catch (error) { showError(error); }
});
apply.addEventListener('click', async () => {
  apply.disabled = true;
  try { ({ record } = await store.apply(record.batchId)); render(); } catch (error) { showError(error); }
});
rollback.addEventListener('click', async () => {
  rollback.disabled = true;
  try { ({ record } = await store.rollback(record.batchId)); render(); } catch (error) { showError(error); }
});
init();
