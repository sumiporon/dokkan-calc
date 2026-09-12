import { MemoryTypedDraftStore, MemoryTypedSessionBackend, TypedOneTapSessionCoordinator, createTypedInspectionBatch, captureF2FixtureHtml } from '../../src/prototype/phase11-typed-one-tap-api.mjs';
import { eventA, eventB } from './fixtures.mjs';

const root = document.querySelector('#screen');
const store = new MemoryTypedDraftStore();
const backend = new MemoryTypedSessionBackend();
const session = new TypedOneTapSessionCoordinator({ draftStore: store, backend });
const writerId = `f2-fixture-tab:${crypto.randomUUID()}`;
let selected = null, busy = false;

function render(title, text, action = null, extra = '') {
  root.replaceChildren(); const h = document.createElement('h2'); h.textContent = title; const p = document.createElement('p'); p.textContent = text; root.append(h, p);
  if (extra) { const note = document.createElement('p'); note.className = 'small'; note.textContent = extra; root.append(note); }
  if (action) { const button = document.createElement('button'); button.textContent = action.label; button.disabled = busy; button.addEventListener('click', action.click); root.append(button); }
}
function stopped(error) { render('このstageで停止', error?.message ?? String(error), null, '保存済みのstageは保持されます。'); }
async function begin(event) {
  if (busy) return; busy = true; selected = event; render('準備中', '自作HTML fixtureの取得計画を確認しています。');
  try { await session.start({ eventId: event.eventId, eventName: event.eventName, plan: event.plan, writerId }); busy = false; await showStage(); }
  catch (error) { busy = false; stopped(error); }
}
async function showStage() {
  const value = await session.load(); const index = value.currentIndex, page = selected.pages[index];
  render(`${index + 1}/${value.plan.length} stage`, page.expectedStageId, { label: index + 1 === value.plan.length ? '最終確認へ' : '次のステージへ', click: captureAndContinue }, 'この操作で表示済みの自作HTML fixtureをscan・分類・保存・read-back照合します。');
}
async function captureAndContinue() {
  if (busy) return; busy = true; render('確認中', 'HTML snapshotから安全に分類・保存・照合しています。');
  try {
    const before = await session.load(), unit = before.plan[before.currentIndex], ticket = await session.beginCapture({ writerId, currentUrl: unit.url });
    const result = await captureF2FixtureHtml({ session, ticket, html: selected.pages[before.currentIndex] });
    busy = false;
    if (result.classification === 'unusable') {
      render('このstageでは安全に保存できません', '次のstageへは進めません。', { label: '取得結果を確認', click: openInspection }, '完全データ・部分材料のいずれとしても保存できなかったため停止しました。');
      return;
    }
    const saved = result.committed.session, count = Object.keys(saved.drafts).length;
    const message = result.classification === 'full' ? '完全データを保存しました' : '一部の材料を保存しました';
    const note = result.classification === 'partial' ? '計算できるかどうかは、この段階ではまだ判定していません。' : '既存full packageの検査・保存・read-back照合を通過しました。';
    if (saved.status === 'ready-for-final-confirmation') {
      const summary = await session.finalSummary(); render(message, `${count}/${saved.plan.length} stageを安全に保持しました。`, null, `${note} 完全データ ${summary.full}stage / 部分材料 ${summary.partial}stage / 合計 ${summary.total}stage。`);
    } else render(message, `${count}/${saved.plan.length} stageを保存しました。`, { label: '次のステージへ', click: showStage }, note);
  } catch (error) { busy = false; stopped(error); }
}
async function openInspection() {
  try { const batch = await createTypedInspectionBatch({ session }); location.href = `${location.origin}/prototypes/phase11-typed-inspection/index.html#batch=${encodeURIComponent(JSON.stringify(batch))}`; }
  catch (error) { stopped(error); }
}
function choose() {
  render('fixture eventを選択', 'すべて自作HTMLからF1 scan/classifierを実行します。', { label: 'Event A：mixed完走', click: () => begin(eventA) }, 'Event B（unusable停止）は下のボタンで確認できます。');
  const second = document.createElement('button'); second.textContent = 'Event B：unusable停止'; second.addEventListener('click', () => begin(eventB)); root.append(second);
}
choose();
