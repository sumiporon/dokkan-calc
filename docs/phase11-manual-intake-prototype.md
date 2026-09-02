# Phase 11 Android優先・保存file取込prototype

2026-09-01 JST。owner承認を受けた**非本番の操作・安全性試作**。Phase 12でも最終仕様でもない。正式計算画面、production敵data、main、Pages、OneDrive、workflowには接続していない。

> 2026-09-02更新: この最初の自作fixture専用prototypeを基盤に、保存済みDokkanInfo parserを接続した。現行は`manual-dokkaninfo`、解析後HTML本文4MB上限、48件のPhase 11 testに更新済みである。最新の実装範囲とAndroid確認手順は[DokkanInfo保存ページ手動取り込みprototype 完了報告](phase11-dokkaninfo-manual-prototype.md)を参照する。以下の2MB・30件・実source未対応等の記述は、接続前のbaseline記録として残す。

## 実装範囲

`HTML / MHTML選択 → 端末内parse → source adapter → canonical v2 → runtime → schema/意味検査 → Phase 10差分検査 → preview → 明示保存 → reload復元 / rollback`をstandalone HTMLで実装した。

- UI source: `prototypes/phase11-manual-intake/`
- `npm run build:phase11`のlocal artifact: `generated/phase11/preview.html`
- `npm run build:phase11:fixed`の固定preview artifact: `phase11-preview/index.html`
- decoder / adapter / 検査 / 暫定保存: `src/prototype/phase11-*.mjs`
- test: `npm run test:phase11`

`generated/phase11`はGit管理外。実機確認用の同一内容だけを`phase11-preview`へ固定し、production deployment対象から分離する。約5.29MBの単一HTMLへ、hash確認済み正式runtimeを**比較専用**で同梱する。Vite/React/backendは導入せず、esbuildはこの試作の再現可能な単一file生成だけに使う。

owner実機確認用の固定tag URLは `https://raw.githack.com/sumiporon/dokkan-calc/phase11-manual-intake-prototype-2026-09-01/phase11-preview/index.html`。これは一時的なbranch/tag previewで、production Pagesの配信経路ではない。固定artifactにも架空fixtureと既存公開済み正式baselineだけを含め、実source由来の新dataを含めない。

## Androidで試す操作

実siteはまだ取り込めない。自作の架空sampleだけで次を確認する。

1. `preview.html`をAndroid端末へ渡してChromeで開く。
2. 「架空sampleで試す」→「完全なMHTMLを保存」。
3. 「fileを選択」で今保存した`sample-complete.mhtml`を選ぶ。
4. 通常ATK、必殺2件、HP条件、全体攻撃の最初/追加、行動ruleを確認する。
5. 「この端末の試作に保存」を押す。
6. 再読込して1stageが復元されるか確認する。
7. 「ATK変更版」も適用し、「1つ前へ戻す」で600,000へ戻るか確認する。
8. 「個人追加をすべて削除」を押し、0stageになった後も正式4,245敵の比較表示が残ることを確認する。

初回はartifact受渡しを含めるため操作が多い。毎回の架空1page取込はsample保存、file選択、検査、明示保存の最低4主要操作。実sourceではownerがsourceを開く/保存する操作と、不足page分が別途必要になる。

「不足する本編」だけを選ぶと保存せず、入力内で観察した架空の補足linkを表示する。「本編」と「補足」を両方選び直すと完成する。tool自身はlinkを開かずfetchもしない。Android file pickerの選択順が変わっても結果hashは同じになる。

## 暫定保存

保存先は固定名`dokkan-phase11-private-PROTOTYPE-v1`のIndexedDBだけ。production/localStorage、Pages user data、legacy data、PAT、cache、service workerへ触れない。

- current / previousを1 transactionで入替え、失敗時は旧currentを維持。
- 複数tabの古いpreviewはdigest compare-and-swapで停止。
- 読込時にnormalized source、canonical、runtime、全hashを再生成して検査。
- current破損時はpreviousを表示できる。両方破損なら自動初期化・上書きしない。
- 「個人追加をすべて削除」でactive個人dataを空にし、正式dataだけへ戻す。削除直前は誤操作時の1-step rollbackに残す。
- raw HTML、script、form、image body、Cookie、credentialは保存しない。allowlist項目とsource/hashだけ保持。

これは**最終Android保存方式の採用ではない**。同じ端末/Chrome/同じ開き方に依存し、browser data削除で失う。PCと自動共有しない。`file://` / Android `content://`のoriginと永続性は端末差があり、今回のChromium file testだけでは保証できない。backup/export、private hosting、Pages統合を決める前に実Androidで確認し、ownerへtradeoffを戻す。

## 安全境界

- 対応sourceは`phase11-self-authored-reference`だけ。実France/Stats/Info/DB HTMLは`SOURCE_UNSUPPORTED`で停止。
- gateは`automaticFetchAllowed:false`、`realSourceAllowed:false`、`productionApplyAllowed:false`固定。
- CSPは`default-src 'none'`、`connect-src 'none'`。入力内script/form/object/iframe/imageを実行・取得しない。
- URLだけ、textだけ、PDF/JSON/未知HTMLは取込指示としない。
- 各file 8MB、合計16MB、10file、HTML root 2MB、MIME 128parts、DOM 30,000 nodes/depth64、保存20stageの試験上限。
- 欠損、unknown field/対象、件数違い、parent/ID衝突、MIME曖昧、古い/未来revision、invalid rangeは推測で補完しない。
- HP/ATK/DEF/属性/通常/複数必殺/usage/対象別AOE/AIをcanonicalに保持。runtimeから省かれるHP/DEF/AIも別検査し、消失を見逃さない。
- 正式4,245敵runtimeは読み取り専用で全件維持し、試作namespaceだけ合成比較。本番manifest/data/workflowは書かない。

Phase 10のschema/hash/reference/semantic/ID/diff/属性/必殺・AOE消失/attack count検査を再利用した。自動取得＋公開向け`sourcePreflight()`は弱めず別のまま。将来正当な自動取得許可が得られても、取得部だけ交換してcanonical以降を再利用できる。

## 検証と停止地点

専用data testは20件、Chromium/WebKit browser testは10件。360/390px、desktop、standalone `file://`、MHTML/HTML、複数file、不足停止、詳細diff、明示保存、reload、rollback、全個人data削除、atomic failure、stale preview、破損回復、旧localStorage/PAT非参照、外部request 0、no horizontal overflowを確認する。

これはAndroid OSのChrome、共有menu、download picker、`content://`永続性の実機合格ではない。Chromium mobile viewportをAndroid実機と称しない。ownerが実Androidで架空flowを確認するまで、production統合、実source parser、final storage、PWA/share target、backup/sync、公開previewは決めない。France/DokkanStatsはpermission pendingのまま。source通信・再問い合わせは0。Phase 12へ進まない。
