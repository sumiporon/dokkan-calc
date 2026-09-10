# Phase 11 Android Firefox one-tap prototype

確認基準日: 2026-09-10 JST

## Status and scope

This production-separated prototype tests one narrow question: after an owner starts one event, can each displayed stage be validated and durably drafted before the same-position `次のステージへ` button causes the next normal top-level navigation?

- The self-authored three-stage flow works in automated desktop browser extension tests and passed the owner's Android Firefox actual-device gate on 2026-09-10.
- Signed-XPI installation, fixed-position one-tap stage navigation, durable progress after Firefox termination, explicit writer takeover after restart, review/apply, and rollback are verified on the owner's Android device.
- DokkanInfo is not selected as a primary source. Its Terms do not establish permission for this extraction/storage flow, and the prototype does not change that legal assessment.
- Production Pages, production data, the OneDrive app, and the legacy Chrome extension are untouched.
- No live DokkanInfo page is accessed by the build or automated tests.

## Boundary

`phase11-one-tap-adapter.mjs` owns source-specific page recognition, event-link extraction, displayed-stage parsing, completeness/meaning checks, source identity, coverage, and canonical/runtime conversion. It receives current DOM text and the current URL and has no network or session API.

`phase11-one-tap-session.mjs` owns the one active event, visit units (separate from game-stage records), current position, the one writer tab, resume, deduplication, stale-result rejection, failures, durable draft, and batch creation. It does not parse source URLs or DOM.

The Firefox content script only presents controls, passes the already displayed DOM to the adapter, and calls `location.assign()` after a fresh owner click and a fresh session check. The background script serializes session writes in `storage.local`. The isolated review page is the calculator-side prototype receiver: it validates and persistently receives a batch in IndexedDB, records owner review separately, applies through the existing Phase 11 validation/diff/store, and retains rollback. Raw HTML is transient and is never stored.

## Navigation and failure rules

For each stage the order is: expected visit-unit check, DOM/coverage check, parse, semantic completeness, canonical/runtime validation, draft write, read-back verification, then button enablement. A click before readiness is not queued. The click rechecks the current writer/session before navigating.

There is no `fetch`, XHR, background acquisition, automatic navigation, programmatic click, timer loop, reload, retry, prefetch, iframe acquisition, hidden API, or access-control bypass. Reload remains an ordinary owner/browser action and `表示済みDOMを再解析` is a separate, network-free action.

Reloading or revisiting identical normalized content does not add a duplicate. A changed fingerprint for the same visit unit, a different event, another writer tab, a stale analysis ticket, incompatible adapter/session version, incomplete meaning, failed validation, or failed durable write stops at that stage. Drafts remain until explicit discard; sending or showing review never deletes them.

Batch states are distinct:

1. extension sent the batch;
2. calculator receiver validated and durably received it;
3. owner marked it reviewed;
4. the existing personal prototype store applied it.

The same batch ID and digest are idempotent. The same ID with different content is rejected.

## Firefox Android feasibility checked from Mozilla primary documentation

- Firefox for Android installs compatible add-ons through Mozilla Add-ons. Compatible installed add-ons normally update with Firefox: <https://support.mozilla.org/en-US/kb/find-and-install-add-ons-firefox-android>
- Stable Firefox for Android can install a **signed** XPI from a file after enabling the documented developer menu. An unsigned archive is not the Android gate artifact: <https://extensionworkshop.com/documentation/publish/install-self-distributed/>
- Self-distributed add-ons must be signed. On Android a downloaded XPI is installed through `Install Extension from File`; an unlisted package without an update URL is updated manually: <https://extensionworkshop.com/documentation/publish/self-distribution/>
- A `browser_specific_settings.gecko_android` declaration marks the add-on compatible for Android listing: <https://extensionworkshop.com/documentation/publish/version-compatibility/>
- Manifest content scripts run on matching pages after navigation and can use extension storage; only the exact declared host patterns are included: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts> and <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions>
- New AMO submissions must declare Firefox's built-in data-collection status. This prototype transmits nothing outside the local browser and declares `required: ["none"]`; the documented minimums for that consent system are desktop 140 and Android 142: <https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/>

The source build requests only `storage` and the exact DokkanInfo challenge-page host path. The fictional gate build requests only `storage` plus localhost and the repository-specific RawGitHack fixture path. Neither uses `<all_urls>`, cookies, downloads, clipboard, tabs permission, or webRequest.

Signing needs an owner-controlled Mozilla account/AMO submission and therefore cannot be completed by Codex. The owner completed self-distributed signing and installed the signed XPI on Android Firefox; the fictional event/stage gate then required no PC connection.

## Build and gate artifacts

Run `npm run build:phase11-one-tap`. It creates ignored, reproducible extension folders under `generated/phase11-one-tap/` and tracked fictional pages under `phase11-one-tap-fixture/`.

The production comparison runtime is packaged as local `baseline-runtime.json`, not embedded in `review.js`. This is a local extension-resource read, never a source-site request. The build fails if any generated JavaScript reaches AMO's 5 MiB text-parser limit.

- `fixture`: safe self-authored Android gate build; it has no DokkanInfo host permission.
- `source`: technically wired build; do not install or use it on the live source until the separate Terms/adoption decision.
- `chromium-test`: automated desktop test-only manifest.

Upload the fixture ZIP to AMO as an unlisted add-on and download the signed XPI. The early Android check is intentionally limited to the fictional pages. It must verify stable Firefox install, content-script presence after navigation, saved progress after Firefox/process termination, explicit takeover on a new tab, review handoff, and no need for a PC during normal repeated use.

The commit-fixed RawGitHack fixture route currently shows its own `External Content Notice` before the fictional page. That one extra confirmation is fixture-host setup only, not part of the proposed everyday source flow; do not bypass it. After the owner opens the page normally, the gate begins with the extension's `開始` button.

## Android actual-device gate — PASS

Owner report, 2026-09-10 JST:

- AMO accepted the v2 fixture package with validation errors 0 / warnings 0, approved it for self-distribution, and showed Android Firefox compatibility. The signed XPI installed normally on Android Firefox.
- The fictional event started normally. Stages 1, 2, and 3 each passed parse, validation, and durable draft save, showing `1/3`, `2/3`, and `3/3` respectively.
- After the event was selected once, each normal stage transition used the same fixed-position `次のステージへ` button once. The final `計算画面で確認` action opened the review page.
- The review receiver showed state `received`, three stages, safety checks `passed`, and warnings/errors `0 / 0`. Explicit owner review and apply changed the state to `applied`.
- `1つ前の個人prototypeへ戻す` succeeded. The state returned to `reviewed`, and the same batch could be applied again.
- After stage 1 was saved, the owner fully terminated Firefox from Android's recent-apps screen. The draft and session survived restart. The safety stop `このタブは書き込み担当ではありません` appeared as designed; one `このタブへ担当を移す` tap resumed the session. This is an interruption-recovery exception, not an extra operation in the normal per-stage flow.

Therefore the narrow Android technical question is **passed** for the self-authored fixture: `開始 → each stage uses one fixed-position next tap → final review → explicit apply`, including durable interruption recovery and rollback. This does not establish compatibility with live DokkanInfo DOM, source-specific data meaning, Terms permission, source adoption, or production integration.

## Known limits before any source adoption

- Current DokkanInfo Terms applicability to displayed-DOM extraction, transformed personal storage, and this extension flow remains unresolved; a human tap is not treated as permission.
- No live-site DOM test or current-event freshness test is included. DokkanInfo-specific AOE and other source meanings remain unresolved.
- The receiver is isolated prototype UI, not production calculator integration.
- The prototype supports one active event, one writer, and at most 20 visit units. It does not implement multi-source fallback, synchronization, automatic updates, or raw-HTML retention.

## Next single step

The next step is the **DokkanInfo Terms/adoption gate**, not live-site use or production connection. Using the currently obtained Terms text and the exact prototype behavior, decide separately whether ordinary human page viewing, reading already displayed DOM, transient parsing, transformed personal storage, and cross-page session drafts are sufficiently permitted for a limited live compatibility test. Silence, a normal page load, or AMO approval is not source permission.

Only if that gate permits proceeding, the next technical check should be one narrowly scoped owner-driven live DOM test: one public event and two or three representative stages, including multiple Supers/conditions where available and an AOE case only to confirm fail-closed behavior. The owner would install the separately signed source-gate XPI once, open the event normally, press `開始`, use the fixed `次のステージへ` tap once per selected stage, and open the final review. There would be no background fetch, automatic traversal, URL copying, page saving, file picker, publication, production apply, or access-control bypass. Stop after compatibility and safety output are recorded.
