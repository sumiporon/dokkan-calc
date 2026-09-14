# Dedicated structure diagnostic — Mozilla reviewer source

This readable source reproduces `phase11-f3-structure-diagnostic-unsigned.zip`.
It is the separate structure diagnostic add-on, version 0.0.1, ID
`phase11-f3-structure-diagnostic@sumiporon.invalid`. It is not the earlier F3
preflight add-on. No live game data, browser storage, credentials, generated
JavaScript, node_modules, fixture test instrumentation, or Git history is included.

## Required Windows environment

Use Windows x64, Node.js **22.17.0**, and npm **10.9.2**. Install the Windows x64
MSI from the official Node.js 22.17.0 release directory:
https://nodejs.org/download/release/v22.17.0/

Open a new PowerShell window. Check the tools; if the npm version differs,
install the required version using the command below, then check again:

```powershell
node --version
# v22.17.0
npm --version
# 10.9.2
# Only if npm differs:
npm install --global npm@10.9.2
```

## Reproduce from this archive

1. Extract this source ZIP into a new, empty local directory.
2. Open PowerShell in that directory (the directory containing this README and package.json).
3. Run these commands exactly:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run verify
Get-FileHash -Algorithm SHA256 .\dist\phase11-f3-structure-diagnostic-unsigned.zip
```

`npm ci` requires access only to the npm registry for the pinned open-source
dependencies. esbuild's platform binary is provided by its pinned optional
package; install scripts are not required on Windows x64. Build and verify are
local operations and require no browser, account, secret, source-site access,
environment variable, signing service or previously generated repository files.

The build bundles the original three .mjs modules with esbuild 0.28.2, writes
`dist/candidate/manifest.json` and `dist/candidate/content.js`, then creates
`dist/phase11-f3-structure-diagnostic-unsigned.zip`. The archive contains exactly
those two files at its root. `dist/candidate-inputs.json` records bundle inputs
but is not included in the add-on. Verification requires the archive SHA-256
to match `expected-unsigned-sha256.txt`, which records the submission candidate.

The ZIP writer sorts paths and uses uncompressed entries, a fixed 1980-01-01
timestamp, and fixed metadata. Source mtimes and zlib versions cannot change
the archive. Source and dependency versions remain relevant to bundle bytes.

## Scope and dependency provenance

Original extension entry/UI: `prototypes/phase11-f3-structure-extension/`.
Original inert DOM diagnostic: `src/prototype/phase11-f3-structure-diagnostic.mjs`.
`build.mjs`, `zip.mjs`, and `verify.mjs` are original build/verification scripts.
`package.json` and `package-lock.json` pin esbuild, Cheerio and their dependencies;
their original published code is installed by npm ci, not supplied as a bundled
substitute for readable source. `source-files.json` records the packaged source
file hashes. No earlier F3 reviewer package is an input to this build.

The add-on has no ordinary permissions, background script, storage, messaging,
navigation or source fetch. Its exact stage match is reinforced by runtime URL
checks. A trusted owner click captures outerHTML once; only bounded diagnostic
text remains in page memory. It does not classify, import or calculate game data.
The copy button uses a trusted user-gesture copy call, without extra permissions.
This source package does not authorize deployment, signing, installation, or a
live-site test.
