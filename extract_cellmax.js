const fs = require('fs');
try {
    let output = '';
    const data = JSON.parse(fs.readFileSync('scraper/all_enemies.json', 'utf8'));
    for (const ev of data) {
        for (const ser of ev.series) {
            for (const st of ser.stages) {
                for (const b of st.bosses) {
                    if (b.name && b.name.includes('セルマックス')) {
                        const sa = b.attacks ? b.attacks.find(a => a.name.includes('必殺')) : null;
                        output += `Event: ${ev.eventType}, Stage: ${st.stageName}, Boss: ${b.name}, Type: ${b.type}, Base: ${b.baseAtk}, SA: ${sa ? sa.value : 'N/A'}\n`;
                    }
                }
            }
        }
    }
    fs.writeFileSync('cellmax_stats.txt', output);
    console.log('Successfully wrote stats.');
} catch (e) {
    console.error(e);
}
