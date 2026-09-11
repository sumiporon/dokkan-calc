import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../../src/calculation-core.js';
import { evaluateSingleHit, SINGLE_HIT_OUTPUTS } from '../../src/prototype/phase11-single-hit.mjs';
import { fixtures, known, unknown } from '../../prototypes/phase11-single-hit/fixtures.mjs';
const copyA = () => structuredClone(fixtures[0]);
const evaluate = (input, output) => evaluateSingleHit(input, output, core);
const noCore = new Proxy({}, { get() { throw new Error('Blocked input reached the core'); } });

test('A-F: count unknown preserves exact single-hit results or stops without a numeric result', () => {
  const expected = { A: [{ minimum: 500000, maximum: 524000 }, 824000, 774000], E: [{ minimum: 0, maximum: 0 }, 0, 0] };
  for (const fixture of fixtures) for (const [i, output] of SINGLE_HIT_OUTPUTS.entries()) {
    const before = JSON.stringify(fixture);
    const result = evaluateSingleHit(fixture, output, expected[fixture.id] ? core : noCore);
    assert.equal(result.attackId, fixture.attack.id);
    assert.equal(result.conditionId, fixture.condition.id);
    assert.equal(result.output, output);
    if (expected[fixture.id]) {
      assert.equal(result.status, 'available'); assert.deepEqual(result.value, expected[fixture.id][i]);
    } else { assert.equal(result.status, 'blocked'); assert.equal(Object.hasOwn(result, 'value'), false); }
    assert.equal(JSON.stringify(fixture), before);
    assert.equal(result.dependencies.includes('attack.maxPerTurn'), false);
  }
});

test('Dependencies are output-specific: current DEF and target are not blanket stage gates', () => {
  const input = copyA(); input.defender.finalDefense = unknown();
  assert.equal(evaluateSingleHit(input, 'damage', noCore).status, 'blocked');
  assert.equal(evaluate(input, 'zero-defense').value, 824000);
  assert.equal(evaluate(input, 'target-defense').value, 774000);
  input.defender.finalDefense = known(300000); input.targetDamage = unknown();
  assert.equal(evaluate(input, 'damage').status, 'available');
  assert.equal(evaluate(input, 'zero-defense').status, 'available');
  assert.equal(evaluateSingleHit(input, 'target-defense', noCore).status, 'blocked');
});

test('Unknown, unavailable, malformed, unconfirmed and nonfinite required values never reach core', () => {
  for (const field of [unknown(), { ...unknown(), state: 'unavailable' }, { ...unknown(), value: 0 }, known(null), known('0'), known(NaN), known(Infinity), known(-1), { ...known(1), confidence: 'unconfirmed' }, { ...known(1), evidenceIds: [] }]) {
    const input = copyA(); input.attack.displayedDamage = field;
    for (const output of SINGLE_HIT_OUTPUTS) assert.equal(evaluateSingleHit(input, output, noCore).status, 'blocked');
  }
});

test('Uninterpreted effects block only affected outputs; unknown scope blocks all', () => {
  const input = copyA(); input.effectAudit.unresolved = [{ affects: ['target-defense'] }];
  assert.equal(evaluate(input, 'damage').status, 'available');
  assert.equal(evaluate(input, 'zero-defense').status, 'available');
  assert.equal(evaluateSingleHit(input, 'target-defense', noCore).status, 'blocked');
  input.effectAudit.unresolved = [{ affects: ['enemy-defense'] }];
  assert.ok(SINGLE_HIT_OUTPUTS.every(output => evaluate(input, output).status === 'available'));
  input.effectAudit.unresolved = [{ affects: ['unrecognized-scope'] }];
  assert.ok(SINGLE_HIT_OUTPUTS.every(output => evaluateSingleHit(input, output, noCore).status === 'blocked'));
});

test('Unsupported outputs, real identities, unverified coverage and AOE do not reach core', () => {
  for (const output of ['atk-range', 'history-atk', 'usage-count', 'turn-total', 'super-combinations', 'enemy-perfect-defense', 'aoe']) {
    assert.equal(evaluateSingleHit(copyA(), output, noCore).status, 'unsupported');
  }
  for (const mutate of [x => { x.attack.id = 'real:attack'; }, x => { x.effectAudit.coverage = unknown(); }, x => { x.attack.targetMode = known('all'); }]) {
    const input = copyA(); mutate(input);
    assert.equal(evaluateSingleHit(input, 'damage', noCore).status, 'blocked');
  }
});

test('Critical unknown stops; inactive critical parameters are not implicitly sourced', () => {
  const input = copyA(); input.attack.critical.enabled = unknown();
  assert.equal(evaluateSingleHit(input, 'damage', noCore).status, 'blocked');
  input.attack.critical.enabled = known(true);
  assert.equal(evaluateSingleHit(input, 'damage', noCore).status, 'blocked');
  input.attack.critical.attackUp = known(50); input.attack.critical.defenseIgnore = known(100);
  assert.equal(evaluate(input, 'damage').status, 'available');
  assert.equal(evaluate(input, 'zero-defense').status, 'unattainable');
  assert.equal(Object.hasOwn(evaluate(input, 'zero-defense'), 'value'), false);
  input.defender.reduction = known(100);
  assert.equal(evaluate(input, 'zero-defense').value, 0);
});

test('Inverse DEF is minimal by forward-core checks across guard, reduction, affinity and critical', () => {
  for (const guard of [false, true]) for (const reduction of [0, 37, 100]) for (const enemyType of ['agl', 'teq', 'str']) for (const critical of [false, true]) {
    const input = copyA(); input.attack.displayedDamage = known(1234567);
    input.enemy.type = known(enemyType); input.defender.guard = known(guard); input.defender.reduction = known(reduction);
    input.attack.critical = { enabled: known(critical), attackUp: known(50), defenseIgnore: known(65) };
    for (const output of ['zero-defense', 'target-defense']) {
      const result = evaluate(input, output); assert.equal(result.status, 'available');
      input.defender.finalDefense = known(result.value);
      assert.ok(evaluate(input, 'damage').value.maximum <= result.targetDamage);
      if (result.value > 0) {
        input.defender.finalDefense = known(result.value - 1);
        assert.ok(evaluate(input, 'damage').value.maximum > result.targetDamage);
      }
    }
  }
});
