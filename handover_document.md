# 【最新・完全版】ドッカンバトル耐久計算ツール 自動化プロジェクト 引き継ぎ資料 v2

この資料は、本プロジェクトに携わる開発者（およびAIアシスタント）が、システムの現状、最近追加された機能、アーキテクチャの全体像、そして今後の開発を安全かつ迅速に進めるための「詳細な指示書・リファレンス」です。

---

## 1. プロジェクトの全体像と動作の仕組み

現在、本ツールは **「自動更新可能な完全フロントエンドWebアプリ」** としてGitHub Pagesで公開されています。
サーバーサイド（バックエンド）を持たず、ブラウザ上で全ての計算を完結させています。

*   **公開URL:** `https://sumiporon.github.io/dokkan-calc/dokkan_calc_final.html`
*   **リポジトリ:** `sumiporon/dokkan-calc`
*   **日次自動更新（GitHub Actions）の仕組み:**
    1. `.github/workflows/scrape.yml` が毎日 06:00 (JST) に起動。
    2. `scraper/scrape-all-events.js` が DokkanInfo 等の外部サイトから全イベントをスクレイピングして `scraper/all_enemies.json` を生成。
    3. `scraper/update-preset.js` がそのデータを `dokkan_calc_final.js` の変数 `DEFAULT_ENEMIES_PRESET` に流し込む。
    4. 変更が自動コミットされ、GitHub Pagesが更新されることで、ユーザーは常に最新の敵データを利用可能。

---

## 2. 直近で実装された機能と重要な変更点（最新のアップデート内容）

直近の開発フェーズにおいて、以下の重要な機能追加とバグ修正が行われました。開発を引き継ぐ際は、これらの仕様を必ず理解しておいてください。

### ① 「会心（クリティカル）設定UI」の一括管理機能
一部のボス（セルマックス等）が使用する「会心」によるATK上昇/DEF低下倍率を、ユーザーが画面上から一括で追加設定できるUIを実装しました。

*   **仕様:**
    *   画面ロード時、`DEFAULT_ENEMIES_PRESET` を走査し、`hasSaCrit` などの会心フラグが立っているにも関わらず、`critAtkUp` と `critDefDown` の値が `0`（未設定）のボスを抽出。
    *   未設定のボスが存在する場合、画面上部に黄色い警告バナー（`#crit-setup-banner`）を表示。
    *   バナーをクリックするとモーダル（`#crit-setup-modal`）が開き、未設定の各ボスに対して「会心時ATK上昇率」「会心時相手DEF低下率」を入力可能。
*   **データの保存:**
    *   入力された値はブラウザの `localStorage`（キー名: `dokkan_crit_overrides`）に保存され、次回のページ読み込み時に自動で `savedEnemies` にマージされます。

### ② GitHub APIによる同期（自動永続化）機能
ユーザーがローカルで設定した会心倍率（上記①）を、リポジトリの `scraper/crit_overrides.json` に直接反映させる開発者向けの機能を実装しました。

*   **仕様:**
    *   会心設定モーダル内に「GitHub PAT (同期用)」のパスワード入力欄を追加。
    *   「保存して同期」ボタンを押すと、入力されたPersonal Access Token (PAT) を使用して、GitHub REST API (Contents API) へ `PUT` リクエストを送信し、ファイルを直接更新・コミットします。
    *   ※ 一般ユーザーが利用する際はPAT入力欄は空欄でよく、「ローカルに保存」ボタンのみを使用します。

### ③ スクレイパーのクラス（超・極）判定ロジックの修正
スクレイパーが一部のボスの「超・極」クラスを誤認するバグを修正しました。

*   **修正内容:**
    *   `scraper/scrape-all-events.js` 内で、属性アイコン画像（`cha_type_icon_(\d+)`）のIDからクラスを判定する際、`id / 10` の切り捨て結果をそのまま使用していましたが、これを **`Math.floor(id / 10) % 10`** に修正。
    *   これにより、アイコンIDの桁数やプレフィックスが異なる特殊な画像（例: `id=101`）でも、正確に末尾の識別子を抽出して「超(1)」「極(2)」を判定できるようになりました。

### ④ 【重要】 `update-preset.js` のファイル破壊事故対策
過去に、正規表現の誤作動により `dokkan_calc_final.js` の UIロジック（約8万行）がすべて消失する重大な事故が発生しました。

*   **抜本的な対策:**
    *   `dokkan_calc_final.js` 内の `DEFAULT_ENEMIES_PRESET` 配列の定義部分を、専用のコメントブロック **`// --- PRESET START ---`** と **`// --- PRESET END ---`** で囲みました。
    *   `scraper/update-preset.js` は、正規表現 `/\/\/ --- PRESET START ---\n\s*const DEFAULT_ENEMIES_PRESET = \[[\s\S]*?\];\n\/\/ --- PRESET END ---/` を使用して、**このコメントブロックに挟まれた部分のみを厳密に置換**するように改修しました。
    *   **今後の警告:** 今後 `dokkan_calc_final.js` を編集する際は、絶対にこのコメントブロック（`// --- PRESET START ---` と `// --- PRESET END ---`）を削除したり名前を変更しないでください。自動更新が完全に壊れます。

### ⑤ GitHub Actions の Playwright 権限エラー修正
毎朝のスクレイピング実行時、`npx playwright install` コマンドで `sh: 1: playwright: Permission denied (exit code 127)` というエラーが発生して処理が停止する問題を解決しました。

*   **原因と対策:**
    *   Windowsなどのローカル環境から `scraper/node_modules/` フォルダがそのままGitにコミット（アップロード）されていたため、Linux環境（Actions）でバイナリファイル（`.bin/playwright`等）の「実行権限（+x）」が失われていました。
    *   リポジトリから `node_modules` ディレクトリを削除しました。
    *   `.github/workflows/scrape.yml` を修正し、`npm install` ではなく **`npm ci`** を実行して毎回クリーンな環境で依存関係をインストールするように変更しました。

---

## 3. 主要ファイル構成と役割

開発を引き継ぐAIやエンジニアは、以下の主要ファイルの役割を必ず把握してください。

*   **`dokkan_calc_final.html`**:
    *   アプリケーションのメインUI。計算モードの切り替え、キャラクター管理、敵管理、会心設定モーダルなどの全てのHTML構造が含まれる。
*   **`dokkan_calc_final.js`**:
    *   アプリケーションの頭脳。UIのイベントリスナー、ダメージ計算ロジック、シナリオの動的生成、`localStorage`との連携、GitHub API同期など、すべてのフロントエンド処理がここに集約されています。
    *   `// --- PRESET START ---` から始まる部分は絶対に手動で構造を壊さないこと。
*   **`scraper/scrape-all-events.js`**:
    *   Playwrightを使用して外部サイトを巡回し、最新のボスのATKや必殺技倍率、属性、クラスなどのデータを自動収集するスクリプト。
*   **`scraper/update-preset.js`**:
    *   スクレイピングで得られた `all_enemies.json` の内容を読み込み、安全な正規表現を用いて `dokkan_calc_final.js` に注入する極めて重要なスクリプト。
*   **`.github/workflows/scrape.yml`**:
    *   自動更新を実行するGitHub Actionsの設定ファイル。毎日06:00 (JST) にスクレイパーを起動させる役割を持つ。

---

## 4. 今後の開発・運用における AI アシスタントへの指示（Guidelines）

1.  **必ず `grep` や `cat` で現状を確認すること:**
    *   コードを変更する前には、必ず対象ファイルの該当箇所を `grep` や `read_file` を使って確認してください。「おそらくこうなっているだろう」という推測での正規表現置換（`sed` 等）は、取り返しのつかないファイル破壊（8万行消失など）を招くため絶対に禁止です。
2.  **`dokkan_calc_final.js` を操作する際の注意:**
    *   このファイルは巨大（約8万行以上）です。変更を加える際は、ファイルの全体を読み込んでパッチを当てる `replace_with_git_merge_diff` や、安全に作られた一時的な Node.js スクリプトによる置換を利用してください。
    *   **プレセットのコメントブロック（`// --- PRESET START ---`）には絶対に触れないこと。**
3.  **UI（フロントエンド）変更時の確認:**
    *   HTMLやCSS、DOM操作ロジックを変更した場合は、必ず Python の `http.server` などを立ち上げてローカルでプレビューし、Playwright などを用いてスクリーンショットを撮影（`frontend_verification_instructions` に準拠）して、意図した通りに描画・動作しているか（エラーが出ていないか）を視覚的に検証してからコミットしてください。
4.  **`node_modules` のコミット厳禁:**
    *   今後、新しくライブラリ（`npm install`）を追加した場合でも、絶対に `node_modules` ディレクトリを Git に追加（`git add node_modules`）しないでください。すべては `.gitignore` で弾くか、無視するように設定し、Actions 側で `npm ci` させる運用を徹底してください。
5.  **テストとコミット:**
    *   作業が完了した後は、必ず `node -c dokkan_calc_final.js` 等で構文エラーがないか確認してください。
    *   マージ先のブランチ名やPull Requestの挙動に注意し、もしGitHub上でPRが立たない場合は、完全に新しいブランチ名を指定して `submit` ツールを実行してください。

以上のドキュメントを遵守し、ドッカンバトル耐久計算ツールの開発と保守を安全かつ効率的に継続してください。