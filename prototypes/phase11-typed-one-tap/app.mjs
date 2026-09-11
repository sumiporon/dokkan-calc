import { IndexedDbTypedDraftStore, IndexedDbTypedSessionBackend, TypedOneTapSessionCoordinator } from '../../src/prototype/phase11-typed-one-tap-api.mjs';
import { PHASE_C_EVENT_ID, phaseDPlan, phaseDCandidate } from './fixtures.mjs';

const root = document.querySelector('#screen');
const tabId = `phase-d-tab:${crypto.randomUUID()}`;
const store = new IndexedDbTypedDraftStore();
const backend = new IndexedDbTypedSessionBackend();
const session = new TypedOneTapSessionCoordinator({ draftStore: store, backend });
const pageBase = `${location.origin}${location.pathname}`;
const restartCase = new URLSearchParams(location.search).get('restart');
let busy = false;
let takeoverExpected = null;

function render(title, text, button = null, extra = '') {
  root.replaceChildren(); const heading = document.createElement('h2'); heading.textContent = title; const body = document.createElement('p'); body.textContent = text; root.append(heading, body);
  if (extra) { const detail = document.createElement('p'); detail.className = 'small'; detail.textContent = extra; root.append(detail); }
  if (button) { const action = document.createElement('button'); action.textContent = button.label; action.disabled = busy || button.disabled; action.addEventListener('click', button.click); root.append(action); }
}
const stop = error => render(error?.code === 'WRITER_MISMATCH' ? '別のタブに担当が移っています' : 'このstageで停止', error?.message ?? String(error), null, '保存済みのstageは保持され、操作は進みません。');

async function commitStage(caseId, index, writerId) {
  const value = await session.load(), unit = value.plan[index];
  const ticket = await session.beginCapture({ writerId, currentUrl: unit.url });
  const candidate = await phaseDCandidate(caseId, index);
  if (candidate.classification === 'unusable') return session.recordUnusable(ticket, candidate);
  return session.commitCapture(ticket, candidate);
}
async function prepare(caseId) {
  if (busy) return; busy = true; render('準備中', '自作fixtureの保存済みsessionを作成しています。');
  try {
    const plan = phaseDPlan(pageBase, caseId);
    await session.start({ eventId: PHASE_C_EVENT_ID, eventName: caseId === 'progress' ? 'Phase D・進行途中' : 'Phase D・unusable停止済み', plan, writerId: tabId });
    await commitStage(caseId, 0, tabId); await commitStage(caseId, 1, tabId);
    if (caseId === 'stopped') await commitStage(caseId, 2, tabId);
    location.search = `?restart=${caseId}`;
  } catch (error) { stop(error); } finally { busy = false; }
}
function renderReadOnly(summary) {
  root.replaceChildren(); const heading = document.createElement('h2'); heading.textContent = 'ここまでの取得結果'; root.append(heading);
  const counts = document.createElement('p'); counts.textContent = `完全データ保存済み: ${summary.full}stage / 部分材料保存済み: ${summary.partial}stage / 利用不可: ${summary.unusable}stage / 未取得: ${summary.unvisited}stage`; root.append(counts);
  const note = document.createElement('p'); note.className = 'small'; note.textContent = '読み取り専用です。適用、スキップ、再試行、次のstageへの遷移はできません。'; root.append(note);
  const list = document.createElement('ul');
  for (const stage of summary.stages) { const item = document.createElement('li'); const state = stage.state === 'full' ? '完全データ保存済み' : stage.state === 'partial' ? '部分材料保存済み' : stage.state === 'unusable' ? '利用不可' : '未取得'; item.textContent = `${stage.label}: ${state} — ${stage.ownerMessage}`; list.append(item); }
  root.append(list);
}
async function resumeAfterTakeover(caseId) {
  const value = await session.load();
  if (value.status === 'stopped-unusable') {
    render('このタブで続けられます', '利用不可stageで停止中のため、次のstageへは進めません。', { label: 'ここまでの取得結果を確認', click: async () => { try { renderReadOnly(await session.readOnlySummary()); } catch (error) { stop(error); } } });
    return;
  }
  render('このタブで続けられます', '保存済みのfull / partialを再検証しました。次のstageへ進めます。', { label: '次のstageへ', click: () => { location.hash = '#resume'; } }, `writer generation ${value.writerGeneration} / session revision ${value.revision}`);
}
async function takeover(caseId) {
  if (busy) return; busy = true; render('担当を確認中', '保存済みsessionを再検証しています。');
  try { await session.takeover({ writerId: tabId, expected: takeoverExpected }); busy = false; await resumeAfterTakeover(caseId); }
  catch (error) { stop(error); } finally { busy = false; }
}
async function renderRestart(caseId) {
  try {
    const value = await session.load();
    if (!value) { render('保存済みsessionがありません', '最初の画面からfixtureを準備してください。'); return; }
    if (value.writerId === tabId) { await resumeAfterTakeover(caseId); return; }
    takeoverExpected = { sessionId: value.sessionId, writerId: value.writerId, writerGeneration: value.writerGeneration, revision: value.revision };
    render('このタブでは操作を続けられません', '続けるには、このタブへ担当を移してください。', { label: 'このタブへ担当を移す', click: () => takeover(caseId) }, `保存済みstageを再検証済み。writer generation ${value.writerGeneration} / session revision ${value.revision}`);
  } catch (error) { stop(error); }
}
async function resumeStage(caseId) {
  if (busy) return; busy = true; render('確認中', '引継ぎ後のstageを検査しています。');
  try {
    const value = await session.load();
    if (value.writerId !== tabId) throw Object.assign(new Error('別のタブに担当が移っています。'), { code: 'WRITER_MISMATCH' });
    const result = await commitStage(caseId, value.currentIndex, tabId);
    busy = false; render('完全データを保存しました', `${Object.keys(result.session.drafts).length}/${result.session.plan.length} stage。引継ぎ後に操作できることを確認しました。`, null, 'Phase Dではこの先のreview / applyは扱いません。');
  } catch (error) { stop(error); } finally { busy = false; }
}
async function route() {
  const hash = location.hash || '#event';
  if (restartCase === 'progress' || restartCase === 'stopped') { if (hash === '#resume') await resumeStage(restartCase); else await renderRestart(restartCase); return; }
  render('Phase Dのfixtureを選択', 'ページ再読込後の復元と明示writer引継ぎを確認します。', { label: 'ケースA：進行途中を準備', click: () => prepare('progress') }, 'ケースB（unusable停止済み）は、下のボタンで別途確認できます。');
  const second = document.createElement('button'); second.textContent = 'ケースB：停止済みを準備'; second.addEventListener('click', () => prepare('stopped')); root.append(second);
}
addEventListener('hashchange', route); await route();
