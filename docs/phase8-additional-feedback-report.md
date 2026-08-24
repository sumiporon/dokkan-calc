# Phase 8 追加実機フィードバック修正報告

> この文書は当時の修正履歴です。その後ownerが「キャラクター管理」UIの削除を決定しました。現在の仕様と再確認先は[キャラクター管理UI削除・一括開閉 修正報告](phase8-management-removal-report.md)を参照してください。

作成日: 2026-08-24（JST）

## 位置づけ

`phase8-pc-recheck-ready-v2-2026-08-24`を復元点としたPhase 8内の追加修正である。Phase 9、`main`、本番Pages、OneDrive本番版、production敵データ／workflow、外部取得、0操作更新は変更しない。

## スマホcompact化

360px／390pxでは、主要入力を2列のまま維持し、入力高を44pxから40pxへ、card余白、section間隔、label間隔、button、status、見出し、結果boxを縮小した。計算モードと状況追加を横並びにし、被ダメージ結果を2列化し、360pxでも状況headerを1行にした。文字入力はiPhoneの意図しないzoomを避けるため16pxを維持する。

同じ初期耐久ライン画面を自動計測した結果は次のとおり。横overflowは両幅ともない。

| viewport | 項目 | 前版 | 追加修正版 | 短縮 |
| --- | --- | ---: | ---: | ---: |
| 360px | page全高 | 2,640px | 1,713px | 35.1% |
| 360px | 状況card | 1,210px | 952px | 21.3% |
| 360px | card先頭～属性設定末尾 | 991px | 755px | 23.8% |
| 390px | page全高 | 2,486px | 1,713px | 31.1% |
| 390px | 状況card | 1,163px | 952px | 18.1% |
| 390px | card先頭～属性設定末尾 | 944px | 755px | 20.0% |

状況cardを閉じるとcard高は80pxとなり、1cardの確認画面は900px viewport内へ収まる。計測は`scripts/measure-phase8-mobile-layout.mjs`で再実行できる。

## カスタム攻撃

「カスタム攻撃を手入力」で敵ATK（万）を入れると、敵を選んでいても「計算する攻撃」に`カスタム攻撃 1,234,500`のような候補が追加される。これを選ぶと、入力したATKと同じ欄の敵クラス／属性で自動計算する。保存敵の通常、必殺、必殺後通常、AOEは従来どおり同じselectに残る。保存敵が未選択なら、カスタム攻撃を唯一の候補として自動選択する。

## 耐久ライン属性

耐久ライン結果の直前に、日本語10属性から選べる「自分の属性（本体と同期）」と「敵の属性（耐久ライン専用）」を追加した。

- 自分属性は同じScenarioの本体`own_class`／`own_type`と双方向同期する。どちらから変えても同じ1つの設定であり、即時再計算する。
- 敵属性は耐久ラインだけに使用し、被ダメージmodeの手動敵設定や保存敵を変更しない。
- 旧RC保存はversion 2へ互換移行し、敵属性を従来どおり自分と同クラス・同属性で初期化する。

## UI削除とcard開閉

通常画面から「被ダメージ0に必要なDEF」と「今すぐ再計算」を削除した。0ダメージDEFの計算関数と不変条件unit testは維持する。全入力の自動再計算も維持する。

キャラクター管理は見出し、各状況cardはheaderの「閉じる／開く」で折りたためる。状況card bodyを隠すだけなのでDOM上の入力、計算、作業中保存、キャラクター保存は変化しない。開閉状態自体は保存せず、再読込時は従来どおり開いた状態から始まる。

## 回帰と安全基盤

既存172件を維持し、カスタム攻撃、耐久属性同期／独立変更、RC保存version 2移行、card開閉／保存の4件を追加した。最終`npm test`は176件成功、failed 0、skipped 0。Chromium、WebKit、HTTP、`file://`、production本体、360px／390pxを含む。

event chunk、manifest、digest、schema、update safety gate、atomic apply、known-good、rollback、保存移行allowlist、PAT非移行は変更せず回帰試験を通した。production localStorage keyと本番敵データも変更しない。

## Gitとpreview

- branch: `codex/phase8-additional-feedback-20260824`
- rollback tag: `phase8-pc-recheck-ready-v2-2026-08-24`
- additional feedback start tag: `phase8-additional-feedback-start-2026-08-24`
- corrected preview tag: `phase8-additional-feedback-ready-2026-08-24`
- 再確認URLと手順: [Phase 8追加修正版 PC・スマホ再確認手順](phase8-additional-recheck-checklist.md)

修正版をcommit、tag、branch pushし、固定tagのpreviewを遠隔確認した時点で停止する。ownerの確認前にPhase 9へ進まない。
