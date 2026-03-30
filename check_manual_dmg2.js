const fs = require('fs');
const txt = fs.readFileSync('dokkan_calc_final.js', 'utf8');
const start = txt.indexOf("} else {\\n          enemyAtkGroup.style.display = 'block';");
console.log(txt.slice(start, start + 2500));
