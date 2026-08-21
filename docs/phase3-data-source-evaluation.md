# 第3段階：敵データ取得元の再評価

調査日：2026-08-21（JST）

この文書は、敵データの取得元を将来変更するための調査記録です。今回、敵データの更新、既存JSONの上書き、自動取得の再開、公開アプリの変更は行っていません。

## 先に結論

以前の「DokkanInfoを当面の主要候補にする」という判断は、**技術面では見直す必要があります**。

- 敵データの詳しさは、現時点では **DokkanDB** と **DokkanStats** がDokkanInfoより優れています。
- 特に、敵会心時のDEF無視率、AOE（全体攻撃）、攻撃位置、スクリプト型の攻撃順まで確認できます。
- ただし、3サイトとも、現時点で許可なく自動取得してよいとは判断できません。
- そのため、**許可が得られるまでは現行の本番敵データを維持し、自動取得を再開しない**のが安全です。
- 次の行動としては、自動取得について「事前の書面許可」という例外を規約に明記している **DokkanStatsへ正式に問い合わせる**ことを最優先に推奨します。

技術的にデータを取得できることと、そのデータを自動取得・再配布してよいことは別問題です。`robots.txt`で一般ページが許可されていても、利用規約で自動取得が禁止されていれば、利用規約側を優先して扱います。

## 調査方法と安全上の制限

- 公開ページ、公開利用規約、`robots.txt`、公開GitHubリポジトリ、通常のページ表示で配信される公開JavaScriptのみを少数回確認しました。
- ログイン、Cookie、非公開API、サイト内部の認証情報は使用していません。
- 隠しAPIや内部Supabaseエンドポイントへのリクエストは行っていません。
- Bot対策の回避、アクセス制限の回避、連続クロール、サイト全体の一括取得は行っていません。
- 利用規約が不明な場合は「自動取得可能」と判断していません。

以下の「高・中・低」という確度は、データの正しさそのものではなく、**今回の公開情報からその事実をどの程度明確に確認できたか**を表します。

## 比較概要

| 候補 | 必要な敵項目 | 構造・安定ID | 更新性 | 自動取得の扱い | 推奨する役割 |
| --- | --- | --- | --- | --- | --- |
| DokkanDB | 非常に高い | 内部は高度に構造化。複合IDを作れる | 活発とみられるが客観的な更新日を追いにくい | 規約で自動収集と隠しAPIアクセスを禁止 | 許可取得後の主データ源候補、現在は手動確認 |
| DokkanStats | 非常に高い | event/stage/boss/phaseを安定URL・クエリで確認可能 | 2026年の新イベントを確認 | 書面許可なしの自動取得を禁止 | **最優先の許可照会先** |
| DokkanInfo | 高い | イベント一覧JSON＋サーバー生成HTML＋安定ID | 比較的高いが保証なし | 自動エージェント・自動リクエストを禁止 | 現行データの出典、少数件の手動照合 |
| Dokkanalytics | 敵データ集ではない | 計算式・解説の静的サイト | 2026-08-12にリポジトリ更新 | データ取得元としての自動アクセスは不要 | 計算式の独立資料 |
| KX Dokkan Wiki | 実データ一式ではない | ゲームDB表とフィールドを詳しく解説 | 2026-01-25にリポジトリ更新 | 公開データ供給APIなし。ライセンス未確認 | 生フィールドとIDの意味を理解する資料 |
| dokkan.wiki | 敵イベント項目は不足 | カードAPIは構造化 | カード・ニュース用途では有用 | 自動検索・リクエストを規約で禁止 | キャラ名・カード情報の補助確認 |
| Fandom等のWiki | 人手編集のため不均一 | APIはあるがイベント内容は文章中心 | ばらつきが大きい | 個別の規約・Bot方針の確認が必要 | 曖昧なゲーム仕様の手動照合 |

## 1. DokkanDB

### 技術面で確認できたこと

公開されているBoss Stats画面の実装から、次のデータ構造を確認しました。確度は高です。

- イベント・ステージ：`quest_id`、`sugoroku_map_id`、`step`、`round_id`、wave
- 敵：`card_id`、`hp`、`attack`、`defence`、`multi_atk_num`、`ai_type`、`enemy_skill_ids`
- その他：`enemy_round_skill_set_id`、ゲージ、ドロップ、`charge_limit`
- 必殺：`special_set_id`、名称、説明、効果、`increase_rate`
- 敵パッシブ・特殊効果：`enemy_skills`
- 行動条件：通常、必殺、AOE、回復、カウントダウン、確率、HP範囲、最大回数、間隔、次のAI、攻撃位置

カードの`element`を使って属性・超／極を表示していることも確認しました。ただし、`element`から本アプリの`super/extreme + agl/teq/int/str/phy`へ変換する表は、実装前に代表データで再検証が必要です。確度は中です。

#### 必殺倍率

公開画面は、基礎ATKへ`increase_rate`分を加算して必殺ダメージを表示しています。そのため、`increase_rate`をそのまま本アプリの最終必殺倍率として保存すると、100%分を二重に数える危険があります。

将来は次を分けて保存する必要があります。

- 取得元の生の`increase_rate`
- 取得元画面が表示する合計倍率・合計ダメージ
- 本アプリがテスト済みの式から計算する派生値

#### `enemy_ai_conditions`

次のような情報を扱えます。

- `action_type`：通常、必殺、AOEなど
- `weight`：行動候補の重み
- `hp_rate_begin` / `hp_rate_end`：HP条件
- `min_interval`：クールダウン
- `max_number` / `max_num_per_turn`：最大回数
- `atk_rate_1` / `atk_rate_2`：AOE等の攻撃倍率
- `next_ai_type`：次の行動状態
- `ai_param` / `ai_param2`：必殺や追加条件との関連値

公開画面では、確率型だけでなく、行動1から行動2へ進むようなスクリプト型ループと攻撃位置も表示できます。

#### 会心

公開画面の実装では、通常の会心効果と段階的な会心効果を区別し、次を表示しています。

- 会心率
- ATK 1.5倍
- DEF無視率

DEF無視率は`eff_value`から算出されています。これは「DokkanDBの公開UIがそのように解釈している」という事実であり、ゲーム公式仕様として確定したものではありません。別資料や実測値による検証が必要です。

#### AOEと攻撃位置

- AIのAOE行動を判別できます。
- 最初に直接攻撃されるキャラと、2体目以降で異なる倍率を持てます。
- スクリプト型AIでは、必殺技や通常攻撃がどの位置で行われるかを表示できます。

これは現行JSONで全件0になっている`aoeDamage`や、現在失われている攻撃位置を将来復元する際に有用です。

### IDについて

独立した「敵個体ID」は今回確認できませんでした。確度は高です。

将来の一意キーは、次の複合キーにするのが適切だと推定します。

```text
source region
+ event tab/code
+ stage code または quest_id
+ step/round_id/wave/phase
+ phase内のenemy順番
+ enemy card_id
```

`card_id`だけでは、同じキャラクターが複数ステージ・複数フェーズに登場するため一意になりません。

### 不足・不確実な点

- 一部の代替データでは、カードIDや敵スキルIDだけで、ATK・DEFがない可能性があります。
- 取得元がどのゲーム版・データ更新から生成されたかを公開ページだけでは完全に追跡できません。
- 公開sitemapは確認時点で5,088 URLを持っていましたが、`lastmod`がなく、更新日時の証拠にはできません。
- 利用規約画面の「Last updated」は実行時の当日から生成される実装で、規約改訂履歴としては信頼しにくい状態でした。

### 規約・robots・ライセンス

- [利用規約](https://dokkandb.com/legal?tab=terms)は、自動ツールでのスクレイピング、収集、一括ダウンロードを禁止しています。
- 同規約は、リバースエンジニアリングや隠し・非公開APIへのアクセスも禁止しています。
- [robots.txt](https://dokkandb.com/robots.txt)は一般公開ページを許可する一方、GPTBot、ClaudeBot、CCBot等を全面拒否しています。
- fan-generated data/analysis、サイトのコード、設計、DB構造をDokkanDB側のコンテンツとして扱っています。
- 再利用できるオープンデータライセンスは確認できませんでした。
- 問い合わせ先として`info@dokkandb.com`が公開されています。

したがって、技術的に内部の構造化データを利用できそうでも、許可なくAPIや自動ページ取得を実装してはいけません。

### 評価

- 技術的な項目充足：高
- ID・構造の理解：高
- 更新性の証拠：中
- 無許可の自動利用可能性：低（禁止を確認）
- 将来性：書面許可または公式データ提供を得られれば高

## 2. DokkanStats

### 技術面で確認できたこと

[イベント一覧](https://dokkanstats.com/en/events/)と公開イベント画面は、通常のサーバー生成HTMLとして次を表示します。確度は高です。

- イベントID・ステージID
- boss card ID・phase・SA index
- HP、基礎ATK、DEF、ダメージ軽減率
- 最大攻撃回数、チャージ上限
- 必殺名称、説明、倍率、合計ダメージ
- 敵スキル、ターン・HP・被弾等の条件
- AI確率、HP範囲、最大回数、クールダウン
- スクリプト型の攻撃順、ループ、攻撃位置
- AOE
- 敵会心率とDEF減少率

URLとダメージ計算画面のクエリには、例えば次の情報が含まれます。

```text
/events/challenge/{eventId}/{stageId}
area={eventId}
smap={stageId}
boss={enemyCardId}
phase={phaseIndex}
saIndex={superAttackIndex}
```

確認例：

- [スクリプト型攻撃、AOE、攻撃位置](https://dokkanstats.com/en/events/challenge/1757/17570015)
- [敵会心とDEF減少率](https://dokkanstats.com/en/events/calculator?area=1737&boss=9207091&phase=1&saIndex=0&smap=17370594&type=challenge)
- [固定された攻撃位置を持つイベント](https://dokkanstats.com/en/events/challenge/1764/17640025)

2026年6月から7月開始のイベントを確認できたため、現時点の更新性は高いと判断します。ただし、サイトは正確性・完全性・適時性を保証していません。

### 構造上の注意

- 公開HTMLは読みやすい一方、一般利用者向けに文書化された敵データAPIやJSONエクスポートは確認できませんでした。
- 属性・超／極は画面に表示されますが、将来の自動インポートでは画像やCSS名に依存せず、運営者が提供する正式なフィールドを利用できるか確認すべきです。
- `boss`は敵カードIDであり、敵個体の一意IDではありません。イベント・ステージ・phase・順番との複合キーが必要です。

### 規約・robots・ライセンス

- [利用規約](https://dokkanstats.com/en/terms-of-use/)の最終更新表示は2026-06-20です。
- 規約は、**事前の書面許可なし**に、自動手段でスクレイピング、クロール、体系的ダウンロードをすることを禁止しています。
- サイト独自のコード、設計、文章はDokkanStats側の知的財産とされ、オープンデータライセンスは確認できませんでした。
- [robots.txt](https://dokkanstats.com/robots.txt)は一般参照を許可する一方、AI学習を拒否し、GPTBot、ClaudeBot、CCBot等を全面拒否しています。
- 問い合わせ先は`contact@dokkanstats.com`です。

規約に書面許可の例外が明記されているため、現在見つかった候補の中で、正式な許可を得られる可能性が最も分かりやすい候補です。

### 評価

- 技術的な項目充足：非常に高
- ID・構造の理解：高
- 更新性：高
- 無許可の自動利用可能性：低（禁止を確認）
- 書面許可を得た場合の主データ源候補：非常に高

## 3. DokkanInfo

### 技術面で確認済みのこと

- [イベント一覧](https://jpnja.dokkaninfo.com/events/challenge)には、`eventjson`として構造化されたイベント配列があります。
- イベントID、ステージID、カードIDをURLとページデータから取得できます。
- ステージ画面には、HP、ATK、DEF、属性、超／極、ダメージ軽減、必殺、敵スキル、攻撃確率・間隔・位置等があります。
- 通常のサーバー生成HTMLに必要情報があるため、Playwrightでブラウザを動かす技術的必要性は低いです。
- 一般利用者向けに文書化された、イベント敵データ全体の公開APIは確認できませんでした。

### 現行処理との関係

現行JSONで情報が欠けている原因には、DokkanInfo自体の不足だけでなく、既存パーサーの問題があります。

- 取得元のイベントID・ステージID・カードIDを捨てている
- 敵DEFを保存していない
- AOEが全件0になっている
- 会心対象でもDEF低下率が全件0になっている
- 名前中心の結合によって、別フェーズ・同名敵を区別できない
- 一部の必殺倍率や条件値に不自然な外れ値がある

そのため、旧スクレイパーをそのまま再開するべきではありません。

### 規約・robots・ライセンス

- [利用規約](https://jpnja.dokkaninfo.com/terms)の有効日表示は2022-06-13です。
- 個人・非商用利用の限定的なアクセス許可があります。
- 一方、自動エージェントやスクリプトによる自動検索、リクエスト、クエリを禁止しています。
- サイトの複製、再配布、類似・競合サイト構築に関する制限もあります。
- [robots.txt](https://jpnja.dokkaninfo.com/robots.txt)は一般参照を許可する一方、AI学習を拒否し、GPTBot、ClaudeBot、CCBot等を全面拒否しています。
- 再配布可能なオープンデータライセンスは確認できませんでした。

### 評価

- 技術的な項目充足：高
- ID・構造の理解：高
- 更新性：中から高
- 無許可の自動利用可能性：低（禁止を確認）
- 現在の役割：既存データの出典と、少数レコードの手動照合

## 4. Dokkanalytics

[Razzer's Calcing Guide](https://kandymanis.github.io/dokkanalytics/razzers-guide)は、イベント敵データの配信元ではありません。次の計算仕様を独立して確認するための有用なコミュニティ資料です。

- ATK・DEFの計算順序と各段階の切り捨て
- 敵のターン経過・被弾回数による強化
- 必殺倍率と必殺後の通常攻撃強化
- AOE
- 属性、ガード、ダメージ軽減
- 敵会心のATK 1.5倍とDEF無視

[GitHubリポジトリ](https://github.com/kandymanis/dokkanalytics)はMITライセンス表示があり、確認時点の最終pushは2026-08-12でした。ただし、ガイドはコミュニティ資料であって公式仕様ではありません。異論のある計算は、別資料や実測値でも確認する必要があります。

推奨する役割は、敵データ供給ではなく、計算テストの期待値と、取得元が表示する値の二次確認です。

## 5. KX Dokkan WikiとゲームDB

[Database Breakdown](https://karyonixx.github.io/kxdokkan-wiki/information/database-breakdown.html)では、ゲームDBの次の構造を確認できます。

- `enemy_ai_conditions`
- `enemy_skills`
- `quests`
- `special_sets`
- `z_battle_enemies`と各種escalation表

[Custom Event Guide](https://karyonixx.github.io/kxdokkan-wiki/custom-events/)では、ステージJSONの`round_id`、ATK、DEF、`ai_type`、`enemy_skill_ids`、`multi_atk_num`とDB表との関係が説明されています。

これは将来の生データ形式を設計するうえで非常に有用ですが、最新JP敵データ一式を提供する公開データセットではありません。

- [GitHubリポジトリ](https://github.com/KaryonixX/kxdokkan-wiki)の確認時点の最終pushは2026-01-25です。
- 検出可能なオープンソースライセンスはありませんでした。
- 専用の`robots.txt`は404でした。
- ライセンスやrobotsがないことは、自由な自動取得・複製の許可を意味しません。

ゲームDBを直接取得・復号する方法は、最新なら技術的に最も正確になる可能性があります。しかし、次の問題があります。

- データベースだけでなくステージJSONや資産との結合が必要
- 暗号化方式・クライアント更新への追従が必要
- ゲーム認証や配信経路を扱う可能性がある
- [Bandai Namcoの公開EULA](https://www.bandainamcoent.com/legal/bnea-eula-googleplay)には、ゲームの逆解析、逆コンパイル、ソース導出等を禁止する条項がある

したがって、正当に利用できる公式データ提供が見つからない限り、本アプリの本番取得経路には推奨しません。

参考プロジェクト：

- [Dragonball-Z-Dokkan-Battle-Database-Decryptor](https://github.com/bensnilloc/Dragonball-Z-Dokkan-Battle-Database-Decryptor)：MITの復号ツールですが、最新データセットではなく、最終pushは2021年です。
- [CapsuleOS](https://github.com/itZcat17/CapsuleOS)：DBスキーマ・参照ツールですが、利用者が復号済みDBを用意する構成で、検出可能なライセンスはありません。

## 6. その他の候補

### dokkan.wiki

カード用の構造化APIはありますが、必要なイベント敵ATK・DEF・AI・フェーズを網羅する公開APIは確認できませんでした。

[利用規約](https://dokkan.wiki/terms)は、自動エージェント・スクリプトによる自動検索、リクエスト、クエリを禁止し、類似サイトの構築やサイト内容の複製にも制限を設けています。敵データの主取得元には適しません。

### Fandom Wiki

イベント解説、古い仕様、特殊条件の文章による説明には価値があります。ただし、人手編集の文章・テンプレートが中心で、敵ATK・DEF・AI・IDの網羅性と更新速度は一定ではありません。

[Fandomのライセンス説明](https://community.fandom.com/wiki/Help%3ALicensing)では、特記がなければWiki本文をCC BY-SA 3.0として扱い、出典表示、ライセンス表示、同一条件での共有等を求めています。画像は同じライセンスとは限りません。

大量の文章やテンプレートを本アプリのJSONへコピーする構成は、ライセンス管理を複雑にします。曖昧なゲーム仕様を人が確認する補助資料に限定するのが適切です。

### 公開Dokkan API・GitHubデータセット

確認できた公開APIやJSONは、多くがプレイヤーキャラクター中心、過去のWikiスクレイプ、または更新停止したデータでした。現在必要なイベント敵ATK・DEF・AI・ステージ構造を満たしません。

例：

- [MNprojects/DokkanAPI](https://github.com/MNprojects/DokkanAPI)：AGPL-3.0ですが、UR/LRキャラクター中心で、元データはFandomスクレイプです。
- [feijoes/DokkanAPI](https://github.com/feijoes/DokkanAPI)：同系統のキャラクターAPIで、敵イベント用ではありません。

## 事実と推論の区別

### 公開情報から直接確認できた事実

- DokkanDBとDokkanStatsは、現行JSONより豊富な敵AI・会心・AOE情報を表示できる。
- DokkanStatsには、2026年の新しいイベントが掲載されている。
- DokkanDBは自動収集と隠しAPIアクセスを規約で禁止している。
- DokkanStatsは、書面許可なしの自動取得を規約で禁止している。
- DokkanInfoは自動エージェントによるリクエストを規約で禁止している。
- Dokkanalyticsは計算ガイドであり、敵データセットではない。
- KX Dokkan Wikiは詳細なDBスキーマ資料であり、最新敵データ一式ではない。

### 現時点の推論・設計判断

- 技術的な主データ源候補はDokkanStatsまたはDokkanDBである。
- 許可を得やすい可能性は、書面許可の例外を明記するDokkanStatsが最も高い。
- 独立した敵個体IDではなく、複数の正式IDとphase/orderを組み合わせる必要がある。
- 複数サイトの自動マージより、許可を得た単一の主データ源と手動照合の方が個人アプリには安全で保守しやすい。
- 書面許可が得られない場合、全件自動更新を諦め、必要な新イベントだけを少数ずつ確認する方が現実的である。

## 推奨する次の手順

### 1. まずDokkanStatsへ書面許可を問い合わせる

問い合わせでは、最低限次を明記します。

- 非商用の個人用計算アプリであるが、GitHub Pagesで一般公開されること
- 画像・文章・サイトデザインをコピーせず、数値、正式ID、AI条件だけを利用したいこと
- 必要なら低頻度、キャッシュ利用、明確なレート制限を守ること
- JSONを公開リポジトリへ保存・再配布してよいか
- 必要な帰属表示
- 利用可能な公式API、エクスポート、データファイルがあるか
- 許可の対象地域、期間、取り消し条件

口頭・曖昧な返答ではなく、自動取得、保存、公開JSONへの再配布の各範囲が分かる書面を得る必要があります。

### 2. DokkanDBにも公式提供の有無を問い合わせる

DokkanStatsで許可が得られない場合、またはDokkanDB固有の詳細が必要な場合は、`info@dokkandb.com`へ、公開API・限定エクスポート・利用ライセンスの提供可否を問い合わせます。

許可が出るまでは、公開JavaScriptから見つけたSupabase等の内部接続先を直接使用してはいけません。

### 3. 許可までは現行本番データを維持する

- `scraper/all_enemies.json`を上書きしない
- アプリ内の既存敵プリセットを上書きしない
- GitHub Actionsの定期取得を再開しない
- DokkanInfo、DokkanDB、DokkanStatsへのブラウザ自動操作を実装しない
- Bot対策を回避しない

人による少数件の確認も、「体系的なデータ複製が許可された」とは扱いません。許可がない間は、計算式や代表値の照合に限定します。

### 4. 許可後も小規模な試験から始める

最初から全イベントを更新せず、次の性質を持つ代表的な3～5ステージで試験します。

- 通常の確率型AI
- ターン・被弾・HP条件
- 敵会心とDEF無視
- AOE
- スクリプト型攻撃順・固定位置

取得値、手計算、取得元画面、既存アプリ結果の4つを比較し、差異を報告してから本番形式を決めます。

## 将来のデータ形式への提案

取得元の生データと、本アプリで計算した値を分ける必要があります。

```text
source
sourceUrl
sourceRegion
sourceCheckedAt
sourceVersionOrUpdatedAt

sourceEventId
sourceStageId
roundId
phaseIndex
enemyOrder
enemyCardId

rawAttack
rawDefence
rawElement
rawAiType
rawEnemySkillIds
rawSaIncreaseRate
rawAiConditions

derivedClass
derivedType
derivedNormalAttacks
derivedSuperAttacks
derivedConditions

evidenceNotes
manualOverrides
```

名前から作った疑似IDを正式IDとして扱わず、派生値には計算式のバージョンを付けるのが安全です。

## 最終判断

現時点の推奨順序は次のとおりです。

1. 現行の本番敵データを維持する。
2. DokkanStatsへ書面許可を問い合わせる。
3. 必要に応じてDokkanDBへ公式API・エクスポート・利用許可を問い合わせる。
4. 許可を得られた1つを将来の主データ源にする。
5. Dokkanalyticsを計算仕様、KX Dokkan Wikiを生フィールドの意味、DokkanInfo等を少数件の手動照合に使う。
6. 許可と検証基盤が整うまで、自動取得、定期実行、本番データ更新を行わない。

したがって、以前の方針から変えるべき点は、**DokkanInfoを技術的な第一候補とみなさないこと**です。一方、**許可が得られるまでは現行データを維持し、自動取得を停止する**という安全方針は、そのまま維持します。
