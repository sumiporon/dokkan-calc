import { IndexedDbTypedDraftStore, IndexedDbTypedSessionBackend, TypedOneTapSessionCoordinator } from '../../src/prototype/phase11-typed-one-tap-api.mjs';
import { PHASE_C_EVENT_ID, PHASE_C_EVENT_NAME, PHASE_C_STAGES, phaseCPlan, fixtureCandidate } from './fixtures.mjs';

const root = document.querySelector('#screen');
const writerId = 'phase-c-fixture-tab';
const store = new IndexedDbTypedDraftStore();
const session = new TypedOneTapSessionCoordinator({ draftStore: store, backend: new IndexedDbTypedSessionBackend() });
let busy = false;
const pageBase = `${location.origin}${location.pathname}`;
const render = (title, text, button = null, extra = '') => {
  root.replaceChildren(); const h = document.createElement('h2'); h.textContent = title; const p = document.createElement('p'); p.textContent = text; root.append(h, p);
  if (extra) { const detail = document.createElement('p'); detail.className = 'small'; detail.textContent = extra; root.append(detail); }
  if (button) { const action = document.createElement('button'); action.textContent = button.label; action.disabled = busy || button.disabled; action.addEventListener('click', button.click); root.append(action); }
};
const stop = error => render('このstageで停止', error.message ?? String(error), null, '保存済みのstageは保持され、次のstageへは進みません。');

async function start() {
  if (busy) return; busy = true; render('保存中', 'eventと訪問計画を端末へ保存しています。');
  try { await session.start({ eventId: PHASE_C_EVENT_ID, eventName: PHASE_C_EVENT_NAME, plan: phaseCPlan(pageBase), writerId }); location.hash = '#full-1'; }
  catch (error) { stop(error); } finally { busy = false; }
}
async function stage(key) {
  if (busy) return; busy = true; render('確認中', '通信せず、架空の表示済みstage材料を検査しています。');
  try {
    const currentUrl = `${pageBase}#${key}`;
    const ticket = await session.beginCapture({ writerId, currentUrl });
    const candidate = await fixtureCandidate(key);
    if (candidate.classification === 'unusable') {
      const stopped = await session.recordUnusable(ticket, candidate);
      busy = false;
      render('このstageでは安全に保存できません', stopped.failure.ownerMessage, {
        label: 'ここまでの取得結果を確認', click: () => { location.hash = '#review'; }
      }, `完全データ検査: ${stopped.failure.fullFailureCode} / 部分材料検査: ${stopped.failure.partialFailureCode}。次のstageへは進めません。`);
      return;
    }
    const committed = await session.commitCapture(ticket, candidate);
    const draft = committed.session.drafts[ticket.unitId];
    const partial = draft.classification === 'partial';
    const noCapabilityCandidates = candidate.capabilityCandidates === 0;
    const title = partial ? '一部の材料を保存しました' : '完全データを保存しました';
    const detail = partial && noCapabilityCandidates ? '現在は計算できません。保存可能と計算可能は別です。' : partial ? '単発計算の候補があります。計算画面との接続は今回の範囲外です。' : '現行full検査、保存、読み戻し照合が完了しました。';
    const navigation = await session.nextNavigation({ writerId, currentUrl });
    // The save gate is complete; only now may the fixed next control become enabled.
    busy = false;
    render(title, `${Object.keys(committed.session.drafts).length}/${committed.session.plan.length} stage。${detail}`, {
      label: navigation.kind === 'navigate' ? '次のステージへ' : '最終確認',
      click: () => { if (navigation.kind === 'navigate') location.hash = new URL(navigation.url).hash; else location.hash = '#complete'; }
    }, 'validator成功 → payload保存・read-back → typed draft保存 → session保存・read-back → ticket整合を確認済み。');
  } catch (error) { stop(error); } finally { busy = false; }
}
function renderReadOnlyReview(summary) {
  root.replaceChildren(); const heading = document.createElement('h2'); heading.textContent = 'ここまでの取得結果'; root.append(heading);
  const counts = document.createElement('p'); counts.textContent = `完全データ保存済み: ${summary.full}stage / 部分材料保存済み: ${summary.partial}stage / 利用不可: ${summary.unusable}stage / 未取得: ${summary.unvisited}stage`; root.append(counts);
  const note = document.createElement('p'); note.className = 'small'; note.textContent = '読み取り専用の確認です。適用、スキップ、再試行、次のstageへの遷移はできません。'; root.append(note);
  const list = document.createElement('ul');
  for (const stage of summary.stages) { const item = document.createElement('li'); const label = stage.state === 'full' ? '完全データ保存済み' : stage.state === 'partial' ? '部分材料保存済み' : stage.state === 'unusable' ? '利用不可' : '未取得'; item.textContent = `${stage.label}: ${label} — ${stage.ownerMessage}`; list.append(item); }
  root.append(list);
}
async function route() {
  const hash = location.hash || '#event';
  if (hash === '#event') { render('eventを確認しました', `${PHASE_C_EVENT_NAME}・4stage（架空fixture）`, { label: '開始', click: start }); return; }
  if (hash === '#review') { try { renderReadOnlyReview(await session.readOnlySummary()); } catch (error) { stop(error); } return; }
  if (hash === '#complete') {
    try { const summary = await session.finalSummary();
      render('Phase Bの最終確認', `typed draftから集計：完全データ ${summary.full}stage / 部分材料 ${summary.partial}stage / 合計 ${summary.total}stage。安全に保持できたところまでで終了します。inspection reviewやapplyは今回の範囲外です。`); } catch (error) { stop(error); } return;
  }
  const item = PHASE_C_STAGES.find(value => `#${value.key}` === hash); if (!item) { location.hash = '#event'; return; }
  await stage(item.key);
}
addEventListener('hashchange', route); await route();
