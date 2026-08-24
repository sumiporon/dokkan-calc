import assert from 'node:assert/strict';
import test from 'node:test';

import calculationCore from '../../src/calculation-core.js';
import {
  createAreaAttackSelection,
  enemyAttackRanges,
  enumerateValidEnemyStates,
  formatAttackRange,
  japaneseType,
  normalizeNumericInputValue,
  parseAreaAttackSelection,
  superAttackAvailableInState
} from '../../src/release-candidate/phase8-ui-model.mjs';

const field = (value) => ({ state: 'known', value });
const unknown = () => ({ state: 'unknown', value: null });
const effect = (id, kind, value, { start = null, hpMin = null, hpMax = null, cap = null, bracket = 'start-of-turn' } = {}) => ({
  id,
  trigger: {
    kind,
    start: start == null ? unknown() : field(start),
    end: unknown(),
    hpMinPercent: hpMin == null ? unknown() : field(hpMin),
    hpMaxPercent: hpMax == null ? unknown() : field(hpMax)
  },
  appliesTo: 'enemy-stats',
  target: 'attack',
  operation: 'add-percent',
  value: field(value),
  cap: cap == null ? unknown() : field(cap),
  durationTurns: unknown(),
  bracket
});

const enemy = {
  baseAttack: field(100_000),
  passiveEffects: [
    effect('turn', 'elapsed-turn', 50, { start: 1, cap: 100 }),
    effect('appearance', 'appearance-turn', 25, { start: 3 }),
    effect('hit', 'received-hit-count', 20, { start: 1, cap: 40, bracket: 'mid-battle' }),
    effect('hp', 'hp-range', 30, { hpMin: 0, hpMax: 50 })
  ],
  superAttacks: [
    { id: 'sa-a', name: field('必殺A'), displayedDamage: field(300_000), effects: [] },
    { id: 'sa-b', name: field('必殺B'), displayedDamage: field(500_000), effects: [] }
  ]
};

test('Phase 8 UI: type enums are hidden behind Japanese game labels', () => {
  assert.equal(japaneseType('super', 'agl'), '超速');
  assert.equal(japaneseType('extreme', 'phy'), '極体');
  assert.equal(japaneseType('neutral', 'int'), '中立（知属性）');
});

test('Phase 8 UI: numeric leading zero is removed without breaking zero, blank, decimal, or paste text', () => {
  assert.equal(normalizeNumericInputValue('044'), '44');
  assert.equal(normalizeNumericInputValue('00012'), '12');
  assert.equal(normalizeNumericInputValue('0'), '0');
  assert.equal(normalizeNumericInputValue(''), '');
  assert.equal(normalizeNumericInputValue('0.5'), '0.5');
  assert.equal(normalizeNumericInputValue('-012'), '-12');
});

test('Phase 8 UI: attack ranges come only from enumerated valid turn/hit/HP states', () => {
  const states = enumerateValidEnemyStates(enemy, calculationCore);
  assert.ok(states.every((entry) => !(
    entry.state.turn < 3
    && entry.state.hp > 50
    && entry.attacks.startOfTurnPercent >= 125
  )));
  const ranges = enemyAttackRanges(enemy, calculationCore);
  assert.deepEqual(ranges.normal, { minimum: 150_000, maximum: 357_000 });
  assert.deepEqual(ranges.supers.map((item) => [item.name, item.range]), [
    ['必殺A', { minimum: 450_000, maximum: 1_071_000 }],
    ['必殺B', { minimum: 750_000, maximum: 1_785_000 }]
  ]);
  assert.equal(formatAttackRange(ranges.normal), '150,000～357,000');
});

test('Phase 8 UI: each Super range obeys its own HP usage rules', () => {
  const usageEnemy = structuredClone(enemy);
  usageEnemy.superAttacks[0].usageRules = [{ hpMinPercent: field(51), hpMaxPercent: field(100) }];
  usageEnemy.superAttacks[1].usageRules = [{ hpMinPercent: field(0), hpMaxPercent: field(50) }];
  const ranges = enemyAttackRanges(usageEnemy, calculationCore);

  assert.deepEqual(ranges.supers.map((item) => item.range), [
    { minimum: 450_000, maximum: 945_000 },
    { minimum: 900_000, maximum: 1_785_000 }
  ]);
  assert.equal(superAttackAvailableInState(usageEnemy.superAttacks[0], { hp: 50 }), false);
  assert.equal(superAttackAvailableInState(usageEnemy.superAttacks[1], { hp: 50 }), true);
});

test('Phase 8 UI: area-attack selections preserve colon-delimited canonical IDs', () => {
  const value = createAreaAttackSelection('preview:area:green:1', 'additional');
  assert.equal(value, 'area:preview:area:green:1:additional');
  assert.deepEqual(parseAreaAttackSelection(value), { id: 'preview:area:green:1', target: 'additional' });
  assert.deepEqual(parseAreaAttackSelection('area:preview:area:green:1:first'), { id: 'preview:area:green:1', target: 'first' });
  assert.equal(parseAreaAttackSelection('area:missing-target'), null);
  assert.throws(() => createAreaAttackSelection('preview:area:green:1', 'unknown'), /Unsupported area-attack target/);
});
