const fs = require('fs');
const data = require('./scraper/all_enemies.json');
let matches = [];
data.forEach(et => {
  et.series.forEach(se => {
    se.stages.forEach(st => {
      st.bosses.forEach(b => {
        if (b.name.includes('セルマックス') || b.name.includes('キャベ') || b.name.includes('悟飯')) {
          matches.push(`[${et.eventType}] [${se.seriesName}] [${st.stageName}] ${b.name}`);
        }
      });
    });
  });
});
fs.writeFileSync('temp_matches.txt', matches.join('\n'));
console.log('Done mapping.');
