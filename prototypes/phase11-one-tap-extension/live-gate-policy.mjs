/** One owner-approved event; stage URLs must come from the displayed event. */
export const LIVE_EVENT_ID = '1705';
export function assertLiveGateMeaning(pack) {
  for (const event of pack.canonical.events) for (const stage of event.stages) for (const encounter of stage.encounters) {
    if (encounter.areaAttacks.some(area => area.attackKind.state !== 'known')) {
      throw Object.assign(new Error('AOE_SEMANTICS_UNRESOLVED: 全体攻撃の種別を確定できないため、このstageで停止しました。'), { code: 'AOE_SEMANTICS_UNRESOLVED' });
    }
  }
}
export function liveGatePlan(material, units) {
  const fixture = typeof PHASE11_FIXTURE_MODE !== 'undefined' && PHASE11_FIXTURE_MODE;
  const eventId = fixture ? '990001' : LIVE_EVENT_ID;
  if (material?.eventId !== eventId || material.pageKind !== 'event') throw new Error('今回の限定検証の対象eventではありません。');
  const links = material.stageLinks.slice(0, 3);
  if (links.length < 2) throw new Error('対象stageが2件以上確認できないため停止しました。');
  if (!Array.isArray(units) || units.length < links.length) throw new Error('訪問計画を確認できません。');
  const plan = units.slice(0, links.length);
  for (const [index, unit] of plan.entries()) {
    const link = links[index];
    if (unit.stageId !== link.stageId || unit.sourceUrl !== link.href
      || (!fixture && unit.url !== link.href)) throw new Error('表示eventのstageリンクと計画が一致しません。');
  }
  return plan;
}
