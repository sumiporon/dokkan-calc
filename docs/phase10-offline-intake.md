# Phase 10 offline intake / 公開前review

## 境界

新source採用なし。productionのUI・計算・保存・配信・敵dataを変更しない。追加物は開発branchのoffline code/test/reportだけ。通常のowner操作は正式Pagesのままであり、以下のcommandは開発者/CI向けであって日常更新手順ではない。

## 実装したもの

- `src/data-foundation/phase10-review.ts`: Phase 6の型とpermission判定を再利用する、純粋なsource preflight・record差分・意味検査。
- `scripts/review-phase10-candidate.mjs`: 既存JSON Schema/Ajv、SHA-256、projection、Phase 6 safetyを組み合わせるread-only reviewer。network client、publisher、production書込処理を持たない。
- `artifacts/phase10/permission-ledger.json`: Phase 6 schemaの操作単位ledger。全live candidateの接続を拒否。DokkanStatsのpendingと既存offline cache検証だけを保持する。
- 旧`workflow_dispatch`はschedule停止だけではscrape→inject→pushを実行できる状態だった。このbranchの旧jobを明示的に無効化し、write権限をreadへ落とした。legacy codeは削除せず残す。**main上のworkflowは変更していない。**

### 検査の流れ

1. schema-valid ledger、sourceの一意性、操作別許可、根拠URL、許可有効期間、review時刻を検査。
2. `runReviewedOfflineAdapter`は許可前に`canHandle`/`adapt`さえ呼ばない。inputのbytes/digest、offline-only contract、canonical schema、snapshot/source identity、追加source許可を確認。
3. canonical/runtimeおよび全source snapshotの元入力の実bytesをreceiptと照合し、schemaを検証。sourceの申告digestだけでは合格にしない。canonical→runtimeを再計算して内容を完全比較。
4. dangling source/evidence、knownなのに根拠なし、負値/数値型不正/100%超/HP境界逆転、効果value/cap・会心boolean型・会心overrideの内部構造を検査。現行consumerが読む必殺/対象別AOEの固定ATKを必須にし、倍率のみのentryを0に化けさせず拒否する。
5. 現在productionのfull runtimeとrecord ID/親IDを対応付け、event/stage/encounter/enemy/必殺/AOEの追加・変更・削除を報告。
6. 通常/必殺/必殺後/AOE数を別集計。同数の別ID置換、単一必殺/AOE消失、条件/effect消失、属性/超極中立変更、known→unknown、時刻後退、大量消失を拒否。
7. 既存recordの正当かもしれない数値変更も初回onboardingではreview-required。安全な追加だけは差分検査上passedにできるが、**公開許可ではない**。

このreviewerは常に`productionApplyAllowed: false`。schema/digest成功をsource採用、データ権利、game ruleの正しさ、latency合格と混同しない。receiptの自己申告だけでsourceの法的正当性を保証する仕組みでもない。

## current productionとのdiff

`npm run review:phase10 -- --baseline`

reviewer本体は既存の公開形式ファイルを読むだけで、敵dataの再生成・修正・通信をしない。npm commandの前処理はTypeScriptを`generated/phase6/runtime/`へbuildするが、source/canonical/runtime JSONや公開appは変更しない。source digest、manifest/schema、full runtime、event index、全56chunk、countsを検証して自己比較する。

- 56 events / 647 stages / 647 encounters / 4,245 enemies
- normal 4,245 / Super 4,245 / post-Super 409 / AOE 0 = 8,899 attack definitions
- 全recordのadded 0 / changed 0 / removed 0
- source digest: `sha256:f1cb27a2e5cae9627be61934aaabec79e4af0b42d3e21ad0cc7945eb6d7a0b40`
- full digest: `sha256:076efb18675b1b9e8b9dd9a1013b50cf6f78d1189390e44f1d3e84952b280545`

**新source candidateとの比較はN/A**。許可済み新sourceがなく取得していないため、上記0件を「新sourceも既存と一致した」と報告しない。

将来、許可されたoffline candidateを確認する開発者用入口:

```text
npm run review:phase10 -- --candidate <canonical.json> <runtime.json> <receipt.json>
```

receiptは`canonical: {digest, bytes}`、`runtime: {digest, bytes}`、`counts`、`sources`を持つ。countsは`runtimeReviewCounts()`と同じ全9項目。`sources`は全snapshotについて`{sourceSnapshotId, path, digest, bytes}`を1件ずつ持つ。pathはreceiptのfolder内にあるUTF-8元入力への相対pathとし、外部URL・absolute path・folder外への移動は拒否する。source inputの欠損・重複・digest不一致はhard failとなる。入力は開発/CIの内部保管だけであり、公開許可なしにraw dataを公開しない。

CLIはrepoのPhase 10 ledgerを使い、任意の許可台帳へのすり替えoptionは設けていない。結果はstdoutだけ、終了codeはhard fail=1、要review=2。baseline監査のみ成功=0。

許可待ちの実source payloadを作るcommandではない。候補ファイルを追跡・公開しないため`generated/phase10/`をignoreした。将来CIが接続する場合も、取得元credentialはCI secretで保持し、browser/PAT/localStorageへ置かない。

## まだ実装しないもの / 接続前に残る確認

- live collectorと実source専用adapter: 全採用条件を満たすsourceがないため作らない。
- cross-sourceの自動ID推測: Phase 9のsemantic legacy IDsと新source IDsを名前だけで同一視しない。IDが総入替なら大量消失として止まる。正式なsource ID対応と明示reviewが必要。
- runtimeからcanonicalへの逆変換: HP/DEF/AI等の欠落をunknownで埋めてknown-goodを偽造しない。canonical比較baselineなしを引き続きreviewとして残す。
- unknown fieldを0/neutral/通常へ埋める処理、first/additional AOEの推測。
- sourceのrate limit、version、履歴保持、全event列挙、required coverage、revision回帰の実source検証。
- 第三者datasetやfixtureをPhase 9 manifestの`legacy-production-baseline`と偽って公開する処理。
- production one-click clientの動作変更、startup auto-update、main merge、Pages再deployment。

既存manifestの新source対応は別source/publication review後の仕事。今回のgateをmainへ反映したい場合も別途承認する。source停止時は既存known-goodのまま計算を続け、別の無許可siteへ自動fallbackしない。

## tests

`npm run test:phase10`を通常`npm test`へ追加。2026-08-31 JSTに全体の`npm test`が終了code 0、**222件成功 / failed 0 / skipped 0 / cancelled 0**。従来189件と追加33件の合計。

| 検証 | 件数 / 成功 |
| --- | ---: |
| unit | 65 / 65 |
| data | 26 / 26 |
| Phase 4 | 12 / 12 |
| Phase 6 | 14 / 14 |
| Phase 7 data / browser | 13 / 13、5 / 5 |
| Phase 8 data / browser | 5 / 5、24 / 24 |
| Phase 9 data / browser | 5 / 5、8 / 8 |
| Phase 10 | 33 / 33 |
| legacy browser | 12 / 12 |

最初のsandbox実行はWindowsがWebKitを起動拒否（`spawn EPERM`）した。承認された環境で**全`npm test`を再実行**し、上記すべてを実行・成功した。test削除やskipで回避していない。構文・TypeScript検査も成功。

actual production全件一致、ledger拒否/expiry/重複、許可前adapter未実行、input改変、secondary source混入、schema/digest/projection/counts、全階層ID衝突、同数差替、大量消失、親ID移動、通常/必殺/AOE欠損、対象別値、属性、HP条件、effect、負値/不正型、provenance、fixture非昇格、legacy workflow停止を確認する。

AOE実計算は既存Phase 8のfirst/additional browser回帰も維持する。自動testの架空データはsourceの実AOE検証ではない。Chromium / WebKitの360px・390px、PC計算、自動保存、更新gate、rollbackの既存回帰も成功した。独立reviewでは追加28異常入力もクラッシュせず拒否したが、このad-hoc確認は222件に含めない。

## Git / 公開側の最終確認

- 作業branch: `codex/phase10-source-research-20260831`。Phase 9 `a1b81b817f95652199e1b11a304bb884a10b57ff`からのbranch限定変更。
- remote mainは引き続き同じPhase 9 commit。正式Pages HTTP 200、公開manifestのdataset/digest/countsは上記baselineと一致。
- [Pagesの直近成功run](https://github.com/sumiporon/dokkan-calc/actions/runs/33317526613)はPhase 9のまま。Phase 10のmain merge、push、deployment、scraper実行は行っていない。
- production source、data/releases、manifest、index、UI/計算/保存code、OneDrive本番版は未変更。既存testの再生成でも追跡差分なし。
- Phase 10のcode、操作別permission ledger、tests、docsとbranch内legacy workflow停止だけが変更対象。
- mainへの安全検査反映や新source接続は未承認のまま。Phase 11へ進まずowner確認待ちで停止。

## rollback

productionは未変更なのでdeployment rollbackは不要。基準tag `phase9-production-ready-2026-08-30`を維持。Phase 10の小さなcommitを取り消す際は通常revertで対応できる。既存cache、legacy scraper、OneDrive原本、旧PAT code/dataは削除しない。
