/** Two self-authored F2 event plans. They contain no live-source values. */
import { fixture } from '../phase11-dokkaninfo-f1/fixtures.mjs';
const make = (eventId, eventName, specs) => {
  const stages = specs.map(({ stageId, label }) => ({ id: stageId, name: label }));
  return { eventId, eventName, plan: specs.map(({ stageId, label }) => ({ id:`stage:${stageId}`, kind:'stage-page', stageId, url:`https://fixture.invalid/f2/${eventId}/${stageId}`, label })),
    pages: specs.map(({ stageId, label, caseId }) => fixture(caseId, { eventId, stageId, stageName:label, stages })) };
};
export const eventA = make('990021','F2・架空mixed event',[{stageId:'99002101',label:'F2 完全stage 1',caseId:'A'},{stageId:'99002102',label:'F2 部分stage',caseId:'B'},{stageId:'99002103',label:'F2 完全stage 2',caseId:'A'}]);
export const eventB = make('990022','F2・架空停止event',[{stageId:'99002201',label:'F2 完全stage',caseId:'A'},{stageId:'99002202',label:'F2 部分stage',caseId:'B'},{stageId:'99002203',label:'F2 利用不可stage',caseId:'D'},{stageId:'99002204',label:'F2 未取得stage',caseId:'A'}]);
export const eventZero = make('990023','F2・既知0 event',[{stageId:'99002301',label:'F2 known 0 stage',caseId:'F'}]);
