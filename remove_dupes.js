const fs = require('fs');

const jsonPath = 'scraper/all_enemies.json';
let db = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Remove duplicate old categories (already contained in レッドゾーン / バトルスペクタクル)
db = db.filter(d =>
    d.eventType !== '究極のレッドゾーン' &&
    d.eventType !== '至上のバトルスペクタクル'
);

fs.writeFileSync(jsonPath, JSON.stringify(db, null, 2), 'utf8');
console.log('Removed duplicate categories. Remaining:', db.map(d => d.eventType));
