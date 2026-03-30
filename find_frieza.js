const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scraper/all_enemies_backup.json', 'utf8'));

data.forEach(et => {
    if (et.eventType.includes('レッドゾーン')) {
        et.series.forEach(se => {
            se.stages.forEach(st => {
                st.bosses.forEach(b => {
                    if(b.name.includes('フリーザ') || b.name.includes('フルパワー')) {
                        console.log(se.seriesName, '||', st.stageName, '||', b.name);
                        console.log(JSON.stringify(b, null, 2));
                    }
                })
            })
        })
    }
});
