/**
 * パッチv2: 会心ダメージ計算のバグ修正（デバッグ用ログ付き）
 * 
 * 修正内容:
 * 1. renderDynamicAttacks内の会心ダメージ計算を再修正
 *    - is_critical（チェックボックス）経由の場合も適切に処理
 *    - 未設定(critAtkUp=0 && critDefDown=0)の場合の "--" 表示を確実にする
 * 2. 非会心攻撃のダメージ計算式を元に戻す (atkCritMod_local=1.0)
 */
const fs = require('fs');
const path = require('path');

const tempDir = 'C:\\Temp';
const fileName = 'dokkan_calc_final.js';
const srcFile = path.join(__dirname, fileName);
const tempFile = path.join(tempDir, fileName);

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

console.log('1. C:\\Temp にコピー中...');
fs.copyFileSync(srcFile, tempFile);
console.log('   完了');

console.log('2. 読み込み中...');
let content = fs.readFileSync(tempFile, 'utf8');
let changeCount = 0;

// ============================================================
// PATCH: renderDynamicAttacks 内の会心ダメージ計算を修正
// (前回のパッチ結果を上書き)
// ============================================================
const oldCode = `                if (atk.isCrit) {
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
                      '<div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">\\u26a0\\ufe0f 条件が設定されていません。</div>' +
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

                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
                const is_this_attack_crit = atk.isCrit || is_critical;`;

const newCode = `                // 会心判定: atk.isCrit (必殺[会心]行) または is_critical (シナリオ全体の会心チェック)
                const is_this_attack_crit = atk.isCrit || is_critical;

                if (is_this_attack_crit) {
                  const critAtkUpVal = d.critAtkUp || 0;
                  const critDefDownVal = d.critDefDown || 0;
                  const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);

                  if (isCritUnconfigured) {
                    // 会心条件が未設定 → "--" 表示してスキップ
                    const critLabel = atk.name.includes('会心') ? '' : ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>';
                    html += '<div class="multi-attack-result-item" style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                      '<span class="attack-name" style="font-weight:bold;">' + atk.name + critLabel + '</span>' +
                      '<span style="font-size:0.85rem;color:var(--secondary-color);">ATK: ' + formatNumber(atk.value) + '</span>' +
                      '</div>' +
                      '<div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">\u26a0\ufe0f 条件が設定されていません。</div>' +
                      '<div style="text-align:right;font-size:1.1rem;font-weight:bold;color:var(--secondary-color);">被ダメ: --</div>' +
                      '</div>';
                    return;
                  }

                  // 会心条件が設定済み: ATK上昇率・DEF減少率を適用
                  atkCritMod_local = 1 + (critAtkUpVal / 100);
                  defForCalc = final_def * (1 - (critDefDownVal / 100));

                  if (is_guard) {
                    attrMod_local = 0.8;
                    guardMod_local = 0.5;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  } else {
                    attrMod_local = 1.0;
                    guardMod_local = 1.0;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  }
                }

                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    changeCount++;
    console.log('   PATCH OK: renderDynamicAttacks 内の会心ロジック修正完了');
} else {
    console.error('   PATCH FAIL: 対象コードが見つかりません');
    // デバッグ用: 検索キーを分割して確認
    const lines = oldCode.split('\n');
    lines.forEach((line, i) => {
        if (line.trim() && !content.includes(line)) {
            console.error(`   行 ${i + 1} が不一致: "${line.substring(0, 80)}..."`);
        }
    });
}

// ============================================================
// 書き込み & コピーバック
// ============================================================
if (changeCount === 1) {
    console.log('\n3. Tempファイルに書き込み中...');
    fs.writeFileSync(tempFile, content, 'utf8');
    console.log('   完了');

    console.log('4. 元ファイルにコピーバック...');
    fs.copyFileSync(tempFile, srcFile);
    console.log('   完了');

    fs.unlinkSync(tempFile);
    console.log('\n全パッチ適用成功！ブラウザをCtrl+Shift+Rでハードリフレッシュしてください。');
} else {
    console.error('\nパッチ失敗。ファイルは変更されていません。');
    process.exit(1);
}
