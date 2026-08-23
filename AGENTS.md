# AGENTS.md

This file defines the standing development policy for this repository. It applies to all files unless a more specific `AGENTS.md` is added below a subdirectory.

## Product and user context

- This is primarily a personal Dokkan Battle durability/damage calculator, but it is also publicly hosted on GitHub Pages.
- The owner has very little programming or Git knowledge. Agents should make routine technical decisions autonomously and explain results in plain Japanese.
- Internal technical choices are normally delegated to agents. Choose appropriate code structure, libraries, TypeScript boundaries, build methods, Git workflow, tests, schemas, conversion algorithms, CI, and other implementation details without asking the owner when one option is clearly safer and more maintainable.
- User-facing product behavior is different from internal implementation. Before making a major change to what the owner sees or operates—including screens, buttons, update steps, result presentation, save/load behavior, PC/mobile usage, or the meaning of an existing feature—explain in plain Japanese what would change, the realistic options, the recommended option, and how each option would affect normal use, then obtain the owner's approval. Small reversible UI corrections do not require separate approval.
- Ask the owner only when a product preference, game rule, irreversible public change, loss of data, or another decision only the owner can make is involved.
- Keep the solution proportionate to a personal tool. Prefer correctness, stability, maintainability, and a design that future AI agents can understand over fashionable or excessive architecture.
- Maintain a basic security standard because the app is public. Never expose credentials or tokens, and treat the GitHub PAT feature as sensitive legacy code.
- The long-term enemy-data goal is continuing coverage of newly added events, stages, and enemies, not merely cleaning the current snapshot. The ideal pipeline legitimately detects additions, acquires permitted data, validates the schema, reports diffs and anomalies, runs tests, and promotes only safe data without routine owner work.
- If compliant full automation is unavailable, the acceptable fallback is an update flow completed entirely inside the calculator UI: preferably one update button, or at most check-for-updates followed by one explicit approval. Do not make routine updates depend on visiting source sites, saving HTML, operating an extension, editing JSON, using GitHub administration, running a terminal, or manually copying files.
- The owner has now selected one operation as the initial enemy-update UX: one `敵データを更新` action must perform update discovery, retrieval, schema and required-field validation, anomaly checks, and safe application internally. Normal updates should apply without asking the owner to judge diffs; suspicious updates must stop and explain the reason. Zero-operation checking and updating at startup remains the later goal. The location, detailed screens, messages, and activation timing still require owner review before implementation.
- Aim for the same normal calculate-and-update experience on Windows PCs, Android, and iPhone. A PC-only browser extension may remain as preserved legacy code but must not be the required final update path.
- Offline use is desirable but not required. Assume normal use has an internet connection, and prioritize everyday simplicity, safe automatic updates, consistent PC/mobile operation, and low maintenance over complete offline support. Retain a simple OneDrive/local known-good or offline backup when it does not materially complicate delivery or updates; do not weaken the normal online experience solely for offline compatibility.
- The owner currently uses HTML opened directly from local storage or OneDrive on both PC and mobile. Preserve that working route until an approved migration exists, and compare it evidence-first with GitHub Pages or a hybrid rather than assuming either is mandatory.
- Pages-primary plus OneDrive-known-good-backup is approved only as a future hands-on comparison candidate, not as the selected normal workflow. Do not change the normal OneDrive route before the owner reviews the actual PC, Android, and iPhone experience.
- If Pages is later approved as the normal route, the owner accepts at most one initial operation to migrate existing saved data. Routine repeated migration is not acceptable, and the migration UI and steps require owner approval before implementation. Never migrate the legacy GitHub PAT or another credential.

## Development direction

- Use strategy B: rebuild important parts incrementally while preserving working behavior.
- The intended later direction is Vite + TypeScript + ordinary HTML/CSS, with enemy JSON, calculation logic, and tests separated from the UI.
- Do not introduce React or a backend as part of the current modernization unless a later, concrete requirement justifies it.
- Do not trust legacy behavior merely because it exists. Verify formulas and data mappings against evidence.
- Do not rewrite the whole application without a specific reason and a migration/rollback plan.
- DokkanInfo and the current acquisition method are not permanent assumptions. Prefer structured, stable, verifiable data sources when they are legitimately available.

## Continuous re-evaluation

- Treat the current development direction as the best working hypothesis, not an unchangeable premise. Respect it by default, but keep asking during implementation whether it is still the simplest, safest, most accurate, and most maintainable choice for this personal application.
- Re-evaluate an earlier decision when new evidence from the code, data, tests, external services, terms, or actual user behavior shows a clear benefit. Never preserve a technology or structure solely because it was chosen previously.
- Vite, TypeScript, GitHub Pages, JSON storage, DokkanInfo, and GitHub Actions are not absolute requirements. A clearly better option may replace them after an evidence-based comparison.
- Do not change direction frequently or without a concrete reason. Record the evidence, benefits, costs, migration risk, and rollback path for a meaningful change.
- Agents may make small, reversible technical improvements autonomously when they stay within the approved product scope.
- Before implementing a major change to architecture, the persistent data format, the enemy-data source, or the publication/deployment method, explain the proposed change and its trade-offs to the owner in plain Japanese and obtain approval.
- Plans are guides rather than scripts. Reassess assumptions while working instead of mechanically completing an obsolete plan.
- Treat technical accessibility and permission as separate questions. Do not bypass bot protection, access controls, Terms of Use, or `robots.txt`. Keep the current production dataset as the baseline, but do not treat DokkanInfo, DokkanDB, DokkanStats, or another site as an approved primary source without the necessary permission. The current first inquiry candidate is DokkanStats because its terms explicitly allow prior written permission; re-evaluate this if permission, licensing, or a better legitimate source becomes available.

## Safety rules

- Before a large or risky change, create and verify a recoverable commit, tag, branch, or archive.
- Never delete legacy source, HTML caches, patch scripts, Chrome extension code, DokkanInfo code, PAT code, or existing enemy data merely because it looks obsolete. Classify and preserve it first; deletion requires a separate reviewed task.
- Never regenerate, replace, or inject enemy data without schema validation, count/diff checks, representative record checks, and an explicit review step.
- Never let a scheduled job publish enemy data directly from an unvalidated scrape.
- Do not change the browser `localStorage` schema without a versioned migration and compatibility test.
- Do not force-push, rewrite shared Git history, or overwrite the public app as an incidental part of another task.
- Treat third-party terms, rate limits, robots directives, attribution requirements, and technical access controls as design constraints. Do not bypass access controls.
- Never place data-source, GitHub, or backend credentials in browser code, downloadable files, or `localStorage`. Any future secret needed for updates must remain in a server-side or CI secret store that the browser cannot read.

## Completion standard

- Writing code is not completion. Run relevant automated checks and test the actual user flow in a browser when UI or calculations change.
- Add regression tests before or with extracted calculation/data logic in later phases.
- For enemy-data changes, report the source, source timestamp/version, records added/changed/removed, validation results, and any unresolved fields.
- Keep commits small enough to explain and roll back. Do not mix a data refresh with unrelated application changes.
- Update documentation when run commands, data formats, deployment, or safety procedures change.

## Current modernization state

- The canonical working folder is `C:\Users\kou20\Downloads\dokkan-calc-main`.
- The legacy rollback tag is `legacy-baseline-2026-08-21`.
- The daily enemy-data schedule is paused. Do not re-enable it until the scraper/data pipeline has validation gates and the data-source policy has been resolved.
- Phase 3 introduced a small shared calculation core and offline saved-HTML analysis, but did not replace the production enemy dataset, localStorage, deployment, or scraper.
- The owner selected a compact 1.00–1.03 damage range in the existing damage field, with durability/perfect-defense thresholds calculated at the safety-side 1.03 value. Keep calculated perfect defense displayed as `0`/`完封`; no minimum-damage disclaimer is needed in the normal UI.
- Phase 4 may prototype candidate data, compatibility conversion, TypeScript boundaries, and update/hosting designs, but must not replace production enemy data, change localStorage, publish Pages, or alter the owner's normal OneDrive use before the Phase 4 report is reviewed.
- The Phase 5 report recommends DokkanStats only as the conditional first permission/inquiry candidate, not as an approved production source. Its public coverage, documented data interface, redistribution permission, and one-week freshness requirement remain unproven; the send-ready inquiry is still unsent.
- Treat the future source-neutral canonical schema, lightweight runtime projection, release manifest, and Pages-primary/OneDrive-backup hybrid as proposals. The current v1 draft is not production-final, and no source, production data, localStorage, publication method, update UI, or normal device workflow may be migrated before the relevant evidence and owner approvals are complete.
- The owner approved an offline Phase 6 that builds a source-neutral canonical v2, runtime projection, manifests, safety and permission gates, adapter contracts, and migration/hosting test designs. Phase 6 must not contact external data sites, adopt DokkanStats, replace production data, change localStorage, implement the production update button, publish Pages, alter OneDrive use, or proceed into Phase 7.
- The DokkanStats inquiry is approved for the owner to send personally after final review. Codex must not send it or otherwise contact the operator on the owner's behalf.
- Phase 6 completed the offline source-neutral canonical v2, deterministic runtime projection, release manifest, candidate/stable/known-good lifecycle, safety and permission gates, adapter contract, and full 5,032-enemy migration verification. The saved-cache candidate remains non-production: it has no canonical known-good comparison baseline and no permission to publish derived data, so promotion is correctly blocked.
- The Phase 6 runtime measures 16.7 MB as tracked pretty JSON and about 6.05 MB minified. PC and throttled-Chromium reference measurements passed, but real Android/iPhone memory and Safari behavior are unverified. A local `file://` page could not fetch the adjacent JSON. Before any production migration, compare minified full runtime with an event index plus on-demand chunks, and use a file-compatible script-data form for any retained local/OneDrive route.
- Phase 6 confirmed that Vite is unnecessary for the offline data foundation. Reconsider it only if a later browser prototype demonstrates a concrete advantage over plain generated scripts for module/chunk/hash management.
- The owner approved a production-separated Phase 7 to prototype and measure full-runtime, event-chunk, file-compatible, Pages-like, OneDrive, hybrid, one-operation update/rollback, and one-time saved-data migration flows using only Phase 6 offline data and mock fixtures. Phase 7 must not change main, production app/data/localStorage/UI, Pages, OneDrive, workflows, or contact external data sites. It must stop before Phase 8 and present user-facing choices for approval instead of adopting a normal workflow.
- Future Pages/automatic updates should not require storing a GitHub PAT in the browser. Preserve the legacy PAT code and existing user data for now, but exclude PATs and credentials from every Phase 7 migration/export/update prototype.
- Phase 7 completed its production-separated prototypes and measurements with 144 passing tests. The full runtime is 6,048,874 bytes; the event index is 47,030 bytes across 88 event chunks. On this PC, Pages-like full/chunk initial readiness measured about 357/165 ms; the 390px Chromium 4x-CPU reference measured about 1,674/1,099 ms. These are not Android/iPhone/Safari real-device results.
- The current Phase 7 recommendation is Pages-primary event-chunk browsing with a full artifact available for simpler release validation, plus the existing OneDrive app as a known-good/offline backup. This is a recommendation, not an approved production migration. Phase 8 must not begin until the owner chooses the user-facing route, initial event behavior, update presentation, one-time migration flow, and backup presentation. Real Android Chrome and iPhone Safari checks must precede production cutover.
- Phase 7 proved one-operation update gates, atomic rollback, file-compatible generated scripts on Windows, and a fake one-click cross-origin saved-data transfer with PAT exclusion. Zero-operation updates remain disabled until the documented permission, 60-day/30-candidate pilot, success, freshness, rollback, retention, compatibility, and owner-approval conditions are met.
