# 第6段階 完了報告

> 保存データ移行に関する部分は当時の設計・検証履歴です。ownerは後にOneDrive／local旧版→Pages移行を撤回しました。現在のRCはPagesを新規状態で開始し、OneDriveと保存データを移行・同期しません。この文書の移行手順は実装・実機確認に使わないでください。最新仕様は[Phase 8 結果条件表示・保存移行撤去 修正報告](phase8-result-summary-no-migration-report.md)を参照してください。

完了日: 2026-08-23（JST）

## 先に結論

第6段階の終了条件を満たした。特定siteに依存しないcanonical v2、計算用runtime、release manifest、candidate/stable/known-good、update safety gate、permission gate、source adapter contractをofflineで実装し、保存済みPhase 4候補5,032体で全件検証した。

本番アプリ、本番敵JSON、localStorage、更新UI、Pages、OneDrive、workflow、`main`は変更していない。DokkanStatsその他の外部data siteへ新規accessせず、問い合わせも送信していない。Phase 7には進んでいない。

## 初心者向け: 何を作ったか

敵データを「大切な元帳」と「計算画面へ持っていく軽いコピー」に分けた。

- **canonical v2**: 出典、ID、不明状態、複数必殺、AI、AOEまで失わない元帳候補
- **runtime projection**: 元帳から毎回同じ内容を作る、計算用の軽いコピー
- **manifest**: version、size、digest、件数、検証結果、戻り先を記した更新票
- **safety gate**: 壊れた更新や不自然な大量変更を自動停止する検査
- **permission gate**: 取得・変換・公開の許可を操作別に確認する検査
- **source adapter**: 将来の正式取得元を交換する接続口

通常のowner操作は増やしていない。将来の`敵データを更新`1操作の内部でこれらを動かすための基盤であり、本番ボタンはまだ実装していない。

詳細設計は[第6段階 source-neutral敵データ基盤](phase6-canonical-data-foundation.md)に保存した。

## canonical v2とruntimeを分ける理由

出典やAIを含むcanonicalは全件pretty JSONで87,118,325 bytesあり、端末へ毎回渡す用途には大きい。一方、現行計算に必要な情報へ絞ったruntimeはpretty 16,691,030 bytes、minified 6,048,874 bytesである。runtimeはcanonicalのpretty sizeの19.2%になった。

runtimeが省略した情報はcanonicalまたは取得材料に残るため、将来別の計算を追加しても元情報から作り直せる。runtimeからcanonicalへ逆変換する必要はない。

## PC・スマホ性能評価

このWindows PC上のChromiumでは、pretty runtimeのHTTP取得中央値が約164ms、parseが約48msだった。CPUを4倍遅くした390×844の参考測定では取得約565ms、parse約389msだった。

これはreal Android、iPhone、Safari、端末memoryの合格試験ではない。minifiedなら約6.05MB、gzip相当なら約223KBだが、展開後memoryは残る。そのためPhase 7では、full runtimeと`event index＋必要event chunk`を実機で比較することを推奨する。

`file://`から隣接JSONを`fetch()`する試験は失敗した。現在のOneDrive/local単一HTMLを維持する場合、JSON fetchを必須にせずscript data chunk等を比較する。PagesやViteをこの結果だけで採用していない。

実測は[performance report](../artifacts/phase6/performance-report.json)にある。

## 保存済みDokkanInfo候補の役割

Phase 4候補は最新の本番正本ではない。しかし、88 events、801 stages、1,352 encounters、5,032 enemiesに、4,924必殺、168 usage rules、1,679 AI actions、75 AOE、443 neutral enemiesを含む。

このため第6段階では、schema、adapter、projection、manifest、gateを現実的な規模で壊すためのoffline migration test materialとして使った。DokkanInfoを将来の正式取得元として採用したわけではない。新規network requestは0である。

## unknown / unavailable / zero

全件でknown zero 3,011 field、unknown 35,152 field、unavailable 20,340 fieldを別状態として保持した。不明値を0へせず、保存HTMLに表示されなかった値と未確認値も区別する。

会心の未確認値を勝手に補わず、明示された軽減率0等は既知0のまま保持した。

## 更新時の安全検査

将来の1操作更新では、最低限次を自動検査できる。

- canonical/runtime schema
- 実byteのdigestとmanifest digest
- generator成功
- combat enemyの必須ATK
- ID衝突とprovenance
- event/stage/enemyの異常減少
- ATK=0、属性欠損、ATK大量変更
- knownからunknownへの大量後退
- source snapshot時刻の後退
- permission ledger

20%以上の主要件数減少、combat ATK欠損、大量0、ID衝突等はhard failで適用しない。5%以上の減少や初回baseline不足はreview-requiredで止める。正常な新event大量追加はinformationalであり、追加だけを危険扱いしない。

今回の全件候補はhard fail 0だった。ただし比較可能なcanonical known-goodがまだないためreview-required 1であり、派生公開permissionもunknownなのでstable昇格は不可になった。これは意図した安全停止である。

## rollback

manifestは直前known-goodのdataset version、artifact digest、manifest digestを保持する。現在は現行production JSONのdigestをlegacy known-goodとして記録した。

内部状態は次の順で進む。

```text
candidate
  ↓ safety passed + review 0 + publish permission allowed
stable
  ↓ 実端末health check passed
known-good
```

いずれかに失敗すれば既存known-goodを維持する。ownerが毎回状態を選ぶUIにはしない。

## 取得元を後から変更できるか

できる構造にした。取得元固有値はadapterとsourceRefs/sourceSnapshotsへ隔離し、canonical/runtimeへDokkanStats専用必須fieldを入れていない。

ただし、異なる取得元のIDが自動で一致する保証はまだない。正式sourceのstable ID仕様が判明した時に、adapterまたはreview済みalias表で対応付ける。これは取得元変更時の限定作業であり、計算・manifest・gate全体の作り直しではない。

DokkanStatsが不許可、不十分、遅い場合も、別の正式feed/APIへadapterを差し替えられる。permission不明のsourceはfail closedで取得・公開しない。

## Phase 4の37,690 loss

旧形式へ戻した時の37,690 lossは解消のため旧JSONを肥大化させていない。旧形式は現行比較、preview、一時互換、migration verificationに限定した。

複数必殺、usage rule、AI、AOE、neutral、evidence等はcanonicalへ保持し、runtimeへ必要項目だけ一方向生成する。`requiredCalculationLosses`は0件である。

## Pages移行時の保存データ

[保存データ移行設計](phase6-saved-data-migration-design.md)に、次を整理した。

- キャラクター、全scenario、手動敵を含むsavedEnemies、未保存状態、theme、crit override、loadedEnemy snapshot、旧2/3階層を保持
- `dokkan_github_pat`は絶対に移行・exportしない
- 第一候補はlocal/OneDrive版からPages windowへnonce付き`postMessage`で渡す1回の移行
- 実機で不安定ならchecksum付きfile export/importをfallbackにする
- schema、digest、quota、途中失敗、二重import、rollbackをtestする

これは設計だけであり、localStorageやUIを変更していない。移行画面・手順は実装前にownerへ相談する。

## hybrid案

Pages-primary＋OneDrive-known-good backupは技術的に比較可能である。ただし現時点で採用していない。

[実機比較設計](phase6-hybrid-hosting-comparison-design.md)にPC、Android、iPhoneで、起動、更新、offline、保存、rollback、手間を同じ手順で比較するchecklistと合格基準を保存した。

OneDriveは現在動くrouteとして強い一方、外部JSON fetchに弱い。Pagesは更新に向く一方、offlineと初回保存移行を解決する必要がある。hybridは自動failoverではなく、Pages障害時に既知のlocal HTMLを開けるbackup候補である。

## DokkanStats問い合わせ

[送信可能な最終英語版と初心者向け送信手順](phase6-dokkanstats-inquiry-final.md)を用意した。

- 推奨宛先: `contact@dokkanstats.com`
- 代替: 公式Contact form
- 長文なのでemail推奨
- Codexは送信していない

返信を受けたら全文を公開repository外へ保存し、取得前にpermission ledgerへ操作別に反映する。曖昧な許可をallowedと解釈しない。

## test結果

通常入口は従来どおり次だけでよい。

```text
npm ci
npm test
```

第6段階では14件を追加した。canonical/runtime/manifest/permission schema、determinism、adapter contract、manual correction対応、known zero/unknown/unavailable、複数必殺、usage rule、neutral、AOE、AI、digest/version、全safety gate、permission、known-good遷移を検査する。

Phase 4の最重テストは、保存HTMLを1回解析した5,032体候補をそのままPhase 6へ渡し、追跡manifest/report/代表fixtureとbyte一致することも確認する。最終`npm test`は既存108件を含む**122件すべて成功**である。

## Gitとcheckpoint

- branch: `codex/phase6-canonical-data-foundation-20260823`
- 開始tag: `phase6-start-2026-08-23`（Phase 5完了`e44a035`）
- 恒久方針commit: `fe87a53 docs: record approved Phase 6 product direction`
- 基盤checkpoint: `44f49c5 feat: build Phase 6 canonical data foundation`
- 完了tag: `phase6-complete-2026-08-23`

最終report/test checkpointは完了tagが指すcommitである。branchとtagをremoteへpushし、`main`へmergeしない。

## 本番へ影響がないこと

- `main`未変更・未merge
- production enemy data未変更
- `dokkan_calc_final.html/js/css`未変更
- localStorage未変更
- Pages未公開・通常URL未変更
- OneDrive未変更
- workflow/schedule未再開
- PAT code未変更・credential未追加
- DokkanStats/DokkanDB/DokkanInfo liveへ新規自動accessなし
- 問い合わせ未送信

full生成物はignored `generated/phase6/`だけに置き、productionから読まない。

## Viteの結論

第6段階はViteなし、TypeScript compilerとNodeだけで実装・検証できた。よって今すぐViteへ移行する必要はない。Phase 7のbrowser prototypeで、asset hash、module、chunk管理が単純script方式より明確に安全・簡単になる場合だけ再評価する。

## Phase 7で推奨する順序

1. ownerがDokkanStats問い合わせを送る。回答までは外部取得を始めない。
2. productionと分離した架空/既知fixture prototypeで、minified full runtimeとevent chunkをPC/Android/iPhone比較する。
3. OneDrive/local script chunk、Pages HTTP、hybrid backupを同じchecklistで比較する。
4. canonical初回known-goodを作るreview手順と、manifest/digestの実byte検証を更新prototypeへ接続する。
5. 許可回答が明確なら、許可範囲内の少数sample adapter pilotを行う。coverage・freshness・ID・欠損stateが合わなければ採用しない。
6. owner承認後だけ、保存データ移行prototypeと1操作更新UIを実装する。

問い合わせ回答を待つ間でも、2～4の完全offline prototypeは進められる。ただしPhase 7開始はownerの確認後である。

## Phase 7前にownerが判断するアプリ仕様

既に確定している大枠は、初期更新1操作、正常時は自動検査して適用、異常時だけ停止、将来0操作である。

次はまだowner判断が必要で、実装前に相談する。

- 更新ボタンの場所
- 更新中、完了、異常停止の画面と文言
- 自動確認・0操作更新をいつ有効にするか
- full runtimeとevent chunkの実機体感
- Pagesを正式な普段使いにするか
- OneDriveを通常版またはknown-good backupとしてどう残すか
- 保存データ移行UIとfallback手順
- offlineをどの程度必須にするか
- 通常画面にversion、source、更新時刻等をどこまで表示するか

第6段階はここで停止する。
