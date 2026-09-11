# Phase 11 typed one-tap — Phase E inspection review (fixture only)

Phase E adds a transfer boundary for the self-authored four-stage fixture:

`typed session` → revalidated typed inspection batch → independent receiver → revalidated read-only review.

The batch has its own kind/version, event and session identity, event plan and
digest, ordered stage classifications, typed full/partial draft references and
payloads, unusable failure metadata, explicit unvisited records, derived
counts, and a batch digest.  It does not convert a partial material into a
full package, create a payload for an unusable stage, or treat an unvisited
stage as a failure.

Both boundary sides revalidate.  Generation first reloads the session (which
rechecks the plan, typed drafts, full packages, partial materials and failure
metadata), then reloads each referenced draft/failure while constructing the
batch.  `TypedInspectionReceiver` clones and independently validates the
received batch, including package/material validators, ownership, digests,
stage order and derived counts.

The receiver is `phase11-typed-inspection-receiver.mjs`, not
`phase11-one-tap-receiver.mjs`.  It has no persistence, apply, rollback,
retry, skip, revision, next-stage, or calculator API.  The fixture transport is
an encoded same-origin page fragment only; it is deliberately not a selected
future storage or cross-device transfer format.

The owner-facing fixture review shows only full/partial/unusable/unvisited
counts and stage states.  A zero-capability partial says `材料のみ保存・現在は計算できません`.
It does not display damage, perfect-defense DEF, target-damage DEF, defender
settings, or an apply action.

Automated coverage rejects modified batch/plan digests, reordered/duplicate
stages, type masquerading, missing full or partial payloads, partial digest
mismatch, altered failure metadata, unusable/unvisited confusion, ownership
and count mismatch, and a hidden unvisited draft during generation.  It also
confirms that a typed mixed batch is rejected by the unchanged full-only
receiver and that generation/review leave the source session revision and
writer state unchanged.

This remains production-separated and self-authored-fixture-only.  It does not
connect live DokkanInfo, an XPI, canonical schema changes, calculation-core,
the existing full receiver, production data, or a personal snapshot.
