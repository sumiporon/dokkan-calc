# Phase 11：partial materialのoffline最小縦断prototype

2026-09-11。基準HEAD `32df3e80556accfb2e65ba38c1923742fcbf879b`。ownerが承認した自作fixture専用の実証。実装後のownerレビュー待ちであり、実DokkanInfo・Android拡張・productionへの接続を許可する記録ではない。

## 実証すること

同じ架空event `990011` / stage `99001101` の完全版と必殺回数欠落版を用意した。完全版は既存 `packagePages → validatePackage` に合格する。欠落版は同じ検査で `INCOMPLETE_STAGE` のまま停止するが、別のpartial検証・保存経路へ進める。既存検査、canonical、runtime、full package、coreは変更しない。

stage単位で計算を一括許可しない。保存可能と計算可能は別で、選択した攻撃・条件・出力ごとに既存single-hit capabilityを呼ぶ。対象出力は被ダメ、完封最終DEF、目標被ダメ最終DEFだけ。保証範囲は「この1発を受けた場合」。乱数1.00～1.03と敵状態の不確定性は混同しない。

## 新規ファイル

| ファイル | 役割 |
|---|---|
| `src/prototype/phase11-partial-rules.mjs` | 自作source文法、identity、field、版、digest規則 |
| `src/prototype/phase11-partial-adapter.mjs` | 架空HTMLの既存full検査と部分根拠抽出 |
| `src/prototype/phase11-partial-material.mjs` | 厳密な根拠照合、partial検証、出力別入口 |
| `src/prototype/phase11-partial-store.mjs` | 独立IndexedDB、read-back、競合検知、rollback |
| `src/prototype/phase11-partial-api.mjs` | ローカル検証用bundle入口 |
| `prototypes/phase11-partial/fixtures.mjs` | 同一stageのfull / A～F自作HTMLと自分側設定 |
| `prototypes/phase11-partial/index.html` | 独立review画面 |
| `prototypes/phase11-partial/app.mjs` | 選択・判定・保存・復元の画面処理 |
| `prototypes/phase11-partial/style.css` | 独立画面の表示 |
| `scripts/build-phase11-partial.mjs` | 新しい専用生成先だけをbuild |
| `scripts/preview-phase11-partial.mjs` | loopback preview |
| `tests/unit/phase11-partial.test.mjs` | full/partial、A～F、根拠破損・混在拒否 |
| `tests/browser/phase11-partial.test.mjs` | UI、永続化、故障・競合・破損時の停止 |
| この文書 | 形式、再現手順、検証、未対応範囲 |

生成先は既存のignored領域内 `generated/phase11/partial/` のみ。既存preview、AMO ZIP、XPIを再生成しない。package.json・lockfileへの変更や新依存追加もない。

## partial形式

専用 `kind: partial` / `formatVersion: phase11-partial-material-1`。canonical/runtimeは含めない。以下は実際のA材料からの構造抜粋（抜粋自体は有効なpackageではない）。

```json
{
  "kind": "partial",
  "formatVersion": "phase11-partial-material-1",
  "source": {"key":"self-authored-partial","region":"jpnja","eventId":"990011","stageId":"99001101"},
  "capture": {"id":"fictional-capture-A-partial-1","revision":1,"observedAt":"2026-09-01T00:00:00.000Z"},
  "versions": {"adapter":"fictional-partial-1","extraction":"proof-cells-1","interpretation":"fictional-single-hit-1"},
  "fields": [
    {"slot":"hit-0/attack.displayedDamage","state":"known","value":1000000,"confidence":"high","evidenceIds":["fixture:fictional-capture-A-partial-1:hit-0/attack.displayedDamage"]},
    {"slot":"hit-0/attack.maxPerTurn","state":"unavailable","value":null,"confidence":"unconfirmed","evidenceIds":["fixture:fictional-capture-A-partial-1:hit-0/attack.maxPerTurn"]}
  ],
  "fullCheck": {"status":"failed","code":"INCOMPLETE_STAGE"}
}
```

全体は2敵・3攻撃の `targets`、各攻撃17項目の `fields` / `evidence`、`uninterpreted`、`coverage`、`contentDigest`を持つ。slotから敵・攻撃・条件へ一意に結び、evidenceには同じsource/event/stage、capture ID/revision、敵/攻撃/条件ID、slot、ラベル、短いraw text、interpretation rule版を保持する。根拠付きのHP条件も保持する。

- `known`：対応規則で解釈できた値。0も保持する。
- `unknown`：自作文法の「未確認」または未認識記述。値はnull。
- `unavailable`：検査対象欄はあるが空欄。値はnull。
- `not-applicable`：自作文法で明示された会心専用補正の「対象外」。数値へ置き換えない。
- `coverage.scope` は `fictional-proof-cells-only`。51欄と未解釈効果ID一覧を列挙し、対象欄の省略は今回は認めないので `omitted: []`。これは実ページ全体の完全調査を意味しない。
- digestはcontentDigest自身を除いた内容の安定JSON表現に対するSHA-256。余分なroot/field/evidence等の項目を拒否する。原HTML全文、script、画像、cookie、storage、tokenを保存する欄はない。

根拠・digestは内部整合性検査であり、sourceの真正性を暗号学的に証明する署名ではない。原文と根拠とdigestを一緒に作り直す悪意ある偽造の認証機構ではない。今回の入力は作者管理の架空fixtureに限定する。実source接続では、対応関係・ATKの意味・履歴非依存性・効果収録範囲を別途証明する必要がある。

## 検証から計算まで

1. 自作HTMLの固定identity・event所属・一意なproof欄・確認範囲を検査する。既存parserでfull package化を試し、完全版は従来どおり検証する。
2. `INCOMPLETE_STAGE`だけを今回のpartial候補とする。他のidentity/schema等のエラーを救済しない。主攻撃の回数がknownな材料をpartialへ付け替えることも拒否する。
3. partial専用形式・版・digest・確認範囲・全fieldの根拠を検証する。raw textを同じ版の規則で再解釈し、state/value/confidence/evidence IDと厳密照合する。別enemy/attack、別capture/revisionの根拠、異なる版、余計な数値、過去値の穴埋めは不合格。
4. `calculatePartial(material, output, defender, core, target)`は材料をsnapshotして再検証し、攻撃/条件を選び、既存 `evaluateSingleHit` へ専用ビューを渡す。自分側のDEF・属性・軽減・目標値はsource根拠とは別の明示入力。
5. 出力ごとの依存値・意味・確認範囲が揃った場合だけ既存coreへ到達する。停止結果は数値valueを持たない。判定結果は材料digest/capture/revision/rule版へ追跡できる。

第1prototypeの条件範囲は明示されたHP 0～100%のみ。HP条件がunknownなら情報不足、他の既知HP区間なら計算未対応とする。AOE、履歴強化、使用回数、順序、ターン合計、敵全体の完封は扱わない。

## A～Fの結果

| ケース | partial保存 | 選択した1発の被ダメ | 完封最終DEF | 目標最終DEF |
|---|---|---|---|---|
| A：回数欠落・確定1発 | 可能 | 500,000～524,000 | 824,000 | 774,000 |
| B：履歴強化依存 | 可能 | 情報不足 | 情報不足 | 情報不足 |
| C：ATK unknown | 可能 | 情報不足 | 情報不足 | 情報不足 |
| D：属性unknown | 可能 | 情報不足 | 情報不足 | 情報不足 |
| E：known 0 | 可能 | 0・この1発：完封 | 0 | 0 |
| F：対象へ影響し得る未解釈効果 | 可能 | 情報不足 | 情報不足 | 情報不足 |

Aの自分側設定は最終DEF300,000、軽減20%、超速同士、ガードなし、属性防御0、目標50,000。EはATK/最終DEF/目標を0とした自作例。全ケースの必殺回数欄は空欄でunavailable。Cは全攻撃ATK unknownなので、計算可能0件でも保存できることをDB試験する。画面上の件数は選択した攻撃の3出力を数える（event全体の攻撃数ではない）。

## 保存・復元

DBは `dokkan-phase11-partial-OFFLINE-PROTOTYPE-v1`。既存full DB、production DB、localStorageへアクセスしない。

保存の順序は「材料検証 → 材料をdigestキーで永続化 → 読み戻して根拠/digest/内容を照合 → 履歴の現在位置を競合検査付きtransactionで切替 → 再読込確認」。read-back失敗・書込transaction中断では旧activeを維持し、保存成功とは表示しない。競合は `STALE_SAVE` で停止する。

計算可能件数は保存条件に含めない。「材料のみ保存・現在は計算できません」のケースも同じ永続化経路を通る。読込時も根拠検証する。rollbackは検証済みの履歴を**現在位置から1段だけ戻す**操作であり、戻した材料を次のrollback候補へ入れ替えない。先頭ならボタンを無効化する。rollback後に保存すると、その時点までの履歴から新しい枝を作り、以前の前方材料を暗黙に復活させない。現在版より古い/同じrevisionの異なる保存を拒否する。rollback後の別保存は別captureとして扱い、過去のknown値を継承しない。

失敗した書込みの材料や古い材料が非activeのままDBに残る場合がある。今回、GC・多段履歴UI・export・同期は作らない。DBはこのprototypeの同じbrowser profile/origin専用。previewはランダムportなので、serverを再起動して別portになった場合、旧originの保存は新画面には出ない。再読込/保存確認は同じ起動中のURLで行う。

## 再現手順

確認環境はWindows、Node.js 22.17.0、npm 10.9.2、既存lockfileの依存関係とPlaywright Chromium。既存dependenciesが入ったrepoでは次を実行する。

```powershell
node scripts/build-phase11-partial.mjs
node --test tests/unit/phase11-partial.test.mjs
node --test tests/browser/phase11-partial.test.mjs
node scripts/preview-phase11-partial.mjs
```

クリーンな依存環境では先に `npm ci` と `npx playwright install chromium`。buildは既存schemaから専用validatorと2つのbundleを新生成先へ作る。previewは表示されたlocalhost URLを開く。終了はCtrl+C。

ownerレビュー例：完全版でfull合格 → Aで3出力・保存 → Cで数値なし・保存 → 同じURLを再読込してC復元 → 「1つ前の材料へ戻す」でA復元 → B/D/E/Fの表示確認。実サイトや拡張の操作は不要。

## 検証記録

- 新規unit：31件成功。要求されたnegative caseを含み、digestだけでなく再hash後の根拠付け替えも拒否。停止経路には、coreへ触れるだけで失敗するProxyを渡し、数値なし・core非到達を確認した。
- 新規browser：3件成功。A～F/full表示、以前の数値の消去、0件保存、reload、rollback、read-back故障、write中断、競合、古いrevision、DB破損、360/390pxの横overflowなしを確認。rollbackはA保存→B保存→Aへ戻る→再rollback不可→C保存→Aへ戻るを確認し、Bの暗黙復活を防ぐ。外部通信、fetch/XHR、既存DBへのopen、localStorage書込みは検出時に失敗させる。
- 既存single-hit：unit 7件＋browser 1件の計8件成功。既存full系browser（manual-intake / one-tap / live-gate）：20件すべて成功。
- 既存unit/data：62件中61件成功、1件は既存固定previewと生成済みpreviewの不一致。`phase11-single-hit-prototype.md` に記録済みのclean HEAD再現と同じ対象で、今回も両previewのSHA-256は変わっていない。テストを通すための再生成はしていない。
- 合計：新規34件成功、既存single-hit 8件成功、既存回帰82件中81件成功。全124件中123件成功・上記pre-existing failure 1件。プロジェクト全体のfull testは実行していない。
- 新画面の390pxスクリーンショットを確認した。これはChromiumでの検証であり、Android Firefox実機PASSとは扱わない。
- 既存追跡ファイルの差分なし。production/UI/data、canonical、calculation-core、完全取込検査、full保存形式、既存single-hit、拡張は変更していない。fixture AMO v2 / live-gate AMO ZIPのSHA-256も開始時と同一。署名済みXPIの新規作成・変更は行っていない。

## 次工程の境界

ownerレビュー待ち。commit/pushは今回行わない。17050015の実値・旧値はfixtureへ使用していない。同stageは現行完全取込基準では不合格のまま。今回の成功は実sourceの部分材料を保存・利用できる証明ではない。

mixed event batch、実sourceへのadapter接続、Androidの保存後「次へ」、XPI、実サイトでのpartial→full更新、production公開は未実装。将来のためのcapture/版/identity以外に、汎用更新frameworkは追加していない。
