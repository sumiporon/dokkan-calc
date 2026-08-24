# Phase 8 属性カード content中央配置報告

## 対象

被ダメージ結果右側の属性カードだけを修正した。見出し「属性」は現在位置のまま、`自分／敵`の2行だけを見出し下のcontent領域で上下中央に配置した。ownerが確認済みの被ダメージbaseline、select枠、range折り返し、結果カード横幅比を含む他のPhase 8仕様は変更していない。Phase 9、`main`、本番Pages、OneDrive本番版、production敵データ／workflowも変更していない。

## 修正構造

- 属性カードへ専用classを付け、`見出し行 + content行`の2 rowを明示した。
- スマホのcontent行は左側の被ダメージ値行と同じ50pxとした。
- `自分／敵`を持つcontent要素をgridとして行全体へ伸ばし、`align-content: center`で2行をひとまとまりのまま上下中央へ配置した。
- 文字単体へmarginやpaddingは追加していない。

## 実描画

Chromium／WebKitの360px・390pxで確認した。

- 属性content領域は50pxで、2行の上下余白は各約6px。
- 「属性」見出しの上端は左側見出しと一致し、修正前の位置を維持した。
- 左右結果カードの高さ差は0px、横幅比は1.65:1。
- 被ダメージ側の1行baseline上端・下端差は0pxのまま。
- 360px／390pxとも横overflowはない。

## テストとGit

- `npm test`: **176件成功、failed 0、skipped 0**
- Phase 8 browser: **24件成功、failed 0、skipped 0**
- branch: `codex/phase8-type-card-alignment-20260825`
- start tag: `phase8-type-card-alignment-start-2026-08-25`
- ready tag: `phase8-type-card-alignment-ready-2026-08-25`
- 再確認: [PC・スマホ再確認手順](phase8-type-card-alignment-recheck-checklist.md)
