# Phase 11：typed one-tap draft（Phase B）

2026-09-12。基準commitは `c38e6d949fb1bf4616386490a538a63a9d108052`。Phase Aの自作2stage prototypeを、**自作3stage mixed event**の保存順・型分離・最終集計だけに拡張する。実サイト、XPI、production、canonical schema、calculation-core、既存full receiver、inspection review、applyには接続しない。

## 実証対象

event `990011` の訪問計画は次の固定順である。

1. `99001102` — full
2. `99001101` — partial（capability候補0件）
3. `99001103` — full

各stageは、対応するvalidator → payload/material保存 → read-back検証 → typed draft保存 → session保存/read-back → writer/ticket/session revision整合を完了した後だけ、同一位置の `次のステージへ` を有効化する。partialの候補数はこのgateに含めない。

sessionは最初の未保存stageのindexを `currentIndex` として保持する。予定より後のstageを先にbeginすること、保存後にplan順を入れ替えること、stage ID/typed draftの参照を差し替えることを停止する。plan内の重複ID/URLも開始時に拒否する。

## 最終集計

最終画面はUIの固定値を使わない。`finalSummary()` が以下を毎回行う。

1. sessionのplan/currentIndex/statusを再検証する。
2. plan順に各typed draftをpayload参照からread-backし、classification、stage ID、capture、digest、ticket bindingをsession entryと照合する。
3. read-backしたdraftから `full` / `partial` / `total` を数える。

このfixtureの正常結果は `full: 2`、`partial: 1`、`total: 3`。不足、順序破損、stage ID参照不一致、集計対象の不整合は成功扱いにしない。

full payloadとpartial materialは別digest・別reference kindのままで、型変換やフィールドの継承はない。stage 3のfullはstage 1と同じ既存full validator/package経路を独立して通る。

## 検証

```powershell
node scripts/build-phase11-typed-one-tap.mjs
node --test tests/unit/phase11-typed-one-tap.test.mjs
node --test tests/browser/phase11-typed-one-tap.test.mjs
node scripts/preview-phase11-typed-one-tap.mjs
```

- unitはPhase Aの12件を維持し、Phase Bの正常mixed flow、順序外stage、重複plan、plan入替、stage ID参照差替え、最終draft欠落を追加する。
- browserは実際の固定ボタンで `full → partial → full → 最終確認` を実行し、IndexedDBのtyped draftsから `2 / 1 / 3` を確認する。外部request、fetch/XHR、localStorage、既存DBは許可しない。
- previewの最終画面は「安全に保持できたところまで」で停止し、inspection reviewやapplyを提供しない。

## 対象外

unusable、ここまでの取得結果を確認、inspection review、apply/full subset apply、restart、writer takeover、revision UI、live DokkanInfo、XPI、production、canonical、calculation-core、既存full receiverはPhase Bの対象外である。
