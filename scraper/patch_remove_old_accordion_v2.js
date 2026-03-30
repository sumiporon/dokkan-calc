/**
 * patch_remove_old_accordion_v2.js
 * 位置ベースで古いアコーディオンコードを除去する
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dokkan_calc_final.js');
console.log('Reading file...');
let content = fs.readFileSync(filePath, 'utf8');
console.log('File size:', content.length);

// renderDynamicAttacks() の位置を見つける
const marker = 'renderDynamicAttacks();\n          }';
const markerIdx = content.indexOf(marker);

if (markerIdx === -1) {
    console.error('FAILED: renderDynamicAttacks marker not found');
    process.exit(1);
}

const afterMarker = markerIdx + marker.length;
console.log('Found marker at index', markerIdx);

// マーカー直後から Object.keys(groupedAttacks) までを見つける
const oldStart = content.indexOf('Object.keys(groupedAttacks)', afterMarker);
if (oldStart === -1) {
    console.error('FAILED: groupedAttacks code not found after marker');
    process.exit(1);
}

// groupedAttacks ブロックの終わりを見つける
// "container.appendChild(groupDiv);\n            });\n          }" を探す
const oldEndMarker = 'container.appendChild(groupDiv);\n            });\n          }';
const oldEndIdx = content.indexOf(oldEndMarker, oldStart);
if (oldEndIdx === -1) {
    console.error('FAILED: end of groupedAttacks block not found');
    process.exit(1);
}

const deleteEnd = oldEndIdx + oldEndMarker.length;
const deletedText = content.substring(afterMarker, deleteEnd);
console.log('Removing', deleteEnd - afterMarker, 'characters of old code');
console.log('Preview of removed code (first 150 chars):', deletedText.substring(0, 150));

content = content.substring(0, afterMarker) + content.substring(deleteEnd);

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: 古いアコーディオンコードを除去しました');
console.log('New file size:', content.length);
