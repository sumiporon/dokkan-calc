# Phase 10: 代替取得元と安全な接続準備

調査日: 2026-08-30〜31（JST）

## 結論

**現時点では採用なし。** 自動取得・派生JSONの公開許可、実際の敵／stageの充足、7日以内の更新実績をすべて確認できた代替sourceはない。これは「世界中に存在しない」という断定ではなく、今回の一次情報と少数サンプルで採用条件を立証できなかったという結論である。

Phase 9 productionを維持する。新しい敵datasetの取得・変換・公開は行っていない。架空fixtureをproductionへ混ぜず、DokkanStatsは`permission: pending`のまま、サイト/APIへのアクセス・問い合わせ・follow-upを行わなかった。Phase 11は開始しない。

今回実装したのは、将来sourceが見つかった際の**offline接続前チェックと公開前review**であり、最新敵を取得できる完成済みサービスではない。ownerに日常的なHTML保存、JSON編集、GitHub操作、terminal操作を求める方式は採用していない。

## 1. Phase 9基準と再利用した成果

- 基準commit: `a1b81b817f95652199e1b11a304bb884a10b57ff`
- 基準tag: `phase9-production-ready-2026-08-30`
- 作業branch: `codex/phase10-source-research-20260831`。開始時clean、worktreeは1つ。
- 正式URL: <https://sumiporon.github.io/dokkan-calc/>
- remote mainと公開manifest、[Pagesの成功run](https://github.com/sumiporon/dokkan-calc/actions/runs/33317526613)を読み取り確認。
- 56 event分類、73 series、647 stage/encounter、4,245 enemy、8,899 attack、AOE 0。
- source SHA-256: `f1cb27a2e5cae9627be61934aaabec79e4af0b42d3e21ad0cc7945eb6d7a0b40`
- [Phase 3取得元調査](phase3-data-source-evaluation.md)、[Phase 5の実例・遅延調査](phase5-data-source-and-canonical-design.md)、[Phase 6 contracts](phase6-canonical-data-foundation.md)、[Phase 9安全記録](phase9-production-cutover.md)を再利用。
- 既存canonical v2、runtime v1、offline adapter、permission ledger、projection、schema、gate、chunk、manifest、known-good/rollbackは廃棄・再設計していない。

## 2. 調査方法と許可の扱い

公式documentation、規約、公開GitHubのREADME/LICENSE/metadata、少数の通常公開ページを調べた。認証情報の発行、会員登録、購入、ゲームAPIへのlogin、隠しendpoint探索、client DBのdownload/復号、bulk scrapeは行わない。bot/robotsによる拒否は回避しない。

`robots`の許容、公開repo、CORS対応、APIが応答すること、MITの解析ツールは、それぞれdataの取得・再配布許可とは別である。以下の「不明」は許可を意味しない。法域・個別契約の法律判断を断定せず、本projectで安全に採用できる根拠があるかを判定した。

### 同一基準での比較

| source / 方式 | 自動取得・利用条件 | raw / 派生再配布 | 更新速度 | 実敵/stage充足・AOE | 継続性と採否 |
| --- | --- | --- | --- | --- | --- |
| Bandai公式公開情報 | 公開enemy API/feed/licenseは調査範囲で未確認 | 許諾未確認 | ニュース掲載と敵詳細公開は別。敵詳細lag測定不可 | 敵ATK/AIの機械可読一式なし | 一次資料として有用、取得元には採用しない |
| ゲームclient/配布DB | 逆解析・複製等の契約上の制限。合法なdata供給経路未確認 | 本用途の明示的再配布許可未確認 | 配信されることと利用可能時刻は別。未測定 | schema上は豊富でも合法取得・完全復元未証明 | 復号・非公開APIを実行せず不採用 |
| GachaData API | token必須。production利用はPro契約条件。今回は未契約・未取得 | app等での表示条件あり。public JSON mirror/派生配布の範囲は未確定 | day-one等はprovider説明であり敵eventの実測ではない | Dokkanはcard等6dataset、enemy endpoint未掲載。敵復元率を測れる材料なし | API契約方式は有望だが現用途のdata不足で不採用 |
| DBZ Dokkan Battle France | 公開敵詳細あり。automation/API/export許可は未確認 | open data license・派生JSON公開許可未確認 | 最近3eventを観察。初回詳細掲載時刻不明 | 3stage/6phase-enemyの基礎値を確認。完全復元率は未測定。実AOE説明あり、対象別値は未確認 | 技術面の追加照会候補。許可・鮮度・完全性が足りず不採用 |
| Dokkan Fandom | 現行API/bot条件を一次情報で確定できず、robots拒否を回避しない | 一般wiki本文のCC BY-SAは画像/転載data/すべてのAPI操作の包括許可ではない | 最近敵の詳細revisionを確認できず未測定 | 全敵・AI・対象別AOEを再現するcoverage未検証 | 条件・完全性未確認で不採用 |
| 公開card API / GitHub card datasets | MIT/AGPL等のrepoがあるが上流data権利は別途確認 | code licenseだけでゲームdata公開を承認しない | 主なrepo最終pushは2021〜24年。敵eventのlagでない | player card中心、enemy/encounter/複数必殺/AIを供給しない | 目的不適合・保守継続不明で不採用 |
| GitHub client DB / schema docs / decryptor | 配布dataの明示license未確認。decryptorのMITはコードのみ | ゲームDBの再配布許可にならない | active repoのpush日もDB更新日/敵詳細反映日を証明しない | schema説明はあるが許可付き最新enemy feedではない | DBをdownloadせず不採用 |
| DokkanInfo | 過去の一次規約調査で自動request禁止。解除根拠なし | 複製・配布制限、派生公開許可未確認 | Phase 5の4 recent sampleには詳細あり、真のlagは不明 | 高い部分coverage、AI/会心等は不足あり | 既知制約を維持。live取得再開なし |
| DokkanDB | 過去の一次規約調査でscrape/harvest/hidden API禁止 | open license/派生公開許可未確認 | Phase 5で30時間以内の観察例と25/32/73日後の詳細欠損例が混在 | 一部詳細豊富でもrecent stage欠落 | 既知の許可・鮮度問題で不採用 |

共通fallbackは**既存Phase 9 known-goodを維持すること**。非許可sourceへ自動的に切り替えるfallbackは作らない。

## 3. 主な一次情報と追加発見

### 公式情報 / ゲーム配布物

[Bandai公式サイト](https://dbz-dokkan.bn-ent.net/en/)にはゲーム案内とstore導線があるが、外部calculatorへ敵dataを供給する公開契約・APIを確認できなかった。[BNEA Google Play EULA](https://www.bandainamcoent.com/legal/bnea-eula-googleplay) §5は複製、再配布、逆解析、派生物等を制限する。これはBNEAの契約であり、日本版の個別EULAにそのまま適用されると断言しない。**日本版なら許可される**という推測もせず、取得・復号を実行しない。

[BNEI自身の公開Terms](https://legal.bandainamcoent.co.jp/terms/?lang=en)（2020-02-27更新表示）§3(b)にも複製・配布・逆解析等の制限がある。日本版Dokkanの個別契約への適用を断定する材料ではなく、本用途の許可根拠を得られなかったという判断を補強する資料として扱う。

### GachaData

[API docs](https://gacha-data.com/api/)は認証、pagination、history/snapshotを公開する。[Terms](https://gacha-data.com/terms/)（2026-08-07更新、通常HTTPで確認）は無料tokenを評価用とし、production appをPro対象にする。帰属表示・token秘匿が必要で、無断scrapeやAPI条件外の再配布は禁止される。既存Pagesへtokenを埋め込む方式は採用不可。将来契約してもCI側secretで扱う必要がある。

[Dokkan dataset一覧](https://gacha-data.com/dokkan-battle/)は2026-08-14更新表示、2,769 cardsとlink/category/orb等。API docsのDokkan一覧にenemy/stage-battle endpointはない。他gameの`enemies`endpointをDokkanにもあると推測して呼ばない。したがってtoken発行や有料契約へ進む理由は現時点ではない。

### DBZ Dokkan Battle France

[公開サイト](https://dbz-dokkanbattle.com/)と[privacy](https://dbz-dokkanbattle.com/privacy)を調査。privacyは個人情報処理の説明で、data再利用licenseではない。公開API契約、bulk/export、再配布許可、rate limit、history契約を確認できない。`robots.txt`は調査toolで取得できず、未確認のまま許可扱いしない。

event/questに数値IDがあり、phase、HP/ATK/DEF、複数必殺、HP条件、scripted actionを少数例で確認した。ただしURLのIDは永続性の保証ではない。同じsiteの旧/新renderが検索cacheに混在し、初回掲載や修正履歴は追えない。schema version、変更通知、正規export、first/additionalの意味を提供者に確認する必要がある。

### GitHub公開repoの監査

GitHubの公開repo metadata、README、license表示、treeだけを調査。DB本体は取得していない。`pushed_at`は**repo更新日**であり敵dataの更新速度ではない。

| repo | 最終push（UTC、調査時）/ license情報 | 内容と不足 |
| --- | --- | --- |
| [dthiel22/dokkan-database](https://github.com/dthiel22/dokkan-database) | 2022-11-20 / MIT表示 | player character JSON。enemy stage供給なし |
| [dthiel22/dokkan-database-compiler](https://github.com/dthiel22/dokkan-database-compiler) | 2023-10-14 / license未確認 | DB/character files。現在の敵coverage・再配布許可未確認 |
| [MNprojects/DokkanAPI](https://github.com/MNprojects/DokkanAPI) | 2023-05-14 / AGPL-3.0表示 | GraphQL card API。上流Fandomとdata権利は別 |
| [MNprojects/DokkanWebScraper](https://github.com/MNprojects/DokkanWebScraper) | 2023-04-20 / license未確認 | card scraper。実行しない |
| [feijoes/DokkanAPI](https://github.com/feijoes/DokkanAPI) | READMEのCharacter APIを確認 | card中心、enemy endpointなし |
| [LiquidPlazmid77/DokkanDataCatalog](https://github.com/LiquidPlazmid77/DokkanDataCatalog) | 2021-03-16 / license未確認 | archive bot WIP、継続enemy供給なし |
| [itZcat17/CapsuleOS](https://github.com/itZcat17/CapsuleOS) | 2026-08-30 / root license未確認 | active toolkit・DB・schema docs。特定client向けfile-browser利用説明は本projectへの許可ではない |
| [KaryonixX/kxdokkan-wiki](https://github.com/KaryonixX/kxdokkan-wiki) / [DokkanEntropy/Wiki](https://github.com/DokkanEntropy/Wiki) | 2026-01-25 / 2022-11-18、license未確認 | enemy_ai等のschema文書。最新licensed datasetではない |
| [bensnilloc/Database Decryptor](https://github.com/bensnilloc/Dragonball-Z-Dokkan-Battle-Database-Decryptor) | MITコード | 鍵/DBを使うtoolでありdata供給・data権利ではない。実行しない |
| [Kinglerrr/Dokkan-News-Tracker](https://github.com/Kinglerrr/Dokkan-News-Tracker) | 2026-07-24 / license未確認 | DokkanInfo専用extension。許可もPC/mobile UXも解決しない |
| [kvmcd123/DokkanBattleLibrary](https://github.com/kvmcd123/DokkanBattleLibrary) / [TsukadevsShadixx/BattleSphere-data](https://github.com/TsukadevsShadixx/BattleSphere-data) | 2024-06-29 MIT / 2025-06-12 license未確認 | card OCR/library / bot補助data。enemy primary sourceでない |

Fandomの一般license情報は[Licensing](https://www.fandom.com/licensing)、対象条件の確認先は[Terms](https://www.fandom.com/terms-of-use)。今回は現行本文の一部取得が402/robots拒否になった。古い利用者blogへの規約転載を、現行公式許可の代用にしなかった。

DokkanInfo/[Terms](https://jpnja.dokkaninfo.com/terms)、DokkanDB/[Terms](https://dokkandb.com/legal?tab=terms)、dokkan.wiki/[Terms](https://dokkan.wiki/terms)の既知制約は維持。規約変更の確かな根拠なしに再収集はしない。

### 長期運用条件の比較

| 方式 | ID / schema | 履歴・差分・過去data | rate limit / CI利用 |
| --- | --- | --- | --- |
| 公式公開情報 / client配布物 | 本用途の公開enemy contractは未確認 | 許可された敵revision feed未確認 | machine access契約未確認。CI接続しない |
| GachaData | card ID・pagination等のAPI説明あり。敵ID契約はない | Proのhistory/snapshot説明あり。敵dataや保持保証は未確認 | 無料は回数制限、Proは無制限と説明されるが未契約・未実測。CI secret方式は技術上可能でも本用途の許諾・data不足は解消しない |
| France | 数値quest/stage IDは見えるが永続性保証・schema versionなし | 初回掲載/revision、正規diff/export契約未確認 | rate limit・CI自動取得条件未確認。HTML変更リスクあり |
| Fandom / dokkan.wiki | page/card情報だけでは敵entity ID契約を証明しない | 敵の完全なrevision取得経路は未確認 | 現行許可未確認または自動取得制限。CI実行しない |
| GitHub datasets / tools | commit hashでrepo内容は特定可能。sourceの敵ID維持は別 | Git履歴はあるがdataの全revision保持・将来保守の保証ではない | GitHubから読めることとdata利用権を分離。多くは古いcard projectで、activeなDB toolkitも正当なdata供給を証明しない |
| Info / DB | 保存済みstage等のIDはあるが取得方法はHTML依存 | 公認の全履歴/diff APIを確認していない | 既知のautomation禁止を維持。CI scraperは再開しない |

GachaDataの運用仕様は[API docs](https://gacha-data.com/api/)の説明であり、未契約の実測結果ではない。どの候補も長期供給の保証は得られておらず、停止時は既存known-goodを保持する。sourceが変わる場合は別途許可・ID対応・完全性reviewを行い、自動的な別siteへの切替はしない。

## 4. 実際のrecent event観察とlatencyの限界

次はFranceの少数公開ページを2026-08-31 JSTに観察した結果。開始表示はそのsiteのmission欄であり、Bandai公式時刻・詳細の初掲載時刻・revision時刻ではない。検索indexのcrawl日や利用者のteam投稿日も敵詳細の完成時刻に代用しない。

| event / 確認stage | site内開始表示 | 観察結果 | 判定できること / できないこと |
| --- | --- | --- | --- |
| [1768 event](https://dbz-dokkanbattle.com/quest/1768) / [17680013](https://dbz-dokkanbattle.com/quest/1768/17680013) | 2026-08-29 11:00（site表示） | 2 phase、基礎値、phase2に2つの必殺とscripted action | 開始表示から数日以内に詳細が存在。ただし全stage完全性・初回掲載時刻は未証明 |
| [1766 event](https://dbz-dokkanbattle.com/quest/1766) / [17660015](https://dbz-dokkanbattle.com/quest/1766/17660015) | 2026-07-29 07:00 | 2 phase、基礎値、必殺、条件付き効果 | 約33日後の時点で存在。33日遅延という意味ではなく、7日以内だったか不明 |
| [1765 event](https://dbz-dokkanbattle.com/quest/1765) / [17650035](https://dbz-dokkanbattle.com/quest/1765/17650035) | 2026-07-22 07:00 | 2 phase、基礎値、scripted必殺、terrain情報 | 約40日後の存在確認だけ。初回詳細時刻不明で7日条件を合格にしない |

この3stageでは6 phase-enemy相当のATK/DEF/HPと必殺表示を確認したが、属性imageの意味、neutral、全usage rule、対象別AOE、会心補正、未表示行動、各eventの全stageを独立ground truthと照合していない。**完全復元率は未測定**であり、6/6表示されたから100%とはしない。

GachaData/card-only repoにはこの3eventの敵詳細を比較する公開datasetがない。したがって敵stage coverageは提供確認できず、latencyはN/A。card追加日を敵更新日へ置き換えない。

既存Info/DBの4event（1769/1766/1765/1762）は[Phase 5の観察表](phase5-data-source-and-canonical-design.md)を保持。約30時間後の存在と25/32/73日後の欠損を、実際の掲載lagや今回時点の測定値と誤記しない。許可なしの再測定はしなかった。

採用前には、合法なfeedを使って複数recent eventの公式release時刻と**必須詳細が揃った最初のsource revision**を対応付ける必要がある。3日/7日/14日/30日の基準は維持するが、このsessionだけで継続運用実績は作れない。

## 5. 実AOEの調査

Franceの実在stage [1736/17360065](https://dbz-dokkanbattle.com/quest/1736/17360065)と[1716/17160095](https://dbz-dokkanbattle.com/quest/1716/17160095)には、全員を対象とする必殺説明、AOE関連action、後者にはHP条件別の使用情報がある。

しかし、単一の必殺表示値からfirst targetとadditional targetsのATKをそれぞれ確定する根拠は確認できなかった。通常全体攻撃と全体必殺の適用順、必殺後buff/会心/DEF無視と対象別値の関係も未検証。**2値を同じと仮定したり、説明文から数値を補完したりしない。** 規約許可も未確認のため、実data adapterやproduction計算への導入は行っていない。

既存canonical/runtimeはfirst/additionalを別fieldとして保持する。現行consumerが読むのは固定ATKであり、倍率だけでは0扱いになる。そのため今回の新gateは、どちらかの固定ATKがunknown、不正値、enemy参照が別encounter、attack kind/targetの意味が不明なAOEを拒否する。倍率だけで固定ATKを推測補完しない。既存の架空AOE browser回帰は、対象別ATK・条件・会心・属性・guard・選択保存を確認するが、これを実sourceの正しさの証明にすり替えない。

## 6. 最も有望な候補 / owner判断

**今すぐ採用できる最有力sourceはない。** 技術面の追加照会先ならFrance、明示されたAPI契約方式の参考ならGachaData。ただし後者には必要な敵datasetがなく、契約や課金を今勧める根拠はない。

次にownerが判断するのは、France等へ「CI自動取得・公開派生JSON・帰属・rate limit・履歴・日本版coverage・first/additional AOE」を含む許可照会を行うかどうかである。Codexは送信していない。許可取得だけでは採用確定ではなく、coverageと鮮度の検証が続く。

legalな2候補の速度/欠損率の選択に至っていないため、今回はownerの使用感を変えるトレードオフを勝手に採択していない。新source、production公開方式、startup自動更新の有効化は別承認が必要。

実装と検証は[Phase 10安全基盤](phase10-offline-intake.md)を参照。
