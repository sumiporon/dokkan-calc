# Phase 2 test-foundation report

Date: 2026-08-21 (JST)

Branch: `phase2-test-foundation-20260821`

## Outcome

Phase 2 establishes a comparison baseline without changing the production HTML, CSS, JavaScript, Chrome extension, existing enemy JSON, scraper behavior, or localStorage format.

The automated suite contains 57 passing tests:

| Layer | Tests | Purpose |
| --- | ---: | --- |
| Calculation/unit | 39 | Production `calculateNewDurability`, independent hand-worked references, type/class matrix, damage and inverse lines, known discrepancies |
| Enemy data/localStorage | 13 | Schema, counts, condition coverage, duplicates, IDs, embedded-data equality, storage keys, legacy fixtures, secret-free fixtures |
| Browser | 5 | App startup and major user flows in isolated temporary browser contexts |

In addition, two production JavaScript files receive syntax checks, JSON is parsed during the data suite, and `npm run audit:data` produces a human-readable data report. The audit currently completes with zero errors and 13 known warnings.

## What is tested

### Calculation baseline

- Final DEF, including Active Skill and support item inputs
- Normal and Super Attack damage at the legacy variance model of `1.0`
- Perfect-defense and specified-damage inverse lines
- Super/Extreme class relations and all five type-advantage directions
- All-type guard, damage reduction, and type defence
- Enemy-critical ATK increase and true-DEF reduction
- Enemy turn, received-hit, HP, and appearance-turn conditions
- Post-Super normal and Super Attack variants

The test loader extracts the real `calculateNewDurability()` function from the production JavaScript into a Node `vm`. Expected values come from separate reference expressions and fixed hand-worked fixtures. Known bugs keep `legacyExpected` and `specExpected` separate so an incorrect current value is not silently declared correct.

### Enemy-data baseline

Current baseline:

```text
event types 56 / series 73 / stages 647 / bosses 4,245 / attacks 8,899
```

The validator checks the 25 current boss fields, hierarchy, types, Super/Extreme and five-type enums, normal/base-ATK equality, Super/post-Super derivations, paired conditions, critical flags, appearance ordering, sudden count loss, special-condition loss, duplicate content, optional future IDs, and embedded-preset equality.

### Browser baseline

Tests launch the real application through a loopback-only server and a fresh BrowserContext for each case. They cover:

- Startup, DEF input, final DEF, durability lines, and mode changes
- Manual enemy ATK damage
- Real preset cascade selection and normal/Super display
- Scenario add/duplicate and character save/load
- Synthetic enemy turn/hit/HP/appearance/post-Super conditions
- Browser console errors, page errors, and failed requests

The optional CDN libraries are replaced with local minimal stubs so the calculation/UI suite is repeatable without internet access. The owner's actual browser profile and localStorage are never opened.

## Existing calculation problems found

1. **High: Phase-1 and Phase-2 enemy ATK buffs are added.** Turn progress and received-hit buildup should be separate multiplicative brackets. The current Broly maximum normal is 4,200,000 versus independently expected 6,000,000; Super is 14,700,000 versus 21,000,000.
2. **High: a turn-1 enemy buff defaults to `none`.** The same Broly starts at 1,200,000 in the UI, while the first +30% turn increment implies 1,560,000.
3. **High: preview and main-card formulas differ.** The preview omits Active Skill, support item, detailed type/class, critical, and type-defence behavior.
4. **Medium: DEF is not floored between game calculation brackets.** A small fixture produces legacy display 179 versus bracket-floor expectation 178.
5. **Medium: dynamic enemy decimal flooring and `万` formatting can visibly lose 10,000.** `100,000 × 2.3` is displayed as `22万`, not the mathematical `23万`.
6. **Medium: damage variance and game minimum damage are omitted.** Current tests explicitly characterize the legacy `variance = 1.0` and zero floor rather than claiming that model is complete.
7. **Medium: some fallback code confuses critical activation rates with critical power.** Those fields must not be interchanged.
8. **Needs more evidence:** whether Memory and support-item values in every supported situation belong to one additive bracket. The possible 144,000-versus-140,000 difference is recorded as `candidateExpected`, not confirmed specification.

The independent community reference used for the principal bracket and damage evidence is [Razzer's Calcing Guide](https://kandymanis.github.io/dokkanalytics/razzers-guide). It is not an official game specification; disputed mechanics require another source or deliberate owner-approved assumption before production fixes.

## Existing enemy-data problems found

- `eventId`, `stageId`, `enemyId`, enemy DEF, source URL, and source timestamp are absent from the production schema.
- Existing cache metadata still contains 88 unique event IDs and 801 unique stage IDs; the cached HTML also contains card IDs and enemy DEF, showing these fields were discarded during parsing.
- Name-only paths collide: 43 duplicate-stage-name groups and 370 duplicate-boss-name groups exist inside their physical parents. These may include legitimate phases or multiple identical enemies and must not be auto-deleted.
- `aoeDamage` is zero for all bosses despite area-damage text in cached pages.
- 52 bosses have critical context, but `critAtkUp` and `critDefDown` are zero throughout the preset.
- 12 turn conditions and 5 received-hit conditions have a maximum not divisible by their increment. The current `Math.floor(max / increment)` UI cannot select the true maximum in those 17 cases.
- Large `saMulti` outliers exist. Some match the cached source value, so the validator warns rather than automatically rejecting them.

## Current localStorage structure

Three keys are used:

- `dokkan_calc_data_v22`: durability lines, saved characters, mixed preset/manual enemies, current scenarios, and theme
- `dokkan_crit_overrides`: name-path critical overrides
- `dokkan_github_pat`: a legacy plaintext GitHub PAT value

The persistent shape was not changed. Secret-free fixtures cover representative v22 data, legacy two-tier and three-tier enemy formats, and critical overrides. PAT data is intentionally excluded from every fixture and general migration path.

Important migration risks include string-form numeric inputs, index-based enemy selections, full `loadedEnemy` snapshots, no marker separating manual enemies from presets, no internal `schemaVersion`, a near-quota enemy state, and a reset path using `localStorage.clear()`.

## Tests intentionally not automated

- The owner's real localStorage or saved PAT, for privacy and safety
- Real GitHub PAT synchronization, because it writes to an external repository
- DokkanInfo requests or scraper execution, because automated access remains paused pending policy/permission resolution
- Live CDN behavior or screenshot generation; both are outside the core calculation flow
- Actual GitHub Pages deployment; Phase 2 must not update the public site
- Definitive verification of disputed game mechanics for which no official specification was found

## Re-evaluation and Phase 3 recommendation

The broad incremental strategy remains appropriate, but the evidence changes the recommended order:

1. Do **not** begin with a broad Vite/TypeScript migration. First extract one small, framework-free calculation core behind the new tests.
2. Fix the high-confidence compound-condition, first-turn, preview divergence, and integer-rounding problems one at a time, each with before/after evidence.
3. Ask the owner only for the genuinely product-level choices: damage variance display, minimum-damage presentation, and any still-disputed bracket assumptions.
4. Design a provider-neutral raw enemy schema containing source IDs, phase/order, enemy DEF, and provenance, but do not overwrite production data yet.
5. Only after these seams are stable should Vite/TypeScript and physical JSON separation be re-evaluated. They remain plausible tools, not mandatory goals.

GitHub Pages remains a proportionate hosting choice for this static personal app. DokkanInfo remains the best current reference by coverage, but no automated acquisition should resume until permission/policy is resolved and no bot protection should be bypassed.
