const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所: セレクタ初期化バグの修正 ====
// 現状のコード:
//   const currentEnemyName = loadedEnemyData.name || '';
//   if (existingContainer && existingContainer.dataset.enemyName === currentEnemyName) {
//     dynContainer = existingContainer;
//   } else {
//     resultSection.innerHTML = '<div class="dynamic-damage-container"></div>';
//     dynContainer = resultSection.querySelector('.dynamic-damage-container');
//     dynContainer.dataset.enemyName = currentEnemyName;
//     existingContainer = null;
//   }
// ...
//   if (!existingContainer) {
//     dynContainer.innerHTML = selectorsHTML + '<div class="dynamic-attacks-list"></div>';
//   }
//
// 上記のロジックだと、「敵が変化していない」場合（DEF等を入力しただけの時）は innerHTML への書き込みは発生しないはず。
// なぜ「プルダウンが初期値に戻る」のか？
// それは、再利用時（`existingContainer`が存在し `existingContainer.dataset.enemyName === currentEnemyName` のとき）、
// `dynContainer.innerHTML = selectorsHTML + ...` は実行されないためプルダウンのDOMは維持されるが、
// `renderDynamicAttacks` が実行される直前にあるはずの「動的計算用の再描画ロジック」に問題があるのか？
//
// 待って、ユーザーからの報告:「DEFなどの数値を入力すると、ターン数や被弾回数のプルダウンが初期値に戻ってしまいます」
// 「数値（DEF等）を入力すると、`turnAtkUpStartTurn`のバグ直しの後にリセットバグが…」
// いま見たコードは、すでに `// === 修正済み: セレクターを再生成しない ===` というコメントが入っています。
//
// つまり、【前回の修正パッチ】等で既にこの部分は "一度対応" したがうまく動いていない（あるいは別のタイミングで上書きされている）。
// 再確認： `existingContainer` のチェックをしているが、`currentEnemyName` が適切に取得できていないのでは？
// `const currentEnemyName = loadedEnemyData.name || '';`
// しかし、`loadedEnemyData` の中身がイベントのたびに変わる可能性？
// 
// もう一度ソースコードを確認：
//       const updateScenarioResults = (card) => {
//         const scenarioData = {};
//         card.querySelectorAll('.scenario-input').forEach(...)
// ...
//         const loadedEnemyData = card.dataset.loadedEnemy ? JSON.parse(card.dataset.loadedEnemy) : null;
//
// 入力（DEF等）を変えるたびに updateScenarioResults が呼ばれ、loadedEnemyData は変わらない（JSONをパースするだけ）。
// その結果 `loadedEnemyData.name` も同じ。したがって「同じ敵」と判断される。
// ということは `!existingContainer` は false になるため、
//   if (!existingContainer) {
//     dynContainer.innerHTML = selectorsHTML + '<div class="dynamic-attacks-list"></div>';
//   }
// は実行されない。
// 
// しかし、 `if (!existingContainer)` の中で `selectorsHTML` を描画しているのに加えて、
// イベントリスナーの追加も
//             if (!existingContainer) {
//               dynContainer.querySelectorAll('.condition-selectors select').forEach(sel => {
//                 sel.addEventListener('change', renderDynamicAttacks);
//               });
//             }
// の中に入っている。これも問題ない（1度しか付けない）。
// 
// あ、原因わかりました。
// `updateAllScenarioResults` や `updateScenarioResults(card)` を呼ぶとき、
// `dokkan_calc_final.js` の一番下に、このような処理があります：
// 
//             if (e.target.dataset.input === 'enemy_atk') {
//               // If user types in manual ATK, clear the loaded preset
//               if (card.dataset.loadedEnemy) {
//                 delete card.dataset.loadedEnemy;
//               }
// 
// さらに、もう一つ「致命的なミス」があります。
// `dynContainer.innerHTML = selectorsHTML + ...` の外で、
// `renderDynamicAttacks()` が宣言されており、それが毎回新しく定義されています。
// そして イベントリスナーは "初回だけ" （`!existingContainer` のときだけ）割り当てられます。
//
// もし、"2回目" 以降（DEFなどが変更されて updateScenarioResults が走った場合）は、
// 初回に登録した `addEventListener('change', renderDynamicAttacks)` が発火したとき、【一番最初に生成された古いスコープの renderDynamicAttacks】 を呼んでしまう！！！
// なぜなら、初回呼び出し時のクロージャが保持されたままで、最新の final_def 等を反映した新しい renderDynamicAttacks が呼ばれないからです。
// だから、「プルダウンの選択状態は見た目維持されているのに、計算結果（被ダメ等）が反映されない」か、
// 「計算するために何か操作するとおかしくなる」というバグです。

// あるいは「プルダウンが初期値に戻る」というユーザーの直言通りである場合：
// DOMが再生成されている。
// DOMが再生成されるのは `existingContainer.dataset.enemyName !== currentEnemyName` のとき。
// `resultSection.querySelector('.dynamic-damage-container')` がなぜか見つからない、
// あるいは `loadedEnemyData.name` が存在しない（一部の敵データで name が無い？ いや、あるはず）。
// 
// 「DEFなどの数値を入力すると、ターン数や被弾回数のプルダウンが初期値に戻ってしまいます」
// 入力イベントごとに `calc_logic.js` や `dokkan_calc_final.js` で、
// `card.innerHTML` 等を親元から変えたりしていないか？
// なぜか `resultSection.querySelector('.dynamic-damage-container')` が消えている、
// または `dataset.loadedEnemy` が消えている？
//
// L177048 の `// === 修正済み: セレクターを再生成しない ===` は
// 誰が書いたか？ → 過去の私（Assistant）か、あるいはAIか。
// L177065: 旧データにbaseAtkが無い場合のフォールバック
//  … ここで `loadedEnemyData` に色々破壊的代入をしているが `dataset` を書き戻していない。
// これが `dataset.loadedEnemy` とは別オブジェクトになっているのは問題ないが。
//
// 一度確実な方法に変更します。
// プルダウンを再描画するなら、現在の選択値を保存してから、HTML再設定後にリストア・復元する仕組みを作れば、
// 初回だろうが複数回だろうが関係なく安全に動作します。
//
// 修正方針:
// 毎回 `innerHTML` を丸ごと生成してよいが、事前に現在の select の値を覚えておき、
// 生成後に `.value` にセットし直す。
// そして、イベントリスナーも毎回新しい `renderDynamicAttacks` 関数に向けてアタッチし直す（アロー関数をグローバルにしないため、innerHTML入れ替えなら自然に剥がれる）。

const OLD_BLOCK_START = '          // === 修正済み: セレクターを再生成しない ===';
const OLD_BLOCK_END = '            renderDynamicAttacks();\\n          }';
// regexで取得して置換する
const startIdx = code.indexOf('          // === 修正済み: セレクターを再生成しない ===');
if (startIdx !== -1) {
    const endSearch = '          }'; // renderDynamicAttacks(); の次あたりにあるはず
    const idxRenderCall = code.indexOf('renderDynamicAttacks();', startIdx);
    const endIdxStr = code.indexOf('}', idxRenderCall);
    const oldCode = code.substring(startIdx, endIdxStr + 1);

    const newCode = `          // === 状態保持付きで再生成（クロージャ等のバグを完全に回避する） ===
          // 既存のセレクタがあればその値を保持
          const existingContainer = resultSection.querySelector('.dynamic-damage-container');
          const savedConds = {
            turn: existingContainer?.querySelector('.cond-turn')?.value,
            hit: existingContainer?.querySelector('.cond-hit')?.value,
            hp: existingContainer?.querySelector('.cond-hp')?.value,
            appear: existingContainer?.querySelector('.cond-appear')?.value
          };

          // 毎回HTMLを再生成する（最新の変数を束縛した renderDynamicAttacks を安全に動作させるため）
          resultSection.innerHTML = '<div class="dynamic-damage-container"></div>';
          const dynContainer = resultSection.querySelector('.dynamic-damage-container');
          const currentEnemyName = loadedEnemyData.name || '';
          dynContainer.dataset.enemyName = currentEnemyName;

          // 旧データにbaseAtkが無い場合のフォールバック
          if (!loadedEnemyData.baseAtk && loadedEnemyData.attacks && loadedEnemyData.attacks.length > 0) {
            const normalAtk = loadedEnemyData.attacks.find(a => a.name === '通常');
            if (normalAtk) {
              loadedEnemyData.baseAtk = normalAtk.value;
              const saAtk = loadedEnemyData.attacks.find(a => a.name === '必殺' || a.name.includes('必殺'));
              loadedEnemyData.saMulti = saAtk ? saAtk.value / normalAtk.value : 3;
              loadedEnemyData.saBuffMod = loadedEnemyData.saBuffMod || 0;
              const aoeAtk = loadedEnemyData.attacks.find(a => a.name === '全体攻撃');
              loadedEnemyData.aoeDamage = aoeAtk ? aoeAtk.value : 0;
              loadedEnemyData.hasSaCrit = loadedEnemyData.hasSaCrit || false;
              loadedEnemyData.turnAtkUpStartTurn = loadedEnemyData.turnAtkUpStartTurn || 1;
              loadedEnemyData.turnAtkUp = loadedEnemyData.turnAtkUp || 0;
              loadedEnemyData.turnAtkMax = loadedEnemyData.turnAtkMax || 0;
              loadedEnemyData.hitAtkUp = loadedEnemyData.hitAtkUp || 0;
              loadedEnemyData.hitAtkMax = loadedEnemyData.hitAtkMax || 0;
              loadedEnemyData.hpAtkUp = loadedEnemyData.hpAtkUp || 0;
              loadedEnemyData.hpAtkThreshold = loadedEnemyData.hpAtkThreshold || 0;
              loadedEnemyData.appearEntries = loadedEnemyData.appearEntries || [];
            }
          }

          if (!loadedEnemyData.baseAtk || loadedEnemyData.baseAtk <= 0) {
            dynContainer.innerHTML = '<p>この敵にはATKデータがありません。</p>';
          } else {
            const d = loadedEnemyData;
            // --- 条件セレクターを生成 ---
            let selectorsHTML = '<div class="condition-selectors" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">';

            if (d.turnAtkUp > 0 && d.turnAtkMax > 0) {
              const startTurn = d.turnAtkUpStartTurn || 1;
              const steps = Math.floor(d.turnAtkMax / d.turnAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">ターン経過</label><select class="form-control cond-turn" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const currentTurn = startTurn + i - 1;
                const pct = d.turnAtkUp * i;
                selectorsHTML += '<option value="' + pct + '">' + currentTurn + 'ターン (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }

            if (d.hitAtkUp > 0 && d.hitAtkMax > 0) {
              const steps = Math.floor(d.hitAtkMax / d.hitAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">被弾回数</label><select class="form-control cond-hit" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const pct = d.hitAtkUp * i;
                selectorsHTML += '<option value="' + pct + '">' + i + '回 (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }

            if (d.hpAtkUp > 0) {
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">HP条件</label><select class="form-control cond-hp" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">HP' + d.hpAtkThreshold + '%以上</option>';
              selectorsHTML += '<option value="' + d.hpAtkUp + '">HP' + d.hpAtkThreshold + '%以下 (ATK+' + d.hpAtkUp + '%)</option>';
              selectorsHTML += '</select></div>';
            }

            if (d.appearEntries && d.appearEntries.length > 0) {
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">登場ターン</label><select class="form-control cond-appear" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">初期</option>';
              d.appearEntries.forEach(e => {
                selectorsHTML += '<option value="' + e.cumulativeAtkUp + '">' + e.turn + 'ターン目 (ATK+' + e.cumulativeAtkUp + '%)</option>';
              });
              selectorsHTML += '</select></div>';
            }

            selectorsHTML += '</div>';
            dynContainer.innerHTML = selectorsHTML + '<div class="dynamic-attacks-list"></div>';

            // --- 保存した状態を復元 ---
            const turnSel = dynContainer.querySelector('.cond-turn');
            if (turnSel && savedConds.turn) turnSel.value = savedConds.turn;
            const hitSel = dynContainer.querySelector('.cond-hit');
            if (hitSel && savedConds.hit) hitSel.value = savedConds.hit;
            const hpSel = dynContainer.querySelector('.cond-hp');
            if (hpSel && savedConds.hp) hpSel.value = savedConds.hp;
            const appSel = dynContainer.querySelector('.cond-appear');
            if (appSel && savedConds.appear) appSel.value = savedConds.appear;

            const renderDynamicAttacks = () => {
              const turnPct = parseFloat(dynContainer.querySelector('.cond-turn')?.value || 0);
              const hitPct = parseFloat(dynContainer.querySelector('.cond-hit')?.value || 0);
              const hpPct = parseFloat(dynContainer.querySelector('.cond-hp')?.value || 0);
              const appearPct = parseFloat(dynContainer.querySelector('.cond-appear')?.value || 0);

              const totalAtkUpPct = turnPct + hitPct + hpPct + appearPct;
              const atkMulti = 1 + (totalAtkUpPct / 100);

              const boostedAtk = Math.floor(d.baseAtk * atkMulti);
              const trueSaMulti = d.saMulti + d.saBuffMod;
              const postSaNormalMulti = 1.0 + d.saBuffMod;

              const dynamicAttacks = [];
              dynamicAttacks.push({ name: '通常', value: boostedAtk, isCrit: false });
              if (d.saBuffMod > 0) dynamicAttacks.push({ name: '通常(必殺後)', value: Math.floor(boostedAtk * postSaNormalMulti), isCrit: false });

              if (d.hasSaCrit) {
                dynamicAttacks.push({ name: '必殺', value: Math.floor(boostedAtk * trueSaMulti), isCrit: false });
                dynamicAttacks.push({ name: '必殺[会心]', value: Math.floor(boostedAtk * trueSaMulti), isCrit: true });
              } else {
                dynamicAttacks.push({ name: '必殺', value: Math.floor(boostedAtk * trueSaMulti), isCrit: false });
              }

              if (d.aoeDamage > 0) dynamicAttacks.push({ name: '全体攻撃', value: Math.floor(d.aoeDamage * atkMulti), isCrit: false });

              const listDiv = dynContainer.querySelector('.dynamic-attacks-list');
              let condLabel = totalAtkUpPct > 0 ? '<div style="font-size:0.8rem;color:var(--secondary-color);margin-bottom:0.3rem;">合計ATK +' + totalAtkUpPct + '% (x' + atkMulti.toFixed(2) + ')</div>' : '';
              let html = condLabel;

              dynamicAttacks.forEach(atk => {
                let atkCritMod_local = 1.0;
                let defForCalc = final_def;
                let attrMod_local = 1.0;
                let guardMod_local = (group1_advantage_status === 'advantage') ? 0.5 : 1.0;

                const o_class = scenarioData.own_class || 'super';
                const e_class = scenarioData.enemy_class || 'extreme';
                const is_same_class = o_class === e_class;
                if (is_same_class) {
                  if (group1_advantage_status === 'advantage') attrMod_local = 0.9;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.25;
                } else {
                  if (group1_advantage_status === 'advantage') attrMod_local = 1.0;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.5;
                  else attrMod_local = 1.15;
                }

                if (is_guard) {
                  attrMod_local = 0.8;
                  guardMod_local = 0.5;
                }

                if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                  attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                }

                if (atk.isCrit) {
                  const e_def_down = d.critDefDown || 0;
                  attrMod_local = 1.9;
                  defForCalc = final_def * (1 - (e_def_down / 100));

                  if (!is_guard) {
                    guardMod_local = 1.0;
                  }
                }

                const dmg = Math.max(0, ((atk.value * 1.0) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
                const is_this_attack_crit = atk.isCrit || is_critical;
                const critBadge = (is_this_attack_crit && !atk.name.includes('会心')) ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';
                html += '<div class="multi-attack-result-item" style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                  '<span class="attack-name" style="font-weight:bold;">' + atk.name + critBadge + '</span>' +
                  '<span style="font-size:0.85rem;color:var(--secondary-color);">ATK: ' + formatNumber(atk.value) + '</span>' +
                  '</div>' +
                  '<div style="text-align:right;font-size:1.1rem;font-weight:bold;color:var(--danger-color);">被ダメ: ' + formatNumber(dmg) + '</div>' +
                  '</div>';
              });

              listDiv.innerHTML = html;
            };

            // イベントリスナーを毎回割り当てる
            dynContainer.querySelectorAll('.condition-selectors select').forEach(sel => {
              sel.addEventListener('change', () => {
                // セレクトボックス変更時に親カード（シナリオ）全体を再計算し、
                // 他のデータ（DEFなど）との整合性を保つ
                updateScenarioResults(card);
                saveState();
              });
            });

            renderDynamicAttacks();
          }`;

    code = code.replace(oldCode, newCode);
    fs.writeFileSync(FILE, code, 'utf8');
    console.log('UI Reset Patch saved');
} else {
    console.error('ERROR: Could not find block for UI Reset Patch.');
}
