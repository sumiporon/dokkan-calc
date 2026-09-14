# Dedicated structure diagnostic extension candidate — fixture-only

Baseline: `0fadaacc86664bba6924bb8e0e80cf7d0006f09c`.
This is a separate, unsigned extension candidate for a later owner-authorized observation of stage 17050015. This task performs only local builds and self-authored fixture tests. No live source access, AMO submission, signing, XPI archive, Firefox/Android installation, intake classification, canonical conversion, calculation, or receiver connection is performed.

## Isolation and permissions

Source: `prototypes/phase11-f3-structure-extension/`.
Firefox ID: `phase11-f3-structure-diagnostic@sumiporon.invalid`, version `0.0.1`.
Ordinary permissions: `[]`, including no storage or clipboard permission.
Host permissions and content-script matches contain exactly one literal URL:

```text
https://jpnja.dokkaninfo.com/events/challenge/1705/17050015
```

There are no wildcards, background script, runtime messaging, extension review page, web-accessible resources, optional permissions, or programmatic navigation. The entry also checks top-level frame and exact `location.href` before creating controls. The capture controller checks the URL again at the owner tap. A manifest host permission alone is not relied on as a path-level security boundary; exact entry/capture checks are mandatory.

The candidate bundle has only the new entry/UI, the unchanged `phase11-f3-structure-diagnostic.mjs`, and its inert parsing dependencies. Build metadata lists the input modules. No preflight, live-gate, existing full receiver, storage, classifier, canonical/runtime, or calculation module is bundled.

## Capture, diagnostic and result lifetime

Before a trusted user click, the content script creates controls only: no source capture, digest, scan, persistence or network operations. Page-generated synthetic clicks are rejected. The existing one-shot controller performs:

```text
exact URL check -> outerHTML once -> URL recheck -> immutable string
-> snapshot digest -> existing structure diagnostic -> bounded result UI
```

The capture function is not called again when the diagnostic or copy operation fails. The capture button remains disabled after the first run. There is no retry or reload operation. URL drift fails before digest/scan, and no result text is exposed for capture errors. Unexpected exceptions remain diagnostic execution failures, never full/partial/unusable classification results.

The unchanged diagnostic contract observes identity, encounter/enemy candidates, names/type-class candidates, HP/ATK/DEF/enemy count, Super header/name/damage, HP conditions, probability, Super-specific count, reuse, skill, AI and AOE candidates. Parent ordinals and structural paths are retained. Missing, ambiguous, blank, detected and non-empty-unparsed remain distinct. Literal `0` remains observed text `"0"`; this diagnostic does not issue a numeric `known: 0` capability assertion. No enemy-wide count or historical value is substituted.

Only the bounded diagnostic object is rendered: digest, rule, counts, observations, issues and coverage. Candidate texts are limited to 160 characters; all original diagnostic size/node/record/path/output limits remain in force. Page-wide `coverage.status` remains `unconfirmed`, even when all configured candidates are found. Any issues produce the Japanese main heading `構造を安全に判定できませんでした`, while still showing the observations. An issue-free traversal displays `構造診断が完了しました`; it does not certify live semantics or full page coverage.

The snapshot is local to capture/scan and released after processing, with no persistence or message transport. Result text remains in the current page's shadow UI/memory only. Reload creates an empty, idle UI; there is no restore or automatic recapture. Memory release is not a guarantee of immediate physical erasure by browser GC. A copied result remains in the OS clipboard/paste destination under owner control.

## Copy and owner UI

The same page shows Japanese observation labels, scope, counts and short text. Structural paths and internal codes are secondary disclosures. `診断結果をコピー` selects the read-only result textarea and synchronously invokes `document.execCommand('copy')` inside its trusted click handler. No clipboard permission is requested and no clipboard read exists in the extension. A false return or exception displays failure and leaves selectable text for manual copy. It never claims successful copying after an API failure.

Actual permission-free writing was tested in a Chromium content script's isolated world. The test grants only its page a clipboard-read permission **after** copying, to verify the entire clipboard text (allowing Windows CRLF conversion). Android Firefox copy behavior remains unmeasured; failure does not cause a permission escalation or source recapture. The user-gesture copy API is a compatibility choice for this limited candidate, not a claim of support on every browser/version.

## Local build and review

```text
node scripts/build-phase11-f3-structure-extension.mjs
node --test tests/unit/phase11-f3-structure-extension.test.mjs
node --test --test-concurrency=1 tests/browser/phase11-f3-structure-extension.test.mjs
node scripts/preview-phase11-f3-structure-extension.mjs
```

Outputs under ignored `generated/phase11-f3-structure-extension/`:

- `candidate/`: only `manifest.json` and `content.js`, unsigned/unpacked; not an installation instruction.
- `fixture-test/`: separate Chromium test manifest with nine exact localhost stage paths, no wildcard or real host. Tests load this unpacked fixture extension in disposable browser profiles only.
- `preview/`: the same shared UI in ordinary localhost fictional pages, requiring no extension installation. The preview server prints `/index.html`.
- Input manifests and test screenshots, also ignored.

Only the test extension receives `tests/helpers/phase11-structure-extension-probe.js`. It instruments the **isolated content-script world** for outerHTML/digest/network/persistence/copy counters and URL-drift/copy-failure injection. The candidate and owner preview exclude this probe. Test routing aborts all non-loopback requests. Static source checks reject network/navigation/storage APIs; bundle checks target actual browser API references because an inert parsing dependency may have a local helper with a similar identifier.

Fixtures: original six structure fixtures (normal, blank, orphan condition, ambiguous roots, missing, duplicate field), plus zero enemy candidates, stage-identity mismatch, and long text/private canary exclusions. All IDs and values are fictional. No values from 17050015 were copied.

## Verification

New tests: unit 13/13 and browser 3/3. They cover the nine fixture flows; tap-before/after counters; synthetic click rejection; exact single capture; URL drift; ownership mismatch; zero/ambiguous enemy candidates; condition ownership; duplicate fields; blank versus `0`; text limits; private/raw HTML exclusions; no source-network/storage calls; exact manifest; copy success/failure; reload without persistence/recapture; and 360/390px layout. The owner preview was exercised separately and its initial/result screenshots inspected.

Related regression: unit/data 104/104 and browser 13/13, covering F1, F2, typed A-E/inspection, partial, single-hit, F3-prep, preflight record/manifest units, structure diagnostic, and one-tap. The first invocation found an absent ignored F1 generated API after the preceding cleanup; building `scripts/build-phase11-dokkaninfo-f1.mjs` restored that prerequisite and all five F1 tests passed. This was a build prerequisite, not an assertion regression. No `--fixed-preview`, production generator, or old F3 preflight ZIP build was run; the historical fixed-preview mismatch is not repaired by this task. These are the complete selected related regressions, not a claim that the repository-wide `npm test` was run.

All tracked runtime/source outside the new directory is unchanged, including the diagnostic engine itself, production, existing live-gate, F3 preflight extension, full receiver, canonical schema, calculation-core and production dataset. Only a new generated-directory ignore line is added to existing configuration.

## Owner UI review

On 2026-09-14, the owner reviewed the localhost fictional preview and marked it PASS. The fixture list was visible; before the explicit tap no diagnostic result existed; the tap produced a normal diagnostic with encounter 1, enemy 2, Super 4, condition 4, and observation 63. The owner successfully copied the complete bounded diagnostic into ChatGPT, including `kind: structure-diagnostic`, `coverage.status: unconfirmed`, and excluded scope. This validates the fixture-only owner UI and copy flow, not a live-site capture or source adoption.

## Subsequent package preparation

The separately authorized unsigned-package/reviewer-source preflight is recorded
in [the signing preflight report](phase11-f3-structure-signing-preflight.md).
It shares the candidate build function with this fixture builder without
changing the diagnostic runtime, manifest, owner UI or copy operation. AMO
submission, signing, installation and live-site execution remain separate.
