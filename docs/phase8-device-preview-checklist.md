# 第8段階 PC・Android・iPhone実機確認

> 保存データ移行に関する部分は当時の設計・検証履歴です。ownerは後にOneDrive／local旧版→Pages移行を撤回しました。現在のRCはPagesを新規状態で開始し、OneDriveと保存データを移行・同期しません。この文書の移行手順は実装・実機確認に使わないでください。最新仕様は[Phase 8 結果条件表示・保存移行撤去 修正報告](phase8-result-summary-no-migration-report.md)を参照してください。

作成日: 2026-08-24（JST）

この確認版は架空dataだけを使い、現在のPages、OneDrive、保存data、敵dataへ影響しない。URLはcompletion tagのpush後に有効になる。

## 確認URL

通常画面:

`https://rawcdn.githack.com/sumiporon/dokkan-calc/phase8-complete-2026-08-24/release-candidate/phase8/index.html`

架空保存データ1回移行:

`https://rawcdn.githack.com/sumiporon/dokkan-calc/phase8-complete-2026-08-24/release-candidate/phase8/migration-device-check.html`

raw.githackはPhase 8だけの第三者preview表示で、正式Pagesではない。最初の1回だけ転送先のGitHub fileを確認する画面が出た場合は、表示先が`sumiporon/dokkan-calc`であることを見て続ける。広告、login、PAT入力は不要である。

## 各端末で行う最小手順

Windows PC、Android Chrome、iPhone Safariで同じ手順を行う。

1. 通常画面URLを開き、「準備完了」になることを確認する。
2. 「架空イベント・空」を選び、「計算する」を1回押す。横にはみ出さず結果が見えることを確認する。
3. 同じURLを閉じて開き直し、「架空イベント・空」へ戻ることを確認する。
4. 「設定・データ」を開き、「敵データを更新」を1回押す。「すでに最新です」になることを確認する。
5. 架空移行URLを開き、「架空保存データを1回で移行」を押す。開いた画面と元画面に成功が表示されることを確認する。

Codexへは、端末ごとに「速い／普通／遅い」と、失敗した場合だけ手順番号を伝える。log、スクリーンショット、browser developer toolは原則不要である。

## 自動確認済みでownerが繰り返さなくてよいこと

- manifest、index、chunk、digest、schema、version
- 前回eventの破損・削除・旧形式fallback
- download/digest/schema/件数/互換性/apply/health失敗の停止とrollback
- cache破損、active/known-good欠損・破損からの復旧
- migration allowlist、PAT/未知key除外、途中write rollback
- Chromium desktop/mobile viewport、touch、390px幅
- Windows WebKit desktop/mobile viewport
- Chromium/WebKitの単一HTML `file://`直開き

WebKit自動試験はiPhone実機試験ではない。OneDrive app固有の開き方、popup制限、端末memory、実回線速度は上の短い実機手順でだけ確認する。

## URLが開けない場合

第三者previewを使えない場合はGitHub上の`release-candidate/phase8/device-preview.html`を1 fileとしてdownloadし、端末またはOneDriveから開く。これは架空dataのUI・計算・前回event確認用で、現在のOneDrive known-goodを置換しない。架空移行はonline URLが開ける端末だけ確認すればよい。
