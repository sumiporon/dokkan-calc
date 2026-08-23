import assert from 'node:assert/strict';
import test from 'node:test';

import calculationCore from '../../src/calculation-core.js';

const {
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
  DAMAGE_VARIANCE_MAX,
  DAMAGE_VARIANCE_MIN,
  formatDamageRange,
  formatDurabilityLimit,
  hasGlobalCriticalEffect
} = calculationCore;

test('legacy-compatible core: main-card DEF keeps the Phase 2 active/item behavior', () => {
  const result = calculateDurability({
    char_def: 100_000,
    leader: 200,
    passive: 100,
    active: 50,
    support_item: 50
  });

  assert.equal(result.final_def, 1_350_000);
  assert.equal(calculateDurabilityLine(0, result), 1_350_000);
  assert.equal(calculateDurabilityLine(700_000, result), 2_050_000);
});

test('core invariant: damage mode and durability mode use inverse forms of one calculation', () => {
  const result = calculateDurability({ char_def: 1_350_000 });
  assert.equal(calculateDamage(2_000_000, result), 650_000);
  assert.equal(calculateDurabilityLine(650_000, result), 2_000_000);
});

test('verified enemy specification: start-of-turn and received-hit brackets multiply', () => {
  const result = calculateEnemyConditionState(1_200_000, {
    turnPct: 150,
    hitPct: 100
  });

  assert.deepEqual(result, {
    attack: 6_000_000,
    afterStartOfTurn: 3_000_000,
    startOfTurnPercent: 150,
    receivedHitPercent: 100,
    totalMultiplier: 5
  });
});

test('verified Broly specification: turn 1 already has the first 30 percent increment', () => {
  const options = buildTurnConditionOptions({
    turnAtkUpStartTurn: 1,
    turnAtkUp: 30,
    turnAtkMax: 150
  });

  assert.deepEqual(options.map(({ value, turn }) => ({ value, turn })), [
    { value: 30, turn: 1 },
    { value: 60, turn: 2 },
    { value: 90, turn: 3 },
    { value: 120, turn: 4 },
    { value: 150, turn: 5 }
  ]);
  assert.equal(options.some(({ value }) => value === 0), false);
  assert.equal(calculateEnemyConditionState(1_200_000, { turnPct: options[0].value }).attack, 1_560_000);
});

test('verified turn specification: a later explicit start retains a no-buff state', () => {
  const options = buildTurnConditionOptions({
    turnAtkUpStartTurn: 3,
    turnAtkUp: 20,
    turnAtkMax: 40
  });

  assert.deepEqual(options, [
    { value: 0, turn: 2, label: '2ターンまで (ATK+0%)' },
    { value: 20, turn: 3, label: '3ターン (ATK+20%)' },
    { value: 40, turn: 4, label: '4ターン (ATK+40%)' }
  ]);
});

test('verified stack cap: non-divisible turn maximum remains selectable', () => {
  const options = buildTurnConditionOptions({
    turnAtkUpStartTurn: 1,
    turnAtkUp: 30,
    turnAtkMax: 100
  });

  assert.deepEqual(options.map(({ value }) => value), [30, 60, 90, 100]);
});

test('verified stack cap: non-divisible received-hit maximum remains selectable', () => {
  const options = buildHitConditionOptions({ hitAtkUp: 30, hitAtkMax: 100 });
  assert.deepEqual(options.map(({ value }) => value), [0, 30, 60, 90, 100]);
});

test('verified integer arithmetic: an exact 230000 is not lowered by binary floating point', () => {
  assert.equal(applyPercentAndFloor(100_000, 130), 230_000);
});

test('verified Broly variants: maximum normal, post-super normal, and super values', () => {
  const condition = calculateEnemyConditionState(1_200_000, {
    turnPct: 150,
    hitPct: 100
  });
  const attacks = calculateEnemyAttackVariants(condition.attack, {
    saMulti: 3,
    saBuffMod: 0.5
  });

  assert.deepEqual(attacks, {
    normal: 6_000_000,
    postSaNormal: 9_000_000,
    superAttack: 21_000_000
  });
});

test('verified critical/guard model keeps all-type guard and type defence', () => {
  const result = calculateDurability({
    char_def: 1_000_000,
    own_type: 'teq',
    enemy_type: 'agl',
    is_guard: true,
    attr_def_up: 15,
    is_critical: true,
    crit_atk_up: 50,
    crit_def_down: 70
  });

  assert.equal(result.attr_mod, 0.65);
  assert.equal(result.guard_mod, 0.5);
  assert.equal(result.atk_crit_mod, 1.5);
  assert.ok(Math.abs(result.final_def_crit_mod - 300_000) < 1e-9);
  assert.equal(calculateDamage(1_000_000, result), 337_500);
});

test('verified critical scope: Super-only critical does not enable global critical', () => {
  assert.equal(hasGlobalCriticalEffect({ hasSaCrit: true, isCriticalDefault: true }), false);
  assert.equal(hasGlobalCriticalEffect({ hasSaCrit: false, isCriticalDefault: true }), true);
  assert.equal(hasGlobalCriticalEffect({ critFixedRate: 30 }), true);
  assert.equal(hasGlobalCriticalEffect({ critTurnUp: 10 }), true);
  assert.equal(hasGlobalCriticalEffect({ critHpRate: 50 }), true);
});

test('verified type matrix: all five natural advantage cycles and their reverse matchups', () => {
  const advantagePairs = [
    ['teq', 'agl'],
    ['agl', 'str'],
    ['str', 'phy'],
    ['phy', 'int'],
    ['int', 'teq']
  ];

  for (const [ownType, enemyType] of advantagePairs) {
    const advantage = calculateDurability({
      own_class: 'super',
      enemy_class: 'super',
      own_type: ownType,
      enemy_type: enemyType
    });
    assert.equal(advantage.group1_advantage_status, 'advantage');
    assert.equal(advantage.attr_mod, 0.9);
    assert.equal(advantage.guard_mod, 0.5);

    const disadvantage = calculateDurability({
      own_class: 'super',
      enemy_class: 'super',
      own_type: enemyType,
      enemy_type: ownType
    });
    assert.equal(disadvantage.group1_advantage_status, 'disadvantage');
    assert.equal(disadvantage.attr_mod, 1.25);
    assert.equal(disadvantage.guard_mod, 1);
  }
});

test('verified variance boundaries: raw damage at 1.00 and 1.03 uses independent expectations', () => {
  const result = calculateDurability({ char_def: 200_000, dr_input: 40 });
  const cases = [
    { variance: 1, damage: 400_000 },
    { variance: 1.03, damage: 418_000 }
  ];

  assert.equal(DAMAGE_VARIANCE_MIN, 1);
  assert.equal(DAMAGE_VARIANCE_MAX, 1.03);

  for (const { variance, damage } of cases) {
    assert.equal(calculateDamage(1_000_000, result, variance), damage);
    assert.ok(
      Math.abs(calculateDurabilityLine(damage, result, variance) - 1_000_000) < 1e-9
    );
  }
});

test('verified damage range: one result contains the 1.00 minimum and 1.03 maximum', () => {
  const result = calculateDurability({ char_def: 200_000, dr_input: 40 });
  const range = calculateDamageRange(1_000_000, result);

  // Hand calculation:
  // min = 1,000,000 * 0.60 - 200,000 = 400,000
  // max = 1,000,000 * 1.03 * 0.60 - 200,000 = 418,000
  assert.deepEqual(range, { minimum: 400_000, maximum: 418_000 });
  assert.equal(formatDamageRange(range), '40万〜41.8万');
});

test('damage-range formatting rounds outward at 0.1万 and one-point boundaries', () => {
  assert.equal(
    formatDamageRange({ minimum: 100_000, maximum: 103_000 }),
    '10万〜10.3万'
  );
  assert.equal(
    formatDamageRange({ minimum: 9_998.2, maximum: 9_999.2 }),
    '9,998〜10,000'
  );
});

test('verified perfect defence display: a fully stopped range is 0, not 0〜0', () => {
  const result = calculateDurability({ char_def: 1_100_000 });
  const range = calculateDamageRange(1_000_000, result);

  assert.deepEqual(range, { minimum: 0, maximum: 0 });
  assert.equal(formatDamageRange(range), '0');
});

test('verified boundary range: minimum can be 0 while the 1.03 maximum is positive', () => {
  const result = calculateDurability({ char_def: 1_010_000 });
  const range = calculateDamageRange(1_000_000, result);

  assert.deepEqual(range, { minimum: 0, maximum: 20_000 });
  assert.equal(formatDamageRange(range), '0〜2万');
});

test('verified safety line: perfect and specified-damage lines use variance 1.03', () => {
  const result = calculateDurability({ char_def: 1_350_000 });

  // Hand calculation: (target / guard + DEF) / 1.03.
  const perfectLine = calculateSafeDurabilityLine(0, result);
  const specifiedLine = calculateSafeDurabilityLine(700_000, result);
  assert.ok(Math.abs(perfectLine - 1_310_679.6116504853) < 1e-6);
  assert.ok(Math.abs(specifiedLine - 1_990_291.2621359222) < 1e-6);
  assert.equal(calculateDamage(perfectLine, result, 1.03), 0);
  assert.ok(Math.abs(calculateDamage(specifiedLine, result, 1.03) - 700_000) < 1e-6);
});

test('durability-limit formatting always rounds downward below and above 1万', () => {
  const result = calculateDurability({ char_def: 9_000 });
  const perfectLine = calculateSafeDurabilityLine(0, result);

  // Hand calculation: 9,000 / 1.03 = 8,737.864..., so 8,738 is unsafe.
  assert.ok(Math.abs(perfectLine - 8_737.864077669903) < 1e-9);
  assert.equal(formatDurabilityLimit(perfectLine), '8,737');
  assert.equal(formatDurabilityLimit(9_999.9), '9,999');
  assert.equal(formatDurabilityLimit(10_999.9), '1万');
});
