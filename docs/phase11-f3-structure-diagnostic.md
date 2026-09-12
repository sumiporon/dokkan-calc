# F3 structure diagnostic prep — fixture-only

## Scope and checkpoint

Based on `f97fafd5d41a65394596e634c08dcb2190861a80`. The owner reported a one-tap stop at `F3_ROOT` on stage 17050015. The existing F3 scanner requires the self-authored `[data-f3-snapshot]` marker. That stop occurred before classification, typed payload/failure persistence or inspection review. A missing root is an explicit thrown guard error, not the former JavaScript initialization error. It does not prove a successful end-to-end F3 gate.

This new route is a standalone structural diagnostic. It does not modify the F3 extension or repair the live adapter. No site access, signing, XPI generation, classifier, canonical conversion, calculation, typed session, receiver or persistence is connected. All fixture identifiers and text are invented. Previous 17050015 values are not inputs.

## Diagnostic contract

`createStructureDiagnostic()` only creates a one-shot controller. Its explicit `run()` checks the expected URL and event/stage path, reads the injected `document.documentElement.outerHTML` reader once, checks the URL again, then hashes and inspects the immutable string. The controller rejects a second run. The snapshot is local to the operation, never returned, messaged or persisted; the capture reference is released in `finally`. This is ordinary memory release, not guaranteed immediate physical erasure by the browser GC.

`diagnoseStructureSnapshot()` uses inert Cheerio parsing. The rule is `phase11-f3-structure-candidates-1`. It uses candidate selectors from existing offline parser/diagnostic code, without requiring F3 fixture marker attributes. It neither loads external resources nor executes scripts. This preparation does not certify those selectors against the current live page.

The output is `kind: structure-diagnostic` with `ruleVersion`, `snapshotDigest`, observed counts, observations, issues, and coverage. Each observation has a field name, zero-based parent ordinals, candidate count, selector and/or tag/sibling structural paths, short text and an explicit truncation flag. Arbitrary element IDs, attributes, URLs, HTML, script bodies, form values, cookie/storage/heap content and comments are not output.

States are diagnostic observations, not partial-material field states:

| State | Meaning |
| --- | --- |
| detected | A single structural candidate was located; not proof of semantic identity |
| blank | A field candidate was found with empty extracted text |
| non-empty-unparsed | Non-empty text, including literal `"0"`; no numeric interpretation |
| missing | No candidate under the tested rule; not proof the source lacks the field |
| ambiguous | Duplicate/competing candidates or unresolved parent relationship |

Enemy-wide count, Super base count and each HP-band count remain separate observations. Orphan HP bands have no fabricated attack ordinal. Nested/overlapping enemy roots stop descendant assignment. The Super candidate rule compares direct-child header structure and icon presence; conflicting headers are ambiguous. Encounter-level AI is not attached to a guessed enemy. AOE rows and skills are only candidate regions with uninterpreted text.

The scan covers identity meta/canonical-link candidates; encounter/enemy roots; names/type-icon candidates; HP/ATK/DEF/enemy-wide count; Super names/ATK/base usage fields; HP bands and per-band usage fields; and skill/AI/AOE candidate regions. There is no guessed expected count. Counts describe candidates actually enumerated in this snapshot.

`coverage.status` is always `unconfirmed`. `candidateTraversalFinished` only means the configured candidate traversal terminated. Missing/ambiguous fields add issues and set `unresolved`; even issue-free fixtures do not establish page-wide coverage. Scripts/styles, external resources, forms/hidden content, comments, UI, heap/storage and CSS visibility interpretation remain excluded. Snapshot text is not a proof of rendered CSS visibility. Live evidence collection requires a separate owner-approved step.

Bounds: snapshot 4,000,000 UTF-16 code units; 30,000 parsed elements; 700 observations/700 issues; 40 candidates per observation; 160 characters of short text; 1,000-character structural paths; 250,000-character serialized output. Over-limit inputs stop with a Japanese owner-facing explanation; truncation is never represented as complete evidence.

## Fixture and tests

The six selectable HTML fixtures contain no F3 markers:

| Fixture | Expected observation |
| --- | --- |
| Multiple enemies/Supers | 1 encounter, 2 enemy candidates, 4 Supers, 4 HP bands; distinct ordinals |
| Blank Super count | Two scoped blank count observations; enemy-wide `7` is not substituted; other explicit `0` remains text `"0"` |
| Orphan condition | ambiguous, no assigned attack parent |
| Ambiguous enemy root | overlapping roots reported; descendant field assignment stopped |
| Missing regions | HP/AI missing; empty skill region is blank, not invented absence |
| Duplicate field | competing ATK text values reported together as ambiguous |

The browser screen labels observations in Japanese; technical keys and rule details are secondary. It has one explicit diagnostic button, disabled after use, and no persistence/export/apply controls. The result states that raw HTML is not saved and that intake/calculation and complete coverage are not established.

Commands from repository root:

```text
node scripts/build-phase11-f3-structure.mjs
node --test tests/unit/phase11-f3-structure.test.mjs
node --test tests/browser/phase11-f3-structure.test.mjs
node scripts/preview-phase11-f3-structure.mjs
```

The preview command prints a loopback URL. Build outputs only fictional pages and a browser module under `generated/phase11-f3-structure/`. It does not generate an extension ZIP.

Regression preparation (local generated dependencies only, no `--fixed-preview`):

```text
npm run build:phase11-one-tap
node scripts/build-phase11-typed-one-tap.mjs
node --test tests/unit/phase11-f3-prep.test.mjs tests/unit/phase11-f2-fixture-bridge.test.mjs tests/unit/phase11-typed-one-tap.test.mjs tests/unit/phase11-typed-inspection.test.mjs tests/data/phase11-one-tap.test.mjs
node --test --test-concurrency=1 tests/browser/phase11-f3-prep.test.mjs tests/browser/phase11-f2-fixture-bridge.test.mjs tests/browser/phase11-typed-one-tap.test.mjs tests/browser/phase11-one-tap.test.mjs
```

Initial regression invocation found absent generated API files; it was a missing build prerequisite, not an assertion failure. Generated dependencies were built before rerunning tests. The known historical fixed-preview mismatch is not repaired or regenerated by this task.

Final checks: new unit 12/12 and browser 1/1 (all six selectable fixture flows); existing F3-prep/F2/typed A–E/one-tap unit/data 46/46 and browser 7/7. Browser instrumentation checks zero outerHTML/digest/network/storage operations before the tap, then exactly one outerHTML and digest with zero network/storage operations after it. Both 360px and 390px layouts pass. Tracked source files and the existing unsigned F3 ZIP hash remain unchanged. The historical broad fixed-preview comparison was not rerun.

## Owner UI review

2026-09-13: the owner reviewed all six self-authored fixture screens and marked this preparation gate PASS. The review confirmed normal multiple-enemy/multiple-Super enumeration; event/stage identity candidates; ambiguous enemy roots; unresolved condition parentage; missing required regions; and distinct handling of blank Super-specific `最大ATK/ターン` fields, explicit count `0`, and displayed `DEF: 0`.

The screen also clearly stated the three fixed boundaries: raw HTML is not stored, no intake or calculation classification occurs, and page-wide coverage remains unconfirmed. The blank count in fixture stage `99220002` and a separate displayed count `0` were visibly distinct. This is fixture-only evidence; live DOM connection and any new XPI remain separate gates.
