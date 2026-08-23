# 第8段階 OneDrive known-good backup運用設計

作成日: 2026-08-24（JST）

## 役割

将来の普段使いはPages、OneDriveはPages障害または通信不能時だけ開くknown-good/offline backupとする。通常起動のたびにPagesとOneDriveを選ばせず、Pages helpにbackupの場所とfile名を載せる。

Phase 8では現在使っているOneDrive HTMLを変更しない。`release-candidate/phase8/device-preview.html`は架空dataによる単一file互換確認であり、現行backupの後継へ昇格していない。

## 将来残す版

正式移行が別途承認された場合、OneDriveには次の2 fileを残す。

- `dokkan-calc-known-good.html`: ownerが端末確認まで終えた最新known-good
- `dokkan-calc-known-good-previous.html`: その直前のknown-good

file内にapp、計算core、承認済み敵runtime、version/digestを同梱し、offline起動時に外部dataを取得しない。候補版や自動取得直後の版を直接このfileへ反映しない。

## 更新してよい条件

次を全て満たしたreleaseだけをbackup候補にする。

1. 正式に利用・公開できる取得元とdataである。
2. runtime schema、件数差分、representative record、digestが合格している。
3. 通常`npm test`が失敗0・skip 0である。
4. Pages候補でPC、Android、iPhoneのowner実機確認が終わっている。
5. update／rollback drillに成功している。
6. recoverable tagがあり、ownerがknown-good昇格を承認している。

Pagesのmanifest更新、candidate生成、scheduled jobだけではOneDrive backupを更新しない。CIを将来使う場合も、download可能な候補artifactの作成までとし、known-good昇格にはreview gateを置く。

## broken releaseを反映しない方法

- candidateとknown-goodのfile名・保管場所を分ける。
- candidateはOneDriveのknown-good fileへ上書きしない。
- 新known-goodを置く前に旧最新を`previous`へ移し、両方のdigestを記録する。
- 新fileを各端末で開ける確認が終わるまで旧最新を削除しない。
- Pages障害の原因がdataかappか不明な間はbackupを更新しない。

## ownerが問題時にすること

1. Pagesのhelpに書かれた`dokkan-calc-known-good.html`をOneDriveから開く。
2. それも開けない場合だけ`dokkan-calc-known-good-previous.html`を開く。
3. 通常計算を続け、失敗したPagesの更新を繰り返さない。
4. Codexへ「Pages」「known-good」「previous」のどれが開けたかだけ伝える。

terminal、JSON編集、GitHub管理、source site訪問は求めない。backupの更新はroutine敵data更新ではなく、承認済みapp release時だけの保守作業とする。
