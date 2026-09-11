# Phase 11 限定Android実サイトゲート

準備日: 2026-09-10 JST。Android架空ゲートPASS後の、owner承認済み限定検証。

## 判断と範囲

ownerはTerms上の不確実性を理解したうえで、月に必要な新stage数ページ程度、各ページ本人の明示tap、個人端末内だけ、取得データの公開・再配布なし、明確な停止要請があれば停止という条件を確定した。background fetch/XHR、自動巡回、preload/prerender、自動retry、access restriction/CAPTCHA回避は行わない。これはsourceの許可確認ではない。今回成功しても恒常運用・formal source採用・production接続は別判断。

対象は **10周年！Anniversary Battle / event 1705** の表示順先頭3stageのみ（2件しか認識されなければ2件、2件未満なら停止）。開始URLは <https://jpnja.dokkaninfo.com/events/challenge/1705>。名称と複数stageの存在は既存2026-02-23保存eventのoffline確認に基づく。現行DOM・現在の掲載内容は未確認で、agentは実サイトへアクセスしていない。新eventへの掲載速度を測る試験ではない。

## 限定版

- 別ID `phase11-limited-live-review@sumiporon.invalid`。署名済みfixture版の保存状態とは別。
- 権限は `storage` とevent 1705およびそのstage pathだけ。全サイト、cookies、downloads、clipboard、webRequest権限は要求しない。
- ページに実在したリンクの先頭最大3件だけを計画にする。IDからstage URLを生成しない。4件目へ進まない。
- 1 sessionだけ開始できる。eventページへ戻っても別sessionや追加取得を開始しない。中断は元のstageタブで再開し、writer mismatch時だけ明示的に担当を移す。
- canonical/runtime、parser、required field、identity、validation、persistent draft write/read-back、batch受領は既存基盤を再利用。
- AOE attackKind不明は限定版のcontent/background両方で保存成功扱い前に停止。欠損・未対応DOMでも次へ進めない。任意fieldのunknown/unavailableを0へ置換しない。未知の現行layout全般を検証済みとは扱わない。
- reviewにHP、通常基準ATK、DEF、属性、必殺ごとの値・HP使用条件を表示。詳細にはcanonical（HP/DEF/AI/説明を保持）とruntime（計算用projection）を分けて表示する。通常基準ATKだけで条件適用後の全攻撃値まで保証しない。
- review受領までで終了。apply/export/production接続なし。元HTMLを永続保存しない。停止したstageは成功件数に含めない。
- 拡張が発行するsource通信はowner tapによる通常のtop-level遷移だけ。reviewのfetchは拡張同梱baseline JSON限定。サイト自身やFirefox自身の通常ページ読込・予測機能まで拡張で制御したと主張しない。

## 提出物・再生成

`npm run build:phase11-live-gate` で以下を生成する（すべてignored/internal）：

- `generated/phase11-one-tap/phase11-live-gate-amo-upload.zip`
- `generated/phase11-one-tap/phase11-live-gate-amo-reviewer-source.zip`
- `generated/phase11-one-tap/live-gate-test`（Chromium・架空ページ専用、AMOへ提出しない）

AMOで新しいself-distributed add-onとして提出し、source codeにreviewer source ZIPを選ぶ。署名済みXPIはownerのAMO操作で受領する。fixture用v2 ZIPの更新として提出しない。

## owner手順

1. 上記upload ZIPをAMOへself-distributedとして提出する。
2. source code uploadに上記reviewer source ZIPを選ぶ。
3. 承認後の署名済みXPIをAndroidへダウンロードし、前回と同じFirefoxの「ファイルから拡張機能をインストール」で導入する。署名前ZIPは導入しない。
4. Android Firefoxで上記eventリンクを開く。URL検索・コピー不要。
5. 下部に対象event名と「先頭3stageのみ検証」が表示されたら `開始` を1回押す。
6. stage 1の `draft保存済み / 1/3` を確認し、元ページのHP/ATK/DEF/属性/必殺の表示を目視する。`次のステージへ` を1回押す。
7. stage 2も同様に `2/3` を確認し、`次のステージへ` を1回押す。
8. stage 3の `3/3` を確認し、`計算画面で確認` を1回押す。
9. reviewの `received`、stage数、安全検査、警告/エラーと数値を照合する。必要なら「条件・AI・AOE・変換結果の詳細」を開く。今回の適用操作はない。
10. 成功したstage数・停止表示の有無・数値の不一致の有無を報告する。終了後は限定版拡張を無効化してよい（削除はdraftを失うので不要）。

途中で停止した場合は、その表示とstageを報告して終了する。`表示済みDOMを再解析` は読み込み待ちだった場合の任意の手動操作で、sourceへの通信・自動retryではない。CAPTCHA/アクセス制限や停止要請が出た場合は進めない。Firefox終了後のwriter担当移管は通常stage操作に加算しない。

## 検証の区別

2026-09-11 owner報告: event認識・開始は成功したが、stage 17050015は必殺技の使用条件不足でincomplete停止。draft未保存、次stageへ移動不可。安全停止はPASS、live変換・3stage完走は未達。後続の[表示済みDOM診断](phase11-stage-dom-diagnostic.md)と[限定inlineデータ診断](phase11-inline-data-diagnostic.md)でも、必殺技ごとの最大ATK/ターン値は取得できなかった。external script/API等は今回の境界外として探索を終了する。旧保存値、敵本体の回数、推測値による補完は行わず、stage 17050015は現行完全取込基準で不合格のままとする。

ローカル自動試験は架空DOMだけを使用し、4stageあるeventでも3stageで終了すること、tap前に次ページへ行かないこと、reviewの数値・複数必殺・条件、適用UI不在、再開始停止、ATK欠損・AOE種別不明で停止することを確認する。既存fixture回帰も実行する。AMO validatorとreviewer ZIPからの再build一致は提出物の確認であり、実DokkanInfoの正確性や利用許可の証明ではない。実サイト結果はowner報告後に追記する。

準備完了時の結果: 限定版ブラウザ試験3件成功、既存one-tap回帰10件成功。Mozilla `web-ext lint` errors/warnings/notices各0。reviewer ZIPを別フォルダへ展開し、Node 22.17.0 / npm 10.9.2で `npm ci --ignore-scripts` → `npm run build` に成功。再生成ZIPと提出ZIPの全7ファイルはSHA-256一致。source ZIPは38ファイルで、node_modules/Git/cache/生成済みコードを含まない。fixture v2提出ZIPのSHA-256は従前の `FF19D35C1025F731AA18F43DF4471A5E738BF3D938A2EDB8142D60F8D5282555` のまま。
