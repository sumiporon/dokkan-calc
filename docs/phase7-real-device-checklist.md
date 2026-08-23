# 第7段階 PC・Android・iPhone実機確認計画

作成日: 2026-08-24（JST）

Phase 7では本物のAndroid/iPhoneをCodexから操作できず、公開Pagesも変更していない。よって現在成功したのはWindows Chromium、Windows `file://`、390×844 viewport＋CPU 4倍slowdownまでである。Playwright WebKit browser binaryは追加downloadせず確認した環境にはなく、Safari相当確認も未実施である。

## Codex側で完了したこと

- full/chunkの生成、schema、digest、無損失再構築
- PC幅・390px幅のChromium browser操作
- CPU 4倍slowdownの複数回性能測定
- HTTP cold/warm cache
- Windows `file://` generated JS
- 1操作更新の正常・異常・rollback
- 架空保存データの別origin 1回移行とPAT非移行

viewport確認で分かるのは横幅、操作要素、Chromium上の処理傾向までである。Androidのmemory制限、iOS Safari/WebKit、OneDrive appから外部browserへ開く挙動、popup/opener、端末再起動後cache/localStorageは分からない。

## ownerが実機で行う時期

Phase 8の仕様をownerが承認し、Codexが**本番と別の安全なtest URL**を用意した後に行う。Phase 7では公開URLを作る権限がないため、まだ実行を求めない。terminal、GitHub管理、JSON編集、log確認は不要にする。

## AndroidとiPhoneで同じ簡単手順

1. Codexが後で提示するtest URLを、AndroidはChrome、iPhoneはSafariで開く。
2. 「準備完了」になることを確認する。
3. eventを1つ選び、stage、enemyを選び、「被ダメージを計算」を押す。
4. 画面を閉じて同じURLをもう一度開き、前より極端に遅くないか確認する。
5. 「敵データを更新」を1回だけ押し、成功表示になることを確認する。
6. 架空データ用の「保存データを移行」を1回押し、成功表示になることを確認する。
7. Codexへ「Android/iPhone、速い/普通/遅い、失敗した手順番号」だけ伝える。

## OneDrive backup確認

現在使っているknown-good HTMLは変更しない。普段のOneDriveアプリから今までどおり開き、eventを1つ選び計算できることだけを確認する。新しい複数chunk fileをownerに手動配置させる試験は、Pages primary採用判断の前には行わない。

## 合格条件

- Android ChromeとiPhone Safariの両方で主要計算が成立する。
- 横スクロールや押せないbuttonがない。
- event切替が所有者の感覚で待てる範囲である。
- updateは1回押すだけで、正常時に追加承認を要求しない。
- 架空保存データ移行が1回で完了し、再実行を要求しない。
- browserを閉じた後もPages側保存データが残る。
- 異常candidate試験では現行known-goodで計算を続けられる。
- test URLで失敗しても現在のOneDrive版と公開版には影響しない。

実機で不合格なら本番移行せず、Pages、移行方式、chunk初期選択、cacheのどこが原因かをprototypeへ戻って直す。

