/** Self-authored only. No real enemy values or live captured HTML. */
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const row = (label, value) => `<div><b>${label}:</b><span>${value}</span></div>`;
export const icon = `<img alt="" src="${pixel}#sp_skill_icon_etc.png">`;
export const header = (byClass = true, icons = 1) => `<div class="${byClass ? 'super-header' : 'other-header'}"><b>架空の光線</b>${icon.repeat(icons)}</div>`;
export const band = (hp = '0% ~ 100%', count = '0') => `${row('HPレンジ', hp)}${row('パーセンテージ', '23%')}${row('最大ATK/ターン', count)}${row('再使用までの時間', '2')}`;
export const skillRow = text => `<div class="row"><div class="col-sm-9">${text}</div><div class="col-sm-3">値: 3 / ID: 90001</div></div>`;
export function fixtureHTML({ stageId = '99330001', supers = header() + row('ダメージ', '420') + band(), skills = skillRow('架空効果の説明'), adjacent = '', statsExtra = '', enemyCount = 1 } = {}) {
  const enemy = `<div class="row d-flex align-items-center"><div class="col"><div class="font-size-1_2"><b>架空の敵</b></div><img alt="" src="${pixel}#cha_type_icon_22.png"></div><div class="col-md-2">${row('HP', '1200')}${row('ATK', '240')}${row('DEF', '0')}${row('最大ATK/ターン', '8')}${statsExtra}</div><div class="col-md">${supers}</div><div class="col-md">${skills}</div></div>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta property="og:url" content="https://fixture.invalid/events/challenge/993300/${stageId}"><title>v2 自作fixture</title></head><body><main><div class="row margin-5 border border-1 border-main-box-darker bg-main">${enemy.repeat(enemyCount)}${adjacent}</div></main></body></html>`;
}
export const CASES = Object.freeze({ normal: '通常構造・複数HP条件', noClass: 'classなし・icon 1', noIcon: 'classあり・icon 0', manyIcons: 'classあり・icon複数', bothMismatch: 'classなし・icon複数', sameText: '同じtext node内のlabelと値', oneBand: 'HP条件1件', ambiguousBand: '条件区間の所属が曖昧', blank: '空欄と表示0', missingReuse: 'reuse表示なし', skills: 'skill複数行と長い説明', nearby: '別階層のAI・AOE候補', missing: 'AI・AOE未検出', duplicate: '同じfieldの重複', deep: '深さ上限で未観測', ownership: 'stage所属不一致', enclosed: '曖昧なroot内部の複数HP条件' });
export function fixture(kind = 'normal') {
  const index = Object.keys(CASES).indexOf(kind); if (index < 0) throw new Error('Unknown fixture');
  const stageId = String(99330001 + index), config = { stageId };
  if (kind === 'normal') config.supers = header() + row('ダメージ', '420') + band('40% ~ 100%') + band('0% ~ 39%', '');
  if (kind === 'noClass') config.supers = header(false) + row('ダメージ', '420') + band();
  if (kind === 'noIcon') config.supers = header(true, 0) + row('ダメージ', '420') + band();
  if (kind === 'manyIcons') config.supers = header(true, 2) + row('ダメージ', '420') + band();
  if (kind === 'bothMismatch') config.supers = header(false, 2) + row('ダメージ', '420') + band();
  if (kind === 'sameText') config.supers = header() + '<div>ダメージ: 420</div><div>HPレンジ: 0% ~ 100%</div><div>パーセンテージ: 23%</div><div>最大ATK/ターン: 0</div><div>再使用までの時間: 2</div>';
  if (kind === 'ambiguousBand') config.supers = header() + '<section><div>HPレンジ: 40% ~ 100%</div><div>パーセンテージ: 23%</div><div>HPレンジ: 0% ~ 39%</div><div>パーセンテージ: 46%</div></section>';
  if (kind === 'blank') config.supers = header() + row('ダメージ', '420') + band('40% ~ 100%', '') + band('0% ~ 39%', '0');
  if (kind === 'missingReuse') config.supers = (header() + row('ダメージ', '420') + band()).replace(row('再使用までの時間', '2'), '');
  if (kind === 'skills') config.skills = skillRow('架空効果A') + skillRow('架空効果B') + skillRow('架空の長い説明'.repeat(40));
  if (kind === 'nearby') config.adjacent = '<aside><div>AI: 架空の順序記述</div><div>AOE: 架空の対象記述</div></aside>';
  if (kind === 'duplicate') config.supers = header() + row('ダメージ', '420') + band() + row('最大ATK/ターン', '99');
  if (kind === 'deep') config.supers = header() + '<section><div><div><b>HPレンジ:</b> 0% ~ 100%</div></div></section>';
  if (kind === 'enclosed') config.supers = `<div class="other-header"><b>架空の内部必殺</b>${icon}${row('ダメージ', '420')}${band('40% ~ 100%', '')}${band('0% ~ 39%', '0')}</div>`;
  let html = fixtureHTML(config);
  if (kind === 'ownership') html = html.replace(`/993300/${stageId}`, '/993300/99999999');
  return { kind, html, stageId, eventId: '993300' };
}
