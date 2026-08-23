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
npm run test:cached-source
npm run test:browser
npm run audit:data
```

`npm test`には、第4段階のTypeScript型検査、候補データ変換、schema、互換性、成果物digestの検査も含まれます。TypeScriptは`tsc`で通常のJavaScriptへ事前コンパイルしてからNodeで実行するため、Node 22の実験機能は使いません。対応範囲は`package.json`どおりNode 20以降です。

ブラウザテストは独立した一時ブラウザを使います。普段使用しているブラウザの保存データやlocalStorageは読み書きしません。

保存済みHTMLだけを再解析して集計レポートを更新する場合は、次を使います。外部サイトへの通信や現行敵データの上書きは行いません。

```powershell
npm run analyze:cached-source
```

第4段階の非本番candidate一式を保存HTMLから再生成する正式コマンドは次です。外部通信は行わず、現行敵JSONも上書きしません。801ステージを再解析するため、完了まで数分かかることがあります。

```powershell
npm run generate:phase4
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
- `schemas/`：将来形式の設計案（現行アプリはまだ読み込まない）
- `docs/`：安全記録、データ形式、計算上の既知差、移行時の注意

## 第4段階candidateの位置づけ

- candidateは`2026-02-23T08:11:11.385Z`に保存されたDokkanInfo HTMLキャッシュの再解析結果で、現在の最新ステージを取得する仕組みではありません。
- 新形式は安定ID、取得元ID、evidence、信頼度、nullと0の区別、複数必殺、usage rule、AI sequence、AOEなどを保持します。
- 新形式から現行形式へ変換すると重要情報が失われるため、production gateは現在`false`です。重大な`loss`が0件にならない限り本番昇格できません。
- 現行の`scraper/all_enemies.json`、localStorage形式、GitHub Pages、OneDriveからHTMLを直接開く使い方は変更していません。
- 外部サイトからの自動取得と定期更新は停止したままです。DokkanStatsへの問い合わせ草案も未送信です。
- Viteは導入していません。第4段階のTypeScript試験は計算・データ境界の妥当性確認に限定しています。

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
- [保存HTMLの再解析結果](docs/phase3-cached-source-analysis.md)
- [将来構成と敵データ設計](docs/phase3-architecture-and-data-design.md)
- [第4段階の完了報告](docs/phase4-completion-report.md)
- [第4段階の更新・公開方式比較](docs/phase4-update-hosting-strategy.md)
- [DokkanStatsへの問い合わせ草案（未送信）](docs/phase4-dokkanstats-inquiry-draft.md)
