/** Entirely authored numbers and identities; no real event/stage data. */
export const known = value => ({ state: 'known', value, evidenceIds: ['fixture:single-hit-premise'], confidence: 'high' });
export const unknown = () => ({ state: 'unknown', value: null, evidenceIds: [], confidence: 'unconfirmed' });
function base(id, title) {
  return {
    id, title, purpose: 'self-authored-single-hit-fixture',
    enemy: { alignment: known('super'), type: known('agl') },
    attack: { id: `fictional:attack:${id}`, displayedDamage: known(1000000), maxPerTurn: unknown(), targetMode: known('single'), critical: { enabled: known(false) } },
    condition: { id: `fictional:condition:${id}`, atkBasis: known('fixed-history-independent') },
    effectAudit: { coverage: known('complete-for-selected-hit'), unresolved: [] },
    defender: { alignment: known('super'), type: known('agl'), finalDefense: known(300000), reduction: known(20), guard: known(false), typeDefense: known(0) },
    targetDamage: known(50000)
  };
}
const a = base('A', '回数不明・この1発は確定');
const b = base('B', '回数不明・必殺後の重複強化に依存'); b.condition.atkBasis = known('history-dependent');
const c = base('C', '1発ATKが不明'); c.attack.displayedDamage = unknown();
const d = base('D', '敵属性が不明'); d.enemy.type = unknown();
const e = base('E', '確認済みのATK 0'); e.attack.displayedDamage = known(0); e.defender.finalDefense = known(0); e.targetDamage = known(0);
const f = base('F', '影響し得る効果が未解釈'); f.effectAudit.unresolved = [{ affects: ['damage', 'zero-defense', 'target-defense'] }];
export const fixtures = [a, b, c, d, e, f];
