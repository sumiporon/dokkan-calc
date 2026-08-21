const TYPE_ADVANTAGE = Object.freeze({
  teq: 'agl',
  agl: 'str',
  str: 'phy',
  phy: 'int',
  int: 'teq'
});

const LEGACY_DEFENSE_FIELDS = Object.freeze([
  'leader',
  'field',
  'passive',
  'memory',
  'link',
  'multi_passive',
  'super_attack',
  'active',
  'support_item'
]);

function numberOrZero(value) {
  return Number.parseFloat(value) || 0;
}

function multiplier(percent) {
  return 1 + numberOrZero(percent) / 100;
}

/**
 * Independent expression of the legacy DEF model.
 *
 * This intentionally does not floor between brackets and intentionally treats
 * Memory and Support Item as separate multipliers. It is used to characterize
 * the current application, not to claim that the legacy model is game-accurate.
 */
export function calculateLegacyReferenceDefense(input = {}) {
  return LEGACY_DEFENSE_FIELDS.reduce(
    (defense, field) => defense * multiplier(input[field]),
    numberOrZero(input.char_def)
  );
}

/**
 * Candidate target model used only for known-difference tests.
 *
 * It floors after every calculation bracket and treats Support
 * Items/Memories as one additive bracket. Intermediate flooring is supported
 * by the calculation reference. The shared Item/Memory bracket still needs
 * stronger game-specific evidence, so fixtures label that case as a candidate
 * rather than a confirmed specification. Nothing here changes production.
 */
export function calculateSpecificationDefense(input = {}) {
  const brackets = [
    numberOrZero(input.leader),
    numberOrZero(input.passive),
    numberOrZero(input.field),
    numberOrZero(input.memory) + numberOrZero(input.support_item),
    numberOrZero(input.link),
    numberOrZero(input.active),
    numberOrZero(input.multi_passive),
    numberOrZero(input.super_attack)
  ];

  return brackets.reduce(
    (defense, percent) => Math.floor(defense * multiplier(percent)),
    numberOrZero(input.char_def)
  );
}

export function calculateReferenceModifiers(input = {}) {
  const ownClass = input.own_class ?? 'super';
  const ownType = input.own_type ?? 'teq';
  const enemyClass = input.enemy_class ?? 'super';
  const enemyType = input.enemy_type ?? 'teq';

  let advantageStatus = 'neutral';
  if (TYPE_ADVANTAGE[ownType] === enemyType) {
    advantageStatus = 'advantage';
  } else if (TYPE_ADVANTAGE[enemyType] === ownType) {
    advantageStatus = 'disadvantage';
  }

  let guardMod = advantageStatus === 'advantage' ? 0.5 : 1;
  let attrMod = 1;
  const sameClass = ownClass === enemyClass;

  if (sameClass) {
    if (advantageStatus === 'advantage') attrMod = 0.9;
    if (advantageStatus === 'disadvantage') attrMod = 1.25;
  } else {
    if (advantageStatus === 'advantage') attrMod = 1;
    else if (advantageStatus === 'disadvantage') attrMod = 1.5;
    else attrMod = 1.15;
  }

  if (input.is_guard) {
    attrMod = 0.8;
    guardMod = 0.5;
  }

  const attributeDefenseLevel = numberOrZero(input.attr_def_up);
  if (advantageStatus === 'advantage' && attributeDefenseLevel > 0) {
    attrMod -= attributeDefenseLevel * 0.01;
  }

  let atkCritMod = 1;
  let defCritMod = 1;
  if (input.is_critical) {
    atkCritMod = multiplier(input.crit_atk_up);
    defCritMod = 1 - numberOrZero(input.crit_def_down) / 100;

    if (input.is_guard) {
      attrMod = 0.8;
      guardMod = 0.5;
    } else {
      attrMod = 1;
      guardMod = 1;
    }

    if (advantageStatus === 'advantage' && attributeDefenseLevel > 0) {
      attrMod -= attributeDefenseLevel * 0.01;
    }
  }

  return {
    group1_advantage_status: advantageStatus,
    attr_mod: Math.max(0, attrMod),
    guard_mod: guardMod,
    dr_mod: 1 - numberOrZero(input.dr_input) / 100,
    atk_crit_mod: atkCritMod,
    def_crit_mod: defCritMod
  };
}

export function calculateReferenceLegacyModel(input = {}) {
  const finalDef = calculateLegacyReferenceDefense(input);
  const modifiers = calculateReferenceModifiers(input);
  return {
    final_def: finalDef,
    final_def_crit_mod: finalDef * modifiers.def_crit_mod,
    attr_mod: modifiers.attr_mod,
    guard_mod: modifiers.guard_mod,
    dr_mod: modifiers.dr_mod,
    atk_crit_mod: modifiers.atk_crit_mod,
    group1_advantage_status: modifiers.group1_advantage_status
  };
}

/** Damage model with variance deliberately fixed at 1.0. */
export function calculateReferenceDamage(enemyAttack, calculation) {
  const damageBeforeGuard = Math.max(
    0,
    numberOrZero(enemyAttack) * calculation.atk_crit_mod * calculation.attr_mod * calculation.dr_mod
      - calculation.final_def_crit_mod
  );
  return damageBeforeGuard * calculation.guard_mod;
}

export function calculateReferenceDurabilityLine(targetDamage, calculation) {
  return (
    (numberOrZero(targetDamage) / calculation.guard_mod) + calculation.final_def_crit_mod
  ) / (
    calculation.attr_mod * calculation.dr_mod * calculation.atk_crit_mod
  );
}

/** Current nested enemy-condition formula: every percentage is added. */
export function calculateLegacyConditionAttack(baseAttack, conditions = {}) {
  const totalPercent = ['turnPct', 'hitPct', 'hpPct', 'appearPct']
    .reduce((total, key) => total + numberOrZero(conditions[key]), 0);
  return Math.floor(numberOrZero(baseAttack) * multiplier(totalPercent));
}

/**
 * Target condition model: start-of-turn effects are additive to one another,
 * while attack-received buildup is a separate mid-battle multiplier.
 */
export function calculateSpecificationConditionAttack(baseAttack, conditions = {}) {
  const startOfTurnPercent = numberOrZero(conditions.turnPct)
    + numberOrZero(conditions.hpPct)
    + numberOrZero(conditions.appearPct);
  const afterStartOfTurn = Math.floor(numberOrZero(baseAttack) * multiplier(startOfTurnPercent));
  return Math.floor(afterStartOfTurn * multiplier(conditions.hitPct));
}

export function calculateEnemyAttackVariants(boostedAttack, enemy = {}) {
  const base = numberOrZero(boostedAttack);
  const saMultiplier = numberOrZero(enemy.saMulti);
  const saBuff = numberOrZero(enemy.saBuffMod);
  return {
    normal: base,
    postSaNormal: saBuff > 0 ? Math.floor(base * (1 + saBuff)) : null,
    superAttack: Math.floor(base * (saMultiplier + saBuff))
  };
}
