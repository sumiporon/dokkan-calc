const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'html_cache');
const files = fs.readdirSync(dir).filter(f => f.startsWith('stage_') && f.endsWith('.html'));
files.forEach(f => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /[^>]{0,60}会心[^<]{0,60}/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const txt = m[0].trim();
        if (txt.length > 3) console.log(f.replace('.html', '') + ': ' + txt);
    }
});
