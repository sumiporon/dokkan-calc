# Phase 11：typed one-tap draft（Phase A）

2026-09-12。基準HEADは `51fb0a5c4096eefaf74768be07f019a1e9da5e61`。これは自作fixtureのみを使う、Android one-tap flowへの**offline接続実証**である。実サイト、DokkanInfo、XPI、production、既存full receiver、canonical schema、calculation-core、既存full保存形式には接続・変更しない。commit前のowner review待ちである。

## Phase Aで実証すること

架空event `990011` の2stageだけを、同じ固定位置の操作で進める。

1. stage 1は既存full packageを生成し、既存full validatorへ合格する。
2. stage 2はfullへ変換しないpartial materialで、single-hit capability候補が0件でもpartial validatorへ合格する。
3. full/partialとも、保存と読み戻し照合が全て終わるまで「次のステージへ」を有効化しない。

partialの保存可能性と計算可能性は別である。Phase Aのpartial画面は `一部の材料を保存しました` と `現在は計算できません` を表示するだけで、被ダメ等の数値、inspection review、applyは出さない。

## typed stage draft

`phase11-typed-stage-draft-1` は以下の固定構造を使う。`payload`はfull packageまたはpartial materialのいずれか一方であり、classificationとreference kindが異なる組合せを拒否する。

```json
{
  "formatVersion": "phase11-typed-stage-draft-1",
  "classification": "full | partial",
  "stageId": "99001102",
  "capture": {"id":"fictional-capture-full-stage-1","revision":1,"observedAt":"2026-09-01T00:00:00.000Z"},
  "contentDigest": "sha256:...",
  "reference": {"kind":"full-package | partial-material","contentDigest":"sha256:..."},
  "ticket": {"sessionId":"...","unitId":"stage:99001102","writerId":"...","writerGeneration":1,"sessionRevision":1},
  "draftDigest": "sha256:...",
  "payload": "validated full package or validated partial material"
}
```

payloadは専用prototype IndexedDBのpayload recordとして、typed draftはpayloadを含まない参照recordとして保存する。sessionにはpayloadそのものを入れず、classification、stage ID、capture、content/draft digest、fingerprint、ticket bindingだけを保存する。partialをfull packageとして扱う変換・暗黙昇格・旧revision値との合成はない。

## 保存と「次へ」のgate

fullでは既存 `validatePackage`、partialでは `validatePartialMaterial` を使う。full失敗をpartialとして救済する分岐はない。

1. classificationに対応するvalidatorを通す。
2. package/materialを保存する。
3. payloadをread-backし、validatorとdigestを再実行する。
4. typed draft参照を保存し、payloadを再結合してdraft digestも検証する。
5. sessionへtyped entryを保存し、session自身と各draftをread-back検証する。
6. writer ID/generation、ticket revision、session revision、plan URLが依然一致することを確認する。
7. この全てが成功した時だけ、同じ位置の `次のステージへ`（最終stageでは `最終確認`）を有効化する。

capability候補数はこのgateに入れない。partialの候補が0件でも安全な材料保存後に進める。任意の段階で失敗した場合、すでに保存済みのstage/sessionは置換せず、次へも解放しない。

## 範囲外

mixed event完走、unusable、途中inspection review、restart/writer takeover、typed inspection batch、実source adapter、Android拡張/XPI、live stage、production receiver/apply、partial→full更新、rollback UIはPhase Aに含めない。

## 再現

確認環境はNode.js 22.17.0、npm 10.9.2、既存lockfileのPlaywright Chromium。クリーンな依存環境では `npm ci` と `npx playwright install chromium` の後、以下を実行する。

```powershell
node scripts/build-phase11-typed-one-tap.mjs
node --test tests/unit/phase11-typed-one-tap.test.mjs
node --test tests/browser/phase11-typed-one-tap.test.mjs
node scripts/preview-phase11-typed-one-tap.mjs
```

previewでは `開始` → stage 1の `次のステージへ` → stage 2の `最終確認` を押す。外部通信、fetch/XHR、localStorage、既存DBは使わず、`dokkan-phase11-typed-one-tap-PROTOTYPE-v1` だけを開く。

## Phase Aの検証

- 新規unit 12件：正常なfull→partial、fullの偽救済拒否、partial→full偽装拒否、partial validator失敗、payload/draft/sessionの保存・read-back失敗、stale ticket、writer generation変更、session revision競合、digest破損を確認する。途中失敗後は先行full stageだけが有効なまま残る。
- 新規browser 1件：390pxで実際の固定ボタンを使うfull→partial→最終確認、IndexedDB read-back、外部requestなし、360/390px横overflowなしを確認する。
- generated outputは `generated/phase11/typed-one-tap/` のみで、既存previewやAMO/XPIを再生成しない。
