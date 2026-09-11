/** Fictional source pages only. These are never opened or fetched as live URLs. */
import { SLOTS, SOURCE, TARGETS } from '../../src/prototype/phase11-partial-rules.mjs';
import { dokkanInfoEventHtml } from '../../tests/fixtures/phase11/dokkaninfo-source.mjs';
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const CASES = ['A', 'B', 'C', 'D', 'E', 'F'];
export function sourceFixture(caseId = 'A', { full = false, revision = 1 } = {}) {
  if (!CASES.includes(caseId)) throw new Error('Unknown fictional case');
  const defaults = {
    'enemy.type': '速', 'enemy.alignment': '超', 'enemy.hp': '10000000', 'enemy.baseAttack': '600000', 'enemy.defense': '150000',
    'attack.displayedDamage': '1000000', 'attack.maxPerTurn': full ? '1' : '', 'attack.probabilityPercent': '25', 'attack.cooldownTurns': '2',
    'attack.targetMode': '単体', 'attack.critical.enabled': '会心なし', 'attack.critical.attackUp': '対象外', 'attack.critical.defenseIgnore': '対象外',
    'condition.atkBasis': '履歴に依存しない確定ATK', 'condition.hpMinPercent': '0', 'condition.hpMaxPercent': '100',
    'effectAudit.coverage': 'この攻撃に関する架空ルールを全件収録'
  };
  if (caseId === 'B') defaults['condition.atkBasis'] = '履歴強化に依存';
  if (caseId === 'C') defaults['attack.displayedDamage'] = '未確認';
  if (caseId === 'D') defaults['enemy.type'] = '未確認';
  if (caseId === 'E') defaults['attack.displayedDamage'] = '0';
  const proof = (index, field) => `<span data-proof="hit-${index}/${field}">${esc(defaults[field])}</span>`;
  const hit = index => {
    const meta = SLOTS.filter(x => x.key.startsWith(`hit-${index}/`) && !x.path.startsWith('enemy.') && !['attack.displayedDamage', 'attack.maxPerTurn', 'attack.probabilityPercent', 'attack.cooldownTurns'].includes(x.path))
      .map(slot => `<div>${slot.label}: ${proof(index, slot.path)}</div>`).join('');
    return `<div class="super-header"><b>架空必殺${index}</b><div class="row align-items-center"><div class="col-sm">架空の単発攻撃</div><img src="/sp_skill_icon_etc.png" alt="other"></div></div>
      <div>ダメージ: ${proof(index, 'attack.displayedDamage')}</div><div>パーセンテージ: ${proof(index, 'attack.probabilityPercent')}%</div>
      <div>最大ATK/ターン: ${proof(index, 'attack.maxPerTurn')}</div><div>再使用までの時間: ${proof(index, 'attack.cooldownTurns')}</div>${meta}`;
  };
  const enemy = (indices, name) => {
    const index = indices[0];
    const repeats = indices.slice(1).map(i => SLOTS.filter(x => x.key.startsWith(`hit-${i}/`) && x.path.startsWith('enemy.')).map(x => `<div>${x.label}: ${proof(i, x.path)}</div>`).join('')).join('');
    return `<div class="row d-flex align-items-center">
      <div class="col"><a href="/cards/9000001"><img src="/layout/${caseId === 'D' ? 'type_unconfirmed' : 'cha_type_icon_10'}.png"></a><div class="font-size-1_2"><b>${name}</b></div>属性: ${proof(index, 'enemy.type')} 区分: ${proof(index, 'enemy.alignment')}</div>
      <div class="col-md-2"><div>HP: ${proof(index, 'enemy.hp')}</div> <div>ATK: ${proof(index, 'enemy.baseAttack')}</div> <div>DEF: ${proof(index, 'enemy.defense')}</div> <div>最大ATK/ターン: 8</div></div>
      <div class="col-md">${indices.map(hit).join('')}</div><div class="col-md"></div></div>${repeats}`;
  };
  const stageUrl = `https://jpnja.dokkaninfo.com/events/challenge/${SOURCE.eventId}/${SOURCE.stageId}`;
  const html = `<!doctype html><html data-offline-partial="1"><head><meta property="og:url" content="${stageUrl}"><title>部分材料用・架空ステージ | fixture</title></head><body>
    <div class="row margin-5 border border-1 border-main-box-darker bg-main">${enemy([0, 1], '架空の敵アルファ')}${enemy([2], '架空の敵ベータ')}</div>
    ${caseId === 'F' ? `<p data-uninterpreted="${TARGETS[0].attackId}">この攻撃の被ダメへ影響し得る未解釈の架空効果</p>` : ''}</body></html>`;
  return {
    html, eventHtml: dokkanInfoEventHtml({ eventId: SOURCE.eventId, eventName: '部分材料用・架空event', stages: [{ id: SOURCE.stageId, name: '部分材料用・架空ステージ' }] }),
    capture: { id: `fictional-capture-${caseId}-${full ? 'full' : 'partial'}-${revision}`, revision, observedAt: '2026-09-01T00:00:00.000Z' }
  };
}
export function defenderFixture(caseId = 'A') {
  return { alignment: 'super', type: 'agl', finalDefense: caseId === 'E' ? 0 : 300000, reduction: 20, guard: false, typeDefense: 0, targetDamage: caseId === 'E' ? 0 : 50000 };
}
