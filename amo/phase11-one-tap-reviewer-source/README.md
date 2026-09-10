# AMO reviewer source for `phase11-fixture-amo-upload-v2.zip`

This source package rebuilds the exact seven files contained in the submitted self-distributed Firefox add-on. The extension JavaScript in the submitted archive is generated with esbuild, so the human-readable pre-bundle source and the complete local build are provided here.

## Build environment

The submitted archive was built and verified on Windows x64 (NT 10.0 build 26200) with:

- Node.js **22.17.0**
- npm **10.9.2**

The build uses only cross-platform Node.js APIs and also supports Mozilla's Ubuntu 24.04 ARM64 reviewer environment. For an exact tool match, install Node.js 22.17.0 from the [official Node.js release archive](https://nodejs.org/download/release/v22.17.0/) or with a Node version manager, then install the required npm version with `npm install --global npm@10.9.2`. Confirm the versions before building:

```text
node --version
# v22.17.0
npm --version
# 10.9.2
```

No compiler, browser, environment variable, credential, or external service is required. Internet access is needed only for `npm ci`, which downloads pinned open-source dependencies from the official npm registry.

## Clean build

From the directory containing this README, run:

```text
npm ci --ignore-scripts
npm run build
```

The build performs all required steps:

1. Generates the JSON-schema validators from the two readable schemas in `schemas/`.
2. Bundles the readable extension sources in `prototypes/` and `src/` with esbuild 0.28.2.
3. Copies the manifest, HTML, CSS, and required local baseline data.
4. Writes the unpacked add-on to `dist/fixture/`.
5. Verifies every generated file's byte size and SHA-256 against the submitted add-on.
6. Writes `dist/phase11-fixture-amo-upload-v2.zip`.

`npm run build` fails if any unpacked output differs from the submitted add-on. The ZIP container's compression metadata can differ from the uploaded ZIP, but the seven extracted files are byte-for-byte identical. To repeat only the file verification, run `npm run verify`.

## Source and generated files

- Human-readable extension entry points: `prototypes/phase11-one-tap-extension/*.mjs`
- Human-readable shared application modules: `src/`
- Validator source: `schemas/*.schema.json`
- Build scripts: `build.mjs`, `verify.mjs`, and `zip.mjs`
- Pinned dependency graph: `package-lock.json`
- Required non-executable data: `source-data/baseline-runtime.json`
- Generated only during the build: `generated/`, `dist/`, bundled JavaScript, and the rebuilt ZIP

`source-data/baseline-runtime.json` is the add-on's local read-only baseline dataset, not executable code and not a substitute for source logic. It must be copied unchanged for a byte-identical build. No source map, test fixture, cache, Git history, or `node_modules` directory is included.

## Build dependencies

All dependencies are pinned in `package-lock.json` and downloaded through npm:

- [esbuild 0.28.2](https://www.npmjs.com/package/esbuild/v/0.28.2) (MIT) — bundling/minification
- [Ajv 8.20.0](https://www.npmjs.com/package/ajv/v/8.20.0) and [ajv-formats 3.0.1](https://www.npmjs.com/package/ajv-formats/v/3.0.1) (MIT) — local validator generation
- [Cheerio 1.0.0-rc.12](https://www.npmjs.com/package/cheerio/v/1.0.0-rc.12) and [htmlparser2 8.0.2](https://www.npmjs.com/package/htmlparser2/v/8.0.2) (MIT) — parsing already displayed pages locally

The build is entirely local after dependency installation. It does not contact DokkanInfo or any other data source, and the extension's acquisition and communication constraints are unchanged.
