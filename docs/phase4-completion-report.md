# 第4段階 完了報告

作成日: 2026-08-23

対象ブランチ: `phase4-candidate-data-update-design-20260822`

状態: 第4段階完了。本番移行・公開切替・第5段階は未開始。

## 先に結論

第4段階では、計算表示の1.00～1.03乱数対応を既存UIへ追加し、保存済みHTMLから新形式の敵candidateを決定論的に生成する試作、現行形式との詳細比較、TypeScriptによる変換境界、情報損失を止めるproduction gate、将来の更新・公開方式の比較までを完了した。

candidateと現行形式は自動的に本番置換できる状態ではない。新形式が保持する安定ID、取得元ID、evidence、敵DEF、複数必殺、usage rule、AI sequence、AOE詳細などを現行形式では表現できないため、production gateは安全側に`false`である。

現行の本番敵データ、localStorage、GitHub Pages、OneDriveでHTMLを直接開く使い方、workflowは変更していない。外部取得と定期更新も停止したままである。

## 復旧点

中断時点の実内容差分25ファイルだけを次の復旧点へ保存した。

- checkpoint commit: `55b9d5311cc207558bb28d5f2a74d869a8969b75`
- annotated tag: `phase4-wip-checkpoint-2026-08-23`
- 対象: 追跡済み14ファイルと第4段階に必要な未追跡11ファイル
- 除外: HTMLキャッシュ、`safety-backups`、`.env`、秘密情報、ignored生成物、旧21MB中間生成物

Git上の1,019件のstat-only表示は内容差分として扱っていない。checkpoint前の検査では対象25ファイルに秘密鍵、GitHub token形式、AWS key形式、代入された一般的なsecret形式を検出しなかった。

## 計算UIで完了したこと

- 被ダメージを1.00～1.03の範囲で表示する。
- 完封時は計算値を`0`、判定を`完封`として表示する。
- 耐久・完封に必要なDEFは安全側の1.03で判定する。
- 下限・上限の表示丸めと安全側閾値の丸めを共通計算coreへ集約した。
- 手動敵、登録敵、動的条件敵、一覧previewで同じ計算規則を使う。
- PC幅、390px幅、HTTP配信、`file://`直開きのブラウザ回帰テストを追加した。

## Node / TypeScriptの正式な実行方法

Node 22の`--experimental-strip-types`には依存しない。追加のTypeScript実行ツールも導入しなかった。

採用した経路は次のとおり。

1. `tsc -p tsconfig.phase4.build.json`でPhase 4のTypeScriptを通常のCommonJSへコンパイルする。
2. 出力をignoredの`generated/phase4/runtime/`へ置く。
3. generatorとPhase 4テストは生成されたJavaScriptを通常のNodeで読む。
4. `tsc -p tsconfig.phase4.json`の`noEmit`検査も別に実行する。

この方式は既存のTypeScript依存だけを使い、WindowsとCIで同じコマンドになり、`package.json`のNode 20以降という条件を維持する。Viteは必要ない。

`npm test`は次を順番に実行する。

- JavaScript構文検査
- TypeScript型検査
- unit tests
- data / schema / localStorage tests
- Phase 4 migration / schema / compatibility / 成果物同期 tests
- browser tests

## candidateの生成元と範囲

唯一の生成元は`scripts/generate-phase4-enemy-candidate.mjs`である。正式コマンドは`npm run generate:phase4`。

- 外部通信: 0件
- 入力: `scraper/html_cache/index.json`と保存済みstage HTML 801件
- 保存キャッシュ日時: `2026-02-23T08:11:11.385Z`
- dataset ID: `phase4-cache-c8c6a2468861`
- 用途: 非本番candidate、比較、schema試作
- 現在の最新ステージ取得問題: 未解決

候補件数は次のとおり。

| 項目 | 件数 |
| --- | ---: |
| event | 88 |
| stage | 801 |
| encounter | 1,352 |
| enemy | 5,032 |
| combat enemy | 4,673 |
| super attack | 4,924 |
| super usage rule | 168 |
| AI action | 1,679 |
| AI sequence | 115 |
| AOE record | 75 |
| AOE encounter | 65 |
| neutral enemy | 443 |
| 表示必殺値のないcombat enemy | 95 |

JSON Schema検査とsemantic検査はcandidate、代表fixtureとも成功し、semantic errorは0件だった。代表fixtureは20 encounter・40 enemyで、Janembaの2つのHP usage band、中立、AOE、複数必殺、複数AI sequence、ターン条件、全属性などをgeneratorから固定している。手でテスト向けデータへ書き換えていない。

## 現行敵データとの比較

現行`scraper/all_enemies.json`は56 event type、647 stage、4,245 bossである。

候補stage分類は次のとおり。

| 分類 | 件数 | 意味 |
| --- | ---: | --- |
| `existing-exact` | 620 | 現行と一意に完全一致 |
| `existing-changed` | 17 | 一意に対応するが値などが異なる |
| `ambiguous-existing` | 10 | 人間向け名称などが重複し、一意に断定できない |
| `candidate-only-unconfirmed` | 154 | 現行に対応候補がないが、新規stageとはまだ断定しない |

一意に対応した637 stageで4,063 bossを比較した。現行互換フィールドと今回追加した詳細情報を合わせると、3,571 bossが比較上同一、492 bossが詳細確認対象である。値またはpresenceに差があるbossは298件。

詳細diffは次を追跡する。

- AOEがcandidate／legacyのどちらに存在するか
- AOEの先頭対象値、追加対象値、両倍率、対象attack、target mode、source occurrence ID、evidence
- 複数必殺の全候補、skill ID、名称、表示値、倍率、条件
- 必殺ごとのusage rule
- encounterのAI action / sequence
- candidateのsource IDと`candidateEvidence`

中立→極への写像、表示必殺値なし→3倍の補完は比較専用であり、candidateへ書き戻していない。`candidate-only-unconfirmed`も新規stageという確定情報ではない。

## structured compatibility reportとproduction gate

従来の`warnings.length === 0`は廃止し、findingを`loss`、`warning`、`informational`へ分けた。`safeForProduction`は重大な`loss`が0件のときだけ`true`になる。

現在は次の情報損失を検出する。

- 複数必殺、必殺ごとのusage rule、確率、回数、再使用、slot
- AOEの追加対象値、倍率、対象attack、target mode、出典
- AI action、AI sequence、対象、確率、回数、HP・ターン条件
- 現行形式で表現できないpassive、必殺効果、会心条件
- HP、DEF、軽減率、最大攻撃回数
- 属性不明、超／極不明、中立→極写像、ATK欠損
- 安定occurrence ID、source enemy ID、card ID、thumb ID
- evidence、信頼度、field state、dataset source snapshot
- 現行形式にないskill情報
- 取得元にない必殺倍率を3倍へ補完する比較専用処理

現在の結果は次のとおり。

- `safeForProduction`: `false`
- `loss`: 37,690件
- `warning`: 0件
- `informational`: 0件

37,690は重複しない敵数ではなく、同じ敵に複数種類のlossがある場合をそれぞれ数えた「影響箇所の延べ件数」である。主なものはID 5,032、evidence 5,032、DEF 4,673、必殺条件 4,518、skill 2,873、複数必殺79、AOE 75、usage rule 60、AIを含むencounter 100である。

gateが`false`なのは修正失敗ではない。現行形式へ黙って情報を落として本番昇格することを止められた、という安全上の成功である。

## 成果物と整合性

| 成果物 | bytes | SHA-256 |
| --- | ---: | --- |
| candidate | 35,532,102 | `4f42c83fba42180c6960418a01980c4bd33d10102c30761322ade7289388e307` |
| legacy compatibility preview | 5,549,050 | `205d1b1af204199d323ae8cf1e848084769391a6a8b874bf3c058a8ff9dc47fd` |
| tracked detailed diff | 4,103,413 | `4e5bb334b0736222698664aeafa12e74673a3dc52f9722d2e12dcb8345af8ac9` |
| representative fixture | 377,238 | `306f3d45208c1f1c7f60b1e8492580d2252036dede4680cba41e5e98c3deda07` |
| comparison summary | 4,558 | `216ffeed879e60c99eee45326936f73c44a518336378eeaead70fe8da7b47da6` |

通常テストは、保存済みmanifest、代表fixture、selection、diff、summaryをgeneratorのメモリ上再生成結果とbyte単位で照合する。manifest内の全bytesとdigestも再計算する。同じ入力からの再実行でcandidate digestと全追跡成果物が一致した。

## 旧21MB中間生成物の分類

`generated/phase4/comparison/legacy-vs-candidate.diff.json`は次の旧中間物だった。

- 作成日時: 2026-08-22 03:00 JST
- bytes: 21,258,169
- SHA-256: `a0811ff7e105d7c79173a3a886fd6a0bac0db0b9c00e1b473cc6f551dc576478`
- 内容: 一意に対応した637 stage・4,063 bossを全件展開した旧詳細diff
- 不足: `aggregate`、`candidateEvidence`、structured finding、今回のAOE・複数必殺・usage rule・AI詳細
- Git状態: `/generated/phase4/`規則でignored
- manifest参照: なし。現manifestは`artifacts/phase4/legacy-vs-candidate.diff.json`を参照

現行成果物で機能上は置き換えられている。ただし中断前状態との比較・復旧資料には使えるため、第4段階では削除していない。次回の独立した整理作業で削除候補にできる。

## 更新元・配信・利用方式の調査結果

- DokkanStatsは事前の書面許可を求める問い合わせ草案まで作成した。未送信で、承認済み取得元ではない。
- 将来の更新は、許可と検証済み配信物がある場合に「確認＋適用」の最大2操作、可能なら1操作を目標とする。
- `file://`は相対JSON fetch、Service Worker、origin単位のlocalStorageに制約がある。
- 現在のOneDrive直開きは維持し、Pagesまたはhybridへの移行は実機検証と所有者承認後に判断する。
- GitHub APIへブラウザからPATを渡す方式は採用しない。
- Viteは現段階では不要。必要性が具体化した時点で再評価する。

詳細は`phase4-update-hosting-strategy.md`と`phase4-dokkanstats-inquiry-draft.md`を参照。

## 本番へ変更していないもの

- `scraper/all_enemies.json`
- 本番アプリが読む敵データ
- 新schemaを本番アプリが直接読む処理
- localStorage schemaとmigration
- GitHub Pages設定と公開版
- OneDriveでの利用方法
- workflowと定期更新
- 外部サイトからの取得処理
- アプリ内更新ボタン、candidate配信、PWA、Vite

## 最終検証

2026-08-23に次を確認した。

- `npm ci`: 成功、25 package、既知脆弱性0件
- `npm test`: 108件成功、失敗0、skip 0
  - unit 58件
  - data 26件
  - Phase 4 12件
  - browser 12件
- TypeScript型検査: 成功
- 敵データ監査: 成功、error 0、既知warning 13
- candidate／representativeのJSON Schema検査とsemantic検査: 成功、semantic error 0
- 全成果物とmanifestのbytes／digest整合: 全5成果物一致
- 全入力からのcandidate再生成決定性: 一致
- PC幅、390px幅、`file://`直開きのブラウザ回帰: 成功
- 手動敵、登録敵、動的条件敵、一覧preview: 成功
- 1.00～1.03表示、完封0、1.03安全側耐久判定: 成功
- `git diff --check`: 問題なし

検証環境のNodeは`v22.17.0`だが、実験的type strippingは使わず、Node 20以降で利用できる通常の`tsc`生成JavaScript経路だけを実行した。

## 残る既知問題

- candidateの元キャッシュは2026-02-23であり、現在の新event・新stageを継続取得できない。
- production gateは`false`で、本番昇格できない。
- 現行形式は新schemaの重要情報を保持できず、互換JSONは比較previewに限られる。
- 外部データ元の利用許可は得ていない。
- Android／iPhone実機で更新・移行を試していない。
- 新形式は本番アプリとlocalStorageへ未接続。
- 旧21MB中間生成物を安全資料として残している。

## 方針の再評価と第5段階への提案

第4段階の事実から、次を推奨する。

1. Strategy B（動作を保った段階的移行）は維持する。
2. 現行敵JSONへ新形式を無理に押し込めない。第5段階では、新形式を内部の正本候補にし、現行表示へ必要な値だけを渡す境界を設計する。ただし本番data format変更なので事前承認が必要。
3. production gateはwarning件数へ戻さず、structured lossを昇格条件として維持する。
4. TypeScriptはまず計算・データ境界に限定し、Vite導入は保留する。
5. 最新データ問題はparserの追加実装より先に、合法で継続可能な取得元・許可・再配布条件を決める。
6. Pages／OneDriveは二者択一と決めず、実機テストとrollbackを含むhybrid案も比較する。

第5段階へ進む前に所有者判断が必要なのは、データ取得元への問い合わせ送信、新形式を本番の正本へ近づける方針、Pages／OneDriveの実機比較範囲である。第4段階完了後は、所有者の確認まで本番移行を開始しない。
