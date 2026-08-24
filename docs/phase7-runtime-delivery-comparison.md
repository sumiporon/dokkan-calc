# 第7段階 runtime配信・更新・利用方式の実測比較

> 保存データ移行に関する部分は当時の設計・検証履歴です。ownerは後にOneDrive／local旧版→Pages移行を撤回しました。現在のRCはPagesを新規状態で開始し、OneDriveと保存データを移行・同期しません。この文書の移行手順は実装・実機確認に使わないでください。最新仕様は[Phase 8 結果条件表示・保存移行撤去 修正報告](phase8-result-summary-no-migration-report.md)を参照してください。

作成日: 2026-08-24（JST）

状態: productionと分離したoffline prototypeの比較。方式の本番採用、Pages公開、OneDrive変更は未実施。

## 結論

将来の普段使いには、**Pagesを開き、閲覧時はevent index＋選択event chunkを使う案**が最も有利だった。Windows PCではfullも十分速いが、chunkはスマホ相当参考条件で初期転送と初期memoryを明確に減らした。

ただし、更新candidateの検証はfull 1ファイルの方が単純で速い。したがって「保存形式を全てchunkへ統一」するのではなく、将来の内部設計では次を分けてよい。

- 閲覧: index＋必要event chunk
- release検証: source-neutral canonicalから同時生成したfull runtimeまたは全chunk
- rollback: version付きmanifestとknown-good release

これはユーザーに選ばせる内部技術ではない。Phase 7では両方を検証しただけで、本番形式は未変更である。

普段Pages、問題時だけ現在のOneDrive known-goodを開くhybridを推奨候補とする。offlineは必須ではないため、新runtimeのためにOneDriveへ約90個の隣接data fileを日常配布する案は推奨しない。

## 用語

- **full runtime**: 88 event、5,032 enemyの計算用dataを1つの約6.05MB fileとして最初に読む方式。
- **event chunk**: 約47KBのevent一覧を先に読み、選んだeventのdataだけを後から読む方式。
- **file-compatible**: `file://`が隣接JSONを`fetch()`できない問題を避けるため、同じdataをgenerated JavaScriptとして`<script>`で読む包装。
- **Pages相当**: 公開Pagesは変えず、loopback HTTP serverでHTTPS配信と同じHTTP取得部分を再現したもの。実回線性能ではない。

## 比較したprototype

`prototypes/phase7-runtime-delivery/`に専用entryを置いた。現行計算coreを読み取り利用するが、本番HTML、JS、敵JSON、localStorage、workflowは変更しない。

同じruntimeから決定的に次を生成する。

- `delivery-manifest.json` / file-compatible `.data.js`
- `full/runtime.min.json` / `.data.js`
- `chunked/event-index.json` / `.data.js`
- 88個のevent JSON / `.data.js`

manifestはversion、app compatibility、path、bytes、SHA-256 digest、schema version、known-good、validation状態、permission状態を持つ。全pathは配信root基準に統一した。

## artifact規模

| 項目 | 実測 |
| --- | ---: |
| full JSON | 6,048,874 bytes |
| full generated JS | 6,048,918 bytes |
| event index JSON | 47,030 bytes |
| 全chunk＋index | 6,095,593 bytes |
| event数 | 88 |
| event chunk中央値 | 26,589 bytes |
| p95 | 208,418 bytes |
| 最大 | 871,769 bytes |

全chunk合計はfullより46,719 bytes大きい。chunkは全件転送量を減らす方式ではなく、**普段必要な部分だけ展開する方式**である。

full経路はmanifest＋fullの2 fileで単純である。chunk経路はmanifest＋index＋88 chunkで90 fileになり、generator、manifest、missing-file testが必須になる。今回の自動生成と検査で管理可能だったが、複雑さはゼロではない。

## 測定条件

- 3回測定の中央値
- Windows PC上のheadless Chromium
- loopback HTTPまたはWindows `file://`
- desktop: 1440×1000、CPU throttleなし
- mobile参考: 390×844、CPU 4倍slowdown
- 外部network request 0
- 初期状態でも現在の主要操作に合わせ、一覧後に先頭eventを1件表示した

mobile参考値はAndroid/iPhone実機、device emulation、Safari実機、実回線の測定ではない。

## Pages相当HTTPの主な結果

| 指標（中央値） | PC full | PC chunk | mobile参考 full | mobile参考 chunk |
| --- | ---: | ---: | ---: | ---: |
| runtime＋先頭敵準備完了 | 356.5ms | 165.4ms | 1,674.0ms | 1,098.8ms |
| 初期転送 | 6,050,423B | 608,285B | 6,050,423B | 608,285B |
| parse/script処理 | 179.3ms | 31.2ms | 624.8ms | 31.6ms |
| 初期JS heap | 8,688,432B | 2,550,664B | 8,706,860B | 2,545,208B |
| 最大eventへの切替 | 1.3ms | 33.0ms | 10.9ms | 99.3ms |
| 中央size eventへの切替 | 1.0ms | 12.5ms | 4.7ms | 24.5ms |

PCでは約0.19秒差で、通常は大きな体感差になりにくい。mobile参考では約0.58秒差で、初回起動時に分かる可能性がある。chunkは初期転送を約90%、初期heapを約71%減らした。

fullは一度準備できればevent切替がほぼ即時である。chunkもloopback測定では最大eventでPC 33ms、mobile参考99msで、実回線latencyを除けば短い。実回線では未cache eventごとにrequest latencyが加わるため、Android/iPhoneで確認する。

## cacheと再読み込み

Pages相当fetch prototypeはartifact digestをcache keyにし、manifestだけ毎回再確認する。

| warm cache初期準備 | PC | mobile参考 |
| --- | ---: | ---: |
| full | 257.5ms | 1,733.5ms |
| chunk | 128.8ms | 1,137.4ms |
| 実network転送 | 1,549B | 1,549B |

cacheにより6MB/約0.6MBのdata再転送はなくなった。一方、JSONをcacheから読みobjectへ展開する費用は残る。mobile参考ではcoldより速くならないsampleもあり、「cache済みなら必ず瞬時」とは扱わない。

digestが変わると別cache keyになるため、旧versionのcacheを新versionとして誤読しない。manifestとchunk indexのversion不一致も更新前に拒否するtestを追加した。

## file-compatible結果

Windows `file://`でfull、chunkとも起動、event/stage/enemy選択、主要計算に成功した。

| 初期準備 | PC file full | PC file chunk | mobile参考 file full | mobile参考 file chunk |
| --- | ---: | ---: | ---: | ---: |
| 中央値 | 426.2ms | 152.6ms | 1,039.2ms | 742.6ms |
| 初期JS heap | 11,067,948B | 2,853,368B | 11,066,756B | 2,853,036B |

generated JSはJSON fetch問題を解決するが、次の制約が残る。

- full generated JSはJSONより少しmemoryが多かった。
- chunkは約90 fileを隣接配置する必要がある。
- Windows `file://`成功は、Android/iPhoneのOneDrive app内導線で同じpath解決ができる証明ではない。
- file版application code自体の更新は引き続きfile配布が必要で、Pagesほど自動化しやすくない。

よってfile-compatible生成はbackup技術として成立するが、offline優先度Bの普段使いを複雑化してまで新chunk一式をOneDriveへ同期する根拠にはしない。

## 更新処理

1操作prototypeはmanifest、version、candidate、digest、runtime構造、件数急減、app compatibilityを検査し、全検査後だけactive pointerを切り替える。適用後health checkに失敗した場合もsnapshotへ戻す。

| 更新適用（3回中央値） | PC engine / 画面全体 | mobile参考 engine / 画面全体 |
| --- | ---: | ---: |
| full | 190.3ms / 464ms | 1,043.5ms / 2,644ms |
| 全88 chunk | 625.4ms / 884ms | 1,915.7ms / 3,469ms |

chunk更新は88 fileを全部取得・digest検査してから適用するため、fullより遅い。それでもloopback mobile参考で約3.5秒以内だったが、実回線ではrequest数の影響が大きい。

閲覧をchunkにしても、内部update candidateをfullで1回検査する設計は可能である。Phase 8で本番設計を行う場合、取得元permissionとrelease署名/配信条件を踏まえて内部方式を決める。

## 異常系とrollback

自動testで次を拒否またはrollbackした。

- manifest欠損・壊れたJSON・validation gate不合格
- full/chunkのsize・digest不一致
- chunk欠損・壊れたchunk
- runtime構造不正・ID重複
- 20%を超えるevent/stage/enemy急減
- 古いdataset
- app version非互換
- manifestとchunk indexのversion不一致
- 転送途中失敗
- active pointer切替途中失敗
- 適用後health check失敗

失敗時はactive、known-good、release一覧を更新前snapshotへ戻す。0操作更新はまだ有効化していない。

## OneDrive、Pages、hybridの公平な比較

| 案 | 普段開くもの | 長所 | 短所 |
| --- | --- | --- | --- |
| OneDrive継続 | 現在のHTML | 現にPC/mobileで使用実績、offline/backupに強い、保存データ維持 | application/data更新が自動化しにくい。新外部JSON不可。複数script chunkはmobile実機未確認 |
| Pagesのみ | 1つのURL | PC/mobile共通、manifest/data/cache/rollback/将来0操作に最適、PAT不要 | 初回保存データ移行が必要。offlineは別設計。実機未確認 |
| Pages primary＋OneDrive backup | 普段はPages、問題/offline時だけ既知のOneDrive HTML | 普段の簡単さとrecoverable backupを両立 | 2経路の短い説明とbackup更新方針が必要 |
| OneDrive UI＋Pages data | OneDrive HTML | 現在のorigin/保存データを維持しdata更新可能性 | online依存なのにapplication更新は手動、file security差、構成が分かれ、Pages primaryより利点が小さい |

OneDriveには所有者の実利用実績があり、根拠なく廃止しない。ただし、将来更新をownerのterminal、GitHub管理、site巡回、file copyなしにするにはPages primaryが最も素直である。

推奨hybridの利用像は次の通り。

- 普段: bookmarkまたはホーム画面のPages URLを開く。
- data更新: 最初は「敵データを更新」を1回押す。十分な実績後だけ0操作を別承認する。
- 保存データ: Pages採用時に1回だけ移す。
- 障害/offline: 現在のOneDrive known-good HTMLを開く。自動切替はしない。
- backup更新: 毎data releaseではなく、applicationの安定checkpoint時だけ新known-good HTMLを用意する案をPhase 8以降に検討する。

## 保存データ1回移行

2つを分けて検証した。

1. pure migration engine: allowlist export、digest、v22構造検査、crit override検査、重複backup＋置換、二重importの冪等性、途中write rollback、PAT/未知key除外。
2. browser flow: Windows `file://` sourceからPages相当別originを1回のbuttonで開き、nonce＋opener＋digestを確認して架空dataだけを渡した。

browser flowは成功し、PATは移らなかった。本番localStorageは読んでいない。Android/iPhoneのOneDrive内browserでpopup/openerが維持されるかは未確認である。不安定ならchecksum付きfile export/importをfallbackにするが、操作が増えるため第一候補にはしない。

## PAT不要化

manifest/runtimeはpublic read-only配信物なので、利用者browserにGitHub PATは不要である。将来の生成・公開にsecretが必要ならGitHub Actions/CI secret側だけに置き、browser、download、localStorageへ渡さない。

既存PAT codeと保存値は削除・移行していない。1回移行packageは`dokkan_github_pat`を明示除外する。

## 0操作化の条件

prototypeは次を全て満たすまで0操作化を拒否する。

- 取得・派生公開・自動適用の書面permission
- 60日以上のpilot運用
- 30 candidate連続成功
- safety gate false positive率1%以下
- PC/Android/iPhoneを含むrollback drill 3回以上
- 100回以上の試行でupdate成功率99%以上
- 必要な敵詳細が7日以内に揃う率95%以上
- known-good 3世代以上保持
- app version compatibility gate
- ownerの0操作化承認

sourceの条件や実績が悪ければ、数値を満たしても自動化しない。permissionの曖昧な返答を許可として扱わない。

## Vite再評価

plain HTML/JS、TypeScriptで作った既存data foundation、Node generatorだけで、full/chunk、manifest digest、cache busting、HTTP/file loading、browser testを成立させた。Phase 7でViteが解決しなければならない問題は確認できなかったため、導入を推奨しない。

将来、application code自体のmodule分割、asset hash、development server、production bundleの利益が具体化した時だけ再評価する。

## 再現

```powershell
npm run generate:phase7
npm run benchmark:phase7
npm run test:phase7
```

full生成物は`generated/phase7/`へ置きGit追跡しない。digest、件数、compact summary、performance report、test、docsだけを追跡する。
