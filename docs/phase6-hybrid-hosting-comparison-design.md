# 第6段階 OneDrive / Pages / hybrid実機比較設計

> 保存データ移行に関する部分は当時の設計・検証履歴です。ownerは後にOneDrive／local旧版→Pages移行を撤回しました。現在のRCはPagesを新規状態で開始し、OneDriveと保存データを移行・同期しません。この文書の移行手順は実装・実機確認に使わないでください。最新仕様は[Phase 8 結果条件表示・保存移行撤去 修正報告](phase8-result-summary-no-migration-report.md)を参照してください。

作成日: 2026-08-23（JST）

状態: 将来比較の設計のみ。Pages-primaryまたはhybridの採用決定、公開変更、OneDrive変更は未実施。

## 比較する3案

| 案 | 普段使い | 更新 | known-good/rollback |
| --- | --- | --- | --- |
| OneDrive/local | 現在と同じ単一HTML | 新HTMLを各端末で開く必要がある | 旧HTMLを保存 |
| Pages | URL | manifestとruntimeをHTTP更新しやすい | 過去releaseへ戻す |
| hybrid | Pagesを普段使い候補、OneDriveをknown-good backup | Pagesで更新 | Pages rollback＋既知のOneDrive HTML |

hybridは比較候補として承認済みだが採用済みではない。

## 現時点の技術評価

| 項目 | OneDrive/local | Pages | hybrid |
| --- | --- | --- | --- |
| PC/Android/iPhoneで現在使える | 実績あり | URL利用は一般に容易だが実機未比較 | 両経路の理解が必要 |
| 外部JSON更新 | `file:// fetch`失敗を確認。script同梱等が必要 | HTTP fetch可能 | Pages側は可能、backup側は同梱が必要 |
| offline | local file自体は強い | service worker等なしでは弱い | backupで復旧可能だが自動切替ではない |
| 保存データ | 現在originに残る | 別originへ初回移行が必要 | Pages側へ初回移行、localをbackup保持 |
| rollback | 旧HTMLを開く | known-good manifest/runtimeへ戻す設計が可能 | 両方使える |
| 自動更新 | 難しい | 最も実現しやすい | 通常はPages、非常時local |
| ownerの手間 | 現状維持 | URL切替と初回保存移行 | 初回説明が少し増える |

Phase 6の測定ではPages相当のHTTP fetchは成功し、`file://`から隣接JSON fetchは失敗した。local routeを残す場合、dataを`<script>`で読み込めるchunkへ包む、または単一HTMLへ埋め込む必要がある。productionへの方式変更はしていない。

## 実機比較用prototypeの境界

ownerの承認後、productionと別URL/別fileで架空または既知fixtureだけを使う。実データ更新、localStorage本番移行、通常Pages差替えは行わない。

比較する配信形式は次の2つ。

1. minified full runtime（約6.05MB）
2. event index＋選択event単位chunk

local/OneDrive候補では同じ内容をJSON fetchではなくscript data chunkとして読む。PagesではHTTP JSONとscript chunkの両方を測り、Viteを使わない単純生成でも成立するか確認する。

## 端末別hands-on checklist

PC、Android、iPhoneそれぞれで次を同じ順番で記録する。

1. 起動までの操作数と時間
2. event/stage選択までの時間
3. 更新確認・適用の内部処理時間（UIはまだ仮）
4. 通信なしで再起動した場合の可否
5. browser終了・端末再起動後の保存維持
6. 架空保存データの初回移行
7. 壊れたcandidateを拒否しknown-goodを維持できるか
8. known-goodへのrollback
9. 画面をホームへ追加した場合と通常bookmarkの違い
10. ownerが迷った操作と説明が必要だった箇所

測定値は端末、OS、browser version、通信状態、runtime形式と共に保存する。

## 合格基準案

- PC、Android、iPhoneの全てで通常計算が成立する
- 通常更新は`敵データを更新`の1操作以内で、正常時は追加判断を要求しない
- 異常candidateは適用せず、既存known-goodで計算を続けられる
- 保存データ移行は初回だけで、以後不要
- PATを移行・配信しない
- ownerがterminal、GitHub管理、JSON編集、site巡回をしない
- rollback手順が初心者向けに短く再現できる
- local/OneDriveを廃止する前に、Pages/hybridが同等以上とownerが判断する

## offlineの扱い

Pagesをoffline対応するにはservice worker/cache等が候補になるが、Phase 6では導入しない。自動更新とcacheは、壊れた版を長期間保持する危険やiOS差異があるため、known-good manifestとrollbackを含む別の承認済みtaskで設計する。

hybridのOneDrive known-goodは、自動で切り替わる高可用性systemではない。Pagesに問題がある時にownerが既知のlocal HTMLを開けるrecoverable backup候補である。

## Viteと公開方法

現在のデータ基盤はViteなしで生成・検証できる。実機prototypeでも、単純なHTML/JS/data chunkで要件を満たせるならViteを採用する理由は弱い。asset hash、module分割、dev server等が実際に保守を簡単にすると確認できた場合だけ比較対象にする。

## 実装前にownerへ確認すること

- 3案を試す順番と使用端末
- 仮更新画面・メッセージ
- offlineをどの程度必須にするか
- 初回保存移行の画面
- Pagesを正式な普段使いへ採用する判断
- OneDrive backupをどのように残すか

Phase 6ではこれらを決定・実装しない。
