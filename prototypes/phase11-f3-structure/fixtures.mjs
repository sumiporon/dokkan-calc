/** All names, identifiers and values are fictional. No data-f3 contract markers. */
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const row = (label, value) => `<div><b>${label}:</b> ${value}</div>`;
function superBlock(name, blank) {
  return `<div class="super-header"><b>${name}</b><img alt="" src="${pixel}#sp_skill_icon_etc.png"></div>
    ${row('ダメージ', '300')}${row('パーセンテージ', '20%')}${row('最大ATK/ターン', blank ? '' : '0')}${row('再使用までの時間', '0')}
    <div>HPレンジ: 0% ~ 100%</div>${row('パーセンテージ', '20%')}${row('最大ATK/ターン', blank ? '' : '0')}${row('再使用までの時間', '0')}`;
}
function enemy(name, blank) {
  return `<div class="row d-flex align-items-center">
    <div class="col"><div class="font-size-1_2"><b>${name}</b></div><img alt="" src="${pixel}#cha_type_icon_22.png"></div>
    <div class="col-md-2">${row('HP','1000')}${row('ATK','200')}${row('DEF','0')}${row('最大ATK/ターン','7')}</div>
    <div class="col-md">${superBlock('架空必殺α',blank)}${superBlock('架空必殺β',false)}${row('エリア/ターン','1')}${row('エリアダメージ 1','100')}</div>
    <div class="col-md">架空のskill記述。意味は未解釈。</div>
  </div>`;
}
export const CASES = Object.freeze({ normal:'複数の敵・必殺とAI/AOE/skill', blank:'必殺固有の回数が空欄', orphan:'条件の親子関係が不明', ambiguous:'敵rootが曖昧', missing:'重要領域の欠落', duplicate:'同じ欄の重複' });
export const EVENT_ID = '992200';
export function structureFixture(kind = 'normal') {
  if (!Object.hasOwn(CASES,kind)) throw new Error('Unknown fixture');
  const stageId = String(99220001 + Object.keys(CASES).indexOf(kind));
  let first = enemy('架空の敵A', kind === 'blank');
  if (kind === 'orphan') first = first.replace('<div class="super-header">', '<div>HPレンジ: 10% ~ 90%</div><div class="super-header">');
  if (kind === 'ambiguous') first = `<div class="row d-flex align-items-center">${first}</div>`;
  if (kind === 'missing') first = first.replace(row('HP','1000'),'').replace('<div class="col-md">架空のskill記述。意味は未解釈。</div>','<div class="col-md"></div>');
  if (kind === 'duplicate') first = first.replace(row('ATK','200'),row('ATK','200') + row('ATK','999'));
  const ai = kind === 'missing' ? '' : '<div class="row border border-1 border-main-box-darker margin-3">アクション 1/スロット 1: 架空のAI記述</div>';
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta property="og:url" content="https://fixture.invalid/events/challenge/${EVENT_ID}/${stageId}"><title>構造診断・自作fixture</title></head><body><main><div class="row margin-5 border border-1 border-main-box-darker bg-main">${first}${enemy('架空の敵B',false)}${ai}</div></main></body></html>`;
  return { html, eventId:EVENT_ID, stageId, kind };
}
