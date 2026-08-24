# Phase 8被ダメージ結果 baseline修正版 PC・スマホ再確認手順

## preview

`https://raw.githack.com/sumiporon/dokkan-calc/phase8-damage-baseline-ready-2026-08-24/release-candidate/phase8/index.html`

これは架空データだけのPhase 8確認版で、本番PagesやOneDrive本番版ではない。

## 確認する1点

1. `被ダメージ計算`へ切り替え、`架空イベント・森`、`架空の緑敵`、`架空必殺A`を選ぶ。
2. 390px前後で攻撃名とdamage rangeが1行のとき、両方の文字の高さ・baselineが揃って見えることを確認する。
3. 360px前後や長い攻撃名で2行になったとき、range全体が自然に次行へ移り、range自体が途中改行されないことを確認する。

select枠を含む他の項目は今回変更していない。ownerの確認まではPhase 9へ進めない。
