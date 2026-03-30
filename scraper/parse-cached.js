/**
 * DokkanInfo オフライン解析スクリプト
 * 
 * download-pages.js で保存済みのHTMLファイルを読み込み、
 * 敵データを抽出して all_enemies.json を生成する。
 * ネットワークアクセス不要で、何度でも高速に再実行可能。
 * 
 * 使い方:
 *   node parse-cached.js
 * 
 * 前提: html_cache/ フォルダに download-pages.js の出力が存在すること
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CACHE_DIR = path.join(__dirname, 'html_cache');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');

/**
 * イベントタイトルからeventTypeとseriesNameを分類
 */
function classifyEvent(title) {
    const rzMatch = title.match(/究極のレッドゾーン\s*(.*)/);
    if (rzMatch) {
        const sub = rzMatch[1].trim();
        return { eventType: 'レッドゾーン', seriesName: sub || '-' };
    }

    const bsMatch = title.match(/至上のバトルスペクタクル\s*(.*)/);
    if (bsMatch) {
        const sub = bsMatch[1].trim();
        return { eventType: 'バトルスペクタクル', seriesName: sub || '-' };
    }

    return { eventType: title, seriesName: '-' };
}

/**
 * HTMLファイルからボスデータを抽出
 */
function parseStagePage(htmlContent, filePath) {
    const $ = cheerio.load(htmlContent);

    const result = {
        stageName: '',
        enemies: []
    };

    // ステージ名をタイトルから取得
    const titleText = $('title').text();
    result.stageName = titleText.split('|')[0].trim();

    /**
     * テキストからステータスを解析してenemiesにpush
     */
    function parseStats(text, cls, type, enemyName) {
        // パースしやすくするため、全ての改行とスペースを除去する（全角スペースも含む）
        text = text.replace(/\s+/g, '');

        const atkMatch = text.match(/ATK[:]*([0-9,]+)/i);
        const atk = atkMatch ? parseInt(atkMatch[1].replace(/,/g, ''), 10) : 0;

        const saMatch = text.match(/ダメージ[:]*([0-9,]+)/);
        const saDamage = saMatch ? parseInt(saMatch[1].replace(/,/g, ''), 10) : 0;

        const aoeMatch = text.match(/エリアダメージ[^\d]*?([0-9,]{4,})/);
        const aoeDamage = aoeMatch ? parseInt(aoeMatch[1].replace(/,/g, ''), 10) : 0;

        let saBuffModifier = 0.0;
        if (text.match(/ATKが大幅に上昇/) || text.match(/ATKとDEFが大幅上昇/) || text.match(/1ターンATK.*大幅.*上昇/)) {
            saBuffModifier = 0.5;
        } else if (text.match(/ATKが上昇/) || text.match(/1ターンATK.*(?<!大幅)上昇/)) {
            saBuffModifier = 0.3;
        }

        const turnMatch = text.match(/(?:(\d+)ターン目以降、)?ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/);
        const turnAtkUpStartTurn = turnMatch && turnMatch[1] ? parseInt(turnMatch[1], 10) : 1;
        const turnAtkUp = turnMatch ? parseInt(turnMatch[2], 10) : 0;
        const turnAtkMax = turnMatch ? parseInt(turnMatch[3], 10) : 0;

        const hitMatch = text.match(/(?:攻撃されるたびに|攻撃を受けるたび)ATK(\d+)%UP\(最大(\d+)%\)/);
        const hitAtkUp = hitMatch ? parseInt(hitMatch[1], 10) : 0;
        const hitAtkMax = hitMatch ? parseInt(hitMatch[2], 10) : 0;

        const hpMatch = text.match(/HP(\d+)%以下でATK(\d+)%UP/);
        const hpAtkThreshold = hpMatch ? parseInt(hpMatch[1], 10) : 0;
        const hpAtkUp = hpMatch ? parseInt(hpMatch[2], 10) : 0;

        // 複数の「登場からXターン目にATK Y%UP」を全て取得
        const appearEntries = [];
        const appearRegex = /登場から(\d+)ターン目にATK(\d+)%UP/g;
        let appearMatch;
        while ((appearMatch = appearRegex.exec(text)) !== null) {
            appearEntries.push({
                turn: parseInt(appearMatch[1], 10),
                atkUp: parseInt(appearMatch[2], 10)
            });
        }

        // 会心（HP条件付き）: HP50%以下で会心発動率30%UP
        const critHpMatch = text.match(/HP(\d+)%以下で会心発動率(\d+)%UP/);
        const critHpThreshold = critHpMatch ? parseInt(critHpMatch[1], 10) : 0;
        const critHpRate = critHpMatch ? parseInt(critHpMatch[2], 10) : 0;

        // 会心（ターン経過）: ターン経過ごとに会心発動率20%UP(最大100%)
        const critTurnMatch = text.match(/ターン経過ごとに会心発動率(\d+)%UP\(最大(\d+)%\)/);
        const critTurnUp = critTurnMatch ? parseInt(critTurnMatch[1], 10) : 0;
        const critTurnMax = critTurnMatch ? parseInt(critTurnMatch[2], 10) : 0;

        // 会心（固定）: 会心発動率XX%UP（条件なし）
        let critFixedRate = 0;
        if (!critHpMatch && !critTurnMatch) {
            const critFixedMatch = text.match(/会心発動率(\d+)%UP/);
            critFixedRate = critFixedMatch ? parseInt(critFixedMatch[1], 10) : 0;
        }

        // 会心（必殺技発動時、攻撃時を含めて幅広く会心を判定する）
        const hasSaCrit = /(会心が発動|会心発動|必ず会心|高確率で会心)/.test(text);

        result.enemies.push({
            name: enemyName || result.stageName,
            class: cls,
            type,
            atk,
            saDamage,
            aoeDamage,
            saBuffModifier,
            turnAtkUpStartTurn, turnAtkUp, turnAtkMax,
            hitAtkUp, hitAtkMax,
            hpAtkThreshold, hpAtkUp,
            appearEntries,
            critHpThreshold, critHpRate,
            critTurnUp, critTurnMax,
            critFixedRate,
            hasSaCrit
        });
    }

    // 属性アイコンを起点にして、敵ごとのコンテナを探す
    const imgs = $('img[src*="cha_type_icon"]');
    const enemyContainers = new Set();

    imgs.each((i, img) => {
        const $img = $(img);
        let $row = $img.closest('.row.align-items-center');
        if ($row.length === 0) {
            $row = $img.closest('tr, .card');
        }
        if ($row.length > 0) {
            enemyContainers.add($row[0]);
        }
    });

    if (enemyContainers.size > 0) {
        for (const containerNode of enemyContainers) {
            const $row = $(containerNode);
            const rowText = $row.text();

            let cls = 'extreme', type = 'teq';
            const $img = $row.find('img[src*="cha_type_icon"]').first();
            if ($img.length > 0) {
                const match = ($img.attr('src') || '').match(/cha_type_icon_(\d+)/);
                if (match) {
                    const id = parseInt(match[1], 10);
                    const typeId = id % 10;
                    const classId = Math.floor(id / 10);
                    const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
                    if (classId === 1) cls = 'super';
                    else if (classId === 2) cls = 'extreme';
                    if (typeMap[typeId]) type = typeMap[typeId];
                }
            }

            let enemyName = '';
            const $nameEl = $row.find('.font-size-1_2 b').first();
            if ($nameEl.length > 0) {
                enemyName = $nameEl.text().trim();
            } else {
                const $bTags = $row.find('b');
                if ($bTags.length > 0) enemyName = $bTags.first().text().trim();
            }

            parseStats(rowText, cls, type, enemyName);
        }
    } else {
        // フォールバック：ページ全体から探す
        const bodyText = $('body').text();
        let cls = 'extreme', type = 'teq';
        if (imgs.length > 0) {
            const match = ($(imgs[0]).attr('src') || '').match(/cha_type_icon_(\d+)/);
            if (match) {
                const id = parseInt(match[1], 10);
                const typeId = id % 10;
                const classId = Math.floor(id / 10);
                const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
                if (classId === 1) cls = 'super';
                else if (classId === 2) cls = 'extreme';
                if (typeMap[typeId]) type = typeMap[typeId];
            }
        }
        let enemyName = '';
        const $h2 = $('.title_h2, h2, h3').first();
        if ($h2.length > 0) enemyName = $h2.text().trim();

        parseStats(bodyText, cls, type, enemyName);
    }

    return result;
}

/**
 * 生のenemyデータを攻撃パターン付きのbossデータに変換
 */
function buildBossData(enemy) {
    const attacks = [];
    let baseAtk = 0;
    let saMulti = 3;
    let saBuffMod = 0;
    let postSaNormalMulti = 1.0;

    if (enemy.atk > 0) {
        baseAtk = enemy.atk;
        const saDamage = enemy.saDamage || baseAtk * 3;
        saMulti = saDamage / baseAtk;
        saBuffMod = enemy.saBuffModifier || 0;
        const trueSaMulti = saMulti + saBuffMod;
        postSaNormalMulti = 1.0 + saBuffMod;
        const saName = enemy.hasSaCrit ? '必殺[会心]' : '必殺';

        // 基本攻撃パターンのみ
        attacks.push({ name: '通常', value: baseAtk });
        if (saBuffMod > 0) attacks.push({ name: '通常(必殺後)', value: Math.floor(baseAtk * postSaNormalMulti) });
        const saAttack = { name: saName, value: Math.floor(baseAtk * trueSaMulti) };
        if (enemy.hasSaCrit) saAttack.isCrit = true;
        attacks.push(saAttack);
        if (enemy.aoeDamage) {
            attacks.push({ name: '全体攻撃', value: enemy.aoeDamage });
        }
    }

    // 会心が存在するかどうか
    const hasCrit = (enemy.critHpRate > 0) || (enemy.critTurnUp > 0) || (enemy.critFixedRate > 0) || enemy.hasSaCrit;

    // 登場ターンのエントリを累積化して保存
    let appearEntries = [];
    if (enemy.appearEntries && enemy.appearEntries.length > 0) {
        const sorted = [...enemy.appearEntries].sort((a, b) => a.turn - b.turn);
        let cumulative = 0;
        appearEntries = sorted.map(e => {
            cumulative += e.atkUp;
            return { turn: e.turn, cumulativeAtkUp: cumulative };
        });
    }

    return {
        name: enemy.name,
        class: enemy.class,
        type: enemy.type,
        attacks,
        // 生バフデータ（UI側で動的計算用）
        baseAtk: baseAtk,
        saMulti: saMulti,
        saBuffMod: saBuffMod,
        aoeDamage: enemy.aoeDamage || 0,
        hasSaCrit: enemy.hasSaCrit || false,
        turnAtkUpStartTurn: enemy.turnAtkUpStartTurn || 1,
        turnAtkUp: enemy.turnAtkUp || 0,
        turnAtkMax: enemy.turnAtkMax || 0,
        hitAtkUp: enemy.hitAtkUp || 0,
        hitAtkMax: enemy.hitAtkMax || 0,
        hpAtkThreshold: enemy.hpAtkThreshold || 0,
        hpAtkUp: enemy.hpAtkUp || 0,
        appearEntries: appearEntries,
        // 会心データ
        critAtkUp: 0,
        critDefDown: 0,
        isCriticalDefault: hasCrit,
        critHpThreshold: enemy.critHpThreshold || 0,
        critHpRate: enemy.critHpRate || 0,
        critTurnUp: enemy.critTurnUp || 0,
        critTurnMax: enemy.critTurnMax || 0,
        critFixedRate: enemy.critFixedRate || 0
    };
}

/**
 * eventMapから4階層出力に変換
 */
function buildOutput(eventMap) {
    const output = [];
    for (const [eventType, seriesMap] of eventMap) {
        const series = [];
        for (const [seriesName, stages] of seriesMap) {
            series.push({ seriesName, stages });
        }
        output.push({ eventType, series });
    }
    return output;
}

/**
 * メイン処理
 */
function main() {
    console.log('=== DokkanInfo オフライン解析 ===\n');

    // index.json を読み込む
    if (!fs.existsSync(INDEX_FILE)) {
        console.error(`エラー: ${INDEX_FILE} が見つかりません。`);
        console.error('先に download-pages.js を実行してHTMLをダウンロードしてください。');
        process.exit(1);
    }

    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    console.log(`キャッシュ情報: ${index.downloadedAt}`);
    console.log(`${index.events.length} イベント\n`);

    const eventMap = new Map();

    let eventCount = 0;
    for (const event of index.events) {
        eventCount++;
        const { eventType, seriesName } = classifyEvent(event.title);

        console.log(`[${eventCount}/${index.events.length}] ${event.title}`);
        console.log(`  → ${eventType} / ${seriesName}`);

        const stages = [];
        for (const stage of event.stages) {
            const htmlPath = path.join(CACHE_DIR, stage.file);
            if (!fs.existsSync(htmlPath)) {
                console.log(`    ⚠ ファイル未検出: ${stage.file}`);
                continue;
            }

            const html = fs.readFileSync(htmlPath, 'utf-8');
            const rawData = parseStagePage(html, htmlPath);

            const bosses = rawData.enemies
                .map(enemy => buildBossData(enemy))
                .filter(b => b.attacks.length > 0);

            if (bosses.length > 0) {
                stages.push({ stageName: rawData.stageName, bosses });
                console.log(`    ${rawData.stageName}: ${bosses.map(b => b.name).join(', ')}`);
            }
        }

        if (stages.length > 0) {
            if (!eventMap.has(eventType)) {
                eventMap.set(eventType, new Map());
            }
            const seriesMap = eventMap.get(eventType);
            if (!seriesMap.has(seriesName)) {
                seriesMap.set(seriesName, []);
            }
            seriesMap.get(seriesName).push(...stages);
        }
    }

    // 最終出力
    const output = buildOutput(eventMap);
    const outputPath = path.join(__dirname, 'all_enemies.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    // 統計
    let totalSeries = 0, totalStages = 0, totalBosses = 0;
    for (const et of output) {
        totalSeries += et.series.length;
        for (const ser of et.series) {
            totalStages += ser.stages.length;
            for (const stg of ser.stages) {
                totalBosses += stg.bosses.length;
            }
        }
    }

    console.log(`\n=== 完了 ===`);
    console.log(`${output.length}種別, ${totalSeries}シリーズ, ${totalStages}ステージ, ${totalBosses}ボス`);
    console.log(`→ ${outputPath} に保存しました。`);
}

main();
