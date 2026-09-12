/** Self-authored fictional snapshots only.  No live source values are used. */
import { dokkanInfoEventHtml, dokkanInfoStageHtml } from '../../tests/fixtures/phase11/dokkaninfo-source.mjs';
export const eventHtml = dokkanInfoEventHtml({ eventId:'990001', stages:[{id:'99000101',name:'架空ステージ1'}] });
export function fixture(caseId) {
  let html=dokkanInfoStageHtml({ eventId:'990001',stageId:'99000101',stageName:'架空ステージ1' });
  if (caseId==='B') html=html.replaceAll('<b>最大ATK/ターン:</b> 1','<b>最大ATK/ターン:</b> ').replaceAll('最大ATK/ターン: 1</div>','最大ATK/ターン: </div>');
  if (caseId==='C') html=html.replace('<b>ダメージ:</b> 1,500,000','<b>ダメージ:</b> 解釈不能な架空値').replace('1ターンATKが大幅上昇する架空説明','未解釈の架空効果: 条件不明');
  if (caseId==='D') html=html.replace('<div class="super-header">','<div>HPレンジ: 0% ~ 100%</div><div class="super-header">');
  if (caseId==='E') html=html.replace('<div class="row border border-1 border-main-box-darker margin-3">','<div class="row d-flex align-items-center"><div class="col"><img src="/layout/cha_type_icon_22.png"></div></div><div class="row border border-1 border-main-box-darker margin-3">');
  if (caseId==='F') html=dokkanInfoStageHtml({ eventId:'990001',stageId:'99000101',stageName:'架空ステージ1',def:0 });
  return { eventHtml, stageHtml:html, captureId:`f1-${caseId}`, revision:1, capturedAt:'2025-09-12T00:00:00.000Z', expectedEventId:'990001', expectedStageId:'99000101' };
}
