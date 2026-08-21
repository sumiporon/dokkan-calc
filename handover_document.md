# ドッカンバトル耐久計算ツール 引き継ぎ資料 v3

最終更新: 2026-08-21

---

## 1. プロジェクト概要

DokkanBattle（ドッカンバトル）用の耐久ダメージ計算ツール。
サーバーレスのフロントエンドWebアプリとしてGitHub Pagesで公開されている。

- 公開URL: https://sumiporon.github.io/dokkan-calc/dokkan_calc_final.html
- リポジトリ: sumiporon/dokkan-calc
- ローカル開発フォルダ: C:\Users\kou20\Downloads\dokkan-calc-main\

---

## 2. フォルダ構成

dokkan-calc-main/           <- メインの開発フォルダ（ここを他AIに渡す）
├── dokkan_calc_final.html  <- 計算ツールのUI（HTML）
├── dokkan_calc_final.js    <- 計算ツールのロジック（約5MB、大規模）
├── dokkan_calc_final.css   <- スタイルシート
├── chrome_extension/       <- Chrome拡張機能（DokkanInfoのスクレイピング用）
│   ├── manifest.json       <- 拡張機能の設定ファイル（現在 version: 2.0）
│   └── content.js          <- スクレイピング・UI表示のメインスクリプト
├── scraper/
│   ├── all_enemies.json    <- スクレイピングで得た敵データ
│   ├── scrape-all-events.js <- Playwrightによる自動スクレイパー（GitHub Actions用）
│   └── update-preset.js    <- all_enemies.json を dokkan_calc_final.js に注入するスクリプト
├── copy_script.js          <- ローカルの変更を2箇所に同期するスクリプト
└── .github/workflows/scrape.yml <- 毎日06:00(JST)に自動スクレイピング

---

## 3. デプロイ方法

1. C:\Users\kou20\Downloads\dokkan-calc-main\ でコードを編集
2. node copy_script.js を実行して以下2箇所にコピー
   - C:\Users\kou20\OneDrive - 甲南大学\デスクトップ\ドッカン計算\chrome_extension\
     （Chrome拡張機能の実体。コピー後にChrome側で更新ボタンを押す）
   - C:\Users\kou20\OneDrive - 甲南大学\ドキュメント\GitHub\dokkan-calc\
     （GitHubフォルダ。git push でWebに反映）

---

## 4. 重要な実装の注意事項

### dokkan_calc_final.js の編集について

このファイルは約5MB・数万行の巨大ファイル。

【絶対に守ること】
// --- PRESET START --- と // --- PRESET END --- のコメントブロックを削除・変更しないこと。
この範囲が update-preset.js によって自動的に置き換えられる。壊すと自動更新が停止する。

変更方法（安全な方法）:
  const fs = require('fs');
  let js = fs.readFileSync('dokkan_calc_final.js', 'utf-8');
  js = js.replace('旧コード', '新コード');
  fs.writeFileSync('dokkan_calc_final.js', js);

### savedEnemies の4階層データ構造

savedEnemies (配列)
  └── eventType (例: 'レッドゾーン')
      └── series (例: '超激戦BOSSラッシュ!!')
          └── stages (例: 'Stage 1')
              └── bosses (例: { name, class, type, attacks, critAtkUp, critDefDown })

---

## 5. Chrome拡張機能の仕様と未解決問題

### 目的

DokkanInfo（jpnja.dokkaninfo.com）にアクセスしたとき、画面右下に専用パネルを表示し、
ボスデータをスクレイピングしてクリップボードにコピーする機能。

### URLごとの動作モード

/events/challenge/1708/3 （数字/数字） -> stage モード: 単体ボスを解析してコピー
/events/challenge/1708 （数字1つ）     -> event_list モード: イベント内の全ステージを一括取得
/events/challenge （カテゴリのみ）      -> category_list モード: カテゴリ内の全イベントを一括取得

### インポートの流れ

1. 拡張機能でデータをクリップボードにコピー
2. 計算ツールの「敵キャラクター管理」→「📋 拡張機能からインポート」をクリック
3. savedEnemies に差分追加（重複はスキップ）
4. 結果が「新規追加: ○件 / スキップ: ○件」で表示される

### 【未解決の問題】最優先で対応が必要

現象: jpnja.dokkaninfo.com/events/challenge を開いても右下にパネルが出ない。
ステータス: 2026-04-15時点で未解決。エラーは出なくなったが、パネルが表示されない。

デバッグ方針:
content.js の init() 関数（ファイル末尾付近）が問題箇所。

DokkanInfoの https://jpnja.dokkaninfo.com/events/challenge を開き
F12 → Consoleタブで以下を実行して結果を確認すること:

  // URL判定確認
  console.log(window.location.pathname);
  console.log('catMatch:', window.location.pathname.match(/\/events\/(challenge|super|growth|story)\/?$/i));

  // リンク収集確認
  const links = document.querySelectorAll('a');
  const found = [];
  for(let a of links) {
    if(a.href && a.href.match(/\/events\/[a-z]+\/\d+/) && !a.href.match(/\/events\/[a-z]+\/\d+\/\d+/)) {
      found.push(a.href);
    }
  }
  console.log('found event links:', found.length, found.slice(0, 5));

  - catMatch が null → URL判定ロジックを修正する
  - found が 0 → リンク抽出の正規表現を修正する
  - isCategoryList が true でも eventLinks.size が 0 → createUI が呼ばれない

---

## 6. 会心（クリティカル）機能

- 警告バナー: #crit-setup-banner（画面上部、未設定ボスがあると表示）
- 設定モーダル: #crit-setup-modal
- localStorage キー: dokkan_crit_overrides
- GitHub同期: PAT入力で scraper/crit_overrides.json に同期可能

---

## 7. GitHub Actions（自動スクレイピング）

- スケジュール: 毎日 06:00 JST
- スクリプト: scraper/scrape-all-events.js（Playwright使用）
- 注意: node_modules は絶対にGitにコミットしない。Actions側で npm ci を実行する。

---

## 8. AIアシスタントへのガイドライン

1. コード変更前は必ず現状確認（grep/read_fileで対象箇所を確認してから変更する）
2. dokkan_calc_final.js はNode.jsスクリプトでパッチを当てる（ファイルが巨大なため）
3. PRESET START ブロックには絶対に触れない
4. node_modules をGitにコミットしない
5. 変更後は node -c dokkan_calc_final.js で構文チェックを実行する