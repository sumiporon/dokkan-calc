# Phase 8最終修正版 PC・スマホ再確認手順

作成日: 2026-08-24（JST）

## 再確認URL

`https://raw.githack.com/sumiporon/dokkan-calc/phase8-final-device-feedback-ready-2026-08-24/release-candidate/phase8/index.html`

初回だけgithackの確認画面が出た場合は、URLが上記と一致することを確認して`Open the page`を押す。このURLは固定tag上の架空3 event／3 enemyだけを表示する一時previewであり、正式Pages、本番敵データ、OneDrive版を変更しない。

Pages候補はOneDrive旧版とは独立した新規状態から始まる。このpreviewで入力した内容だけをpreview側の専用保存領域へ自動保存し、OneDrive旧版の保存内容、PAT、未知keyは読み取らない。

## ownerが今回確認する3項目

1. PCとスマホでDEF設定を開き、「ダメージ軽減率」がクラス／属性、属性防御、敵の会心と補正より後の一番下にあることを確認する。値を変えると従来どおり自動計算されることも見る。
2. 被ダメージmodeで「架空イベント・森」→「架空ステージ1」→「架空の緑敵」を選び、「全体攻撃」と「全体攻撃（2体目以降）」をそれぞれ選ぶ。「攻撃を選択してください」にならず、自動で被ダメージが出ることを確認する。
3. 360～390px程度のスマホで、通常・必殺・全体攻撃の`最小～最大`が数値の途中で改行されず、画面全体も左右にはみ出さないことを確認する。攻撃名側の折返しは正常である。

異常があれば、PC／Android／iPhoneのどれか、上の手順番号、選んだ攻撃、入力値、表示結果、可能なら画面写真を知らせる。ownerの確認完了まではPhase 9へ進まない。
