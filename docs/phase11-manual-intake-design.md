# Phase 11 手動取り込みの安全設計・中断復元記録

2026-09-01 JST時点の、prototype承認前の比較・設計記録。ownerはその後、production分離のHTML/MHTML file選択prototypeと暫定IndexedDBを承認した。2026-09-02時点の実装・検証結果は[DokkanInfo保存ページ手動取り込みprototype 完了報告](phase11-dokkaninfo-manual-prototype.md)を参照する。この文書の「未実装」「まだ作らない」は当時の判断経緯として残し、現在状態を表すものではない。Phase 12へは進まない。

Android中心の操作比較と推奨案は[方式比較](phase11-manual-update-options.md)を参照。

## 1. 実際に復元できた中断地点

| 対象 | 確認結果 |
| --- | --- |
| worktree | `C:\Users\kou20\Downloads\dokkan-calc-main`の1個 |
| 作業branch | `codex/phase11-manual-update-design-20260831`、作成済みを再利用 |
| 再開時HEAD | `d565eb9e14773308382d27a70b0268e88cf4d2bb`。Phase 10文書commitと同じ |
| Phase 10安全検査 | `b063eee`で実装済み。`d565eb9`とともに現在branchへ継承済み |
| 未コミット / staged | 再開時は両方なし |
| 復旧点 | `phase10-source-review-ready-2026-08-31` → `d565eb9`、既存tagを維持 |
| Phase 11固有のcode / prototype / fixture / docs | 再開時はなし。調査回答と全test完了ログは会話に残っていた |
| 調査済み | 既存拡張・HTML parser・Phase 10 gate・保存構造、A～Fのplatform比較、ローカルsample完全性 |
| Android検証 | Chrome公式手順・仕様調査まで。実機タップ、MHTML取り込み、共有先登録は未検証 |
| remote | 読取確認でPhase 10/11 branch・Phase 10 tagは未push。remote mainはPhase 9 `a1b81b817f95652199e1b11a304bb884a10b57ff` |
| local main | `3ca5383e77ef395dcaf94047559a637aecb1bd80`のまま。remote mainとの差は既存状態で、勝手に動かしていない |

前回完了済みの比較・テストを破棄して作り直していない。今回の残作業はAndroid優先の追加調査、比較文書、後段の設計、owner選択の明確化である。

### 今回の変更範囲

- Phase 11の比較と設計を新規文書化。
- READMEとAGENTSへAndroid優先・手動取得を基本にする最新方針を記録。
- Phase 10 ledgerのFranceの説明だけを「未照会」からowner送信済みの経緯へ更新。許可判定項目はすべて従来のunknown/pendingを維持。
- UI、計算、保存schema、敵data、workflow、source adapterの実装は変更しない。prototype・preview公開もまだ行わない。

## 2. 取得と利用目的を分ける

自動取得許可が出ない場合を基本ケースにする。手動取得の後段は、自動取得許可なしでも、自己作成fixture等を使って開発できる。一方、手動で開いたという理由だけで、そのsiteの抽出・変換・保存・再利用・公開まで許可済みにしない。

Franceへの問い合わせはownerが2026-08-31に送信済み。自動取得、GitHub Actions、派生JSON、GitHub/Pages、履歴保存、手動表示済みDOMのローカル解析を含む。回答本文は未受領で、手動利用についても許可を得たとは扱わない。DokkanStatsも返信待ち。再送・follow-up・siteへの自動アクセスはしない。

| 用途 | 調べる条件 | 誤って要求 / 許可しないもの |
| --- | --- | --- |
| 自作fixtureのローカル検証 | fixtureが自作で非本番、外部通信なし | France等の自動取得許可を待つ必要はない |
| 手動取得した実資料の個人利用 | 手動閲覧、抽出・変換、個人保管・再利用の条件 | 自動取得や一般公開の許可を一律に要求しない。ただし禁止・未確認の個人利用条件を無視しない |
| 手動取得由来の公開更新pack | 上記に加え、派生再配布・公開・帰属・履歴保持 | 個人利用が認められても自動的には公開できない |
| 将来の自動取得＋公開 | 自動取得、実行元/頻度、変換、再配布、公開等 | ownerクリックを自動取得許可の代わりにしない |

既存`sourcePreflight()`は**自動取得＋公開用**であり、`automatic-approved`と`automatic-fetch`等を要求する。これを手動個人用に直接使うと、不要な権限まで要求して止まる。一方、既存条件を削って公開gateを緩めるのも誤りである。

将来の試作では既存操作別permission型を利用し、手動個人用の目的別入口を別に設ける。個人保管・再利用の条件は現在のledger項目だけでは十分に表せないため、実装時にversion付き契約を検討する。fixture用許可を実sourceに流用しない。現在は新schemaも新gateも未実装。

## 3. 既存成果の再利用境界

| 既存成果 | 再利用できるもの | 今回必要な追加 / 制限 |
| --- | --- | --- |
| `chrome_extension/` | MV3構成、ユーザー操作、clipboardの経験 | 既存event/categoryはfetch巡回するので再有効化しない。unknown属性の極技default・必殺3倍補完も再利用しない |
| `tests/helpers/cached-enemy-source.mjs` | 通信・script実行をしないHTML解析、複数必殺、属性、HP条件、AOE両対象 | DokkanInfo専用selector。Franceへ流用しただけではparserにならない |
| `src/data-foundation/phase6-types.ts` | `SourceAdapter`、source/evidence、unknownと0、canonical v2 | 新しい入力形式のadapterは既存contractに合わせる。特定siteを正本形式へ埋め込まない |
| `phase6-runtime.ts` | 決定的canonical→runtime変換 | runtimeだけでは出典・HP/DEF・AI等を保持しきれない。完全取得の証明と計算用projectionを分ける |
| `phase10-review.ts` | ID/親、件数、属性、必殺/AOE消失、固定ATK、不正値・条件の検査 | 1stageを全dataset置換として比較しない。自動公開用source preflightと個人用入口を混同しない |
| `scripts/review-phase10-candidate.mjs` | 元入力と出力のhash、schema、出典参照、projection一致、現production audit | 現在はNode用開発CLI。Pagesからそのまま呼べる完成済み機能ではない |
| `phase8-release-store.mjs`等 | transaction、atomic apply、health、known-good、2世代保持 | 個人追加を正式releaseへ混入させず、別versioned保存領域に適用する設計 |

### 取得後の共通経路（未実装部分を含む設計）

```text
ownerがページを普通に開く / 保存する
  → 表示済みDOM・コピー・保存fileを受領（URLだけなら不足として停止）
  → 入力の安全検査 + 利用目的の条件確認
  → 通信しないsource別parser / adapter
  → source-neutral canonical candidate + 不足項目一覧
  → schema・元入力hash・出典・意味・完全性検査
  → 取り込み対象stageの旧版と比較 + 正式dataを保持した合成結果を比較
  → runtime変換一致・互換性検査
  → 日本語preview → ownerが確認 → 個人領域へatomic apply
  → reload / health確認後known-good化、失敗時は旧版を維持
```

取得後はJSON編集・数値補完・Git操作をownerへ要求しない。複数ページが必要なら未完成candidateへ自動集約する。確認前の取込を計算用active dataとして扱わない。

### 現在表示中の内容だけを使う

- 新規sourceの`fetch` / XHR / API / iframe / 背景巡回 / proxy / 自動scrollによるlazy-loadを実装しない。ownerの通常閲覧とブラウザ自身の動作、取り込みtoolが発生させる通信を区別する。
- DOM限定capture toolは既にある必要な文字列・構造・属性だけを読む。cookie、form入力、storage、token、不要なscriptや広告を収集しない。
- ownerがブラウザで保存したMHTMLには、それらの不要情報が含まれる可能性がある。受領raw fileはローカルの一時処理に限定し、必要な敵data領域・出典だけをallowlist抽出してから永続化・pack出力する。raw fileを無条件で保存/共有する保証にはしない。受領原本と安全化後の材料のhash・bytes・変換version・保持範囲を区別し、再解析/検証のreceiptがどちらを参照するか一致させる。情報を除外した材料を「元ページを完全保存したもの」と呼ばない。
- sourceから受けたHTMLを`innerHTML`へ入れたり、そのまま表示・実行しない。ネットワークを持たないparserを使い、画像URLも文字列として解釈する。
- `DOMParser`のinert documentだけを「資源読込ゼロ」の保証にしない。script停止と画像/iframe通信停止は別である。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString)
- URL・リンクは受領資料に実在するものをscheme/host検査して提示。リンク先はownerが開く。推測した敵/必殺/AI URLや隠しAPIは生成・取得しない。
- URLだけの共有、HTML変更、必須項目不足は明確な日本語で停止。0・中立・通常・3倍必殺へ置換しない。

## 4. Android保存fileを扱う場合の追加設計

Chromeの保存済みページは通常HTMLとは限らず、MHTML archiveの場合がある。受取fileの拡張子を変えるだけでは解析できない。

必要な処理は、MIME検査 → multipart/転送encoding/charset decode → root HTMLと元URLの整合検査 → `cid:`等の同梱資源参照対応 → source adapterである。広告iframeをrootと誤認せず、元URLをファイル名から推測しない。画像は追加取得しない。

Androidのmemoryを考慮して入力bytes、part数、展開後bytes、処理時間に上限を設ける。超過したら既存dataを残して停止。上限の数値は実物file計測前に確定しない。

PWAを共有先にする場合は、現在存在しないmanifest/share target・service worker・受信UIが必要になる。GitHub Pagesに通常のPOST保存APIがあるわけではなく、file受領はclientのworker内で処理する設計が必要。入力fileをserverへ送るfallback、全文をqueryへ詰める方法は設けない。

**重要な未解決条件**：一般仕様ではworkerが捕捉しない要求はnetworkへ進む。worker不在等でも共有fileのPOSTを端末内に留められると、receiver codeだけで保証できたわけではない。このため初期候補を直接file選択へ変更し、PWA受領は短縮候補へ下げた。失敗時の外部送信防止を保証できなければPWA共有を採用しない。これは仕様からのリスク評価であり、実fileを外部送信する実験は行っていない。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event)

prototypeを作る場合もscope、DB名、cache名、entryを本番から分離し、本番rootのservice workerや保存領域を横取りしない。新PWA/保存導線はownerの方式選択後に検証する。

## 5. データ完全性とguided import

**「受け取ったデータを正しく解析した」と「敵の全情報がそのページにある」は別。** schema合格だけで後者を証明しない。

| 項目 | 既存ローカル資料からの判断 / 新sourceで必要な確認 |
| --- | --- |
| event / stage | 実在URL・source ID・名称・所属を保持。event一覧に戻る操作はstage取込操作と別 |
| phase / encounter / enemy | 親子・順序・同時出現か連続phaseかを確認。単なる敵一覧をphaseと決めつけない |
| 属性 / 超極中立 | Infoの実例はicon `src`に意味があり、`alt="element"`や本文コピーでは欠落する |
| HP / ATK / DEF | 既知値/未知値を保持。HP/DEFの一部が現runtimeから省略されても、取得済みと偽らない |
| 通常 / 必殺 / 複数必殺 | 技ごとの固定値、順序、effect、条件所属を保持。倍率だけから固定ATKを推測しない |
| AOE | first / additionalとsource enemyを別々に確定。片方を同値で補わない |
| 条件付き攻撃 | HP帯、turn、必殺後等の条件と技を結び付ける。条件説明が読めないとき無条件にしない |
| AI / attack pattern / usage rule | 未表示と「存在しない」は違う。表示情報で全patternが説明できるかをsource別に確認 |

Franceは保存済みHTML/MHTML/DOM fixtureがなく、[Phase 10の少数観察記録](phase10-source-research.md#4-実際のrecent-event観察とlatencyの限界)だけが残る。stage17680013等で1stageページに2phase・複数必殺等の表示を観察したが、**全必要情報を揃えるページ数は不明**。eventからstageを探す経路はevent＋stageの2ページ。追加enemy/必殺/AIページで不足を解決できるかも未確認。今回は再アクセスしていない。

既存Info cacheは801stage / 1,352 encounterで、AI表示は100 encounter。`stage_1702_17020095.html`ではAOE first=1,400,000 / additional=700,000を読めるが表示AIは0。1ページに多くの値があっても完全取得とは言えない。このcacheは過去のoffline回帰材料であり、新規手動取得や公開を許可する証拠ではない。

guided importは入力に含まれる実リンクから「このstageは必殺条件が不足」「次の確認先」を提示する。ただしカード参照リンクを敵AI詳細リンクと誤認しない。確認先が分からなければ「不足を埋めるページは未確認」とし、ownerにJSON編集・値の推測を頼まない。

受領単位に、method、source URL、source entity、取得/受領時刻の区別、input digest/bytes、adapter version、scope、evidence、不足項目、観測済み補足リンクを保持する案。自己申告URL・digestは出典真正性や利用許可そのものを証明しない。

## 6. Pagesへの保存・共有の選択（未決定）

| 案 | 普段ownerがすること | 端末間 / 消失 / 衝突 | 評価 |
| --- | --- | --- | --- |
| 個人追加データを今のブラウザ内へ保存 | Androidで取り込み確認。以後そのPagesで利用 | PCや別browserへ自動では現れない。browser data削除で消える。backup packと必要時の別端末importが必要 | **非公開の初期試作として推奨するが、owner承認前に確定しない** |
| repo/public releaseへ反映 | 作成者が取得・検証・公開。ownerは各端末で通常の更新 | 端末共通だが派生公開許可とpublisherが必須。ownerの日常Git操作は不適合 | 今の基本案にしない。将来の独立選択 |
| private cloud同期 | 初回account/保存先設定、以後端末同期 | 認証、通信、競合、費用、保守・data提供先が増える | 個人toolには現時点で過剰。勝手にbackendを追加しない |
| 私用のversioned更新pack | 取得済みの敵だけを出力し、必要な端末でfile選択 | 自分で共有・保管する分だけ操作が増えるが自動同期不要 | 個人保存のbackup/PC共有を補う案。OneDrive旧アプリとの状態移行ではない |

IndexedDBは構造化dataとtransaction向けで、個人候補/active/known-goodを独立version付きDBへ保存する設計が適切。現在のScenario用`dokkan_calc_pages_state_v1`や正式release DBの意味を変えない。大きい敵datasetを小容量のlocalStorageへ詰めない。[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

browser storageは同じURLを開いてもPC/Android/別browser間で同期されない。通常はbest-effortで容量圧迫等による削除があり、永続化要求が通ってもownerによるdata削除は防げない。private modeは通常利用の保存先にしない。backup exportがなければ「消しても復元できる」と約束しない。[Storageの保存・削除条件](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

### 合成と更新衝突

- 正式dataは不変baselineとして保持し、個人stageを別source/ID namespaceで管理する。
- 名前だけで正式stage/敵へ上書きしない。対応IDを確定できない重複は止めてreviewし、別物として黙って二重表示もしない。
- partial packageの対象stageを明示し、対象外の正式/個人dataを残した合成結果へ全体検査を適用する。同じ個人stageの旧版とも比較する。大量削除検査を無効にしない。
- 正式更新時はoverlayを再検証。競合を勝手に勝たせず、既存known-goodを維持して理由を表示する。具体的な切替UIはowner確認後。
- schema/app version不適合、破損、対象外書込、履歴後退、未知source、必須情報の消失はactiveへ適用しない。同じhashの再取込は重複追加しない。
- 個人packは敵dataの範囲だけ。旧OneDrive状態、Scenario転送、PAT/credential、未知storage keyのimport/exportを復活させない。

## 7. 承認前に試作を作らなかった理由と、選択後の検証

Android優先は確定したが、Chrome継続で保存/共有する手間と、別browser導入でDOMを直接読む手間には実際の使い勝手の差がある。さらに個人保存にはPCと自動共有されない制約がある。元依頼の「明確な最適案がない場合は選択提示して停止」に従い、この時点では方式決定前のprototypeを作らなかった。**停止理由は自動取得許可待ちではなく、操作・保存方式のowner選択だった。** 後にownerがfile選択と暫定IndexedDBの試作を承認し、実装結果は別報告へ引き継いだ。

選択後は自作fixture・既存の利用可能なoffline sampleを使い、実sourceへの自動通信なしで次を検証できる。

1. Android Chromeの保存/共有/file picker、または選択したbrowserのDOM取得を実機で実行。初回と反復のtapを別計測。
2. 元URL、属性icon参照、phase/敵、複数必殺、両対象AOE、条件・AIの保持と不完全入力拒否。
3. copy文字列 / HTML / MHTML / URLだけ / 破損 / 過大file / script / iframe / 外部画像を含む入力で、tool起因のsource通信0。
4. canonical→runtime、digest、既存Phase 10意味検査、partial scope、全体合成diff、重複hash、既存正式data不変。
5. owner確認前の非適用、cancel/途中失敗時の旧版維持、atomic apply、reload保持、rollback、互換version拒否。
6. browser data削除と個人敵pack復元、PCへの任意受渡し。既存の計算カード/保存/PAT除外を維持。

これらは**今後の受入条件であり、現在成功済みのtestではない**。France固有の完全性検証には適切に利用できる実物sampleが別途必要だが、共通基盤試作はその回答を待つ必要がない。

## 8. testsと本番の再確認

中断前のPhase 11調査で完了した`npm test`の終了ログを再確認した。**222件成功、failed 0 / skipped 0 / cancelled 0**。今回codeの作り直しや同じ全件生成をせず、2026-09-01に`npm run test:phase10`を再実行して33/33成功を確認した。これは222件に含まれる既存testの再確認であり、255件と数えない。

| suite | 成功 / 件数 |
| --- | ---: |
| unit | 65 / 65 |
| data（保存HTML回帰6件を含む） | 26 / 26 |
| Phase 4 / Phase 6 | 12 / 12、14 / 14 |
| Phase 7 data / browser | 13 / 13、5 / 5 |
| Phase 8 data / browser | 5 / 5、24 / 24 |
| Phase 9 data / browser | 5 / 5、8 / 8 |
| Phase 10 | 33 / 33 |
| legacy browser | 12 / 12 |

既存browser testはPC Chromium/WebKitと360/390px等の回帰。**Android OSの共有・保存・ブックマーク実操作の試験ではない。** ローカルにAndroid SDK/adb/emulator/接続手段とMHTML sampleは見つからず、インストール・接続開始はしていない。WindowsでMHTMLを生成できてもAndroid実機合格の代用にしない。

2026-09-01のread-only確認で正式PagesとmanifestはHTTP 200。remote mainはPhase 9 commitのまま。公開datasetは`legacy-production-runtime:f1cb27a2e5cae962`、56 event種別 / 73 series / 647 stage / 4,245 enemy / 8,899 attack / AOE 0。source SHA-256は`f1cb27a2e5cae9627be61934aaabec79e4af0b42d3e21ad0cc7945eb6d7a0b40`で既存baselineと一致。

Phase 10のmain統合は今回必要ない。開発branchに既に継承された安全検査の再利用設計だけで比較できる。将来mainへ安全検査だけを統合する場合も、Node開発検査とブラウザ実行経路の独立性・workflow差分を別reviewする。今回そのmerge/push/deploymentをしていない。

本番UI/計算/保存/data/production workflow、main/origin/main、OneDrive本番版は変更していない。France・DokkanStats・その他敵siteへの自動通信は0。調査通信は一般platformの一次資料と自分のGitHub/Pagesのread-only確認に限定した。

## 9. 将来の自動取得への再利用

正当な自動取得許可を後日得た場合も、取得adapterだけを別に作り、source-neutral canonical、出典、完全性、hash、意味検査、diff、compatibility、known-goodの後段を再利用する。取得許可に加えて用途・公開範囲も確認し、既存manual pathを使い捨てにしない。許可取得だけでstartup自動更新や自動公開を有効にしない。
