# 第8段階 release candidate設計

作成日: 2026-08-24（JST）

## 結論

Phase 7の実験を`release-candidate/phase8/`へ統合した。将来のPages向け通常経路はevent index＋選択event chunk、更新検査はfull runtime、敵release保存はIndexedDB、利用者のPages内状態は専用localStorage、artifact cacheはdigest照合付きCache Storageである。Vite、React、backend、browser PATは不要だった。

これは本番と分離したrelease candidateである。`dokkan_calc_final.*`、`index.html`、`scraper/all_enemies.json`、production localStorage、Pages root、OneDrive、workflowは読み替えていない。

## 公開境界

manifestはdata分類と許可を明記する。

| 分類 | 利用範囲 | 公開 |
| --- | --- | --- |
| `synthetic-public-fixture` | Phase 8の端末preview、browser test | 可 |
| `existing-data-internal-only` | 5,032敵のローカル性能・全量検証 | 不可 |

追跡する`release-candidate/phase8/data/`は完全な架空3 eventだけである。実データ由来の88 event／5,032 enemyは`generated/phase8/`へ生成し、`.gitignore`対象のまま公開しない。どちらも`productionActivated: false`、`productionActivateAllowed: false`、`liveSourceAccessAllowed: false`である。

## 起動とevent chunk

1. release manifestを取得して境界、version、artifact descriptorを確認する。
2. IndexedDBのactive／known-goodを検査し、壊れていれば直前の保持release、最後に同梱seedの順で復旧する。
3. digest付きevent indexだけを読み、初回はevent未選択で表示する。
4. 前回event IDが現indexに残る場合だけ、そのevent chunkを読み復元する。
5. event IDが削除・変更された、保存値が壊れた、古い保存形式だった場合は安全な未選択へ戻す。

通常画面にchunk、manifest、candidateという内部用語は出さない。未使用eventは読まず、最近使った3 eventだけをmemoryに保持する。

## 1操作更新

設定・データ欄の「敵データを更新」1回で次を行う。

1. manifest取得・validation gate
2. version／app compatibility
3. full candidate取得
4. byte size／SHA-256 digest
5. runtime schema／ID重複
6. event・stage・enemy件数急減safety gate
7. memory上のcandidate commit
8. event indexを実際に読むhealth check
9. IndexedDBへactive／known-good pointerとreleaseを同一transactionで保存
10. 成功時だけ画面を新indexへ切替

失敗時はactive、known-good、memory release一覧を更新前へ戻す。永続releaseは最大2世代を残し、active/known-good欠損や破損時は直前の保持版へ戻る。browser cacheもdescriptor digestを再計算し、壊れていれば削除して再取得する。

正常表示は「敵データを更新しました」「すでに最新です」だけにした。異常時は「更新しなかった」「現在の敵データはそのまま安全に使える」を先に示し、取得破損、件数異常、非互換、health/適用失敗だけを平易に補足する。

0操作更新は存在せず、更新履歴は秘密を含まない時刻、status、code、version、所要時間だけを最大50件記録する。

## Pages内の通常保存とOneDriveからの独立

ownerの追加決定により、OneDrive／local旧版からPagesへの保存データ移行・同期・逆同期は行わない。以前の`postMessage` bridge、import/export画面、移行件数表示、専用preview、専用testはrelease candidateとPhase 7 prototypeから削除した。過去文書は技術検証の履歴としてだけ残す。

Pagesは初回だけ新しい状態から始め、RCでは`dokkan_phase8_rc_pages_state_v1`へ次を保存する。

- 複数の作業中Scenarioと状況名
- DEF、軽減、属性、ガード、会心、カスタム攻撃・手動敵属性などScenario内の入力
- 耐久ライン
- theme

Pagesはproduction旧版の`dokkan_calc_data_v22`、廃止した`dokkan_phase8_rc_imported_*`、旧theme／会心key、PAT、未知keyへfallbackしない。これらを読まず、変更も削除もしない。Pagesの初回が新規状態というだけで、毎回初期化するわけではなく、2回目以降はPages自身の保存状態を復元する。

OneDriveは独立した旧known-goodアプリであり、Pages利用者データの同期backupではない。Pages通常利用と敵データ更新は引き続きPAT不要である。同じPages app内で将来保存schemaを変える場合だけ、version付き互換処理とtestを別途用意する。

## Pagesと一時preview

正式Pages rootは変更していない。実機確認はcompletion tag上の架空fixtureをraw.githackの固定URLで表示する。これはGitHubのraw fileへ正しいContent-Typeを付ける第三者preview proxyであり、最初に転送先確認画面が出る場合がある。正式運用先ではなく、Phase 8の一時的な端末確認だけに使う。

第三者previewが開けない場合は、架空data、CSS、計算core、RC clientを内蔵した`device-preview.html`を1 fileで開く。Chromium/WebKitの`file://`直開きを自動検証済みである。現行OneDrive版の置換物ではない。

## Vite再評価

plain HTML/CSS、native module、決定的generatorでversion path、digest、chunk、単一HTML、browser testが成立した。Viteを追加しても今回の利用者操作や安全性は改善せず、移行面積だけが増えるため導入しない。asset graphや開発serverが具体的な保守問題を解く時だけ再評価する。
