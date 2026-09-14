# Dedicated structure diagnostic: signing preflight

2026-09-14–15 JST. Baseline `075d5f8bf2e641f7aedb9e6123b02cf068689bc9` on
`codex/phase11-android-firefox-one-tap-prototype-20260910`, initially clean and
equal to its remote-tracking ref. This preparation creates only unsigned local
packages. No commit/push, AMO upload/signing, Android installation, live-site
access, production connection, classifier change, main merge, tag or deployment
is part of this task.

## Source and repeatable build

The new template is `amo/phase11-f3-structure-reviewer/`. It is independent of
the historical F3 preflight reviewer package. The candidate and standalone
reviewer share `build.mjs`; the existing candidate/fixture builder calls the
same candidate function with archive generation disabled. Runtime sources and
manifest are unchanged. The resulting candidate bundle was compared byte for
byte against the checkpoint's original esbuild recipe and matched.

From the repo, with Node.js 22.17.0 / npm 10.9.2 and existing dependencies:

```powershell
node scripts/build-phase11-f3-structure-packages.mjs
node scripts/build-phase11-f3-structure-extension.mjs
node --test tests/unit/phase11-f3-structure-extension.test.mjs tests/unit/phase11-f3-structure-packages.test.mjs
node --test --test-concurrency=1 tests/browser/phase11-f3-structure-extension.test.mjs
```

Only `generated/phase11-f3-structure-extension/` receives packaging output:

- `phase11-f3-structure-diagnostic-unsigned.zip` — exactly `content.js` and `manifest.json`.
- `phase11-f3-structure-diagnostic-reviewer-source.zip` — original three runtime .mjs modules, manifest, dedicated build/ZIP/verification scripts, English Windows README, minimal package.json/lockfile, expected unsigned hash and source-file hashes.

The source package is an explicit file allowlist. It excludes node_modules,
generated JavaScript, test probes/fixtures, unrelated production/game data,
credentials, Git history and earlier F3 packages. esbuild 0.28.2 and Cheerio
1.0.0-rc.12 plus their transitive versions are pinned in the new lockfile. npm ci
retrieves their original published packages; they are not copied from an older
reviewer archive. ZIP entry order, uncompressed data, timestamps and metadata
are fixed. The packager rejects unexpected files in the candidate directory.

The reviewer instructions require a fresh directory, then:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run verify
```

The output is `dist/phase11-f3-structure-diagnostic-unsigned.zip`.
Build/verify need no browser or source-site access. Dependency installation
uses only the public npm registry; no install scripts or credentials are needed.

## Permission and execution audit

The manifest remains version 0.0.1, ordinary permissions `[]`, separate ID
`phase11-f3-structure-diagnostic@sumiporon.invalid`, and only the literal
`https://jpnja.dokkaninfo.com/events/challenge/1705/17050015` host/content match.
No wildcard, background, optional permissions, messaging, or web-accessible
resource is present. Manifest path matching alone is not the runtime boundary:
top-level entry and trusted owner invocation both enforce the exact URL.

Source and generated-bundle inspection, dependency input allowlisting and
isolated-content-script browser instrumentation cover no capture/scan/save
before tap; URL/one outerHTML/URL/immutable digest sequence; no browser network,
navigation/reload/retry, persistence or cookie APIs; no snapshot in output or
messages; and permissionless user-gesture copy. Generic library methods named
replace/assign are string/object operations, not navigation. The build has only
the three original runtime modules and inert parser dependencies. The candidate
does not contain the test probe or fixture data. Browser requests are restricted
to local fictional pages in the test harness.

Results remain bounded, in page memory only; zero and blank remain distinct;
coverage remains unconfirmed. No full/partial/unusable classification or
calculation is added. No new owner-facing product behavior is introduced.

## Measured reproducibility

The reviewer source ZIP was extracted into a new directory outside the repo,
with no inherited repo node_modules or generated artifacts. Running only the
documented install/build/verify procedure installed 17 packages and reproduced
the unsigned candidate exactly. The archive was also expanded successfully by
Windows Expand-Archive. SHA-256 values:

```text
unsigned candidate / clean reviewer rebuild:
158C9B80AE0095B19CC7FD73FAC7F6AB8C0824EFA23F156698DCAF71CD5F9DBB

reviewer source:
543FEE89F839462E013743950F8C110444B37734E4A2F90505739568C535B843
```

These are new diagnostic package hashes, unrelated to the old F3 preflight
archive hashes. Nothing was uploaded, signed, installed on Android, or tested
against live DokkanInfo. Actual Firefox/Android copy compatibility and live DOM
coverage remain unmeasured; successful fixture packaging does not resolve them.

## Verification record

Structure extension unit 13/13, package unit 5/5 and browser 3/3 pass. New package
checks cover permission/identity tampering, exact archive contents, original
source inclusion, minimal pinned dependencies, expected digest, ZIP independence
from creation order/mtime, and rejection of foreign stale candidate files.

The formal `npm test` completed successfully: 396 tests, zero failures/skips,
including 181 unit tests, plus syntax/type checks. All required ignored build
prerequisites were prepared first:

```powershell
npm run build:phase11-one-tap
node scripts/build-phase11-partial.mjs
node scripts/build-phase11-dokkaninfo-f1.mjs
node scripts/build-phase11-typed-one-tap.mjs
node scripts/build-phase11-f3-structure.mjs
npm test
```

The additional browser command below passed 13/13, covering the source scan,
F3-prep, F2, typed inspection/restart, partial storage/rollback, single-hit, and
existing one-tap fixture path:

```powershell
node --test --test-reporter=spec --test-concurrency=1 tests/browser/phase11-f3-structure.test.mjs tests/browser/phase11-f3-prep.test.mjs tests/browser/phase11-f2-fixture-bridge.test.mjs tests/browser/phase11-typed-one-tap.test.mjs tests/browser/phase11-partial.test.mjs tests/browser/phase11-single-hit.test.mjs tests/browser/phase11-one-tap.test.mjs
```

The full regression includes generators for production artifacts and fixed
previews. Production artifacts remained byte-identical. Its regenerated
`phase11-preview/index.html` difference was restored to HEAD after the run and
is not part of this change. This does not claim to fix the historical
fixed-preview mismatch when that test is run with different build prerequisites.
The initial offline lockfile attempt reported ENOTCACHED; generating the new
minimal lockfile from the public npm registry succeeded. This was a dependency
preparation issue, not a test/assertion failure.

The final protected-boundary diff is empty: diagnostic runtime/manifest/UI,
production/data, existing live-gate, old F3 preflight, full receiver,
calculation-core and canonical schemas are unchanged. `git diff --check` and
whitespace checks for new source files pass. Changes remain uncommitted for
owner review. The technical packaging/rebuild gate passes; AMO validation or
approval, Firefox/Android execution, and current live DOM support are not
claimed by these local checks.
