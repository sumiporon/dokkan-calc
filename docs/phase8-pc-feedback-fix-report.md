# Phase 8 PC実機フィードバック修正報告

作成日: 2026-08-24（JST）

## 位置づけ

これはPhase 9ではなく、`phase8-complete-2026-08-24`をrollback pointとして行ったPhase 8 release candidateのPC再確認修正である。現在の`main`、公開Pages、OneDrive版、production敵データ、production workflow、外部取得は変更しない。Android／iPhone実機確認はownerのPC再確認合格後まで保留する。

## 「完封DEF」矛盾の原因と修正

旧RCは`calculateSafeDurabilityLine(0, calculation)`の返り値を「この攻撃を完封するDEF目安」と表示していた。この関数は、**現在のDEFを前提に、被ダメージ0まで耐えられる敵ATK**を逆算するproductionの耐久ライン関数である。敵ATKを引数に取らない値をDEFと誤表示したため、表示最終DEFが目安より大きいのに被ダメージが残る矛盾が起きた。

修正版は、選択攻撃の敵ATK、会心ATK補正、属性補正、軽減、安全側乱数1.03を掛け、会心時DEF補正で割った最小の表示DEFを`calculateRequiredDefenseForZeroDamage()`で求める。全属性ガードは属性補正を変えるため反映し、通常のガード0.5は減算・0 clamp後に掛かるため0境界そのものには掛けない。属性防御Lvは自然有利時の属性補正に入る。結果は切り上げ、表示最終DEFと同じ段階の値にした。

次の不変条件をunit/browserの両方で固定した。

```text
表示最終DEF >= 「被ダメージ0に必要なDEF」
  ⇒ 同じ攻撃・属性・ガード・属性防御・軽減・会心条件の最大乱数1.03でも被ダメージ0
```

旧関数は誤りではなく耐久ラインに必要なので削除せず、「敵ATKを求める関数」として分離して使い続ける。

## PCフィードバック反映

- 起動時は「耐久ライン」。被ダメージ計算へradioで切り替える。
- 耐久ラインは敵を選ばず、自分と同じ属性・同じクラスの相性、安全側1.03で計算する。
- productionと同じ初期ライン「完封」「70万」、最大4件の追加・削除を復元した。
- DEF、各パッシブ、追加DEF、軽減、属性、属性防御、ガード、会心、敵、攻撃、敵条件の変更を自動再計算する。「今すぐ再計算」は補助であり必須ではない。
- 数値欄の`044`／`012`を入力中に`44`／`12`へ正規化する。`0`、空欄、小数、負数、pasteを壊さず、初期0へfocusした時は全選択する。
- メモリー、リンク、必殺技効果、フィールド、アクティブ、サポートアイテムを折りたたまず常時表示する。
- 自分の属性と属性防御Lvを同じ「属性・防御設定」に隣接配置した。
- enumの`super`／`agl`等を通常画面へ出さず、`超速`、`極体`、`中立（知属性）`のように表示する。
- 結果欄にも`自分：超技`／`敵：超速`のように表示する。
- 敵の基礎ATKは通常画面から除外した。
- 敵は起動時・event選択直後とも未選択。結果は「敵を選択してください」とする。前回eventは復元するが敵を勝手に決めない。
- 固定攻撃は1値、条件で変わる攻撃は実在するturn／被弾／HP状態を列挙した最小～最大で表示する。turnとappearanceは同じturn軸で評価し、成立しない組合せを作らない。
- 通常、必殺後通常、必殺、AOEを区別する。複数必殺は1範囲へ混ぜず、技名ごとに別行で表示する。
- production互換の手動敵ATK（万）＋敵クラス／属性を任意入力として復元した。空欄なら敵未選択案内を維持する。
- 360px／390pxでは主要数値欄を2列、余白・gapを縮小し、44px相当のtap targetと横overflowなしを維持する。

## 保存キャラクター・状況・preview

production v22の意味を維持し、保存キャラクターを複数作成・切替・削除できる。1キャラクター内の状況カードは追加・複製・削除でき、作業中状況を自動保存する。旧v22から移した`loadedEnemy`付きscenarioもlegacy敵をruntime形へ一時変換して計算できる。RCで新規選択した敵はevent/stage/enemy/attackの安定IDを追加fieldとして持ち、既存fieldを壊さない。

一覧previewには全状況の最終DEF、軽減、全属性ガード、耐久ラインを出す。productionの画像生成専用機能と完全に同じ実装ではないが、日常確認用previewを失わない。

## 保存データ移行の説明

架空移行は次の内容を実際に移す。

- 保存キャラクター: 2件（架空の保存キャラクターA・B）
- 保存済み状況: 2件
- 作業中の状況: 1件
- 手動保存した敵: 1件
- 設定: 2分類（耐久ライン・配色）
- 会心補正: 1件
- GitHub PAT: 0件、非移行
- イベント・ステージ・配布敵データ: 増加0件

移行元、移行先、通常RCの設定欄の全てに、目的、件数、代表名、PAT除外、敵dataが増えないことを表示する。通常RCを開き、「キャラクター管理」で架空名を選んで読み込むことを成功確認手順として案内する。

## productionとのユーザー向けfeature parity監査

| 日常機能 | 修正前RC | 修正後RC | 判定 |
| --- | --- | --- | --- |
| 耐久ラインdefault／custom line | 欠落 | 復元 | parity |
| 被ダメージmode | あり・button必須 | 自動計算で復元 | 改善 |
| 基本DEF／全追加DEF／軽減 | 追加DEFが折りたたみ | 常時表示 | parity |
| 属性／属性防御／全属性ガード | 離れていた | 隣接 | 改善 |
| 会心補正と未設定警告 | 欠落 | 復元 | parity |
| 敵選択／前回event | 敵を自動選択 | eventだけ復元、敵は未選択 | owner決定どおり |
| dynamic条件／通常・必殺・AOE | 単一値だけ | 有効状態range＋個別必殺 | 改善 |
| 手動敵ATK | 欠落 | 復元 | parity |
| 保存character複数管理 | 欠落 | v22互換で復元 | parity |
| 状況card追加／複製／削除 | 欠落 | 復元 | parity |
| 作業中状況の自動保存 | 欠落 | 復元 | parity |
| 一覧preview | 欠落 | 復元 | 日常確認parity |
| theme | あり | 維持 | parity |
| 敵data 1操作更新／rollback | あり | 維持 | parity |

次はproductionに残して分類したが、Phase 8公開RCへは移植しない。

- 手動敵の作成・編集・削除、DokkanInfo fetch、Chrome extension: source policy未解決のlegacy。削除せずproductionに保存する。
- browser PAT保存／GitHub同期: sensitive legacy。Pages RCと敵更新には不要で、移行allowlistから除外する。
- card並べ替え、全展開／全折りたたみ、画像生成向け選択overlay: 計算・保存・previewの合否を妨げない補助操作。productionには残し、今回のPC blockerからは除外する。

この分類は機能を削除する承認ではない。productionは変更しておらず、正式移行時にはownerの利用実態と再比較する。

## Phase 8安全基盤の回帰

event chunk、manifest、size/digest、runtime schema、件数急減・app互換gate、atomic apply、health check、active／known-good、2世代保持、rollback、cache破損復旧、migration allowlist、移行前後validation、PAT除外、単一HTML fallbackを同じtestで維持する。fixtureは架空3 event／3 enemyのままで、dynamic条件・複数必殺・AOEを持つ架空敵を追加したがevent/stage/enemy件数は増やしていない。

最終`npm test`は**172件成功、failed 0、skipped 0**。Phase 8初回完了時の161件を全て維持し、0ダメージDEF、先頭0、日本語表示、有効状態range、必殺ごとのHP usage rule、移行summary、自動計算、敵未選択、複数状況、360px等の11件を追加した。Chromium、WebKit、HTTP、`file://`、production本体12件を含む。

## Gitとpreview

- branch: `codex/phase8-pc-feedback-fixes-20260824`
- rollback tag: `phase8-complete-2026-08-24`（変更なし）
- feedback start tag: `phase8-pc-feedback-start-2026-08-24`
- corrected preview tag: `phase8-pc-recheck-ready-2026-08-24`
- diagnostic tag: `phase8-pc-feedback-fixed-2026-08-24`（旧release pathのCDN cache混在を安全gateが検出したためPC確認には使わない。履歴をforce変更せず保存）
- PC再確認URLと短い手順: [Phase 8修正版 PC再確認手順](phase8-pc-recheck-checklist.md)

## 停止条件

修正版をcommit、tag、branch pushし、PC再確認用previewを用意した時点で停止する。ownerのPC合格前にAndroid／iPhone確認やPhase 9へ進まない。
