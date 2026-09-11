# Stage 17050015：限定inlineデータ診断

2026-09-11。owner報告では、同stageの必殺技DOMに回数の値はなく、先の診断対象内のhidden text・属性等にもなかった。Super列以外やサーバーの値の不存在までは確認していない。現在のfail-closedを維持し、ownerが開いたままの同じAndroidタブで、今回の限定診断を1回だけ行う。

## 実行

追加の署名XPIは不要。[前回のUSB接続](phase11-stage-dom-diagnostic.md)をそのまま使用する。Androidの通信OFFを維持し、同じstageタブのコンソールで `scripts/phase11-inline-data-diagnostic.js` 全文を1回実行し、コピーされたJSONをチャットへ渡す。ページ更新、別stage移動、XPI入替、再解析操作は不要。接続・実行エラー時はその文言で止め、ページを開き直さない。

## 対象と出力

- srcのあるscript、広告・解析系と識別できるscriptを除外する。
- inlineのJSON、および `__INITIAL_STATE__` / `__PRELOADED_STATE__` / `__NUXT__` / `__NEXT_DATA__` への単独代入のうち右辺全体がJSONとして読めるものだけを扱う。JSON.parseのみで、sourceコードは実行しない。JavaScript固有構文、callback形式、JSON以外のhydrationは対象外。
- cookie・storage・global変数・JSヒープにはアクセスしない。JSON内でも認証・利用者・token等の名前の枝は探索・出力対象外。無関係な自由文やデータ全文は出さない。
- 出力はscriptの種類・位置、対象stage/敵名/必殺技名に一致する参照の位置、回数に見えるfield名と数値、直近のID・HP・確率等の最小文脈。script内に参照があるだけではfieldとの対応を証明しない。内部IDだけのため名前と一致しないデータは未確認のまま。
- 2 MB/script、全体4 MB、深さ40、探索5万node、参照/field各100件まで。上限に達した場合は `inconclusive-limit` として未確定にする。大量出力を追うため範囲を広げない。

`candidate-fields-only-not-usable` は候補の存在だけを示す。敵・必殺技・HP条件との対応とfieldの意味が一意に確認できなければ使用しない。

`no-count-candidate-in-limited-inline-data` で有用な候補がなければ、owner結果を確認後「現在確認できる表示DOM＋限定埋め込みデータからは回数を取得できない」として、このstageの診断を終了する。除外したscript・サーバー等にも値がないという意味ではない。旧値補完、別field代用、parser/必須検査変更、production接続は行わない。

検証：`node --test tests/browser/phase11-inline-data-diagnostic.test.mjs`。自作データのChromium試験でJSON/hydrationの抽出、無関係/認証枝の除外、実行式の拒否、誤タブ停止、通信・DOM変更なしを確認。実sourceへのアクセスは行わず、Androidの診断結果はowner実行後に確認する。

## owner実機結果と終了判断

2026-09-11、owner実行結果は `no-count-candidate-in-limited-inline-data` だった。候補は0件、上限到達なし。外部script 29件、third-party 1件、非data 2件を除外し、invalid JSON、size limit、private subtreeの除外は各0件だった。

この結果と[表示済みDOM診断](phase11-stage-dom-diagnostic.md)を合わせ、stage 17050015では「現在確認できる表示DOM＋限定inline JSON/hydration dataから、必殺技ごとの最大ATK/ターンを取得できない」として診断を終了する。external script、API、JS heap、network、server内部は今回の境界外であり探索しない。これらにも値がないことは断定しない。parser、必須検査、productionは変更せず、現行完全取込基準では不合格のままとする。
