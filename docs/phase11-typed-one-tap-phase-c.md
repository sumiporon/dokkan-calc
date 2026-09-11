# Phase 11：typed one-tap draft（Phase C）

2026-09-12。基準commitは `693bcd37c11aa4604f95ded3b7c5b3be7a9069dd`。Phase Cは自作fixtureだけで、unusable stageで停止し、それ以前のfull/partialをread-only確認できることを実証する。live DokkanInfo、XPI、production、canonical、calculation-core、既存full receiver、applyには接続しない。

## fixtureと状態

訪問計画は4stageで、実際に到達するのはstage 3までである。

1. stage 1: full
2. stage 2: partial（capability候補0件）
3. stage 3: unusable
4. stage 4: unvisited

stage 3は、full用に試みた入力が既存full validationへ不合格になり、同時にpartial用に試みた入力もpartial validationへ不合格になった場合だけ `recordUnusable()` で停止できる。partialとして安全に保存可能な入力がある場合は `UNUSABLE_NOT_PROVEN` で停止記録を拒否する。

unusableに保存するのは `phase11-unusable-stage-failure-1` のfailure metadataだけである。含むのはstage ID、plan index、ticket binding、full/partialそれぞれの失敗code、短いowner向け説明、failure digestだけで、HTML、script、画像、token、cookie、full/partial payload/materialは含まない。

この自作prototypeでは検証用に `PACKAGE_VERSION` などの内部codeを補助表示してよい。ただし将来の実Android owner UIでは、内部codeを主表示にせず、日本語の短い停止理由を主表示にする。この方針は実source/XPI接続を承認するものではない。

## 停止とread-only境界

failure metadataの保存・read-backとsessionのread-backが完了すると、sessionは `stopped-unusable` になる。`currentIndex` はunusable stageの位置に残り、next navigationと後続stageのbeginを拒否する。skip、retry、revision、apply、full subset applyは実装しない。

`ここまでの取得結果を確認` は `readOnlySummary()` を呼ぶだけで、session・typed draft・failure metadataを書き換えない。plan順にdraft/failureをread-backして次を算出する。

- full: 保存済みfull typed draft
- partial: 保存済みpartial typed draft
- unusable: 検証済みfailure metadata
- unvisited: 上記のいずれもないplan stage

このfixtureの集計は `full 1 / partial 1 / unusable 1 / unvisited 1`。集計対象の不足、failure stage ID、plan digest、draft/failure参照が一致しない場合は成功表示しない。

## 検証

```powershell
node scripts/build-phase11-typed-one-tap.mjs
node --test tests/unit/phase11-typed-one-tap.test.mjs
node --test tests/browser/phase11-typed-one-tap.test.mjs
node scripts/preview-phase11-typed-one-tap.mjs
```

unitではPhase A/Bの14件を維持し、Phase Cの双方validation失敗、partial救済拒否、next停止、stage 4未取得、payload未生成、failure metadata改ざん、plan改ざん、集計不整合、read-only不変性、failure metadata保存失敗時の既存draft保持を検証する。browserでは固定操作でstage 3まで進み、read-only画面で4分類を確認する。外部request、fetch/XHR、localStorage、既存DBは使わない。

今回のprototype DBは `dokkan-phase11-typed-one-tap-PROTOTYPE-v2`。Phase A/Bのv1 DBを移行・変更しない。

## 対象外

unusable skip、retry、revision UI、inspection数値計算、restart、writer takeover、XPI、live source、production、canonical、calculation-core、既存full receiverはPhase Cの対象外である。
