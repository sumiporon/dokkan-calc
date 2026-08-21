# Phase 1 safety record

Date: 2026-08-21 (JST)

## Canonical workspace

The canonical local workspace is:

`C:\Users\kou20\Downloads\dokkan-calc-main`

It contains the newest application JavaScript, the newest Chrome extension content script, the current handover document, and legacy helper/patch files. Its Git metadata is connected directly to `https://github.com/sumiporon/dokkan-calc.git`.

The older OneDrive Git worktree remains untouched as a secondary historical copy. Manual copying to that worktree is no longer the normal development path.

## Recovery points

- Verified full archive: `safety-backups/dokkan-calc-pre-phase1-20260821.tar.gz`
- SHA-256: `D70645B1C0F49C3299EC570DA3434081A61A67A82FF90CA4D7CD697385B0BD6F`
- Git rollback tag: `legacy-baseline-2026-08-21`
- Safety branch: `phase1-safety-20260821`

The archive includes the application, scraper sources, existing enemy data, HTML cache, Chrome extension, and legacy patches. It excludes reproducible `node_modules` and the backup directory itself.

## Scheduled enemy update pause

The `schedule` block in `.github/workflows/scrape.yml` is commented out. `workflow_dispatch` is intentionally retained for a reviewed manual test, so the pause is reversible and the scraper code is preserved.

The GitHub Actions page was also checked on 2026-08-21. GitHub shows `Daily Update - Scrape DokkanInfo` as **Disabled** because the repository had been inactive for at least 60 days. The last listed scheduled run was 2026-06-08 and failed. No remote action was needed to stop it: it was already disabled. The local workflow edit prevents the daily schedule from being restored accidentally when this safety branch is reviewed later.

Reasons for the pause:

1. The full scraper has a Super/Extreme class mapping error.
2. The full scraper emits a smaller schema than other parsers and can silently lose condition/critical detail.
3. The generated data is injected into the public application and committed without schema, count, or semantic validation gates.
4. DokkanInfo's current Terms of Use prohibit automated agents/scripts that generate automated searches, requests, or queries; scheduled use must not resume without resolving this policy issue.

Re-enabling the schedule is a later, separately reviewed task. It requires a validated acquisition method, fixture-based tests, before/after data checks, and a deliberate public-deployment step.

## Deliberately untouched

- Existing enemy JSON and the embedded preset
- Existing HTML cache
- Existing patch/helper files
- Chrome extension and DokkanInfo code
- GitHub PAT code
- Browser localStorage formats and values
- The large JavaScript layout
- Vite/TypeScript migration
