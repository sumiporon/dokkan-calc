# Dokkan durability calculator

ドッカンバトルのキャラクターDEF、敵の通常攻撃・必殺技、属性相性、ガード、軽減、敵会心などから、耐久ラインと被ダメージを確認する個人用ブラウザアプリです。

プログラミングに詳しくない所有者でも安全に維持できることを優先しています。大きな変更の前には必ずテストと復旧点を用意し、公開中の`main`へ直接作業を入れない方針です。詳しい恒久ルールは[AGENTS.md](AGENTS.md)にあります。

## アプリを手元で開く

このアプリにビルド作業はありません。プロジェクトのフォルダで次を実行します。

```powershell
python -m http.server 8765
```

その後、ブラウザで次を開きます。

```text
http://127.0.0.1:8765/dokkan_calc_final.html
```

停止するときは、コマンドを実行した画面で`Ctrl+C`を押します。

## テストを実行する

初回、または`package-lock.json`が変わった後だけ依存関係を準備します。

```powershell
npm ci
npx playwright install webkit
```

全テストを実行します。

```powershell
npm test
```

種類別に実行する場合は次を使います。

```powershell
npm run typecheck
npm run test:unit
npm run test:data
npm run test:phase4
npm run test:phase6
npm run test:phase7
npm run test:phase8
npm run test:cached-source
npm run test:browser
npm run audit:data
```

`npm test`には、第4段階の候補データ変換と全件再現、第6段階のcanonical/runtime、第7段階の配信・更新prototypeに加え、第8段階のrelease candidate、前回event、1操作更新・rollback、Pages内の通常保存、Chromium/WebKit、HTTP/`file://` browser操作も含まれます。OneDrive→Pages保存データ移行は不採用となり、専用testも削除しました。TypeScriptは`tsc`で通常のJavaScriptへ事前コンパイルしてからNodeで実行するため、Node 22の実験機能は使いません。対応範囲は`package.json`どおりNode 20以降です。

ブラウザテストは独立した一時ブラウザを使います。普段使用しているブラウザの保存データやlocalStorageは読み書きしません。

保存済みHTMLだけを再解析して集計レポートを更新する場合は、次を使います。外部サイトへの通信や現行敵データの上書きは行いません。

```powershell
npm run analyze:cached-source
```

第4段階の非本番candidate一式を保存HTMLから再生成する正式コマンドは次です。外部通信は行わず、現行敵JSONも上書きしません。801ステージを再解析するため、完了まで数分かかることがあります。

```powershell
npm run generate:phase4
```

第6段階の非本番canonical/runtime/manifestを同じ保存済み候補からoffline生成する場合は次を使います。full JSONは`generated/phase6/`へ出力され、本番からは読み込まれません。

```powershell
npm run generate:phase6
```

生成済みfull JSONのsize・parse性能をlocal PCとheadless Chromiumで測る場合は次を使います。外部siteではなくloopback serverだけを使用します。

```powershell
npm run benchmark:phase6
```

第7段階の非本番配信prototypeを同じoffline runtimeから生成し、実測する場合は次を使います。公開Pagesや本番敵dataは変更しません。

```powershell
npm run generate:phase7
npm run benchmark:phase7
npm run generate:phase8
npm run benchmark:phase8
```

## 主なファイル

- `dokkan_calc_final.html` / `.css` / `.js`：現在の公開アプリ本体
- `src/calculation-core.js`：画面と自動テストが共用する純粋計算モジュール
- `scraper/all_enemies.json`：現行の敵データ
- `scraper/`：過去のデータ取得・解析コードとHTMLキャッシュ
- `chrome_extension/`：DokkanInfo取得用の既存Chrome拡張
- `tests/`：計算、敵データ、localStorage、画面操作のテスト
- `scripts/audit-enemy-data.mjs`：敵データの監査レポート
- `scripts/analyze-cached-enemy-source.mjs`：保存HTML専用の読取・比較レポート
- `scripts/generate-phase4-enemy-candidate.mjs`：第4段階の非本番candidate・fixture・diff・manifestの唯一の生成元
- `src/data-migration/phase4-enemy-migration.ts`：第4段階だけで試験導入した型付き変換・互換loss判定
- `src/data-foundation/`：第6段階のcanonical/runtime、manifest、安全・permission gate、adapter contract
- `scripts/generate-phase6-data-foundation.mjs`：第6段階のoffline全件成果物の唯一の生成元
- `artifacts/phase6/`：追跡可能なmanifest、検証、permission、性能、omission報告
- `prototypes/phase7-runtime-delivery/`：第7段階の本番分離full/chunkと1操作更新prototype
- `src/prototype/`：第7段階の更新・rollback用pure prototype
- `scripts/generate-phase7-runtime-delivery.mjs`：full、event index/chunk、file-compatible dataの決定的generator
- `artifacts/phase7/`：第7段階のcompact全件summaryと複数回performance実測
- `release-candidate/phase8/`：第8段階の本番分離Pages候補、架空公開preview、単一HTML fallback
- `src/release-candidate/`：第8段階のmanifest、chunk client、IndexedDB known-good、前回event
- `artifacts/phase8/`：第8段階の性能とpermission状態
- `schemas/`：将来形式の設計案（現行アプリはまだ読み込まない）
- `docs/`：安全記録、データ形式、計算上の既知差、更新・公開方針

## 第4段階candidateの位置づけ

- candidateは`2026-02-23T08:11:11.385Z`に保存されたDokkanInfo HTMLキャッシュの再解析結果で、現在の最新ステージを取得する仕組みではありません。
- 新形式は安定ID、取得元ID、evidence、信頼度、nullと0の区別、複数必殺、usage rule、AI sequence、AOEなどを保持します。
- 新形式から現行形式へ変換すると重要情報が失われるため、production gateは現在`false`です。重大な`loss`が0件にならない限り本番昇格できません。
- 現行の`scraper/all_enemies.json`、localStorage形式、GitHub Pages、OneDriveからHTMLを直接開く使い方は変更していません。
- 外部サイトからの自動取得と定期更新は停止したままです。DokkanStats問い合わせはownerが2026-08-24に送信済みで、現在は返信待ちです。
- Viteは導入していません。第4段階のTypeScript試験は計算・データ境界の妥当性確認に限定しています。

## 第5段階の取得元・正本設計

- DokkanStatsは、正式API／export、書面許可、再配布範囲、履歴coverage、原則1週間以内の詳細完成を確認する**条件付き第一候補**です。まだ承認済みの主取得元ではありません。
- DokkanDBは掲載済みstageのAI・AOE・会心表現が豊富ですが、直近4 event sampleのうち3件でstage詳細を確認できず、利用許可も未解決です。DokkanInfo liveにも無許可の自動取得は戻しません。
- 保存済みDokkanInfo HTMLは削除せず、801 stage／5,032 enemyの照合、parser回帰、移行backupに使います。新sourceが合格した場合は本番生成の必須入力から格下げします。
- 将来の正本は新schemaの考え方を引き継ぎますが、現在のv1 draftをそのまま本番採用しません。source-neutralなcanonical、軽量runtime projection、release manifestへ分ける案です。
- 第5段階時点の2操作案は、その後のowner判断で変更されました。初期更新は`敵データを更新`の1操作で内部検査後に正常なら適用、異常時だけ停止し、将来0操作を目標とします。本番UIは未実装です。
- 将来の役割はPagesを普段使い、OneDrive旧版を独立したknown-good backupとする方針に決まりました。ただしproduction切替は未承認で、現在のOneDrive/local利用を維持しています。
- DokkanStatsへの問い合わせ完成稿はownerが送信済みですが、返信はまだありません。本番敵JSON、localStorage、Pages、OneDriveの使い方、workflowは変更していません。

## 第6段階のofflineデータ基盤

- source-neutral canonical v2、計算用runtime v1、release manifest、candidate/stable/known-good lifecycleを実装しましたが、本番アプリはまだ読みません。
- 保存済みPhase 4候補5,032体で全件schema・digest・determinism・safety・permissionを検証しました。hard failは0件ですが、初回canonical known-goodと公開許可がないためcandidateから昇格しません。
- runtimeはpretty 16.7MB、minified約6.05MBです。PCでは問題ない参考結果でしたが、Android/iPhone実機と展開後memoryは未検証なので、event単位chunkとの比較を次段階候補にしています。
- `file://`から外部JSONを`fetch()`できない実測結果があるため、現在のOneDrive/local単一HTMLを壊す設計は採用していません。
- DokkanStats専用adapterは作っていません。問い合わせはownerが送信し、書面回答をpermission ledgerへ反映するまで外部取得・派生公開を開始しません。
- Viteは第6段階のデータ基盤に不要だったため導入していません。

## 第7段階の配信・更新prototype

- productionと分離したprototypeで、6.05MB full runtimeと約47KB index＋88 event chunkをHTTP JSON、generated JS、Windows `file://`で比較しました。
- PCではfullも十分速い一方、mobile参考条件ではchunkが初期転送と初期memoryを明確に削減しました。将来の普段使い候補はPagesのevent chunk、内部release検証は単純なfullも利用する案です。
- 1操作更新はmanifest、version、digest、構造、件数急減、app互換性を確認し、途中失敗・health check失敗時にknown-goodへ戻りました。0操作更新はまだ無効です。
- 架空保存データの別origin転送は技術prototypeとして検証しましたが、owner判断で製品不採用となり、実行可能なprototypeとtestは後に削除しました。本番localStorageは変更していません。
- Pages primary＋現在のOneDrive known-good backupはPhase 8 release candidate仕様としてowner承認済みです。ただしproduction移行は未承認で、公開方式・普段の導線は変更していません。
- plain HTML/JSとgeneratorで必要な比較が成立したため、Viteは引き続き導入していません。

## 第8段階のrelease candidate

- 本番と分離したPages向け起動経路にevent index/chunk、前回event、設定・データ内の1操作更新、digest cache、2世代known-good、rollbackを統合しました。
- Pages候補は独立したversion付き保存keyから新規開始し、旧OneDrive key、旧移行先key、PAT、未知keyを読みません。初回後はPages自身の複数カード、作業中入力、カスタム攻撃・手動敵属性、会心設定、耐久ライン、themeを通常どおり自動保存・復元します。
- Chromium/WebKitのdesktop/mobile/touch/390pxと、両browserの単一HTML `file://`直開きを通常testへ追加しました。iPhone/Android実機確認は別途必要です。
- 公開可能なpreviewは架空3 eventだけです。実data由来5,032敵の全量releaseはローカル性能検証専用で、Git追跡・公開・production activationを禁止しています。
- 正式Pages root、main、現在のOneDrive、本番敵data/localStorage/workflowは変更していません。0操作更新と外部source接続も無効です。
- DokkanStatsはowner送信済み・返信待ちで、permissionは引き続きunknown/pendingです。
- 追加実機フィードバックにより、通常画面から未使用の「キャラクター管理」UIを削除しました。複数の計算用状況カード、追加・複製・削除、Pages内の作業中状態の自動保存は残しています。
- 「計算する状況」には個別の開閉に加えて「すべて開く」「すべて閉じる」を追加しました。開閉は表示だけを変え、計算・入力・保存内容を変更しません。
- 最新の追加実機フィードバックでは、属性・防御設定のスマホ整列、両結果直近の最終DEF／軽減率／全属性ガード表示、不要説明の削除、OneDrive→Pages移行機能の完全撤去を行いました。PagesとOneDriveは保存状態を同期しません。
- Phase 8最終実機フィードバックでは、ダメージ軽減率をDEF設定の末尾へ移し、IDに区切り文字を含む全体攻撃も対象別ATKで選択・自動計算できるよう修正しました。スマホの攻撃力範囲は数値部分を途中改行せず、360px／390pxでも横overflowを起こしません。
- 追加のスマホ実機フィードバックにより、低頻度の「敵の会心」は初期状態で閉じる表示専用の折りたたみにしました。ダメージ軽減率は基本DEF設定の最終項目へ置き直し、Androidのrange末尾表示とWebKitの長いselect幅を修正し、被ダメージ／属性結果を約62:38へ調整しました。

## 重要な安全上の注意

- DokkanInfoへの自動取得は停止中です。規約・許可の問題が解決するまで再開しません。
- `npm run audit:data`はローカルファイルを読むだけで、敵データを取得・上書きしません。
- スクレイパーの`npm run scrape`、`download`、`inject`は、通常の確認作業では実行しないでください。
- 現行アプリにはGitHub PATをlocalStorageへ保存する既存機能があります。テスト用データや通常のバックアップへPATを含めないでください。
- 公開版は`main`から配信されています。テストブランチのpushだけでは公開版は変わりません。

## 調査文書

- [第1段階の安全記録](docs/phase1-safety.md)
- [敵データ取得元の評価](docs/data-source-evaluation.md)
- [計算基準と既知の差](docs/calculation-baseline.md)
- [敵データ形式](docs/enemy-data-schema.md)
- [localStorage形式](docs/local-storage-schema.md)
- [第3段階の計算仕様調査](docs/phase3-calculation-specification.md)
- [第3段階の敵データ取得元再評価](docs/phase3-data-source-evaluation.md)
- [Phase 8最終実機フィードバック修正報告](docs/phase8-final-device-feedback-report.md)
- [Phase 8最終修正版 PC・スマホ再確認手順](docs/phase8-final-device-feedback-recheck-checklist.md)
- [Phase 8スマホ描画追加フィードバック修正報告](docs/phase8-mobile-render-feedback-report.md)
- [Phase 8スマホ描画修正版 PC・スマホ再確認手順](docs/phase8-mobile-render-feedback-recheck-checklist.md)
- [保存HTMLの再解析結果](docs/phase3-cached-source-analysis.md)
- [将来構成と敵データ設計](docs/phase3-architecture-and-data-design.md)
- [第4段階の完了報告](docs/phase4-completion-report.md)
- [第4段階の更新・公開方式比較](docs/phase4-update-hosting-strategy.md)
- [第5段階の敵データ正本・継続更新方式の評価](docs/phase5-data-source-and-canonical-design.md)
- [DokkanStatsへの問い合わせ完成稿（未送信）](docs/phase5-dokkanstats-inquiry-ready.md)
- [第4段階のDokkanStats問い合わせ草案（履歴・未送信）](docs/phase4-dokkanstats-inquiry-draft.md)
- [第6段階のsource-neutral敵データ基盤](docs/phase6-canonical-data-foundation.md)
- [第6段階の保存データ移行設計（履歴・後に不採用）](docs/phase6-saved-data-migration-design.md)
- [第6段階のhybrid実機比較設計](docs/phase6-hybrid-hosting-comparison-design.md)
- [DokkanStatsへの最終問い合わせ文（未送信）](docs/phase6-dokkanstats-inquiry-final.md)
- [第6段階の完了報告](docs/phase6-completion-report.md)
- [第7段階のruntime配信・更新・利用方式比較](docs/phase7-runtime-delivery-comparison.md)
- [第7段階のPC・Android・iPhone実機確認計画](docs/phase7-real-device-checklist.md)
- [DokkanStats問い合わせコピー用（owner送信済み・返信待ち）](docs/phase7-dokkanstats-inquiry-copy.md)
- [第7段階の完了報告](docs/phase7-completion-report.md)
- [第8段階のrelease candidate設計](docs/phase8-release-candidate-design.md)
- [第8段階のOneDrive known-good設計](docs/phase8-onedrive-known-good-design.md)
- [第8段階のPC・Android・iPhone実機確認](docs/phase8-device-preview-checklist.md)
- [第8段階の完了報告](docs/phase8-completion-report.md)
- [第8段階のPC実機フィードバック修正・機能差監査](docs/phase8-pc-feedback-fix-report.md)
- [第8段階修正版のPC再確認手順](docs/phase8-pc-recheck-checklist.md)
- [第8段階の追加実機フィードバック修正報告](docs/phase8-additional-feedback-report.md)
- [第8段階追加修正版のPC・スマホ再確認手順](docs/phase8-additional-recheck-checklist.md)
- [第8段階のキャラクター管理UI削除・一括開閉修正報告](docs/phase8-management-removal-report.md)
- [第8段階管理UI削除版のPC・スマホ再確認手順](docs/phase8-management-removal-recheck-checklist.md)
- [第8段階の結果条件表示・保存移行撤去修正報告](docs/phase8-result-summary-no-migration-report.md)
- [第8段階結果条件表示・保存移行撤去版のPC・スマホ再確認手順](docs/phase8-result-summary-no-migration-recheck-checklist.md)
