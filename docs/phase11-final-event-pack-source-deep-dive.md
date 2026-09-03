# Phase 11 最終取得経路深掘り

調査日: 2026-09-03

対象: Androidで1 eventを1〜数操作で追加できるevent単位update packの作成経路

結論: **現時点の公開情報には、合法性・継続性・必要項目・更新速度を同時に満たす突破口はない。**

この調査はPhase 11 closeout後の最後の重点調査である。既知のDokkanInfo `event 1 + stage N`方式を別のUIで包み直すことはせず、stage数が5でも20でもownerの操作量がほぼ増えない経路だけを重点的に調べた。調査中にproduction、`main`、OneDrive、production敵データ、workflow、Phase 11 fallbackを変更していない。France、DokkanStats、Dokkan Eclipseを含む外部sourceから敵データを自動取得していない。

## 1. 今回新たに調べた場所・source

過去文書の結果を出発点に、通常ページではなくexport、dump、repository、static asset、database、公開source codeのデータ供給経路を調べた。

- Fandom公式のwiki database download
- CapsuleOSの公開repository、database updater、Event Workshop、event importer、enemy API実装
- KX Dokkan Wikiのcustom event形式
- `eve718/dokkan-calculator`の同梱event階層dataと追加script
- `SolaimanBaraka/API_DOKKAN`のevent model/API実装
- GachaDataのdocumented Dokkan API一覧
- `jp.dokkanbattle.net`のevent公開状況
- Bouncer011、Ignaadexのdatabase repository
- KaryonixXのevent関連repository
- 公開Dokkan bot、card API、calculator、npm/package候補
- 既調査のDokkanInfo、DokkanDB、France、DokkanStats、dokkan.wikiをevent exportの観点で再照合

調査は公開document、公開repository metadata、small source file、commit historyの確認に限定した。public game database本体をdownloadせず、undocumented endpointを呼ばず、sourceを巡回・scrapeしていない。

## 2. event単位structured dataが存在した候補

「eventという階層を持つdata」と「calculatorへ安全に入れられる合法・完全・最新のevent source」は別である。前者は見つかったが、後者は見つからなかった。

| 候補 | eventをまとめる技術的な形 | 実用判定 |
| --- | --- | --- |
| Fandom database dump | wiki全体のcurrent-page XMLを1個の`.7z`で取得でき、event page群を一括処理できる | bulk経路は実在するが、calculator必須fieldの網羅性・最新性が不足または未証明 |
| CapsuleOS | 約98 MBのbundled SQLite DBと、複数stageを持つ`.capsule-event.json` project/ZIP形式がある | format参考として有力。ただし公式current eventを完全exportする経路、権利、provenance、JP data、複数Super/AOE semanticsが未証明 |
| `eve718/dokkan-calculator` | event→stage→battle→phase→enemyの階層を持つ同梱JavaScript dataがある | event階層dataは実在するが、手入力作成、必須field不足、4か月超のstale、data license不明 |
| `SolaimanBaraka/API_DOKKAN` | event endpoint/modelがある | event名、期間、difficulty、reward等のmetadataだけ。stage enemy dataではない |
| 古いdatabase repository | SQLite DBを1 fileで配布 | 2023〜2024年等でstale、license/provenance不十分、完全性不明 |

Fandomは[公式database download手順](https://community.fandom.com/wiki/Help%3ADatabase_download)があり、CapsuleOSは[repository](https://github.com/itZcat17/CapsuleOS)と[event workshop](https://github.com/itZcat17/CapsuleOS/blob/main/app/tools/event-workshop.js)が公開されている。これらは「一括fileが技術的に存在する」証拠であり、現在の敵データsourceとして採用できる証拠ではない。

## 3. 1 eventあたりの必要操作数

| 経路 | owner側 | producer側 | stage数との関係 |
| --- | ---: | --- | --- |
| 完成済みevent packをAndroidで取込 | 約4操作: file受取/選択、diff確認、取込、完了確認 | pack作成元が別途必要 | 一定 |
| DokkanInfo fallback | 5 stage約29、10 stage約53、20 stage約97 | calculator内処理は自動 | `N`に比例 |
| Fandom full dump | sourceからは原則1 dump | XML展開、対象event抽出、欠損確認、変換が必要 | ownerのsource操作は一定だがproducer検証量は内容に依存 |
| 許可済みcomplete DB | 原則1 file受取/提供 | DB adapter、event範囲確定、完全性検査 | 人間操作は一定、machine処理はrecord数に比例 |
| `eve718`同梱data | 1 repository/file取得は可能 | 元data作成がstage/enemyごとの対話入力 | producer作業が`N`に比例 |
| owner提供のDokkanInfo stage files | まとめて1回uploadできても、その前に`N` pagesを保存 | Codex変換は一括可能 | 取得負担は`N`に比例 |

「packが既に存在するならAndroid約4操作」は成立する。しかし今回の未解決点はpack読込UIではなく、packを合法・完全・継続的に作る入力である。

## 4. stage数に比例しない方式があったか

技術上はFandom full dump、complete SQLite DB、source作者のevent exportがstage数に比例しない。ただし現在利用可能な候補では、次のどれかが欠ける。

- Fandom dump: 必要な敵fieldとrecent-event coverage
- CapsuleOS/DB: 利用許可、data provenance、JP coverage、official eventの完全export、attack semantics
- source作者export: 現時点で提供者がいない
- `eve718`: producerがstage単位で手入力するため総作業量が減らない

したがって、**現在すぐ使えるstage数非比例の方式はない。**

## 5. HP / ATK / DEF対応

- CapsuleOS importerはstage JSONまたはDB tableからHP、attack、defenceを読むcodeを持つため、DBに少なくとも一部の値が存在する可能性は高い。ただしbundled DBからcurrent vanilla event全体を欠損なくexportできることは証明されていない。
- KX custom event formatはstageごとの`battle_info`、enemy、HP、ATK、DEF、`ai_type`等を表現できるが、custom event作成仕様であってcurrent official dataの合法なexportではない。
- `eve718`はenemy attack calculator用の値を持つが、canonical v2が必要とするHP/DEFまで完全に揃うdatasetではない。
- Solaiman APIのevent model、GachaDataのdocumented endpoint、card APIには必要なstage enemy三値が揃わない。
- Fandomはpageによって情報量が異なり、全stageでのHP/ATK/DEF網羅性を保証できない。

## 6. multiple Super / AOE / AI / usage rule対応

完全対応を証明できた新候補はない。

- CapsuleOS codeはAI rowとenemy skill IDを扱うが、current official dataについて複数Super、AOEのfirst/additional target別ATK、発動条件、usage sequenceをcanonical v2へlossなく写せる証拠がない。
- `eve718`はNormal/Super/AOEの攻撃計算表示を持つが、安定ID、完全なAI/usage rule、target-specific AOE、provenanceまで揃わない。
- Fandom dumpはwiki本文をまとめるだけで、必要な機械可読semanticsを保証しない。
- Solaiman API、GachaData、card APIはこの用途のfield自体を提供しない。

不足値を推測で埋めれば安全基盤の目的を失うため、候補を合格扱いしない。

## 7. recent event更新速度

- CapsuleOSの2026-08-30 database commitはREADME上で2026-08-19までの内容を示し、観測できた時点で約11日差、調査日の2026-09-03には15日差だった。1週間以内を保証するSLAもない。
- `eve718/dokkan-calculator`のdata更新は2026-04-27が最後に確認でき、4か月超遅れている。
- Bouncer011は2024年、Ignaadexは2023年、公開bot候補は2019年等でprimary sourceにならない。
- Fandom dump requestは通常週単位で処理されるが、dump生成日が新しくてもwiki本文自体の更新速度と必須field coverageは別問題である。
- `jp.dokkanbattle.net`はrecent contentを表示しているが、event一覧は構築中で、structured export/APIは確認できなかった。

当日〜1週間以内かつ継続的という基準を満たす候補はない。

## 8. data license / permission

| 候補 | manual/personal/local | derived/private pack | public pack/Pages | 判定 |
| --- | --- | --- | --- | --- |
| Fandom text | database downloadは公式手順あり。wiki textは一般にCC BY-SA 3.0 | exact page contentとattribution/share-alike確認が必要 | 同様。画像・外部素材・game由来情報は別権利の可能性 | 権利確認可能性はあるが、data完全性で不合格 |
| CapsuleOS bundled DB / Dokkan Eclipse route | repositoryにlicenseなし。decrypted game DBの出所・許可が不明 | 不明 | 不明 | fail closed |
| `eve718` embedded data | repositoryに有効なdata licenseを確認できない | 不明 | 不明 | fail closed |
| Solaiman API data | repository licenseなし、READMEはFandom由来と記載 | upstream条件とattribution継承が未整理 | 不明 | 内容不足に加え権利未整理 |
| Bouncer/Ignaadex DB | code licenseがあってもDB dataのlicense/provenanceは別 | 不明 | 不明 | fail closed |

[Fandom licensing](https://www.fandom.com/licensing)はwiki textの基本条件を示す。一方、GitHubは[licenseがなければdefault copyrightが適用される](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)と説明している。公開repositoryを閲覧・forkできることを、同梱game dataの派生・再配布許可へ拡張しない。

## 9. personal pack作成可否

現時点で無条件に「可」と確認できたsourceはない。

- Fandom textだけならlicense条件下のlocal processingを検討できる余地はあるが、必要dataが揃わない。
- CapsuleOS、`eve718`、古いDBはpersonal用途でもlocal transform/retentionの根拠が不明である。
- France、DokkanStatsはmanual/private packを含む問い合わせへの返信待ちであり、silenceを許可と扱わない。
- owner自身が権利を確認したcomplete one-event fileを提供できる場合は、Codexによるprivate pack作成を再評価できる。

## 10. public pack配布可否

現在の全候補で不可または未確認である。public packには少なくともderived-data作成、再配布、GitHub/GitHub Pages利用、履歴保持の各許可が必要であり、personal processingの可否から自動的に導かれない。Fandom由来ならattribution/share-alikeと各contentの権利範囲をpack設計へ反映する必要がある。

## 11. Codexをpack作成者にする運用の現実性

**条件付きで現実的だが、現在は入力がない。** Codexは次の作業を決定的に自動化できる。

1. 権利確認済みのcomplete event file/datasetを受け取る
2. source-specific adapterでcanonical v2へ変換する
3. schema、required field、identity、parent、loss、AOE/usage semantics、digestを検査する
4. productionまたはprevious personal stageとのcomposite diffを作る
5. event packとmanifestを生成し、既存rollback検査を通す

一方、Codexがstageごとのpageを探し、転記し、欠損を推測する運用は合法性と正確性を保証できず、producer作業も`N`に比例する。ownerが`N` fileを1回でuploadしても、保存前のowner作業は減らない。

最も現実的な将来像は、source作者または許可済みdataset/APIがcomplete one-event inputを提供し、Codexが機械的producerになる方式である。現段階で作成時間を分単位に断定できるreal sampleはない。

## 12. GitHub/public datasetで有望なもの

### 技術設計の参考として最有力: CapsuleOS

CapsuleOSは1 repository内にdatabase更新、event import/export project、enemy/AI処理を持ち、event pack producerの構造を考える参考として最も近い。しかし、[database updater](https://github.com/itZcat17/CapsuleOS/blob/main/srv/database-update.js)はDokkan Eclipseのfile-browser URLを参照し、bundled DBはEnglish/global、repositoryにlicenseがなく、data provenanceも公開利用許可も確認できない。[event importer](https://github.com/itZcat17/CapsuleOS/blob/main/app/lib/event-import.js)はcustom project/SQL/stage JSONからの復元に強いが、current official eventをcomplete exportする公開機能ではない。

### event階層dataの参考: eve718 calculator

[`eve718/dokkan-calculator`](https://github.com/eve718/dokkan-calculator)はevent階層とNormal/Super/AOE attack計算dataを1 static assetに持つ。しかし[`scripts/new-entry.js`](https://github.com/eve718/dokkan-calculator/blob/main/scripts/new-entry.js)はstage、battle、phase、enemyを人間が対話入力するgeneratorであり、source取得問題を解いていない。dataはstaleで、canonical必須fieldとdata licenseも不足する。

### event APIという名前だが対象外: Solaiman API

[`SolaimanBaraka/API_DOKKAN`](https://github.com/SolaimanBaraka/API_DOKKAN)のevent modelは名前、期間、difficulty、reward、wiki URL等に限られ、stage/enemy/attack dataを提供しない。schedulerもenemy data更新を証明しない。

その他の公開DB、bot、card API、repositoryはstale、card-only、source非公開、data license不明のいずれかで、上記より弱い。

## 13. DokkanInfo fallbackより明確に優れた経路があるか

ない。Fandom/CapsuleOSはowner操作を一定にできる「形」では優れるが、完全性・許可・最新性のどれかで実用に達しない。`eve718`はownerの取得操作だけ見れば1 fileでも、producerの手入力がstage数に比例するため、全体運用ではfallback以下である。

## 14. 最有力案

**許可済みproducerが作る、versioned event update pack**を最終目標のまま維持する。具体的なsourceは未選定とする。

packは最低限次を保持する。

- schema version、pack version、app compatibility
- event IDとcomplete stage list
- encounter/phase/enemyのstable IDとparent
- class/type、HP、ATK、DEF
- normal、multiple Super、AOE first/additional、conditions、usage rules、AI
- source、source version/date、取得方法、permission scope
- record/file digest、producer identity、生成時刻
- event全置換かpartial mergeかのscope、removal/tombstone宣言
- validation結果、known-good参照、rollback情報

Android側は「packを選ぶ→diffを確認→取り込む→完了」の約4操作を目標にする。このreader/safety基盤は既に大部分があるため、sourceが決まる前に別prototypeを増やさない。

## 15. 残る問題

- complete one-event inputを合法かつ継続的に提供するsource/producerがいない
- multiple Super、AOE target、AI/usage conditionsをlossなく得られる証拠がない
- 1週間以内の更新を示すhistory/SLAがない
- personal local processing、derived private pack、public redistributionの許可範囲が分離して確認できていない
- source間のID対応を名前推測なしで確立する必要がある
- event完了をどう宣言し、欠落stageをどう検知するかがsource contractに必要
- authorized inputが得られた後も、small sampleでcanonical lossとruntime compatibilityを実証する必要がある

## 16. これ以上調査を続ける価値があるか

**新しい事実がないまま同じ公開repository/siteを調べ続ける期待値は低い。** 今回、bulk dump、DB、event project、event API、embedded static dataまで範囲を広げても、突破口は得られなかった。ここで調査を停止し、trigger待ちとするのが合理的である。

## 17. 今後待つべきtrigger

次のいずれかが起きた場合だけ、Phase 11のevent pack検討をこの地点から再開する。

- Franceから、必要なmanual/automatic/derived/private/public操作とevent export/APIについて書面回答が来る
- DokkanStatsから同様の回答が来る
- source作者が1 eventまたはfull datasetの明示license付きexportを公開する
- CapsuleOS/Dokkan Eclipse等がdata provenance、利用条件、JP/full coverage、documented exportを明示する
- Fandom等でrecent eventの必須fieldが実際に揃うことを示す新しいsample/evidenceが出る
- ownerが権利確認済みのcomplete one-event fileを提供する
- ownerが特定eventを急ぎ追加し、既存DokkanInfo fallbackを使う

再開時はsource preflight→最小sample→canonical/loss検査→private pack feasibilityの順で進め、最初から基盤を作り直さない。

## 18. production未変更

Phase 9 productionの56 event分類、647 stage/battle、4,245 enemies、8,899 attacksを変更していない。`main`、`origin/main`、production Pages、production data/workflow、OneDriveを変更していない。Phase 11 branch内の調査文書だけを追加する。

## 19. 外部自動取得0

- France直接access: 0
- DokkanStats直接access: 0
- Dokkan Eclipse API/file/database access: 0
- undocumented/private endpoint call: 0
- crawler/scrape/background traversal: 0
- source enemy dataのdownload/import: 0

公開検索、公式document、GitHubの公開metadata/source reviewだけを行った。新adapterやdata packは作っていない。

## 20. Phase 12未開始

Phase 12は開始していない。Phase 11のDokkanInfo personal fallback、canonical/runtime、validation、diff、atomic apply、known-good、rollbackを保存したまま、owner確認と上記triggerを待つ。

## 最終判断

Androidで1 eventを1〜数操作で追加する理想は、**packの受取・検査・取込側では実現可能**である。しかし、2026-09-03時点で利用可能な公開情報には、packの入力を合法・完全・最新・継続的に供給する経路がない。したがって新prototypeを作らず、DokkanInfoを緊急時fallbackとして保持し、France/DokkanStatsの返信または新しい明示license付きevent exportを待つ。
