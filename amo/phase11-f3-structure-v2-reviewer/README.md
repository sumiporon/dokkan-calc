# Structure diagnostic v2 (0.0.2): Mozilla reviewer source

This original source reproduces `phase11-f3-structure-diagnostic-v2-0.0.2-unsigned.zip`.
The add-on ID is `phase11-f3-structure-diagnostic@sumiporon.invalid`, the same ID
as 0.0.1. This package contains the approved v2 implementation at repository
checkpoint `46d1ec2c8d11a5d079bd8f99ddbe5b4999e86bb1` plus its build tools.
It is not the older F3 preflight add-on or the 0.0.1 structure diagnostic package.

## Windows requirements and installation

Use Windows x64, Node.js **22.17.0**, npm **10.9.2**. Install the Windows x64 MSI
from the official release directory: https://nodejs.org/download/release/v22.17.0/
Open a new PowerShell window and check:

```powershell
node --version
# v22.17.0
npm --version
# 10.9.2
# Only if the installed npm version differs:
npm install --global npm@10.9.2
```

## Rebuild in a clean directory

Extract this source ZIP into a new empty directory. Open PowerShell in the
directory containing this README and package.json. Run:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run verify
Get-FileHash -Algorithm SHA256 .\dist\phase11-f3-structure-diagnostic-v2-0.0.2-unsigned.zip
```

`npm ci` downloads only pinned public npm dependencies. No account, credential,
environment variable, browser, source-site access or previous repository output
is needed. On Windows x64, esbuild's pinned optional platform package supplies
its binary without install scripts. Build and verification are local.

The result is `dist/phase11-f3-structure-diagnostic-v2-0.0.2-unsigned.zip`.
It contains exactly `content.js` and `manifest.json` at archive root, matching
`dist/candidate/`. The build input inventory is `dist/candidate-inputs.json` and
is not included in the add-on. `npm run verify` compares the unsigned ZIP with
`expected-unsigned-sha256.txt` and checks the packaged original source hashes.

`zip.mjs` is a deterministic ZIP32 writer: paths are sorted, entries are stored
without compression, DOS timestamps are fixed to 1980-01-01, and metadata is
fixed. File creation order and modification times do not affect archive bytes.

## Original source and dependencies

- Entry and UI: `prototypes/phase11-f3-structure-v2-extension/content.mjs`,
  `ui.mjs`, and `manifest.json`.
- v2 diagnostic: `src/prototype/phase11-f3-structure-v2.mjs`.
- Shared original v1 selectors/digest helper:
  `src/prototype/phase11-f3-structure-diagnostic.mjs` (the unused v1 diagnostic
  execution path is removed by bundling; v2 never invokes it).
- Original build/verify/ZIP scripts: `build.mjs`, `verify.mjs`, `zip.mjs`.
- `package.json`/lockfile pin Cheerio 1.0.0-rc.12, esbuild 0.28.2 and transitive
  packages. Their original published source is installed by npm ci. The pinned
  dependency graph and generic ZIP algorithm are preserved from the audited
  repository tools; no old reviewer ZIP, staging or generated bundle is an input.
- `source-files.json` records hashes for the readable files above.

There is no node_modules, generated JavaScript, fixture/test instrumentation,
Git history, game dataset, HTML capture, cookie/token or other secret in this
source ZIP. The build rejects foreign candidate files or unexpected own-source
dependencies instead of silently packaging them.

## Execution boundaries

The ordinary permissions array is empty. The host/content script matches only
the exact stage 17050015 URL. Entry and owner invocation enforce its exact URL
and top-level context. Only a trusted owner click reads outerHTML once, checks
the URL again, and parses that immutable string with an inert parser.

Only bounded diagnostic observations stay in page memory/UI; raw HTML is not
saved or transferred by runtime messages. No network, navigation, reload, retry,
storage, classification, canonical conversion or calculation is performed.
Ambiguous candidates remain unresolved. Copy is a separate trusted gesture,
using no extra manifest permission. Build/verify do not upload, sign, install,
or visit the game-data site.
