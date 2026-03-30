const fs = require('fs');

function applyCustomOverrides(db) {
  db.forEach(et => {
    if (et.eventType === 'レッドゾーン') {
      et.series.forEach(se => {
        if (se.seriesName === '人工生命体編') {
          se.stages.forEach(st => {
            if (st.stageName === 'VSセルマックス') {
              st.bosses.forEach(b => {
                if (b.name === 'セルマックス') {
                  b.critAtkUp = 30;
                  b.critDefDown = 70;
                }
              });
            }
          });
        }
        if (se.seriesName === '純粋サイヤ人編') {
          se.stages.forEach(st => {
            if (st.stageName === 'VS キャベ') {
              st.bosses.forEach(b => {
                if (b.name === '超サイヤ人2キャベ') {
                  b.critAtkUp = 100;
                  b.critDefDown = 50;
                }
              });
            }
          });
        }
      });
    }
    
    if (et.eventType === 'バトルスペクタクル') {
      et.series.forEach(se => {
        if (se.seriesName === '次世代のサイヤ人編') {
          se.stages.forEach(st => {
            if (st.stageName === 'VS孫悟飯&孫悟天&トランクス2') {
              st.bosses.forEach(b => {
                if (b.name.includes('悟飯')) {
                  b.critAtkUp = 50;
                  b.critDefDown = 70;
                }
              });
            }
          });
        }
      });
    }
  });
}

// 1. Update the existing all_enemies.json
const jsonPath = 'scraper/all_enemies.json';
if (fs.existsSync(jsonPath)) {
  const db = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  applyCustomOverrides(db);
  fs.writeFileSync(jsonPath, JSON.stringify(db, null, 2), 'utf8');
  console.log('Updated all_enemies.json with custom crit overrides.');
}

// 2. Patch scrape-all-events.js to always apply this in the future
const jsPath = 'scraper/scrape-all-events.js';
if (fs.existsSync(jsPath)) {
  let js = fs.readFileSync(jsPath, 'utf8');
  
  const overrideFuncStr = `
function applyCustomCritOverrides(output) {
    output.forEach(et => {
        if (et.eventType === 'レッドゾーン') {
            et.series.forEach(se => {
                if (se.seriesName === '人工生命体編') {
                    se.stages.forEach(st => {
                        if (st.stageName === 'VSセルマックス') {
                            st.bosses.forEach(b => {
                                if (b.name === 'セルマックス') {
                                    b.critAtkUp = 30;
                                    b.critDefDown = 70;
                                }
                            });
                        }
                    });
                }
                if (se.seriesName === '純粋サイヤ人編') {
                    se.stages.forEach(st => {
                        if (st.stageName === 'VS キャベ') {
                            st.bosses.forEach(b => {
                                if (b.name === '超サイヤ人2キャベ') {
                                    b.critAtkUp = 100;
                                    b.critDefDown = 50;
                                }
                            });
                        }
                    });
                }
            });
        }
        
        if (et.eventType === 'バトルスペクタクル') {
            et.series.forEach(se => {
                if (se.seriesName === '次世代のサイヤ人編') {
                    se.stages.forEach(st => {
                        if (st.stageName === 'VS孫悟飯&孫悟天&トランクス2') {
                            st.bosses.forEach(b => {
                                if (b.name.includes('悟飯')) {
                                    b.critAtkUp = 50;
                                    b.critDefDown = 70;
                                }
                            });
                        }
                    });
                }
            });
        }
    });
}
`;

  // Insert the function if it doesn't exist
  if (!js.includes('applyCustomCritOverrides')) {
    js = js.replace('function buildOutput(eventMap) {', overrideFuncStr + '\nfunction buildOutput(eventMap) {');
    
    // Call the function before returning the final output array
    js = js.replace('return [redZone, battleSpec, ...rest];', 'const finalOut = [redZone, battleSpec, ...rest];\n    applyCustomCritOverrides(finalOut);\n    return finalOut;');
    
    fs.writeFileSync(jsPath, js, 'utf8');
    console.log('Patched scrape-all-events.js with custom crit overrides.');
  } else {
    console.log('scrape-all-events.js is already patched.');
  }
}
