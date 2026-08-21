#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditEnemyData,
  extractEmbeddedEnemyPreset,
  formatEnemyDataAudit
} from '../tests/helpers/enemy-data-audit.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(repositoryRoot, 'scraper', 'all_enemies.json');
const appPath = resolve(repositoryRoot, 'dokkan_calc_final.js');

try {
  const [dataText, appSource] = await Promise.all([
    readFile(dataPath, 'utf8'),
    readFile(appPath, 'utf8')
  ]);
  const data = JSON.parse(dataText);
  const report = auditEnemyData(data);

  if (resolve(dataPath) === resolve(repositoryRoot, 'scraper', 'all_enemies.json')) {
    const embedded = extractEmbeddedEnemyPreset(appSource);
    if (JSON.stringify(embedded) !== JSON.stringify(data)) {
      report.errors.push({
        code: 'EMBEDDED_PRESET_MISMATCH',
        path: '$',
        message: 'scraper/all_enemies.json と dokkan_calc_final.js の埋め込みプリセットが一致しません。'
      });
    }
  }

  console.log(formatEnemyDataAudit(report));
  if (report.errors.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(`敵データ監査を実行できませんでした: ${error.message}`);
  process.exitCode = 1;
}
