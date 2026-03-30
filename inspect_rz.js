const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scraper/all_enemies.json', 'utf8'));
const rz = data.find(d => d.eventType === 'レッドゾーン');
console.log('Series count:', rz.series.length);
rz.series.forEach((s, i) => {
    console.log(`  [${i}] "${s.seriesName}" -> stages: ${s.stages.map(st => st.stageName).join(', ')}`);
});
