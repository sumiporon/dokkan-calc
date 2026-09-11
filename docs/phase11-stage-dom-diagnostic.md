# Stage 17050015：表示済みDOMの一回限りの診断

2026-09-11。追加署名XPIは不要。Windows FirefoxからUSB経由で、Android Firefoxに現在残っているstageタブを調べる。これは今回の原因調査だけの手順で、通常のstage更新UXではない。Windows Firefox、データ通信対応USBケーブル、初回USB設定が必要。ownerの端末での接続・コピーは未実測。

## 分かっていること

ownerは、必殺技欄で確率・再使用時間は表示され、必殺技条件内の最大ATK/ターンだけが空欄と報告した。敵本体の最大ATK/ターンとは別欄であり、代用しない。stageはdraft未保存・次へ無効のまま安全停止している。

既存parserはSuper欄のテキストを読み、直下ノードの必殺アイコンとHPレンジで条件を分ける。CSSで隠された通常テキストも対象になる。一方、data属性・inputのvalue・CSS生成文字・異なる列や条件構造へ値が移れば読めない可能性がある。現行XPIのincomplete画面にはまとめた不足文言だけが渡り、raw textやfield別結果は保存されていない。

2026-02-23保存資料では回数が読めたが、現在空欄となった原因は未確定。サイトのテンプレートとデータfieldの不一致、元データの欠損、表示方法・DOM構造の変更はいずれも仮説。旧値で補完せず、parserと必須検査は変更しない。

## owner手順

1. Androidの対象タブを開いたままにする。再読み込み、再解析、別stageへの移動は不要。現在のDOMを残すためFirefoxを終了しない。
2. Androidを機内モードにし、Wi-FiもOFFにする。USBテザリングは使わない。診断中のsource通信を防ぐためで、Windowsのインターネット接続はそのままでよい。
3. Windows Firefoxで `about:debugging` を開き、「セットアップ」の「USBデバイスを有効にする」を押す。WindowsにFirefoxがなければ先に公式版を導入する。
4. Androidの設定 → 端末情報 → ビルド番号を7回押し、開発者向けオプションの「USBデバッグ」をONにする（既に有効なら不要）。Android Firefoxの設定 → 詳細設定にある「USB経由のリモートデバッグ」もONにする。機種によって設定名・場所は異なる。
5. USBケーブルで接続し、自分のPCへの接続許可をAndroidで確認する。Windows Firefoxの `about:debugging` で端末の「接続」→ 端末名 → **タブ**一覧の `17050015` の「調査 / Inspect」を押す。拡張機能の調査ではない。URL欄・更新ボタンは触らない。
6. 開いた開発ツールの「コンソール」を選ぶ。PC上の `scripts/phase11-stage-dom-diagnostic.js` をテキストとして開き、全文をコピーしてコンソールへ貼り付け、実行する。コンソール用の複数行エディターなら「実行」を押す。これは現在のタブを読むだけの、今回用に検証したコード。貼り付け制限や接続エラーが出たら、その文言で止めて報告する。
7. 診断JSONがクリップボードに入るので、このチャットへ貼り付ける。実行結果の `undefined` はcopy完了時にも表示される。クリップボードへ入らない場合はコンソール全文を送らず、その旨だけ報告する。
8. 終了後、両方のUSBデバッグをOFFにし、ケーブルを外す。

接続時にタブの再読み込み・Firefox再起動・Android Firefox更新が必要と表示された場合は実行しない。現在DOMを失わないことを優先し、表示された状態を報告する。端末が見つからない場合も、新しいstageページを開いて代用しない。

## 診断範囲と判断

出力は対象stageの敵名、敵本体の回数欄（別項目）、parserと同じselectorの一致件数、Super列の直下テキストとDOM構造、hidden/display/visibility、関連属性、入力値、疑似要素の文字、コメント・template内の内容。全文HTML、画像本体、通信、cookie、storage、JSヒープには触れない。script本文・URL属性・認証名属性は出力せず、省略がある場合は明示する。これは実adapterの解析結果ではなくDOM観測値で、値の意味を確定・補完しない。

- 表示にない値がDOMに見つかる：必殺技・HP条件との対応と意味を確認してからparser修正の要否を判断する。
- 対象DOMに値がない：**今回確認した必殺技DOMから回数を得られない**として停止する。調べていない埋め込みscriptやsourceサーバーにも存在しないと断言しない。
- selector不一致や省略部分に未解決の可能性が残る：未確認と報告する。自動fetch、hidden API調査、旧値補完、検査緩和には進まない。

検証コマンド: `node --test tests/browser/phase11-stage-dom-diagnostic.test.mjs`。架空ページだけで空欄、非表示文字、data属性、hidden input、除外、誤ったタブの停止、DOM不変、診断中のrequestなしを確認する。Android実機の通信やクリップボード結果を代替する試験ではない。

2026-09-11検証結果: 上記Chromiumテスト1件成功、診断スクリプトの構文検査成功。既存parser・extension・AMO提出物・productionは変更していない。

## owner実機結果と結論

2026-09-11、ownerがstage 17050015で実行した結果、スーパージャネンバおよび超ゴジータの対象必殺技条件について、確率と再使用までの時間は確認できたが、必殺技ごとの最大ATK/ターンはラベル以外に値がなかった。対象範囲のtext、hidden text、data属性、input value、疑似要素、comment、templateにも候補はなく、`omissions` は空だった。

したがって、表示済みDOMの範囲ではparserの読み損ねではなく、必殺技ごとの回数を取得できない。敵本体の最大ATK/ターン、旧保存値、推測値は代用しない。stage 17050015は現行Phase 11完全取込基準で不合格のまま停止する。

公式手順（確認日2026-09-11）：[FirefoxのAndroid USB接続](https://firefox-source-docs.mozilla.org/devtools-user/about_colon_debugging/index.html#connecting-to-a-remote-device)、[Consoleのcopyヘルパー](https://firefox-source-docs.mozilla.org/devtools-user/web_console/helpers/index.html)。
