const fs = require('fs');

const raw = fs.readFileSync('./all_enemies.json', 'utf8');
const data = JSON.parse(raw);

const lines = [];
let count = 0;

for (const event of data) {
    for (const stage of (event.stages || [])) {
        for (const boss of (stage.bosses || [])) {
            const hasCrit = (boss.critHpRate > 0) || (boss.critTurnUp > 0) || (boss.critFixedRate > 0) || (boss.hasSaCrit === true);
            if (hasCrit) {
                count++;
                let crit = [];
                if (boss.critHpRate > 0) crit.push(`HP${boss.critHpThreshold}%以下→会心${boss.critHpRate}%UP`);
                if (boss.critTurnUp > 0) crit.push(`ターン経過ごとに会心${boss.critTurnUp}%UP(最大${boss.critTurnMax}%)`);
                if (boss.critFixedRate > 0) crit.push(`固定会心${boss.critFixedRate}%UP`);
                if (boss.hasSaCrit) crit.push(`必殺技時に会心`);

                lines.push(`[${event.eventType}] ${event.seriesName} / ${stage.stageName}`);
                lines.push(`  敵名: ${boss.name}  (${boss.class || '?'} / ${boss.type || '?'})`);
                lines.push(`  会心: ${crit.join(' | ')}`);
                lines.push('');
            }
        }
    }
}

lines.unshift(`会心を持つ敵: ${count}体\n`);
fs.writeFileSync('./crit_enemies_list.txt', lines.join('\n'), 'utf8');
console.log(`完了: ${count}体 → crit_enemies_list.txt に保存`);
