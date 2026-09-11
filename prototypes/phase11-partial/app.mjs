import core from '../../src/calculation-core.js';
import { inspectFictionalPartial } from '../../src/prototype/phase11-partial-adapter.mjs';
import { calculatePartial } from '../../src/prototype/phase11-partial-material.mjs';
import { PartialMaterialStore } from '../../src/prototype/phase11-partial-store.mjs';
import { SINGLE_HIT_OUTPUTS } from '../../src/prototype/phase11-single-hit.mjs';
import { sourceFixture, defenderFixture } from './fixtures.mjs';
const $ = id => document.getElementById(id), store = new PartialMaterialStore();
let current = null, previous = null, busy = false;
const labels = { damage: 'この1発の被ダメ', 'zero-defense': 'この1発：完封に必要な最終DEF', 'target-defense': 'この1発：目標被ダメ以下に必要な最終DEF' };
const fmt = n => n.toLocaleString('ja-JP');
function controls() { $('case').disabled = busy; $('save').disabled = busy || !current; $('rollback').disabled = busy || !previous; }
async function renderMaterial(material) {
  current = material; $('full-check').textContent = 'full検査：不合格（現行完全取込基準は維持）';
  $('partial-check').textContent = 'partial material：保存可能（根拠検証済み）'; $('results').replaceChildren();
  const caseId = material.capture.id.match(/^fictional-capture-([A-F])-/)[1]; $('case').value = caseId;
  const defender = defenderFixture(caseId);
  $('settings').textContent = `自作の自分側設定：最終DEF ${fmt(defender.finalDefense)}／軽減20%／超速／ガードなし／属性防御0／目標被ダメ ${fmt(defender.targetDamage)}`;
  const outputs = await Promise.all(SINGLE_HIT_OUTPUTS.map(output => calculatePartial(material, output, defender, core)));
  let available = 0;
  for (const result of outputs) {
    const article = document.createElement('article'); article.dataset.output = result.output; article.dataset.status = result.status;
    const heading = document.createElement('h2'); heading.textContent = labels[result.output]; article.append(heading);
    const body = document.createElement('p');
    if (result.status === 'available') {
      available++; body.className = 'value';
      body.textContent = '算出可能：' + (result.output === 'damage' ? result.value.maximum === 0 ? '0 ／ この1発：完封' : `${fmt(result.value.minimum)}～${fmt(result.value.maximum)}` : fmt(result.value));
    } else { body.className = 'blocked'; body.textContent = `${result.status === 'unsupported' ? '計算未対応' : result.status === 'unattainable' ? '目標へ到達不可' : '情報不足'}：${result.reasons.map(r => r.message).join(' ')}`; }
    article.append(body); $('results').append(article);
  }
  $('availability').textContent = available ? `single-hit capability：${available}/3出力を算出可能。幅は乱数1.00～1.03のみです。` : '材料のみ保存・現在は計算できません';
  $('evidence').textContent = JSON.stringify({ kind: material.kind, formatVersion: material.formatVersion, source: material.source, capture: material.capture,
    versions: material.versions, contentDigest: material.contentDigest, selectedFields: material.fields.filter(f => ['hit-0/attack.displayedDamage','hit-0/attack.maxPerTurn'].includes(f.slot)),
    evidence: material.evidence.filter(e => ['hit-0/attack.displayedDamage','hit-0/attack.maxPerTurn'].includes(e.slot)), uninterpreted: material.uninterpreted, coverage: material.coverage }, null, 2);
}
async function run(action) {
  if (busy) return; busy = true; controls();
  try { await action(); }
  catch (error) { current = null; $('results').replaceChildren(); $('availability').textContent = ''; $('partial-check').textContent = 'partial material：検査または保存で停止'; $('storage-status').textContent = `停止：${error.code ?? error.message}`; }
  finally { busy = false; controls(); }
}
async function choose() {
  const selected = $('case').value, saved = await store.load(); previous = saved.previous;
  current = null; $('results').replaceChildren(); $('evidence').textContent = ''; $('settings').textContent = ''; $('availability').textContent = '';
  const inspection = await inspectFictionalPartial(sourceFixture(selected === 'FULL' ? 'A' : selected, { full: selected === 'FULL', revision: (saved.current?.capture.revision ?? 0) + 1 }));
  if (inspection.kind === 'full') { $('full-check').textContent = 'full検査：合格（既存package生成・再検証成功）'; $('partial-check').textContent = 'partial material：対象外。fullを部分材料として保存しません。'; }
  else await renderMaterial(inspection.material);
  $('storage-status').textContent = `表示中の材料は未保存です。現在の保存：${saved.current ? saved.current.capture.id : 'なし'}`;
}
$('case').addEventListener('change', () => run(choose));
$('save').addEventListener('click', () => run(async () => {
  const saved = await store.save(current); previous = saved.previous; await renderMaterial(saved.current);
  $('storage-status').textContent = `保存成功・read-back照合済み：${saved.current.capture.id}`;
}));
$('rollback').addEventListener('click', () => run(async () => {
  const saved = await store.rollback(); previous = saved.previous; await renderMaterial(saved.current);
  $('storage-status').textContent = `rollback成功：${saved.current.capture.id}`;
}));
await run(async () => {
  const saved = await store.load(); previous = saved.previous;
  if (saved.current) { await renderMaterial(saved.current); $('storage-status').textContent = `保存済み材料を根拠から再検証して復元：${saved.current.capture.id}`; }
  else await choose();
});
