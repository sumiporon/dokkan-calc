# Phase 8 最終実機フィードバック修正報告

作成日: 2026-08-24（JST）

## 位置づけ

これはownerのPC・スマートフォン再確認で残った3点だけを直したPhase 8の最終実機フィードバック対応である。Phase 9には進んでいない。`main`、本番Pages、OneDrive本番版、production敵データ／workflow、外部取得、0操作更新は変更していない。

## ダメージ軽減率の表示順

「ダメージ軽減率」をDEF設定の前半から外し、属性・防御設定内の末尾へ移動した。クラス／属性、属性防御Lv／全属性ガード、敵の会心、会心ATK補正／DEF低下の後に表示される。

同じ入力要素を移動しただけで、保存key、値、計算式、入力event、自動再計算は変更していない。45%を入力して計算・自動保存・再読込したbrowser回帰で、値と結果が維持されることを確認した。

## 全体攻撃が未選択になる原因と修正

全体攻撃の選択値は`area:<攻撃ID>:<対象>`で、対象は`first`または`additional`である。架空イベント・森の攻撃ID自体にも`:`が含まれるが、従来は選択値全体を`:`で分割して固定位置だけを読んでいた。このため攻撃IDが途中で切れ、runtimeの攻撃と一致せず、選択後も未選択として扱われていた。

修正後は末尾の対象だけを構造として認識し、その手前を丸ごと攻撃IDとして保持する共通parser／creatorを使う。特定イベント名による例外処理ではないため、同じ形式の全体攻撃IDでも再発しない。

架空イベント・森では次を確認した。

- 最初の対象: 基礎60万に現在のturn条件を反映した72万ATKを選択・自動計算する。
- 追加対象: 基礎45万に同条件を反映した54万ATKを選択・自動計算する。
- 最終DEF、軽減17%、全属性ガード、属性防御Lv5、敵会心とATK／DEF補正を同時に反映する。
- 選択値をPages内stateへ保存し、再読込後も同じ対象と被ダメージ結果を復元する。
- 通常、必殺A、HP条件付き必殺B、カスタム攻撃にも回帰がない。

## スマホの攻撃力範囲

攻撃名と数値範囲を別要素として扱い、`1,500,000～2,500,000`のようなmin～max部分だけを`nowrap`にした。攻撃名は必要なら先に折り返せる。極端に長い数値だけは範囲部分を横方向に内部scrollできるfallbackとし、文字を極端に縮めず、page全体の横overflowを防ぐ。

架空イベント・森で通常、複数必殺、全体攻撃を含む4つの範囲を360px／390pxで検査し、すべて1 visual line、範囲内overflow 0、page横overflowなしだった。

## 360px／390px実測

`scripts/measure-phase8-mobile-layout.mjs`で初期耐久画面と被ダメージ側を測定した。

| viewport | page全高 | 状況card | card先頭～DEF設定末尾 | 攻撃範囲 | 横overflow |
| --- | ---: | ---: | ---: | ---: | --- |
| 360px | 1,462px | 943px | 740px | 4件すべて1行 | なし |
| 390px | 1,462px | 943px | 740px | 4件すべて1行 | なし |

ダメージ軽減率の移動は同一card内の表示順変更なので、直前版からpage高、card高、DEF設定末尾位置を増やしていない。

## テスト

通常の`npm test`は**173件すべて成功、failed 0、skipped 0**だった。

追加・更新した回帰には、colonを含む全体攻撃ID、最初／追加対象の正しいATK、選択・自動計算・保存復元、通常／複数必殺／custom攻撃、ダメージ軽減率の末尾順・保存・計算、360px／390pxの範囲nowrap・label折返し・横overflowを含む。Chromium、WebKit、PC/mobile、HTTP、単一HTMLの`file://`、production旧版browser試験も成功した。

## Gitとpreview

- branch: `codex/phase8-final-device-feedback-20260824`
- start tag: `phase8-final-device-feedback-start-2026-08-24`
- ready tag: `phase8-final-device-feedback-ready-2026-08-24`
- 再確認URLと手順: [Phase 8最終修正版 PC・スマホ再確認手順](phase8-final-device-feedback-recheck-checklist.md)

previewは架空3 event／3 enemyだけを使う固定tag版であり、本番Pagesではない。ownerの再確認が終わるまでPhase 9へ進まない。
