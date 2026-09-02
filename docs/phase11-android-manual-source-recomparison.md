# Phase 11 Android manual source・取得方法の再比較

調査日: 2026-09-03 JST

## 結論

**「Androidで新eventを1～数回の操作で丸ごと取り込む」という条件を、必要データの完全性と利用条件を保ったまま満たすsource／方法は、現時点では確認できなかった。**

- DokkanInfoは、保存済み実物でHP／ATK／DEF、複数Super、usage rule、neutral属性、表示AI、対象別AOE値まで復元でき、既存adapterも完成しているため、引き続き**技術面の第一候補かつ安全なfallback**である。
- ただし、eventページはstageリンクだけで敵詳細を持たない。`event 1 + stage N`保存は最終UXに採用せず、fallbackとして保持する。
- DokkanDBは、今回の少数通常閲覧でstage詳細の情報量が非常に高いことを再確認した。しかしeventページにstage詳細は集約されず、各stage／難易度の`BOSS STATS`ページを開く必要がある。Androidでの総ページ数を明確には減らさないため、DokkanInfoを置き換える優位はない。
- Android Chromeの通常の「共有」はページ本文ではなくリンクを渡す。PWAや小さなAndroid補助アプリを共有先にしても、受信側がURLを自動取得しない限り本文を得られない。URLの自動取得は禁止なので、通常共有だけでは解決しない。
- bookmarklet、対応browser拡張、補助アプリはMHTML保存やfile pickerを省ける可能性がある一方、eventページに詳細がない限り各stageを開く回数は減らせない。現段階で導入・実装コストに見合わない。
- **理想に最も近い受け渡し形式は、検証済みのevent単位update pack 1ファイル**である。Android側はstage数によらず約4操作にできる。しかし現在は合法かつ継続的なpack作成者／event一括exportがなく、ownerが元ページを全件保存してCodexへ渡すなら全体の手間は減らない。このtradeoffを隠して最終方式にはできない。

したがって今回はsourceを新規採用せず、DokkanInfo prototypeとcanonical以降の共通安全基盤を保持する。Phase 12、production統合、Android補助アプリ実装、PWA share target実装には進まない。

## 1. 中断地点と安全境界

- branch: `codex/phase11-manual-import-prototype-20260901`
- 再開時HEAD: `433e01b`、tag: `phase11-dokkaninfo-manual-prototype-2026-09-02`
- 再開時worktree: clean、remote branchと一致
- 既存prototype: DokkanInfo HTML/MHTML → local parse → canonical v2 → runtime → Phase 10 safety checks → diff → 明示確認 → 暫定IndexedDB
- 既存テスト基準: 270成功、うちPhase 11は48件

調査中にprototype、production UI、production enemy data、workflow、`main`、`origin/main`、OneDriveを変更していない。DokkanInfoの保存済みcacheはread-onlyで再利用した。FranceとDokkanStatsにはアクセスせず、問い合わせの再送・follow-upもしていない。

今回の外部確認は、検索結果・公式platform documentationと、DokkanDBの通常公開event 1ページ／stage 1ページ／利用規約1ページの少数閲覧だけである。sourceの自動取得、連続巡回、hidden API、background request、download、実データ保存は0である。

## 2. eventページに全stage詳細が含まれるか

### DokkanInfo保存cacheの全event監査

既に追跡されている2026-02-23 snapshotの`event_*.html`を、外部通信なしで全88件再検査した。

| 検査 | 結果 |
| --- | ---: |
| event HTML | 88 |
| eventから見つかる一意なstage link | 801 |
| 本文にHP labelを含むevent | 0 |
| 本文にATK labelを含むevent | 0 |
| 本文にDEF labelを含むevent | 0 |
| JSON script | 0 |
| 敵／stage／statsを持つ広告以外のinline script | 0 |

stage link数は最小1、中央値5、最大89で、10件を超えるeventも15件あった。画面に隠した全stage詳細、hydration JSON、data attribute等をevent 1ファイルから回復できる証拠はない。MHTMLは現在documentのresourceをまとめる形式であり、リンク先stage documentを自動的に取り込むものではないため、保存方式だけを変えても`stage N`は消えない。

### DokkanDBの現行少数確認

[Special Battle 2026 event 1768](https://www.dokkandb.com/events/challenge/1768)を通常表示で確認した。

- eventは2 stage × 3 difficultyで、6個の一意な`BOSS STATS` URLを持つ。
- event本文はstage名、difficulty、reward等を持つが、HP／ATK／DEF／Super damageは持たない。
- inline scriptは小さな設定・分析用とJSON-LDだけで、stage enemy statsを含むembedded JSON／hydration dataは確認できない。
- 1つの[stage詳細 17680023](https://www.dokkandb.com/events/challenge/1768/17680023)には、2 phase、HP、ATK、DEF、複数Super damage、最大使用回数、damage reduction、HP条件付きATK/DEF、scripted action loopとslotが表示された。

つまり1つのstage詳細ページは複数phaseをまとめられるが、event 1ページから複数stage詳細を復元できない。stage数ではなくdifficulty別URL数が入力ページ数になるeventもある。現行Android Chrome保存物にrender後DOMが残るかは、owner実機の保存sampleがないため未検証である。

## 3. source再比較

`○`は少数実物または既存snapshotで確認、`△`は一部／未測定、`×`は目的不足、`?`は推測せず未確認を表す。

| source | 1 eventの入力単位 | HP/ATK/DEF | 複数Super | AOE | AI / usage rule | Android保存・parser | recent性 | manual個人利用上の注意 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DokkanInfo | event 1 + stage N | ○ | ○ | ○（対象別値、kind不明時は停止） | ○（表示分） | 過去HTML○、synthetic MHTML○、現行Android実物? | 2026-08-23比較でrecent 4/4に詳細。初回掲載時刻? | 個人・非商用アクセスの記載はあるが、自動requestと複製・再配布に制限。個人抽出・保持の明示許可は未確認 | **fallback／技術第一候補。最終UXではない** |
| DokkanDB | event 1 + stage/difficulty N | ○ | ○ | 過去調査○、今回sampleは非AOE | ○、今回sampleは非常に詳細 | live DOM○、現行Android保存物?、adapterなし | event 1768は開始表示から5日以内の確認時に詳細あり。一方Phase 5では3 recent eventの長期欠損を観察 | 現行Termsはautomated scrape／harvest／bulk-downloadとhidden APIを禁止。open data license、個人抽出・保持の明示許可なし | 情報量は強いがページ数・許可・過去coverageで置換優位なし |
| DBZ Dokkan Battle France | 少なくともevent + stage。完全ページ数? | owner recent保存で**0** | 名称・効果はあり | 説明△、対象別値? | 条件・skill△ | owner保存は可能、core値が0 | recent page自体はあるがcore値欠損 | 2026-08-31にmanual local parsingを含めownerが照会済み、返信待ち | primary不可。許可後の補助候補のみ |
| dokkan.wiki | event enemy一括入力を確認できず | × | × | × | × | card用構造はあるが目的不適合 | enemy更新速度N/A | 自動requestとサイト複製に制限。manual保存で不足は解消しない | 不採用 |
| Fandom | event記事1～数ページになり得る | 不均一 | 不均一 | 文章△ | 文章△ | 文章は保存可能でもID・数値・所属が不安定 | revision差が大きく未測定 | Wiki本文は原則CC BY-SA条件。画像・転載dataは別。大量変換は出典／継承管理が必要 | 人間の補助確認のみ |
| GachaData | datasetなら1入力だがenemy datasetなし | player card用 | × | × | × | 構造化だが目的dataなし | Dokkan表示更新日は2026-08-14、enemy速度N/A | token、production契約、帰属、再配布条件が別途必要 | 不採用 |
| GitHub公開data | 完全なpackなら1fileだが該当なし | 主にplayer card／古いdata | × | × | × | file取得は容易でも内容不足 | current enemy feedを確認できず | code licenseは上流game dataの権利ではない | 不採用 |
| KX/schema・game DB解説 | data sourceではない | schema説明のみ | schema説明 | schema説明 | schema説明 | 最新敵dataを供給しない | N/A | DB復号・非公開配信物利用は別の契約／権利問題 | parser設計資料のみ |
| jp.dokkanbattle.net等の追加検索候補 | cardページ中心 | enemy eventは確認できず | × | × | × | 目的不適合 | cardのrecent例はenemy速度でない | data由来・利用条件を別途確認要 | 不採用 |

Fandom、dokkan.wiki、Franceを毎回併用しても、DokkanInfoに不足する確実な必須fieldを少ない操作で埋める根拠がない。通常更新を2～3サイト保存へ増やさない。異常値の人手照合先としては残せるが、自動mergeしない。

### Androidでownerが実際に行う手順

- **DokkanInfo**: eventページを開いて保存し、追加・変更対象のstageを1件ずつ開いて保存する。calculatorへ戻り、event 1件とstage最大9件を選び、解析結果を確認して取り込む。10 stage以上はbatchを分ける。
- **DokkanDB**: eventページで対象stage／difficultyを確認し、各`BOSS STATS`を1件ずつ開いて保存する。その後のfile選択・確認・取り込みはDokkanInfoと同程度になる。現行Android保存fileでparser可能かは未検証で、新adapterもない。
- **France**: event／stageページを開いて保存する操作自体は可能だが、ownerのrecent実物ではHP／ATK／DEF／Super damageが0だった。calculatorに必要な候補を作れないため、取り込み手順として成立しない。
- **dokkan.wiki／Fandom**: event記事を開いて保存しても、敵ID・所属・全数値・AI等が一貫して揃わない。足りない値をownerが探して入力する必要が生じるため、日常importには使わない。
- **GachaData／GitHub公開data／その他検索候補**: Androidでfileを1件downloadすることは容易でも、今回確認できたものはplayer card中心または古い不完全dataで、event enemy updateの入力にならない。
- **event update pack**: 許可済みproducerから1fileを受け取り、calculatorで選択し、差分確認後に適用する。Android側は最短だが、現在はそのproducer／export／利用許可が存在しない。

新規／変更stageだけを対象にできる場合でも、DokkanInfo／DokkanDBでownerが触るページ数は`event確認 1 + 変更stage数`が基本になる。source側のevent一覧から「productionの647 stageとの差」を安全に自動判定できる埋め込みID一覧は確認できず、eventページを省くと取りこぼし検査が弱くなる。

## 4. 5／10／20 stageの実操作量

### 数え方

Android実機のtap計測ではなく、公式操作手順と既存prototypeから作った**下限設計値**である。

- source 1ページ: `開く`1 + Chrome `︙`1 + `ダウンロード`1 = 3操作
- calculator側: tab切替2 + `ファイル選択`1 + 各file選択1 + picker確定1 + `取り込む`1
- 現prototypeは最大10 filesで、event page 1件を各candidateに必要とするため、1 batchはevent 1 + stage最大9である。
- stage探索、前ページへ戻る、download完了待ち、保存先探索、OS dialog、scroll、file整理は加算していない。実際は表より増える。

### 現在のDokkanInfo file prototype

`B = ceil(stage数 / 9)`、event fileは各batchで再選択する。全ページの保存後にcalculatorへ1回切り替える想定で、下限は`4N + 5 + 4B`操作となる。

| 新stage数 | 開くsourceページ | 保存回数 | file選択tap | import batch | 下限操作数 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | 6 | 6 | 6 | 1 | **29** |
| 10 | 11 | 11 | 12（eventを2回選択） | 2 | **53** |
| 20 | 21 | 21 | 23（eventを3回選択） | 3 | **97** |

既存snapshotにはstage link 89件のeventもある。この方式は安全に動くが、毎回使って苦にならない最終形ではない。

### source別のページ数

| source／方法 | 5 stage | 10 stage | 20 stage | stageごと保存 |
| --- | ---: | ---: | ---: | --- |
| DokkanInfo | 6 pages / 6 saves | 11 / 11 | 21 / 21 | 必要 |
| DokkanDB（event completenessも確認） | 原則6 / 6 | 11 / 11 | 21 / 21 | stageまたはdifficultyごとに必要 |
| France | 成功件数を算出不可 | 同左 | 同左 | core値0のため操作数以前に不合格 |
| dokkan.wiki／Fandom | 1～数pageで記事は読めても完全import不可 | 同左 | 同左 | 必須data不足 |
| GachaData／GitHub現候補 | 有効入力0 | 有効入力0 | 有効入力0 | enemy datasetなし |
| event update pack（受取側だけ） | 1 file | 1 file | 1 file | 不要 |

DokkanDBのstageページにはevent名もあるため、既知の変更stageだけならeventページを省くadapterも設計可能である。しかし、それではevent内のstage一覧と取りこぼしを検査できない。**event全体の完全更新**をDokkanInfoと同条件で比べる場合はeventページも必要で、明確な操作削減ではない。

## 5. MHTML保存を省く方式

| 方式 | できること | 5 / 10 / 20 stageの下限イメージ | event全体の改善 | 判定 |
| --- | --- | --- | --- | --- |
| Chrome通常共有 → PWA／app | title、text、URLまたは送信済みfileを受信 | URLだけでは0件import | 受信側がURL fetchしない限り本文なし | 不適合 |
| bookmarklet → local serialize → PWA inbox | 表示中DOMを保存せず渡す余地 | P=6/11/21で約25/45/85 tap + 短い名前入力6/11/21回（最終確認を1回へまとめる未実装の下限） | page数は6/11/21のまま | file工程は省けても最終UXにならない |
| Firefox Android等のDOM拡張 | 表示中tabを直接parseして蓄積可能 | P=6/11/21で約26/46/86操作 + 初回browser/add-on導入 | page数は同じ | Chrome変更の負担に見合わない |
| Android補助appへ通常共有 | URL/text受信は可能。fileならfile受信可能 | 通常共有だけではimport不可 | DOMは届かず、page数も減らない | 今は作る価値なし |
| Android補助app内WebView | ownerがapp内で各pageを開けばDOM取得可能 | stageごとの手動navigation | 自動でlink先を開けば禁止された自動巡回になる | 不採用 |
| 保存済みfile → PWA share target | file pickerを共有1回へ短縮し得る | 保存N+1は残る | acquisitionの主要負担は残る | fallbackの後段改善に限る |

[Chrome公式のAndroid共有手順](https://support.google.com/chrome/answer/10051760?co=GENIE.Platform%3DAndroid&hl=ja)は「共有先へリンクを渡す」と説明する。[Android Sharesheet](https://developer.android.com/develop/ui/compose/sharing/send)も、browserは通常、現在URLをtextとして共有すると説明している。[Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)はPWAがtext／URL／fileを受け取る仕組みであり、送信元tabのDOMを読む権限ではない。

Android Chromeはmobile端末へ通常のChrome拡張を導入できない。[Chrome Web Store Help](https://support.google.com/chrome_webstore/answer/1698338)参照。Firefox Androidには[正式なadd-on導入経路](https://support.mozilla.org/en-US/kb/find-and-install-add-ons-firefox-android)があるが、browser変更とaddon配布・保守を必要とし、stage数を減らさない。

## 6. update packの現実性

### 受け取るownerだけを見た場合

event単位の検証済みpackが既に用意されていれば、Androidでは次の約4操作にできる。

1. packを開く／downloadする。
2. calculatorで`更新データを読み込む`を押す。
3. 1fileを選ぶ。
4. 差分を確認して適用する。

5／10／20 stageすべて1file・約4操作で、今回の理想に最も近い。canonical変換、schema、ID、loss、digest、semantic、production composite diff、atomic apply、known-good、rollbackはPhase 10／11基盤を再利用できる。

### packを作る人まで含めた場合

- owner自身がDokkanInfoから作る: event 1 + stage N取得が先に必要で、総手間は減らない。
- ownerが保存fileをCodexへ渡す: N+1保存に加え、Codex task作成、添付、結果受領が増える。Codexは未許可sourceを代行自動取得できない。
- Windows PCでDOM拡張を使う: 保存file操作は軽くなるが、各stageを開く回数は残り、Androidだけで完結しない。
- source運営者／許可済みproducerがevent exportを出す: ownerは1fileで済み、初めて本当に操作を減らせる。しかし現在その提供者・許可・継続性はない。
- public pack: 個人保存よりさらに取得・派生data公開・履歴保持・再配布の許可が必要。現在は不可。

したがってupdate packは**最良の最終受け渡し形式**だが、現時点の完成済み取得方式ではない。誰が合法に作るかを決めずに「ownerは4操作」とだけ報告してはならない。

## 7. 最も理想に近い方法とownerが実際にすること

### 条件が整った将来の推奨

**許可済みproducer／sourceが作るevent単位update pack → Android calculatorで1fileを確認・適用**が最も理想に近い。

ownerの日常操作は、`新eventのpackを開く → calculatorへ渡す → 差分確認 → 適用`で、stage数によらず約4操作となる。producer側ではevent一括export、canonical adapter、Phase 10 safety checks、署名／digest、配布履歴を自動または許可範囲内で整える。

### 現在すぐ使える方法

権利とproducerが未解決なので、現在すぐ成立するのはDokkanInfoの`event 1 + stage N`保存prototypeだけである。これはfallbackであり、Phase 11の最終primary UXとは認定しない。

### ownerの確定方針

ownerは2026-09-03に、**1 event 1～数回を最終目標として維持し、DokkanInfoのstage単位保存を今すぐ必要な場合のfallbackに限定する**方針を選択した。許可済みevent export／pack producerが見つかるまで最終方式を固定せず、manual intake UXの小さな省tap改善を続けない。

補助アプリを今作ってもproducer不足やevent一括data不足は解決しないため、現段階では実装しない。正式な停止地点と再開条件は[Phase 11 closeout](phase11-closeout.md)へ記録した。

## 8. 既存基盤の再利用と停止地点

どのsource／受渡し方式になっても、次は作り直さない。

- HTML/MHTML decode、size／MIME／identity検査
- source adapter contractとprovenance
- canonical v2とruntime projection
- required-field／unknown／AOE target semantics
- Phase 10 permission-purpose gate、schema、ID、loss、digest、semantic、composite diff
- explicit owner review、atomic apply、known-good、rollback
- production dataとpersonal dataの分離

今回は新adapter、bookmarklet、PWA、Android app、pack producerを実装していない。source比較と操作数の再評価で停止する。Phase 12には進まない。

## 9. 検証結果

- DokkanInfo cache監査: 88 event／801 stage link、event本文のHP・ATK・DEF各0、埋め込みJSON 0、関連inline data 0
- DokkanDB少数通常閲覧: event 1、stage detail 1、Terms 1。event集約なし、stage detailの2 phaseと複数Super／AIを確認
- France／DokkanStatsへのアクセス: 0
- source automatic fetch／crawler／background traversal／hidden API: 0
- prototype code変更: 0
- production／main／origin/main／OneDrive／production enemy data／workflow変更: 0
- `npm test`: **270成功、failed 0、skipped 0、cancelled 0**（Phase 11はdata 35 + Chromium／WebKit 13 = 48件）
- 今回は比較・記録のみのため、新しいtest caseとprototype build内容は追加していない。既存のlocal-only／no-request／安全gate回帰を全件再実行した。

既存prototypeの詳細と前回テストは[DokkanInfo manual prototype報告](phase11-dokkaninfo-manual-prototype.md)、Android方式の初回比較は[manual update方式比較](phase11-manual-update-options.md)、sourceの自動／公開用途の前提は[Phase 10 source調査](phase10-source-research.md)を参照する。
