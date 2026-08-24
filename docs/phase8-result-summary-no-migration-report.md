# Phase 8 結果条件表示・保存移行撤去 修正報告

作成日: 2026-08-24（JST）

## 位置づけ

これはPhase 8追加実機フィードバックへの修正である。Phase 9には進んでいない。`main`、本番Pages、OneDrive本番版、production敵データ／workflow、外部取得、0操作更新は変更していない。

ownerの確定方針は次のとおりである。

- 将来のPages版はOneDrive旧版の保存内容を引き継がず、新規状態から利用を開始する。
- Pagesで使い始めた後の作業中状態は、Pages自身の専用保存領域へ自動保存する。
- OneDrive旧版は、独立した旧known-good／offline backupとして残す。
- OneDriveとPagesの間にimport、export、同期、逆同期を設けない。
- Pagesの通常利用と敵データ更新でGitHub PATを要求しない。

## 属性・防御設定のスマホ整列

360～390pxでは次の4段に整理した。

1. 自分のクラス／自分の属性
2. 属性防御Lv／全属性ガード
3. 敵の会心を想定（横幅いっぱいの1行）
4. 会心時ATK補正／会心時DEF低下

会心checkboxを独立した横一列にしたため、補正入力の片側だけが下へずれる状態をなくした。左右の入力欄、label位置、40pxの入力高を揃え、checkbox行も40pxの操作領域を保った。compact化は維持し、横overflowは発生していない。

## 結果直近の計算条件

耐久ラインでは属性selectorの直後、耐久表の直前に、被ダメージでは属性表示の直後、被ダメージ結果の直前に次の3項目を横一列で表示する。

- 最終DEF
- 軽減率
- 全属性ガード（あり／なし）

表示専用であり、元のDEF、DEF補正、軽減、ガード等を変更すると、既存の自動再計算経路で両方の表示も即時更新する。耐久ライン直近の自分属性／敵属性selectorは残している。

通常UIから次の説明文を削除した。

- 「複数の必殺技は、情報をまとめず技ごとに表示しています。」
- 「自分の属性は上の設定と同じ値です。敵の属性は被ダメージモードの手動敵設定を変更しません。」

複数必殺を技ごとに扱う計算仕様と、耐久ライン敵属性を被ダメージ用手動敵属性から独立させる内部仕様は変えていない。

## OneDrive→Pages保存移行の完全撤去

通常画面の移行案内、開始／完了／件数表示、確認導線を削除した。移行確認用page、bridge、target、Phase 7 prototypeも実行可能な現行成果物から削除した。削除した移行専用実行ファイルは10個、計413行／23,819 bytesである。さらにRC本体から、旧保存敵snapshotをruntimeへ変換する`loadedEnemy`分岐、旧移行先key、移行件数集計、移行済み保存形式の互換変換を除去した。

履歴文書は「当時prototypeを作って検証した」記録として削除していない。ただし冒頭に不採用の注意を付け、旧移行手順を現在の実装や実機確認へ使わないよう明記した。

## Pages内の通常保存

Pages候補の計算・UI状態は、旧版とは別の`dokkan_phase8_rc_pages_state_v1`へ次を保存する。

- 複数の状況cardと各入力値
- DEF、補正、軽減、ガード、属性、会心
- カスタム攻撃ATKと手動敵属性
- event／stage／enemy／attack選択
- 耐久ラインと耐久ライン専用敵属性
- theme

旧OneDrive key、廃止した旧移行先key、PAT、未知keyは読まず、削除・変更もしない。Pages内stateはversionと基本構造を検証し、壊れた場合は安全な初期状態へ戻す。旧`loadedEnemy`をPages stateへ混ぜても保存敵移行として扱わず、次回保存時に除外する回帰も追加した。

前回event、更新履歴、enemy releaseのknown-good／rollbackはPages自身の補助状態として従来どおり保持する。これらはOneDrive旧版からの保存移行ではない。

## 360px／390px実測

同じ初期耐久ライン画面を`scripts/measure-phase8-mobile-layout.mjs`で直前版と比較した。結果条件3項目を2か所へ追加したうえで、全体はわずかに短くなった。

| viewport | 項目 | 直前版 | 今回版 | 変化 |
| --- | --- | ---: | ---: | ---: |
| 360px／390px | page全高 | 1,470px | 1,462px | 8px短縮（約0.5%） |
| 360px／390px | 状況card | 952px | 943px | 9px短縮（約0.9%） |
| 360px／390px | card先頭～属性設定末尾 | 755px | 740px | 15px短縮（約2.0%） |
| 360px／390px | 入力・checkbox行の高さ | 40px | 40px | 操作領域を維持 |
| 360px／390px | 個別折りたたみ後のcard | 80px | 80px | 維持 |

両幅で会心補正入力は同じ行、結果条件3項目も同じ行に収まり、横overflowとsummary内overflowは0だった。

## テスト

通常の`npm test`は171件すべて成功した。failed 0、skipped 0である。

仕様外となったOneDrive→Pages移行試験を削除・置換したため、直前の177件から件数は減った。一方、今回の結果条件表示、即時更新、スマホ整列、移行UI／entry不在、生成済み単一HTMLからの移行コード不在、独立Pages保存、旧key／PAT非参照、壊れたPages stateの復旧を新しい回帰で固定した。

Chromium、WebKit、PC/mobile viewport、360px／390px、HTTP、単一HTMLの`file://`を含む。既存の計算、複数card、個別／一括開閉、custom攻撃、event chunk、manifest、update safety gate、atomic apply、known-good、rollback、production旧版browser試験も成功した。

## Gitとpreview

- branch: `codex/phase8-result-summary-no-migration-20260824`
- start tag: `phase8-result-summary-no-migration-start-2026-08-24`
- ready tag: `phase8-result-summary-no-migration-ready-2026-08-24`
- 再確認URLと手順: [Phase 8結果条件表示・保存移行撤去版 PC・スマホ再確認手順](phase8-result-summary-no-migration-recheck-checklist.md)

previewは架空3 event／3 enemyだけを使う固定tag版であり、本番Pagesではない。ownerの再確認が終わるまでPhase 9へ進まない。
