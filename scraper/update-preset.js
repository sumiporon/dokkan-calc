const fs = require('fs');
const path = require('path');

const jsFile = path.join(__dirname, '..', 'dokkan_calc_final.js');
const jsonFile = path.join(__dirname, 'all_enemies.json');

console.log('Reading JS file...');
let jsContent = fs.readFileSync(jsFile, 'utf-8');

console.log('Reading JSON file...');
const jsonData = fs.readFileSync(jsonFile, 'utf-8');

// The replacement logic:
console.log('Replacing preset array...');
const regex = /const DEFAULT_ENEMIES_PRESET = \[[\s\S]*?\];\s*\n\s*const previewOverlay/;
if (jsContent.match(regex)) {
    jsContent = jsContent.replace(regex, `const DEFAULT_ENEMIES_PRESET = ${jsonData};\n\n        const previewOverlay`);

    console.log('Writing updated JS file...');
    fs.writeFileSync(jsFile, jsContent, 'utf-8');
    console.log('DONE!');
} else {
    console.error('Could not find the target regex in dokkan_calc_final.js!');
    process.exit(1);
}
