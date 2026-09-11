import { IndexedDbTypedDraftStore, IndexedDbTypedSessionBackend, TypedOneTapSessionCoordinator } from '../../src/prototype/phase11-typed-one-tap-api.mjs';
import { PHASE_B_EVENT_ID, PHASE_B_EVENT_NAME, PHASE_B_STAGES, phaseBPlan, fixtureCandidate } from './fixtures.mjs';

const root = document.querySelector('#screen');
const writerId = 'phase-b-fixture-tab';
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
  try { await session.start({ eventId: PHASE_B_EVENT_ID, eventName: PHASE_B_EVENT_NAME, plan: phaseBPlan(pageBase), writerId }); location.hash = '#full-1'; }
  catch (error) { stop(error); } finally { busy = false; }
}
async function stage(key) {
  if (busy) return; busy = true; render('確認中', '通信せず、架空の表示済みstage材料を検査しています。');
  try {
    const currentUrl = `${pageBase}#${key}`;
    const ticket = await session.beginCapture({ writerId, currentUrl });
    const candidate = await fixtureCandidate(key);
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
async function route() {
  const hash = location.hash || '#event';
  if (hash === '#event') { render('eventを確認しました', `${PHASE_B_EVENT_NAME}・3stage（架空fixture）`, { label: '開始', click: start }); return; }
  if (hash === '#complete') {
    try { const summary = await session.finalSummary();
      render('Phase Bの最終確認', `typed draftから集計：完全データ ${summary.full}stage / 部分材料 ${summary.partial}stage / 合計 ${summary.total}stage。安全に保持できたところまでで終了します。inspection reviewやapplyは今回の範囲外です。`); } catch (error) { stop(error); } return;
  }
  const item = PHASE_B_STAGES.find(value => `#${value.key}` === hash); if (!item) { location.hash = '#event'; return; }
  await stage(item.key);
}
addEventListener('hashchange', route); await route();
