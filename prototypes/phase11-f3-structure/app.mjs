import { createStructureDiagnostic } from '../../src/prototype/phase11-f3-structure-diagnostic.mjs';

// Fixture-only UI. No live-site entry or extension integration is supplied.
const url = new URL(location.href);
if (url.hostname !== '127.0.0.1' || !url.pathname.startsWith('/generated/phase11-f3-structure/events/challenge/')) throw new Error('架空fixture専用です。');
const match = url.pathname.match(/\/events\/challenge\/(\d+)\/(\d+)\.html$/);
const section = document.querySelector('#f3-structure-ui');
const button = section.querySelector('button');
const output = section.querySelector('#result');
const run = createStructureDiagnostic({ expectedUrl:location.href, expectedEventId:match[1], expectedStageId:match[2],
  readUrl:()=>location.href, readOuterHTML:()=>document.documentElement.outerHTML });
button.addEventListener('click',async()=>{
  button.disabled = true;
  try {
    const result = await run.run();
    section.querySelector('h1').textContent = '構造診断結果';
    section.querySelector('#status').textContent = 'raw HTMLは保存していません。計算・取込判定は行っていません。ページ全体のcoverageは未確定です。';
    const labels = { detected:'検出', blank:'空欄', 'non-empty-unparsed':'表示あり・意味未解釈', missing:'欄が見つかりません', ambiguous:'対応が曖昧です' };
    const fields = { 'event-stage-identity':'event / stage識別候補', 'encounter-root':'戦闘区画候補', 'enemy-root':'敵欄候補', 'enemy-name':'敵名', 'type-class-candidate':'属性・区分候補', hp:'HP', atk:'ATK', def:'DEF', 'enemy-wide-count':'敵全体の回数', 'skill-region':'skill領域', 'super-root':'必殺技欄候補', 'super-name':'必殺技名', 'super-atk':'必殺ATK', 'hp-condition':'HP条件', probability:'確率', 'super-specific-count':'必殺技固有の回数', reuse:'再使用', 'orphan-condition':'所属を確認できないHP条件', 'aoe-region':'AOE領域候補', 'ai-region':'AI領域候補' };
    fields['unowned-enemy-root']='区画への所属が不明な敵欄候補';
    const parents = {encounter:'区画',enemy:'敵',attack:'必殺',condition:'条件',region:'領域',candidate:'候補'};
    const summary = document.createElement('p');
    summary.textContent = `敵候補 ${result.counts.enemies}件 / 必殺候補 ${result.counts.supers}件 / 未確定・欠落 ${result.issues.length}件`;
    output.append(summary);
    for (const item of result.observations) {
      const line = document.createElement('p');
      line.textContent = `${fields[item.field]} (${Object.entries(item.parent).map(([k,v])=>`${parents[k]} ${v+1}`).join(', ')})：${labels[item.state]}${item.candidates[0]?.text ? ' — '+item.candidates[0].text : ''}`;
      output.append(line);
    }
    const details = document.createElement('details'), title = document.createElement('summary'), pre = document.createElement('pre');
    title.textContent='診断の構造情報（補助）'; pre.textContent=JSON.stringify(result,null,2); details.append(title,pre); output.append(details);
  } catch {
    section.querySelector('h1').textContent='構造の確認を停止しました';
    section.querySelector('#status').textContent='URL変更、取得上限などにより安全に確認できませんでした。追加操作は不要です。raw HTMLは保存していません。';
  }
});
