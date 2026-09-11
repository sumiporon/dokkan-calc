/** Offline, trusted-fixture proof only. NOT a real-source intake/permission gate.
 * Canonical field states are retained. No persistence, state enumeration or I/O.
 * The caller supplies the existing calculation core after loading it locally.
 */
export const SINGLE_HIT_OUTPUTS = Object.freeze(['damage', 'zero-defense', 'target-defense']);
export const SINGLE_HIT_VERSION = 'phase11-single-hit-1';
const LIMIT = 1_000_000_000_000;
const TYPES = ['agl', 'teq', 'int', 'str', 'phy'];
const CLASSES = ['super', 'extreme', 'neutral'];
const finite = (min, max) => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const oneOf = values => value => values.includes(value);
const LABELS = {
  'condition.atkBasis': '履歴に依存しない1発ATKの条件',
  'effectAudit.coverage': 'この1発に影響する効果の確認範囲',
  'attack.targetMode': '攻撃対象', 'attack.displayedDamage': '1発ATK',
  'enemy.alignment': '敵の超・極・中立', 'enemy.type': '敵属性',
  'defender.alignment': '自分の超・極', 'defender.type': '自分の属性',
  'defender.guard': '全属性ガード', 'defender.reduction': 'ダメージ軽減率',
  'defender.typeDefense': '属性防御レベル', 'defender.finalDefense': '現在の最終DEF',
  'attack.critical.enabled': 'この1発の会心有無', 'attack.critical.attackUp': '会心ATK補正',
  'attack.critical.defenseIgnore': '会心DEF無視率', targetDamage: '目標被ダメ'
};

export function evaluateSingleHit(input, output, core) {
  const result = {
    version: SINGLE_HIT_VERSION, output,
    attackId: input?.attack?.id ?? null, conditionId: input?.condition?.id ?? null,
    scope: 'この1発を受けた場合（発動回数・発動順序は保証しません）',
    status: 'blocked', reasons: [], dependencies: []
  };
  const stop = (code, path, message) => result.reasons.push({ code, path, message });
  if (!SINGLE_HIT_OUTPUTS.includes(output)) {
    result.status = 'unsupported'; stop('OUTPUT_UNSUPPORTED', 'output', 'この出力は第1prototypeでは未対応です。'); return result;
  }
  if (input?.purpose !== 'self-authored-single-hit-fixture'
    || typeof input?.attack?.id !== 'string' || !input.attack.id.startsWith('fictional:')
    || typeof input?.condition?.id !== 'string' || !input.condition.id.startsWith('fictional:')) {
    stop('FIXTURE_ONLY', 'input', '自作fixtureの攻撃と条件だけを扱います。'); return result;
  }
  function read(field, path, predicate) {
    result.dependencies.push(path);
    const label = LABELS[path] ?? path;
    if (field?.state !== 'known') { stop('FIELD_NOT_KNOWN', path, `${label}が未確認です。`); return undefined; }
    if (field.confidence !== 'high' || !Array.isArray(field.evidenceIds) || !field.evidenceIds.length
      || !field.evidenceIds.every(id => typeof id === 'string' && id.startsWith('fixture:')) || !predicate(field.value)) {
      stop('FIELD_INVALID', path, `${label}の値または根拠を確認できません。`); return undefined;
    }
    return field.value;
  }
  const attack = input.attack;
  // These are authored fixture premises, not evidence inferred from missing data.
  read(input.condition.atkBasis, 'condition.atkBasis', oneOf(['fixed-history-independent']));
  read(input.effectAudit?.coverage, 'effectAudit.coverage', oneOf(['complete-for-selected-hit']));
  if (!Array.isArray(input.effectAudit?.unresolved)) stop('EFFECT_AUDIT_MISSING', 'effectAudit.unresolved', '効果の確認記録がありません。');
  else for (const effect of input.effectAudit.unresolved) {
    if (!Array.isArray(effect?.affects) || !effect.affects.length
      || effect.affects.some(item => ![...SINGLE_HIT_OUTPUTS, 'enemy-defense'].includes(item))
      || effect.affects.includes(output)) {
      stop('UNINTERPRETED_EFFECT', 'effectAudit.unresolved', '未解釈効果がこの結果へ影響し得るため停止しました。');
    }
  }
  read(attack.targetMode, 'attack.targetMode', oneOf(['single']));
  const atk = read(attack.displayedDamage, 'attack.displayedDamage', finite(0, LIMIT));
  const enemyClass = read(input.enemy?.alignment, 'enemy.alignment', oneOf(CLASSES));
  const enemyType = read(input.enemy?.type, 'enemy.type', oneOf(TYPES));
  const ownClass = read(input.defender?.alignment, 'defender.alignment', oneOf(['super', 'extreme']));
  const ownType = read(input.defender?.type, 'defender.type', oneOf(TYPES));
  const guard = read(input.defender?.guard, 'defender.guard', value => typeof value === 'boolean');
  const reduction = read(input.defender?.reduction, 'defender.reduction', finite(0, 100));
  const typeDefense = read(input.defender?.typeDefense, 'defender.typeDefense', value => Number.isInteger(value) && value >= 0 && value <= 30);
  const critical = read(attack.critical?.enabled, 'attack.critical.enabled', value => typeof value === 'boolean');
  // Known false makes these modifiers inactive; this is not unknown -> zero.
  let criticalAtk = 0; let criticalIgnore = 0;
  if (critical === true) {
    criticalAtk = read(attack.critical.attackUp, 'attack.critical.attackUp', finite(0, 1000));
    criticalIgnore = read(attack.critical.defenseIgnore, 'attack.critical.defenseIgnore', finite(0, 100));
  }
  const defense = output === 'damage' ? read(input.defender?.finalDefense, 'defender.finalDefense', value => Number.isSafeInteger(value) && value >= 0 && value <= LIMIT) : undefined;
  const target = output === 'target-defense' ? read(input.targetDamage, 'targetDamage', value => Number.isSafeInteger(value) && value >= 0 && value <= LIMIT) : 0;
  if (result.reasons.length) return result; // No core call with blocked input.

  const modifiers = core.calculateModifiers({
    own_class: ownClass, own_type: ownType,
    // Preserve the approved neutral-alignment handling, not unknown affinity.
    enemy_class: enemyClass === 'neutral' ? ownClass : enemyClass, enemy_type: enemyType,
    is_guard: guard, attr_def_up: typeDefense, dr_input: reduction,
    is_critical: critical, crit_atk_up: criticalAtk, crit_def_down: criticalIgnore
  });
  if (!['def_crit_mod', 'attr_mod', 'guard_mod', 'dr_mod', 'atk_crit_mod']
    .every(key => finite(0, LIMIT)(modifiers[key]))) {
    stop('MODIFIERS_INVALID', 'calculation', '補正計算が対応範囲外です。'); return result;
  }
  function rangeAt(finalDefense) {
    const range = core.calculateDamageRange(atk, {
      ...modifiers, final_def: finalDefense,
      final_def_crit_mod: finalDefense * modifiers.def_crit_mod
    });
    if (!finite(0, Number.MAX_SAFE_INTEGER)(range?.minimum)
      || !finite(0, Number.MAX_SAFE_INTEGER)(range?.maximum) || range.minimum > range.maximum) {
      throw new Error('対応範囲内の被ダメ値を確認できません。');
    }
    return range;
  }
  try {
    if (output === 'damage') {
      result.value = rangeAt(defense);
      result.variance = { minimum: core.DAMAGE_VARIANCE_MIN, maximum: core.DAMAGE_VARIANCE_MAX };
    } else {
      // Monotone forward-core search avoids an independent inverse formula.
      // LIMIT is an explicit supported numeric bound, never a guessed DEF.
      if (rangeAt(0).maximum <= target) result.value = 0;
      else if (modifiers.def_crit_mod === 0) {
        result.status = 'unattainable'; stop('DEF_HAS_NO_EFFECT', 'attack.critical.defenseIgnore', 'この条件ではDEFを増やしても目標に到達できません。'); return result;
      } else if (rangeAt(LIMIT).maximum > target) {
        result.status = 'unsupported'; stop('DEF_RANGE_UNSUPPORTED', 'defense', '必要DEFがprototypeの対応範囲を超えています。'); return result;
      } else {
        let lower = 0; let upper = LIMIT;
        while (upper - lower > 1) {
          const middle = Math.floor((lower + upper) / 2);
          if (rangeAt(middle).maximum <= target) upper = middle; else lower = middle;
        }
        if (rangeAt(upper).maximum > target || rangeAt(upper - 1).maximum <= target) throw new Error('必要DEFの最小性を確認できません。');
        result.value = upper;
      }
      result.unit = 'final-defense'; result.targetDamage = target;
    }
    result.status = 'available'; return result;
  } catch (error) {
    delete result.value; delete result.variance;
    stop('CALCULATION_INVALID', 'calculation', error.message); return result;
  }
}
