/** Pure F3 capture boundary. It receives readers so tests can prove one DOM read. */
import { digest } from './phase11-dokkaninfo-f1.mjs';
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const stageFromUrl=value=>{try{const u=new URL(value);const m=u.pathname.match(/\/events\/challenge\/(\d+)\/(\d+)\/?$/);return m?{eventId:m[1],stageId:m[2]}:null;}catch{return null;}};
export async function captureF3ImmutableSnapshot({readUrl,readOuterHTML,now=()=>new Date().toISOString(),expectedEventId,expectedStageId,captureId=`f1-f3-${crypto.randomUUID()}`}) {
  if(typeof readUrl!=='function'||typeof readOuterHTML!=='function'||!/^\d+$/.test(expectedEventId)||!/^\d+$/.test(expectedStageId)) fail('F3_CAPTURE_INPUT');
  const before=readUrl(), beforeId=stageFromUrl(before); if(!beforeId||beforeId.eventId!==expectedEventId||beforeId.stageId!==expectedStageId) fail('F3_URL_OWNERSHIP');
  const snapshot=readOuterHTML(); // Exactly once. The scanner receives this string, never the live document.
  const after=readUrl(); if(before!==after) fail('F3_URL_CHANGED'); if(typeof snapshot!=='string'||!snapshot.trim()) fail('F3_SNAPSHOT_EMPTY');
  return { snapshot, observedUrl:before, capture:{id:captureId,revision:1,observedAt:now(),snapshotDigest:await digest(snapshot)}, expectedEventId,expectedStageId };
}
