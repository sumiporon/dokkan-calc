# localStorageの現行形式

この文書は、第2段階時点のブラウザ保存形式を記録したものです。保存形式そのものは変更していません。実ユーザーのブラウザデータも読み取り・消去していません。

## production OneDrive／local旧版で使用中のキー

| キー | 内容 | 同じ旧app内での互換方針 |
|---|---|---|
| `dokkan_calc_data_v22` | 計算状態、保存キャラクター、敵、現在の状況、テーマ | 必ず互換性を保つ |
| `dokkan_crit_overrides` | 敵会心の手動補正 | 名前衝突を考慮して維持する |
| `dokkan_github_pat` | GitHub認証情報を平文保存する既存機能 | production旧版では現在変更しない。Pagesはこのkeyを読まず、PATを要求しない |

## `dokkan_calc_data_v22`

```text
{
  durabilityLines,
  savedCharacters,
  savedEnemies,
  currentScenarios,
  theme
}
```

### `durabilityLines`

`{ name: string, value: number }[]`です。ユーザーが作った「完封」「70万」などの被ダメージ目標を保存します。

### `savedCharacters`

`{ name: string, scenarios: Scenario[] }[]`です。キャラクター名と、その時点の状況カード一式を保存します。

### `savedEnemies`

プリセット敵、ユーザーが手動追加した敵、ユーザーが編集した敵が同じ配列に混在します。どれが手動データかを示す項目はありません。

そのため、同じ旧app内の将来形式変更でプリセットへ単純置換するとユーザーの敵を失います。現行データ全体をまず保持し、IDが利用可能になった後も未対応データをスナップショットとして残してください。これはOneDriveからPagesへ転送するという意味ではありません。

### `currentScenarios`とScenario

現在画面にある未保存の作業状態です。主な項目は以下です。

```text
originalIndex, scenario_title,
char_def, passive, multi_passive, memory, link, super_attack,
leader, field, active, support_item,
dr_input, is_guard,
own_class, own_type, enemy_class, enemy_type, attr_def_up,
enemy_atk, is_critical, crit_atk_up, crit_def_down,
loaded_enemy_event_type, loaded_enemy_series,
loaded_enemy_stage, loaded_enemy_boss,
loadedEnemy
```

- HTMLのnumber入力も保存時は文字列です。
- チェックボックスはbooleanです。
- `originalIndex`はnumberです。
- `loadedEnemy`はID参照ではなく、その時点の敵オブジェクト全体のコピーです。
- `loaded_enemy_*`は配列インデックスを文字列で保存します。敵データを並べ替えると別の敵を指す危険があります。
- 計算モード（耐久／被ダメージ）は保存されません。

### `theme`

`light`または`dark`です。

## `dokkan_crit_overrides`

```text
{
  "イベント_シリーズ_ステージ_ボス": {
    "critAtkUp": number,
    "critDefDown": number
  }
}
```

イベント名など4階層をアンダースコアで連結したキーです。同名ボス・複数フェーズを区別できません。将来ID方式へ移す場合も、解決できない名前キーを捨てずに互換領域へ残す必要があります。

なお、リポジトリの`scraper/crit_overrides.json`は現在これとは異なる配列形式です。自動変換・上書きは行わず、別タスクで統一方法を決めてください。

## 旧形式の互換処理

現行コードは読み込み時に次の形式を4階層へ変換します。

- 2階層：`groupName -> enemies`
- 3階層：`categoryName -> events -> bosses`

この互換処理はproduction旧版内のユーザーデータを守るため、同一app内の互換テストなしで削除してはいけません。対応fixtureは`tests/fixtures/storage/legacy-two-tier.json`と`legacy-three-tier.json`です。Pages RCはこれらOneDrive旧版keyを読みません。

## 既知の危険箇所

- 状態本体に明示的な`schemaVersion`がなく、バージョンはキー名の`v22`だけです。
- プリセット敵の圧縮JSONだけで約202万文字あり、保存上限に近づく可能性があります。
- `saveState(false)`は`currentScenarios`を空配列として保存します。
- 全データリセットは`localStorage.clear()`を使い、同じオリジンの他キーも消します。
- 保存失敗を画面で十分に通知できない経路があります。
- GitHub認証情報が平文保存されます。

これらは第2段階では変更せず、テストと文書で固定します。

## テスト用データ

`tests/fixtures/storage/`には以下があります。

- 現行v22の代表状態
- 旧2階層形式
- 旧3階層形式
- 会心上書き形式

すべて架空データです。認証情報は含めず、テストは秘密情報らしいキー・値がfixtureへ混入していないことも確認します。

## production旧版内の将来schema変更で必ず維持するもの

- ユーザー設定の耐久ライン
- 保存キャラクター名と全シナリオ
- 手動追加・編集された敵
- 現在作業中の未保存シナリオ
- テーマ
- 会心上書き
- `loadedEnemy`の値または互換スナップショット
- 旧2階層・3階層からの読み込み能力

GitHub認証情報は一般データの保存・backup・export経路へ含めません。Pagesは旧PAT keyを読みません。production旧版の扱いを変更する場合は、セキュリティ方針を説明してから実施します。

## Phase 8 RCの独立したPages内保存

ownerの確定方針により、PagesはOneDrive／local旧版から保存内容を移さず、新規状態から開始する。Phase 8 RCは、計算カードとUI設定の主状態を専用key `dokkan_phase8_rc_pages_state_v1`だけへ読み書きする。

```text
{
  phase8PagesStateVersion: 1,
  durabilityLines,
  currentScenarios,
  theme
}
```

`currentScenarios`には各カードのDEF、軽減、属性、ガード、会心、カスタム攻撃ATK／敵属性、event・stage・enemy・attack選択、耐久ライン専用敵属性などを保存する。複数カードも同じ配列へ保存する。カードの開閉状態は表示専用で保存しない。

Pages内で生成する補助状態は別にあり、前回選択eventを`dokkan_phase8_rc_last_event_v1`、更新結果の監査履歴を`dokkan_phase8_rc_update_history_v1`へ保存する。enemy releaseのactive／known-good／rollback情報はIndexedDB、取得artifactはbrowser cacheを使う。これらもPages自身の選択・更新機能のための状態であり、OneDrive旧版からの保存データ移行ではない。

RCは次をfallback読込しない。

- production旧版の`dokkan_calc_data_v22`
- 廃止した移行先`dokkan_phase8_rc_imported_*`
- 旧`dokkan_crit_overrides`／theme key
- `dokkan_github_pat`
- 未知key

これらの旧keyを削除・変更もしない。Pagesは初回だけ空で始まり、その後は`dokkan_phase8_rc_pages_state_v1`からPages自身の状態を復元する。将来このPages内schemaを変える場合は、同じPages namespace内だけでversion付き互換処理とtestを用意する。OneDrive→Pages import、export、同期、逆同期を再導入してはいけない。
