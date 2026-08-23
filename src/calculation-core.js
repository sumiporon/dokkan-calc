(function initializeCalculationCore(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DokkanCalcCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCalculationCore() {
  'use strict';

  const TYPE_ADVANTAGE = Object.freeze({
    teq: 'agl',
    agl: 'str',
    str: 'phy',
    phy: 'int',
    int: 'teq'
  });

  // Verified incoming-damage variance boundaries.  The UI deliberately shows
  // only this range; it does not invent an average or representative roll.
  const DAMAGE_VARIANCE_MIN = 1;
  const DAMAGE_VARIANCE_MAX = 1.03;

  // This list preserves the Phase 2 production model while disputed DEF
  // bracket relationships are investigated.  The pure core gives the main
  // card and preview one implementation without silently settling those
  // still-open mechanics.
  const LEGACY_COMPATIBLE_DEFENSE_FIELDS = Object.freeze([
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

  function booleanValue(value) {
    return value === true || String(value) === 'true';
  }

  function multiplierFromPercent(percent) {
    return 1 + numberOrZero(percent) / 100;
  }

  /**
   * Floors a mathematical product while correcting only binary floating-point
   * noise immediately next to an integer (for example 100000 * 2.3).
   */
  function multiplyAndFloor(value, multiplier) {
    const product = numberOrZero(value) * numberOrZero(multiplier);
    const stableProduct = stabilizeNearInteger(product);
    return Math.floor(stableProduct);
  }

  /** Removes binary floating-point noise only when a value is effectively integer. */
  function stabilizeNearInteger(value) {
    const parsedValue = numberOrZero(value);
    const nearestInteger = Math.round(parsedValue);
    const tolerance = Math.max(1, Math.abs(parsedValue)) * Number.EPSILON * 8;
    return Math.abs(parsedValue - nearestInteger) <= tolerance
      ? nearestInteger
      : parsedValue;
  }

  /**
   * Applies an integer percentage through integer arithmetic when possible.
   * Enemy ATK data currently uses integer base values and integer percentages,
   * so this avoids turning an exact 230000 into 229999.99999999997.
   */
  function applyPercentAndFloor(value, percent) {
    const base = numberOrZero(value);
    const parsedPercent = numberOrZero(percent);
    const numerator = base * (100 + parsedPercent);

    if (
      Number.isSafeInteger(base)
      && Number.isSafeInteger(parsedPercent)
      && Number.isSafeInteger(numerator)
    ) {
      return Math.floor(numerator / 100);
    }

    return multiplyAndFloor(base, multiplierFromPercent(parsedPercent));
  }

  /**
   * Exact Phase 2 DEF behavior, retained temporarily as a compatibility seam.
   * It is not labelled as the verified game formula.
   */
  function calculateLegacyCompatibleDefense(input = {}) {
    return LEGACY_COMPATIBLE_DEFENSE_FIELDS.reduce(
      (defense, field) => defense * multiplierFromPercent(input[field]),
      numberOrZero(input.char_def)
    );
  }

  function calculateModifiers(input = {}) {
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

    let guardModifier = advantageStatus === 'advantage' ? 0.5 : 1;
    let typeModifier = 1;
    const sameClass = ownClass === enemyClass;

    if (sameClass) {
      if (advantageStatus === 'advantage') typeModifier = 0.9;
      else if (advantageStatus === 'disadvantage') typeModifier = 1.25;
    } else if (advantageStatus === 'advantage') {
      typeModifier = 1;
    } else if (advantageStatus === 'disadvantage') {
      typeModifier = 1.5;
    } else {
      typeModifier = 1.15;
    }

    const guardsAll = booleanValue(input.is_guard);
    if (guardsAll) {
      typeModifier = 0.8;
      guardModifier = 0.5;
    }

    const typeDefenseLevel = numberOrZero(input.attr_def_up);
    if (advantageStatus === 'advantage' && typeDefenseLevel > 0) {
      typeModifier -= typeDefenseLevel * 0.01;
    }

    let criticalAttackModifier = 1;
    let criticalDefenseModifier = 1;
    if (booleanValue(input.is_critical)) {
      criticalAttackModifier = multiplierFromPercent(input.crit_atk_up);
      criticalDefenseModifier = 1 - numberOrZero(input.crit_def_down) / 100;

      if (guardsAll) {
        typeModifier = 0.8;
        guardModifier = 0.5;
      } else {
        typeModifier = 1;
        guardModifier = 1;
      }

      if (advantageStatus === 'advantage' && typeDefenseLevel > 0) {
        typeModifier -= typeDefenseLevel * 0.01;
      }
    }

    return {
      group1_advantage_status: advantageStatus,
      attr_mod: Math.max(0, typeModifier),
      guard_mod: guardModifier,
      dr_mod: 1 - numberOrZero(input.dr_input) / 100,
      atk_crit_mod: criticalAttackModifier,
      def_crit_mod: criticalDefenseModifier
    };
  }

  function calculateDurability(input = {}) {
    const finalDefense = calculateLegacyCompatibleDefense(input);
    const modifiers = calculateModifiers(input);

    return {
      final_def: finalDefense,
      final_def_crit_mod: finalDefense * modifiers.def_crit_mod,
      attr_mod: modifiers.attr_mod,
      guard_mod: modifiers.guard_mod,
      dr_mod: modifiers.dr_mod,
      atk_crit_mod: modifiers.atk_crit_mod,
      group1_advantage_status: modifiers.group1_advantage_status
    };
  }

  /** Damage variance deliberately defaults to the Phase 2 baseline of 1.0. */
  function calculateDamage(enemyAttack, calculation, variance = 1) {
    const attackAfterModifiers = numberOrZero(enemyAttack)
      * calculation.atk_crit_mod
      * calculation.attr_mod
      * calculation.dr_mod
      * numberOrZero(variance);
    const damage = Math.max(0, attackAfterModifiers - calculation.final_def_crit_mod)
      * calculation.guard_mod;
    return stabilizeNearInteger(damage);
  }

  function calculateDamageRange(enemyAttack, calculation) {
    const damageAtMinimumVariance = calculateDamage(
      enemyAttack,
      calculation,
      DAMAGE_VARIANCE_MIN
    );
    const damageAtMaximumVariance = calculateDamage(
      enemyAttack,
      calculation,
      DAMAGE_VARIANCE_MAX
    );

    return {
      minimum: Math.min(damageAtMinimumVariance, damageAtMaximumVariance),
      maximum: Math.max(damageAtMinimumVariance, damageAtMaximumVariance)
    };
  }

  function calculateDurabilityLine(targetDamage, calculation, variance = 1) {
    return (
      (numberOrZero(targetDamage) / calculation.guard_mod)
      + calculation.final_def_crit_mod
    ) / (
      calculation.attr_mod
      * calculation.dr_mod
      * calculation.atk_crit_mod
      * numberOrZero(variance)
    );
  }

  /** Uses the verified maximum variance so a displayed line is safety-first. */
  function calculateSafeDurabilityLine(targetDamage, calculation) {
    return calculateDurabilityLine(targetDamage, calculation, DAMAGE_VARIANCE_MAX);
  }

  /**
   * Current enemy-data mapping: turn/HP/appearance are start-of-turn effects;
   * received-hit buildup is a separate mid-battle bracket.
   */
  function calculateEnemyConditionState(baseAttack, conditions = {}) {
    const startOfTurnPercent = numberOrZero(conditions.turnPct)
      + numberOrZero(conditions.hpPct)
      + numberOrZero(conditions.appearPct);
    const receivedHitPercent = numberOrZero(conditions.hitPct);
    const afterStartOfTurn = applyPercentAndFloor(baseAttack, startOfTurnPercent);
    const attack = applyPercentAndFloor(afterStartOfTurn, receivedHitPercent);

    return {
      attack,
      afterStartOfTurn,
      startOfTurnPercent,
      receivedHitPercent,
      totalMultiplier: multiplierFromPercent(startOfTurnPercent)
        * multiplierFromPercent(receivedHitPercent)
    };
  }

  function calculateEnemyAttackVariants(boostedAttack, enemy = {}) {
    const normalAttack = Math.floor(numberOrZero(boostedAttack));
    const superAttackMultiplier = numberOrZero(enemy.saMulti);
    const superAttackBuff = numberOrZero(enemy.saBuffMod);

    return {
      normal: normalAttack,
      postSaNormal: superAttackBuff > 0
        ? multiplyAndFloor(normalAttack, 1 + superAttackBuff)
        : null,
      superAttack: multiplyAndFloor(
        normalAttack,
        superAttackMultiplier + superAttackBuff
      )
    };
  }

  function positiveNumber(value, fallback = 0) {
    const parsed = numberOrZero(value);
    return parsed > 0 ? parsed : fallback;
  }

  function buildTurnConditionOptions(enemy = {}) {
    const increment = positiveNumber(enemy.turnAtkUp);
    const maximum = positiveNumber(enemy.turnAtkMax);
    if (increment === 0 || maximum === 0) return [];

    const startTurn = Math.max(1, Math.floor(positiveNumber(enemy.turnAtkUpStartTurn, 1)));
    const options = [];
    if (startTurn > 1) {
      options.push({
        value: 0,
        turn: startTurn - 1,
        label: `${startTurn - 1}ターンまで (ATK+0%)`
      });
    }

    const steps = Math.ceil(maximum / increment);
    for (let step = 1; step <= steps; step += 1) {
      const percent = Math.min(maximum, increment * step);
      const turn = startTurn + step - 1;
      options.push({ value: percent, turn, label: `${turn}ターン (ATK+${percent}%)` });
    }
    return options;
  }

  function buildHitConditionOptions(enemy = {}) {
    const increment = positiveNumber(enemy.hitAtkUp);
    const maximum = positiveNumber(enemy.hitAtkMax);
    if (increment === 0 || maximum === 0) return [];

    const options = [{ value: 0, hits: 0, label: '0回 (ATK+0%)' }];
    const steps = Math.ceil(maximum / increment);
    for (let step = 1; step <= steps; step += 1) {
      const percent = Math.min(maximum, increment * step);
      options.push({ value: percent, hits: step, label: `${step}回 (ATK+${percent}%)` });
    }
    return options;
  }

  function formatNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '---';
    if (parsed >= 10000) return `${Math.floor(parsed / 10000)}万`;
    return Math.round(parsed).toLocaleString();
  }

  function formatDamageRangeEndpoint(value, direction) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '---';

    const stabilized = stabilizeNearInteger(parsed);
    if (stabilized >= 10000) {
      const tenthsOfTenThousand = direction === 'up'
        ? Math.ceil(stabilized / 1000)
        : Math.floor(stabilized / 1000);
      const tenThousands = tenthsOfTenThousand / 10;
      const display = Number.isInteger(tenThousands)
        ? tenThousands.toFixed(0)
        : tenThousands.toFixed(1);
      return `${display}万`;
    }

    const rounded = direction === 'up'
      ? Math.ceil(stabilized)
      : Math.floor(stabilized);
    return rounded.toLocaleString();
  }

  function formatDamageRange(range = {}) {
    const minimum = numberOrZero(range.minimum);
    const maximum = numberOrZero(range.maximum);
    if (minimum === 0 && maximum === 0) return '0';
    return `${formatDamageRangeEndpoint(minimum, 'down')}〜${formatDamageRangeEndpoint(maximum, 'up')}`;
  }

  function formatDurabilityLimit(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '---';

    const stabilized = stabilizeNearInteger(parsed);
    if (stabilized >= 10000) return `${Math.floor(stabilized / 10000)}万`;
    return Math.floor(stabilized).toLocaleString();
  }

  /**
   * `hasSaCrit` means that the dedicated Super Attack row can critical-hit.
   * It must not turn every normal attack into a critical hit when an enemy is
   * loaded through a different UI path.
   */
  function hasGlobalCriticalEffect(enemy = {}) {
    return numberOrZero(enemy.critHpRate) > 0
      || numberOrZero(enemy.critTurnUp) > 0
      || numberOrZero(enemy.critFixedRate) > 0
      || (booleanValue(enemy.isCriticalDefault) && !booleanValue(enemy.hasSaCrit));
  }

  return Object.freeze({
    applyPercentAndFloor,
    buildHitConditionOptions,
    buildTurnConditionOptions,
    calculateDamage,
    calculateDamageRange,
    calculateDurability,
    calculateDurabilityLine,
    calculateSafeDurabilityLine,
    calculateEnemyAttackVariants,
    calculateEnemyConditionState,
    calculateLegacyCompatibleDefense,
    calculateModifiers,
    DAMAGE_VARIANCE_MAX,
    DAMAGE_VARIANCE_MIN,
    formatDamageRange,
    formatDurabilityLimit,
    formatNumber,
    hasGlobalCriticalEffect,
    multiplyAndFloor
  });
});
