import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  calculateEnemyAttackVariants,
  calculateLegacyConditionAttack,
  calculateLegacyReferenceDefense,
  calculateReferenceDamage,
  calculateReferenceDurabilityLine,
  calculateReferenceLegacyModel,
  calculateSpecificationConditionAttack,
  calculateSpecificationDefense
} from '../helpers/reference-calculations.mjs';
import {
  loadLegacyCalculatorSource,
  loadLegacyCalculateNewDurability
} from '../helpers/legacy-calculator-loader.mjs';

const fixtureUrl = new URL('../fixtures/calculation-cases.json', import.meta.url);
const cases = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const calculateLegacy = loadLegacyCalculateNewDurability();
const legacySource = loadLegacyCalculatorSource();

function assertClose(actual, expected, message = undefined) {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= scale * 1e-12,
    message ?? `expected ${actual} to be close to ${expected}`
  );
}

for (const fixture of cases.defenseCases) {
  test(`DEF characterization: ${fixture.id}`, () => {
    const actual = calculateLegacy(fixture.input);
    const independentReference = calculateLegacyReferenceDefense(fixture.input);
    assertClose(actual.final_def, fixture.legacyExpected);
    assertClose(independentReference, fixture.legacyExpected);
  });
}

for (const fixture of cases.knownDefenseDifferences) {
  test(`known or candidate DEF difference is explicit: ${fixture.id}`, () => {
    const actualLegacy = calculateLegacy(fixture.input).final_def;
    const independentLegacy = calculateLegacyReferenceDefense(fixture.input);
    const specification = calculateSpecificationDefense(fixture.input);

    assertClose(actualLegacy, fixture.legacyExpected);
    assertClose(independentLegacy, fixture.legacyExpected);
    const targetExpected = fixture.specExpected ?? fixture.candidateExpected;
    assert.equal(specification, targetExpected);
    assert.notEqual(actualLegacy, specification);

    if (fixture.evidenceStatus !== undefined) {
      assert.equal(fixture.evidenceStatus, 'needs-confirmation');
      assert.equal(fixture.specExpected, undefined);
    }

    if (fixture.legacyDisplayExpected !== undefined) {
      assert.equal(Math.round(actualLegacy), fixture.legacyDisplayExpected);
    }
  });
}

for (const fixture of cases.modifierCases) {
  test(`type/class characterization: ${fixture.id}`, () => {
    const actual = calculateLegacy(fixture.input);
    const independentReference = calculateReferenceLegacyModel(fixture.input);

    assert.equal(actual.group1_advantage_status, fixture.expected.status);
    assertClose(actual.attr_mod, fixture.expected.attrMod);
    assertClose(actual.guard_mod, fixture.expected.guardMod);
    assert.equal(actual.group1_advantage_status, independentReference.group1_advantage_status);
    assertClose(actual.attr_mod, independentReference.attr_mod);
    assertClose(actual.guard_mod, independentReference.guard_mod);
  });
}

for (const fixture of cases.damageCases) {
  test(`damage reference at variance 1.0: ${fixture.id}`, () => {
    const actualModifiers = calculateLegacy(fixture.input);
    const independentModifiers = calculateReferenceLegacyModel(fixture.input);
    const damageFromLegacy = calculateReferenceDamage(fixture.enemyAttack, actualModifiers);
    const damageFromIndependentReference = calculateReferenceDamage(
      fixture.enemyAttack,
      independentModifiers
    );

    assertClose(damageFromLegacy, fixture.expectedDamage);
    assertClose(damageFromIndependentReference, fixture.expectedDamage);
  });
}

for (const fixture of cases.durabilityCases) {
  test(`durability line reference: ${fixture.id}`, () => {
    const actualModifiers = calculateLegacy(fixture.input);
    const independentModifiers = calculateReferenceLegacyModel(fixture.input);
    const lineFromLegacy = calculateReferenceDurabilityLine(
      fixture.targetDamage,
      actualModifiers
    );
    const lineFromIndependentReference = calculateReferenceDurabilityLine(
      fixture.targetDamage,
      independentModifiers
    );

    assertClose(lineFromLegacy, fixture.expectedEnemyAttack);
    assertClose(lineFromIndependentReference, fixture.expectedEnemyAttack);
  });
}

for (const fixture of cases.conditionCases) {
  test(`enemy condition reference: ${fixture.id}`, () => {
    const legacyModel = calculateLegacyConditionAttack(fixture.baseAttack, fixture.conditions);
    const specification = calculateSpecificationConditionAttack(
      fixture.baseAttack,
      fixture.conditions
    );
    assert.equal(legacyModel, fixture.expectedAttack);
    assert.equal(specification, fixture.expectedAttack);
  });
}

for (const fixture of cases.attackVariantCases) {
  test(`normal/super/post-super variants: ${fixture.id}`, () => {
    const actual = calculateEnemyAttackVariants(fixture.boostedAttack, fixture.enemy);
    assert.deepEqual(actual, fixture.expected);
  });
}

test('known enemy-condition difference: Broly Phase 1 and Phase 2 are not additive', () => {
  const fixture = cases.knownConditionDifferences.find(
    ({ id }) => id === 'broly-turn-and-hit-use-separate-brackets'
  );
  assert.ok(fixture);
  assert.match(
    legacySource,
    /const totalAtkUpPct = turnPct \+ hitPct \+ hpPct \+ appearPct;/
  );

  const legacyBoosted = calculateLegacyConditionAttack(
    fixture.baseAttack,
    fixture.legacyConditions
  );
  const specificationBoosted = calculateSpecificationConditionAttack(
    fixture.baseAttack,
    fixture.specConditions
  );
  const legacyVariants = calculateEnemyAttackVariants(legacyBoosted, fixture.enemy);
  const specificationVariants = calculateEnemyAttackVariants(specificationBoosted, fixture.enemy);

  assert.deepEqual(legacyVariants, fixture.legacyExpected);
  assert.deepEqual(specificationVariants, fixture.specExpected);
  assert.notDeepEqual(legacyVariants, specificationVariants);
});

test('known enemy-condition difference: first-turn buff currently defaults to none', () => {
  const fixture = cases.knownConditionDifferences.find(
    ({ id }) => id === 'broly-first-turn-cannot-be-no-buff'
  );
  assert.ok(fixture);
  assert.match(legacySource, /<option value="0">なし<\/option>/);

  const legacyAttack = calculateLegacyConditionAttack(
    fixture.baseAttack,
    fixture.legacyConditions
  );
  const specificationAttack = calculateSpecificationConditionAttack(
    fixture.baseAttack,
    fixture.specConditions
  );

  assert.equal(legacyAttack, fixture.legacyExpected);
  assert.equal(specificationAttack, fixture.specExpected);
  assert.notEqual(legacyAttack, specificationAttack);
});
