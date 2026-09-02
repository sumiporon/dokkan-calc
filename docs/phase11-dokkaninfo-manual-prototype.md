# Phase 11 DokkanInfo保存ページ手動取り込みprototype 完了報告

2026-09-02 JST。owner承認済みの**production分離prototype**であり、Phase 12や最終仕様ではない。正式Pages、`main`、production敵データ、production workflow、OneDriveは変更していない。

owner再確認用の固定previewは `https://raw.githack.com/sumiporon/dokkan-calc/phase11-dokkaninfo-manual-prototype-2026-09-02/phase11-preview/index.html`。自作の架空DokkanInfo形fixtureだけを同梱した一時的なtag previewであり、正式Pagesではない。

## 結論

保存済みDokkanInfoのchallenge stageページは、旧snapshotでHP、ATK、DEF、属性、超・極・中立、複数必殺、usage rule、skill、表示されたAI、対象別AOE値を1ページから復元できた。既存parserをPhase 11のローカルfile入力へ接続し、`manual-dokkaninfo → canonical v2 → runtime → Phase 10安全検査 → diff → 明示的な個人保存`まで動作するprototypeを作成した。

一方、eventページにあるのはstage名・stageリンクで、各stageの敵詳細は含まれない。したがって、次が実測に基づく最小単位である。

| 追加対象 | 必要な保存ページ |
| --- | ---: |
| event内のstage 1件 | event 1ページ + stage 1ページ |
| 同じevent内のstage N件 | event 1ページ + stage Nページ |

event 1ページだけから複数stageの敵詳細を安全に復元することはできない。prototypeはeventと複数stageを一度に選択・解析・保存できるが、ownerが各stageページを保存する操作そのものは残る。一度に最大10ファイル、合計16MBなので、新イベントなら通常はevent 1件＋stage最大9件を1回で選択できる。ただし大きなMHTMLでは容量上限が先に来る。この制約があるため、Android内保存と同様に**最終更新方式へはまだ固定しない**。

ここでいう最小ページ数は、2026-02-23の保存layoutに**実際に表示された情報を復元する単位**である。ゲーム側に存在してもページへ表示されないAIや条件まで完全だと証明するものではない。AOEを含むstageは攻撃種別を確定できずapply停止となり、現在のAndroid Chromeが保存する最新1ファイルもまだ未検証である。

## 再利用した旧処理と保存snapshot

- 旧rich parserは`tests/helpers/cached-enemy-source.mjs`にあり、Phase 4 generatorが利用していた。
- parser本体を`src/data-foundation/dokkaninfo-saved-stage.mjs`へ移し、旧helperは互換re-exportにした。Node専用の別parserを書き直さず、browserでbundleできる同じCheerio slim parserを共用する。
- Phase 4 generator内の保存stage→candidate変換を`src/data-foundation/dokkaninfo-saved-stage-v1.mjs`へ抽出した。Phase 4の全801 stage生成物・digestは変更前と一致する。
- Phase 6の既存変換へ、既定動作を変えない任意provenance指定を追加した。手動経路だけ`sourceKey: manual-dokkaninfo`を使う。
- 保存snapshotは現在も`C:\Users\kou20\Downloads\dokkan-calc-main\scraper\html_cache`に存在する。891ファイル、691,464,028 bytes（約691MB/659.43MiB）、取得時刻`2026-02-23T08:11:11.385Z`、88 event、801 stageである。
- 既存の全件成果は1,352 encounter、5,032 enemy、4,924 Super、168 usage rule、1,679 AI action、75 AOE、443 neutral enemyを保持する。

## production 4,245敵との関係

現行productionは`scraper/all_enemies.json`をPhase 9で直接runtime化した56 event種別、647 stage、4,245 enemy、8,899 attackである。source digestは`sha256:f1cb27a2e5cae9627be61934aaabec79e4af0b42d3e21ad0cc7945eb6d7a0b40`。

repo内の`scraper/parse-cached.js`は同じDokkanInfo保存cacheを旧形式へ解析して`all_enemies.json`を生成する処理である。ただし、旧処理はATK 0行を落とし、中立を極へ寄せ、必殺欠損を3倍補完し、複数必殺・対象別AOE・AI・DEF等を旧形式で失う。新しい5,032敵candidateは旧productionを置換せず、Phase 9 productionも変更していない。今回の個人追加は別ID・別IndexedDBで合成比較するだけである。

## prototypeの接続

主要な追加箇所は次のとおり。

- `src/prototype/phase11-dokkaninfo-adapter.mjs`: ownerが選択したローカルDokkanInfo event/stage HTML・MHTMLだけを処理するsource-specific adapter。
- `src/prototype/phase11-intake.mjs`: source判別、normalized材料、canonical/runtime、Phase 10 review、partial overlay、明示applyを共通化。
- `prototypes/phase11-manual-intake/`: Android向けのfile選択、差分確認、明示保存、reload、rollback、全個人追加削除UI。
- `phase11-preview/index.html`: 自作の架空DokkanInfo形fixtureだけで試せる固定単一HTML。

処理順は次のとおり。

```text
ownerがAndroid Chromeでページを開いて保存
  → 固定browser prototypeでHTML/MHTMLを複数選択
  → 形式・容量・元URL・event/stage IDを検査
  → 旧DokkanInfo parserでローカル解析（通信なし）
  → 欠損検査
  → canonical v2 / runtimeへ変換
  → Phase 10 schema・出典・ID・意味・diff検査
  → 日本語preview
  → ownerが「この端末の試作に保存」
  → 暫定IndexedDBへatomic apply
```

raw HTML/MHTML、画像body、script、form、Cookie、認証情報はIndexedDBへ保存しない。allowlistした正規化結果、出典、入力bytes/digest、adapter version、canonical/runtimeだけを保存する。URLだけを選んでも取得せず、source linkをtool自身が開くこともない。

固定previewには保存snapshot由来のevent名catalogも含めない。event名は毎回ownerが選んだeventページだけを出典にし、そのeventページとstageページそれぞれのfile名・元file形式・bytes・SHA-256だけを本文なしで暫定保存へ残す。

## HTML / MHTMLとidentity検査

- HTMLとMHTMLの両方を受け付ける。各raw fileは8MB、解析後HTML本文は4MB、合計16MB、MIME 128 partsまで。
- 実snapshot最大のstage HTML 2,368,182 bytesを4MB上限内で解析した。
- MHTMLのquoted-printable/base64、root、`Content-Location`、`Snapshot-Content-Location`、`cid:`画像参照を検査する。
- `https://jpnja.dokkaninfo.com/events/challenge/<eventId>`または`.../<eventId>/<stageId>`だけを受け付け、`og:url`は一意でなければ停止する。
- host、scheme、path、event/stage ID、MHTML保存元URLが一致しなければ停止する。ファイル名からIDやURLを推測しない。
- 合成fixtureではHTMLとMHTMLが同一normalized/canonical結果になり、`cid:`の属性・必殺iconも外部読込なしで解決できた。
- **Android Chromeが現在実際に作るDokkanInfo MHTML/HTMLは未受領**。容量、charset、MIME細部、現行layoutはowner実機の1ファイルで最終確認が必要である。

## 不足時の扱いと大量stage

HP/ATK/DEF、敵名、属性、超・極・中立、必殺名・値、AOE回数・最初/追加対象値、表示AIの種類・確率、event名、stage名の不足を推測で補わない。不足があれば保存せず、日本語で不足項目を表示する。

eventページだけを選ぶと、その受領HTML内に実在したstageリンクだけを案内する。未知eventのstageページだけなら「eventページも必要」と案内するが、未観測URLを作って開かない。

eventページは詳細を持たないため、合法なローカル解析だけで「eventを1回保存すれば全stage取得」は実現できない。現在のbest effortは次のとおり。

1. eventページを1回保存する。
2. 追加したいstageページを各1回保存する。
3. Pages試作のfile pickerでevent＋複数stageをまとめて選ぶ。
4. 以降のparse、validation、diff、個人保存は1回で行う。

つまり、取り込み後段は一括化できたが、source側の各stageを開く・保存する手間は消えていない。将来Android share targetや「開いている現在の1ページを受信箱へ追加」を検討すれば1stage当たりの受渡しtapは減らせるが、許可なしのlink巡回/fetchを使わない限り、stageページ自体を各1回開く必要は残る。

## offline実資料の検証

外部通信せず、既存snapshotから代表7 stageを新adapter→canonical/runtime→package再検証へ通した。

| 保存file | 主な確認 |
| --- | --- |
| `stage_1749_17490015.html` | 全敵のHP/ATK/DEF |
| `stage_1714_17140015.html` | 複数Super、HP usage rule |
| `stage_1744_17440013.html` | 複数Super、AI |
| `stage_1702_17020095.html` | AOE first 1,400,000 / additional 700,000 |
| `stage_711_7110011.html` | neutral alignment |
| `stage_1717_17170015.html` | AI action |
| `stage_701_7010013.html` | skill/条件情報、最大2.37MB級HTML |

全7件でHP/ATK/DEF、親子ID、canonical schema、runtime schema、hash再構築は成功した。複数Super、usage rule、中立、AI、skill、対象別AOE値も保持した。

ただし、保存layoutはAOEが通常攻撃か必殺かを確定できない。first/additional値を保持したまま`attackKind: unknown`とし、Phase 10の`AOE_SEMANTICS_UNRESOLVED`で個人applyを停止する。値を捨てたり通常/必殺へ推測しない。AOEを含まない完全fixtureは差分検査後に暫定IndexedDBへ保存でき、reload復元、更新、atomic失敗時の旧版維持、1世代rollback、全個人追加削除を確認した。

## Phase 10 safety checks

自動取得・公開用`sourcePreflight()`は変更も弱体化もしていない。手動個人試作には別purpose gateを設け、次を固定した。

- ownerが選んだlocal materialのprototype解析: 可
- source利用許可確認済み: いいえ
- 自動fetch: 不可
- production apply: 不可
- raw/derived再配布: 不可

canonical/runtime schema、evidence参照、親子・重複ID、属性、中立、固定攻撃値、複数必殺、usage rule、対象別AOE、AI、known/unknown、正式dataの欠落、同数ID差替、名前だけのproduction上書き、revision、digest、projection一致を検査する。疑わしい変更は明示確認、hard-failはapply前とapply直前の再検査で停止する。

## AndroidとWindowsの具体的な操作

### Android（今回の優先経路）

初回設定は特別なaccount、PAT、GitHub操作、PowerShell、拡張機能を必要としない。固定previewをChromeで開くだけである。

新イベントのstage 1件なら、概ね次の操作になる。

1. DokkanInfoのeventページをChromeで開き、通常の保存操作で保存。
2. 対象stageを開き、同様に保存。
3. 固定previewを開き、「ファイルを選択（複数可）」を押す。
4. eventとstageの2ファイルを選び、確定。
5. 自動表示された差分を確認し、「この端末の試作に保存」を押す。

同じeventの複数stageでは1を最初の1回だけ行い、2をstage数だけ行って3〜5をまとめられる。正確なtap数はAndroid/Chrome/ファイルpickerの機種差があるため未実測であり、理論値を実機値と呼ばない。

これは1 event・1 stageで「source保存2回＋prototypeで選択・確定・保存」の5つの論理操作である。より細かな設計上のtap比較は[Android中心の手動更新方式比較](phase11-manual-update-options.md)に残した。stageごとの保存を最終採用したわけではなく、実機負担が大きければcurrent-page受信箱、端末内完結を保証できるshare target、私用update packを次の比較対象としてownerへ戻す。

### Windows

同じ固定previewとfile pickerを使える。保存fileを複数選択しやすい点以外、parse・検査・保存内容は同じである。Windows専用拡張やterminalは必要ない。端末内IndexedDBは同期されないため、Androidの個人追加がPCへ自動反映されることはない。

## Franceの位置づけ

owner実機でrecent複数stageのHP/ATK/DEFが0だったため、France単独をprimaryにしない。Super名/effect、damage reduction、HP/turn条件、status immunity等を将来合法に補助できる可能性だけ残す。2026-08-31送信済み問い合わせは返信待ちで、今回再送・follow-up・fetchをしていない。DokkanStatsも返信待ちのままでアクセスしていない。

## 検証結果と停止地点

- `npm test`: **270 / 270成功**
- Phase 11専用: data 35 + Chromium/WebKit browser 13 = **48 / 48成功**
- failed 0 / skipped 0 / cancelled 0
- Phase 4全801 stage再生成と既存artifact digest: 一致
- 360px / 390px: 横overflowなし
- Chromium / WebKit: HTML/MHTML、複数file、不足停止、明示保存、reload、rollback、atomic failure、stale preview、破損回復、外部request 0
- in-app Chromium 390px / 360px: 自作DokkanInfo形event HTML＋stage MHTMLのpreview、保存、reload復元、横overflowなしを目視確認
- Android実機の保存menu、file picker、MHTML容量・layout: **未確認**

production Pages、`main`、`origin/main`、production dataset/workflow、OneDrive、startup auto-updateは変更していない。DokkanInfo、France、DokkanStatsへの自動通信は0。Phase 12へ進まずowner確認を待つ。

## ownerに次に確認してもらう1ファイル

まず大量の実fileは不要である。Android Chromeで、**HP・ATK・DEFが画面に表示される現在のDokkanInfo `challenge` stageページを1つだけ**通常操作で保存し、固定previewのfile選択へ渡す。対応しなければ、その`.mhtml` / `.mht` / `.html`の1ファイルだけをCodexへ添付する。これで現行layout、AndroidのMIME/charset、容量、`cid:`参照を確認し、次の判断をownerへ戻す。
