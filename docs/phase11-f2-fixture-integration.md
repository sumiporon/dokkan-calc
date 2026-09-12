# Phase 11 F2: fixture HTML to typed session (offline only)

F2 connects only self-authored DokkanInfo-shaped HTML fixtures to the already
isolated typed one-tap prototype. It adds no live-site access, browser
extension/XPI change, Android real-site operation, production connection,
canonical-schema change, calculation-core change, or existing full-receiver
change.

Each stage begins with the complete HTML receipt (event HTML, stage HTML,
capture/revision/time, and expected event/stage identity). The only F2 intake
API is `captureF2FixtureHtml`; callers cannot provide a preclassified object.

`HTML receipt → F1 immutable scan → F1 classifier → full | partial | unusable`

For `full`, F2 revalidates F1's actual full package with the existing full
validator, persists it, reloads it, and only then builds a `full-package`
typed draft. For `partial`, it revalidates the shared F1 partial-material
validator (evidence ownership, coverage, snapshot digest, capture and rule
versions), persists/reloads it, and only then builds a `partial-material`
typed draft. A partial is never converted to a full package.

For `unusable`, F2 persists no full/partial payload or draft. It proves that
both draft types reject, then writes bounded failure metadata. F2 adds a
separate versioned failure format only when an F1 scan provides source
evidence: event/stage, capture ID, snapshot digest, and stop code. The
established failure format remains unchanged for A–E fixtures.

The next-stage gate remains:

`classification → validator → material/package save → read-back → typed draft
save → read-back → session save → read-back → writer/ticket/revision check`.

It does not depend on a single-hit capability result. The F2 partial message
therefore says that materials were saved and calculation eligibility has not
yet been decided.

Fixture Event A demonstrates `full → partial → full` with typed-draft-derived
counts `full 2 / partial 1 / total 3`. Event B demonstrates `full → partial
→ unusable → unvisited`; it stops at stage 3, retains the first two drafts,
and sends the existing revalidated typed inspection batch to its independent
read-only receiver. Evidence and coverage remain inside the referenced
partial material through that receiver.

F2 automated checks cover receipt-only intake, ownership, incomplete
coverage, type masquerading, evidence/snapshot/digest/rule tampering, old
known-value backfill, typed-draft tampering, known-zero preservation,
unusable stop, inspection transfer, restart/non-writer/takeover, stale-ticket
rejection, and existing full canonical/runtime equivalence. It is still a
fictional-fixture proof, not evidence that any real DokkanInfo stage can be
classified as partial-valid.
