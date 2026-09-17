# Structure diagnostic v2 0.0.2 signing preflight

確認日: 2026-09-17。対象checkpoint: `46d1ec2c8d11a5d079bd8f99ddbe5b4999e86bb1`。
branch: `codex/phase11-android-firefox-one-tap-prototype-20260910`。開始時clean。

## 結論と範囲

v2専用unsigned ZIPは、reviewer sourceをrepo外のclean環境へ展開してREADMEだけで再buildしたZIPとbyte-for-byte一致した。Mozilla web-ext lintはerrors / warnings / noticesすべて0。今回のpackage変更によるregressionは検出していない。ただし既知の固定preview不一致1件は残るため、全回帰が緑とは報告しない。

技術的には0.0.2をAMOへ提出する候補として準備済み。AMOサーバーでの審査・署名成功やAndroid/live DOM適合の保証ではない。upload、署名、インストール、実DokkanInfoアクセス、ownerへの再診断依頼、commit/pushは行っていない。

今回追加するのはreviewer用source template 6ファイル、package生成script、package unit test、本記録の計9ファイルのみ。承認済みv2 runtime/UI/manifest、既存builder、v1、production、既存live-gate、旧F3 preflight、full receiver、canonical、calculation-core、production dataは変更しない。ownerレビューはUI・操作・コピー等の承認済み範囲のままで、全observationの技術監査とは扱わない。

## 再現可能な成果物

repo rootから実行:

```powershell
node scripts/build-phase11-f3-structure-v2-packages.mjs
```

出力先: `generated/phase11-f3-structure-extension/v2/signing/`（既存.gitignoreで除外）。

| 成果物 | SHA-256 |
| --- | --- |
| `phase11-f3-structure-diagnostic-v2-0.0.2-unsigned.zip` | `D8EA4D7844D91F613FE4ACB416CB1331EFD9BE6FD78AF80468377189544056AF` |
| `phase11-f3-structure-diagnostic-v2-0.0.2-reviewer-source.zip` | `E602B36F092F80F556CD312076E85EA6BC9123D4E4BAFEB01461CF0B49F05BB7` |
| clean rebuild unsigned ZIP | `D8EA4D7844D91F613FE4ACB416CB1331EFD9BE6FD78AF80468377189544056AF` |

unsigned ZIPは266,849 bytes、root直下の`manifest.json`と`content.js`だけ。署名前の旧0.0.1とは別名・別directory。旧unsigned SHA `02EA5077A9A2684F8C0B35D30CACDAA24717DF6710079F5F131DCA0C27D1CCFB`、旧source SHA `151FC50A7E62F16FF4B4535216FF6A2AD587F079ABE4123FA3F804ED850D1FC8`も再照合し、不変だった。

reviewer sourceには元のcontent/UI/v2 engine/v1 selector・digest helperの4モジュール、manifest、英語Windows README、build/verify/ZIP script、package.json/lockfile、元source hash inventory、expected unsigned hashだけをallowlistで収録する。node_modules、生成bundle、fixture、HTML capture、game dataset、Git履歴、認証情報を含めない。generic ZIP実装と固定dependency graphはrepo内の監査済み元sourceを再利用したもので、旧reviewer ZIPやgenerated stagingを入力にしていない。

ZIPはpath順・stored entries・固定1980-01-01 timestamp・固定metadata。source stagingは毎回新規作成し、古いファイル混入を防ぐ。candidateに未知のファイルがあれば、削除せず停止する。

## clean rebuild実測

別の新規空directoryへsource ZIPを展開:
`C:\Users\kou20\AppData\Local\Temp\phase11-v2-reviewer-78684c339cb64cd0b008dd1668a499c7`

Windows x64、Node.js 22.17.0 / npm 10.9.2。英語README記載の以下を順番に実行した:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run verify
Get-FileHash -Algorithm SHA256 .\dist\phase11-f3-structure-diagnostic-v2-0.0.2-unsigned.zip
```

全command成功。固定依存17packagesを新規install。verifyはunsigned hashと収録元sourceのhashを照合する。さらに提出候補とclean ZIPをNode Buffer.equalsで直接比較し、266,849 bytes全体の一致を確認した。npm依存/validatorの取得以外に外部データサイトへのアクセスはない。

## manifest・source・bundle監査

- extension IDは0.0.1と同じ`phase11-f3-structure-diagnostic@sumiporon.invalid`。version `0.0.2`、name `Phase 11 structure diagnostic`（29文字）。checkpointのdescriptionも既にv2向けであり、manifest差分は文字通りversionだけではない。今回manifestを編集していない。
- permissions `[]`。host/content scriptは`https://jpnja.dokkaninfo.com/events/challenge/1705/17050015`のみ、wildcardなし、all_frames false。background/service workerなし。
- entryでtop-levelと完全URL一致を確認。trusted click以外は起動しない。runner生成時はcaptureせず、tap後URL確認→outerHTML 1回→URL再確認→immutable文字列のdigest/解析のみ。再実行・自動retryなし。
- esbuild入力allowlistとpackage内ファイル検証、承認済みfixture builderのcandidateとのbyte同値testでruntimeの非干渉を確認。生成bundle内の`document.documentElement.outerHTML`は1箇所。
- sourceとbundleにfetch/XHR/WebSocket/sendBeacon、navigation/reload/preload/prerender、storage/cookies/downloads/webRequest、runtime message/postMessage転送の実行経路なし。inert parserはexternal resourceを取得しない。
- snapshotは解析中のみ。終了時にsnapshot/parser参照を解放し、raw HTMLを永続保存・UI出力・message転送しない。bounded diagnosticだけmemory/UIへ保持する。copyは別のtrusted clickによるexecCommandで、追加permissionなし。
- bundle入力にfull/partial classifier、partial validator、canonical、calculation-coreを含まない。診断に限り、missing/blank/文字列0を補完しない。`!byClass || icons.length !== 1`を維持し、ambiguous配下も構造観測のみで確定fieldへ昇格しない。enemy-wide countとSuper-specific countは別観測。
- これらはソース監査・静的bundle照合・fixture試験の結果。実サイトの全挙動や権利上の許可を保証しない。

## package内limits

承認済みengineとpackage bundleの同値、および上限到達unitで以下を確認:

| 対象 | 上限 |
| --- | --- |
| snapshot | 4,000,000 UTF-16 code units |
| inert DOM elements | 30,000 |
| detailed nodes | 1,000 |
| observations / issues | 各700 |
| candidates/search | 40 |
| text | 160 code units |
| classes | 160 code units / 8 tokens |
| path | 1,000 code units |
| direct-child summaries | 64/node |
| local element depth | 2 |
| skill rows | 32/enemy |
| icons | 8/Super candidate |
| serialized result | 250,000 UTF-8 bytes |

局所上限はissueとincomplete scopeを記録。global上限は部分graphを返さずnot-observed/unresolvedへ停止する。ページ全体coverageは常にunconfirmed。上限超過をcompleteや確定値へ変換しない。

## Mozilla validation

```powershell
npx --yes --package=web-ext@10.6.0 web-ext lint --source-dir generated/phase11-f3-structure-extension/v2/signing/candidate --output json
```

exit 0、`errors: 0, warnings: 0, notices: 0`。検査metadataでもID・name・version 0.0.2を確認。AMOへのupload/signはしていない。

## 自動試験

```powershell
npm run test:unit
node --test --test-concurrency=1 --test-reporter=spec tests/browser/phase11-f3-structure-v2.test.mjs tests/browser/phase11-f3-structure.test.mjs tests/browser/phase11-f3-structure-extension.test.mjs tests/browser/phase11-f3-prep.test.mjs tests/browser/phase11-f2-fixture-bridge.test.mjs tests/browser/phase11-typed-one-tap.test.mjs tests/browser/phase11-one-tap.test.mjs
node --test --test-reporter=spec tests/data/phase11-manual-intake.test.mjs tests/data/phase11-dokkaninfo-manual.test.mjs tests/data/phase11-one-tap.test.mjs
git diff --check
```

- unit全体: 219/219成功。v2 unit 32件、今回package unit 6件、v1および関連Phase 11 unitを含む。
- 上記browser: 14/14成功。v2 3件、v1、F3-prep、F2、typed inspection/restart、one-tap回帰を含む。localhost/自作fixtureのみ。Android実機試験ではない。
- 上記Phase 11 data: 41件中40成功、既知pre-existing failure 1件。
- 失敗は`phase11-dokkaninfo-manual.test.mjs`の固定/生成preview一致assertion。固定SHA `4DDD6DAA8DF9BFED45C2571941EC5AAF77DB9C58EBBCFD39E6DA1956C305B40B`、生成SHA `AAD756206C5D77F97A5388E9E634315E3943D24AA44505BE47AC2D5662DDEA57`を再実測し、`phase11-single-hit-prototype.md`の過去clean HEAD再現記録と一致。今回どちらも更新していない。新規regressionとしては扱わない。
- `git diff --check`および未追跡新規ファイルのno-index whitespace checkを実施。生成ZIP/stagingはcommit対象ではない。
- repository-wide `npm test`は今回実行しない。production生成や固定preview再生成まで含むため、承認scopeに合わせ上記を個別実行した。全repository test成功とは報告しない。

既存ignore出力を必要とする回帰は現在の検証済み生成物を利用する。新しい署名packageを作るには上記package scriptを先に実行する。v2 browser試験は既存`build-phase11-f3-structure-v2-extension.mjs`のfixture-only出力を用い、package unitがcandidate bytesとの同値を再確認する。

## 次工程との境界

残る既知preview不一致は本packageの未解決不良ではなく独立課題。AMO審査/署名、Android導入、live診断は別工程でowner判断が必要。今回のpreflightだけで正式source採用・利用条件の許可・F3分類再開・production接続を承認しない。
