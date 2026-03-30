const fs = require('fs');

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Find the target objects
    let redZone = data.find(d => d.eventType === 'レッドゾーン');
    let battleSpec = data.find(d => d.eventType === 'バトルスペクタクル');
    let oldRedZone = data.find(d => d.eventType === '究極のレッドゾーン');
    let oldBattleSpec = data.find(d => d.eventType === '至上のバトルスペクタクル');

    // Create them if they don't exist
    if (!redZone) { redZone = { eventType: 'レッドゾーン', series: [] }; data.push(redZone); }
    if (!battleSpec) { battleSpec = { eventType: 'バトルスペクタクル', series: [] }; data.push(battleSpec); }

    // Merge old into new
    if (oldRedZone) {
        redZone.series.push(...oldRedZone.series);
    }
    if (oldBattleSpec) {
        battleSpec.series.push(...oldBattleSpec.series);
    }

    // Filter out the four specific ones from the main array so we have the "rest"
    let rest = data.filter(d => 
        d.eventType !== 'レッドゾーン' && 
        d.eventType !== 'バトルスペクタクル' && 
        d.eventType !== '究極のレッドゾーン' && 
        d.eventType !== '至上のバトルスペクタクル'
    );

    // Reverse the rest
    rest.reverse();

    // Construct final array
    let finalData = [redZone, battleSpec, ...rest];

    fs.writeFileSync(filePath, JSON.stringify(finalData, null, 2), 'utf8');
    console.log('Processed:', filePath);
}

processFile('scraper/all_enemies.json');
processFile('all_enemies.json');
