# Calculation baseline and known discrepancies

Date: 2026-08-21 (JST)

This document records the legacy calculator model before its code is reorganized. Phase 2 adds tests and documentation only; it does not correct production calculations. A passing characterization test means "the current behavior was observed consistently", not automatically "the game specification proves this value is correct".

## Two expected values

Tests use two names when the current application and the independently checked model disagree:

- `legacyExpected`: the value currently displayed or returned by the application.
- `specExpected`: the value calculated independently from the documented game brackets or a hand-worked formula.

Known discrepancies are tested by asserting both values and asserting that they are different. This prevents an incorrect legacy value from silently becoming the intended specification while still alerting us if behavior changes during a later refactor.

## Legacy model

The main calculation is in `calculateNewDurability()` near the end of `dokkan_calc_final.js`.

Legacy final DEF:

```text
base DEF
× leader
× field
× additive passive
× memory
× link
× multiplicative passive
× Super Attack effect
× Active Skill
× support item
```

Each percentage is currently treated as a separate multiplier and decimals are kept until the final display.

Legacy damage model (variance intentionally omitted):

```text
max(0,
  enemy ATK × critical ATK multiplier × type multiplier × (1 - damage reduction)
  - DEF after critical DEF reduction
) × guard multiplier
```

The durability line is the algebraic inverse of this model.

The current type cycle is `TEQ > AGL > STR > PHY > INT > TEQ`. Same-class type coefficients are `0.9 / 1.0 / 1.25`; opposite Super/Extreme coefficients are `1.0 / 1.15 / 1.5`. Natural advantage also applies a `0.5` guard multiplier. All-type guard overwrites the coefficients with type `0.8` and guard `0.5`.

The principal independent reference used for bracket order, type defence, enemy critical behavior, enemy ATK phases, and damage order is [Razzer's Calcing Guide](https://kandymanis.github.io/dokkanalytics/razzers-guide). It is a community technical reference, not an official game specification, so disputed mechanics still require additional evidence before a production fix.

## Confirmed or high-confidence discrepancies

| Severity | Area | Current behavior | Independently expected behavior |
| --- | --- | --- | --- |
| High | Enemy turn + received-hit buffs | Adds percentages into one multiplier | Start-of-turn and mid-battle brackets multiply |
| High | Enemy first-turn buff | Condition selector starts at `none` even when `turnAtkUpStartTurn = 1` | The first increment is already active on turn 1 |
| High | Preview calculation | Omits Active Skill, item, detailed type/class, critical, and type-defence inputs | Preview should use the same authoritative calculation as the main card |
| Medium | DEF flooring | Keeps decimals and rounds the final display | The game floors between calculation brackets |
| Medium | Enemy ATK display rounding | Floating-point `Math.floor` followed by ten-thousand-unit display flooring can lower the visible label by 10,000 | Perform integer-safe bracket rounding, then format the resulting integer without a second lossy floor |
| Medium | Damage variance | Uses an exact `1.00` model | Actual damage normally includes approximately `1.00–1.03` variance |
| Medium | Critical import | Some fallback code treats critical activation rate fields as ATK-power fields | Activation probability and critical damage power are different concepts |

### Broly compound-condition example

For the current preset path `レッドゾーン / 純粋サイヤ人編 / VS ブロリー / 超サイヤ人ブロリー(フルパワー)`, base ATK is 1,200,000, turn gain reaches +150%, and received-hit gain reaches +100%.

```text
Legacy combined multiplier: 1 + 1.50 + 1.00 = 3.50
Spec brackets:             (1 + 1.50) × (1 + 1.00) = 5.00
```

| Attack | `legacyExpected` | `specExpected` |
| --- | ---: | ---: |
| Normal | 4,200,000 | 6,000,000 |
| Super | 14,700,000 | 21,000,000 |
| Post-Super normal | 6,300,000 | 9,000,000 |

The same reference explains that the first +30% turn increment applies on turn 1, making the first-turn normal 1,560,000 rather than the legacy initial 1,200,000.

### DEF flooring example

For `DEF 101`, `leader +33%`, and `passive +33%`:

```text
legacyExpected = round(101 × 1.33 × 1.33) = 179
specExpected   = floor(floor(101 × 1.33) × 1.33) = 178
```

### Enemy ATK floating/display example

JavaScript evaluates some decimal products just below the mathematical integer. For `100,000 × 2.3`, the current dynamic-enemy path floors an internal `229,999.999...` to `229,999`. `formatNumber()` then floors again in units of 10,000, so the screen says `22万` rather than the mathematical `23万`. A browser characterization records the legacy display while naming it as a discrepancy, not a correct specification.

## Items requiring more specification evidence

- Whether every field labelled Memory and support item in this UI always belongs to the same additive calculation bracket. The current app multiplies them separately.
- Whether the calculator should show minimum, average (`1.015`), maximum (`1.03`), or a range for damage variance.
- How game minimum damage should be represented instead of the current zero floor.
- Exact critical ATK and true-DEF-ignore values for each enemy, independently of activation probability.

These require a product-level calculation decision or stronger source evidence before changing production output.

## Phase 2 test boundary

- Pure unit tests cover DEF brackets, type/class matrices, guard, type defence, damage reduction, enemy criticals, normal/Super damage, and inverse durability lines.
- Browser tests cover the actual DOM path, enemy selection, dynamic conditions, save/load, and mode changes.
- Known-discrepancy fixtures preserve both legacy and independently expected values.
- Production fixes, code extraction, and formula unification are deferred until the owner reviews the Phase 2 report.
