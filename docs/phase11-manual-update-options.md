# Phase 11 Android中心の手動更新方式比較

2026-09-01 JST。中断前の調査を再利用し、ownerの追加方針に従って**Android単独 → Android＋必要時PC → PCのみ**の順に評価し直した。iPhoneは今回の主要評価対象から外した。

## 結論とownerへ戻す点

**最初の試作候補は、Android Chromeでページを保存し、Pages側でそのfileを選択してローカル解析する方法（D）を推奨する。** 通常のChromeを使い続け、コピーでは失われる構造も保持しやすく、追加browserやPWA導入を初回必須にしないためである。ただし保存・file選択・保存fileの蓄積という負担がある。Chromeの保存ページがpickerから見えるか、MHTMLに必要情報が残るかはAndroid実機で未確認なので、完成方式として採用済みとはしない。

保存fileの共有先をPWAにする案（F）も比較したが、multipart POSTを受信処理が捕捉できない場合にfileがserverへ送信され得るという別の安全上の課題がある。共有を先に必須化せず、まずDの成立を検証する案へ絞った。Fは失敗時を含め端末内受領を保証できる場合の短縮候補である。[共有fileのPOST設定](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)、[workerに捕捉されない通信](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event)

比較対象として、Android Firefoxの表示中DOM限定拡張は少操作化の余地があるが、browser導入・切替と保存状態の分離を伴う。Chromeのbookmarkletも候補だが、登録・名前入力・site制約・受渡しの安定性が未確認。これらの違いは内部実装だけではないため、**方式と個人保存の選択前にprototypeを勝手に作らない**。

ownerへ確認したいのは、普段のChromeを維持し、保存・file選択の数操作を受け入れる案から試作してよいか、という点である。想定する初期保存はそのAndroidのPages内への個人追加で、PCとの自動同期はなく、必要時だけ敵dataの私用backup packで渡す。これは提案であり未承認。Dが実機で使えなければ黙って別browser/PWAへ切り替えず、測定結果をownerへ戻す。

自動取得許可待ちを開発停止理由にはしていない。選択後は自作のページsampleで通信なしの共通取り込みを試せる。Franceの実データ利用条件は別途確認する。

## 1. 確認済みと未確認を区別する

- **公式仕様確認**：Android Chromeの保存・共有・bookmark編集、PWA共有先、Firefox/EdgeのAndroid拡張。
- **ローカル実コード確認**：既存拡張のfetch巡回、保存HTML parser、欠損しやすい属性/ID/AI、Phase 10安全検査。
- **まだ実機未確認**：Androidでbookmarkletが現在tabへ実行される手順、Chrome保存fileの実MIMEと共有payload、file pickerからの選択、複数MHTML共有、PWA受領、入力完全性。

このPCにはAndroid実機制御/SDK/エミュレータの既存環境もMHTML sampleも見つからなかった。インストールや接続を勝手に追加していない。以下は**画面操作へ分解した設計上の回数であり、Android実測値ではない**。現在のPagesには手動取込口やPWA共有先はまだない。

## 2. A～Fの比較

| 方式 | Androidでownerがすること | Windows PCとの差 | 主な問題 / 判定 |
| --- | --- | --- | --- |
| A 表示中DOM限定拡張 | Firefox等でページを開き、拡張メニューから取込 | Windows Chromeなら固定した拡張ボタンを押せる | Android標準Chromeは同じ拡張を実行できない。Android拡張対応browserなら候補だが導入・切替が必要 |
| B bookmarklet | ページを開き、登録名を呼び出して実行し、データを渡す | PCはbookmark barを押しやすい | Androidは名前入力等が増える。CSP等で使えないsiteもある。短い操作を保証できない |
| C コピー→貼付け | 必要範囲を選びコピー、Pagesへ切替、貼付け | PCは全選択/コピー/貼付けのショートカットが容易 | Androidだけでできるが、属性icon、ID、条件の所属が落ちやすい。完全性を満たす場合だけ補助候補 |
| D 保存HTML/MHTML→file選択 | Chromeで保存し、Pagesのfile選択から渡す | PCは普通のHTML保存とdrag/dropが使いやすい | **Android Chrome継続の試作第一候補**。MHTML/保管場所/picker可視性の検証が先 |
| E 更新pack | 受領fileをPagesで選択、または公開済packを更新 | 端末差を受けにくい | pack作成者の取得/検証/配布作業を隠せない。公開packは再配布条件が別。私用backupには有用 |
| F 保存ページ共有→PWA | 保存したページをDownloadsから共有し、計算機を選ぶ | PCはD/Aが簡単 | 短縮候補。初回PWA設定、実file受領、失敗時の外部送信防止の検証が先 |
| F 通常のページ共有→PWA | Chromeの共有から計算機を選ぶ | 同じくURL中心 | **そのままでは不適合**。届くのは通常URLで、DOMではない。裏fetchは禁止 |

### Androidブラウザ拡張の現状

Android全体が拡張非対応なのではない。標準Chromeの「スマホから拡張追加」はPCへ追加する機能である。[Chrome公式](https://support.google.com/chrome/answer/2664769?hl=en)

Firefox Androidには正式addon導入経路がある。表示中tabだけを読む権限・実行APIは利用できるが、公開/署名・審査とAndroid対応の確認が開発者側で必要。[Firefox導入](https://support.mozilla.org/en-US/kb/find-and-install-add-ons-firefox-android)、[署名・配布](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)、[scripting互換性](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/scripting.json)

Edge Androidも公式mobile addonと対応APIがある。ただし任意の新規拡張をAndroidへ配布する条件と実機の起動操作は未確定。Samsungは承認制の開発programで、個人toolの最初の案にしにくい。[Edge一覧](https://microsoftedge.microsoft.com/addons/collections/mobile_android_extensions)、[Edge API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support)、[Samsung](https://developer.samsung.com/internet/android/extension-guide.html)

Firefoxで取込も計算も行う場合、今のChromeにある計算カード等は自動で現れない。Chromeで計算を続けるなら、Firefoxからclipboard/fileで戻す手間が増える。Firefox拡張がChromeの表示中DOMを読むことはできない。browser accountの同期をPagesの保存data同期と扱わない。

## 3. 操作数の数え方

以下は、対象ページの場所が分かっている前提で「開く」を1操作に含める。タップと長押しを各1操作とし、bookmark名の入力は1回の入力として別記する。待ち時間は操作数に入れないが発生する。

**別に増えるもの**：stageを探すevent一覧操作、細部の手動展開、ページのscroll、選択範囲の修正、共有先を探す「その他」、file保存先の選択、次のsourceページへ戻る操作、OS確認dialog。これらを0と決めつけない。

複数ページの比較は、同じ未完成候補へ蓄積し最後に1回承認する設計を仮定する。これは未実装。各stageを別々に承認したい場合は、その分確認操作が増える。`P`は必要な**入力ページ総数**で、stage数ではない。

### F 短縮候補：Chrome保存→共有→Pages

初回のみ、共有先対応後のPagesで、開く → `︙` → インストール関連メニュー → インストール → OSの確認。**4操作＋端末の確認等**が目安。通常のホーム画面ショートカットだけでは共有先登録とは限らない。[PWA導入手順](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en)

新しい1ページの手順案：

1. sourceの対象ページを普通に開く。
2. Chromeの`︙`を押す。
3. ダウンロードを押して待つ。
4. 再び`︙`を押す。
5. ダウンロード一覧を開く。
6. 今保存したページを長押しする。
7. 共有を押す。
8. 共有先の計算機を押す。
9. 自動解析・検査後、取込内容を確認して適用する。

**1ページ9操作（長押し1を含む）＋追加操作**。うち2～7は[Chrome公式の保存済みページ共有手順](https://support.google.com/chrome/answer/7343019?co=GENIE.Platform%3DAndroid&hl=en)に対応し、8～9の計算機受領部分は新規設計。ページを保存した後にfileが本当に共有されるか、URLだけになるかを実機で確認する必要がある。

複数ページを先に保存して一括共有できれば、`P×(開く1＋保存2)`＋一覧表示2＋`P`件選択＋共有1＋計算機1＋最終確認1＝**4P＋5**。5ページ25操作、10ページ45操作＋ページ移動等。一括MHTML→PWAは未検証であり、採用済みの操作数ではない。[Chrome複数file共有](https://support.google.com/chrome/answer/95759?co=GENIE.Platform%3DAndroid&hl=en)

個別に保存・共有して最後だけ確認なら**8P＋1**、5ページ41操作、10ページ81操作＋Chromeへ戻る操作等。1stageに10ページ必要なら軽い更新とは言えない。保存fileの削除・整理もゼロではなく、長期利用で溜まることを欠点として扱う。

### D 共有なし：保存→Pagesでfile選択

受領UI完成後、sourceを開く1 → 保存2 → Chromeのtab一覧/Pages選択2 → 取込ボタン1 → file選択1 → 確認1＝**8操作**を下限例とする。pickerの保存場所/開くボタン等で**8～11操作程度＋探索**。Chrome内で保存ページを読めても、Pagesのpickerから選べるとはまだ確認できていない。

5ページ一括なら、開く/保存15＋Pagesへ切替2＋取込1＋先頭長押し/残り選択5＋picker確定1＋確認1＝**25操作＋保存先探索等**。10ページなら45操作＋追加分。これはpickerが同じ一覧から複数選択できる場合の設計値。file名の編集、JSON編集、何十個もの手動フォルダ整理を通常手順には要求しない。

初回はbrowser/拡張の追加不要。PWAより構成は小さいが、保存fileがpickerに見えない場合、この経路は使えない。そのため最初にfileの受渡し自体を検証する必要がある。

### B bookmarklet

初回に用意したbookmarkletを登録する。Androidのbookmark追加→一覧→編集に約6～7タップの例があり、名前・用意されたURLの貼付け・保存がさらに必要。ownerにコードを書かせないとしても、長いURLを初回設定する負担は残る。[Android bookmark操作](https://support.google.com/chrome/answer/188842?co=GENIE.Platform%3DAndroid&hl=en-GB)

実機で確認すべき候補手順は、sourceを開く1 → アドレス欄1 → 登録名を入力1回 → bookmark候補1。ここまでが**3タップ＋入力1回**。Androidで確実に現在DOMへ実行されることは今回未確認で、完成手順として案内しない。

出力をclipboardへコピーできる場合、Pagesへtab切替2 → 貼付欄1 → 長押し1 → 貼付け1 → 最終確認1。合計**9タップ相当＋入力1回**、5ページなら最後だけ承認として41タップ相当＋入力5回＋戻る操作等。コピー成功/権限/長文量/元URL保持が追加確認点。

bookmarkletから表示中DOMをfile化して共有先を直接選べれば、開く1＋アドレス欄1＋候補1＋共有先1＋確認1の**5タップ程度＋入力1回**まで縮められる設計余地はある。ただしFと同じPWA初回install・共有先対応・失敗時の安全確認も必要。`navigator.share()`の対応file、user activation、Permissions Policy等が満たされる必要があり、未実証の最短案である。remote scriptの読込やCSP回避で成立させない。[Web Shareの条件](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)、[JavaScript URLとCSP](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/javascript)

### C 通常のコピー→貼付け

sourceを開く1 → 本文を長押し1 → 全選択1 → コピー1 → Chromeのtab一覧/Pages選択2 → 貼付欄1 → 長押し1 → 貼付け1 → 確認1＝**10操作＋範囲調整等**。初回install不要。全選択メニューがない、本文だけをうまく選べない場合は増える。

最後に一括確認する5ページなら**46操作＋戻る/範囲調整等**（9P＋1）。出典URLの別copyが必要ならさらに増える。文字コピーでiconの属性、DOMのID/条件が落ちる場合は、この操作数で完全取り込みは完了しない。rich HTML clipboardが毎回取得できるとも保証しない。[Clipboardの制約](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)

### A Android Firefoxの表示中DOM拡張

初回の例：Play Storeの案内を開く → install → Firefoxを開く → 用意されたAMOの拡張ページ → 追加 → 権限確認＝**6操作＋初回browser画面等**。入口bookmark登録等も任意で増える。署名済みの通常配布が用意されている前提で、現在その拡張はない。開発者modeやADBをownerの通常手順にしない。

同じFirefox内で直接受渡しできる場合の設計目標：sourceを開く1 → `︙`1 → 拡張メニュー1 → 拡張1 → Pagesで確認1 → 適用1＝**6操作**。5ページを拡張内で蓄積して最後に渡すなら**22操作＋移動等**（4P＋2）。受渡しの安全な実装・menu表示は未検証。Android Firefoxには拡張pin toolbarがないため、PC同様に1クリックと呼ばない。[action互換性](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/action.json)

clipboard経由で今のChromeへ戻す場合は、Android app切替、貼付欄、長押し、貼付け等が追加になる。Firefox内の少操作数をChromeへ戻す方式へ流用しない。AMO公開/審査は作成者の仕事として別計上し、未承認のstore公開はしない。

### A Windows Chrome拡張との比較

PCの安全な新DOM限定拡張なら、sourceを開く → 固定拡張ボタン → Pagesへ → 確認の**4操作は最短設計目標**。clipboard受渡しを明示すると、開く/拡張/Pages/貼付欄/貼付け/確認の**6操作**、5ページなら26操作＋移動。既存拡張のボタンがそのまま使えるという意味ではない。

初回はstore導入/権限確認/固定、または展開済み拡張のdeveloper mode読込という準備が必要。[Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[local導入](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)

PC版Bはbookmark barが使いやすく、Cはkeyboard操作が容易、DはHTML保存とdrag/dropが扱いやすい。しかし更新ごとにPCが必要なら今回の優先順位に劣る。PCはAndroidで対応できない資料の補助と検証用に残す。

### E 更新packの受け手と作り手

- **私用file受領側**：Pagesを開く → 取込 → file選択 → 確認＝4操作を基本に、保存場所/共有/ダウンロード操作を加える。5stageが同じpackに入っていれば受領は1回でよい。
- **作成側**：誰かがA～D/Fで必要な全ページを手動取得し、欠損を解決して検証・preview・pack出力・共有する。Codexはowner取得済みfileのローカル変換を支援できるが、未許可siteを代行自動取得しない。ownerが毎回Codexへ依頼する手間もなくならない。
- **公開pack受領側**：将来公開済みreleaseがあるならPagesを開く/更新の2操作、既に開いていれば1操作にできる。ただし作成者の取得、公開許諾確認、release review、公開作業が別途毎回必要。

公開packを基本案にすると「更新を作ってくれる人」と再配布条件に依存する。今回のAndroid単独・許可待ちに依存しない基本案にはしない。私用packはbackup/別端末へ渡す補助手段として提案する。

## 4. 共有・PWAができること / できないこと

Chromeの通常の共有は`︙` → 共有 → 相手の3タップ（既に開いている場合）だが、これは**リンクを渡すだけ**で敵data取込完了ではない。URLが`text`欄に届く場合も本文と誤認しない。[Chromeリンク共有](https://support.google.com/chrome/answer/10051760?co=GENIE.Platform%3DAndroid&hl=en)

PWA共有先は渡されたtext/URL/fileを受け取れるが、送信元DOMを読む権限を得ない。現在のPagesにPWA manifest、共有先、client受領処理、検証画面を新たに用意する必要がある。敵dataのrelease manifestとは別物。[Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)、[file受領設定](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)

Chrome保存ページはMHTMLとして共有できる実装がある一方、一部のoffline pageはURL共有になる分岐もある。固定履歴の実装は構造の根拠であってownerの現在Chromeの動作保証ではない。[Chromium実装](https://chromium.googlesource.com/chromium/src/%2B/11aa71f6eaea433061235f9c1f78625149d8fe13/chrome/android/java/src/org/chromium/chrome/browser/offlinepages/OfflinePageUtils.java)

Android用専用app、Accessibilityで他appの画面を読む方式、常駐clipboard監視は、権限/導入/保守の負担が大きく初期案にしない。スクリーンショット/OCRは見えないID・AI・条件を回復できず、数字の誤認もあるため完全敵取り込みの主方式にしない。

## 5. 1stageに必要なページ数と完全性

| source / 入力 | 今ある証拠 | 1stage完成に必要なページ数 |
| --- | --- | --- |
| France | Phase 10でstageページに基礎値/2phase/複数必殺等を観察。保存HTMLなし。対象別AOE/全AI等は未検証 | **不明**。event一覧から探す例はevent＋stageの2ページだが、これで完全とはいえない |
| 既存Info HTML cache | 1ページに複数敵/必殺/一部AI/対象別AOEがある例 | **不明**。1,352 encounter中表示AIは100。欠けた情報の別ページも未確定 |
| DokkanStats / DB等 | 以前の報告だけを保持、新規接続なし | **不明**。今回は測定していない |
| 構造化更新pack | 作成側で検査済みなら受領1file | 作成側が開くページ数は元source次第。1fileを1sourceページと数えない |

DOM/保存fileは、そこに既にある情報を保つ手段であり、未読込・未掲載・別ページの情報まで生成する手段ではない。普通のコピーはさらに属性icon src、リンクID、hidden情報、条件の所属を落とす場合がある。

完全なstage/敵/phase、属性、HP/ATK/DEF、通常、複数必殺、AOE両対象、条件、AI/usage ruleを別々に評価する。現計算が利用する情報だけでなく、未対応・未取得の情報も表示上区別し、unknownを0にしない。取得後の安全処理と不足ページ案内は[設計書](phase11-manual-intake-design.md#5-データ完全性とguided-import)に整理した。

1stageに必要な入力が1ページなら上記1ページの操作数。5stageが各1ページならP=5。1stageが10ページならP=10であり、5stageが各10ページならP=50になる。**Franceが実際にこのどれに当たるかは未確定**。ページ総数が分からないまま「1stageを1クリック」とは報告しない。

## 6. 15項目の評価をまとめる

| 評価項目 | A DOM拡張 | B bookmarklet | C copy | D file | E pack | F 保存共有PWA |
| --- | --- | --- | --- | --- | --- | --- |
| 1 毎回の操作 | Android目標6、PC4～6 | 呼出し＋入力＋受渡し | Android約10＋調整 | 約8～11＋探索 | 受領4、作成は別 | 約9＋追加 |
| 2 初回設定 | browser/addon、作成側審査 | bookmark編集。直接共有案はPWAも必要 | なし | なし | 作成/配布経路、受領は軽い | PWA install、受領対応が必要 |
| 3 PC | 良い | barで呼べる | keyboard向き | 保存/drop向き | 良い | PCではA/Dが単純 |
| 4 Android | 対応browserへ変更 | 実機起動未確認 | 可能だが範囲選択 | file可視性/MHTML未確認 | file受領は候補 | Chrome内の保存共有が候補 |
| 5 iPhone | 今回非主要 | 今回非主要 | 今回非主要 | 今回非主要 | 今回非主要 | 今回非主要 |
| 6 必要ページ数 | source次第・不明 | 同左 | 欠損で増える可能性 | source次第・不明 | 作成側で同じ問題 | source次第・不明 |
| 7 複数stage | 蓄積後一括が設計可能 | 呼出しを毎回繰返す | copy範囲を毎回調整 | 一括file選択候補 | まとめて受領可能 | 一括保存共有は要実機検証 |
| 8 完全性 | DOMにある構造を保持 | 同じDOMなら保持可能 | icon/ID/構造の欠落大 | 保存時のDOM次第 | 作成側の完全性次第 | MHTML内容次第 |
| 9 HTML変更耐性 | source parser依存 | source parser依存 | text labelにも依存 | parser更新/再解析可 | source adapter依存 | parser＋MIME差にも対応 |
| 10 誤取込 | URL/構造照合が可能 | 実行先/URLを検証 | 範囲不足・所属喪失 | 古い/別file・root誤認 | source/version偽装 | fileかURLかの誤認 |
| 11 validation統合 | 共通後段を利用 | 共通後段を利用 | 欠損は合格にしない | decode後共通 | packも再検証 | decode後共通 |
| 12 backup/rollback | 保存先設計が必要 | 同左 | 同左 | raw fileだけでは適用履歴backupでない | versioned私用pack有用 | 個人保存/known-goodが必要 |
| 13 利用条件 | ローカル抽出の条件確認 | 同左、CSP回避禁止 | copyできても再利用別 | 保存できても変換/公開別 | 公開packの権利追加 | 保存/変換/再利用別 |
| 14 source変更 | capture共通/adapter交換 | 同左 | text形式差が大きい | 共通decoder/adapter交換 | 後段形式を共通化 | 同左 |
| 15 保守 | addon配布＋adapter | 初回setup/CSP/長さ | 入力揺れが多い | MIME/charset＋adapter | 作成者の継続作業 | MIME＋PWA/worker＋adapter |

## 7. Phase 11で完了したこと / 停止地点

- 中断時のclean branchと既存Phase 10成果を確認。資料を失って再実装した状態ではない。
- AndroidのChrome/保存/共有/PWA/bookmarkletと拡張対応browserを追加調査し、操作・初回・複数ページの差を文書化した。
- 既存安全検査を再利用する設計、個人保存・backup・正式dataとの合成案をまとめた。**統合実装・新prototypeは未着手**。
- 自作fixtureでの受渡し・完全性・自動検証・保存試作は、方式選択後に実施できる。source自動取得許可待ちで開発全体を止めない。
- 全testの直近結果は222成功 / failed 0 / skipped 0。再開後Phase 10の33件も再確認成功。Android実操作testの成功数ではない。
- productionはPhase 9のまま。France/DokkanStatsを自動取得せず、main/本番Pages/OneDriveを変更していない。Phase 12へ進まない。

詳しい復元根拠・tests・利用条件・安全設計は[中断復元と手動intake設計](phase11-manual-intake-design.md)を参照。
