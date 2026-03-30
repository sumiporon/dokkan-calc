const fs = require('fs');
let text = "";
try {
  text = fs.readFileSync('scraper/all_enemies.json', 'utf8');
} catch(e) {
  text = fs.readFileSync('all_enemies.json', 'utf8');
}

const data = JSON.parse(text);
let found = false;

data.forEach(et => {
  et.series.forEach(se => {
    se.stages.forEach(st => {
      st.bosses.forEach(b => {
        if(b.name.includes('フリーザ') && b.name.includes('フルパワー')) {
           console.log(`Found: ${et.eventType} > ${se.seriesName} > ${st.stageName} > ${b.name}`);
           console.log(`critAtkUp: ${b.critAtkUp}, critDefDown: ${b.critDefDown}`);
           found = true;
        }
      });
    });
  });
});

if(!found) console.log("Not found any Frieza with those conditions.");
