/** Explicit rules for our fictional source language only; no live-site semantics. */
export const FORMAT = 'phase11-partial-material-1';
export const VERSIONS = Object.freeze({ adapter: 'fictional-partial-1', extraction: 'proof-cells-1', interpretation: 'fictional-single-hit-1' });
export const SOURCE = Object.freeze({ key: 'self-authored-partial', region: 'jpnja', eventId: '990011', stageId: '99001101' });
export const TARGETS = Object.freeze([
  { enemyId: 'fictional:enemy:alpha', attackId: 'fictional:attack:alpha-a', conditionId: 'fictional:condition:alpha-a' },
  { enemyId: 'fictional:enemy:alpha', attackId: 'fictional:attack:alpha-b', conditionId: 'fictional:condition:alpha-b' },
  { enemyId: 'fictional:enemy:beta', attackId: 'fictional:attack:beta-a', conditionId: 'fictional:condition:beta-a' }
]);
const definitions = {
  'enemy.type': ['属性', 'type'], 'enemy.alignment': ['区分', 'alignment'],
  'enemy.hp': ['HP', 'number'], 'enemy.baseAttack': ['ATK', 'number'], 'enemy.defense': ['DEF', 'number'],
  'attack.displayedDamage': ['ダメージ', 'number'], 'attack.maxPerTurn': ['最大ATK/ターン', 'number'],
  'attack.probabilityPercent': ['パーセンテージ', 'number'], 'attack.cooldownTurns': ['再使用までの時間', 'number'],
  'attack.targetMode': ['攻撃対象', 'target'], 'attack.critical.enabled': ['会心', 'boolean'],
  'attack.critical.attackUp': ['会心ATK補正', 'number'], 'attack.critical.defenseIgnore': ['会心DEF無視率', 'number'],
  'condition.atkBasis': ['ATKの前提', 'basis'], 'condition.hpMinPercent': ['HP下限', 'number'],
  'condition.hpMaxPercent': ['HP上限', 'number'], 'effectAudit.coverage': ['効果の収録範囲', 'coverage']
};
export const SLOTS = TARGETS.flatMap((target, index) => Object.entries(definitions).map(([path, [label, type]]) => ({
  key: `hit-${index}/${path}`, path, label, type, ...target
})));
export const PRIMARY = TARGETS[0];
export function insist(ok, code, message = code) { if (!ok) throw Object.assign(new Error(message), { code }); }
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(stable(value));
  return `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('')}`;
}
export function exactKeys(value, keys, code = 'FORMAT') {
  insist(value && typeof value === 'object' && !Array.isArray(value) && stable(Object.keys(value).sort()) === stable([...keys].sort()), code);
}
export function safeText(value) { return typeof value === 'string' && value.length <= 240 && !/[<>\u0000-\u001f]/.test(value); }
export function interpret(slot, rawText) {
  insist(safeText(rawText), 'TEXT_INVALID');
  if (rawText === '') return { state: 'unavailable', value: null, confidence: 'unconfirmed' };
  if (rawText === '未確認') return { state: 'unknown', value: null, confidence: 'unconfirmed' };
  if (rawText === '対象外') {
    insist(['attack.critical.attackUp', 'attack.critical.defenseIgnore'].includes(slot.path), 'NOT_APPLICABLE_INVALID');
    return { state: 'not-applicable', value: null, confidence: 'high' };
  }
  const literals = {
    type: { 速: 'agl', 技: 'teq', 知: 'int', 力: 'str', 体: 'phy' }, alignment: { 超: 'super', 極: 'extreme', 中立: 'neutral' },
    target: { 単体: 'single', 全体: 'all' }, boolean: { 会心なし: false, 会心あり: true },
    basis: { 履歴に依存しない確定ATK: 'fixed-history-independent', 履歴強化に依存: 'history-dependent' },
    coverage: { この攻撃に関する架空ルールを全件収録: 'complete-for-selected-hit' }
  };
  const value = slot.type === 'number'
    ? (/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rawText) ? Number(rawText) : undefined)
    : literals[slot.type]?.[rawText];
  // Unrecognized source text stays unknown; empty is never Number('') -> 0.
  return value === undefined || (typeof value === 'number' && !Number.isSafeInteger(value) && !Number.isFinite(value))
    ? { state: 'unknown', value: null, confidence: 'unconfirmed' }
    : { state: 'known', value, confidence: 'high' };
}
