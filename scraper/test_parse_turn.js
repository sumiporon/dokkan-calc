// parse-cached.js の実行をシミュレートして特定の敵データをパースする簡易テスト

// 2. parse-cached.js の読み込み（今回は独自の抽出ロジックのみをテスト）
function parseEnemyDataText(text, enemyName = 'Test') {
    let result = { enemies: [] };

    // ここから parse-cached.js のロジックの抜粋
    const turnMatch = text.match(/(?:(\d+)ターン目以降、)?ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/);
    const turnAtkUpStartTurn = turnMatch && turnMatch[1] ? parseInt(turnMatch[1], 10) : 1;
    const turnAtkUp = turnMatch ? parseInt(turnMatch[2], 10) : 0;
    const turnAtkMax = turnMatch ? parseInt(turnMatch[3], 10) : 0;

    result.enemies.push({
        name: enemyName,
        turnAtkUpStartTurn, turnAtkUp, turnAtkMax,
    });

    return result;
}

const testText1 = "4ターン目以降、ターン経過ごとにATK200%UP(最大600%)";
const parsed1 = parseEnemyDataText(testText1, "セルマックス");
console.log("Parsed 1:", parsed1.enemies[0]);

const testText2 = "ターン経過ごとにATK10%UP(最大50%)";
const parsed2 = parseEnemyDataText(testText2, "通常キャラ");
console.log("Parsed 2:", parsed2.enemies[0]);
