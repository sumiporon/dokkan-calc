const fs = require('fs');
const jsPath = 'dokkan_calc_final.js';
const js = fs.readFileSync(jsPath, 'utf-8');

const replacementContent = `    const handleClipboardImport = async () => {
      if (importStatusMsg) {
        importStatusMsg.textContent = '読み込み中...';
        importStatusMsg.style.color = 'var(--secondary-color)';
      }

      try {
        const text = await navigator.clipboard.readText();
        const data = JSON.parse(text);

        // Validate data source
        if (data.source !== 'dokkan-extension') {
          throw new Error('拡張機能のデータではありません');
        }

        if (data.multiple) {
          // 複数(イベント一括)インポートモード
          let addedCount = 0;
          let skippedCount = 0;

          data.eventList.forEach(importedEventType => {
            let eventTypeObj = savedEnemies.find(e => e.eventType === importedEventType.eventType);
            if (!eventTypeObj) {
              eventTypeObj = { eventType: importedEventType.eventType, series: [] };
              savedEnemies.push(eventTypeObj);
            }

            importedEventType.series.forEach(importedSeries => {
              let seriesObj = eventTypeObj.series.find(s => s.seriesName === importedSeries.seriesName);
              if (!seriesObj) {
                seriesObj = { seriesName: importedSeries.seriesName, stages: [] };
                eventTypeObj.series.push(seriesObj);
              }

              importedSeries.stages.forEach(importedStage => {
                let stageObj = seriesObj.stages.find(s => s.stageName === importedStage.stageName);
                if (!stageObj) {
                  stageObj = { stageName: importedStage.stageName, bosses: [] };
                  seriesObj.stages.push(stageObj);
                }

                importedStage.bosses.forEach(importedBoss => {
                  const existingBoss = stageObj.bosses.find(b => b.name === importedBoss.name);
                  if (existingBoss) {
                    skippedCount++;
                  } else {
                    stageObj.bosses.push(importedBoss);
                    addedCount++;
                  }
                });
              });
            });
          });

          // データを再描画して保存
          updateEnemiesList();
          saveState(false);

          if (importStatusMsg) {
            importStatusMsg.innerHTML = '✅ インポート成功!<br><small>新規追加: ' + addedCount + '件 / スキップ: ' + skippedCount + '件</small>';
            importStatusMsg.style.color = 'green';
            setTimeout(() => { importStatusMsg.innerHTML = ''; }, 6000);
          }
          console.log('[Dokkan Calc] Imported multiple enemies. Added: ' + addedCount + ', Skipped: ' + skippedCount);

        } else {
          // 従来(単体)インポートモード
          if (!data.enemy) {
            throw new Error('敵データが含まれていません');
          }
          const enemy = data.enemy;

          if (newEnemyNameInput && enemy.name) newEnemyNameInput.value = enemy.name;
          if (newEnemyClassSelect && enemy.class) newEnemyClassSelect.value = enemy.class;
          if (newEnemyTypeSelect && enemy.type) newEnemyTypeSelect.value = enemy.type;

          if (enemy.attacks && enemy.attacks.length > 0) {
            clearAttackPatternInputs();
            enemy.attacks.forEach(atk => {
              addAttackPatternRow(atk);
            });
          }

          if (importStatusMsg) {
            importStatusMsg.textContent = '✅ インポート成功!';
            importStatusMsg.style.color = 'green';
            setTimeout(() => { importStatusMsg.textContent = ''; }, 3000);
          }
          console.log('[Dokkan Calc] Imported single enemy from extension:', enemy);
        }

      } catch (err) {
        console.error('[Dokkan Calc] Import failed:', err);
        if (importStatusMsg) {
          if (err.name === 'NotAllowedError') {
            importStatusMsg.textContent = '❌ クリップボードの権限がありません';
          } else if (err instanceof SyntaxError) {
            importStatusMsg.textContent = '❌ 有効なデータがありません';
          } else {
            importStatusMsg.textContent = '❌ ' + err.message;
          }
          importStatusMsg.style.color = 'red';
          setTimeout(() => { importStatusMsg.textContent = ''; }, 5000);
        }
      }
    };\n\n    if (importClipboardBtn) {`;

const regex = /    const handleClipboardImport = async \(\) => \{[\s\S]*?    \};\r?\n\r?\n    if \(importClipboardBtn\) \{/m;

if(regex.test(js)) {
   fs.writeFileSync(jsPath, js.replace(regex, replacementContent), 'utf-8');
   fs.writeFileSync('test_replace.txt', 'SUCCESS');
   console.log('SUCCESS');
} else {
   fs.writeFileSync('test_replace.txt', 'NOT FOUND OR ALREADY REPLACED');
   console.log('NOT FOUND');
}
