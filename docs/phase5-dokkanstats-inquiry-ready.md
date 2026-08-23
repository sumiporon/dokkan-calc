# 第5段階 DokkanStats問い合わせ完成稿（未送信）

作成日: 2026-08-23（JST）

## 状態

これは第5段階の調査を反映した**送信可能な完成稿**である。**Codexは送信していない。** 所有者の明示的な承認と送信までは、DokkanStatsへの自動access、bulk download、非公開API調査、data変換・再配布を開始しない。

- 推奨宛先: `contact@dokkanstats.com`
- 公式form: [DokkanStats Contact](https://dokkanstats.com/en/contact/)
- 公式規約: [DokkanStats Terms of Use](https://dokkanstats.com/en/terms-of-use/)
- project: [sumiporon/dokkan-calc](https://github.com/sumiporon/dokkan-calc)
- 公開app: [GitHub Pages](https://sumiporon.github.io/dokkan-calc/)
- 推奨送信文: 下記の英語版。長文なので公式formよりemailを推奨

Terms of Useは、事前の書面許可なしのscraping、crawling、systematic downloadを禁止している。通常の公開page、Terms、Contact、Updatesを確認した範囲では、文書化された一般向けAPI、export、open-data licenseは見つけられなかった。問い合わせの返信を許可と推測せず、許可範囲、rate limit、再配布、保持期間、取消条件を明示的に確認する。

## 送信前に所有者が行うこと

1. project URLと公開app URLが正しいことを確認する。
2. 署名を`sumiporon (project owner)`のままにするか、希望する名前へ変える。
3. 英語版をemailへ貼り付ける。emailが使えない場合だけ公式formを使う。
4. 返信原文を公開repository外の安全な場所へ保存する。
5. 返信が来たら、取得を始める前にCodexへ全文を提示して許可範囲をpermission ledgerへ変換する。

返信に「yes」だけが書かれている場合も、API、再配布、頻度、全履歴取得、自動適用のどこまでを許したのか曖昧なら再確認する。

## 日本語版

**件名: DokkanStatsのボスデータ利用、自動アクセス、派生JSON公開についての書面許可のお願い**

DokkanStats運営者様

はじめまして。GitHub上で、ドラゴンボールZ ドッカンバトルの耐久・被ダメージ計算用の非営利個人アプリ「dokkan-calc」を管理しているsumiporonと申します。

- Repository: https://github.com/sumiporon/dokkan-calc
- Public app: https://sumiporon.github.io/dokkan-calc/

現在、敵データの更新方法を、安全で継続可能なものへ作り直す設計を行っています。DokkanStatsのTerms of Useで、事前の書面許可なしのscraping、crawling、systematic downloadが禁止されていることを確認しました。そのため、許可をいただく前に自動取得や大量取得を開始することはありません。アクセス制限や非公開APIを回避する意図もありません。

可能であれば、DokkanStatsをこの計算アプリの単一の主要データ源として利用したいと考えています。希望する範囲は、日本版のevent、stage、boss／enemy phaseについて、現在の計算、移行検証、および将来互換性に必要な次の情報です。

- event、stage、phase、boss／enemy card等の安定IDと順序
- 敵名、5属性、Super／Extreme／neutral
- HP、基礎ATK、基礎DEF、damage reduction、最大攻撃回数
- 複数のsuper attack、倍率、damage、効果、発動確率、最大回数、cooldown、slot
- turn、HP、被弾回数、登場turn等によるATK／DEF変化
- enemy passive、enemy skill、AI condition、AI sequence、攻撃位置・対象
- AOEと、先頭対象／追加対象で値が異なる場合の各値
- criticalの適用範囲、確率、ATK倍率、DEF無視またはDEF低下の値
- sourceの追加日時、詳細完成日時、最終訂正日時、data version／revision

画像、site design、source code、記事、攻略文を複製することは希望していません。不明な値をこちらで推測して埋めることもしません。

HTML pageの反復取得よりも、運営者様が指定する正式API、download、export、change feedを利用したいです。利用可能なものがあれば、endpoint、認証方法、version、rate limit、IDの意味、変更・削除・訂正の通知方法をご案内いただけますでしょうか。

正式なAPI等がない場合、次の上限で公開pageを低頻度に自動確認・取得する書面許可をいただけるか、ご検討をお願いいたします。

- 通常の更新確認は最大1回／24時間
- 正式なchange feed、更新timestamp、ETag、Last-Modified等、指定いただく方法を優先
- 新規または変更対象だけを取得し、site-wide crawlは行わない
- 同時接続1、request間隔は最低3秒
- 通常は変更確認だけとし、変更日の上限を最大30 requests／dayとする
- project URLと連絡先を含む専用User-Agentを使用
- Retry-Afterを守り、401、403、429、Termsまたはrobots変更時は自動停止
- 運営者様が指定する、より厳しい条件を優先

変更対象を安全に判定する正式な方法がない場合、自己判断で全pageを巡回しません。推奨方法が得られなければ自動取得を開始しません。

過去データの移行を検証するため、通常の定期更新とは別に、許可されたevent categoryの全履歴を一度だけ取得できるかも確認したいです。可能な場合は、exportを優先し、時期、request数、間隔を事前に相談します。許可なく実行しません。

取得したゲーム内の数値、ID、条件をsource-neutralな形式へ正規化した派生JSONを、非営利計算アプリの入力として公開GitHub repositoryとGitHub Pagesで再配布してよいかも、明示的に確認させてください。

- DokkanStatsへのlink、指定されたcredit／license、取得日とdata versionを表示します。
- DokkanStats独自のcode、design、画像、解説文、記事全文は複製しません。
- raw responseは許可された場合だけ、監査目的で非公開保管します。
- rollbackのため、検証済み派生JSONの直前版・過去版を保持する場合の可否も確認します。
- data販売、有料API提供、広告目的の再販売には使いません。

対象データに第三者提供・第三者由来の情報が含まれる場合、DokkanStatsから派生JSONの再配布を許可できる範囲と、別途必要な許諾・credit条件も教えてください。

更新速度は、この用途にとって重要です。event pageが作られた日時ではなく、HP、ATK、DEF、super attack、AI等の詳細値が計算に使える状態になった日時を知りたいです。可能であれば、次についてご教示ください。

当方の運用目標は、詳細値が通常0～3日、原則7日以内に利用可能になることです。保証ではなく目安で構いませんので、現在または近い将来、この水準を継続して満たせる見込みがあるかも教えてください。

1. ゲームへの新stage実装後、stage一覧に現れるまでの通常・目標・最近の実績日数
2. 必須boss statsが完成するまでの通常・目標・最近の実績日数
3. `stageAddedAt`、`bossStatsCompletedAt`、`lastCorrectedAt`等のtimestampをAPI／exportで取得できるか
4. API／exportはsite表示より先、同時、または後に更新されるか
5. 公開pageの`?`は未収集、未確認、非該当、計算不能のどれを意味するか

また、過去～最新の単一sourceとして評価するため、次も確認したいです。

1. 日本版でboss statsを提供するevent categoryはどれですか。Challenge、Quest、Story、DB Story、Growth、Z-Battle等の対応範囲を教えてください。
2. 過去eventはどこまで遡れますか。全stageを列挙できる正式なindex／exportはありますか。
3. URLのarea／stage map／boss／phase等のIDは、長期利用可能なstable IDですか。
4. ID変更、record削除、値の訂正を通知するfeedまたはrevisionはありますか。
5. neutral class、multi-enemy／multi-phase、複数super attack、AOEの追加対象damage、criticalの倍率／DEF無視を機械可読に取得できますか。
6. 数値が未完成のrecordを、0や非該当と区別する正式な状態値はありますか。

初期運用では、取得したcandidateをschema、件数、ID、意味差分、回帰testで検証し、人が確認してから適用します。将来、同じ許可範囲とrate limitを守り、自動停止とrollbackを備え、すべての検証を通った版だけを自動適用することも許可されるか、ご教示ください。不可の場合は人の確認を維持します。

お手数ですが、少なくとも次を明示的にご回答いただけると助かります。

1. 正式API／export／change feedの有無と利用条件
2. 上記条件での自動accessの可否
3. 過去全履歴を一度だけ取得する移行検証の可否と条件
4. 公開GitHub／Pagesでの派生JSON再配布の可否と、第三者由来dataに別途必要な許諾
5. raw responseの非公開保持と、派生JSON過去版保持の可否
6. 必須credit、link、license、保持期間
7. 対応地域・event category・履歴範囲
8. stable ID、revision、変更・削除feedの有無
9. 新stage掲載と詳細boss stats完成の更新速度
10. 許可の有効期限、取消条件、再確認時期
11. 検証済み版の将来自動適用の可否

条件を技術的に守れない場合、または必要な許可をいただけない場合は、DokkanStatsを自動取得元として利用しません。

お忙しいところ恐れ入りますが、ご検討いただけますと幸いです。

sumiporon (project owner)
https://github.com/sumiporon/dokkan-calc

## English version (recommended)

**Subject: Request for written permission to use DokkanStats boss data, automate limited access, and publish derived JSON**

Hello DokkanStats team,

My name is sumiporon, and I maintain a small, non-commercial personal app called “dokkan-calc” for calculating durability and damage received in Dragon Ball Z Dokkan Battle.

- Repository: https://github.com/sumiporon/dokkan-calc
- Public app: https://sumiporon.github.io/dokkan-calc/

I am redesigning the app's enemy-data update process so that it is safe and sustainable. I have read the DokkanStats Terms of Use and understand that scraping, crawling, or systematically downloading content by automated means requires prior written permission. I will not start automated or bulk access before receiving permission, and I do not intend to bypass access controls or investigate private endpoints.

If possible, I would like to evaluate DokkanStats as the single primary data source for this calculator. The requested scope is limited to Japanese-version events, stages, and boss/enemy phases, and to data for current calculations, migration validation, and future compatibility:

- stable event, stage, phase, boss/enemy card IDs and ordering;
- enemy name, five-type mapping, and Super/Extreme/neutral class;
- HP, base ATK, base DEF, damage reduction, and maximum attack count;
- all Super Attacks, multipliers, damage, effects, chance, maximum uses, cooldown, and slot;
- ATK/DEF changes based on turn, HP, received attacks, entry turn, or similar conditions;
- enemy passives, skills, AI conditions/sequences, attack position, and target;
- AOE information, including separate first-target and additional-target values when applicable;
- critical scope, chance, ATK multiplier, and DEF-ignore or DEF-reduction value; and
- source-added, boss-stats-completed, and last-corrected timestamps, plus a data version or revision.

I do not want to copy images, site design, source code, articles, guides, or other written content. I will not guess or silently fill unknown values.

I would strongly prefer an official API, download, export, or change feed designated by you instead of repeatedly fetching HTML pages. If one is available, could you please provide the supported endpoint, authentication method, versioning, rate limits, ID semantics, and the method for reporting additions, corrections, and deletions?

If no formal API or export is available, would you be willing to grant written permission for low-frequency automated access to public pages under the following proposed limits?

- at most one update check per 24 hours during normal operation;
- use of any official change feed, update timestamp, ETag, or Last-Modified mechanism you specify;
- retrieval of only known new or changed records, with no site-wide crawl;
- one concurrent request and at least three seconds between requests;
- normally only a change check, with a maximum of 30 requests on a day when records changed;
- a dedicated User-Agent containing the project URL and contact information;
- respect for Retry-After, and automatic stopping on HTTP 401, 403, or 429, or when the Terms or robots directives change; and
- any stricter limits you specify taking priority.

If there is no supported way to identify changed records, I will not independently crawl all pages. I will ask for your recommended method and keep automated access disabled if no permitted method is available.

Separately from normal updates, I would like to validate a one-time historical migration for permitted event categories. May I obtain the full historical dataset once for this purpose? I would prefer an export and would agree on timing, request count, and spacing with you in advance. I will not perform this historical collection without explicit permission.

I would also like explicit confirmation on redistribution. May I publish source-neutral derived JSON containing normalized in-game numeric values, IDs, and conditions in the public GitHub repository and GitHub Pages app for this non-commercial calculator?

- I will display a link to DokkanStats, any credit or licence text you require, the acquisition date, and the data version.
- I will not republish DokkanStats source code, design, images, guides, articles, or other original written content.
- I will keep raw responses private and only if you permit their retention for audit purposes.
- Please also confirm whether approved older derived JSON releases may be retained for rollback.
- I will not sell the data, offer a paid API, or resell it for advertising purposes.

If any relevant data is supplied by or derived from a third party, please clarify what redistribution DokkanStats is authorised to permit and whether any separate permission or attribution is required.

Update latency is important for this use case. I need to distinguish the date when a stage page exists from the date when HP, ATK, DEF, Super Attack, and AI details are complete enough for calculations. Could you please clarify:

Our operational target is for complete calculation details to become available normally within 0–3 days and generally no later than 7 days. A non-binding estimate is sufficient; could you please tell me whether this target is realistically sustainable now or in the near future?

1. the normal, target, and recently observed delay from an in-game stage release to its appearance in the stage index;
2. the normal, target, and recently observed delay until required boss stats are complete;
3. whether `stageAddedAt`, `bossStatsCompletedAt`, and `lastCorrectedAt`, or equivalent timestamps, are available through an API or export;
4. whether the API/export updates before, at the same time as, or after the website; and
5. whether `?` on a public page means not collected, not verified, not applicable, or not computable.

To evaluate historical-to-current single-source coverage, could you also clarify:

1. Which Japanese-version event categories provide boss stats? Please include the status of Challenge, Quest, Story, DB Story, Growth, Z-Battle, and any other relevant categories.
2. How far back does boss-stat coverage go, and is there an official index/export that lists every stage?
3. Are URL values such as area, stage map, boss, and phase IDs intended to be stable for long-term use?
4. Is there a feed or revision mechanism for ID changes, deleted records, and corrected values?
5. Are neutral class, multi-enemy/multi-phase encounters, multiple Super Attacks, additional-target AOE damage, and critical multiplier/DEF-ignore values available in a machine-readable form?
6. Is there an explicit state that distinguishes an incomplete numeric value from zero or not-applicable?

At first, every candidate dataset would be checked by schema validation, count and ID checks, semantic diffs, and regression tests, then reviewed by a person before use. In the future, would you permit a fully validated release to be applied automatically while keeping the same permission scope and rate limits, with automatic stopping and rollback? If not, I will retain manual review.

To avoid ambiguity, I would appreciate explicit answers to at least these points:

1. availability and terms of an official API, export, or change feed;
2. permission for the limited automated access described above;
3. permission and conditions for a one-time historical migration check;
4. permission to redistribute derived JSON through public GitHub and GitHub Pages, including any separate permission required for third-party-derived data;
5. permission to privately retain raw responses and publicly retain older derived releases for rollback;
6. required credit, links, licence text, retention period, or other conditions;
7. supported region, event categories, and historical coverage;
8. stable IDs, revisions, and change/deletion reporting;
9. update latency for stage discovery and complete boss stats;
10. permission validity, revocation conditions, and review date; and
11. whether future automatic application of fully validated releases is permitted.

If I cannot technically comply with your conditions, or if permission is not granted for a required activity, I will not use DokkanStats as an automated source.

Thank you for your time and consideration.

sumiporon (project owner)
https://github.com/sumiporon/dokkan-calc

## 返信後の判定方法

返信を受けたら、次を別々に`allowed`、`denied`、`unclear`で記録する。

| permission項目 | 確認内容 |
| --- | --- |
| access | 許可endpoint／page、頻度、同時数、間隔、User-Agent、認証 |
| history | 過去全取得の可否、1回の上限、実施時期 |
| storage | raw responseの非公開保持、保持期間 |
| transformation | 数値・ID・条件のnormalize可否 |
| redistribution | public GitHub／Pages、過去版、credit／license |
| automation | candidate生成、stable昇格、端末自動適用の各可否 |
| coverage | region、category、履歴開始、欠損の意味 |
| freshness | stage掲載、詳細完成、訂正のtimestampと通常日数 |
| lifecycle | 有効期限、取消方法、再確認日、連絡先 |

`unclear`が、取得、公開再配布、または自動適用に関わる場合、その行為は開始せず再質問する。返信が良好でも、少数sample、coverage、更新速度、schema、diff、回帰testが合格するまでは本番へ接続しない。
