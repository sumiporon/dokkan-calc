import { inspectDokkanInfoDocument, buildDokkanInfoStagePackage, dokkanInfoStageFingerprint, ONE_TAP_ADAPTER_VERSION } from '../../src/prototype/phase11-one-tap-adapter.mjs';

const root = document.createElement('div');
root.id = 'phase11-one-tap-root';
const shadow = root.attachShadow({ mode: 'open' });
shadow.innerHTML = `<style>
  :host{all:initial} .bar{position:fixed;z-index:2147483647;left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));box-sizing:border-box;padding:10px;border:2px solid #4d7cfe;border-radius:12px;background:#101827;color:#fff;font:14px/1.35 system-ui,sans-serif;box-shadow:0 4px 22px #0008}
  .row{display:flex;align-items:center;gap:8px}.text{min-width:0;flex:1}.title{font-weight:700}.detail{color:#cbd5e1;font-size:12px;margin-top:2px;overflow-wrap:anywhere}
  button{min-height:44px;min-width:112px;padding:8px 13px;border:0;border-radius:9px;background:#4d7cfe;color:#fff;font:700 14px system-ui,sans-serif;touch-action:manipulation}button:disabled{background:#475569;color:#cbd5e1}.secondary{background:#334155}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  @media(max-width:390px){.bar{left:4px;right:4px;padding:8px}.row{align-items:stretch;flex-direction:column}.actions button{flex:1}.actions{flex-wrap:nowrap}}
</style><div class="bar"><div class="row"><div class="text"><div class="title" id="title">確認中</div><div class="detail" id="detail">表示済みDOMだけを解析しています。</div></div><div class="actions" id="actions"></div></div></div>`;
document.documentElement.append(root);
const title = shadow.querySelector('#title'); const detail = shadow.querySelector('#detail'); const actions = shadow.querySelector('#actions');
let busy = false;

function show(heading, message, buttons = []) {
  title.textContent = heading; detail.textContent = message; actions.replaceChildren();
  for (const item of buttons) {
    const button = document.createElement('button'); button.textContent = item.label; button.disabled = Boolean(item.disabled);
    if (item.secondary) button.className = 'secondary';
    button.addEventListener('click', item.click); actions.append(button);
  }
}
async function send(message) {
  const response = await browser.runtime.sendMessage(message);
  if (!response?.ok) throw Object.assign(new Error(response?.error?.message ?? '拡張処理に失敗しました。'), { code: response?.error?.code });
  return response.value;
}
const fixtureMode = typeof PHASE11_FIXTURE_MODE !== 'undefined' && PHASE11_FIXTURE_MODE;
const inspect = () => inspectDokkanInfoDocument({
  html: document.documentElement.outerHTML,
  currentUrl: location.href,
  sourceUrl: fixtureMode ? document.querySelector('meta[name="phase11-fixture-source-url"]')?.content : location.href,
  fixtureMode,
  readyState: document.readyState
});
const errorButtons = () => [{ label: '表示済みDOMを再解析', secondary: true, click: () => analyze() }];

async function analyze() {
  if (busy) return; busy = true; show('確認中', '通信せず、現在表示済みDOMを解析しています。', [{ label: '準備中', disabled: true }]);
  let ticket;
  try {
    let beginError = null;
    try { ticket = await send({ type: 'capture:begin', currentUrl: location.href, adapterVersion: ONE_TAP_ADAPTER_VERSION }); }
    catch (error) { beginError = error; }
    const result = inspect();
    if (result.state !== 'ready') {
      show('このページで停止', `${result.state}: ${result.message}`, errorButtons()); return;
    }
    if (result.pageKind === 'event') {
      show('eventを確認しました', `${result.material.eventName}・${result.coverage.visitUnits.length}stage`, [{
        label: '開始', click: async () => {
          if (busy) return; busy = true; show('保存中', 'eventと訪問計画を端末へ保存しています。', [{ label: '準備中', disabled: true }]);
          try {
            await send({ type: 'session:start', eventMaterial: result.material, plan: result.coverage.visitUnits, adapterVersion: ONE_TAP_ADAPTER_VERSION });
            location.assign(result.coverage.visitUnits[0].url);
          } catch (error) { show('開始できません', error.message, errorButtons()); busy = false; }
        }
      }]);
      return;
    }
    if (beginError) throw beginError;
    const pack = await buildDokkanInfoStagePackage(ticket.eventMaterial, result.material);
    const fingerprint = await dokkanInfoStageFingerprint(result.material);
    const committed = await send({ type: 'capture:commit', ticket, package: pack, fingerprint });
    const done = Object.keys(committed.session.completed).length; const total = committed.session.plan.length;
    const navigation = await send({ type: 'navigation:next', currentUrl: location.href });
    const label = navigation.kind === 'review' ? '計算画面で確認' : '次のステージへ';
    show('draft保存済み', `${done}/${total} stage。validationと保存後の照合が完了しました。`, [{
      label, click: async () => {
        if (busy) return; busy = true; show('処理中', navigation.kind === 'review' ? 'batchを検証画面へ渡しています。' : 'ownerのtapで通常遷移します。', [{ label: '処理中', disabled: true }]);
        try {
          const latest = await send({ type: 'navigation:next', currentUrl: location.href });
          if (latest.kind === 'navigate') location.assign(latest.url);
          else { await send({ type: 'batch:send' }); show('送信済み', 'draftは明示的に破棄するまで保持します。'); busy = false; }
        } catch (error) { show('進めません', error.message, errorButtons()); busy = false; }
      }
    }]);
  } catch (error) {
    if (ticket) { try { await send({ type: 'capture:failure', ticket, error: { code: error.code, message: error.message } }); } catch {} }
    const takeover = error.code === 'WRITER_MISMATCH' ? [{ label: 'このタブへ担当を移す', secondary: true, click: async () => { try { await send({ type: 'session:take-over' }); await analyze(); } catch (inner) { show('担当変更できません', inner.message, errorButtons()); } } }] : [];
    show('このstageで停止', error.message, [...takeover, ...errorButtons()]);
  } finally { busy = false; }
}

analyze();
