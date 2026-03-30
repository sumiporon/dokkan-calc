const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(targetFile, 'utf8');

// Use regex to find the specific block to replace
const regex = /const dynamicAttacks = \[\];\s*dynamicAttacks\.push\(\{ name: '通常', value: boostedAtk, isCrit: false \}\);\s*if \(d\.saBuffMod > 0\) dynamicAttacks\.push\(\{ name: '通常\(必殺後\)', value: Math\.floor\(boostedAtk \* postSaNormalMulti\), isCrit: false \}\);\s*dynamicAttacks\.push\(\{ name: d\.hasSaCrit \? '必殺\[会心\]' : '必殺', value: Math\.floor\(boostedAtk \* trueSaMulti\), isCrit: d\.hasSaCrit \}\);\s*if \(d\.aoeDamage > 0\) dynamicAttacks\.push\(\{ name: '全体攻撃', value: Math\.floor\(d\.aoeDamage \* atkMulti\), isCrit: false \}\);/g;

const replaceStr = `const dynamicAttacks = [];
              dynamicAttacks.push({ name: '通常', value: boostedAtk, isCrit: false });
              if (d.saBuffMod > 0) dynamicAttacks.push({ name: '通常(必殺後)', value: Math.floor(boostedAtk * postSaNormalMulti), isCrit: false });
              
              if (d.hasSaCrit) {
                // 確率会心などの要望に対応し、会心なしパターンと会心ありパターンの両方を表示
                dynamicAttacks.push({ name: '必殺', value: Math.floor(boostedAtk * trueSaMulti), isCrit: false });
                dynamicAttacks.push({ name: '必殺[会心]', value: Math.floor(boostedAtk * trueSaMulti), isCrit: true });
              } else {
                dynamicAttacks.push({ name: '必殺', value: Math.floor(boostedAtk * trueSaMulti), isCrit: false });
              }
              
              if (d.aoeDamage > 0) dynamicAttacks.push({ name: '全体攻撃', value: Math.floor(d.aoeDamage * atkMulti), isCrit: false });`;

if (regex.test(content)) {
    content = content.replace(regex, replaceStr);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('Successfully replaced dokkan_calc_final.js section using regex.');
} else {
    console.log('Target string not found with regex either!');

    // Debug: print out around the target area
    const idx = content.indexOf("const dynamicAttacks = [];");
    if (idx !== -1) {
        console.log(content.substring(idx, idx + 400));
    }
}
