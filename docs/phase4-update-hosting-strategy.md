# 第4段階：敵データ更新・利用・公開方式の比較

調査日：2026-08-22（JST）

この文書は、将来の敵データ更新をPC・Android・iPhoneで安全に使うための設計調査です。今回は方式を比較しただけで、敵データの取得、外部サイトへの問い合わせ、GitHub Actionsの再開、公開版の変更は行っていません。

外部サービスに関する事実は、各社の公式文書または対象サイト自身の公開ページだけを確認しました。設計上の提案や評価は「判断」または「推論」と明記します。

## 先に結論

この個人用アプリには、次の組み合わせを推奨します。

1. A・B・Cは、**計算ツール内で所有者が日常的に行う操作数**として扱う。Aは0操作、Bは「更新」1操作、Cは「更新確認」→「適用」の2操作である。GitHub管理画面、外部サイト、CLIを日常更新には使わない。
2. 最初はCで、アプリに出典・版・件数・重要差分を表示してから適用する。その後、安定性を確認できればBへ進める。
3. **A「完全自動」は長期目標として残す。** 書面許可、安定した正式APIまたはexport、検証gate、自動停止、rollbackが揃えば、外部更新の検出から端末適用まで0操作にできる。現在は前提が揃っていないため実行しない。
4. データ源の許可、候補生成、検証、本番扱いへの昇格はA・B・Cとは別の安全レイヤーにする。まずは自動検証済みcandidateをアプリが読み、所有者がCの2操作で自分の端末だけに適用する方式が安全である。
5. 配置は、**GitHub Pagesを普段使い、OneDriveをバックアップ・旧版・PC用offline版にする併用案を現時点の推奨**とする。ただし、これは第4段階の調査結論であり、移行はまだ承認・実施されていない。現行OneDrive利用も公開版も変更しない。
6. 敵データは、巨大JavaScriptから**版付きJSONへ分離**する。ただし、検証済みJSON、互換アダプター、旧データへの復旧経路が完成するまで本番を切り替えない。
7. PWAは有用だが、主目的はインストールとオフライン利用である。外部サイトの自動取得や規約問題を解決するものではない。
8. Viteは段階導入を推奨するが、更新方式を作るための絶対条件ではない。最初にVite移行を行う必要はない。
9. Cloudflare Workersや小規模バックエンドは、正式APIが秘密鍵やサーバー間通信を要求する場合、または計算ツール内から全端末向けの昇格を安全に承認する管理機能が必要な場合だけ追加する。

最も重要なのは、次の2種類の「更新」を分けることです。

- **取得・検証・昇格**：許可された外部データ源から候補を作り、検証し、配布可能な版へ昇格する内部処理
- **計算ツール内の更新操作**：新しい候補または承認済み版を、所有者の端末で確認・適用するA/B/Cの操作

両者を混同すると、「安全のために毎回GitHubでPRをmergeする」という余計な日常作業が発生します。安全gateは内部に保ち、所有者の日常操作は計算ツール内で完結させます。

## この文書で使う用語

| 用語 | 初心者向けの意味 |
| --- | --- |
| candidate（候補版） | 自動検査には合格したが、最初の運用ではまだ利用者が適用していない新データ |
| stable（安定版） | 運用実績と、候補版より厳しい条件を満たしたデータ |
| validation gate（検証関門） | 壊れたデータを先へ進めないための自動チェック一式 |
| manifest（案内ファイル） | データの版、件数、取得先等だけを書いた小さなJSON |
| digest / SHA-256（照合値） | downloadしたファイルが案内ファイルの指定どおりかを確認する値。配信者本人の証明ではない |
| signature（電子署名） | 信頼した秘密鍵を持つ発行者が作った版かを公開鍵で確認する仕組み |
| staging smoke test（切替前の試運転） | 新版をまだ利用中にせず、代表的な読込・検索・計算だけを一時的に試すこと |
| health check（切替後の確認） | 新版へ切り替えた直後に基本動作を確認し、失敗なら元へ戻す検査 |
| rollback（元へ戻す） | 新版で問題が起きた時に、直前の正常版へ自動または手動で戻すこと |
| origin（Web上の保存単位） | `https://example.com`等のprotocol・host・portの組み合わせ。違うoriginには別の保存領域が使われる |
| fallback（予備） | 通信や新版が失敗した時に使う、同梱済みの旧データ |

## 現在確認できた状態

### リポジトリと公開版

- 現在のアプリは、静的なHTML・CSS・JavaScriptとしてGitHub Pagesから公開されています。
- 2026-08-22の実測では、[公開トップページ](https://sumiporon.github.io/dokkan-calc/)と[現行敵JSON](https://sumiporon.github.io/dokkan-calc/scraper/all_enemies.json)はともにHTTP 200でした。
- 同じ実測で、敵JSONは5,017,420 bytes、`Access-Control-Allow-Origin: *`、`Cache-Control: max-age=600`でした。このヘッダーは将来も不変とは限らないため、実装時に再確認します。
- GitHub Pagesは静的ファイルを公開でき、公開リポジトリではGitHub Freeから利用できます。GitHub公式では、**Pagesのソースリポジトリは1 GBを推奨上限**、**公開されたPagesサイトは1 GBを上限**とし、帯域は月100 GBのソフト上限としています。本アプリの数MBのデータは現状この範囲内です。[GitHub Pagesの制限](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)（確認日：2026-08-22）

### OneDriveからの`file://`直開き

2026-08-22に、通常利用中のブラウザとは分離したChromeプロファイルで現行版を確認しました。

- `dokkan_calc_final.html`を`file://`で直接開くと、画面とカードは起動しました。
- その環境では`localStorage`の保存と読込も成功しました。
- 同じChromeの分離contextでは、`dokkan_calc_final.html`で保存したテスト用キーを、別の`file://`ページである`index.html`からも読めました。現行Chromeはこの2ファイルで保存領域を共有しましたが、これは製品仕様として依存できる保証ではありません。
- 相対URLの`fetch('./scraper/all_enemies.json')`は`Failed to fetch`になりました。
- `file://`からHTTPS上のJSONを読む場合、配信元が`Access-Control-Allow-Origin: *`を返すJSONは読め、同ヘッダーがないJSONは失敗しました。
- 現在のGitHub Pages上の敵JSONは`Access-Control-Allow-Origin: *`を返すため、PCの`file://`版からPages上のJSONを読むことは技術的には可能です。
- `file://`では`navigator.serviceWorker`自体は見えましたが、登録は`The URL protocol of the current origin ('null') is not supported`で失敗しました。

ただし、これは現在のChromeでの実測であり、Web標準上の保証ではありません。MDNは、`file:` URLの`localStorage`挙動は未定義でブラウザごとに変わり得ると説明しています。OneDriveや端末間で保存内容が同期される保証もなく、iOSのファイル表示用WebViewで同じように永続化されるとも限りません。また、ChromeやFirefoxはローカルファイルを不透明なoriginとして扱い、相対ファイルの`fetch()`でCORSエラーが起こり得ます。[localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)、[CORS request not HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp)（確認日：2026-08-22）

今回の`file://`実測はWindows PCのChromeだけです。Android・iPhoneでOneDriveからHTMLを開いた時のURL scheme、画面の起動、複数ファイル読込、保存の永続性は実測していません。モバイルではOneDrive内のpreviewや別のWebViewになる可能性もあるため、PCの結果をそのまま当てはめません。

したがって、OneDrive直開きを残す場合は、次のどちらかが必要です。

- 現行の埋め込みデータまたは同梱済みJavaScriptを、オフライン時のfallbackとして残す。
- CORSを許可したHTTPS上の承認済みJSONを読み、取得・検証に失敗したら埋め込み版へ戻す。

分離JSONを相対`fetch()`するだけの構成へ変えると、OneDrive直開き版は壊れます。

### OneDriveの役割

Microsoftは、OneDriveのPC同期、Files On-Demand、iOS・Androidでのオフラインファイル利用を案内しています。一方、HTMLは「プレビュー可能なファイル」として扱われており、アプリを同一originのHTTPSサイトとして配信する仕組みではありません。[Windows Files On-Demand](https://support.microsoft.com/en-us/onedrive/save-disk-space-with-onedrive-files-on-demand-for-windows)、[Android/iOSでのOneDrive利用](https://support.microsoft.com/en-us/onedrive/use-onedrive-on-android-and-ios-devices)、[OneDriveのプレビュー対応形式](https://support.microsoft.com/en-us/onedrive/file-types-supported-for-previewing-files-in-onedrive-sharepoint-and-teams)（確認日：2026-08-22）

「OneDriveは保管・同期に向くが、Webアプリの正規ホストには向かない」という評価は、上記の公式機能とブラウザ制約からの設計上の判断です。

## A・B・Cの意味

| 方式 | この文書での意味 |
| --- | --- |
| A 完全自動 | アプリが更新検出、download、検証、端末適用まで行う。所有者は0操作 |
| B アプリ内ワンタッチ | アプリが更新を検出・表示し、所有者が「更新」を1回押して端末へ適用 |
| C アプリ内で確認して更新 | 所有者がアプリ内で「更新確認」を押し、版・出典・差分要約を見て「適用」を押す。2操作 |

ここでいう操作数は、更新版が用意された後の日常操作です。外部データ源への許可確認、schema検証、異常差分の隔離等は、どの方式でも省略しません。

## A・B・Cの総合比較

| 比較項目 | A 完全自動 | B アプリ内ワンタッチ | C アプリ内で確認して更新 |
| --- | --- | --- | --- |
| 日常の操作数 | 0。アプリを開くだけ | アプリ内の「更新」を1回 | アプリ内の「更新確認」→「適用」の2回 |
| 反映速度 | 最速。検出・検証後すぐ | 候補配信後、1操作と数秒 | 候補配信後、差分要約を確認する数十秒程度 |
| 初期実装難易度 | 高 | 中 | 中 |
| 継続保守 | 高。誤取得を自動で止める精度が必要 | 低～中。1操作前に自動検証は必要 | 中。差分要約画面と候補版の保持が必要 |
| 費用 | Pages/Actionsだけなら現在の公開リポジトリでは基本0円。認証backendを加えると増える | PagesからJSONを配るだけなら基本0円 | 端末ごとのローカル適用ならPagesだけで基本0円。全端末向け昇格をアプリから行うなら認証backendの費用・保守が増え得る |
| 秘密情報 | 取得元API鍵はActions/サーバー側だけに置く | 公開済みJSONを読むだけなら秘密不要 | ローカル適用なら秘密不要。全体昇格用の長期PATをブラウザに保存してはいけない |
| 規約リスク | 最も慎重な前提が必要。書面許可と許可範囲の機械的制限が必須 | 操作数が変わっても取得・再配布許可は必須 | 出典と差分を表示できるが、2操作にしても取得・再配布許可の代わりにはならない |
| 失敗時の安全性 | gateとrollbackが完成すれば高くできるが、設計漏れの影響が大きい | 新版の検証失敗時に旧版を維持できる | 最も分かりやすい。適用前に内容を見て、旧版へ戻せる |
| PC | Pages/PWAなら技術的に可能。OneDrive直開きは制約あり | Pagesは技術的に可能。OneDrive直開きはPages JSON＋fallback案を要検証 | 計算ツール内の同じ2操作を実装可能。実装後テストが必要 |
| Android | Pages/PWAで技術的に可能と見込むが未実測 | Pages/PWAの1操作を実機確認するまで未確定 | Pages/PWA内の2操作を実機確認するまで未確定 |
| iPhone | SafariのWebアプリで技術的に可能と見込むが未実測 | Pages上の1操作を実機確認するまで未確定 | Webアプリ内の2操作を実機確認するまで未確定 |
| 現時点の採否 | 長期目標。許可・安定API・gate完成前は不採用 | Cが安定した後の推奨 | **最初の推奨** |

GitHub Actionsの標準GitHub-hosted runnerは公開リポジトリで無料です。[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)（確認日：2026-08-22）。ただし、artifactを長期間大量に保存した場合や、将来リポジトリを非公開化した場合は料金条件を再確認します。

## 端末と配置場所の比較

| 配置・使い方 | Windows PC | Android | iPhone | A/B/Cとの相性 | 判定 |
| --- | --- | --- | --- | --- | --- |
| OneDrive同期フォルダの`file://` | PC Chromeでは現行版が起動。相対JSON fetchは失敗。保存挙動は非保証 | OneDriveのファイル閲覧は可能だが、本アプリの起動・URL scheme・保存は未実測 | 同左 | Aは不向き。C/BのPages JSON＋埋め込みfallback案もPC・モバイル実機確認前は未確定 | PC用予備・保管の候補 |
| PCの`localhost` | 最も安定したローカル確認方法 | PCと同一LAN公開等が必要で日常利用には不向き | 同左 | 開発・テストに適する | 開発専用 |
| GitHub Pagesの通常ブラウザ | 技術的見込みは良好。実装後テストが必要 | 技術的見込みは良好。実機未検証 | 技術的見込みは良好。実機未検証 | A/B/Cを実装可能と見込むが、3端末での確認が採用条件 | **普段使いの推奨候補（移行未承認）** |
| GitHub PagesのPWA | 対応ブラウザでinstall可能。offline更新は未検証 | Chrome等でのinstall・保存・更新は実機未検証 | Safariの「ホーム画面に追加」は公式案内あり。offline更新・保存は未検証 | A/B/Cすべての実機テスト後に判定 | 段階導入候補 |
| Pages＋OneDrive併用 | Pagesを普段使い、OneDriveをoffline版・backupにする | Pagesを使用 | Pagesを使用 | 最初はC、安定後B、条件完成後A。OneDriveは復旧用 | **現時点の推奨案（移行未承認）** |

AppleはiPhone Safariからサイトをホーム画面へ追加し、Webアプリとして開けることを案内しています。[iPhoneでWebサイトをアプリにする](https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios)（確認日：2026-08-22）。この案内だけでは、本アプリのoffline cache、敵JSON更新、保存の永続性まで保証されないため、実機テストを別に行います。

## ブラウザ制約と設計への影響

### CORS

ブラウザの`fetch()`は同一originが基本で、別originのレスポンスをJavaScriptから読むには配信元のCORS許可が必要です。[MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)（確認日：2026-08-22）

そのため、アプリからDokkanStats等へ直接`fetch()`する方式は推奨しません。

- 相手がCORSを許可していなければ技術的に読めません。
- CORSを許可していても、自動取得や再配布の規約上の許可にはなりません。
- `no-cors`ではレスポンスが不透明になり、JSON内容を読めません。
- CORS回避だけを目的にproxyを置くことは、規約やアクセス制限の回避になり得ます。

アプリが読むのは、自分の配信場所に置いた**利用許可・自動validation済みのcandidateまたはstable JSON**だけにします。取得元へのアクセスは、書面許可後にActionsまたは許可されたサーバー側処理から行います。

### 書面許可で解決する範囲

DokkanStats等から得る書面許可は、そのサイトへの自動アクセスと、そのサイトが許可できるcontentの利用・再配布に関するものです。ゲーム画像、文章、商標、character name等について、Bandai Namco、Akatsuki、Toei Animation等の第三者が持つ権利まで、データ提供サイトが代わりに許可できるとは限りません。

本アプリでは計算に必要な数値・ID・条件に限定し、画像、記事、解説文、site design、source codeを複製しません。それでも第三者の規約・権利が関係する項目が判明した場合は、DokkanStatsの許可だけで解決したと扱わず、該当項目を公開しないか、必要な追加確認を行います。この文書は法的助言ではなく、安全側に止めるための設計方針です。

### localStorageとorigin

HTTP(S)の`localStorage`はprotocol・host・portで分かれます。`file://`の扱いは未定義ですが、少なくとも`file://`、`http://localhost`、GitHub Pagesの間で同じ保存領域になると期待できません。したがって、OneDrive版で保存したキャラクターはPages版へ自動では移りません。

公開方法を切り替える前に、次が必要です。

- PATを含めない保存データのエクスポート
- Pages側でのインポート
- schemaVersion付き移行
- 元データを消さない互換テスト
- iPhone、Android、PCそれぞれでの保存・復元確認

現行`localStorage`形式はこの調査では変更しません。詳細は[localStorageの現行形式](local-storage-schema.md)を参照してください。

### Service WorkerとPWA

Service WorkerはHTTPSまたは開発用`localhost`のsecure contextで利用でき、アプリ資産やJSONをcacheしてオフライン利用できます。[Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)（確認日：2026-08-22）

実測どおり、OneDriveの`file://`直開きではService Workerを登録できません。そのため、OneDrive直開き単体をService WorkerでPWA化したり、自動更新付きoffline版にしたりすることはできません。PWAはGitHub Pages等のHTTPS originで提供します。

一方、次の注意があります。

- 新Service Workerは、古いページが開いたままだと待機状態になることがあります。
- cacheがあるため、「公開済みなのに一部ファイルだけ旧版」という不整合を防ぐ版管理が必要です。
- Background Syncは主要ブラウザすべてで利用できるBaseline機能ではありません。[Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)（確認日：2026-08-22）

したがって、バックグラウンド任せにしません。Cでは「更新確認」を押した時、B/Aではアプリ起動時または定めた間隔で小さなchannel manifestを確認します。PWAはその上にoffline cacheとホーム画面アイコンを追加します。

## 技術候補の比較

| 技術 | 使う目的 | 利点 | 注意点 | 推奨 |
| --- | --- | --- | --- | --- |
| 版付き分離JSON | コードと敵データを別々に更新・確認 | 差分、件数、digest、rollbackが明確 | `file://`相対fetch対策が必要 | **採用** |
| GitHub Pages | PC・Android・iPhoneへの配信 | HTTPS、同一URL、静的配信、現行運用を維持 | 秘密は置けない。公開内容は誰でも読める | **普段使いの推奨候補。移行未承認** |
| GitHub Actions | 許可後の候補生成、検証、candidate配信 | 常時サーバー不要、履歴とログが残る | schedule遅延、secret、権限、誤実行対策が必要 | **条件付き採用** |
| GitHub REST API | workflow起動やPR操作 | GitHub内で完結 | 書込には認証が必要。ブラウザPAT保存は危険 | アプリから直接使わない |
| Service Worker/PWA | インストール、offline、cache | モバイルとPCでアプリ風に使える | HTTPS必須、cache更新設計が必要 | JSON分離後に採用候補 |
| Cloudflare Workers | API鍵の秘匿、CORS、許可済みAPIの薄い中継 | secretをクライアントへ出さない、定期実行可能 | 新しいアカウントと運用。CORSや規約回避には使わない | 必要条件が出た時だけ |
| 小規模バックエンド | DB、管理画面、認証、長時間処理 | 最も柔軟 | 料金、障害対応、更新、backup、認証の保守が増える | 現時点では不採用 |
| Vite＋TypeScript | モジュール化、build、型検査 | Pages用build、JSON import、段階的分割が容易 | build工程とActionsが増える | 段階導入 |

### GitHub Actions

GitHub Actionsを使う場合は、外部取得と公開を同じjobで直結させません。

- `permissions: contents: read`を基本にする。
- 取得先の秘密は、ブラウザやリポジトリではなくActions secretへ置く。
- `GITHUB_TOKEN`を使える処理ではPATを作らない。
- 書込が必要なjobだけ、対象を限定して権限を上げる。
- 候補はartifact、専用branch、または本番`stable.json`と分離した`candidate.json`へ出し、`main`や現行stable pointerを直接更新しない。
- candidate channelにも再配布許可とvalidationを必須にする。SHA-256等のdigestは、**信頼済みmanifestが指定したbytesと一致するかという破損検知**に使う。digestだけでは発行者本人かは証明できないため、改ざん対策が必要な場合は、HTTPS上の信頼済みrelease、保護された公開手順、または公開鍵signatureでmanifest自体の真正性を確認する。
- 初期のCでは、所有者が計算ツール内の2操作でcandidateを自分の端末へ適用する。GitHubのPR確認・mergeを日常操作にはしない。
- 開発中に構造や判定基準が変わる時だけ、Codexが差分をレビューし、所有者の明示承認後に公開設定を変える。

GitHubはActions secretの暗号化、最小権限、可能ならPATより`GITHUB_TOKEN`やGitHub Appを使うことを案内しています。[GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets)、[GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)、[API資格情報の安全な管理](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure)（確認日：2026-08-22）

将来scheduleを使う場合も、正確な時刻を保証しない設計にします。GitHub公式文書では、高負荷時にscheduleが遅延またはdropされる可能性があり、公開リポジトリは60日活動がないとscheduled workflowが無効化されます。[Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)（確認日：2026-08-22）

### GitHub APIをアプリから直接呼ばない理由

現行アプリはGitHub PATを`localStorage`へ保存する旧機能を持っていますが、新しい更新方式では再利用しません。

- 静的サイトのJavaScriptへ秘密を埋め込むと、利用者が読めます。
- GitHubのworkflow dispatch APIはActions書込権限を持つtokenを要求します。[REST API endpoints for workflows](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)（確認日：2026-08-22）
- 利用者がデータを読むだけなら、公開済みJSONへの通常のHTTPS GETで足ります。

所有者がアプリ画面から行うCの「適用」がその端末だけでよい場合は、GitHubへの書込も認証も不要です。現在のbrowser sessionだけなら、candidateを一時保存し、検証後に端末の`activeVersion`を切り替えられます。ただし、再起動後も保持する方法、特に`file://`版の永続化は未解決であり、後述の実機検証が必要です。

もしCの2操作で**全端末向けのrelease pointerを昇格**させる必要が生じた場合は、長期PATをブラウザへ保存せず、次を比較します。

1. passkey、OAuth等で所有者を確認する小規模な管理APIから、限定された昇格だけを実行する。
2. 短命tokenと最小権限のGitHub Appを管理API側で使う。
3. 開発時だけCodexが差分を確認し、所有者の依頼を受けてreleaseを作る。これは日常更新ではなく保守作業に限定する。

個人用アプリでは、まず認証不要の「その端末だけCで適用」が最も単純です。複数端末へ同じ承認結果を同期したいという具体的要件が出た時だけ、認証backendまたは将来の管理UIを追加します。GitHub管理画面やCLIはroutineの最終案にしません。

[GitHub Appsの公式説明](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps)では、権限を細かく設定でき、短命tokenを使えるとされています（確認日：2026-08-22）。ただし、上記3案は設計候補であり、認証backendの導入はまだ決定していません。

| 全端末向け昇格の方法 | 日常の所有者操作 | 秘密 | 費用・保守 | 今の判定 |
| --- | --- | --- | --- | --- |
| (a) candidateを各端末でローカル適用 | 計算ツール内Cの2操作を端末ごとに行う | 不要 | 最小。承認状態は端末間同期されず、`file://`永続化も未解決 | **まずPages上の非本番prototypeで試す候補** |
| (b) 認証backend/管理UIで全体昇格 | 計算ツール内Cの2操作。2回目が管理APIへ限定命令を送る | backend側だけ。browserに長期PATを置かない | アカウント、認証、障害対応が増える | 複数端末同期が必要な時だけ |
| (c) Codexが開発時に差分review・release | 所有者が保守作業を依頼・確認 | 作業環境内だけ | 日常の自動更新にはならない | schema変更や例外修正用 |

### Cloudflare Workers

Cloudflare Workersは、秘密を暗号化されたbindingとして持てます。[Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)（確認日：2026-08-22）。Free planは現在100,000 requests/dayですが、CPU 10 ms、外部subrequest 50回などの制限があります。Paid planは最低月5 USDです。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)（確認日：2026-08-22）

この規模なら、承認済みJSONの配布だけにWorkerは不要です。次のいずれかが正式な許可条件になった場合だけ採用候補にします。

- 取得元の正式API keyをブラウザへ出せない。
- 取得元が特定のserver-side accessだけを許可する。
- Webhook受信や短命token発行が必要になる。
- GitHub Actionsの短時間batchでは扱えない処理が必要になる。

Workerを使っても、無許可取得が許可されるわけではありません。任意URLをproxyする機能、Bot対策回避、隠しAPI利用は実装しません。

### Viteは必要か

判定は、**最終構成には推奨するが、更新方式の最初の必須作業ではない**です。

Viteは開発serverとproduction buildを提供し、GitHub Pagesのproject URLでは`base`を`/dokkan-calc/`のように設定できます。[Vite static deploy](https://vite.dev/guide/static-deploy.html)（確認日：2026-08-22）。これにより、次を管理しやすくなります。

- 小さなES moduleとTypeScript
- Pages用の相対パス
- version付きJSONとmanifest
- Pages用buildと、将来のPCオフラインbundle
- build時検証

ただし、Viteの`VITE_`変数はclient bundleへ公開されるため秘密を入れられません。[Vite env variables](https://vite.dev/guide/env-and-mode)（確認日：2026-08-22）。Viteはbackendやsecret storeの代わりではありません。

推奨順序は、まず素のJavaScriptでmanifestとJSON読込境界をテストし、次にその境界と新規moduleからVite＋TypeScriptへ移すことです。巨大JavaScript全体を一度に変換しません。

## 推奨する将来構成

```text
許可台帳
  └─ approved になった取得元だけ有効化
       └─ source adapter（低頻度・許可範囲内）
            └─ quarantine/raw snapshot（本番とは分離）
                 └─ normalize
                      └─ schema・件数・ID・意味差分検証
                           └─ candidate JSON + review report
                                └─ candidate/stable channel（互いに分離）
                                     └─ GitHub Pages等の許可済み配信場所
                                          ├─ GitHub Pages / PWA版の計算ツール
                                          │    ├─ C: 更新確認→端末へ適用（2操作）
                                          │    ├─ B: 検出済み版を端末へ適用（1操作）
                                          │    └─ A: 条件完成後に自動適用（0操作）
                                          └─ PCのfile://版
                                               └─ HTTPS JSON＋埋め込みfallback、同じA/B/C操作
```

現在は許可済み取得元がないため、`source adapter`はすべて無効です。設計とvalidationだけ作れても、取得処理は書面許可が記録されるまで動かしません。

### 許可台帳

取得元ごとに、次を機械可読な台帳へ記録します。

- `status`: pending / approved / denied / expired
- 許可元の公開可能な名称。個人名や個人メールは公開台帳に入れない
- 書面許可の受領日と、原文へ直接linkしないprivate evidence ID
- 許可されたURL・API・項目
- 頻度、同時接続数、rate limit
- raw dataの保存可否
- 派生JSONの公開・再配布可否
- attribution文言
- 有効期限、取消条件、再確認日

公開リポジトリには、上記のうち機械判定に必要なsanitize済みstatus、許可範囲、頻度、帰属、有効期限だけを置きます。返信メール原文、担当者の個人情報、非公開条件、添付ファイル、credentialは、公開repository外の所有者専用OneDrive folder等、共有linkを発行していないprivate保管先へ置きます。原文をcommit、artifact、Pagesへ含めません。

workflowは`status: approved`で、かつ現在日時が有効期間内の場合だけ外部通信できるようにします。公開台帳が欠けた場合やprivate原文との照合が必要になった場合は、安全側で停止します。

### 公開ファイル

例として、次のようにします。

```text
data/
├─ channels/
│  ├─ candidate.json
│  └─ stable.json
└─ releases/
   ├─ 2026-08-22.1/
   │  ├─ enemies.json
   │  └─ report.json
   └─ 2026-09-01.1/
      ├─ enemies.json
      └─ report.json
```

`candidate.json`は、利用許可と自動validationを通ったが、初期Cで所有者がまだ端末適用していない最新版を指します。`stable.json`は、運用実績とより厳しい昇格基準を満たし、将来のB/Aが参照できる版を指します。どちらも小さなmanifestで、次だけを持たせます。

- `schemaVersion`
- `dataVersion`
- `generatedAt`
- `sourceSnapshotId`
- `recordCounts`
- `sha256`（信頼済みmanifestを前提とする破損検知用）
- `downloadUrl`
- `minimumAppVersion`
- attributionとライセンス識別子

版付きファイルは公開後に内容を変えません。修正は新しいversionとして追加します。

### アプリ側の更新

1. Cでは、所有者が「更新確認」を押した時だけ`candidate.json`を確認する。出典・版・件数・重要差分を見て「適用」を押す。
2. Cが安定した後のBでは、アプリが起動時に確認済みの新版を表示し、所有者が「更新」を1回押す。
3. 書面許可、安定API、十分な自動gateが揃った将来のAでは、起動時または定めた間隔で自動検出・検証し、0操作で適用する。
4. どの方式でも、新JSONを一時領域へdownloadする。
5. 信頼済みmanifestとのdigest一致、schema、必須件数、代表IDを検証する。
6. 一時領域のまま、代表的な読込・検索・計算を行うstaging smoke testを実行する。この時点では利用中の版を変えない。
7. 事前検証とstaging smoke testがすべて成功した場合だけ、直前版を保持して`activeVersion`を原子的に切り替える。
8. 切替直後にhealth checkを行い、失敗したら直前の`activeVersion`へ自動rollbackする。失敗理由を表示し、壊れた版を次回起動時にも選ばない。
9. 少なくとも直前版と内蔵baselineを残す。

約5 MBの敵データ本体は、現行の設定・キャラクター保存用`localStorage`へ混ぜません。Pages/PWAではCache StorageまたはIndexedDBを候補にし、既存の保存schemaとは独立させます。`file://`版はこの保存方式を保証できないため、毎回HTTPS版を読むか、同梱fallbackを使います。

ただし、`file://`版で約5 MBのcandidate、所有者が承認した`activeVersion`、直前版を再起動後も安全に保持する方法は未解決です。現在のChromeで`localStorage`が動いたことだけを根拠にせず、容量、永続性、Android/iPhoneのWebView、OneDrive同期の挙動を実機で確認します。この確認が終わるまで、OneDrive直開き版のC/Bを「完成」とは扱わず、現行の埋め込みbaselineを残します。

## 検証と失敗時の安全策

次の1～10は、端末のactive versionを切り替える前、または全体向けstable channelへ昇格する前に通す共通の事前検証です。初期Cでは11の操作後にactiveを切り替え、12の切替後health checkを行います。12が失敗した場合は直前版へ自動rollbackします。

1. 許可台帳が有効である。
2. HTTP status、Content-Type、取得件数が正常である。
3. raw snapshotのdigestと取得時刻が記録されている。
4. JSON Schemaを通る。
5. event/stage/enemy/phase IDに重複や欠落がない。
6. 敵件数、ステージ件数、必須項目が急減していない。
7. ATK、DEF、属性、超／極、条件、会心、AOEの異常差分がない。
8. 代表敵の回帰テストが成功する。
9. 現行版との差分reportを所有者が計算ツール内で読める。
10. active切替前のstaging smoke testが成功する。
11. 初期のCでは、所有者がアプリ内の「適用」を押す。将来B/Aへ進む場合は、事前に合意した自動判定基準をすべて満たす。
12. active切替直後のhealth checkが成功する。失敗時は直前版へ自動rollbackし、その版を隔離する。

事前検証またはstaging smoke testで失敗した場合は候補を隔離したまま終了し、stable channel、端末の現在版、公開アプリ本体を変更しません。切替後health checkで失敗した場合は直前版へ自動rollbackします。candidate channelをPages上で配る場合も、現行アプリが自動でactiveにしない独立URLにします。

## 現実的な導入順序

1. DokkanStatsへ問い合わせ草案を所有者が確認し、所有者自身が送る。
2. 返答までは現行本番データと停止中workflowを維持する。
3. 許可台帳、version manifest、candidate/reportの形式だけを作る。外部通信は実装しない。
4. 現行JSONを入力にして、Pages上の同一origin JSON読込、candidate channel、fallbackを非本番で試す。
5. `file://`版、Pages版、Android、iPhoneで起動・保存・更新失敗・rollbackをテストする。
6. C「アプリ内で更新確認→適用」の2操作を導入する。GitHub画面やCLIは使わせない。
7. Pages用のPWAを追加し、offline cacheをテストする。
8. 必要になった時点でVite＋TypeScriptを新規moduleから導入する。
9. 書面許可を得た取得元だけsource adapterを作る。
10. 数回の更新でCと自動validationの安定性を確認後、Bの1操作へ進む。
11. 書面許可、安定API、失敗時の自動停止、rollback、運用実績が揃ったら、取得・検証・端末適用を含むAの0操作へ進めるか再評価する。
12. Cの承認結果を複数端末へ同期する必要が生じた場合だけ、ブラウザPATなしの認証backendまたは管理UIを設計する。

手順5でPC・Android・iPhoneの実機確認が完了し、`file://`版の5 MBデータと承認状態の永続化方針が決まるまでは、Pages＋OneDrive併用への移行を承認済みとは扱いません。どれかの端末で保存・復元・rollbackが成立しない場合は、現行OneDrive版と埋め込みデータを維持して設計を見直します。

## 再評価条件

次の事実が判明した場合は、この推奨も見直します。

- DokkanStats等が正式API、export、ライセンスを提供した。
- 書面許可が、公開再配布を許可しない内容だった。
- 取得元がserverless利用、固定IP、特定User-Agent等を要求した。
- GitHub PagesのCORS、容量、費用、規約が変わった。
- iPhoneまたはAndroidでPWA・storageの互換性問題が見つかった。
- JSONがPagesの実用範囲を大きく超えた。
- 複数利用者の認証や非公開データが必要になった。

以前の方針を守ること自体を目的にせず、合法性、正確性、復旧しやすさ、所有者の操作の少なさを基準に再評価します。

## 公式資料一覧

すべて2026-08-22に確認しました。

- [DokkanStats Terms of Use](https://dokkanstats.com/en/terms-of-use/)
- [DokkanStats Contact](https://dokkanstats.com/en/contact/)
- [DokkanStats Updates](https://dokkanstats.com/en/updates/)
- [DokkanStats robots.txt](https://dokkanstats.com/robots.txt)
- [MDN: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [MDN: CORS request not HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN: Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Actions events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets)
- [GitHub GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps)
- [GitHub API credentials security](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure)
- [GitHub REST workflow endpoints](https://docs.github.com/en/rest/actions/workflows)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Vite static deployment](https://vite.dev/guide/static-deploy.html)
- [Vite environment variables](https://vite.dev/guide/env-and-mode)
- [Microsoft OneDrive Files On-Demand](https://support.microsoft.com/en-us/onedrive/save-disk-space-with-onedrive-files-on-demand-for-windows)
- [Microsoft OneDrive on Android and iOS](https://support.microsoft.com/en-us/onedrive/use-onedrive-on-android-and-ios-devices)
- [Microsoft OneDrive preview file types](https://support.microsoft.com/en-us/onedrive/file-types-supported-for-previewing-files-in-onedrive-sharepoint-and-teams)
- [Apple: iPhoneでWebサイトをアプリにする](https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios)
