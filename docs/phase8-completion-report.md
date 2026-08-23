# 第8段階 完了報告

作成日: 2026-08-24（JST）

## 完了判定

Phase 8の終了条件を満たした。Phase 7までのprototypeを、本番と分離したPages向けrelease candidateへ統合した。event chunk、前回event、1操作更新、digest/schema/safety/app互換gate、atomic apply、2世代known-good、rollback、保存データ1回移行、PAT除外、OneDrive backup設計、PC/mobile/WebKit自動試験、架空dataの実機previewを用意した。

`main`、`origin/main`、現在の公開Pages root、現在のOneDrive file、本番敵JSON、本番localStorage reader/writer、production workflowは変更していない。外部data siteへ接続せず、0操作更新も有効化していない。Phase 9には進んでいない。

## 今回実装したもの

- `release-candidate/phase8/`の独立した通常計算画面
- version付きrelease path、manifest、event index、event JSON chunk、full runtime
- byte size＋SHA-256 digest付きbrowser cache
- 初回event未選択と前回event復元
- 設定・データ欄の「敵データを更新」
- full candidateによる本番相当の1操作更新検査
- IndexedDBのatomic active/known-good保存、最大2世代保持
- download、digest、schema、件数急減、互換性、apply、health失敗の拒否・rollback
- cache、active、known-good破損・欠損からの復旧
- allowlist＋checksum＋移行前後validation＋backup/rollback付き保存データ移行
- `file://` message originの正規化、nonce、opener、origin照合
- 架空dataだけの公開可能previewと単一HTML fallback
- OneDrive known-goodの具体的な昇格・保持・復旧手順
- Chromium desktop/mobile、WebKit desktop/mobile、touch、narrow width、`file://`自動試験

## Pages向け構成の到達点

将来Pagesを普段使いにする内部構成はrelease candidateとして完成した。起動時は約50KBのevent indexだけを読み、初回はeventを選ぶ。2回目以降は前回eventが残っていれば、そのchunkだけを自動で読む。利用者はchunkを意識せず普通のevent選択として使える。

正式Pages rootはまだ旧版のままである。Phase 8の公開previewはcompletion tag上の架空dataを第三者のraw.githack経由で表示する一時経路で、正式運用先ではない。実data由来の5,032敵releaseは`existing-data-internal-only`としてGit追跡・公開から除外した。

## 前回event

正常な前回IDは起動時に復元する。初回、削除済みID、ID変更相当、壊れたJSON、旧raw文字列形式を試験した。復元できなければ技術的なerrorを出さず、event未選択へ戻る。

## 更新buttonと内部処理

buttonは通常計算を邪魔しない「設定・データ」内に置いた。1回押すとmanifest、version、full candidate、size、digest、schema、件数、app互換性を検査し、memory上で適用した後にevent indexを読むhealth checkを行う。全て成功した時だけIndexedDBのactive/known-goodを同一transactionで保存する。

成功時は「敵データを更新しました」、同じ版なら「すでに最新です」とだけ表示する。異常時は適用せず、「現在の敵データはそのまま安全に使える」と表示する。

0操作経路はない。利用者の操作は引き続き1 buttonである。履歴は秘密を含まないstatus/code/version/時間だけを50件まで持つ。

## 異常停止とrollback

次をrelease candidateの同じengineで検証した。

- download欠損
- size／digest不一致
- runtime schema不正・event ID重複
- 20%を超える大量削除
- app非互換manifest
- active pointer切替途中の失敗
- health checkでindexが壊れている場合
- browser cache破損
- active/known-good release破損・欠損

更新前のactive/known-goodを壊した試験はない。apply/health失敗ではmemory pointerを直前へ戻し、永続pointerは書かない。成功後の最新release自体を壊した試験では、保持していた直前releaseへ次回起動時に戻った。known-good recordを欠損させても同じ復旧を確認した。

## 保存データ移行とPAT

release candidateの実装は、現在版側の1 buttonからPages targetを開き、そのまま保存データを渡せる。Windows Chromiumで`file://`移行元→HTTP移行先を実際に操作し、元dataを保持したままRC専用namespaceへ移った。

移行対象は`dokkan_calc_data_v22`と`dokkan_crit_overrides`だけである。保存キャラクター、scenario、手動敵、耐久line、theme、未保存状態、legacy snapshotを値ごと保持する。GitHub PATと未知keyはpackageに入らず、URLやserverにも載らない。途中writeは全rollbackする。

ただし現在使っているproduction HTMLへbuttonを挿入していないため、ownerの本物の保存値を移す本番導線はまだ有効化していない。Phase 8 previewでは同じ通信経路を架空packageで1 button確認する。本番導線の有効化はPhase 9以降に改めて承認を得る。

新Pages通常利用・敵data更新にもPATは不要である。既存版のPAT codeやowner保存値は削除・変更していない。

## OneDrive backup

将来はPagesを通常経路、OneDriveを障害/offline時だけのknown-goodとする。OneDriveには最新の実機承認済みknown-goodと、その直前版の2 fileを残す設計にした。candidateやscheduled jobから自動上書きせず、source permission、schema/diff/digest、通常test、3端末実機、rollback drill、tag、owner承認が揃ったreleaseだけを昇格する。

現在のOneDrive fileは変更していない。Phase 8の単一HTMLは架空dataによる互換確認用であり、現行backupの置換物ではない。詳細は[OneDrive known-good設計](phase8-onedrive-known-good-design.md)にある。

## 実機preview

通常画面:

`https://rawcdn.githack.com/sumiporon/dokkan-calc/phase8-complete-2026-08-24/release-candidate/phase8/index.html`

架空保存データ移行:

`https://rawcdn.githack.com/sumiporon/dokkan-calc/phase8-complete-2026-08-24/release-candidate/phase8/migration-device-check.html`

これは正式Pagesを変更せず別URLを得るための一時的な第三者previewである。最初に転送先確認が出る可能性がある。公開内容は架空3 event／3 enemyだけで、実dataや保存data、PATはない。第三者previewが開けない時は`device-preview.html`を1 fileでdownloadして開ける。

ownerが行うのは、PC、Android Chrome、iPhone Safariで「開く、架空eventを選ぶ、計算、開き直して前回event、更新1回、架空移行1回」だけである。[短い実機手順](phase8-device-preview-checklist.md)に番号付きでまとめた。

CodexのWebKit試験はSafari互換性の参考であり、iPhone実機確認済みとは表現しない。OneDrive appのpopup/opener、端末memory、実回線、touchの体感はowner実機だけに残る。

## 性能

公開しない5,032敵／88 eventの全量releaseをWindows loopbackで測った。初期はmanifest＋約50KB indexで、largest event chunkは約872KBだった。

| 条件 | cold一覧準備 | 最大event選択 | warm再起動 |
| --- | ---: | ---: | ---: |
| Chromium desktop | 45.6ms | 115ms | 45.0ms |
| Chromium 390px touch | 41.0ms | 84ms | 43.4ms |
| WebKit 390px touch | 279ms | 192ms | 328ms |

上限をcold 3秒、event 1秒に置き、違反0だった。Phase 7とはharnessが異なるため厳密な速度比ではないが、Phase 7のdesktop chunk約165ms、4x CPU mobile参考約1,099msに対して明確な回帰は見られない。実回線・実端末値ではない。

## test

通常`npm test`へPhase 8を統合した。Phase 8追加はdata 7件＋browser 10件の17件で、既存144件と合わせて**161件すべて成功、failed 0、skipped 0**だった。WebKit browser binaryを導入し、skip fallbackは設けていない。

## Git

- branch: `codex/phase8-pages-release-candidate-20260824`
- start tag: `phase8-start-2026-08-24`（Phase 7 completion `3e20a8f`）
- policy commit: `5904f84`
- implementation checkpoint: `680f975`
- completion tag: `phase8-complete-2026-08-24`（この報告を含む最終completion commit）

branchとcompletion tagだけをremoteへpushし、`main`と`origin/main`は動かさない。

## DokkanStats

ownerが2026-08-24に問い合わせを送信済みで、返信待ちである。Codexは再送、follow-up、operator連絡、site accessをしていない。沈黙は許可と解釈せず、取得・変換・派生公開・production利用は`unknown / pending`のままである。

## Phase 9前にownerが判断するユーザー向け事項

1. Android ChromeとiPhone Safariの短い実機確認が合格したか。
2. 合格後、正式Pagesへの段階移行準備をPhase 9として始めてよいか。
3. Phase 9で現在版へ本物の「保存データをPagesへ移行」buttonを追加する案を採用するか。
4. 正式移行後も、OneDriveに最新＋直前のknown-goodを残す運用でよいか。

DokkanStats返信がなければ、Phase 9でも実source接続や実data公開は始められない。内部実装方式について追加判断は不要である。
