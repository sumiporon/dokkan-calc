# Phase 11：typed one-tap draft（Phase D）

2026-09-12。基準commitは `3fea0adca675385d2b1cafa7f3e4298dd34d37e5`。Phase Dは自作fixtureだけで、ページ再読込／ブラウザ再起動相当のsession復元と、ownerが明示したwriter引継ぎを実証する。live DokkanInfo、XPI、production、apply、canonical、calculation-core、既存full receiverには接続しない。

## 再起動時の復元

ページ起動ごとに新しいtab IDを発行する。保存済みsessionをread-backし、plan digest、session revision、plan順、各typed draft digest、full package、partial material、failure metadata、stage ID、plan位置、ticket bindingを再検証する。どれかが欠損・不一致なら安全停止する。

ケースAは `full → partial → 次stage待ち`、ケースBは `full → partial → unusable → unvisited` を準備してから実際にquery付きの同一ページへ再読込する。再読込後のtab IDは保存済みwriter IDと一致しないため、自動writer化しない。画面は「このタブでは操作を続けられません」「続けるには、このタブへ担当を移してください」とだけ示す。

## 明示writer引継ぎ

`このタブへ担当を移す` は、再読込時に観測した `{sessionId, writerId, writerGeneration, revision}` を必須のexpectationとして渡す。

1. 現sessionを再検証する。
2. 観測値と現writer/generation/revisionが一致することを確認する。
3. IndexedDB transaction（Memory testでは同等CAS）で比較して更新する。
4. 新tab ID、`writerGeneration + 1`、`revision + 1` を保存する。
5. read-back一致後だけ新tabをwriterとして有効にする。

2 tabが同じ観測値で同時に引継ぎを要求しても、CAS成功は1つだけで、もう一方は `SESSION_CONFLICT` で停止する。旧tabは旧ticket、旧writer ID、旧expectationでstage保存、failure記録、next、session更新を行えない。read-only確認は元から書込みを行わない。

ケースAでは明示引継ぎ後にのみ次stageを保存できる。ケースBでは引継ぎ後も `stopped-unusable` を維持し、nextは解放しない。read-only summaryはfull 1 / partial 1 / unusable 1 / unvisited 1のままである。

## 検証

```powershell
node scripts/build-phase11-typed-one-tap.mjs
node --test tests/unit/phase11-typed-one-tap.test.mjs
node --test tests/browser/phase11-typed-one-tap.test.mjs
node scripts/preview-phase11-typed-one-tap.mjs
```

unitはPhase A/B/Cを維持し、Phase Dのnon-writer復元、explicit takeover、generation/revision増加、旧ticket失効、旧tabのstage/failure/session更新拒否、同時takeover、revision競合、plan/draft/payload/failureの破損停止、stopped-unusable維持を検証する。browserはケースA/Bそれぞれの同一origin再読込相当を確認する。外部request、fetch/XHR、localStorage、既存DBは使わない。

## 対象外

実site、XPI、production、apply、existing full receiver、inspection数値計算、full subset apply、unusable skip、retry、owner向けrevision UIはPhase Dの対象外である。
