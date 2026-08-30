# Phase 9 GitHub Pages正式版

作成日: 2026-08-30

## 結論

ownerがPC・Androidで承認した`phase8-type-card-alignment-ready-2026-08-25`（`847951c`）を基礎に、GitHub Pages rootを普段使いの正式版へ切り替える。Phase 8の画面・計算仕様は再設計せず、正式root、既存production敵データ、production用manifest、安定したPages内保存namespaceだけを接続した。

旧OneDrive版は変更せず、独立した旧known-good／offline backupとして残す。OneDriveとPagesの保存内容をimport・同期・逆同期する機能はない。

## 中断からの復元

Phase 9再開時にGit、remote、正式Pagesを読み取り確認した。

- 作業branch: `codex/phase9-production-20260825`
- 開始点: owner承認済みPhase 8 commit `847951c`
- 中断前に完了していたもの: Phase 9 branch作成とproduction rollback tag作成・pushだけ
- 中断前に未実施だったもの: Phase 9実装commit、branch push、main更新、Pages deployment、正式URL smoke
- rollback tag: `phase9-production-rollback-2026-08-25`
- rollback先: 旧production main `3ca5383`

不明なcommit、別worktree、staged変更、二重deploymentはなく、未コミット成果を保持して続きから再開した。reset、clean、force push、history rewriteは行っていない。

## 正式アプリ

- root `index.html`を正式入口にした。
- 承認済みの`release-candidate/phase8/app.css`と`app.mjs`を共用し、`data-app-environment="production"`だけで正式用validator・保存領域・cache・known-goodを選ぶ。
- 確認版badge、架空データnotice、raw.githack依存、キャラクター管理、保存移行、PAT入力を正式rootに含めない。
- GitHub Pages URLを直接開くだけで利用できる。Vite、React、backend、GitHub login、PowerShellは不要である。
- 敵データはevent indexを先に読み、選んだevent chunkだけを取得する。full runtimeは1操作更新の全件検証に使う。

## production敵データ

Phase 9は外部サイトへアクセスせず、旧productionと同じrepo内正本だけを入力にする。

- source: `scraper/all_enemies.json`
- source SHA-256: `f1cb27a2e5cae9627be61934aaabec79e4af0b42d3e21ad0cc7945eb6d7a0b40`
- 旧app埋込presetとの比較: 完全一致
- event種別: 56
- series: 73
- stage／encounter: 647
- enemy: 4,245
- attack: 8,899
- 通常攻撃完全照合: 4,245
- 必殺攻撃完全照合: 4,245
- 必殺後通常攻撃完全照合: 409
- source audit error: 0

専用adapterは旧データの保存値を直接runtimeへ写し、必殺値や欠損値を別sourceから推測しない。旧データに永続IDがないため、event名、series名、stage名、enemy名と同名重複ordinalから安定IDを生成する。無関係なevent／series／stage／enemy挿入で既存IDが変わらない回帰を追加した。

Phase 8 previewの架空3 eventと、保存HTML由来の未許可5,032 enemy candidateは正式`data/`へ含めない。manifestはこれらが混入した場合に拒否する。

### 既存productionデータの限界

旧production正本にはAOE値が0件である。そのため正式版に架空AOEを足さず、production実データ上にはAOE選択肢がない。AOEのfirst／additional対象、colonを含むID、選択・計算・保存の実装回帰はPhase 8の公開可能な架空fixtureで引き続き検証する。実AOE coverageは許可済みの新sourceが得られた後の課題である。

旧正本にはsource ID、敵DEF、完全な特殊効果がないrecordもある。Phase 9の計算に必要な通常／必殺ATK、属性、超極、既存条件は保持するが、存在しない値は生成しない。

## release・更新安全性

`scripts/generate-phase9-production.mjs`が同じ入力から次を決定生成する。

- `data/release-manifest.json`
- 56 eventのindex／JSON chunk
- 更新検証用minified full runtime
- `artifacts/phase9/production-release-report.json`

manifest、runtime、event index、全artifactについてschema、件数、byte size、SHA-256 digest、dataset version、app互換性を検査する。production activation、既存production baseline、外部通信0、synthetic/candidate不使用が同時に成立しなければ正式clientは受け入れない。

`敵データを更新`は利用者が押した時だけ実行する。同じreleaseならdownloadを増やさず「すでに最新です」と表示する。将来の新releaseはfull runtime検証、件数急減gate、health check後だけatomicにknown-good化し、失敗時は直前releaseへ戻す。browser PATは不要で、0操作startup updateは無効である。

## Pages内保存

正式Pagesは`dokkan_calc_pages_state_v1`へ、複数Scenario、通常入力、manual enemy／custom attack、会心、耐久ライン、themeを保存する。前回event、敵release、cache、更新履歴もproduction専用namespaceを使う。

旧`dokkan_calc_data_v22`、廃止したimport key、PAT、未知keyは読まず、変更・削除もしない。初回はfresh stateで始まり、2回目以降はPages自身の状態を復元する。

## 検証

全`npm test`は189件成功、failed 0、skipped 0だった。Phase 8終了時の176件をすべて維持し、Phase 9のdata 5件・browser 8件を追加した。

実描画範囲:

- Chromium desktop
- Chromium 360px／390px
- WebKit 360px／390px
- 正式rootの初回表示、56 event、敵選択、通常／必殺／custom攻撃
- 耐久ライン、属性同期／独立敵属性、追加DEF、軽減、guard、会心折りたたみ
- 複数card、個別／一括開閉、Pages内autosave、reload restore
- 1操作更新のalready-currentとknown-good
- horizontal overflowなし
- console error、page error、request failure、HTTP 4xx/5xxなし

production AOEは前述のとおりsource 0件であり、架空データを正式版へ混ぜない境界と既存AOE fixture回帰を分けて確認した。

## deploymentとrollback

GitHub Pagesはrepositoryの`main` rootから動的`pages-build-deployment`で公開する。Phase 9 branchをcommit・pushし、remote mainがPhase 9開始時の`3ca5383`から動いていないことを再確認してからfast-forwardする。release tagは完成commitへ付ける。

重大な起動、計算、データ、保存、asset、mobile、deployment障害があれば、`phase9-production-rollback-2026-08-25`が指す`3ca5383`へmainを通常のrevert／fast-forward可能な復旧commitで戻す。force pushは使わない。

## Phase 10以降へ残すこと

- DokkanStatsの書面回答をownerから受け取り、操作単位のpermissionを再評価する。返信なしは許可ではない。
- 許可・coverage・鮮度を満たすsource adapterと継続更新candidate pipelineを別phaseで設計する。
- 実データのAOE、複数必殺、AI、会心、source ID、evidence coverageを改善する。
- 0操作更新はpermission、pilot、成功率、鮮度、rollback drill、owner承認が揃うまで有効にしない。
- OneDrive旧known-good版をPagesへ同期・自動更新しない。

Phase 9完了後はowner確認で停止し、Phase 10を自動開始しない。
