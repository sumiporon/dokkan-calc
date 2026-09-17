# Phase 11 structure diagnostic v2 — fixture-only

Implementation verification: 2026-09-15–16 JST. Base HEAD: `0dd689404595a0ebb4fb98b6c93888d50f7737cd`.
Owner UI review: **PASS** on 2026-09-17 JST. The owner used the localhost self-authored fixtures for normal multi-HP, ambiguous-enclosing-root multi-HP, and blank-versus-displayed-`0` cases. The approved scope is UI, one-tap operation, result display, copy, and the stated owner-facing behavior; it is not a line-by-line technical audit of every observation. The owner reported no UI issue. No AMO submission, signing, Android installation or live source access occurred in this task.

## Scope and separation

This is diagnostic structure observation, not an adapter, intake/evidence record, classifier or calculator. It never calls the full/partial validators, canonical/runtime conversion, calculation-core, typed session or inspection receiver. It cannot establish that stage 17050015 passes partial validation or that any attack is calculable.

The v1 diagnostic, its tests, signed-0.0.1 source directory and earlier packaging templates remain unchanged. The new candidate is in `prototypes/phase11-f3-structure-v2-extension/`, version **0.0.2**, retaining ID `phase11-f3-structure-diagnostic@sumiporon.invalid`. Only an unpacked candidate is generated here; this is not a signed update or an AMO-ready reviewer package.

The existing ambiguity predicate remains exactly `!byClass || iconCount !== 1`. An ambiguous Super candidate can now have its bounded child structure observed, including labels inside an enclosing root, but those observations remain ambiguous/unresolved. A field is never promoted to a canonical/known value. Enemy-wide attack count is an independent observation, never a fallback.

## JSON contract

Top-level keys:

```text
kind: structure-diagnostic
formatVersion: 2
ruleVersion: phase11-f3-structure-candidates-2
snapshotDigest: sha256:... | null (capture/size gate not completed)
snapshotDigestEncoding: utf8-outerHTML
source: { eventId, stageId, identityState }
counts: { encounters, enemies, superCandidates, conditionCandidates, observations }
nodes: bounded node table
observations: references into the node table, not source HTML
issues: { code, scope, nodeRef }[]
coverage: { status: unconfirmed, candidateTraversalFinished, unresolved,
            scopes, limitsReached, excluded }
```

`counts` are candidate counts, not authoritative game-enemy/attack totals. A count is `null` when enumeration was incomplete; zero is not substituted. Page-wide coverage is always `unconfirmed`, even when a declared local traversal finishes.

Each node records an ID, original structural path, tag/node type, bounded classes, original sibling ordinal, optional observed parent ID, direct-child count and bounded child references, own text, scoped text and truncation. Structural paths use original tag/sibling positions, never arbitrary element IDs or complete resource URLs. `directChildCount` counts elements and non-whitespace text nodes; `siblingOrdinal` preserves the original child-node position including whitespace.

Each observation has field/state/count/parent identity, candidate node references and structural metadata. Super roots record class match, icon count, bounded icon path/basename references, matchedBy and unresolved/structural-only relationship status. Child summaries live in `nodes` and the candidate's depth-limited coverage scope, avoiding duplicate text payloads.

Field-boundary metadata includes label, bounded value text, label/value text-node references and offsets, common parent, ordered header/field candidate position, preceding header candidate, HP-condition candidate, next boundary and physical placement (inside header candidate or column sibling). Offsets are UTF-16 in **compact-sanitized text**, not byte offsets or offsets into original HTML. Text whitespace is compacted and angle/control characters removed; these are diagnostic snippets, not replayable live evidence. Nested/multi-label/duplicate boundaries remain unresolved, never split into invented conditions. Truncated/unobserved descendants cannot establish a blank field.

Skill observations have row counts (up to 32 emitted per enemy), paths, individual bounded text, candidate description/value/visible-ID positions and truncation. IDs are displayed snippets, not verified source identifiers. AI/AOE searches are limited to the verified encounter, parent/encounter own text, stats/Super columns and preceding/following two meaningful siblings, with at most two element levels per local root. Parent traversal does not silently recurse through other siblings. Selector or text matches remain uninterpreted candidates; absence is only absence within the declared search.

### States

| State | Meaning |
|---|---|
| detected | A structural candidate was found; not game semantics approval |
| non-empty-unparsed | Nonempty bounded displayed text; no numeric interpretation |
| blank | Observed field boundary and empty text; only when structurally resolvable and fully observed |
| missing | No candidate in the stated searched scope; not source-wide nonexistence |
| ambiguous | Candidate/relationship conflict; children may still be observed without promotion |
| not-observed | Scope/field could not be sufficiently observed, including depth/text/budget limits; never blank/missing fallback |

An ambiguous count row can preserve `valueText: ""` or `"0"`, while its state remains ambiguous. For a resolved count-row fixture, empty becomes `blank`, and `"0"` stays `non-empty-unparsed`, not a numeric assumption or unknown default.

## Bounds and stopping

| Resource | Maximum |
|---|---:|
| Snapshot | 4,000,000 UTF-16 code units |
| Parsed inert elements | 30,000 |
| Detailed nodes | 1,000 |
| Observations / issues | 700 each |
| Candidates per search | 40 |
| Text | 160 UTF-16 code units |
| Classes | 160 code units / 8 tokens |
| Structural path | 1,000 code units |
| Direct-child summaries | 64 per node |
| Local depth | 2 element levels; associated text nodes do not add a level |
| Skill rows | 32 per enemy |
| Super icons | 8 per candidate |
| Serialized copied JSON | 250,000 UTF-8 bytes |

Local omissions emit issues and incomplete scopes; unresolved data never becomes a successful field. Global snapshot/element/path/node/observation/issue/output overflows return a small diagnostic stop record with `not-observed`, null counts and no partially referenced node graph. Copied JSON is compact and is the same representation used for the UTF-8 byte bound. The entire raw snapshot is transient memory only and is not part of the report.

## Extension safety

- Ordinary permissions `[]`; unchanged exact host/content-script URL `https://jpnja.dokkaninfo.com/events/challenge/1705/17050015`. No wildcard, background, clipboard, storage, tabs, cookies, downloads or webRequest permissions.
- Exact URL and top-frame gate on entry. No capture/scan/save on entry.
- Trusted owner click only: URL check → one `document.documentElement.outerHTML` read → URL recheck → immutable string digest and inert Cheerio parsing. A second invocation is refused. URL drift stops before digest/scan.
- No network/navigation/reload/retry APIs, external resource loading, persistence or runtime message transfer in candidate source or bundle. Browser fixtures block external requests and instrument capture/digest/network/storage calls in the isolated content world.
- No script/form/hidden content retained; no raw snapshot in JSON/UI, persistent storage or messages. CSS-computed visibility is not interpreted. Results are bounded memory/UI only, cleared by ordinary page lifetime. Clipboard contents are under owner control after explicit copy.
- Copy uses trusted-click `document.execCommand('copy')` with no added manifest permissions. Failure shows a Japanese message and leaves selectable bounded JSON; it does not recapture.
- Ordinary source-site page loading is outside diagnostic code; these tests prove the localhost candidate behavior, not Firefox Android's future runtime behavior or DokkanInfo Terms permission.

## Build and tests

Dependencies: repository lockfile, Node.js 22.17.0/npm environment already installed. No dependency or lockfile changes.

```powershell
node scripts/build-phase11-f3-structure-v2-extension.mjs
node --test --test-reporter=spec tests/unit/phase11-f3-structure-v2.test.mjs
node --test --test-concurrency=1 --test-reporter=spec tests/browser/phase11-f3-structure-v2.test.mjs
npm run test:unit
node --test --test-concurrency=1 --test-reporter=spec tests/browser/phase11-f3-structure.test.mjs tests/browser/phase11-f3-structure-extension.test.mjs tests/browser/phase11-f3-prep.test.mjs tests/browser/phase11-f2-fixture-bridge.test.mjs tests/browser/phase11-typed-one-tap.test.mjs tests/browser/phase11-partial.test.mjs tests/browser/phase11-single-hit.test.mjs tests/browser/phase11-one-tap.test.mjs
node --test --test-reporter=spec tests/data/phase11-manual-intake.test.mjs tests/data/phase11-dokkaninfo-manual.test.mjs tests/data/phase11-one-tap.test.mjs
git diff --check
```

The build writes only `generated/phase11-f3-structure-extension/v2/`: candidate, localhost test extension and owner preview. The test probe is prepended only to the test bundle after the clean preview copy. No ZIP/XPI, signing or old package overwrite. Existing ignored artifacts are prerequisites for unrelated legacy regression tests; do not regenerate production or overwrite fixed previews to force a pass.

Verification results:

- New v2 unit: **32 passed**. Covers all state combinations, class/icon conflicts, nested enclosing-root observation, multi-HP ownership, duplicate fields, multiple enemies/Supers, every configured limit (including independent observation/issue/global-output ceilings), forbidden graph dependencies and source/bundle boundaries.
- New v2 browser: **3 passed**, including all **17** self-authored fixtures, trusted/untrusted taps, real clipboard copy and simulated copy failure, URL drift, reload without recapture, isolated content-world counters, 360/390px no-overflow and localhost preview.
- All unit: **213 passed** (includes v1, F1/F2, partial/single-hit, A–E and related gates).
- Existing relevant browser: **16 passed** (v1 diagnostic/extension, F3-prep, F2, typed inspection A–E, partial DB, single-hit, one-tap).
- Additional legacy Phase 11 data regression: **40 passed / 1 failed**. The failure is the recorded pre-existing fixed-preview equality assertion, not a v2 regression. Both compared file hashes exactly match `phase11-single-hit-prototype.md`'s independently reproduced failure: fixed `4DDD6DAA8DF9BFED45C2571941EC5AAF77DB9C58EBBCFD39E6DA1956C305B40B`, generated `AAD756206C5D77F97A5388E9E634315E3943D24AA44505BE47AC2D5662DDEA57`. Neither file nor that test/parser/build path was changed or regenerated here. Do not describe all repository tests as passing.
- Repository-wide `npm test` was not run; the above commands are the executed scope.
- esbuild initially hit the Windows sandbox parent-directory read restriction. Repeating the same local build with reviewed execution permission succeeded; this was not a source/assertion failure.

## Owner preview and next boundary

Serve only the generated preview root with `tests/helpers/static-server.mjs` (loopback) and open `/index.html`. Suggested owner cases: normal multi-HP, enclosing ambiguous root, blank/zero. Before tapping there should be no result. Tap `このstageの構造を確認` once, check Japanese result/uncertainty text, then `診断結果をコピー`. The owner need not audit every observation. Repeat with a different fictional fixture if desired; no actual stage visit is required.

Fixture-only implementation is ready for owner UI review, with the known unrelated regression exception reported. It does not authorize AMO packaging/signing, Android installation, a new real-stage capture, live adapter implementation or F3 classification. Android permissionless copy, new live DOM fit, and adequacy of the next bounded live payload remain unmeasured until separately authorized. Existing live-gate, F3 preflight, full receiver, production UI/data, canonical and calculation-core remain unchanged.
