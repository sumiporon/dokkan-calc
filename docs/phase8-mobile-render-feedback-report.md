# Phase 8 スマホ描画追加フィードバック修正報告

作成日: 2026-08-24（JST）

## 位置づけ

これはPhase 8固定previewに対する追加スマートフォン実機フィードバック4点の修正である。Phase 9には進んでいない。`main`、本番Pages、OneDrive本番版、production敵データ／workflow、外部取得、0操作更新は変更していない。

## 敵の会心とダメージ軽減率

低頻度の会心3項目を、コンパクトな`敵の会心`折りたたみへまとめた。初期状態は閉じており、見出しを押すと従来のON/OFF、ATK補正、DEF低下を編集できる。開閉状態は表示だけで、入力、計算、Pages内保存には含めない。会心ON・補正入力後に閉じても、同じ値と計算結果を維持し、再読込時は値を復元したうえで表示だけ閉じる回帰を追加した。

ダメージ軽減率は、基本`DEF設定`のinput gridで最後の項目へ移した。DOMと画面の順は`DEF設定 → ダメージ軽減率 → 属性・防御設定 → 敵の会心`である。同じ`dr_input`を移動しただけで、計算、入力event、自動再計算、保存形式は変更していない。

## 敵ATK末尾の黒い表示

直前版は、rangeを1行に保つため各数値を`overflow-x: auto`の独立した横scroll領域にしていた。添付のAndroid Chrome画像では、そのscrollable layerの末端overlayが灰黒いcaret状に描かれていた。

rangeから横scroll領域を撤去し、`overflow: hidden`、`nowrap`、透明caretへ変更した。通常値は完全表示し、端末幅を超える極端な値だけellipsisへfallbackする。数値要素はplain textだけで、子UI、疑似要素、scrollbarを持たない。さらにWebKitでは長い攻撃名を持つnative selectの内部幅が親へ伝播したため、selectを100%幅へ制限し、selector label内でclipするよう修正した。

Chromium／WebKitの360px／390pxで、短い`通常攻撃`、長いテスト用必殺名、複数必殺、全体攻撃のrangeを実描画した。4つの敵ATK rangeはすべて1行、内部overflow 0、scroll領域なし、疑似要素なし、page横overflowなしだった。

## 被ダメージ結果の幅とrange

スマホ時の被ダメージ／属性cardを50:50から**1.65:1（約62.3%:37.7%）**へ変更した。被ダメージ側は約12.3ポイント広く、属性側は同じ分だけ狭い。属性の`自分：超技／敵：極技`は両幅で読め、内部overflowはない。

被ダメージ文字列を攻撃名と数値rangeへ構造分離し、攻撃名は必要なら折り返し、`47.2万〜49万`のような最小～最大はinline-blockの1まとまりとして途中改行しない。非常に長いrangeだけellipsisへfallbackし、page全体を横scrollさせない。

## 360px／390px実測

`scripts/measure-phase8-mobile-layout.mjs`と実ブラウザで測定した。

| viewport | 項目 | 直前版 | 今回版 |
| --- | --- | ---: | ---: |
| 360px／390px | 初期page全高 | 1,462px | 1,405px |
| 360px／390px | 状況card | 943px | 887px |
| 360px／390px | card先頭～属性設定末尾 | 740px | 636px |
| 360px／390px | 会心見出し | 常時3項目表示 | 閉状態40px |
| 360px／390px | 会心を開いたpage全高 | — | 1,507px |
| 360px／390px | 被ダメージ:属性 | 50:50 | 約62.3:37.7 |

初期状態は直前版より57px（約3.9%）短く、状況cardは56px（約5.9%）短い。入力高と会心見出しの操作領域は40pxを維持した。両幅とも会心開閉時を含め、page横overflowはない。

## テスト

通常の`npm test`は**176件すべて成功、failed 0、skipped 0**だった。

追加回帰は会心の初期閉状態、開閉前後の値／計算／保存、軽減率のsection順、Android末尾overlayを作ったscroll領域の不在、子UI／疑似要素の不在、短い／長いlabel、敵ATK／被ダメージrange、約62:38の結果幅、属性可読性、Chromium／WebKitの360px／390pxを含む。通常、複数必殺、全体攻撃の最初／追加対象、custom攻撃、Pages内保存、event chunk、manifest、update gate、atomic apply、known-good、rollback、production旧版も成功した。

## Gitとpreview

- branch: `codex/phase8-mobile-render-feedback-20260824`
- start tag: `phase8-mobile-render-feedback-start-2026-08-24`
- ready tag: `phase8-mobile-render-feedback-ready-2026-08-24`
- 再確認URLと手順: [Phase 8スマホ描画修正版 PC・スマホ再確認手順](phase8-mobile-render-feedback-recheck-checklist.md)

previewは固定tag上の架空3 event／3 enemyだけを使い、本番Pagesではない。ownerの再確認が終わるまでPhase 9へ進まない。
