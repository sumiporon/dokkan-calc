const fs = require('fs');
try {
    const content = fs.readFileSync('dokkan_calc_final.js', 'utf8');
    const criticalIdx = content.indexOf('is_critical');
    let result = 'NOT FOUND';
    if (criticalIdx !== -1) {
        result = content.substring(Math.max(0, criticalIdx - 300), criticalIdx + 300);
    }
    fs.writeFileSync('temp_crit_res.txt', result, 'utf8');
} catch (e) {
    fs.writeFileSync('temp_crit_res.txt', e.toString(), 'utf8');
}
