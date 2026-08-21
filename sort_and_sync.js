const fs = require('fs');

try {
    // 1. JSONファイルを読み込む
    const dataPath = 'scraper/all_enemies.json';
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    // 2. 「究極のレッドゾーン」「至上のバトルスペクタクル」を削除
    data = data.filter(d => 
        d.eventType !== '究極のレッドゾーン' && 
        d.eventType !== '至上のバトルスペクタクル'
    );

    // 3. 「レッドゾーン」「バトルスペクタクル」を抜き出す
    let redZone = null;
    let battleSpec = null;
    let others = [];

    for (const d of data) {
        if (d.eventType === 'レッドゾーン') {
            redZone = d;
        } else if (d.eventType === 'バトルスペクタクル') {
            battleSpec = d;
        } else {
            others.push(d);
        }
    }

    // 4. 残りを「逆順」にする
    others.reverse();

    // 5. 新しい順番で配列を作る（1.レッドゾーン 2.バトスペ 3.その他の逆順）
    let finalData = [];
    if (redZone) finalData.push(redZone);
    if (battleSpec) finalData.push(battleSpec);
    finalData = finalData.concat(others);

    // 6. JSONを上書き保存
    fs.writeFileSync(dataPath, JSON.stringify(finalData, null, 2));
    console.log('JSON sorted and saved!');

    // 7. update-preset.js を実行してJSに書き込み
    require('child_process').execSync('node scraper/update-preset.js', {stdio: 'inherit'});
    
    // 8. 魔法のフォルダにコピー（文字化け対策済み）
    const srcDir = 'c:/Users/kou20/Downloads/dokkan-calc-main';
    const dstDir = 'C:/Users/kou20/OneDrive - 甲南大学/ドキュメント/GitHub/dokkan-calc';
    fs.copyFileSync(srcDir + '/dokkan_calc_final.js', dstDir + '/dokkan_calc_final.js');
    console.log('dokkan_calc_final.js copied!');
    if (!fs.existsSync(dstDir + '/src')) {
        fs.mkdirSync(dstDir + '/src', { recursive: true });
    }
    fs.copyFileSync(srcDir + '/src/calculation-core.js', dstDir + '/src/calculation-core.js');
    console.log('src/calculation-core.js copied!');
    fs.copyFileSync(srcDir + '/scraper/all_enemies.json', dstDir + '/scraper/all_enemies.json');
    console.log('all_enemies.json copied!');
    
    console.log('ALL TASKS COMPLETED SUCCESSFULLY!');

} catch (e) {
    console.error('ERROR:', e);
}
