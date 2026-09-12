/* F3-only UI. Installing the button does not capture, scan, or save. */
import { MemoryTypedDraftStore, MemoryTypedSessionBackend, TypedOneTapSessionCoordinator, captureF3FixtureHtml, createTypedInspectionBatch } from '../../src/prototype/phase11-typed-one-tap-api.mjs';
import { f3Fixture } from '../phase11-f3-prep/fixtures.mjs';
const api=globalThis.browser??globalThis.chrome;
const LIVE_URL='https://jpnja.dokkaninfo.com/events/challenge/1705/17050015';
const root=document.createElement('section');root.id='phase11-f3-root';root.style.cssText='position:fixed;z-index:2147483647;right:8px;bottom:8px;max-width:min(360px,calc(100vw - 16px));box-sizing:border-box;padding:12px;border:1px solid #6d819d;border-radius:10px;background:#101827;color:#eef5ff;font:14px/1.5 system-ui,sans-serif;box-shadow:0 3px 18px #0008';
let activeCaptureId=null,busy=false;
const h=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
function render(title,message,actions=[],detail=''){root.replaceChildren(h('strong',title),h('p',message));if(detail){const small=h('small',detail);small.style.display='block';root.append(small);}for(const action of actions){const button=h(action.href?'a':'button',action.label);button.style.cssText='display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:9px;border:1px solid #89a4c8;border-radius:6px;background:#20589d;color:white;text-align:center;text-decoration:none;font:inherit';if(action.href){button.href=action.href;button.target='_blank';button.rel='noreferrer';}else button.addEventListener('click',action.run);root.append(button);}}
function target(){
  if(PHASE11_F3_FIXTURE_MODE){const marker=document.querySelector('[data-f3-snapshot]'),kind=document.querySelector('meta[name="phase11-f3-fixture-kind"]')?.content;if(!marker||!kind)return null;const eventId=marker.dataset.f3EventId,stageId=marker.dataset.f3StageId;return{eventId,stageId,url:window.location.href,eventHtml:f3Fixture(kind,{eventId,stageId}).eventHtml};}
  if(window.location.href!==LIVE_URL)return null;return{eventId:'1705',stageId:'17050015',url:LIVE_URL,eventHtml:null};
}
async function discard(){const response=await api.runtime.sendMessage({kind:'f3-discard',captureId:activeCaptureId});if(!response?.ok){render('破棄できませんでした','関連データの削除確認に失敗しました。',[],`補助code: ${response?.code??'F3_DELETE'}`);return;}activeCaptureId=null;render('限定確認を破棄しました','同じcaptureに属する保存情報を削除しました。');}
async function openReview(){const response=await api.runtime.sendMessage({kind:'f3-open-review',captureId:activeCaptureId});if(!response?.ok)render('確認画面を開けませんでした','保存結果は変更していません。',[],`補助code: ${response?.code??'F3_REVIEW_OPEN'}`);}
async function capture(){
  if(busy)return;busy=true;render('確認中','表示済みページを1回だけ固定して確認しています。');
  try{
    const selected=target();if(!selected)throw Object.assign(new Error('対象stageを確認できません。'),{code:'F3_TARGET'});
    const draftStore=new MemoryTypedDraftStore(),backend=new MemoryTypedSessionBackend(),session=new TypedOneTapSessionCoordinator({draftStore,backend});const writerId=`f3-extension:${crypto.randomUUID()}`;
    await session.start({eventId:selected.eventId,eventName:'F3限定確認',writerId,plan:[{id:`stage:${selected.stageId}`,kind:'stage-page',stageId:selected.stageId,url:selected.url,label:`stage ${selected.stageId}`}]});
    const ticket=await session.beginCapture({writerId,currentUrl:selected.url}),captureId=`f1-f3-${selected.stageId}-${crypto.randomUUID()}`;
    const result=await captureF3FixtureHtml({session,ticket,eventHtml:selected.eventHtml,expectedEventId:selected.eventId,expectedStageId:selected.stageId,captureInput:{readUrl:()=>window.location.href,readOuterHTML:()=>document.documentElement.outerHTML,captureId,now:()=>new Date().toISOString()}});
    const batch=await createTypedInspectionBatch({session});
    const saved=await api.runtime.sendMessage({kind:'f3-save',captureId,createdAt:result.scan.capture.observedAt,batch});if(!saved?.ok)throw Object.assign(new Error('保存と照合に失敗しました。'),{code:saved?.code??'F3_SAVE'});
    activeCaptureId=captureId;const actions=[{label:'取得結果を確認',run:openReview},{label:'この限定確認を破棄',run:discard}];
    if(result.classification==='full')render('完全データを保存しました','保存可能性とread-backを確認しました。',actions);
    else if(result.classification==='partial')render('一部の材料を保存しました','計算できるかどうかは、まだ判定していません。',actions);
    else render('このstageでは安全に保存できません','failure metadataだけを保持しました。',actions,`補助code: ${result.code}`);
  }catch(error){render('このstageの確認を停止しました',error?.message??'安全に確認できませんでした。',[],`補助code: ${error?.code??'F3_RUNTIME'}`);}finally{busy=false;}
}
export function installF3Button(){const selected=target();if(!selected)return null;api.runtime.sendMessage({kind:'f3-init'}).catch(()=>{});render('F3限定確認','明示操作前はページ内容を取得・解析・保存しません。',[{label:'このstageを確認',run:capture}]);document.body.append(root);return root;}
installF3Button();
