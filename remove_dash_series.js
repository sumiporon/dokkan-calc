const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scraper/all_enemies.json', 'utf8'));

// Inside レッドゾーン and バトルスペクタクル, remove the "-" series
// since those are duplicates from the old 究極のレッドゾーン / 至上のバトルスペクタクル
const eventsToClean = ['レッドゾーン', 'バトルスペクタクル'];

data.forEach(et => {
    if (eventsToClean.includes(et.eventType)) {
        const before = et.series.length;
        // Keep only series that are NOT "-"
        et.series = et.series.filter(s => s.seriesName !== '-');
        console.log(`${et.eventType}: ${before} -> ${et.series.length} series`);
    }
});

fs.writeFileSync('scraper/all_enemies.json', JSON.stringify(data, null, 2), 'utf8');
console.log('Done removing dash series duplicates.');
