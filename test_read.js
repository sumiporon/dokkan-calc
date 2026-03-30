const fs = require('fs');
const startTime = Date.now();
console.log('Reading dokkan_calc_final.js...');
try {
    const data = fs.readFileSync('dokkan_calc_final.js', 'utf8');
    console.log(`Read ${data.length} bytes in ${Date.now() - startTime}ms.`);
} catch (e) {
    console.error('Error:', e.message);
}
