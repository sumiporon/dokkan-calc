const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(targetFile, 'utf8');

const targetStr = `                let attrMod_local = 1.0;
                let guardMod_local = (group1_advantage_status === 'advantage') ? 0.5 : 1.0;
                
                const is_same_class = own_class === enemy_class;
                if (is_same_class) {
                  if (group1_advantage_status === 'advantage') attrMod_local = 0.9;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.25;
                } else {
                  if (group1_advantage_status === 'advantage') attrMod_local = 1.0;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.5;
                  else attrMod_local = 1.15;
                }`;

const replaceStr = `                let attrMod_local = 1.0;
                let guardMod_local = (group1_advantage_status === 'advantage') ? 0.5 : 1.0;
                
                const o_class = scenarioData.own_class || 'super';
                const e_class = scenarioData.enemy_class || 'extreme';
                const is_same_class = o_class === e_class;
                if (is_same_class) {
                  if (group1_advantage_status === 'advantage') attrMod_local = 0.9;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.25;
                } else {
                  if (group1_advantage_status === 'advantage') attrMod_local = 1.0;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.5;
                  else attrMod_local = 1.15;
                }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('Successfully replaced dokkan_calc_final.js JS logic (fixed own_class variable ReferenceError).');
} else {
    console.log('Target string not found!');
}
