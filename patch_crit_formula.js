/**
 * パッチ: 敵の会心ダメージ計算式を正しい仕様に修正する
 * 
 * 変更点:
 * 1. calculateNewDurability: 会心時の属性相性・ガード計算を修正
 * 2. renderDynamicAttacks: 会心時のダメージ計算を修正 + 未設定時は"--"表示
 * 3. ダメージ計算式にATK上昇率(atkCritMod_local)を反映
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'dokkan_calc_final.js');
console.log('Reading file...');
let content = fs.readFileSync(filePath, 'utf8');
let changeCount = 0;

// ============================================================
// PATCH 1: calculateNewDurability の会心ロジック修正
// ============================================================
const oldCalcCrit = `      // 6. Handle Critical Hit logic
      let atk_crit_mod = 1.0;
      let def_crit_mod = 1.0;
      if (is_critical) {
        // ATK/DEF modifiers apply regardless of guard.
        atk_crit_mod = 1 + ((parseFloat(crit_atk_up) || 0) / 100);
        def_crit_mod = 1 - ((parseFloat(crit_def_down) || 0) / 100);

        // Attribute/Guard neutralization only happens if NOT guarded.
        if (!is_guard) {
          attr_mod = 1.0; // Overrides attribute affinity to neutral
          guard_mod = 1.0; // Nullifies guard from type advantage
          // Re-apply attr_def_up if player has type advantage
          if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
            attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
          }
        }
      }`;

const newCalcCrit = `      // 6. Handle Critical Hit logic
      let atk_crit_mod = 1.0;
      let def_crit_mod = 1.0;
      if (is_critical) {
        atk_crit_mod = 1 + ((parseFloat(crit_atk_up) || 0) / 100);
        def_crit_mod = 1 - ((parseFloat(crit_def_down) || 0) / 100);

        if (is_guard) {
          // 全ガあり: 属性相性は0.8ベース、ガード補正(0.5)は常時発動
          attr_mod = 0.8;
          guard_mod = 0.5;
          if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
            attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
          }
        } else {
          // 全ガなし: 属性相性は1.0(中立)、ガード無効
          attr_mod = 1.0;
          guard_mod = 1.0;
          if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
            attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
          }
        }
      }`;

if (content.includes(oldCalcCrit)) {
    content = content.replace(oldCalcCrit, newCalcCrit);
    changeCount++;
    console.log('PATCH 1 OK: calculateNewDurability の会心ロジック修正完了');
} else {
    console.error('PATCH 1 FAIL: calculateNewDurability の対象コードが見つかりません');
}

// ============================================================
// PATCH 2: renderDynamicAttacks 内の会心ダメージ計算修正
// ============================================================
const oldRenderCrit = `                if (atk.isCrit) {
                  const e_def_down = d.critDefDown || 0;
                  attrMod_local = 1.9;
                  defForCalc = final_def * (1 - (e_def_down / 100));

                  if (!is_guard) {
                    guardMod_local = 1.0;
                  }
                }

                const dmg = Math.max(0, ((atk.value * 1.0) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;`;

const newRenderCrit = `                if (atk.isCrit) {
                  const critAtkUpVal = d.critAtkUp || 0;
                  const critDefDownVal = d.critDefDown || 0;
                  const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);

                  if (isCritUnconfigured) {
                    // 会心条件が未設定 → "--" 表示してスキップ
                    html += '<div class="multi-attack-result-item" style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                      '<span class="attack-name" style="font-weight:bold;">' + atk.name + ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span></span>' +
                      '<span style="font-size:0.85rem;color:var(--secondary-color);">ATK: ' + formatNumber(atk.value) + '</span>' +
                      '</div>' +
                      '<div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">⚠️ 条件が設定されていません。</div>' +
                      '<div style="text-align:right;font-size:1.1rem;font-weight:bold;color:var(--secondary-color);">被ダメ: --</div>' +
                      '</div>';
                    return;
                  }

                  // 会心条件が設定済み: ATK上昇率・DEF減少率を適用
                  atkCritMod_local = 1 + (critAtkUpVal / 100);
                  defForCalc = final_def * (1 - (critDefDownVal / 100));

                  if (is_guard) {
                    // 全ガあり: 属性相性は0.8ベース、ガード(0.5)常時発動
                    attrMod_local = 0.8;
                    guardMod_local = 0.5;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  } else {
                    // 全ガなし: 属性相性は1.0(中立)、ガード無効
                    attrMod_local = 1.0;
                    guardMod_local = 1.0;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  }
                }

                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;`;

if (content.includes(oldRenderCrit)) {
    content = content.replace(oldRenderCrit, newRenderCrit);
    changeCount++;
    console.log('PATCH 2 OK: renderDynamicAttacks 内の会心ダメージ計算修正完了');
} else {
    console.error('PATCH 2 FAIL: renderDynamicAttacks の対象コードが見つかりません');
}

// ============================================================
// 書き込み
// ============================================================
if (changeCount === 2) {
    console.log(`\n全 ${changeCount} 件のパッチを適用中...`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('ファイル書き込み完了！');
} else {
    console.error(`\n一部のパッチが失敗しました (${changeCount}/2)。ファイルは書き込みません。`);
    process.exit(1);
}
