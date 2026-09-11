# Phase 11：1発のcapability最小実証

2026-09-11。owner承認済みの自作fixture専用、保存・実サイト・production非接続の独立レビュー画面。

## 対応範囲

出力単位で `damage`（この1発の被ダメ）、`zero-defense`（この1発への完封最終DEF）、`target-defense`（この1発を目標被ダメ以下にする最終DEF）を判定する。stage単位のpartial modeや取込経路は作らない。全状態ATK範囲、履歴強化、回数・順序、ターン合計、必殺組合せ、敵全体の完封、AOEは未対応。

入力はcanonicalと同じfield形式（state/value/evidenceIds/confidence）を持つ自作fixtureの限定ビューであり、完全canonical datasetや実source packageを受理するものではない。固定ATKの意味・履歴非依存性・効果確認範囲はfixture作者が明示した前提。これを実sourceの自己申告フラグで代替してはならない。現行Phase 11完全取込基準とcanonical schemaは変更していない。

## 判定と計算

`evaluateSingleHit(input, output, core)` は版・攻撃ID・条件ID・出力・保証範囲・status・理由・参照した依存fieldを返す。`available`だけに数値valueを持つ。情報不足は`blocked`、対応外は`unsupported`、DEFが全く効かず目標に達しない場合は`unattainable`。停止時に0/1/Infinityを出さない。

必須値のknown・型・範囲・fixture根拠を確認した後だけ、既存coreへ数値を渡す。回数は履歴非依存を確認できる今回の出力の依存項目ではない。現在の最終DEFはdamageだけ、目標被ダメはtarget-defenseだけに必要。未解釈効果は影響する出力を停止し、影響範囲不明は全3出力を停止する。

会心なしがknownなら会心専用補正は不活性であり、係数1を使う。これはunknown会心を無効化する処理ではない。敵の中立は既存承認済みの5属性を保持した相性処理を使う。

DEF逆算は最大乱数の順方向計算で条件を満たす最小整数を二分探索し、そのDEFと1低いDEFを検証する。初期DEFへの逆変換はしない。ATK/最終DEF/目標被ダメの対応上限は10^12、軽減0〜100%、属性防御レベル0〜30、会心ATK上昇0〜1000%、DEF無視0〜100%。上限外は数値を推測せず停止する。入力範囲はprototypeの実装範囲で、ゲーム仕様の上限を主張しない。

## 自作fixture

| ケース | 条件 | 被ダメ | 完封最終DEF | 目標最終DEF |
|---|---|---|---|---|
| A | 回数unknown・固定ATK1,000,000、同超速属性、軽減20%、最終DEF300,000、目標50,000 | 500,000〜524,000 | 824,000 | 774,000 |
| B | 現在ATKが未確定の必殺後重複強化へ依存 | 停止 | 停止 | 停止 |
| C | ATK unknown | 停止 | 停止 | 停止 |
| D | 敵属性unknown | 停止 | 停止 | 停止 |
| E | ATK/最終DEF/目標がknown 0 | 0・この1発：完封 | 0 | 0 |
| F | 対象結果に影響し得る未解釈効果あり | 停止 | 停止 | 停止 |

Dの掲載ATKはsource事実に相当するfixture値として示せるが、被ダメ系は表示しない。UIは利用不可時に以前の数値を消し、理由を表示する。画面で示す乱数幅は状態の不確定範囲ではない。

これらの数値・IDは全て自作。stage 17050015の実データや旧保存値は含まない。同stageは「現在のDokkanInfo取得経路では現行Phase 11取込基準に不合格」で診断終了のまま。

## 開き方・検証

`node scripts/preview-phase11-single-hit.mjs` が表示するlocalhost URLを開く。build不要。ローカルのHTML/CSS/JSのみを読み、接続後のfetch、storage、実サイト通信は行わない。終了はCtrl+C。

- `node --test tests/unit/phase11-single-hit.test.mjs`
- `node --test tests/browser/phase11-single-hit.test.mjs`

ブラウザ試験は自作ページでA〜F、利用可能から停止への切替、360/390px、外部通信・storage不使用を検証する。Android実機試験ではない。

## 実装後の検証結果

- 新規：unit 7件、ブラウザ1件、全8件成功。unitには出力ごとの依存差、unknown/unavailable/不正値のcore到達禁止、会心・軽減・属性・ガードの組合せでDEF最小性の順方向確認を含む。
- 既存：calculation-core、Phase 11 manual-intake / DokkanInfo / one-tapのunit・dataは62件中61件成功。既存manual-intake / one-tap / live-gateブラウザは20件すべて成功。合計82件中81件成功。
- 失敗1件は `Phase11 manual adapter and preview remain source-I/O free and embed no real cached enemy page` 内の固定preview一致検査。`phase11-preview/index.html` と `generated/phase11/preview.html` の既存内容が異なるため。今回どちらも生成・変更していない。テストを通すための上書きは行っていない。
- この失敗はclean HEAD（`13911676caa76e62a5b1082b0f450a4d26491839`）を別temporary worktreeで同じ対象テスト・同じ生成手順により再現し、現在worktreeと同じCSP hash差・同じassertionで失敗することを確認した。今回のprototypeによるregressionではない。比較用worktreeは削除済み。
- 固定preview SHA-256: `4ddd6daa8df9bfed45c2571941ec5aaf77db9c58ebbcfd39e6da1956c305b40b`。生成済みpreview SHA-256: `aad756206c5d77f97a5388e9e634315e3943d24aa44505be47ac2d5662ddea57`。
- 変更前後で全追跡対象1,343ファイルの「ファイル名＋内容」の連結SHA-256が一致：`7eb7b368c9ca36507c761ab1b252456e5fde3141b6549bfeba90d417362047da`。production成果物、core、schema、完全取込、既存拡張のソースを含む。今回は新規9ファイルの追加だけで、先行診断の未コミット差分も変更していない。XPI/AMO ZIPは再生成していない。
- `git diff --check` 成功。390pxスクリーンショットも確認済み。全体full testは実行していない。

## owner UIレビュー

2026-09-11、ownerがA〜Fを実機UIで確認しPASSとした。Aは3出力を表示し、B/C/D/Fは数値を完全に消して停止理由だけを表示、ケース切替後に以前の数値は残らなかった。Eのknown 0はunknownと混同せず0として計算された。全画面で「この1発」の保証範囲を維持し、「この敵を完封」「ターン全体を耐える」と読める表現はないこと、乱数幅と敵状態の不確定性の区別も確認した。

実DokkanInfoの部分材料の保存・受渡しは別工程。本実証だけで実データの使用や取込ゲート変更を許可しない。
