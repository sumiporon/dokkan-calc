# Phase 11 F3 preflight — AMO reviewer source

This is the readable source package for the unsigned self-distributed Firefox add-on `phase11-f3-preflight-unsigned.zip`. It is not the add-on archive itself. The submitted JavaScript is generated with esbuild; this package contains the original `.mjs` sources, schemas, manifest, HTML, CSS, build scripts, and pinned dependency lockfile needed to reproduce it.

## Build environment

The submitted archive was built on Windows x64 with:

- Node.js **22.17.0**
- npm **10.9.2**

Install Node.js 22.17.0 from the official Node.js release archive or with a version manager. Then install npm 10.9.2 if necessary:

```text
node --version
# v22.17.0
npm --version
# 10.9.2
```

No browser, credential, environment variable, source-site access, or external service is required. Internet access is needed only for `npm ci`, which downloads the pinned open-source dependencies from the npm registry.

## Clean Windows build

Open PowerShell in the directory containing this README and run:

```text
npm ci --ignore-scripts
npm run build
npm run verify
```

The build:

1. Generates readable-schema validators locally from the two files in `schemas/`.
2. Bundles the human-readable F3 extension source with esbuild 0.28.2.
3. Copies the Firefox manifest, review HTML, and review CSS.
4. Writes the unpacked add-on to `dist/preflight/`.
5. Writes `dist/phase11-f3-preflight-unsigned.zip`.
6. Fails unless that ZIP has SHA-256 `AD129F5AD2216C9EEEE35A71C0AF5C3D5CA2D3B21A9FCC6B66BF500CD75A43E8`.

The ZIP contains exactly `background.js`, `content.js`, `manifest.json`, `review.css`, `review.html`, and `review.js`.

## Included source and exclusions

- Original extension sources: `prototypes/phase11-f3-prep-extension/`
- Self-authored DokkanInfo-shaped fixture helper: `tests/fixtures/phase11/dokkaninfo-source.mjs` (no live-site or game data)
- Shared local parser, typed review, validation, and storage sources: `src/prototype/`
- Required source-only data foundation and migration modules: `src/data-foundation/`, `src/data-migration/`
- Validator schemas: `schemas/`
- Build/verification/ZIP scripts: `build.mjs`, `verify.mjs`, `zip.mjs`
- Pinned dependencies: `package-lock.json`

No `node_modules`, generated bundle, signed or unsigned add-on archive, Git history, production dataset, PAT, cookie, token, browser storage, source HTML, or real DokkanInfo content is included.

The build runs entirely locally after dependency installation. The add-on has no source-site fetch/XHR/API mechanism; it is prepared only for a separate, owner-authorized future one-stage local-DOM gate.
