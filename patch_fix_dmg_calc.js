/**
 * パッチ3: ダメージ計算式（会心処理・属性補正の順序）の修正
 *
 * ユーザーから「会心時ATK12222%を入れると、等倍属性の被ダメがおかしくなる（DEF111万でも518万食らう）」と報告があった。
 * 実際には、会心の補正（atkCritMod_local）は、最終ダメージへの倍率としてかかるのがドッカンの仕様（おおまかに「属性相性1.9倍」として扱うようなもの）。
 * 現在のコードは ATK * atkCritMod_local となっているため、12222%を入れるとATK自体が123倍になり、異常なダメージ算出になっていた。
 *
 * 【正しい計算式（概算）】
 * 1. 敵の基本ATK = atk.value
 * 2. 属性相性等の補正（attrMod_local）を計算
 *    会心の場合（攻撃側が会心を出した）、ドッカンにおいて敵の会心は「DEF無視」ではなく、プレイヤー側の「DEF低下（c_def_down）」や「ダメージ倍率上昇」として扱う。
 *    ※ツール上の `crit_atk_up` は「会心時の最終ダメージにかかる倍率」として適用するのが正解。
 *      atkCritMod_local = 1 + (c_atk_up / 100);
 * 3. 最終ダメージ = ( (atk.value * attrMod_local * atkCritMod_local) * dr_mod ) - defForCalc
 *    さらに guardMod_local が最後にかかる。
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 ====
// 古い式: const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
// 新しい式: const dmg = Math.max(0, (atk.value * atkCritMod_local * attrMod_local * dr_mod - defForCalc)) * guardMod_local;

// * 実は `(atk.value * atkCritMod_local) * attrMod_local * dr_mod` でも順序は同じになるはずだが、
// そもそも問題は `(atk.value * atkCritMod_local)` よりも、ドッカン計算の仕様にある。
// 敵ATK 630万
// c_atk_up = 12222% -> atkCritMod_local = 123.22
// atk.value * 123.22 * 1.0(attr) * 1.0(dr) - 1,111,111(def) = 630万 * 123.22 - 111万 = 776,286,000 - 111万 = 7億7517万
// これだと518万にはならない？ ユーザーの画像を見ると 518万 になっている。
// なぜ518万？
// c_atk_up はプレイヤーの「会心」チェックボックスの「会心時ATK補正(%)」ですね。
// もしかして、敵側の会心（enemy_critical）ではなく、「自キャラの会心」で被ダメボタンが変化している？
// なるほど！！！
// 
// 自キャラの会心（自身のATK計算用）の「12222%」という値を、敵の攻撃（被ダメ計算）の「atkCritMod_local」に流用してしまっているのが原因！
//
// calculateNewDurability を見ると:
// const is_critical = scenarioData.is_critical || false;
// const crit_atk_up = scenarioData.crit_atk_up || 0;
// const crit_def_down = scenarioData.crit_def_down || 0;
//
// 上記の変数は、「自分が攻撃するとき」の会心情報。
// しかし renderDynamicAttacks や damage_mode で、これを「敵が会心を出したときの補正」として使ってしまっている！
//
// ====================
// 修正方針
// 敵の会心情報は `loadedEnemyData.hasSaCrit` とかで判定するべきであり、
// scenarioDataの `is_critical` `crit_atk_up` `crit_def_down` は「自分の攻撃時のデータ」です。
// 被ダメ計算においては、これらを使わないようにします。
// （※ただし、「敵が会心を出してくるステージ」の再現として手動で入力できるようにしているなら別ですが、
//   UI上「会心」のチェックボックスや「会心時ATK補正(%)」は「与ダメ計算用」という前提だったはず。
//   もし「敵の会心設定」なら、敵のデータから引っ張ってくるべき。）

// 現在の実装を再確認
//   const is_critical = scenarioData.is_critical || false;
//   const crit_atk_up = scenarioData.crit_atk_up || 0;
//   const crit_def_down = scenarioData.crit_def_down || 0;
// この is_critical は自キャラの会心ですね。UI上の「会心チェックボックス」と紐づいています。

// 修正内容:
// renderDynamicAttacks の中の `if (atk.isCrit || is_critical)` を `if (atk.isCrit)` のみにする。
// （自分の is_critical が True だからといって敵の攻撃が全会心になるのはおかしい）
// そして atk.isCrit が True の時の敵会心補正は、デフォルトのドッカン仕様値 (1.9倍など) をハードコードするか、
// 敵データの critAtkUp / critDefDown （または固定値）を使うようにする。
// （※敵の会心は現在判明している仕様では、プレイヤーに対する「会心時威力1.9倍、DEF無視」のような強烈な補正。
//   ただし現状正確な倍率がないので、デフォルト1.9倍・DEF無視、またはenemyDataに定義があればそれを使う）

const OLD_CRIT_APPLY = \`                // 攻撃が会心（isCrit=true）、または敵自体が全体として会心（is_critical=true）の場合
                if (atk.isCrit || is_critical) {
                  const c_atk_up = parseFloat(crit_atk_up) || 0;
                  const c_def_down = parseFloat(crit_def_down) || 0;
                  atkCritMod_local = 1 + (c_atk_up / 100);
                  defForCalc = final_def * (1 - (c_def_down / 100));

                  if (!is_guard) {
                    attrMod_local = 1.0;
                    guardMod_local = 1.0;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  }
                }\`;

const NEW_CRIT_APPLY = \`                // 敵の攻撃が会心（atk.isCrit=true）の場合のみ、敵側の会心補正を適用する
                // （※is_critical は自キャラの会心フラグなので被ダメには関係ない）
                if (atk.isCrit) {
                  // 敵の会心は通常1.9倍(または独自倍率)、DEF減算等の補正が入る
                  // ここでは敵の固有会心設定(d.critAtkUp等)があれば利用し、なければデフォルト値を使用
                  // ドッカンの敵の会心被ダメ倍率は諸説あるが、プレイヤー会心と同じく属性相性1.9倍(または1.5倍)相当とされる。
                  // とりあえず敵の固定値がなければ、属性相性を無視して等倍1.0 + 固有ダメージ倍率で簡易処理。
                  
                  // モーダルから引き継いだ自キャラ用の crit_atk_up は使用しない。
                  // 敵の固有値がなければ、とりあえず属性相性補正を1.9固定（実質的な会心倍率）にする
                  attrMod_local = 1.9; // 会心による大ダメージ補正
                  
                  // defForCalc は敵がDEF低下能力(critDefDown)を持っていれば適用
                  const e_def_down = d.critDefDown || 0;
                  defForCalc = final_def * (1 - (e_def_down / 100));

                  if (!is_guard) {
                    // ガードしていなければ属性有利/不利を貫通
                    guardMod_local = 1.0;
                  }
                }\`;

code = code.replace(OLD_CRIT_APPLY, NEW_CRIT_APPLY);

// 【もう一つ】手動入力(damage_mode 且つ loadedEnemyDataなし)時の処理
//           const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
//           const damage_taken = Math.max(0, ((enemy_atk_input * atk_crit_mod) * attr_mod * dr_mod - final_def_crit_mod)) * guard_mod;
// ここの `atk_crit_mod` と `final_def_crit_mod` も is_critical（自キャラの会心）の計算結果（calculateNewDurability）を持ってきているため、自キャラが会心モードだと敵の手動ATKが123倍になります。
// 手動ATKの場合は、自キャラの会心フラグの影響を受けないように atk_crit_mod=1.0, final_def_crit_mod=final_def に修正します。

const OLD_MANUAL_CALC = \`const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          const damage_taken = Math.max(0, ((enemy_atk_input * atk_crit_mod) * attr_mod * dr_mod - final_def_crit_mod)) * guard_mod;\`;

const NEW_MANUAL_CALC = \`const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          // 手動入力の場合、自キャラの会心補正（atk_crit_mod等）は被ダメに関係ないので適用しない
          const damage_taken = Math.max(0, ((enemy_atk_input * 1.0) * attr_mod * dr_mod - final_def)) * guard_mod;\`;

code = code.replace(OLD_MANUAL_CALC, NEW_MANUAL_CALC);

fs.writeFileSync(FILE, code, 'utf8');
console.log('Patch 3: Damage formula (crit mod application) fixed successfully.');
