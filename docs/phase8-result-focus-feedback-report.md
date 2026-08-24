# Phase 8 結果位置・select枠 最終フィードバック修正報告

## 対象と安全境界

ownerのスマートフォン実機フィードバック2点だけを修正した。Phase 9には進んでいない。`main`、`origin/main`、本番Pages、現在のOneDrive本番版、production敵データ／workflow、外部自動取得、0操作自動更新は変更していない。

## 被ダメージ結果の縦位置

スマホ幅だけ、被ダメージ値へ上2.24px・下1.28pxの小さな内側余白を追加し、行間を18.72px（文字サイズの1.3倍）へ整えた。カード全体を中央寄せにはしておらず、従来どおり上から読む配置を保ったまま、見出しから値まで約4.14px空けている。

- 390pxの短いケースは、技名とrangeが同じ行でも上へ詰まらない。
- 360pxの長いケースは、技名の次の行へrange全体が移っても行間が均一である。
- 数値rangeのnowrap、被ダメージ／属性の約62:38、横overflowなしを維持した。

## select強調枠

長いnative selectがWebKitでページ幅を押し広げないよう、敵選択gridのlabelは`overflow: hidden`を保持している。一方、ブラウザ標準のfocus outlineはcontrolの外側へ描かれるため、この親枠に下辺・角が切られていた。

focus／active時の外側outlineを使わず、select自身の内側に四辺2pxのborderを描く方式へ変更した。controlのbox内だけで完結するため、親のoverflow対策と両立し、border-radiusの四隅も切れない。

イベント、ステージ、敵、計算する攻撃、ターン、HPをChromium／WebKitの360px・390pxで個別にfocusし、全4辺2px、outlineなし、ページ横overflowなしを確認した。

## テスト

- 通常の`npm test`: **176件成功、failed 0、skipped 0**
- Phase 8 browser: **24件成功、failed 0、skipped 0**
- Chromium／WebKit、360px／390pxで1行／2行結果、focus枠、既存range、横overflowを実描画した。

## Gitと再確認

- branch: `codex/phase8-result-focus-feedback-20260824`
- start tag: `phase8-result-focus-feedback-start-2026-08-24`
- ready tag: `phase8-result-focus-feedback-ready-2026-08-24`
- 再確認: [Phase 8結果位置・select枠修正版 PC・スマホ再確認手順](phase8-result-focus-feedback-recheck-checklist.md)
