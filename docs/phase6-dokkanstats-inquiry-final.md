# 第6段階 DokkanStats問い合わせ最終版（未送信）

作成日: 2026-08-23（JST）

## 状態と送信方法

Phase 5完成稿を、ownerが指定した必須項目に照らして最終確認した。個人・非営利中心の計算tool、自動取得許可、頻度、正式API/feed、過去data、更新速度、派生JSON、GitHub/Pages配布、raw再公開を意図しないこと、attribution、rate limit、書面許可の範囲が全て含まれているため、内容を弱める変更はしていない。

**Codexは送信していない。ownerが自分で送信する。**

- 推奨宛先: `contact@dokkanstats.com`
- 代替: [DokkanStats公式Contact form](https://dokkanstats.com/en/contact/)
- 推奨方法: 長文のためemail

初心者向けの手順は次の通り。

1. 普段使っているメールを開き、宛先へ`contact@dokkanstats.com`を入れる。
2. 下のSubjectを件名へコピーする。
3. `Hello DokkanStats team,`から最後のproject URLまでを本文へコピーする。
4. 署名`sumiporon`を別名にしたい場合だけ変更し、送信する。
5. 返信全文を公開GitHubへ載せず、安全な場所へ保存する。
6. データ取得を始める前に返信全文をCodexへ提示し、permission ledgerへ反映する。

emailが送れない場合だけ公式formを使う。formに文字数制限がある場合は、文章を勝手に削って許可範囲を曖昧にせず、連絡可能なemail addressを尋ねる短いmessageを送る。

## Copy-ready English email

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

## 返信を受け取った後

返信を`access`、`history`、`storage`、`transformation`、`redistribution`、`automation`、`coverage`、`freshness`、`lifecycle`へ分け、各項目を`allowed`、`denied`、`unknown`としてpermission ledgerへ記録する。

取得、派生公開、将来自動適用に関する回答が曖昧なら開始せず再質問する。許可が得られても、少数sampleのcoverage、更新速度、schema、semantic diff、回帰testを通るまでは本番へ接続しない。
