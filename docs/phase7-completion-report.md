# 第7段階 完了報告

> 保存データ移行に関する部分は当時の設計・検証履歴です。ownerは後にOneDrive／local旧版→Pages移行を撤回しました。現在のRCはPagesを新規状態で開始し、OneDriveと保存データを移行・同期しません。この文書の移行手順は実装・実機確認に使わないでください。最新仕様は[Phase 8 結果条件表示・保存移行撤去 修正報告](phase8-result-summary-no-migration-report.md)を参照してください。

作成日: 2026-08-24（JST）

## 完了判定

第7段階の終了条件を満たした。productionと完全分離したprototypeで、full runtime、event index＋chunk、HTTP/Pages相当、file-compatible、OneDrive、hybrid、1操作更新、rollback、保存データ1回移行、PAT除外、0操作化条件を実装・比較した。

本番アプリ、本番敵JSON、本番localStorage形式、公開Pages、現在のOneDrive版、workflow、`main`は変更していない。外部data siteへ新しいaccessを行わず、DokkanStatsへ問い合わせを送信していない。Phase 8には進んでいない。

## 初心者向けの結果

full runtimeは、全88 event・5,032 enemyを最初にまとめて読む方式である。1 fileなので単純で、PCでは十分速かった。

event chunkは、最初にevent一覧だけを読み、選んだeventのdataを後から読む方式である。file数は増えるが、最初の転送とmemoryを減らせた。

- PC: full約0.36秒、chunk約0.17秒。約0.19秒差で、体感差は小さめ。
- スマホ相当参考条件: full約1.67秒、chunk約1.10秒。約0.58秒差で、分かる可能性がある。
- 初期memory参考: full約8.7MB、chunk約2.6MB。
- event切替: fullはほぼ即時。chunkもloopbackではmobile参考最大約0.10秒だが、実回線待ちは実機確認が必要。

PCだけならfullでも問題ない。しかしPC/mobile共通の普段使いには、Pagesでevent chunkを読む案を推奨する。更新の内部検査は1 fileのfullの方が速く単純なので、閲覧と更新で同じ形式へ無理に統一しない。

## 作成したもの

- production分離HTML/JS prototype
- 6.05MB minified full JSONとgenerated JS
- 約47KB event index
- 88 event JSON chunkとfile-compatible generated JS chunk
- version・digest・compatibility・known-good・permissionを持つmanifest schema
- digest付きbrowser cache prototype
- 1操作update engineと画面
- atomic active pointer、known-good、rollback
- 保存データexport/import engine
- `file://`から別originへ1回で渡す架空browser flow
- full規模generator、benchmark、通常test
- Android/iPhone hands-on計画

full生成物は大きいため`generated/phase7/`へ置きGit追跡しない。compact summary、全sample performance report、schema、generator、testを追跡した。

## fullとchunkの詳細

| 項目 | full | event chunk |
| --- | --- | --- |
| 初期file | manifest＋full | manifest＋index＋先頭event |
| data size | 6,048,874B | index 47,030B、chunk中央値26,589B |
| 全件合計 | 6,048,874B | 6,095,593B |
| 経路の単純さ | 高い | 90 file、missing/digest管理が必要 |
| PC初期準備 | 356.5ms | 165.4ms |
| mobile参考初期準備 | 1,674.0ms | 1,098.8ms |
| PC初期JS heap | 約8.7MB | 約2.6MB |
| event切替 | 全てmemory内 | 未cache eventを追加取得 |
| 全件更新検査 | 1 fileで速い | 88 fileで遅い |

全chunk合計はfullより約47KB大きい。chunkの利点は圧縮魔法ではなく、普段不要なeventを読まないことにある。詳細な全sampleは[実測比較](phase7-runtime-delivery-comparison.md)と`artifacts/phase7/performance-report.json`に残した。

## cache、再読み込み、version

Pages相当prototypeはdigestをcache keyにする。warm cacheではdata本体を再転送せず、manifest約1.5KBだけを確認した。fullでもparseとobject展開は必要なので、cache後に必ず瞬時になるわけではない。

新digestは旧cacheと別keyになり、manifest、runtime、chunk indexのversion不一致は適用しない。古いcacheを新versionとして読む経路をtestで拒否した。

## Pages、OneDrive、hybrid

Pages候補は、1つのURL、PC/mobile共通、HTTP data、cache、version更新、rollback、将来0操作に最も向く。HTTPSとpublic read-only dataなので利用者PATも不要にできる。正式公開はしていない。

OneDriveは、ownerが現にPCとmobileで使えている強い実績があり、known-good/offline backupとして価値がある。generated JSによりWindows `file://`でfull/chunkとも動いた。ただし、新chunkは約90 fileで、Android/iPhoneのOneDriveが隣接pathを同じように扱うか未確認である。offlineが必須ではないため、普段使いのためにこの複雑さを採用しない。

推奨hybridは次の利用像である。

- 普段: Pagesの1 URLを開く。
- 更新: 初期は「敵データを更新」を1回押す。
- 保存データ: Pages採用時に最初の1回だけ移す。
- 障害/offline: 現在のOneDrive known-good HTMLを開く。
- 普段のdata更新にOneDrive操作を要求しない。

逆の「OneDrive UI＋Pages data」は技術的に可能性があるが、online依存のままapplication更新がmanualで、Pages primaryより構成が分かれるため推奨しない。

## PC、Android、iPhone

Windows ChromiumのPC幅・390px幅・CPU 4倍slowdownは自動検査した。本物のAndroid/iPhoneはCodexから操作できない。Playwright WebKit browser binaryも、この環境に追加downloadせず確認した範囲では利用できなかった。

Phase 8仕様承認後、本番と別のtest URLを用意し、ownerには各スマホで「開く、eventを選ぶ、計算、閉じて再度開く、updateを1回押す、架空移行を1回押す」だけを確認してもらう。logやterminal操作は求めない。具体手順は[実機確認計画](phase7-real-device-checklist.md)にある。

## 1操作更新

将来UXの「敵データを更新」1回から、次を順に行うprototypeが成立した。

1. manifest取得・構造確認
2. dataset version比較
3. candidate取得
4. bytesとSHA-256 digest確認
5. runtime構造/schema成果物確認
6. 件数急減safety gate
7. compatible app確認
8. 全検査後だけatomic commit
9. health check
10. known-good更新

正常時は追加のowner判断なしに適用した。PC画面全体でfull約0.46秒、mobile参考約2.64秒だった。88 chunkを全検査する場合はPC約0.88秒、mobile参考約3.47秒だった。実回線値ではない。

## 異常更新とrollback

次を自動testで拒否した。

- manifest欠損・破損・gate不合格
- full/chunk size・digest不一致
- chunk欠損・破損
- runtime不正・ID重複
- 大量削除
- 古いdataset
- app非互換
- manifest/index version不一致
- 通信途中失敗

active pointer切替前・切替後の失敗とhealth check失敗も再現した。いずれもactive、known-good、release一覧を更新前へ戻し、壊れたcandidateを普段の計算に見せなかった。

## 0操作更新

技術的には進められるが、本番ではONにしていない。最低条件を次に固定した。

- 書面permission
- pilot 60日以上
- 30 candidate連続成功
- safety gate誤停止率1%以下
- PC/Android/iPhoneを含むrollback drill 3回以上
- 100回以上でupdate成功率99%以上
- 必要詳細が7日以内に揃う率95%以上
- known-good 3世代以上
- app compatibility gate
- owner承認

よってPhase 8でただちに0操作へは進まず、まず1操作で実績を取る。

## 保存データ1回移行

engineではallowlist export、digest、v22/crit override検査、重複backup＋置換、二重importの冪等性、途中write rollbackを確認した。browserではWindows `file://`からPages相当別originへ、架空dataを1 buttonで渡せた。

本番localStorageは読まず、prototype専用keyだけを書いた。元dataを削除しない。Android/iPhoneでwindow/openerが不安定なら、checksum付きfile export/importをfallbackにするが、操作が増えるため最初から採用しない。

## PAT

future Pages/runtime updateはpublic read-only取得で成立し、userのGitHub PATをbrowserへ保存する必要はない。公開側secretが必要ならCI secretだけに置く。

既存PAT codeと値は変更・削除していない。migration/export payloadは`dokkan_github_pat`と未知keyを除外し、PAT非移行をpure testとbrowser testの両方で確認した。

## Vite

Viteなしでfull/chunk生成、digest cache busting、manifest、HTTP/file loading、browser testまで成立した。今導入してもユーザー価値より移行量が増えるため、Phase 8の前提にしない。application codeのmodule分割やasset hashに具体的利益が出た時だけ再評価する。

## test

`npm test`を通常経路で実行し、**144件すべて成功**した。

- 既存: 122件すべて成功
- Phase 7追加: 22件
- 合計: 144 passed、0 failed

Phase 7追加分は、full規模無損失chunk化、schema、manifest、digest、file-compatible script、missing/corrupted chunk、update成功/拒否、中断/rollback、cache/version不一致、0操作条件、保存data export/import/PAT除外、PC/mobile幅HTTP、Windows `file://`、別origin移行を含む。

## Gitとproduction分離

- branch: `codex/phase7-runtime-delivery-prototype-20260824`
- start tag: `phase7-start-2026-08-24`（Phase 6完了commit `6994127`）
- policy commit: `c14955c`
- implementation checkpoint: `f88e72a`
- completion commit/tag: この報告書を含む最終commitと`phase7-complete-2026-08-24`

変更対象はPhase 7専用prototype/schema/script/test/artifact/docs、`.gitignore`、`package.json`、`README.md`、`AGENTS.md`だけである。`dokkan_calc_final.*`、`index.html`、`scraper/all_enemies.json`、workflow、localStorage production reader/writerに変更はない。

## DokkanStats問い合わせ（owner送信待ち）

- 宛先: `contact@dokkanstats.com`
- 件名: `Request for written permission to use DokkanStats boss data, automate limited access, and publish derived JSON`
- 最終英語本文: [コピー用全文](phase7-dokkanstats-inquiry-copy.md)

本文は宛先・件名とともに上記文書へ全文再掲した。Codexは送信していない。ownerがcopyして送信し、返信全文を安全に保存してからCodexへ渡す。返信は操作別に`allowed`、`denied`、`unknown`へ分け、曖昧なら取得を開始しない。

## Phase 8の推奨

最初にownerが下のユーザー向け仕様を承認する。その後もすぐ本番切替せず、別test URLでAndroid ChromeとiPhone Safariを確認する。合格した場合だけ、Pages candidate、保存data本番移行、1操作update UIを小さく実装し、現在のOneDriveと公開版をrollback可能なまま段階移行する。

DokkanStats返信前でも架空/既存offline dataによるUI移行prototypeは続けられるが、実source adapter、自動取得、派生JSON公開は始めない。

## Phase 8前にownerが決めるアプリ仕様だけ

### 1. 普段どこから開くか

- **A（推奨）: Pagesを普段使い、現在のOneDriveをknown-good/offline backupとして残す。**
- B: Pagesだけへ移り、OneDrive backupを日常案内しない。
- C: OneDriveを普段使いのままにし、Pages移行を見送る。

### 2. dataの読み方

- **A（推奨）: 普段の閲覧はevent chunk、内部update検査は単純なfullも使う。**
- B: 読み込みも更新もfullへ統一し、単純さを最優先する。

利用者の操作は変わらない。Aはスマホの初期転送/memoryを減らし、内部更新では88 requestを避けられる余地を残す。

### 3. eventを最初にどう表示するか

- **A（推奨）: 以前選んだeventがあれば戻し、初回だけevent一覧から選んでもらう。**
- B: 毎回一覧の先頭eventを自動表示する。
- C: 毎回event未選択で始める。

Aなら普段は手間を増やさず、初回に巨大な先頭eventを必ず読むことも避けられる。

### 4. update buttonと表示

- **A（推奨）: 設定/data欄に「敵データを更新」を置く。成功は小さくversion/dateを表示し、失敗時だけ「現在版をそのまま使います」と大きく知らせる。**
- B: main計算画面の上に常時buttonとversionを大きく表示する。
- C: menu内へ隠し、通常画面には表示しない。

### 5. 最初の保存データ移行

- **A（推奨）: 現在版のbuttonを1回押すとPagesが開き、そのまま移行する。実機で失敗する端末だけfile export/importを案内する。**
- B: 最初からfile export/importに統一する。
- C: 自動移行を用意せず、Pagesで保存dataを作り直す。

### 6. offline/backupの見せ方

- **A（推奨）: 普段はPagesだけを案内し、helpに「通信できない/問題時はOneDrive backup」と短く載せる。**
- B: PagesとOneDriveを同格の2つの起動方法として常に表示する。
- C: offline案内を設けない。

この6点の承認まではPhase 8を開始せず、本番経路を変更しない。
