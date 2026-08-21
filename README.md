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
npm run test:unit
npm run test:data
npm run test:browser
npm run audit:data
```

ブラウザテストは独立した一時ブラウザを使います。普段使用しているブラウザの保存データやlocalStorageは読み書きしません。

## 主なファイル

- `dokkan_calc_final.html` / `.css` / `.js`：現在の公開アプリ本体
- `scraper/all_enemies.json`：現行の敵データ
- `scraper/`：過去のデータ取得・解析コードとHTMLキャッシュ
- `chrome_extension/`：DokkanInfo取得用の既存Chrome拡張
- `tests/`：計算、敵データ、localStorage、画面操作のテスト
- `scripts/audit-enemy-data.mjs`：敵データの監査レポート
- `docs/`：安全記録、データ形式、計算上の既知差、移行時の注意

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
