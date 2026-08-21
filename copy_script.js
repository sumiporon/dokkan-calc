const fs = require('fs');
const path = require('path');
const srcDir = 'c:/Users/kou20/Downloads/dokkan-calc-main';
const dstDir = 'C:/Users/kou20/OneDrive - 甲南大学/ドキュメント/GitHub/dokkan-calc';

try {
    fs.copyFileSync(srcDir + '/dokkan_calc_final.js', dstDir + '/dokkan_calc_final.js');
    console.log('dokkan_calc_final.js copied');
    
    fs.copyFileSync(srcDir + '/dokkan_calc_final.html', dstDir + '/dokkan_calc_final.html');
    console.log('dokkan_calc_final.html copied');

    if (!fs.existsSync(dstDir + '/src')) {
        fs.mkdirSync(dstDir + '/src', { recursive: true });
    }
    fs.copyFileSync(srcDir + '/src/calculation-core.js', dstDir + '/src/calculation-core.js');
    console.log('src/calculation-core.js copied');
    
    if (!fs.existsSync(dstDir + '/scraper')) {
        fs.mkdirSync(dstDir + '/scraper');
    }
    fs.copyFileSync(srcDir + '/scraper/all_enemies.json', dstDir + '/scraper/all_enemies.json');
    console.log('all_enemies.json copied');

    // 拡張機能フォルダもコピー
    const extSrc = path.join(srcDir, 'chrome_extension');
    const extDst = path.join(dstDir, 'chrome_extension');
    
    function copyDir(src, dest) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      let entries = fs.readdirSync(src, { withFileTypes: true });

      for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);

        entry.isDirectory() ? copyDir(srcPath, destPath) : fs.copyFileSync(srcPath, destPath);
      }
    }
    copyDir(extSrc, extDst);
    console.log('chrome_extension folder copied');
    
    console.log('ALL SUCCESS!');
} catch (e) {
    console.error('ERROR:', e.message);
}
