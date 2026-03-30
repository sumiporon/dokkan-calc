const fs = require('fs');

try {
    const s2 = fs.readFileSync('dokkan_calc_final.js', 'utf8');
    console.log('dokkan_calc_final.js:');
    console.log('- 究極のレッドゾーン:', s2.includes('究極のレッドゾーン'));
    console.log('- レッドゾーン:', s2.includes('レッドゾーン'));
    console.log('- 至上のバトルスペクタクル:', s2.includes('至上のバトルスペクタクル'));
    console.log('- バトルスペクタクル:', s2.includes('バトルスペクタクル'));

    // Check if the data is actually in there (maybe it's truncated or encoded differently?)
    console.log('- Length:', s2.length);
    console.log('- Starts with:', s2.substring(0, 50));

} catch (e) {
    console.error(e);
}
