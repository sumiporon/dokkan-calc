# 第6段階 Pages移行時の保存データ移行設計

作成日: 2026-08-23（JST）

状態: 設計・test案のみ。localStorage形式、UI、Pages、OneDriveは未変更。実装前にownerの承認が必要。

## 目的と制約

将来Pagesを普段使いとして採用する場合、`file://`/OneDriveとPagesは別originなので、既存localStorageをPagesが直接読むことはできない。ownerは最初の1回だけの移行操作を許容しているが、毎回の移行は不可である。

Phase 6では移行UIを実装せず、移す内容、除外内容、安全条件、候補方式だけを定める。

## 移行対象

| 現行key/内容 | 方針 |
| --- | --- |
| `dokkan_calc_data_v22.durabilityLines` | 全件保持 |
| `savedCharacters`と全scenario | 全件保持 |
| `savedEnemies` | preset/manualを判別できないため全snapshot保持 |
| `currentScenarios` | 未保存作業も含め全件保持 |
| `theme` | 保持 |
| scenario内`loadedEnemy` | IDだけに置換せず互換snapshot保持 |
| `loaded_enemy_*` index参照 | 元値を保持し、将来ID解決結果を別に持つ |
| `dokkan_crit_overrides` | 名前keyのまま互換領域へ全件保持 |
| 旧2階層・3階層形式 | 既存reader互換を維持 |
| `dokkan_github_pat` | **移行・export・送信しない** |

PAT以外の未知keyも自動送信しない。許可listにあるcalculator dataだけを対象にする。

## 推奨候補: 1回のwindow間transfer

ownerが承認した場合の第一候補は、現在のlocal/OneDrive版で1回だけ`保存データをPagesへ移行`を実行し、開いたPages windowへ`postMessage`でデータを渡す方式である。

```text
local/OneDrive版で1回実行
  ↓ random nonce付きでPages migration画面を開く
Pagesが準備完了を返す
  ↓ opener関係＋nonceを照合
許可listの保存データだけをmemory内転送
  ↓ Pages側schema・size・checksum検査
Pages localStorageへbackup付きでatomic保存
  ↓ 成功確認後に移行完了を表示
```

URLやbackendへ保存データを載せないため、URL長制限やserver保管を避けられる。PATは元からpayloadへ含めない。失敗時は元originの保存内容を変更しない。

ただし、`file://`のoriginは`null`になり得て、iOS/Android/OneDrive内browserのwindow opener・`postMessage`挙動が異なる可能性がある。実装前にPC、Android、iPhoneで小さい架空fixtureを使って検証する。成功が安定しない端末では採用しない。

## fallback候補: checksum付きmigration file

window間transferが実機で不安定な場合は、現在版からmigration JSONを1回exportし、Pagesで1回importする方式をfallbackとする。操作stepは増えるため、ownerへ画面と手順を提示して承認を得る。

候補packageは次を持つ。

```text
schemaVersion
exportedAt
sourceApplicationVersion
payload.dokkan_calc_data_v22
payload.dokkan_crit_overrides
legacyUnresolved
payloadDigest
explicitlyExcludedKeys = [dokkan_github_pat]
```

file名、画面、説明文、完了後にfileを削除するかは未決定である。通常更新のたびに使う方式にはしない。

## atomic importとrollback

Pages側へ保存する前に、次を全て確認する。

- migration schema/version
- payload digest
- JSON size上限
- 必須配列・型
- prototype pollutionにつながるkeyがないこと
- PATやcredentialらしいkey/valueがないこと
- 旧2/3階層fixtureが現行互換readerで読めること
- scenario、手動敵、theme、crit override、未保存状態の件数

保存時は既存Pages dataがあれば一時backupを作り、全key書込み成功後だけmigration完了markerを保存する。途中失敗時はbackupへ戻す。元のlocal/OneDrive dataは削除しない。

## test案

1. 現行v22代表fixtureのround trip
2. 旧2階層・3階層の保持
3. 手動敵とpresetの同名collision
4. 同名bossのcrit override
5. `loadedEnemy` snapshotとindex参照
6. 未保存scenarioと空scenario
7. light/dark theme
8. payload改変・digest不一致
9. quota不足・途中write失敗からrollback
10. PAT、token、credentialらしいkey/valueをexportしない検査
11. 二重importのidempotency
12. PC Chrome、Android Chrome、iPhone Safariでの架空data実機試験

## ownerへ実装前に確認すること

- ボタンの場所と文言
- window間1操作方式とfile fallbackのどちらを採用するか
- 移行前確認、成功、失敗画面
- 元データを残す説明
- fallback fileの保存・削除手順
- Pagesを普段使いとして正式採用するか

これらの承認前にlocalStorage key、移行UI、Pages版を実装しない。
