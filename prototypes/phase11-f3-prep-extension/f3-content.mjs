/* Candidate source only: no automatic analysis, navigation, or source request. */
import { captureF3ImmutableSnapshot } from '../../src/prototype/phase11-f3-capture.mjs';
const exact = 'https://jpnja.dokkaninfo.com/events/challenge/1705/17050015';
export function installF3PrepButton({ onCapture }) {
  if (window.location.href !== exact) return null;
  const button=document.createElement('button'); button.textContent='このstageを確認';
  button.addEventListener('click',async()=>{const captured=await captureF3ImmutableSnapshot({readUrl:()=>window.location.href,readOuterHTML:()=>document.documentElement.outerHTML,expectedEventId:'1705',expectedStageId:'17050015'});await onCapture(captured);});
  document.body.append(button); return button;
}
