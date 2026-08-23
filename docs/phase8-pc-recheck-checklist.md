# Phase 8修正版 PC再確認手順

作成日: 2026-08-24（JST）

Android／iPhone確認はまだ行わない。まずPCだけで次を確認し、大きな問題がなければownerが次の確認順を指示する。

## PC再確認URL

通常画面:

`https://rawcdn.githack.com/sumiporon/dokkan-calc/phase8-pc-recheck-ready-2026-08-24/release-candidate/phase8/index.html`

架空保存データ移行:

`https://rawcdn.githack.com/sumiporon/dokkan-calc/phase8-pc-recheck-ready-2026-08-24/release-candidate/phase8/migration-device-check.html`

正式Pagesではなく、tag上の架空3 event／3 enemyだけを表示する一時previewである。現在のOneDrive版と保存データは変更しない。

## 短い確認手順

1. 通常画面を開き、最初が「耐久ライン」で、完封・70万が自動表示されることを確認する。
2. DEFやパッシブへ入力し、buttonなしで最終DEFと耐久ラインが変わること、初期0へ`44`と入れて`044`にならないことを確認する。
3. 「被ダメージ計算」へ切り替え、敵が未選択で「敵を選択してください」と出ることを確認する。
4. 架空イベント・空→架空の青敵を選び、`超速`、通常／必殺ATK、自分／敵属性が日本語で出ることを確認する。
5. 表示最終DEFを「被ダメージ0に必要なDEF」以上にし、同じ攻撃の被ダメージが`0`になることを確認する。
6. 状況カードを追加し、2件をキャラクター名で保存→新規作成→読み込みできることを確認する。
7. 架空イベント・森を選び、条件付き通常ATKがrange、架空必殺A/Bと全体攻撃が別々に出ることを確認する。
8. 架空保存データ移行を1回実行し、2キャラクター／2保存状況／1作業中状況／1手動敵、PAT非移行、敵data増加なしの説明を確認する。

異常があれば、どの番号で、入力値と画面表示がどうなったかを知らせる。PCが合格するまでAndroid／iPhoneへ進まない。
