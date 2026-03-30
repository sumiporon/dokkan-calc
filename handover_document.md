# 【完全版】ドッカンバトル耐久計算ツール 自動化プロジェクト 引き継ぎ資料

この資料は、別のAIアシスタントが本プロジェクトを遅滞なく引き継ぎ、開発を継続するための詳細な指示書です。

---

## 1. プロジェクトの現状と全体像
現在、本ツールは **「自動更新可能なWebアプリ」** としてGitHub Pagesで公開されています。

*   **公開URL:** `https://sumiporon.github.io/dokkan-calc/dokkan_calc_final.html`
*   **リポジトリ:** `sumiporon/dokkan-calc`
*   **動作の仕組み:** 
    1. GitHub Actions (`.github/workflows/scrape.yml`) が毎日 06:00 (JST) に起動。
    2. `scraper/scrape-all-events.js` が全イベントをスクレイピングして `all_enemies.json` を生成。
    3. `scraper/update-preset.js` がそのデータを `dokkan_calc_final.js` の変数 `DEFAULT_ENEMIES_PRESET` に流し込む。
    4. 変更がGitHubに自動コミットされ、Pagesが更新される。

## 2. 参照すべき重要ファイルと役割
作業を開始する前に、以下のファイルをこの順序で参照してください。

1.  **[index.html / dokkan_calc_final.html](file:///c:/Users/kou20/OneDrive%20-%20%E7%94%B2%E5%8D%97%E5%A4%A7%E5%AD%A6/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/%E3%83%89%E3%83%83%E3%82%AB%E3%83%B3%E8%A8%88%E7%AE%97/dokkan_calc_final.html):** 画面の構造。
2.  **[dokkan_calc_final.js](file:///c:/Users/kou20/OneDrive%20-%20%E7%94%B2%E5%8D%97%E5%A4%A7%E5%AD%A6/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/%E3%83%89%E3%83%83%E3%82%AB%E3%83%B3%E8%A8%88%E7%AE%97/dokkan_calc_final.js):** 
    *   計算ロジックが含まれるメインファイル。
    *   **53行目付近:** `const DEFAULT_ENEMIES_PRESET = [...]` が開始。
    *   **78550行目付近:** 同配列が終了。
3.  **[scraper/scrape-all-events.js](file:///c:/Users/kou20/OneDrive%20-%20%E7%94%B2%E5%8D%97%E5%A4%A7%E5%AD%A6/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/%E3%83%89%E3%83%83%E3%82%AB%E3%83%B3%E8%A8%88%E7%AE%97/scraper/scrape-all-events.js):** データ収集エンジン。
4.  **[scraper/update-preset.js](file:///c:/Users/kou20/OneDrive%20-%20%E7%94%B2%E5%8D%97%E5%A4%A7%E5%AD%A6/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/%E3%83%89%E3%83%83%E3%82%AB%E3%83%B3%E8%A8%88%E7%AE%97/scraper/update-preset.js):** JSファイルを安全に更新するための正規表現処理が含まれる。

## 3. これから実施すべき作業ステップ

### ステップ1: 「会心（クリティカル）設定UI」の再実装
一部のボス（セルマックス等）が使用する「会心」によるATK上昇/DEF低下倍率をユーザーが追加設定できるUIを作ってください。
*   `all_enemies.json` （または `DEFAULT_ENEMIES_PRESET`）の中で、`crit: 1` かつ倍率が未設定のボスを一覧表示するバナーを画面上部に出す。
*   クリックするとモーダルが開き、値を入力して保存できる。
*   保存された値は `localStorage` （キー名: `dokkan_crit_overrides`）に格納し、ページ読み込み時にマージされるようにする。

### ステップ2: GitHub APIによる同期（自動永続化）
ユーザーがローカルで設定した会心倍率を、リポジトリの `scraper/crit_overrides.json` に自動反映させる。
*   GitHub REST API を使用して `PUT` リクエストを送り、ファイルを更新する。
*   ユーザーにGitHubのPersonal Access Token (PAT) を入力させるUIが必要。

### ステップ3: データの整合性チェック
*   スクレイパーが特定のボスの「超・極」クラスを誤認する問題を修正する。
*   `scrape-all-events.js` 内の `classRange` 判定ロジックの見直し。

## 4. 過去の失敗と重要な警戒事項
> [!CAUTION]
> **ファイル消去事故について:** 
> 以前、`update-preset.js` の正規表現 `[\s\S]*?` を不適切に使用した際、`dokkan_calc_final.js` の約8万行（2.5MB分）が誤って一行の定数定義に置換され、コードが消滅する事故が発生しました。
> **対策:** 正規表現を使用する際は、必ず **「その定数定義の末尾（ `];` ）」** を厳密に捕捉し、それ以降のコード（UIイベントリスナー等）を絶対に巻き込まないようにしてください。

## 5. 次のAIへの指示
1.  まずは `dokkan_calc_final.js` の構造（特に定数部分とロジック部分の境界）を `grep` 等で確認してください。
2.  `update-preset.js` の安全性を確認してから、再度データのマージを試みてください。
3.  上記ステップ1から順次実装を進めてください。
