# Phase 11 F3-prep fixture-only gate

F3-prep is a self-authored fixture implementation only. It makes no request to DokkanInfo, does not build or sign an XPI, does not modify the existing live-gate extension, and cannot apply anything to production, canonical data, the calculation core, or the existing full receiver.

## Fixed capture boundary

The only capture API receives injected readers and executes `URL read → outerHTML read exactly once → URL read → immutable string digest → scan`. It rejects URL drift, URL ownership mismatch, snapshot ownership mismatch, or an empty snapshot. The scanner accepts the immutable string only; it has no `Document` or page-DOM input. The snapshot string is never passed to retention or persistent records.

## F3 coverage and field states

The scan has terminal records for event/stage identity; encounter; enemy identity/boundaries; type/class; HP/ATK/DEF; enemy-wide attack count; Super name/ATK/condition/probability/per-Super max/reuse/effect; skill/passive; AI; and AOE.

- `known` is an unambiguous interpreted display value, including `0`.
- `unavailable` is a known field label with an empty source value.
- `unknown` is a non-empty display value whose meaning is not safely interpreted.
- `not-applicable` is explicit source-side non-applicability.

Missing nodes, unscanned domains, duplicate domains, unresolved relationships, and incomplete coverage are structural failures, not field states. Expected domain count is derived only from the current snapshot markers. `coverage.complete` requires every F3 contract domain to end in a terminal state.

## Classification and persistence

The F1 existing full parser/validator is run unchanged. A F3 full result additionally passes a non-mutating F3 persistability audit before it may be saved: an explicit top-level package allowlist, bounded serialised/text size, and rejection of raw HTML/scripts/cookies/storage/tokens/history/external-resource fields. A package that validates as full but fails this audit becomes `unusable`; F3 does not sanitize or rebuild it.

If F1 full does not succeed, F3 builds evidence-bound `phase11-dokkaninfo-f1-partial-1` material directly from the F3 scan and runs the existing shared partial validator. Thus a blank Super-specific count is recorded as `unavailable` with blank-field evidence, never filled from enemy-wide count. `unusable` saves only the typed failure metadata.

The fixture bridge is the only typed-session entry. It takes event HTML plus reader functions; callers cannot inject a `classification`. Existing typed payload save/read-back, typed draft save/read-back, session write/read-back, ticket, and writer checks remain the next-stage/save gate. F3-prep itself has one stage and no next-stage action.

## Candidate extension source and retention

`prototypes/phase11-f3-prep-extension/` is separate, unbuilt candidate source only. Its manifest asks only for `storage` and has a single stage-pattern host/content-script match. Firefox match patterns are not an access-control guarantee; a later real build must retain both the runtime exact-URL check and event/stage ownership check. It requests no cookie, downloads, clipboard, webRequest, tabs, or activeTab permission. Candidate content source has no fetch/XHR, navigation, reload, linked-page opening, external-script loading, or API request.

Capture lifecycle records contain `createdAt`, exact seven-day `expiresAt`, and capture-scoped references—not snapshots. Cleanup is designed for start/init, not a background timer. `この限定確認を破棄` uses the capture-scoped deletion coordinator; a delete failure throws and must not be shown as success. The fixture preview demonstrates session-index deletion; a later real implementation must wire the same operation to every local artifact store atomically where the storage backend permits it.

## Fixture outcomes

The self-authored fixtures cover: complete full; blank Super-specific count → partial; relationship-unresolved → unusable; coverage missing AI → unusable; non-empty uninterpreted effect → unknown partial-material fact; and displayed `0` → known zero. No fixture uses 17050015 values. This does not establish that 17050015, or any live page, is partial-valid.

## Remaining gates before a real F3 test

Before separate owner approval, implementation still needs a reviewed F3 build path, isolated local storage deletion across all records, XPI permission/build audit, owner-confirmed one-stage live scope, a list of exact live fields to observe, and a check that the displayed DOM meets the fixed scan contract. A real full result must not be fabricated from a stage-only page without separately supplied, owner-displayed event material. A `partial` or `unusable` result can still pass the later technical gate only if it is safely classified and read-only reviewed.
