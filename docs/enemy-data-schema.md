# 敵データ形式と検証基準

この文書は、第2段階で固定した現行敵データの形式と検証ルールです。現在のデータを正しいと無条件に断定するものではなく、今後の変更で意図せず情報を失わないための比較基準です。

## 対象ファイル

- 正本候補：`scraper/all_enemies.json`
- 現行アプリ内の複製：`dokkan_calc_final.js`の`DEFAULT_ENEMIES_PRESET`

両者は現在完全一致しています。`npm run test:data`と`npm run audit:data`は、この一致も検査します。本番データを更新する前には、構造検証だけでなく新旧の件数・変更・削除内容を確認してください。

## 現行階層

```text
eventType[]
└─ series[]
   └─ stages[]
      └─ bosses[]
         ├─ attacks[]
         └─ appearEntries[]
```

| 階層 | 必須項目 | 型 |
|---|---|---|
| イベント種別 | `eventType`, `series` | 空でない文字列、配列 |
| シリーズ | `seriesName`, `stages` | 空でない文字列、配列 |
| ステージ | `stageName`, `bosses` | 空でない文字列、配列 |
| 攻撃 | `name`, `value` | 空でない文字列、0以上の整数 |
| 攻撃（任意） | `isCrit` | boolean |
| 登場条件 | `turn`, `cumulativeAtkUp` | 1以上の整数、0以上の数値 |

プリセットのボスには次の25項目がすべて必要です。

```text
name, class, type, attacks,
baseAtk, saMulti, saBuffMod, aoeDamage, hasSaCrit,
turnAtkUpStartTurn, turnAtkUp, turnAtkMax,
hitAtkUp, hitAtkMax,
hpAtkThreshold, hpAtkUp,
appearEntries,
critAtkUp, critDefDown, isCriticalDefault,
critHpThreshold, critHpRate,
critTurnUp, critTurnMax, critFixedRate
```

- `class`は`super`または`extreme`です。
- `type`は`agl`, `teq`, `int`, `str`, `phy`のいずれかです。
- `saBuffMod`は30%なら`0.3`のような倍率表現です。他の多くの条件値は百分率の数値です。
- `appearEntries.cumulativeAtkUp`は元の各ターン増加値ではなく、累積値です。
- 手動登録した敵は動的条件項目を省略できます。プリセット用の厳格な形式と、ユーザーデータ用の互換形式を混同しないでください。

## 整合性検査

監査は以下をエラーとして扱います。

- 必須項目、階層、型、属性enumの破損
- 空のイベント・シリーズ・ステージ・ボス・攻撃
- 通常攻撃値と`baseAtk`の不一致
- 必殺値と`baseAtk × (saMulti + saBuffMod)`の不一致
- 必殺後通常攻撃と`baseAtk × (1 + saBuffMod)`の不一致
- ターン・被弾・HP・会心条件の片側だけが存在する状態
- 会心フラグと会心攻撃の不一致
- 登場条件の順序・累積値の逆転
- 追加された`eventId`・`stageId`・`enemyId`の空値や不正型
- `eventId`または`stageId`の重複
- 基準から5%以上の主要件数減少
- 既存の特殊条件件数の減少

## 現在の基準値

| 項目 | 件数 |
|---|---:|
| イベント種別 | 56 |
| シリーズ | 73 |
| ステージ | 647 |
| ボス | 4,245 |
| 攻撃 | 8,899 |
| 必殺後強化 | 409 |
| ターン経過強化 | 112 |
| 被弾回数強化 | 52 |
| HP条件強化 | 13 |
| 登場条件を持つボス／条件 | 38／39 |
| 会心対象ボス／会心攻撃 | 52／52 |
| 範囲攻撃 | 0 |

この基準を変更する場合は、単にテスト値を書き換えず、なぜ件数が変わったかを差分で説明してください。

## 既知の警告

現行データを変えずに基準化するため、次の問題は警告として可視化し、テスト全体は成功させています。

- `eventId`, `stageId`, `enemyId`がない
- 敵DEFがない
- 同一シリーズ内の同名ステージ：43群、余剰52件
- 内容も完全一致するステージ：5群、余剰5件
- 同一ステージ内の同名ボス：370群、余剰927件
- 内容も完全一致するボス：90群、余剰360件
- 名前4階層だけでは一意に識別できない敵がある
- 将来`enemyId`が追加された際、同一ステージ内で重複していれば、正当な複数体か`phase/order`欠落かを警告する
- `aoeDamage`が全件0。ただし保存済みHTMLにはエリアダメージ表記がある
- 会心対象52体の`critAtkUp`と`critDefDown`が全件0
- `saMulti > 10`が27体、`saMulti > 100`が22体
- 増加量で最大値を割り切れないターン条件が12体、被弾条件が5体

重複や外れ値には正当な複数フェーズ・複数体・特殊攻撃が含まれます。警告だけを理由に自動削除・補正してはいけません。

## IDと将来形式

保存済みキャッシュの`index.json`には一意なイベントID 88件、ステージID 801件があります。HTMLにはカードIDと敵DEFもあります。将来の生データ形式では、少なくとも次を保存する方針が適切です。

```text
sourceEventId + sourceStageId + phase/order + enemyCardId
```

ただし、この第2段階では現行JSONへの注入や上書きは行いません。名前から作った疑似IDを、取得元の正式IDとして扱ってはいけません。

## 実行方法

```text
npm run test:data
npm run audit:data
```

監査コマンドはエラーがあれば終了コード1、既知の警告だけなら終了コード0になります。
