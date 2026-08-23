# 第5段階 敵データ正本・継続更新方式の評価

作成日: 2026-08-23（JST）

対象ブランチ: `codex/phase5-data-source-design-20260823`

状態: 第5段階の調査・設計完了。本番移行、問い合わせ送信、外部大量取得、公開方法と普段の使い方の変更は未実施。

## 初心者向けの結論

現時点の推奨は、**DokkanStatsを「最初に正式利用を相談する第一候補」にするが、まだ主取得元には決定しない**ことである。

理由は次のとおり。

- DokkanStatsは、この計算機が必要とするATK、必殺、条件、AI、AOE、会心を一つのサイトでかなり広く表現している。
- 利用規約に「事前の書面許可」という正規の相談経路が明記されている。
- 一方で公開API・export・open data licenseは確認できず、無許可の自動取得はできない。
- 最近のステージでもHP・ATK・DEFが`?`の公開例があり、「詳細値が原則1週間以内に揃う」とはまだ認定できない。
- Challenge／Quest以外を含む過去全範囲、安定した機械可読ID、追加対象を含むAOE値、中立、更新・訂正時刻も未確認である。

したがって、今すぐ「1つの取得元だけで十分」とは言えない。ただし最初から複数取得元を組み合わせるのでもない。まずDokkanStatsへ完成済みの問い合わせを送り、正式なデータ経路・許可範囲・履歴・更新速度を確認する。回答後の少数sampleで必須gateを通れば、**DokkanStats単独で過去全部を再構築する実験**へ進む。不足が「現在の計算に本当に必要な項目」だと確認された場合だけ、別の取得元を検討する。

それまでは次を維持する。

- 現行本番敵データを正本として使い続ける。
- 約691 MBの保存済みDokkanInfo HTMLは削除せず、照合・parser回帰・移行backupの証拠資料にする。
- 新schemaの設計思想は将来の正本に採用するが、現在の`enemy-data-v1.draft`をそのまま本番固定しない。
- OneDrive、GitHub Pages、更新ボタン、localStorage、公開版は変更しない。

## 今回行ったことと行っていないこと

行ったことは、既存コード・candidate・保存cacheの読取、各サイトの通常の公開ページと規約の少数確認、項目coverage・更新性・ID・将来構成の設計である。

行っていないことは次のとおり。

- 問い合わせ送信
- site-wide crawl、bulk download、内部／非公開API探索
- Cloudflare等の技術的制限の回避
- 本番敵JSON置換
- 新schemaの本番接続
- localStorage変更
- GitHub Pages公開変更
- OneDriveでの普段の使い方変更
- update UI、workflow、Viteの導入

外部サイトの表示は2026-08-23時点の公開情報であり、全record監査ではない。規約・表示・内容は将来変わり得る。

## coverageの読み方

「項目がどこか1ページにあること」と「全期間・全ステージで欠けずに取得できること」は別である。本報告では次の5状態を使う。

| 表記 | 意味 |
| --- | --- |
| `C` | 今回の範囲で対象全体の充足を確認できた |
| `P` | 項目の存在は確認したが、欠損例、意味不足、履歴範囲未監査のいずれかがある |
| `A` | 対象に存在しないことを確認した |
| `U` | 公開情報だけでは存在または最新状態を判定できない |
| `N/A` | 固定snapshot等、その評価軸の用途自体を持たない |

二つの率も分ける。

- **厳格な完全率**: `C / 16`。単独正本として公開情報だけで保証できる範囲。
- **観測capability率**: `(C + P) / 16`。少なくとも一つの公開sampleで、その種類の情報を表現していると確認できた範囲。

後者が高くても、多くのrecordが欠けている可能性がある。実際の本番判断では、書面許可後に`値あり / その値が適用されるrecord`を項目ごとに測る。一般敵の大量のATKで希少なAOE・会心の欠損を隠さないよう、項目別率を平均し、`対象外`、`0`、`不明`、`source未掲載`を分ける。

## このアプリに必要なデータ項目

現在の計算で使う値だけでなく、安全に更新を継続するためのIDと根拠も「必須」に含めた。

| 区分 | 論理field群 | この区分にした理由 |
| --- | --- | --- |
| 必須 1 | event／stage階層、表示名 | 敵を人が選び、差分をevent単位で確認するため |
| 必須 2 | app側の安定ID、利用可能なsource ID、またはsource内で決定的な複合keyと順序 | 独立enemy IDがないsourceでも、名前一致による誤結合を防ぐため |
| 必須 3 | 5属性 | 属性相性の計算に使う |
| 必須 4 | 超・極・中立・不明の区別 | class相性を誤補完しないため |
| 必須 5 | 基礎ATK | 通常・必殺の中心値 |
| 必須 6 | 複数必殺を含む必殺値・元倍率 | 旧形式の3倍誤補完を防ぐため |
| 必須 7 | 必殺時ATK上昇と必殺後の通常ATK | 同turn内の被ダメージを計算するため |
| 必須 8 | turn、被弾回数、HP、登場turn等のATK条件 | 動的な敵ATKを計算するため |
| 必須 9 | AOEの先頭対象値 | 現行アプリがAOEを扱うため |
| 必須 10 | AOEの追加対象値、target mode、attack kind | 1人目と2人目以降の値を混同しないため |
| 必須 11 | 会心が通常／必殺のどちらに適用されるか | 適用範囲を誤らないため |
| 必須 12 | 会心率と発動条件 | 条件付き会心を表現するため |
| 必須 13 | 会心時ATK倍率 | 会心被ダメージを計算するため |
| 必須 14 | 会心時DEF無視率 | 会心被ダメージを計算するため |
| 必須 15 | 取得日時、source revision、evidence、confidence | 更新・訂正・根拠を監査するため |
| 必須 16 | `0`、`null`、対象外、未確認の区別 | 不明値を0や既定倍率へ誤補完しないため |
| できれば欲しい 1 | 必殺の確率、HP band、最大回数、cooldown、slot | 表示・条件再現を詳しくできる |
| できれば欲しい 2 | AI sequence、攻撃位置、対象、確率 | turn全体の再現に役立つが、現在の一発計算には全量不要 |
| できれば欲しい 3 | 最大攻撃回数、頻度、charge | 行動頻度を案内できる |
| できれば欲しい 4 | skill ID、原文、raw evidence | parserと意味変換を検算しやすい |
| 将来用 1 | 敵HP | 将来のHP帯simulationに使える |
| 将来用 2 | 敵DEF | 与ダメージ機能を拡張する場合に使える |
| 将来用 3 | 敵ダメージ軽減 | 与ダメージ機能を拡張する場合に使える |
| 将来用 4 | 回復、封印、ロック等を含むturn全体の効果 | 完全な戦闘simulationを行う場合に使える |
| 現用途では不要 | 画像本体、攻略記事、サイトのHTML／CSS／design、player card一式 | 敵の耐久計算に不要で、権利・容量・保守範囲だけを増やす |

敵HP・DEF・軽減は便利だが、現在の「敵から受ける一発のダメージ」には使っていない。攻撃位置と完全なAIも現時点では「できれば欲しい」である。**これらだけのために補助取得元を増やさない。**

### 24群のsource別field capability

次は全件充足率ではなく、通常の公開sampleと保存cacheから「その意味を少なくとも確認できたか」を示すfield capability表である。`P`でも全record取得を保証しない。`U`は未確認、`A`は今回確認した表示・保存形式では必要な数値がない。live DokkanInfoと保存cacheは、履歴範囲とevidence能力が異なるため分けた。観測capability率では、field群の一部だけを確認した`P`も1群として数えるため、実record coverageではなく楽観側の上限参考である。

| 区分・番号 | 論理field群 | DokkanStats | DokkanDB | DokkanInfo live | 保存DokkanInfo |
| --- | --- | :---: | :---: | :---: | :---: |
| 必須 1 | event／stage階層・表示名 | P | P | P | P |
| 必須 2 | stable app IDを作るsource ID／決定的複合key・順序 | P | P | P | P |
| 必須 3 | 5属性 | P | P | P | P |
| 必須 4 | 超・極・中立・不明 | P（中立U） | P（中立U） | P（中立U） | P（中立443件） |
| 必須 5 | 基礎ATK | P | P | P | P |
| 必須 6 | 複数必殺・必殺値・元倍率 | P | P | P | P |
| 必須 7 | 必殺時ATK上昇・必殺後通常 | P | P | P | P |
| 必須 8 | turn・被弾・HP・登場条件 | P | P | P | P |
| 必須 9 | AOE先頭対象値 | P | P | P | P |
| 必須 10 | AOE追加対象値・target・attack kind | U | P | P（event 1769 sample） | P |
| 必須 11 | 会心の通常／必殺への適用範囲 | P | P | P | P |
| 必須 12 | 会心率・条件 | P | P | P | P |
| 必須 13 | 会心ATK倍率 | P | P | A | A |
| 必須 14 | 会心DEF無視率 | P | P | A | A |
| 必須 15 | source公開／取得／訂正時刻・revision・evidence・confidence | U | U | U | P（取得時刻・evidence、source revisionはU） |
| 必須 16 | 0／null／対象外／未確認の区別 | P | P | P | P |
| できれば 1 | 必殺chance・HP band・max・cooldown・slot | P | P | P | P |
| できれば 2 | AI sequence・攻撃位置・対象・確率 | P | P | P | P |
| できれば 3 | 最大攻撃回数・頻度・charge | P | P | P | P |
| できれば 4 | skill ID・原文・raw evidence | P | P | P | P |
| 将来 1 | 敵HP | P | P | P | P |
| 将来 2 | 敵DEF | P | P | P | P |
| 将来 3 | 敵damage reduction | P | P | P | P |
| 将来 4 | 回復・封印等を含むturn全体効果 | P | P | P | P |

| 取得元 | 必須16群の観測capability | 有用24群の観測capability | 実record充足率 | 全件完全と認定できた有用群 |
| --- | ---: | ---: | --- | ---: |
| DokkanStats | 14 / 16 = **87.5%** | 22 / 24 = **91.67%** | 許可前のため未測定 | 0 / 24 = **0%** |
| DokkanDB | 15 / 16 = **93.75%** | 23 / 24 = **95.83%** | 許可前のため未測定 | 0 / 24 = **0%** |
| DokkanInfo live | 13 / 16 = **81.25%** | 21 / 24 = **87.5%** | 無許可全件監査をしないため未測定 | 0 / 24 = **0%** |
| 保存DokkanInfo | 14 / 16 = **87.5%** | 22 / 24 = **91.67%** | 801既知stageをPhase 6でfield別再集計 | 0 / 24 = **0%** |

DokkanInfo liveの必須13 / 16は、会心ATK倍率、会心DEF無視率、source revisionを満たせないという数え方である。保存cacheは取得時刻とevidenceを持つため14 / 16だが、source側のrevisionはない。DokkanStats／DokkanDBも、正式なID・null・revision契約を得るまでは各該当行を完成扱いにしない。

## 3取得元の固定16群比較

依頼で指定された16群を同じ分母で比較した。保存cacheも、live DokkanInfoとは別の取得元状態として載せた。

| 項目 | DokkanStats | DokkanDB live | DokkanInfo live | 保存DokkanInfo |
| --- | :---: | :---: | :---: | :---: |
| 過去event | P | P | P | P |
| 過去stage | P | P | P | P |
| 最新stage | U | P | P | N/A |
| ATK | P | P | P | P |
| DEF | P | P | P | P |
| HP | P | P | P | P |
| 属性 | P | P | P | P |
| 超／極 | P | P | P | P |
| 必殺 | P | P | P | P |
| 必殺条件 | P | P | P | P |
| AI | P | P | P | P |
| AOE | P | P | P | P |
| 会心 | P | P | P | P |
| 攻撃回数 | P | P | P | P |
| turn条件 | P | P | P | P |
| HP条件 | P | P | P | P |

| 取得元 | C | P | A | U | N/A | 厳格な完全率 | 観測capability率 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DokkanStats | 0 | 15 | 0 | 1 | 0 | 0 / 16 = **0%** | 15 / 16 = **93.75%** |
| DokkanDB live | 0 | 16 | 0 | 0 | 0 | 0 / 16 = **0%** | 16 / 16 = **100%** |
| DokkanInfo live | 0 | 16 | 0 | 0 | 0 | 0 / 16 = **0%** | 16 / 16 = **100%** |
| 保存DokkanInfo | 0 | 15 | 0 | 0 | 1 | 0 / 15 = **0%** | 15 / 15 = **100%**（最新更新は対象外） |

`0%`は「情報がない」という意味ではない。例えばDokkanStatsは15群の実在を確認しているが、公開sampleだけでは全履歴・全recordで完全だと保証できる群がまだ0、という安全側の評価である。逆に`100%`も、全recordが100%埋まる意味ではない。DokkanDBとDokkanInfoのchallenge event IDは107 / 107で一致したが、全event categoryを監査した値ではないため「過去event」も安全側に`P`とした。

### 過去範囲を件数で比べた結果

| 取得元 | 今回確認できた過去範囲 | 詳細dataの実件数 | 限界 |
| --- | --- | --- | --- |
| DokkanStats | [公式updates](https://dokkanstats.com/en/updates/)は全eventを閲覧できるcatalogを掲げる。古いQuest、Boss Rush、Storyを少数確認 | 未測定。公式にboss statsを説明しているのはChallenge／Quest | catalog掲載とboss詳細完成は別。全category・全stage censusは許可前のため未取得 |
| DokkanDB live | challenge event ID 107件。確認範囲はID 701～1769 | 未測定。recent eventにstage詳細欠落あり | 107はchallengeだけで、全category／全stage件数ではない |
| DokkanInfo live | challenge event ID 107件。DokkanDBとID集合が一致 | 未測定。recent 4 event sampleは詳細あり | 107はchallengeだけ。live全件監査と自動取得は行っていない |
| 保存DokkanInfo | 2026-02-23 snapshotの88 event／801 stage／1,352 encounter／5,032 enemy | combat stage 757、combat enemy 4,673 | 全履歴ではなく固定snapshot。live challengeとの差は19 event ID |

したがって、現時点で「過去全stageを何件取得できるか」を数字で答えられるのは保存cacheだけである。その801件も全歴史の母数ではなく、全再構築実験の既知照合集合である。新sourceの正式censusを取得できるまでは、source自身の掲載件数を分母にして完全率を作らない。

新schemaの必須16群に置き換えても、公開情報だけではどのsourceも完全ではない。主な未確認・不足は次のとおり。

| 必須項目 | DokkanStats | DokkanDB | DokkanInfo |
| --- | --- | --- | --- |
| source-neutralなenemy occurrence ID | URL用IDはあるが正式契約は未確認 | 独立IDは確認できず複合keyが必要 | 独立IDは確認できず複合keyが必要 |
| 中立の機械可読表現 | 未確認 | sampleだけでは全件未確認 | 保存cacheには中立443件。ただしliveの正式契約ではない |
| AOEの先頭／追加対象別の値 | AOE自体は確認、別値は未確認 | 掲載stageでは確認 | 掲載stageと保存cacheで確認 |
| 会心ATK倍率・DEF無視率 | sampleで倍率・DEF低下相当を確認、全件未監査 | 掲載stageでは1.5倍・DEF無視まで確認 | 定性文中心で数値不足・`NULL`例あり |
| sourceの公開・訂正時刻、revision | 未確認 | 未確認 | 未確認 |
| `0`／不明／対象外 | `?`はあるが意味契約がない | 全件の意味契約なし | 0・空欄・`NULL`に意味劣化例あり |

前節の必須capability率も、全recordの値がその率で埋まる意味ではない。source-wideの厳格な完全率は上表のとおり全て0%である。例えばDokkanDBは論理fieldが多くても、stage詳細ページ自体がないrecent eventでは全部取得できない。

正確な「全有用24群の実record充足率」は、許可後の全件または正式exportがなければ測れない。少数の公開ページから見かけの高い数字を作るより、Phase 6でcoverage report形式を先に固定し、許可後にfield別の実測値を出す。

## DokkanStatsの重点評価

### 強い点

- [2026-06-12の公式更新記録](https://dokkanstats.com/en/updates/)は、Challenge ModeとQuest Modeにboss stat dataを追加したと説明している。
- 豊富なstage例ではHP、ATK、DEF、DR、最大攻撃数、複数必殺、必殺倍率、turn・HP条件、AI chance／max／cooldown、scripted AI、AOE、会心条件まで表示する。
- URLは概ね`/events/{category}/{areaId}/{stageMapId}`で、calculator queryには`area`、`boss`、`phase`、`saIndex`、`smap`、`type`がある。移行mappingの材料にはなる。
- [公式Terms](https://dokkanstats.com/en/terms-of-use/)は、無許可のscrape・crawl・systematic downloadを禁止する一方、「prior written permission」という相談経路を明記している。
- [公式Contact](https://dokkanstats.com/en/contact/)と`contact@dokkanstats.com`がある。

### まだ主取得元にできない理由

- 一般向けに文書化された公開API、export、open data license、change feedを確認できない。
- Termsは正確性・完全性・適時性を保証していない。
- 公式更新記録の「complete boss stat data」はChallenge／Questについてであり、Story、DB Story、Growth、Z-Battle等を含む全カテゴリ保証ではない。
- [All-Out Battles 2 Stage 12](https://dokkanstats.com/en/events/challenge/1751/17510123)について検索indexが保持するcached snapshotでは、開始日が2026-08-06と表示される一方、HP、ATK、DEF、必殺Total Damageが`?`だった。stage掲載と計算用詳細の完成は別である。現在のlive状態は確認できていない。
- [情報が豊富なsample](https://dokkanstats.com/en/events/challenge/1704/17040095)は存在するが、古い[Boss Rush](https://dokkanstats.com/en/events/challenge/701/7010125)の`No enemy data found`や[Story](https://dokkanstats.com/en/events/story/1312/13120080)の`?`も確認した。
- `stageAddedAt`、`bossStatsCompletedAt`、`lastCorrectedAt`が公開されず、正確な更新日数を測れない。
- AOEの先頭対象／追加対象別値、中立、stable occurrence ID、変更・削除feedは未確認である。

### 判断

DokkanStatsは**条件付き第一候補**である。次を全部満たした場合だけ、単独主取得元として採用する。

1. 自動取得と派生JSON公開再配布について書面許可を得る。
2. 公式API、export、change feed等、運営者が指定する安定経路を得る。
3. 日本版の必要カテゴリと過去履歴範囲が分かる。
4. 必須16群をsampleと全再構築実験で満たす。
5. 直近複数stageの詳細完成が原則7日以内だと実測できる。
6. ID、欠損、訂正、削除を黙って推測せず扱える。

## DokkanDBの評価

DokkanDBは、掲載済みstageの1件あたりの情報表現では非常に強い。

- actionごとのchance、max、cooldown、攻撃slot、weighted pick、next action、scripted loopを正規化表示する。
- 会心を100%、ATK 1.5倍、DEF無視まで表すsampleがある。
- AOEをchance、max、cooldown、slotと統合して表す。
- event／stage／card等のIDは得られるが、独立したenemy occurrence IDは確認できず、複合keyが必要である。

しかし、challenge event IDのcatalogはDokkanInfo liveと同じ107件だった一方、直近4イベントの詳細確認では、DokkanInfoが4/4、DokkanDBが1/4だった。

- event 1769はDokkanInfo mission欄の開始表示から約30時間後に、[DokkanDB](https://dokkandb.com/events/challenge/1769/17690015)と[DokkanInfo](https://jpnja.dokkaninfo.com/events/challenge/1769/17690015)の両方で詳細を確認した。
- event 1766、1765、1762は、同じ開始表示からおよそ25日、32日、73日の確認時にもDokkanDBの公開UIでstage詳細を確認できなかった。DokkanInfoにはstage詳細があった。

これはDokkanDB内部の実更新日時ではなく、「公開UIで利用できない状態を確認した期間の下限」である。一時的な表示不具合の可能性までは除外できない。それでも、現状の主取得元coverageに対する重大な反証である。

[DokkanDB Terms](https://dokkandb.com/legal?tab=terms)はautomated scrape／harvest／bulk downloadとhidden/private APIへのアクセスを禁止し、公開data APIやopen licenseは確認できない。したがって、**詳しいから無許可で補助sourceにすることもできない**。正式export、書面許可、最近stageのcoverage、更新timestampが得られた場合に再評価する。

Phase 3の「技術的第一候補」という評価は、次のように修正する。

> DokkanDBは掲載済みstageの意味表現では第一級だが、現在の最近stage網羅性と利用許可の両方が未達であり、主取得元ではない。

## DokkanInfoの評価

### live site

今回の直近4イベントsampleでは4/4にstage詳細があり、最近stageの見かけの網羅性はDokkanDBより良かった。HP、ATK、DEF、DR、必殺、条件、AI、AOE等を持つ。

一方、会心は定性文中心で倍率・DEF無視率が不足し、scripted SAの率／最大回数が0または空欄、weighted branchや攻撃位置を単純化する例がある。[DokkanInfo Terms](https://jpnja.dokkaninfo.com/terms)はautomated agent／scriptによるrequestを制限し、複製・配布にも制限がある。open licenseや派生JSON公開許可は確認できない。

よって、**live DokkanInfoを無許可の自動取得元へ戻さない。**

### 保存済みHTML

保存cacheは次の既知集合を持つ。

- snapshot取得時刻: `2026-02-23T08:11:11.385Z`
- 88 event
- 801 stage
- 1,352 encounter
- 5,032 enemy
- combat enemy 4,673
- 戦闘ATKを持つstage 757
- preview／非戦闘相当 44 stage

2026-08-23のlive challenge event ID 107件に対してcacheは88件で、liveだけにあるIDは19件、cacheだけにあるIDは0件だった。cacheは「2026-02-23時点の全歴史」を保証するものではないが、現在手元にある最も大きな独立照合集合である。

今後の役割は次のとおり。

- 新sourceのstage発見recall: `一致stage / 801`
- combat詳細coverage: `必須項目が揃うstage / 757`
- 5,032 enemyとのATK、DEF、属性、必殺、AI、AOE照合
- 中立443、表示必殺なし95、複数必殺79、AOE75、AI action 1,679等の希少case回帰
- parser fixture、移行時backup、source間不一致の証拠

新sourceがgateを通れば、保存HTMLは**本番生成の必須入力から、照合資料・parser回帰・移行backupへ格下げ**する。削除しない。

## 新ステージ更新速度

### 公開情報から確認できたこと

DokkanStatsの複数sampleは次のとおり。詳細がある2件の日数は「その日までに存在した」という上限であり、初回完成日ではない。欠損sampleは取得できたsnapshotのsource側時刻がないため、欠損継続日数を厳密に確定しない。

| stage | source pageの開始表示 | 2026-08-23調査で確認できた状態 | 厳密な詳細完成lag |
| --- | --- | --- | --- |
| [Invincible Guardians Stage 3](https://dokkanstats.com/en/events/challenge/1748/17480032) | 2026-07-29 | HP／ATK／DEF／DR／攻撃数／必殺／AIあり | 不明。確認日基準の粗い上限は25日 |
| [Gendarmerie Stage 2](https://dokkanstats.com/en/events/challenge/1747/17470025) | 2026-08-04 05:00 | HP／ATK／DEF／DR／攻撃数あり。一部必殺名は`None` | 不明。確認日基準の粗い上限は19日 |
| [All-Out Battles 2 Stage 12](https://dokkanstats.com/en/events/challenge/1751/17510123) | 2026-08-06 05:00 | 検索indexのcached snapshotはHP／ATK／DEF／Total Damageが`?` | 不明。index metadataは約2週間前という粗い値だけで正確な取得時刻がなく、liveはCloudflare確認画面のため回避せず未確認 |

DokkanDBとDokkanInfoは同じ最近4 eventを比較した。

| event | DokkanInfo mission欄の開始表示 | 2026-08-23 19:38～19:42 JSTのDokkanDB公開UI | 同時刻のDokkanInfo公開UI | 更新速度として言えること |
| --- | --- | --- | --- | --- |
| [1769 DB](https://dokkandb.com/events/challenge/1769/17690015)／[Info](https://jpnja.dokkaninfo.com/events/challenge/1769/17690015) | 2026-08-22 14:00 | 約30時間後の確認で詳細あり | 同じ確認で詳細あり | 両方に良い1例。ただし初回掲載時刻は不明 |
| [1766 DB event](https://dokkandb.com/events/challenge/1766)／[DB stage](https://dokkandb.com/events/challenge/1766/17660015)／[Info](https://jpnja.dokkaninfo.com/events/challenge/1766) | 2026-07-29 14:00 | eventにstage link 0。stage直URLにもBoss Stats本文なし | 2 stageのlink・詳細あり | 開始proxyから約25日後にもDB公開UIで詳細を確認できなかった下限 |
| [1765 DB](https://dokkandb.com/events/challenge/1765)／[Info](https://jpnja.dokkaninfo.com/events/challenge/1765) | 2026-07-22 14:00 | eventにstage link 0。stage直URLは未確認 | 3 stageのlink・詳細あり | 開始proxyから約32日後にもDB event UIで詳細を確認できなかった下限 |
| [1762 DB](https://dokkandb.com/events/challenge/1762)／[Info](https://jpnja.dokkaninfo.com/events/challenge/1762) | 2026-06-11 14:00 | eventにstage link 0。stage直URLは未確認 | 2 stageのlink・詳細あり | 開始proxyから約73日後にもDB event UIで詳細を確認できなかった下限 |

ここで使った開始日時はDokkanInfoのmission欄に表示された値で、Bandai公式release時刻やsourceの更新時刻ではない。一時的なUI不具合の可能性も残るため、25／32／73日をDokkanDB内部の真の更新lagとは断定しない。それでも同一sessionで1769は正常表示されたため、現在の公開UIを主取得元にする際のcoverage反証にはなる。

| 取得元 | 最近の確認例 | 確認できる範囲 | 1週間要件 |
| --- | --- | --- | --- |
| DokkanStats | 2026-07-29開始stageは詳細あり、2026-08-04開始stageも詳細あり、2026-08-06開始Stage 12のcached snapshotはHP／ATK／DEFが`?` | source側の詳細完成timestampがなく、最短・典型・最大を算出不能 | **評価gate未達**。実lagは不明だが、1週間以内を証明できない |
| DokkanDB | 2026-08-22開始event 1769は約30時間後に詳細あり。他の最近3 eventは25／32／73日後の確認でも詳細なし | 最短の良い例と長期欠損が混在。正確な掲載日時は不明 | **満たさない**。現在の公開UI coverageでは主sourceにできない |
| DokkanInfo live | 同じ最近4 eventは確認時4/4で詳細あり | 各詳細の初回掲載日時がない | **未確認**。見かけは最良だが1週間以内率を証明できない |
| 保存DokkanInfo | 2026-02-23固定snapshot | 以後を更新しない | **満たさない**。更新sourceではない |

公開pageにイベント開始日はあっても、「ATK・DEF・必殺・AIが揃った日時」がない。このため、どのsourceも最短、典型、最大、1週間以内率を正確には出せない。検索engineのcrawl日時をsourceの完成日時として扱っていない。

### 採用時に測る指標

問い合わせと許可後のpilotでは、stage発見と詳細完成を分け、直近5件以上について次を保存する。

- ゲーム実装日時
- sourceにstage IDが初めて現れた日時
- 必須値が揃った日時
- 最後に訂正された日時
- 実装から詳細完成までの日数

初期pilotの仮gateは、安全側に次とする。

- 典型値: 0～3日
- 最大: 7日以内
- 1週間以内率: 直近sampleで100%
- 日時を証明できないもの: 合格に数えない

5件はadapter pilotの最低数であり、恒久採否の母数として十分ではない。本採用前には複数categoryを含む少なくとも直近10 stage、運用開始後はrolling windowで継続測定する。運用実績が増えた後、source側の一時障害をどう扱うかは実測値を見て再評価する。

## 一つの取得元で十分か

**現在は未証明。設計目標としては単一sourceを維持する。**

優先順位は次のとおり。

1. DokkanStatsの正式許可・正式経路を確認する。
2. 許可後、少数sampleと過去全再構築実験で単独coverageを測る。
3. 不足が「できれば欲しい」「将来用」だけなら補助sourceを追加しない。
4. 必須項目が不足する場合、DokkanStatsを主にした場当たり的mergeより、まず単独主source候補そのものを再評価する。
5. どうしても必要な一つの必須fieldだけ別sourceにある場合に限り、そのsourceにも別途書面許可を取り、field単位のprovenanceを保持する。

現時点で明確な不足または未確認は、DokkanStatsのrecent core stats、全カテゴリ履歴、AOE追加対象値、中立、正式ID契約、source revision／更新時刻である。base ATK、中立、AOE追加対象、出典状態は現在の正確性・更新安全性に必要である。完全な攻撃位置と全AIは現計算の必須ではないため、DokkanDBを追加する理由にはまだならない。

## 過去全部を再構築する実験

大量取得は、source運営者の書面許可と正式な取得方法を得た後だけ行う。

### 手順

1. 許可範囲、rate limit、再配布範囲、有効期限をpermission ledgerに記録する。
2. sourceのevent／stage censusをimmutable snapshotにし、取得時刻、source version、digestを記録する。
3. 通常、条件付き、会心、AOE、複数必殺、scripted AI、中立を含む3～5 stageでadapterのsmoke testを行う。
4. 複数category、新旧、通常敵、希少条件を層化した30～50 stageのpilotでcoverageと意味の正しさを測る。
5. 名前ではなく、利用可能なsource IDと順序、またはsource内で決定的な複合keyからsource-neutral app IDのmappingを作る。
6. pilot合格後だけ、許可された全履歴をquarantineへ取得し、将来のcanonical v2へ決定論的にnormalizeする。
7. schema、semantic、ID重複、件数急減、null理由、倍率、AI順序、補正digestを検査する。
8. 801既知stageと757 combat stage、5,032 enemy、現行647 stage／4,245 bossを別々に照合する。
9. 新sourceだけのstage、cacheだけのstage、曖昧対応、値差を分類する。
10. 同じ計算入力を新旧両dataから作り、代表被ダメージをside-by-side比較する。
11. 軽量runtime projectionで、現在の計算に必要な情報lossが0であることを検査する。
12. candidate／stableを分離した非本番shadow releaseを作り、digest、smoke test、health check、rollbackを確認する。

### 合格gate

- JSON Schemaとsemantic validation: 100%成功
- app ID重複・source IDまたは決定的複合keyの無言欠落: 0
- 必須capability: 16 / 16
- AOE、会心、必殺条件等: 該当recordには値、非該当recordには明示的な`notApplicable`が必要。`unknown`を合格扱いしない
- 既知801 stage: 全件が一致・source対象外・cache側問題のいずれかへ説明可能
- 既知757 combat stage: 必須詳細が揃うか、欠損を明示して本番候補から隔離
- 必須fieldの推測補完: 0
- 希少caseの既知sample: 中立、複数必殺、AOE、critical、scripted AIをすべて個別確認
- 既存値変更、削除、ID remap、件数急減: 自動停止
- 直近5件以上の更新速度: 原則すべて7日以内
- 取得・再配布: permission ledgerの範囲内

合格すれば過去も新sourceから作り直し、今後も同じ経路を使う。不合格なら現行本番を維持し、欠損を黙って保存HTMLや別siteから混ぜない。

## 新schemaを将来の正本にする評価

### 判断

- 新schemaの**考え方**: 将来の正本として採用を推奨
- 現在の`enemy-data-v1.draft`そのもの: as-isでは不採用
- 旧形式: 比較preview、旧保存data移行、旧UI projectionに限定
- 本番画面: 正本全体ではなく、必要値だけの軽量runtime projectionを読む

現在のdraftはstats、複数必殺、usage rule、effect、critical、AI、AOE、evidence、field stateを表現でき、現行計算に必要な情報を保持できる。一方、次をPhase 6で直す必要がある。

Phase 4で新形式を旧形式へ戻した際、production gateは37,690件の情報lossを検出して`false`になった。これは同じ敵を複数回数え得る影響箇所数だが、旧形式を将来の正本にして新情報を押し戻す案が不適切である強い根拠である。

- provider名を含む`occurrenceId`と、source-neutralなapp IDを分ける。
- 複数の`sourceRefs`とevidenceをfield単位で参照できるようにする。
- raw snapshotをnormalized正本から分離する。
- condition／effect、skills、field states、manual correctionsのTypeScript型を閉じる。
- `unknown`、`notApplicable`、`pending`、`stale`、`conflict`、`replaced`を区別する。
- sourceの公開時刻、取得時刻、訂正時刻、revisionを分ける。
- canonical schema、runtime projection、release manifest、diff reportを別契約にする。
- dataset全体を一つの巨大fileとしてスマホで毎回parseしない。

### 容量

Phase 4 candidateの実測は次のとおり。

| 形式 | bytes |
| --- | ---: |
| 整形済みcandidate | 35,532,102 |
| minified canonical相当 | 18,399,559 |
| 同gzip | 695,550 |
| raw・監査情報を除く非正式runtime projection | 5,115,804 |
| 同gzip | 296,355 |

約5.1 MBのprojectionは、監査時にraw・evidence等を除いて概算した非正式試料であり、再現可能な正式generator成果物ではない。現行敵JSON約5 MBと同程度になる可能性を示すだけで、PC、Android、iPhoneのdownload時間、parse時間、peak memory、offline動作はまだ実測していない。したがって「スマホで問題ない」とはまだ認定しない。35 MB正本を毎回端末でparseしない構成を先に作り、正式projectionを実機で測る。

推奨構成は次である。

```text
許可済みimmutable raw snapshot（非公開または許可範囲内）
        ↓
source-neutral canonical v2（正本・監査用）
        ↓
runtime projection（検索・計算に必要な軽量版）
        ↓
candidate / stable manifest
```

敵dataset本体を現行localStorageへ入れない。将来の配信版はCache Storageまたは専用IndexedDBを候補とし、character、scenario、theme等の現行保存dataとはversion付きmigrationで分ける。この変更は製品仕様にも関係するため、Phase 5では実装しない。

## 継続更新の設計

### 最終目標: 通常時0操作

```text
permission ledger
→ 1日1回以下の正式change check
→ 新規・変更IDだけ取得
→ raw quarantine
→ TypeScript adapterでnormalize
→ schema / semantic / coverage / diff / anomaly / freshness検査
→ 回帰test
→ immutable candidate release
→ 安全な追加だけstableへ昇格
→ app起動時にstable manifest確認
→ digest・version検査後にatomic切替
→ health check失敗時は直前版へrollback
```

既存値変更、削除、ID remap、schema変更、必須欠損、急増減は自動昇格せず隔離する。scheduled jobから無検証dataを直接公開しない。secretはserver／CI secret storeだけに置き、browser、配布file、localStorageへ入れない。

完全自動化を現在止めているのは、技術より次の外部条件である。

1. 自動取得と再配布の書面許可がない。
2. 正式API／export／change feedが確認できない。
3. source側の詳細完成時刻と1週間以内率が不明である。
4. 欠損・訂正・削除の意味契約がない。
5. 新canonicalをまだ非本番で検証していない。

ボタンを1回にしても無許可取得は合法・適切にならない。まず取得側の条件を解決する。

### 完全自動化できない場合

内部pipelineは同じものを使う。

| 方式 | 所有者の操作 | 推奨時期 |
| --- | --- | --- |
| 2操作 | 使用する各端末で、新versionごとに「更新を確認」→件数と重要差分を見て「適用」 | 初回運用。最も安全 |
| 1操作 | 検証済み版がある時だけ「敵データを更新」を1回 | 2操作で数回安定した後 |
| 0操作 | 通常は何も押さず、異常候補だけ隔離 | 許可、安定feed、validation、rollbackの実績後 |

外部site、GitHub画面、拡張機能、JSON、terminalを所有者が操作する設計にはしない。PC、Android、iPhoneで同じ画面と同じ手順にする。

account／backendによる端末間同期をまだ前提にしないため、2操作または1操作の段階ではWindows、Android、iPhoneそれぞれのlocal cacheを更新する。0操作へ進んだ場合は、各端末が次回起動時にstable manifestを確認し、検証済み版へ自動切替する。

## OneDrive / GitHub Pages / hybrid

これは製品仕様の**提案**であり、採用・実装はまだしていない。

| 案 | 普段の使い方 | 長所 | 問題 | 評価 |
| --- | --- | --- | --- | --- |
| A. OneDrive継続 | 各端末で現在のHTML fileを開く | 今の習慣を変えない。自己完結HTMLはofflineで使える | `file://`の別JSON取得、Service Worker、origin保存が不安定。3端末共通更新に不向き | 現行維持／backup向き |
| B. Pagesを正式版 | 全端末で同じURLまたはホーム画面iconを開く | HTTPS、同一origin、JSON更新、PWA、manifest、rollbackに向く | 普段開く場所が変わる。通信障害対策と保存移行の実機確認が必要 | 技術的には最も単純 |
| C. hybrid | 普段はPages、障害時だけOneDrive自己完結版 | 3端末の通常操作を統一し、今のoffline退避も残せる | 2系統の版管理と、初回の利用方法説明が必要 | **推奨案** |

推奨hybridを将来採用した場合、所有者が普段開くものは3端末とも次の一つになる。

```text
https://sumiporon.github.io/dokkan-calc/
```

- Windows: browser bookmarkまたはdesktop shortcut
- Android: Chromeのホーム画面icon
- iPhone: Safariの「ホーム画面に追加」icon
- 通信障害・公開版不具合時だけ: OneDriveの自己完結offline HTML

OneDrive側は最後に配布・保存した既知good版であり、新stageが最新とは限らない。通常更新のたびに所有者へHTML差替えを要求しない。最新offline版を安全に配布・同期する方法は、実機試験と所有者承認を伴う別の設計事項とする。

OneDriveを普段使いのままPagesのJSONだけ読む逆hybridは、Windowsでは動いてもAndroid／iPhoneの`file://`と保存の一貫性を保証しにくいため第二候補である。

実際に切り替える前に、PC／Android／iPhoneで起動、保存export／import、offline、更新失敗、rollbackを実機確認し、何が変わるかを所有者へ再提示して承認を得る。

## DokkanStatsへ問い合わせるべきか

**送信を推奨する。ただし本報告時点では送っていない。**

理由は、DokkanStatsが単一source候補として最も広い機能を持ち、Termsに書面許可の経路があり、今回の未確定事項の多くは運営者しか回答できないためである。問い合わせでは次を一度に確認する。

- 正式API／export／change feed
- 自動accessの書面許可、頻度、rate limit、対象URL
- 派生数値JSONのGitHub／Pages再配布と過去版保持
- 対応地域・event category・過去履歴
- stable ID、変更・削除・訂正
- `?`、中立、複数必殺、AOE追加対象、会心値の意味
- `stageAddedAt`、`bossStatsCompletedAt`、`lastCorrectedAt`
- 通常／目標／最近実績の更新日数
- APIがsite表示と同時か先に更新されるか
- credit、license、raw保管、許可取消条件

そのまま送れる日本語・英語の完成稿は[第5段階 DokkanStats問い合わせ完成稿](phase5-dokkanstats-inquiry-ready.md)に保存した。英語版の送信を推奨する。Phase 4草案は履歴として残す。

## 第6段階で実装すべきこと

第6段階は**外部通信と本番接続をしない内部data基盤**に限定するのが安全である。

1. 24群のfield registryとcoverage report schemaを固定する。
2. `enemy-data-v2` draftをsource-neutralにする。
3. app stable ID、`sourceRefs`、field evidence、typed condition／effect、unknown stateを定義する。
4. canonical、runtime projection、release manifest、diff reportの契約を分ける。
5. TypeScript型を閉じ、source adapter interfaceを作る。ただしnetwork adapterはdisabledにする。
6. 現在の保存DokkanInfo candidateだけを入力にruntime projectionを生成する。
7. 「現在の計算に必要な情報loss 0」、digest、ID、件数、差分gateをテストする。
8. permission ledger形式を作るが、許可回答前は全sourceをdisabledのままにする。
9. localhostの非本番manifestとrollbackをテストする。
10. 正式projectionのbytes、download、parse、peak memory、offline／rollbackをPC browserとmobile emulationで測る。公開方法の承認前にAndroid／iPhone実機でも確認する。
11. Viteは導入せず、具体的に必要になった時点で再評価する。

DokkanStatsから許可と正式経路を得た後の次段階で、初めて3～5 stage smoke、30～50 stage層化pilot、過去全再構築、801／757照合、直近更新速度計測へ進む。

## 推奨ロードマップ

| 段階 | 内容 | 本番・所有者操作への影響 |
| --- | --- | --- |
| Phase 5（今回） | source比較、schema再評価、更新・hosting設計、問い合わせ完成 | なし |
| Phase 6 | source-neutral v2、projection、manifest、coverage／permission／promotion gateをoffline実装 | なし |
| 問い合わせ回答後pilot | 許可範囲内の3～5 stage smoke、続いて30～50 stage層化pilotと更新速度計測 | なし |
| 全再構築実験 | 過去全体をquarantineに生成し、801／757／現行dataと比較 | なし |
| shadow配信・実機試験 | 非本番candidate、rollback、PC／Android／iPhoneを確認 | test用URLのみ |
| 製品仕様承認後 | 初期2操作更新、Pages／hybrid、保存移行を段階導入 | ここで初めて普段の使い方が変わる |
| 安定運用後 | 1操作、条件が揃えば0操作を再評価 | 別途説明・承認 |

## 所有者に判断してほしいこと

内部schema、TypeScript、projection、gate、CIの細部はagentが自律的に決められる。次は所有者の使い方に関わるため、承認が必要である。

1. **DokkanStatsへの問い合わせを送るか**
   推奨: 完成稿を確認後、英語版を送る。送信まではCodexが勝手に行わない。
2. **第6段階を非本番・外部通信なしで開始してよいか**
   推奨: 開始する。現行アプリや普段の使い方は変えない。
3. **将来の通常利用をhybrid案へ寄せてよいか**
   推奨: 普段はPagesのホーム画面icon、OneDriveはoffline backup。ただし実機試験後に最終決定する。
4. **最初の更新操作を2回にしてよいか**
   推奨: 初期は使用する各端末で、新versionごとに「更新を確認」→「適用」。安定後に各端末1回、さらに条件が揃えば次回起動時の0回へ減らす。この端末ごとの操作でよいかを判断してほしい。
5. **Pagesへ移る際、一度だけ保存dataのexport／import操作が必要でもよいか**
   推奨: 自動移行できない場合に備えて実機試験後に選択肢を提示する。現時点では未決定。

## 最終検証

2026-08-23に次を確認した。

- `npm test`: 108件成功、失敗0、skip 0
  - unit 58件
  - data 26件
  - Phase 4 12件
  - browser 12件
- TypeScript型検査: 成功
- PC幅、mobile幅、`file://`を含む既存browser回帰: 成功
- Markdown内のlocal linkとcode fence検査: 成功
- `git diff --check`: 問題なし
- 本番敵JSON、app本体、localStorage、workflow、Pages設定: 変更なし

## 第5段階の停止点

本報告で第5段階の調査・設計は完了とする。次はまだ行わない。

- DokkanStatsへの問い合わせ送信
- 外部source adapterによる取得
- 過去全件の大量取得
- production dataの置換
- 新schemaの本番採用
- localStorage migration
- Pages公開切替
- OneDrive利用変更
- 更新button実装
- mainへのmerge

## 主な根拠

### 外部公開資料

- [DokkanStats Terms of Use](https://dokkanstats.com/en/terms-of-use/)
- [DokkanStats Updates](https://dokkanstats.com/en/updates/)
- [DokkanStats Events](https://dokkanstats.com/en/events/)
- [DokkanStats Contact](https://dokkanstats.com/en/contact/)
- [DokkanStats Stage 12の欠損例](https://dokkanstats.com/en/events/challenge/1751/17510123)
- [DokkanStatsの豊富なstage例](https://dokkanstats.com/en/events/challenge/1704/17040095)
- [DokkanStatsの会心calculator例](https://dokkanstats.com/en/events/calculator?area=1737&boss=9207091&phase=1&saIndex=0&smap=17370594&type=challenge)
- [DokkanDB Terms](https://dokkandb.com/legal?tab=terms)
- [DokkanDB event 1769](https://dokkandb.com/events/challenge/1769/17690015)
- [DokkanInfo Terms](https://jpnja.dokkaninfo.com/terms)
- [DokkanInfo event 1769](https://jpnja.dokkaninfo.com/events/challenge/1769/17690015)

### repository内資料

- [第4段階完了報告](phase4-completion-report.md)
- [第4段階 更新・公開方式](phase4-update-hosting-strategy.md)
- [第3段階 取得元評価](phase3-data-source-evaluation.md)
- [第3段階 保存cache分析](phase3-cached-source-analysis.md)
- [将来敵schema案](../schemas/enemy-data-v1.draft.schema.json)
- [Phase 4 candidate manifest](../artifacts/phase4/candidate-manifest.json)
