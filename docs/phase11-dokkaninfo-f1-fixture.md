# Phase 11 F1: fixture-only source scan

F1 is an offline, self-authored-fixture proof. It has no live DokkanInfo access, no network API, no XPI or Android-flow connection, and no production/canonical/runtime change.

The immutable input string is hashed first. The scan records only source identity, encounter/enemy/attack/condition ownership, bounded displayed text, structural path, terminal observation, and rule versions. It never stores the source HTML in a partial material.

Coverage counts are derived only from encounter/enemy/attack/condition structures enumerated in that same immutable snapshot. There is no external expected-count table or inferred missing enemy. `complete` is true only when every enumerated unit reaches a terminal observation and no structural failure was recorded; deliberately excluded F1 scope and uninterpreted scope remain explicit.

`known` requires a unique, safely interpreted displayed value (including `0`). `unavailable` requires a confirmed label/structure and blank displayed value. `unknown` requires non-empty displayed text whose meaning is not safely interpreted. Missing nodes, unscanned scope, unclear ownership, duplicate/conflicting fields, and structural ambiguity make coverage incomplete and classify as `unusable`; they are not field states.

The full branch calls the existing Phase 11 full parser/validator and package builder unchanged. The F1 test compares its canonical/runtime output directly with the scan-introduced full branch; it does not compare against a fixed expected fixture value. Only if that branch cannot produce a full package does the independent scan-derived partial adapter run. Cases B and C call `validateDokkanInfoF1Partial` from the existing shared `phase11-partial-material.mjs` validator module before receiving `partial`. A partial cannot contain canonical/runtime fields or be passed as a full package. The validator rechecks capture/snapshot ownership, evidence paths, rule versions, coverage, field terminal states, and content digest.

Fixture B conceptually models only the shape “a Super-specific maximum-attacks label exists but has no displayed value.” It contains no values from stage 17050015 and does not imply that a real stage is partial-valid.
