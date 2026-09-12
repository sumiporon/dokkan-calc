/* Read-only typed inspection review. It imports no existing full receiver. */
import { TypedInspectionReceiver } from '../../src/prototype/phase11-typed-one-tap-api.mjs';
const api=globalThis.browser??globalThis.chrome,root=document.querySelector('#screen');
const captureId=decodeURIComponent(location.hash.replace(/^#capture=/,''));
function render(title,message,detail=''){root.replaceChildren();const h=document.createElement('h1'),p=document.createElement('p');h.textContent=title;p.textContent=message;root.append(h,p);if(detail){const small=document.createElement('p');small.className='small';small.textContent=detail;root.append(small);}}
async function discard(){const response=await api.runtime.sendMessage({kind:'f3-discard',captureId});if(!response?.ok){render('破棄できませんでした','関連データの削除確認に失敗しました。',`補助code: ${response?.code??'F3_DELETE'}`);return;}render('限定確認を破棄しました','同じcaptureに属する保存情報を削除しました。');}
async function route(){try{
  const response=await api.runtime.sendMessage({kind:'f3-read',captureId});if(!response?.ok)throw Object.assign(new Error('保存結果を読み出せません。'),{code:response?.code});
  const review=await new TypedInspectionReceiver().receive(response.batch),stage=review.stages[0];
  render('取得結果の確認',`${stage.label}: ${stage.ownerMessage}`,'受信時に再検証した読み取り専用の結果です。数値計算や適用は行いません。');
  const button=document.createElement('button');button.textContent='この限定確認を破棄';button.addEventListener('click',discard);root.append(button);
}catch(error){render('確認結果を表示できません','保存情報の再検証で停止しました。',`補助code: ${error?.code??'F3_REVIEW'}`);}}
route();
