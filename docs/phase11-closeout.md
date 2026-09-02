# Phase 11 closeout — Android manual intake

確定日: 2026-09-03 JST

## 状態

Phase 11は、**DokkanInfo manual importを今すぐ使えるpersonal fallbackとして保持し、日常利用の本命をevent単位update packとする**方針で一区切りとする。Phase 12、production統合、source自動取得、補助アプリ等の追加実装には進まない。

## 1. 確定したfallback

既存prototypeの次の流れを削除・作り直しせず残す。

1. ownerがAndroidでDokkanInfoのeventページ1件と、必要なstageページを保存する。
2. Phase 11 calculatorで保存HTML/MHTMLをまとめて選ぶ。
3. 端末内でparseし、canonical v2とruntimeへ変換する。
4. permission-purpose、schema、required field、ID、意味、loss、digest、production composite diffを検査する。
5. ownerが差分を確認した場合だけ、Phase 11専用の暫定IndexedDBへpersonal importする。
6. 失敗時は適用せず、既存known-goodを維持またはrollbackする。

これは、ownerが特定の新stageをすぐ必要とする場合のfallbackである。sourceへの自動通信は行わず、production datasetへ公開・mergeしない。AOEのattack kind等を保存ページから証明できない場合は、値を推測せず適用を停止する。

## 2. fallbackの実操作量

現prototypeは最大10 files、1 candidateにつきevent pageが必要なため、1 batchはevent 1件 + stage最大9件である。以下は、ページ探索、戻る操作、download待ち、scroll、OS dialog、file整理を含まない下限値で、実際の操作はさらに増える。

| 新stage数 | 開く／保存するページ | file選択tap | import batch | 下限操作数 |
| ---: | ---: | ---: | ---: | ---: |
| 5 | event 1 + stage 5 = 6 | 6 | 1 | **29** |
| 10 | event 1 + stage 10 = 11 | 12（eventを再選択） | 2 | **53** |
| 20 | event 1 + stage 20 = 21 | 23（eventを再選択） | 3 | **97** |

`event 1 + stage N`であり、stage数に比例してownerのページ操作が増える。保存やfile pickerを数tap短縮してもこの根本負担は残るため、日常利用の最終UXには採用しない。

## 3. 最終目標

本命は、**1 eventの全追加・変更stageを1つにまとめた検証可能なupdate pack**である。

`新event → event packをAndroidへ渡す → validation → diff → owner確認 → atomic import → 完了`

stage数が5でも20でも、owner側の操作を1～数回程度に保つ。pack受取後のcanonical、runtime、validation、diff、known-good、rollbackは既存基盤を再利用する。

ただしupdate packは未実装である。2026-09-03時点では、完全なevent exportを合法かつ継続的に作れるsource、許可済みproducer、配布条件が確定していない。作成者側のstage N取得を隠してowner側だけを「数操作」に見せる方式は完成扱いにしない。

## 4. source・permissionの状態

- DokkanStats: ownerが2026-08-24に問い合わせ済み。返信待ちで、アクセス・再送・follow-upは行わない。
- DBZ Dokkan Battle France: ownerが2026-08-31にmanual local parsing等を含め問い合わせ済み。返信待ち。ownerのrecent保存物ではHP／ATK／DEF／Super damageが0で、現状primaryにはできない。
- DokkanInfo: manual fallbackの技術実績はあるが、個人抽出・保持やpack作成・公開の必要条件がすべて承認済みとは扱わない。
- その他source: event単位の完全性、recent性、利用許可を同時に満たすものは未確認。

返信がないことを許可と解釈せず、sourceごと・目的ごとにfail closedで判定する。

## 5. 再開条件と再開地点

### FranceまたはDokkanStatsから返信が来た場合

1. ownerが受信した原文、日付、相手、対象地域、許可された操作を保存する。
2. `manual personal extraction`、派生pack作成、履歴保持、GitHub/Pages配布、自動取得を別々にpermission ledgerへ記録する。
3. 許可された範囲だけで、event単位exportの有無、複数stage、必須field、AOE／AI／usage rule、recent性を少数sampleで確認する。
4. Phase 10 preflightとPhase 11 adapter contractの手前から再開し、canonical以降を作り直さない。

### 新しい合法source／event exportが見つかった場合

1. 利用条件とdata provenanceを先に確認する。
2. owner操作が1 eventで何ページ・何tapになるかを5／10／20 stageで測る。
3. 自作または明示許可sampleによる小さなoffline adapterだけを作る。
4. 既存productionとのcomposite diffまで通し、公開・適用は別承認で止める。

### ownerが特定の新eventをすぐ追加したい場合

既存DokkanInfo fallbackから再開する。ownerがevent 1件と必要stageだけを保存し、Phase 11 prototypeへ読み込む。結果はpersonal IndexedDBだけへ保存し、productionへのmerge、公開、source fetchは行わない。

## 6. 再利用する安全・データ基盤

- local HTML/MHTML decode、MIME／size／source identity／hash検査
- source-neutral adapter contract、sourceRefs、provenance
- canonical v2、決定的runtime projection
- required-field、unknown／unavailable／known-zero、複数Super、usage rule、AI、対象別AOE semantics
- Phase 10 permission-purpose、schema、ID／parent、loss、digest、semantic、composite diff gate
- explicit owner review、atomic apply、known-good、rollback
- production dataとpersonal IndexedDBの分離

これらをupdate packの後段として使い続け、sourceが変わっても使い捨てにしない。

## 7. production境界と検証

Phase 9 productionは通常利用版のまま維持する。

| production基準 | 件数 |
| --- | ---: |
| event分類 | 56 |
| stage / battle | 647 |
| enemies | 4,245 |
| attacks | 8,899 |

- `main`、`origin/main`、production Pages、production enemy data、production workflow、OneDriveは変更しない。
- DokkanInfo fallbackのpersonal dataをproductionへ公開・mergeしない。
- France／DokkanStatsへの自動アクセス、source fetch、crawler、background traversal、hidden API利用は0。
- closeout直前の全体検証は`npm test` **270成功、failed 0、skipped 0、cancelled 0**。Phase 11はdata 35 + Chromium／WebKit 13 = 48件である。
- closeout自体は文書と恒久方針だけを更新し、prototype／production codeは変更しない。

## 8. 停止地点

次の再開条件が発生するまでmanual intake UXの小さな省tap改善を続けず、Phase 11をcloseする。Phase 12には進まず、owner確認待ちで停止する。
