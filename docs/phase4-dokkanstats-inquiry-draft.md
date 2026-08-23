# DokkanStatsへの利用許可問い合わせ草案

作成日：2026-08-22（JST）

## この文書の状態

これは、プロジェクト所有者が内容を確認した後、自分で送信するための草案です。**Codexは問い合わせを送信していません。** 返答を受けるまでは、DokkanStatsへの自動アクセス、非公開APIの調査、データの取得・変換・再配布を開始しません。

- 推奨宛先：`contact@dokkanstats.com`
- 公式問い合わせフォーム：[DokkanStats Contact](https://dokkanstats.com/en/contact/)
- 対象プロジェクト：[sumiporon/dokkan-calc](https://github.com/sumiporon/dokkan-calc)
- 用途：非営利の個人用計算アプリ（GitHub Pagesで一般公開）

メールを送る前に、所有者は「希望する頻度」と「公開したい項目」が下記の内容でよいかを確認してください。氏名を公開したくなければ、署名は`sumiporon (project owner)`のままで構いません。

## 2026-08-22時点で確認できた事実

### 利用規約

[DokkanStats Terms of Use](https://dokkanstats.com/en/terms-of-use/)（最終更新表示：2026-06-20、確認日：2026-08-22）では、次の規定を分けて確認しました。

- §3 Acceptable Use：事前の書面許可なしに、scraping、crawling、体系的な自動downloadを行わないこと。また、tier lists、guides、calculators等のoriginal contentを、attributionまたはpermissionなしに複製・配布・再公開しないこと。
- §7 Intellectual Property：DokkanStatsが作成したoriginal code、design、written contentは同サイトの知的財産であり、permissionなしにcopy・reproduceしないこと。

したがって、§7のcode、design、written contentについては、出典を付けるだけで複製できるとは扱いません。

したがって、次は別々に明示的な回答を得る必要があります。

1. 指定ページまたは正式APIへの低頻度の自動アクセス
2. 取得した数値・IDから作った派生JSONを、公開GitHubリポジトリとGitHub Pagesで再配布すること
3. 必要な出典表記、ライセンス、保持期間、停止条件

### robots.txt

[DokkanStats robots.txt](https://dokkanstats.com/robots.txt)（確認日：2026-08-22）は、一般の`User-agent: *`に`Allow: /`を示す一方、GPTBot、ClaudeBot、CCBot等の一部botを個別に拒否しています。また、Content-Signalでは検索利用と参照利用、AI学習を区別しています。

これは公開された技術上の指示ですが、**robots.txtで一般アクセスが許可されていても、利用規約が要求する書面許可の代わりにはなりません。** 今回は人が通常の公開ページを確認しただけで、巡回や大量取得はしていません。

### 更新性、連絡先、API・ライセンス

- [DokkanStats Updates](https://dokkanstats.com/en/updates/)には2026年8月までの更新記録があり、2026-06-12にはboss stats追加の記録があります（確認日：2026-08-22）。現在も保守されている可能性が高い、という判断材料になります。
- 正式連絡先は[Contact](https://dokkanstats.com/en/contact/)のフォームで、Terms of Useには`contact@dokkanstats.com`も記載されています。
- 通常の公開ページ、Terms、Contact、Updatesを確認した範囲では、一般利用者向けに文書化された公開API、data export、open-data licenseは見つけられませんでした。これは「存在しない」という断定ではなく、問い合わせで確認すべき未確定事項です。

### 第三者の権利

Terms of Use §1・§7は、Dragon Ball Z Dokkan Battleのgame assets、character names、artwork等の権利がBandai Namco Entertainment、Akatsuki、Toei Animation等の各権利者に属すると説明しています。DokkanStatsが出す許可は、DokkanStatsへのアクセスと、同サイトが許可できるcontentの範囲に限られ、第三者の権利まで代わりに許可するとは限りません。

この問い合わせでは計算用の数値・ID・条件に範囲を限定し、画像、記事、解説文、site design、source codeを複製しないことを伝えます。返信を得ても、それだけで全ての法的・規約上の問題が解決したとは扱いません。第三者の規約・権利が関係する項目が判明した場合は、その項目を公開しないか、必要な追加確認を行います。

## 希望する安全な利用条件

問い合わせでは、最初から大規模取得を求めず、次の上限案を提示します。相手から異なる条件が指定された場合は、その条件を優先し、技術的に守れない場合は利用しません。

| 項目 | 希望案 |
| --- | --- |
| 対象 | 日本版のchallenge/quest boss・event・stage・boss card・phaseに必要な範囲だけ |
| 更新確認 | 最大1回/24時間。正式API、change feed、更新timestamp、ETag等、相手が指定する検出方法を使う |
| 取得対象 | 相手が新規・変更対象を判定できる正式な方法を提供する場合だけ、その対象を取得する。site-wide crawlはしない |
| 同時接続 | 1 |
| 通信間隔 | 最低3秒 |
| 1日の上限 | 最大30 HTTP requests/day。相手指定がより少なければ従う |
| cache | `ETag`、`Last-Modified`等が提供される場合はconditional requestを使う。変更検出手段がなければ、自己判断で巡回せず相手へ方法を確認する |
| User-Agent | プロジェクトURLと連絡先を含む識別可能な専用User-Agent |
| error時 | `Retry-After`を守る。401、403、429、規約・robots変更時は自動停止 |
| 公開前 | schema、件数、ID、意味差分を検査する。初期運用は所有者が人手で承認。将来の自動適用は、相手が許可し、安定APIと自動停止・rollbackが揃った場合だけ |
| 全件照合 | 定期実行には含めない。必要なら別途許可を得る |

この数値は**こちらから提案する上限**であり、許可済み条件ではありません。明示的な回答を受けるまで実行しません。

正式API、change feed、更新timestamp、ETag、更新対象一覧等がなく、「変更分だけ」を安全に判断できない場合は、変更検出を自動化しません。相手が推奨する方法を再確認し、方法が得られなければ自動取得を停止したままにします。

## 利用を希望するデータ項目

可能であれば、HTMLの反復取得よりも、DokkanStatsが指定する正式APIまたはexportを優先します。希望項目は次のとおりです。

- event ID、stage ID、boss/enemy card ID、phase ID
- 敵名、type（5属性）、class（Super/Extreme）
- HP、基礎ATK、基礎DEF、damage reduction等の基礎値
- 1ターンの攻撃回数と攻撃位置・並び方
- super attack ID、倍率、damage、効果
- turn、被弾回数、HP、登場turn等に関係する条件
- enemy passive、enemy AI condition、enemy skill
- critical rate、critical時のDEF無視・DEF低下等
- AOEかどうか
- 出典の更新日時、data version、改訂識別子

すべてを要求するものではありません。提供可能な範囲と正しい意味を確認し、不明な値を推測で埋めません。

## 希望する再配布範囲

許可をお願いするのは、ゲーム内の数値・安定ID・条件を正規化した派生JSONです。

- 派生JSONを公開GitHubリポジトリとGitHub Pagesで、非営利計算アプリの入力として配布する。
- JSONとアプリ内に、DokkanStatsへのlink、指定されたcredit文、data取得日を表示する。
- DokkanStats独自のsource code、site design、画像、解説文、記事全文を複製しない。
- raw responseは、許可された場合だけ、検証・監査用に非公開保管する。公開しない。
- rollbackのため、承認済み派生JSONの過去版を公開履歴として保持する。これも許可範囲を確認する。
- 広告販売、data販売、有料API提供には使わない。

「数値だから自由に再配布できる」とこちらで判断せず、派生JSONの公開可否と必要な帰属を明示的に尋ねます。

## 送信前に確認したい質問

1. この用途に使える正式API、download、exportはありますか。
2. ある場合、正式endpoint、認証方法、version、rate limit、変更通知方法は何ですか。
3. ない場合、上記の低頻度条件で公開ページを自動確認・取得する書面許可をいただけますか。
4. 公開GitHub/Pagesで、上記の派生JSONを再配布してよいですか。
5. 必須のcredit、link、license表示はありますか。
6. raw responseを非公開で保持してよいですか。保持期間の指定はありますか。
7. 過去版の派生JSONをrollback用に残してよいですか。
8. 対象URL、1日上限、間隔、User-Agent等について希望条件はありますか。
9. 許可に有効期限、取消条件、再確認時期はありますか。
10. 許可内容と回答メール原文を、公開GitHub repositoryの外にある所有者専用のprivate保管先へ保存してよいですか。repositoryには個人情報を除いたstatusと許可範囲だけを記録します。
11. 初期は各候補を人が確認しますが、将来、同じ許可範囲とrate limitのまま、全validationを通った版を計算ツールが自動適用することは認められますか。不可であれば人の確認を維持します。

## 日本語メール草案

**件名：DokkanStatsのボスデータ利用・自動アクセス・派生JSON公開についての許可のお願い**

DokkanStats運営者様

はじめまして。GitHub上で、ドラゴンボールZ ドッカンバトルの耐久・被ダメージ計算用の非営利個人アプリ「dokkan-calc」を管理しているsumiporonと申します。

- リポジトリ：https://github.com/sumiporon/dokkan-calc
- 公開アプリ：https://sumiporon.github.io/dokkan-calc/

現在、敵データの更新方法を安全に作り直しています。DokkanStatsのTerms of Useで、事前の書面許可なしのscraping、crawling、体系的な自動downloadが禁止されていることを確認しました。そのため、許可をいただく前に自動取得を開始することはありません。技術的な制限を回避する意図もありません。

可能であれば、イベント・ステージ・敵phaseのID、属性・Super/Extreme、HP・ATK・DEF、damage reduction、攻撃回数・位置、super attack倍率・効果、enemy passive/AI condition/skill、turn/HP等の条件、critical/DEF無視、AOE等のデータを、計算に必要な範囲で利用したいと考えています。

正式なAPIまたはexportがある場合は、HTML取得よりも必ずそちらを利用したいです。endpoint、認証方法、rate limit、version、推奨される更新確認方法をご案内いただけますでしょうか。

正式API等がない場合、次の上限で低頻度の自動確認・取得を行う書面許可をいただけるか、ご検討をお願いいたします。

- 日本版の計算に必要なboss/event/stage/phaseだけを対象
- 更新確認は最大1回/24時間
- 正式API、change feed、更新timestamp、ETag等、指定いただいた方法で更新を確認
- 指定方法で新規または変更と判断できる対象だけを取得し、site-wide crawlは行わない
- 同時接続1、通信間隔は最低3秒、最大30 HTTP requests/day
- ETag/Last-Modifiedがあればconditional requestを使用
- プロジェクトURLと連絡先を記載した専用User-Agentを使用
- Retry-Afterを遵守し、401/403/429、規約・robots変更時は自動停止

上記より厳しい条件を希望される場合は、その条件に従います。条件を技術的に守れない場合は利用しません。

新規・変更対象を判定する正式な方法がない場合は、自己判断でページを巡回せず、推奨方法を改めて確認します。許可された方法が得られなければ、自動取得を開始しません。

また、取得したゲーム内数値・ID・条件を正規化した派生JSONを、非営利計算アプリのために公開GitHubリポジトリとGitHub Pagesで配布してよいかも確認したく存じます。DokkanStats独自のcode、design、画像、解説文、記事全文は複製しません。指定されたcredit、link、license、取得日を明記します。raw responseは許可された場合だけ非公開で保持し、公開しません。rollbackのための承認済み派生JSONの過去版保持についても、可否をご教示ください。

初期運用では各候補を人が確認してから適用します。将来、同じ許可範囲とrate limitを守り、schema・件数・ID・意味差分の検証、自動停止、rollbackが十分に安定した場合、検証済みの版を計算ツールが自動適用することも認められるか、あわせてご教示ください。自動適用が許可されない場合は、人の確認を維持します。

お手数ですが、次の点について明示的にご回答いただけると助かります。

1. 利用可能な正式API/exportの有無と利用条件
2. 上記条件での自動アクセスの可否
3. 公開GitHub/Pagesでの派生JSON再配布の可否
4. 必須のcredit、link、license表示
5. raw responseの非公開保持と、派生JSON過去版保持の可否・期間
6. 対象URL、頻度、上限、User-Agent等の希望条件
7. 許可の有効期限、取消条件、再確認時期
8. 上記の安全条件を満たした将来の自動適用の可否
9. 推奨される更新検出方法。change feed等がない場合に許可される代替方法

許可がない場合や、ご回答が難しい場合は、その旨だけでもお知らせいただければ、自動取得は行いません。

ご検討いただき、ありがとうございます。

sumiporon (Project owner, dokkan-calc)

https://github.com/sumiporon/dokkan-calc

## English email draft

**Subject: Permission request for DokkanStats boss data access and redistribution of derived JSON**

Hello DokkanStats team,

My name is sumiporon, and I maintain “dokkan-calc,” a non-commercial personal durability and damage calculator for Dragon Ball Z Dokkan Battle.

- Repository: https://github.com/sumiporon/dokkan-calc
- Public app: https://sumiporon.github.io/dokkan-calc/

I am redesigning the way the app’s enemy data is updated. I have read the DokkanStats Terms of Use and understand that scraping, crawling, or systematic automated downloading is not allowed without prior written permission. I will not begin automated access before receiving permission, and I do not intend to bypass any technical restriction.

If permitted, I would like to use only the data needed for calculations, such as event, stage, enemy/boss card, and phase IDs; type and Super/Extreme class; HP, ATK, DEF, and damage reduction; attack counts and positions; Super Attack multipliers and effects; enemy passives, AI conditions, and skills; turn/HP and other activation conditions; critical/DEF-ignore behavior; and AOE status.

If an official API or export is available, I would prefer and use that instead of fetching HTML pages. Could you please provide the official endpoint, authentication method, rate limits, versioning information, and recommended update-check method?

If there is no official API or export, would you grant written permission for the following limited automated checks and retrieval?

- Only Japanese-version boss/event/stage/phase data needed by the calculator
- At most one update check per 24 hours
- Use only an official API, change feed, update timestamp, ETag, or another update-detection method that you specify
- Retrieve only resources identified as new or changed through that method; no site-wide crawl
- One concurrent request, at least three seconds between requests, and no more than 30 HTTP requests per day
- Conditional requests using ETag or Last-Modified when available
- An identifiable User-Agent containing the project URL and contact information
- Compliance with Retry-After, with automatic stopping on 401, 403, or 429 responses, or when the Terms or robots.txt change

If you prefer stricter limits, I will follow them. If I cannot reliably enforce your conditions, I will not use the data.

If there is no supported way to identify new or changed resources, I will not crawl pages to infer changes. I will ask for your preferred method and will keep automated retrieval disabled if no permitted method is available.

I would also like to ask for permission to publish normalized derived JSON containing game facts, IDs, and conditions in the public GitHub repository and on GitHub Pages solely for this non-commercial calculator. I would not copy DokkanStats source code, site design, images, guides, articles, or other original written content. I will display any required credit, link, license notice, and retrieval date. Raw responses would be retained privately only if you permit it and would not be published. Please also let me know whether approved historical versions of the derived JSON may be retained for rollback.

Your permission response and any private contact details would be stored in an owner-only private location outside the public GitHub repository. The public repository would contain only a sanitized permission status, permitted scope, frequency, attribution requirements, and expiration date, without personal details, message text, attachments, or credentials.

Initially, I will review each candidate before applying it. In the future, if the same permitted scope and rate limits are maintained and schema, count, ID, and semantic-diff validation, automatic stopping, and rollback have proven reliable, would you also permit the calculator to apply validated releases automatically? If not, I will keep human confirmation.

Could you please explicitly confirm the following?

1. Whether an official API/export is available and its terms
2. Whether the limited automated access described above is permitted
3. Whether redistribution of the derived JSON through public GitHub and GitHub Pages is permitted
4. Required credit, links, and license notices
5. Whether raw responses and your permission response may be retained privately outside the public repository, and whether historical derived releases may be retained, including any retention limits
6. Any required URL scope, request frequency, daily cap, or User-Agent format
7. Any expiration, revocation, or periodic review requirement for the permission
8. Whether future automatic application of releases is permitted under the safeguards described above
9. Your recommended change-detection method, and any permitted alternative if no change feed is available

If permission cannot be granted, or if you prefer not to answer, I will keep automated access disabled.

Thank you for your time and consideration.

sumiporon (Project owner, dokkan-calc)

https://github.com/sumiporon/dokkan-calc

## 返答を受けた後の判断表

| 返答 | 対応 |
| --- | --- |
| 自動アクセスと公開再配布の両方が明示的に許可 | 指定された範囲・頻度・帰属・期限を許可台帳へ記録し、その範囲だけ候補生成を実装する。最初は計算ツール内の「更新確認」→「適用」の2操作で安全性を確認し、十分な実績と自動停止・rollbackが揃った場合だけ1操作または0操作を再評価する |
| 自動アクセスは許可、公開再配布は不可 | 公開アプリのデータ源には使用しない。私的・ローカル利用も許可文の範囲を再確認し、勝手に拡大しない |
| 公開再配布は許可、自動アクセスは不可 | 所有者が提供を受けた正式export等、明示的に許された手段だけを検討する。公開ページの自動取得はしない |
| 条件が曖昧または一部だけ回答 | 不明部分を再質問し、明確になるまで該当処理を実装・実行しない |
| 不許可または返答なし | DokkanStatsの自動取得を停止したままにし、現行の検証済み本番データを維持する |

返答を受けた場合は、メール原文、相手、受領日、非公開条件、失効・取消条件を、公開GitHub repository外の所有者専用OneDrive folder等、共有linkを発行していないprivate保管先へ残します。公開repositoryには、個人名・個人メール・原文・添付・credentialを含めず、sanitize済みstatus、許可範囲、頻度、帰属、有効期限だけを記録します。実装開始時にもTerms of Useとrobots.txtを再確認し、後から条件が変わった場合は自動停止します。

## 参照した公式ページ

すべて2026-08-22に確認しました。

- [DokkanStats Terms of Use](https://dokkanstats.com/en/terms-of-use/)
- [DokkanStats Contact](https://dokkanstats.com/en/contact/)
- [DokkanStats Updates](https://dokkanstats.com/en/updates/)
- [DokkanStats robots.txt](https://dokkanstats.com/robots.txt)
