# Phase 8追加修正版 PC・スマホ再確認手順

> 保存データ移行に関する部分は当時の設計・検証履歴です。ownerは後にOneDrive／local旧版→Pages移行を撤回しました。現在のRCはPagesを新規状態で開始し、OneDriveと保存データを移行・同期しません。この文書の移行手順は実装・実機確認に使わないでください。最新仕様は[Phase 8 結果条件表示・保存移行撤去 修正報告](phase8-result-summary-no-migration-report.md)を参照してください。

作成日: 2026-08-24（JST）

## 再確認URL

通常画面:

`https://raw.githack.com/sumiporon/dokkan-calc/phase8-additional-feedback-ready-2026-08-24/release-candidate/phase8/index.html`

架空保存データ移行:

`https://raw.githack.com/sumiporon/dokkan-calc/phase8-additional-feedback-ready-2026-08-24/release-candidate/phase8/migration-device-check.html`

初回だけgithackの確認画面が出た場合は、URLが上記と一致することを確認して`Open the page`を押す。正式Pagesではなく、固定tag上の架空3 event／3 enemyだけを表示する確認版である。本番Pages、OneDrive版、本番保存データは変更しない。

## 短い確認手順

1. スマホで開き、主要入力が2列で、横にはみ出さず、前版より縦に短いことを確認する。
2. 「キャラクター管理」の見出しと、状況cardの「閉じる／開く」を操作する。閉じたあと開いても入力と結果が同じことを確認する。
3. 耐久ライン直前の「自分の属性」「敵の属性」をそれぞれ変更し、結果がbuttonなしで変わることを確認する。自分属性は上の本体設定と同期し、敵属性は独立する。
4. 被ダメージ計算へ切り替え、保存敵を選ぶ。「カスタム攻撃を手入力」でATKを入れ、「計算する攻撃」に`カスタム攻撃`が増えることを確認する。
5. `カスタム攻撃`を選び、入力ATKを変えると被ダメージが即座に変わることを確認する。
6. 通常画面に「被ダメージ0に必要なDEF」と「今すぐ再計算」がないことを確認する。
7. 状況cardを閉じたままキャラクター保存し、再読込後も入力・複数状況が残ることを確認する。
8. 自動計算、先頭0除去、日本語属性、敵未選択、複数必殺／AOE、一覧preview、保存移行が前版どおり動くことを短く確認する。

異常があれば、PC／Android／iPhoneのどれか、手順番号、入力値、表示結果を知らせる。確認完了まではPhase 9へ進まない。
