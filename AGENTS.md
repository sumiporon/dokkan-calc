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
- Aim for the same normal calculate-and-update experience on Windows PCs, Android, and iPhone. A PC-only browser extension may remain as preserved legacy code but must not be the required final update path.
- The owner currently uses HTML opened directly from local storage or OneDrive on both PC and mobile. Preserve that working route until an approved migration exists, and compare it evidence-first with GitHub Pages or a hybrid rather than assuming either is mandatory.

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
