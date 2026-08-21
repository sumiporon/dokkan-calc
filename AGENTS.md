# AGENTS.md

This file defines the standing development policy for this repository. It applies to all files unless a more specific `AGENTS.md` is added below a subdirectory.

## Product and user context

- This is primarily a personal Dokkan Battle durability/damage calculator, but it is also publicly hosted on GitHub Pages.
- The owner has very little programming or Git knowledge. Agents should make routine technical decisions autonomously and explain results in plain Japanese.
- Ask the owner only when a product preference, game rule, irreversible public change, loss of data, or another decision only the owner can make is involved.
- Keep the solution proportionate to a personal tool. Prefer correctness, stability, maintainability, and a design that future AI agents can understand over fashionable or excessive architecture.
- Maintain a basic security standard because the app is public. Never expose credentials or tokens, and treat the GitHub PAT feature as sensitive legacy code.

## Development direction

- Use strategy B: rebuild important parts incrementally while preserving working behavior.
- The intended later direction is Vite + TypeScript + ordinary HTML/CSS, with enemy JSON, calculation logic, and tests separated from the UI.
- Do not introduce React or a backend as part of the current modernization unless a later, concrete requirement justifies it.
- Do not trust legacy behavior merely because it exists. Verify formulas and data mappings against evidence.
- Do not rewrite the whole application without a specific reason and a migration/rollback plan.
- DokkanInfo and the current acquisition method are not permanent assumptions. Prefer structured, stable, verifiable data sources when they are legitimately available.

## Safety rules

- Before a large or risky change, create and verify a recoverable commit, tag, branch, or archive.
- Never delete legacy source, HTML caches, patch scripts, Chrome extension code, DokkanInfo code, PAT code, or existing enemy data merely because it looks obsolete. Classify and preserve it first; deletion requires a separate reviewed task.
- Never regenerate, replace, or inject enemy data without schema validation, count/diff checks, representative record checks, and an explicit review step.
- Never let a scheduled job publish enemy data directly from an unvalidated scrape.
- Do not change the browser `localStorage` schema without a versioned migration and compatibility test.
- Do not force-push, rewrite shared Git history, or overwrite the public app as an incidental part of another task.
- Treat third-party terms, rate limits, robots directives, attribution requirements, and technical access controls as design constraints. Do not bypass access controls.

## Completion standard

- Writing code is not completion. Run relevant automated checks and test the actual user flow in a browser when UI or calculations change.
- Add regression tests before or with extracted calculation/data logic in later phases.
- For enemy-data changes, report the source, source timestamp/version, records added/changed/removed, validation results, and any unresolved fields.
- Keep commits small enough to explain and roll back. Do not mix a data refresh with unrelated application changes.
- Update documentation when run commands, data formats, deployment, or safety procedures change.

## Current Phase 1 state

- The canonical working folder is `C:\Users\kou20\Downloads\dokkan-calc-main`.
- The legacy rollback tag is `legacy-baseline-2026-08-21`.
- The daily enemy-data schedule is paused. Do not re-enable it until the scraper/data pipeline has validation gates and the data-source policy has been resolved.
- Phase 2 modernization and any real data-source migration require the owner's review of the Phase 1 report first.
