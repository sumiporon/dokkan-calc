# Phase 8 被ダメージ結果 baseline修正報告

## 対象

ownerが再確認で特定した、1行表示時にdamage rangeだけが攻撃名より上へ見える問題だけを修正した。確認済みのselect枠、計算、保存、更新、その他のPhase 8 UIには変更を加えていない。Phase 9、`main`、本番Pages、OneDrive本番版、production敵データ／workflowも変更していない。

## 原因

攻撃名は通常のinline要素、rangeはnowrapと末尾保護のため`overflow: hidden`を持つinline-blockだった。overflowがvisibleではないinline-blockは通常文字とは異なるbox基準でbaselineへ参加するため、rangeのline boxが攻撃名より上へ配置されていた。390pxの修正前実描画ではrange上端が攻撃名より約3.4px上だった。値領域全体のpaddingや中央配置では、この同一行内のbaseline差は変わらない。

## 修正構造

- 攻撃名とrangeの間にあった`wbr`を削除し、2要素を同じflex containerのitemにした。
- containerは`display: flex; flex-wrap: wrap; align-items: baseline`とした。
- rangeは1つのnowrap flex itemとして保持する。1行に収まれば攻撃名と同一baseline、収まらなければrange全体が次のflex lineへ移る。
- range単独へのpadding／marginによる位置補正は加えていない。

## 実描画

Chromium／WebKitの360px・390pxで1行／2行を別々に確認した。

- 390pxの`架空必殺A：171.9万〜177.2万`は、攻撃名とrangeの上端差・下端差とも0px。
- 360pxと長い攻撃名ではrangeが次行へ移り、range内部は1行のまま。
- 360px／390pxともページ横overflowはない。

## テストとGit

- `npm test`: **176件成功、failed 0、skipped 0**
- Phase 8 browser: **24件成功、failed 0、skipped 0**
- branch: `codex/phase8-damage-baseline-feedback-20260824`
- start tag: `phase8-damage-baseline-start-2026-08-24`
- ready tag: `phase8-damage-baseline-ready-2026-08-24`
- 再確認: [PC・スマホ再確認手順](phase8-damage-baseline-recheck-checklist.md)
