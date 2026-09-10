# Phase 11 limited live review — Mozilla reviewer sources

Build environment: Windows x64 NT build 26200, Node.js **22.17.0**, npm **10.9.2**. Linux/ARM64 has not been tested. Install the matching Node version from https://nodejs.org/download/release/v22.17.0/ (official installers and Linux ARM64/x64 archives). If needed, run `npm install --global npm@10.9.2`.

Unzip this source archive, open a terminal in its root, and run:

```text
node --version
npm --version
npm ci --ignore-scripts
npm run build
```

The local build generates Ajv validators from the original schemas, bundles the original MJS/TypeScript sources with esbuild, copies the immutable non-executable baseline JSON, verifies all seven output file hashes, and writes `dist/phase11-live-gate-amo-upload.zip`. The unpacked files reside in `dist/fixture` (the shared build's directory name). ZIP metadata may differ; extracted bytes must match. `npm run verify` repeats the hashes check.

Dependencies are pinned with registry URLs and integrity hashes in package-lock.json: esbuild 0.28.2, Ajv 8.20.0, ajv-formats 3.0.1, Cheerio 1.0.0-rc.12, htmlparser2 8.0.2. All are MIT-licensed npm packages, installed only via the official npm registry. Only dependency installation requires internet. No source-site access, credentials, compiler, browser, or external service is needed to build. Human-readable entry points are `live-gate-*.mjs`; shared parser/validation/session sources are in `src/`; generated validators and bundled code are not substituted for original sources. `baseline-runtime.json` is a local data input, not executable code. Source-site HTML, user data, node_modules, caches, Git history, and signing keys are excluded.

This separate add-on supports one owner-initiated compatibility test of event 1705, using only its first three displayed stage links. All stage navigation requires an explicit user click after validated persistent draft save/read-back. No background acquisition, preloading, crawling, retry, or restriction bypass is implemented. Parsed data stays in this add-on's local browser storage; raw HTML is transient. Review has no apply, export, or production connection. The fixture add-on has a separate ID and remains independent.

For manual testing after installation, open https://jpnja.dokkaninfo.com/events/challenge/1705 normally, press `開始`, wait for each draft save, press `次のステージへ` once for each transition, and press `計算画面で確認` on the third stage. If DOM/identity/required-value/meaning validation fails, the tool stops without navigation. This build is specifically for owner-approved limited personal testing under acknowledged Terms uncertainty; source permission has not been established. AMO signing is not a statement about source terms. No automatic live-site test is provided. Stop requests or access restrictions must be respected.
