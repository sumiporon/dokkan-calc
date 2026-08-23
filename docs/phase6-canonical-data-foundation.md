# 第6段階 source-neutral敵データ基盤

作成日: 2026-08-23（JST）

状態: offline設計・実装・全件検証完了。本番アプリ、本番敵データ、localStorage、Pages、OneDrive、workflowは未変更。

## 結論

第6段階では、取得元固有の保存材料、情報を失わない正本候補、計算端末へ渡す派生物を次の3層へ分けた。

```text
取得元固有material
  ↓ source adapter（外部通信なし）
canonical v2（監査・更新判定用の正本候補）
  ↓ deterministic projection
runtime v1（計算に必要な軽量派生物）
```

Phase 4の保存済みDokkanInfo HTML候補は取得元として採用したのではなく、5,032体を含む既知のoffline migration fixtureとしてだけ使用した。DokkanStats、DokkanDB、DokkanInfo、将来の正式feedのどれにも専用化していない。

## canonical v2

schemaは`schemas/enemy-data-v2.canonical.schema.json`、TypeScript contractは`src/data-foundation/phase6-types.ts`にある。

canonicalが保持する主な情報は次の通り。

- region、event、stage、encounter、enemyの階層ID
- 取得元snapshotと複数のsource reference
- event/stage/enemy等の取得元IDとURL
- 敵名、5属性、超・極・中立、combat/non-combat role
- HP、ATK、DEF、軽減率、最大攻撃回数
- 全必殺、複数必殺、倍率、表示damage、usage rule、条件、効果、必殺限定会心
- passive effect、critical、skill、AI sequence、AOEの先頭・追加対象別値
- field単位のevidence、confidence、状態
- review済みmanual correctionを将来保持する監査領域

取得元固有の表示用icon pathやraw HTML解析結果はcanonicalへ混ぜず、再現可能なPhase 4候補とsource material referenceに残した。正規化値とraw取得材料を分けることで、取得元変更時にアプリ計算層を作り直す範囲を小さくする。

### IDの意味

現在のoffline adapterは、例えば`jpnja:event:701:stage:7010013:encounter:4:enemy:0`のように、取得元名を含まないregion/event/stage pathを生成する。元の`dokkaninfo-cache:...` IDは`sourceRefs`だけに残る。

これは構造とnamespaceがsource-neutralという意味であり、未確認の異なる取得元同士でIDが自動的に同一になると保証するものではない。将来の正式取得元がゲーム公式stable IDを提供する場合はそれをadapterで対応付ける。異なるID体系しかない場合はalias/reconciliation表をreviewしてから追加する。DokkanStats固有IDをcanonicalの必須形式へ埋め込んではいない。

### unknown、unavailable、zero

全fieldは次の状態を持つ。

| state | 意味 | value |
| --- | --- | --- |
| `known` | 根拠のある既知値 | 0を含む実値 |
| `unknown` | 情報は必要だが未確認・解析不能 | `null` |
| `unavailable` | その取得材料には表示されていない | `null` |
| `not-applicable` | そのrecordには適用されない | `null` |

`known: 0`をunknownへ変換しない。全件fixtureではknown zero 3,011 field、unknown 35,152 field、unavailable 20,340 fieldを区別して保持した。取得材料で種別不明だった75件のAOEも`other`へ補完せずunknownのままにした。

## source adapter contract

adapterは入力形式を判定し、canonical v2とsource material referenceを返す純粋なinterfaceである。Phase 6のadapter descriptorは`networkAccess: forbidden`固定で、filesystemやnetworkへアクセスしない。

本格DokkanStats adapterは未実装である。許可、正式API/feed、ID semantics、欠損状態の意味が確定した後に、同じcontractの別adapterとして追加できる。

## runtime projection

schemaは`schemas/enemy-data-runtime-v1.schema.json`、変換は`src/data-foundation/phase6-runtime.ts`にある。canonicalから毎回同じbyte列を生成でき、runtimeからcanonicalへの逆変換は行わない。

runtimeに残すものは、現在の計算へ必要なevent/stage/enemy IDと表示名、role、属性、超極中立、base ATK、全必殺とusage rule、効果、critical、AOEである。

次は意図して省略する。

- provenance、evidence、confidence、source refs
- raw表示情報、icon path、source text
- 現行計算が読まないHP、DEF、軽減率、最大攻撃回数
- card/thumb等の外部ID
- 数値effectへ正規化されていないskill説明
- 現行計算が自動行動simulationをしないためAI sequence
- manual correctionの監査履歴

これらはcanonicalまたはsource materialに残る。`runtime-omission-report.json`の`requiredCalculationLosses`は0件である。将来AI simulation等を実装する場合は、canonicalを変えずprojectionだけを拡張できる。

## サイズと性能

保存済み全件fixtureでの結果は次の通り。pretty版はdiff・監査用、minified版は将来配信時の参考値である。

| artifact | pretty | minified | gzip相当（minified） |
| --- | ---: | ---: | ---: |
| Phase 4 candidate | 35,532,102 bytes | 未計測 | 未計測 |
| canonical v2 | 87,118,325 bytes | 43,467,702 bytes | 1,103,279 bytes |
| runtime v1 | 16,691,030 bytes | 6,048,874 bytes | 222,503 bytes |

canonicalは端末配信用ではなくCI・監査側の正本候補である。runtime pretty版はcanonicalの19.2%で、配信用minifyでは約6.05MBになる。AI/AOEにも直接evidence referenceを保持するため、canonicalはprovenanceを省略した初期測定より大きい。

このWindows PC上のheadless Chromiumでは、loopback HTTPからpretty runtimeを取得する中央値が約164ms、parseが約48msだった。390×844 viewport・CPU 4倍slowdownの参考測定では取得約565ms、parse約389msだった。これはAndroid/iPhone実機やSafariの測定ではなく、端末memoryも未検証である。

したがって「full runtimeは絶対に不可」とはまだ判断しない。一方、全件objectの展開後memory、更新差分、`file://`互換を考えると、Phase 7では次を実機比較するのが安全である。

1. minified full runtime
2. 小さいevent index＋選択event単位chunk
3. local/OneDrive向けの`<script>` data chunk包装

Chromeの`file://`ページから隣接JSONを`fetch()`する試験は`TypeError: Failed to fetch`になった。現在の単一HTML利用を守るには、外部JSON fetchを必須にしてはいけない。PagesではHTTP fetchを使えるが、採用は未決定である。

## release manifest

`schemas/enemy-data-release-manifest-v1.schema.json`に次を保持する。

- manifest/schema/dataset versionと生成時刻
- candidate/stable channelとrelease state
- source snapshots、取得時刻、policy status
- source input、canonical、runtime、validation、omission reportのpath/digest/bytes/schema version
- event/stage/enemy等の件数
- compatible app versionと、本番アプリがまだ読まないこと
- previous known-goodのversion、artifact digest、manifest digest
- safety gate結果
- permission ledger digestとoffline変換・公開可否

現在の`previousKnownGood`は現行production JSONのdigestを記録している。canonical known-goodはまだ存在しないため、初回候補は自動昇格しない。

## candidate / stable / known-good

| state | 内部の意味 | ownerの通常操作 |
| --- | --- | --- |
| candidate | 新規生成し、検証中 | 通常は意識しない |
| stable | schema、安全、permissionを全て通過 | 通常は意識しない |
| known-good | stableを実端末health check後にrollback基準へ昇格 | 通常は意識しない |
| quarantined | hard fail等で隔離 | 理由だけを表示 |

`candidate → stable`にはsafetyが`passed`、hard fail/review-requiredが0、公開permissionがallowedであることが必要である。`stable → known-good`には端末health check成功が必要である。通常の1操作更新では内部で自動実行し、異常時だけ停止理由を表示する想定で、これらをユーザーへ毎回選ばせない。

## update safety gate

現在の閾値は次の通り。実データ更新pilot後に誤検知率を測り、根拠があれば変更する。

### hard fail

- canonical/runtime schema不正、digest不一致、生成失敗
- ID衝突、source snapshotまたはrecord provenance欠損
- combat enemyのATKがunknown/null/負数
- ATK=0が`max(5体, combatの1%)`を超える
- 属性または超極中立欠損が`max(5体, combatの2%)`を超える
- event/stage/enemy件数がknown-goodから20%以上減る
- 共通enemyのATK変更が30%を超える
- 既知ATKがunknownへ`max(5体, 共通enemyの1%)`を超えて後退する
- source snapshot取得時刻がknown-goodより後退する

### review-required

- canonical known-goodがなく比較できない初回候補
- event/stage/enemy件数が5%以上20%未満減る
- 共通enemyのATK変更が10%超30%以下

### informational

- 正常なevent/stage/enemy追加
- 全検査合格

新eventの大量追加だけでは危険扱いしない。現在の5,032体候補はhard fail 0、初回baseline不足によるreview-required 1で停止した。

## permission gate

`schemas/enemy-data-permission-ledger-v1.schema.json`は取得元ごとに、automatic fetch、manual fetch、offline transform、raw再配布、派生再配布、派生公開を別々に`allowed`/`denied`/`unknown`で記録する。

現在は次の状態である。

- 保存済みDokkanInfo cache: offline transformのみallowed。自動取得denied、公開unknown
- DokkanStats: written permission pending。各操作unknown
- DokkanInfo/DokkanDB live: 自動取得denied。その他未確認項目はunknown

unknownは許可とみなさないfail-closed方式である。技術的に取得可能でもpermissionがなければ実行しない。

## 旧形式との関係

Phase 4の旧形式変換で検出した37,690 lossは、canonicalの欠陥ではなく旧JSONに複数必殺、usage rule、AI、AOE、neutral、evidence等の欄がないことが原因である。

第6段階では旧形式へfieldを足し続けていない。旧形式は現行比較、preview、一時互換、migration verificationだけに限定する。canonical v2を将来正本候補とし、runtimeを一方向生成する。

## Vite再評価

第6段階のTypeScript、schema、generator、testは`tsc`とNodeだけで成立した。したがって、現時点でViteはこのデータ基盤に必要ではない。将来ブラウザmodule、asset hash、dev server、chunk配信を実装する段階で、単純script方式と比較して具体的な利益が上回る場合だけ採用を再検討する。

## 実装・検証入口

- `npm run generate:phase6`: 保存済みcacheから全成果をoffline再生成
- `npm run benchmark:phase6`: 既存生成物をPC/Chromiumでoffline測定
- `npm run test:phase6`: 代表fixtureの高速検証
- `npm test`: Phase 4全件再現を含む通常の全検証

生成されるfull canonical/runtimeは`generated/phase6/`に置きGit追跡しない。digest、件数、代表fixture、検証・性能報告だけを追跡する。
