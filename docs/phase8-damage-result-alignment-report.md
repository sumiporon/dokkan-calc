# Phase 8 被ダメージ結果 縦位置再修正報告

> この文書の見出し行／値行分離と値ブロック全体の中央配置は現行仕様である。ただし、同一行内でrangeだけが攻撃名より上に見える問題が残ったため、後続の[baseline修正](phase8-damage-baseline-report.md)で値ブロック内部をflex baseline整列へ変更した。

## 対象

ownerの再確認で未解決だった被ダメージ結果カードの縦位置だけを修正した。確認済みのselect強調枠を含む他のUI、計算、保存、更新処理には変更を加えていない。Phase 9、`main`、本番Pages、OneDrive本番版、production敵データ／workflow、外部取得、0操作自動更新も変更していない。

## 前回直らなかった理由

結果カードはCSS gridだったが、見出しと値はどちらも内容の高さだけを持ち、card全体は`align-content: start`で上端へ並べていた。値文字へ上2.24pxのpaddingを加えても、値要素そのものは上端のgrid位置から動かず、card下側に余る高さも使わなかった。そのため、数値ブロック全体の見た目はほぼ変わらなかった。

## 今回の構造

- 被ダメージ側cardへ`damage-result-card`を付け、`見出し行 + 値行`の2 rowを明示した。
- 攻撃名、改行候補、rangeを`damage-result-content`で1つの値ブロックにまとめた。
- スマホの値行を最低50pxとし、`damage-result-value`をgridにして値ブロック全体を`align-content: center`で配置した。
- 前回の上下paddingは0へ戻した。数pxずらすのではなく、値行の余白を上下へ均等に配る。
- rangeのnowrap、長い攻撃名側の折り返し、約62:38の結果幅、selectの内側2px focus borderは維持した。

## 実描画

Chromium／WebKitの360px・390pxで次を別々に描画した。

- 1行 `架空必殺A：171.9万〜177.2万`: 高さ50pxの値行で上下各約13.8px。
- 2行 `非常に長い攻撃名：`＋`171.9万〜177.2万`: 同じ値行で上下各約4.4px。
- どちらも上下差は1px以内、rangeは1行、ページ横overflowは0だった。

## テストとGit

- `npm test`: **176件成功、failed 0、skipped 0**
- Phase 8 browser: **24件成功、failed 0、skipped 0**
- branch: `codex/phase8-damage-result-alignment-20260824`
- start tag: `phase8-damage-result-alignment-start-2026-08-24`
- ready tag: `phase8-damage-result-alignment-ready-2026-08-24`
- 再確認: [PC・スマホ再確認手順](phase8-damage-result-alignment-recheck-checklist.md)
