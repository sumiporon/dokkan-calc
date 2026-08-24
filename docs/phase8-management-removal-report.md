# Phase 8 キャラクター管理UI削除・一括開閉 修正報告

作成日: 2026-08-24（JST）

## 位置づけ

`phase8-additional-feedback-ready-2026-08-24`を復元点として、ownerが追加決定したPhase 8内のUI修正を行った。Phase 9、`main`、本番Pages、OneDrive本番版、production敵データ／workflow、外部取得、0操作更新は変更していない。

## キャラクター管理UIの削除と残した機能

通常画面から「キャラクター管理」の見出しと、保存済みキャラクター選択、読み込み、新規作成、削除、名前入力、保存buttonを削除した。単に閉じた状態にはしておらず、通常画面のDOMにも存在しない。

一方、次は削除していない。

- 「計算する状況」の複数card
- 状況cardの追加、複製、削除
- 各cardに独立したキャラクターDEF、属性、敵、攻撃、結果
- 入力の自動再計算と`currentScenarios`への作業中自動保存
- 既存の`savedCharacters`を読み、version 2へ互換変換し、そのまま再保存する内部処理
- 一覧preview

一覧previewは失わせず、「計算する状況」の小さい「一覧」buttonへ移した。localStorage schemaはversion 2のままで変更していない。以前の保存キャラクターは通常UIから操作しないが、互換データとして消さずに保持する。

## 個別・一括開閉

「計算する状況」の見出し右側に、次の4操作を横一列で配置した。

- すべて開く
- すべて閉じる
- 一覧
- ＋追加

各cardの「開く／閉じる」も残している。一括・個別とも、card本文の表示、`aria-expanded`、button文言だけを変更する。再計算、再描画、保存、card追加・削除は呼ばないため、閉じたcardも計算対象のままで、入力値とlocalStorageは変化しない。開閉状態自体は保存せず、再読込時はこれまでどおり展開状態から始まる。

## キャラクター管理に依存しない保存データ移行確認

移行元、移行完了画面、通常画面の案内を変更した。完了表示には次を明記する。

- 保存キャラクター件数と名前
- 保存済み状況件数
- 作業中の状況card件数
- 手動敵件数
- 設定分類数
- 会心補正件数
- GitHub PATは移行していないこと
- イベント・ステージ・配布敵データは増えていないこと

架空確認では、移行先の「確認版を開いて作業中の状況を見る」を押す。通常画面の「計算する状況」に「架空の作業中状況」が直接復元され、DEF 150,000、軽減30%、超体を確認できる。「設定・データ」には移行した全件数を表示する。削除した管理UIを開いたり保存キャラクターを読み込んだりする手順はない。

保存キャラクター2件と保存済み状況2件は互換性のため内部に保持し、その件数と名前を「設定・データ」で確認できる。GitHub PATと未知keyは従来どおりallowlist対象外である。

## 360px／390px実測

直前の追加修正版と同じ初期耐久ライン画面を`scripts/measure-phase8-mobile-layout.mjs`で比較した。4つの状況操作buttonは360pxでも一列に収まり、両幅とも横overflowはない。

| viewport | 項目 | 直前版 | 今回版 | 変化 |
| --- | --- | ---: | ---: | ---: |
| 360px | page全高 | 1,713px | 1,470px | 243px短縮（14.2%） |
| 390px | page全高 | 1,713px | 1,470px | 243px短縮（14.2%） |
| 360px／390px | 状況card | 952px | 952px | 入力寸法を維持 |
| 360px／390px | card先頭～属性設定末尾 | 755px | 755px | 入力密度を維持 |
| 360px／390px | 個別折りたたみ後のcard | 80px | 80px | 維持 |

不要な管理UIを丸ごと外したため、既存の40px入力高や状況card内の操作性を縮めずにpage全高を短縮できた。

## テストと安全境界

通常の`npm test`は177件成功、failed 0、skipped 0だった。Phase 8 browser試験は19件で、Chromium、WebKit、HTTP、`file://`、360px／390pxを含む。

追加・更新した回帰では、管理UI不在、複数card、追加・複製・削除、個別開閉、一括開閉、一括操作前後の計算・入力・localStorage完全一致、legacy保存保持、管理UIに依存しない架空移行、会心補正件数、PAT非移行、スマホoverflowを確認した。

event chunk、manifest、digest、update safety gate、atomic apply、known-good、rollback、保存移行allowlist、カスタム攻撃、耐久ライン属性、自動再計算も既存試験を通過した。通常UIに「被ダメージ0に必要なDEF」と「今すぐ再計算」はない。

## Gitとpreview

- branch: `codex/phase8-management-removal-20260824`
- start tag: `phase8-management-removal-start-2026-08-24`
- corrected preview tag: `phase8-management-removal-ready-2026-08-24`
- 再確認URLと手順: [Phase 8管理UI削除版 PC・スマホ再確認手順](phase8-management-removal-recheck-checklist.md)

実装と文書をcommitし、固定tagとbranchをpushした時点で停止する。ownerの再確認前にPhase 9へ進まない。
