import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { chromium, webkit } from 'playwright';

import { buildPhase8DevicePreview } from '../../scripts/build-phase8-device-preview.mjs';
import { createPhase8ReleaseArtifacts } from '../../scripts/generate-phase8-release-candidate.mjs';
import { startStaticServer } from '../helpers/static-server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RC_PATH = '/release-candidate/phase8/index.html';
const DEVICE_PREVIEW_URL = pathToFileURL(path.join(REPO_ROOT, 'release-candidate', 'phase8', 'device-preview.html')).href;
const SYSTEM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TEST_TIMEOUT = 90_000;
const LAST_EVENT_KEY = 'dokkan_phase8_rc_last_event_v1';
const RC_STORAGE_KEY = 'dokkan_phase8_rc_pages_state_v1';
const ONEDRIVE_STORAGE_KEY = 'dokkan_calc_data_v22';
const RETIRED_IMPORTED_STORAGE_KEY = 'dokkan_phase8_rc_imported_dokkan_calc_data_v22';
const PAT_STORAGE_KEY = 'dokkan_github_pat';
const PREVIOUS_MOBILE_LAYOUT = {
  360: { pageHeight: 2640, scenarioCardHeight: 1210, scenarioInputsHeight: 991 },
  390: { pageHeight: 2486, scenarioCardHeight: 1163, scenarioInputsHeight: 944 }
};
const BEFORE_MANAGEMENT_REMOVAL_LAYOUT = {
  360: { pageHeight: 1713 },
  390: { pageHeight: 1713 }
};
const IMMEDIATE_PREVIOUS_MOBILE_LAYOUT = {
  360: { pageHeight: 1462, scenarioCardHeight: 943, scenarioInputsHeight: 740 },
  390: { pageHeight: 1462, scenarioCardHeight: 943, scenarioInputsHeight: 740 }
};

let chromiumBrowser;
let webkitBrowser;
let staticServer;
let syntheticRuntime;

async function launchChromium() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, undefined, existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null]
    .filter((value, index, values) => value !== null && values.indexOf(value) === index);
  const failures = [];
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    } catch (error) {
      failures.push(`${executablePath ?? 'Playwright Chromium'}: ${error.message}`);
    }
  }
  throw new Error(failures.join('\n'));
}

function artifactsAsResponses(result) {
  return new Map([
    ['release-manifest.json', { text: result.manifestJson, contentType: 'application/json' }],
    [result.manifest.full.json.path, { text: result.fullJson, contentType: 'application/json' }],
    [result.manifest.chunked.indexJson.path, { text: result.indexJson, contentType: 'application/json' }],
    ...result.chunks.map((chunk) => [chunk.jsonArtifact.path, { text: chunk.eventJson, contentType: 'application/json' }])
  ]);
}

function newerRelease(version, generatedAt, mutate = () => {}) {
  const runtime = structuredClone(syntheticRuntime);
  runtime.datasetId = version;
  runtime.canonicalDatasetId = `phase8-synthetic-canonical:${version}`;
  runtime.generatedAt = generatedAt;
  mutate(runtime);
  return createPhase8ReleaseArtifacts(runtime);
}

function rcUrl(suffix = '') {
  const url = new URL(RC_PATH, staticServer.origin);
  url.searchParams.set('dbName', `phase8-browser-${crypto.randomUUID()}`);
  if (suffix) url.searchParams.set('case', suffix);
  return url.href;
}

async function openChecked(browser, url, options = {}) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: options.viewport ?? { width: 1440, height: 1000 }, ...options.context });
  const page = await context.newPage();
  const diagnostics = { console: [], page: [], failed: [] };
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.console.push(message.text()); });
  page.on('pageerror', (error) => diagnostics.page.push(error.message));
  page.on('requestfailed', (request) => diagnostics.failed.push(`${request.url()}: ${request.failure()?.errorText}`));
  return {
    context,
    page,
    diagnostics,
    async goto() {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction(() => globalThis.__phase8Ready === true, null, { timeout: 60_000 });
    },
    async close({ allowFailed = false } = {}) {
      await page.waitForTimeout(25).catch(() => {});
      assert.deepEqual(diagnostics.page, [], `page errors: ${JSON.stringify(diagnostics.page)}`);
      assert.deepEqual(diagnostics.console, [], `console errors: ${JSON.stringify(diagnostics.console)}`);
      if (!allowFailed) assert.deepEqual(diagnostics.failed, [], `failed requests: ${JSON.stringify(diagnostics.failed)}`);
      await context.close();
    }
  };
}

async function selectAndCalculate(page, eventId = 'preview:event:sky') {
  await page.locator('#mode-damage').check();
  await page.locator('#event-select').selectOption(eventId);
  await page.waitForFunction((id) => globalThis.Phase8RC.state.event?.id === id, eventId);
  assert.equal(await page.locator('#enemy-select').inputValue(), '');
  await page.locator('#enemy-select').selectOption({ index: 1 });
  await page.locator('#char-def').fill('500000');
  await page.waitForFunction(() => document.querySelector('#damage-result')?.textContent !== '敵を選択してください');
  assert.match(await page.locator('#damage-result').innerText(), /〜|0/);
  assert.equal(await page.locator('[data-role="perfect-defense"]').count(), 0);
  assert.equal(await page.locator('[data-role="calculate-button"]').count(), 0);
}

test.before(async () => {
  syntheticRuntime = JSON.parse(await readFile(path.join(REPO_ROOT, 'tests', 'fixtures', 'phase8', 'synthetic-runtime.json'), 'utf8'));
  await buildPhase8DevicePreview();
  staticServer = await startStaticServer();
  chromiumBrowser = await launchChromium();
  webkitBrowser = await webkit.launch({ headless: true });
});

test.after(async () => {
  await chromiumBrowser?.close();
  await webkitBrowser?.close();
  await staticServer?.close();
});

for (const [browserName, getBrowser] of [['Chromium', () => chromiumBrowser], ['WebKit', () => webkitBrowser]]) {
  test(`${browserName}: PC・スマホ相当で初回選択、計算、前回event復元が動く`, { timeout: TEST_TIMEOUT }, async () => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const run = await openChecked(getBrowser(), rcUrl(`${browserName}-${viewport.width}`), {
        viewport,
        context: viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}
      });
      try {
        await run.goto();
        assert.equal(await run.page.locator('#event-select').inputValue(), '');
        assert.equal(await run.page.locator('#event-select option').count(), 4);
        assert.equal(await run.page.locator('#mode-durability').isChecked(), true);
        assert.equal(await run.page.locator('[data-role="damage-panel"]').first().isHidden(), true);
        assert.equal(await run.page.locator('#memory').isVisible(), true);
        await selectAndCalculate(run.page);
        await run.page.reload({ waitUntil: 'domcontentloaded' });
        await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
        assert.equal(await run.page.locator('#event-select').inputValue(), 'preview:event:sky');
        assert.equal(await run.page.locator('body').evaluate(() => document.body.scrollWidth <= innerWidth), true);
        assert.ok(await run.page.locator('#char-def').evaluate((element) => element.getBoundingClientRect().height >= 40));
      } finally {
        await run.close();
      }
    }
  });
}

test('PC feedback: 自動再計算、先頭0、日本語属性、敵未選択を維持し不要な2表示を出さない', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('pc-feedback-calculation'));
  try {
    await run.goto();
    assert.equal(await run.page.locator('#mode-durability').isChecked(), true);
    assert.equal(await run.page.locator('#memory').isVisible(), true);

    await run.page.locator('#char-def').fill('0');
    await run.page.locator('#char-def').click();
    await run.page.locator('#char-def').type('44');
    assert.equal(await run.page.locator('#char-def').inputValue(), '44');
    assert.equal(await run.page.locator('#final-defense').innerText(), '44');

    await run.page.locator('#char-def').fill('500000');
    await run.page.locator('#passive').fill('10');
    assert.equal(await run.page.locator('#final-defense').innerText(), '550,000');
    await run.page.locator('#passive').fill('0');

    await run.page.locator('#mode-damage').check();
    assert.equal(await run.page.locator('#enemy-select').inputValue(), '');
    assert.equal(await run.page.locator('#damage-result').innerText(), '敵を選択してください');
    await run.page.locator('#event-select').selectOption('preview:event:sky');
    await run.page.waitForFunction(() => globalThis.Phase8RC.state.event?.id === 'preview:event:sky');
    assert.equal(await run.page.locator('#enemy-select').inputValue(), '');
    await run.page.locator('#enemy-select').selectOption('preview:enemy:blue');
    assert.equal(await run.page.locator('[data-role="enemy-type"]').first().innerText(), '敵属性：超速');
    assert.doesNotMatch(await run.page.locator('.scenario-card').first().innerText(), /基礎ATK|\bsuper\b|\bagl\b/);
    assert.match(await run.page.locator('[data-role="result-types"]').first().innerText(), /自分：超技\s*敵：超速/);

    assert.equal(await run.page.getByText('被ダメージ0に必要なDEF', { exact: true }).count(), 0);
    assert.equal(await run.page.getByRole('button', { name: '今すぐ再計算' }).count(), 0);
    await run.page.locator('#char-def').fill('1000000');
    assert.match(await run.page.locator('#damage-result').innerText(), /：0$/);
    await run.page.locator('#char-def').fill('0');
    assert.doesNotMatch(await run.page.locator('#damage-result').innerText(), /：0$/);

    await run.page.locator('#enemy-select').selectOption('');
    await run.page.locator('.manual-attack-settings').first().evaluate((element) => { element.open = true; });
    await run.page.locator('[data-role="manual-enemy-attack"]').first().fill('100');
    await run.page.locator('[data-role="manual-enemy-class"]').first().selectOption('extreme');
    await run.page.locator('[data-role="manual-enemy-type"]').first().selectOption('str');
    assert.equal(await run.page.locator('#attack-select').inputValue(), 'custom');
    assert.match(await run.page.locator('#damage-result').innerText(), /^カスタム攻撃：/);
    assert.match(await run.page.locator('[data-role="result-types"]').first().innerText(), /敵：極力/);
  } finally {
    await run.close();
  }
});

test('追加feedback: 両モードの結果直近に最終DEF・軽減率・ガードを表示し入力ごとに自動更新する', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('result-condition-summaries'));
  try {
    await run.goto();
    const reductionPosition = await run.page.locator('#damage-reduction').evaluate((input) => {
      const label = input.closest('label');
      const section = input.closest('section');
      const grid = input.closest('.input-grid');
      const affinity = document.querySelector('.affinity-section');
      const critical = document.querySelector('.critical-settings');
      return {
        inBasicSettings: section?.getAttribute('aria-label') === '基本DEF設定',
        isLastSetting: grid?.lastElementChild === label,
        followedByAffinityThenCritical: section?.nextElementSibling === affinity && affinity?.nextElementSibling === critical,
        affinityContainsReduction: Boolean(affinity?.querySelector('#damage-reduction')),
        criticalContainsReduction: Boolean(critical?.querySelector('#damage-reduction'))
      };
    });
    assert.deepEqual(reductionPosition, {
      inBasicSettings: true,
      isLastSetting: true,
      followedByAffinityThenCritical: true,
      affinityContainsReduction: false,
      criticalContainsReduction: false
    });
    await run.page.locator('#char-def').fill('420000');
    await run.page.locator('#damage-reduction').fill('30');
    await run.page.locator('#guard').check();

    const summary = async (prefix) => ({
      finalDefense: await run.page.locator(`[data-role="${prefix}-summary-final-defense"]`).first().innerText(),
      reduction: await run.page.locator(`[data-role="${prefix}-summary-reduction"]`).first().innerText(),
      guard: await run.page.locator(`[data-role="${prefix}-summary-guard"]`).first().innerText()
    });
    assert.deepEqual(await summary('durability'), { finalDefense: '420,000', reduction: '30%', guard: 'あり' });
    assert.deepEqual(await summary('damage'), { finalDefense: '420,000', reduction: '30%', guard: 'あり' });
    assert.equal(await run.page.locator('[data-role="durability-condition-summary"]').first().isVisible(), true);

    await run.page.locator('#passive').fill('10');
    await run.page.locator('#damage-reduction').fill('45');
    await run.page.locator('#guard').uncheck();
    assert.deepEqual(await summary('durability'), { finalDefense: '462,000', reduction: '45%', guard: 'なし' });
    assert.deepEqual(await summary('damage'), { finalDefense: '462,000', reduction: '45%', guard: 'なし' });
    const durabilityBeforeReload = await run.page.locator('[data-role="durability-table"]').first().innerText();
    const storedBeforeReload = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY);
    assert.equal(storedBeforeReload.currentScenarios[0].dr_input, '45');

    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('#damage-reduction').inputValue(), '45');
    assert.equal(await run.page.locator('[data-role="durability-table"]').first().innerText(), durabilityBeforeReload);
    assert.deepEqual(await summary('durability'), { finalDefense: '462,000', reduction: '45%', guard: 'なし' });

    await run.page.locator('#mode-damage').check();
    assert.equal(await run.page.locator('[data-role="damage-condition-summary"]').first().isVisible(), true);
    assert.equal(await run.page.getByText('複数の必殺技は、情報をまとめず技ごとに表示しています。', { exact: true }).count(), 0);
    assert.equal(await run.page.getByText('自分の属性は上の設定と同じ値です。敵の属性は被ダメージモードの手動敵設定を変更しません。', { exact: true }).count(), 0);
  } finally {
    await run.close();
  }
});

test('追加実機feedback: 敵の会心は初期状態で閉じ、開閉しても計算値・入力値・保存値を変えない', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('critical-settings-collapse'));
  try {
    await run.goto();
    const details = run.page.locator('.critical-settings').first();
    const summary = details.locator('summary');
    assert.equal(await details.getAttribute('open'), null);
    assert.equal(await details.getByText('敵の会心', { exact: true }).count(), 1);
    assert.equal(await details.locator('[data-role="is-critical"]').isHidden(), true);

    await summary.click();
    assert.notEqual(await details.getAttribute('open'), null);
    await details.locator('[data-role="is-critical"]').check();
    await details.locator('[data-role="critical-attack"]').fill('150');
    await details.locator('[data-role="critical-defense"]').fill('50');
    const resultBeforeClose = await run.page.locator('[data-role="durability-table"]').first().innerText();
    const storedBeforeClose = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY);

    await summary.click();
    assert.equal(await details.getAttribute('open'), null);
    assert.equal(await details.locator('[data-role="is-critical"]').isChecked(), true);
    assert.equal(await details.locator('[data-role="critical-attack"]').inputValue(), '150');
    assert.equal(await details.locator('[data-role="critical-defense"]').inputValue(), '50');
    assert.equal(await run.page.locator('[data-role="durability-table"]').first().innerText(), resultBeforeClose);
    assert.deepEqual(await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY), storedBeforeClose);

    await summary.click();
    assert.equal(await details.locator('[data-role="critical-attack"]').isVisible(), true);
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('.critical-settings').first().getAttribute('open'), null);
    assert.equal(await run.page.locator('[data-role="is-critical"]').first().isChecked(), true);
    assert.equal(await run.page.locator('[data-role="critical-attack"]').first().inputValue(), '150');
    assert.equal(await run.page.locator('[data-role="critical-defense"]').first().inputValue(), '50');
    assert.equal(await run.page.locator('[data-role="durability-table"]').first().innerText(), resultBeforeClose);
  } finally {
    await run.close();
  }
});

test('追加feedback: 保存敵を選んだままカスタム攻撃を候補へ追加し、そのATKで自動計算する', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('additional-feedback-custom-attack'));
  try {
    await run.goto();
    await run.page.locator('#mode-damage').check();
    await run.page.locator('#event-select').selectOption('preview:event:sky');
    await run.page.waitForFunction(() => globalThis.Phase8RC.state.event?.id === 'preview:event:sky');
    await run.page.locator('#enemy-select').selectOption('preview:enemy:blue');
    await run.page.locator('.manual-attack-settings').first().evaluate((element) => { element.open = true; });
    await run.page.locator('[data-role="manual-enemy-attack"]').first().fill('123.45');
    assert.equal(await run.page.locator('#attack-select option[value="custom"]').innerText(), 'カスタム攻撃 1,234,500');
    await run.page.locator('[data-role="manual-enemy-class"]').first().selectOption('extreme');
    await run.page.locator('[data-role="manual-enemy-type"]').first().selectOption('str');
    await run.page.locator('#attack-select').selectOption('custom');
    const firstResult = await run.page.locator('#damage-result').innerText();
    assert.match(firstResult, /^カスタム攻撃：/);
    assert.match(await run.page.locator('[data-role="result-types"]').first().innerText(), /敵：極力/);

    await run.page.locator('[data-role="manual-enemy-attack"]').first().fill('200');
    assert.equal(await run.page.locator('#attack-select').inputValue(), 'custom');
    assert.equal(await run.page.locator('#attack-select option[value="custom"]').innerText(), 'カスタム攻撃 2,000,000');
    assert.notEqual(await run.page.locator('#damage-result').innerText(), firstResult);
  } finally {
    await run.close();
  }
});

test('追加feedback: 耐久ライン直近の日本語属性を同期・独立変更し、自動再計算して保存する', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('additional-feedback-durability-affinity'));
  try {
    await run.goto();
    assert.equal(await run.page.locator('#durability-own-affinity').inputValue(), 'super:teq');
    assert.equal(await run.page.locator('#durability-enemy-affinity').inputValue(), 'super:teq');
    assert.equal(await run.page.locator('#durability-own-affinity option:checked').innerText(), '超技');
    assert.equal(await run.page.locator('#durability-enemy-affinity option:checked').innerText(), '超技');
    const initialLine = await run.page.locator('[data-role="durability-table"]').first().innerText();

    await run.page.locator('#durability-enemy-affinity').selectOption('extreme:int');
    assert.equal(await run.page.locator('#durability-enemy-affinity option:checked').innerText(), '極知');
    const enemyChangedLine = await run.page.locator('[data-role="durability-table"]').first().innerText();
    assert.notEqual(enemyChangedLine, initialLine);

    await run.page.locator('#durability-own-affinity').selectOption('super:agl');
    assert.equal(await run.page.locator('#own-class').inputValue(), 'super');
    assert.equal(await run.page.locator('#own-type').inputValue(), 'agl');
    assert.equal(await run.page.locator('#durability-own-affinity option:checked').innerText(), '超速');
    assert.notEqual(await run.page.locator('[data-role="durability-table"]').first().innerText(), enemyChangedLine);

    await run.page.locator('#own-class').selectOption('extreme');
    await run.page.locator('#own-type').selectOption('phy');
    assert.equal(await run.page.locator('#durability-own-affinity').inputValue(), 'extreme:phy');
    const stored = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY);
    assert.equal(stored.phase8PagesStateVersion, 1);
    assert.equal(stored.currentScenarios[0].own_class, 'extreme');
    assert.equal(stored.currentScenarios[0].own_type, 'phy');
    assert.equal(stored.currentScenarios[0].phase8_durability_enemy_affinity, 'extreme:int');
  } finally {
    await run.close();
  }
});

test('追加feedback: Pagesは旧版・旧移行先・PATを読まず新規開始し、Pages内の通常状態だけを保存・復元する', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('pages-local-storage'));
  try {
    await run.goto();
    const seeded = {
      onedrive: JSON.stringify({ currentScenarios: [{ scenario_title: 'OneDriveの状況', char_def: '999999' }], theme: 'dark' }),
      imported: JSON.stringify({ currentScenarios: [{ scenario_title: '旧移行先の状況', char_def: '888888' }], theme: 'dark' }),
      pat: 'owner-pat-must-remain-untouched',
      unknown: 'unknown-must-remain-untouched'
    };
    await run.page.evaluate(({ pagesKey, onedriveKey, importedKey, patKey, seeded }) => {
      localStorage.removeItem(pagesKey);
      localStorage.setItem(onedriveKey, seeded.onedrive);
      localStorage.setItem(importedKey, seeded.imported);
      localStorage.setItem(patKey, seeded.pat);
      localStorage.setItem('owner_unknown_key', seeded.unknown);
    }, {
      pagesKey: RC_STORAGE_KEY,
      onedriveKey: ONEDRIVE_STORAGE_KEY,
      importedKey: RETIRED_IMPORTED_STORAGE_KEY,
      patKey: PAT_STORAGE_KEY,
      seeded
    });
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('.scenario-card').count(), 1);
    assert.equal(await run.page.locator('[data-role="scenario-title"]').first().inputValue(), '状況 1');
    assert.equal(await run.page.locator('#char-def').inputValue(), '0');
    assert.equal(await run.page.locator('html').getAttribute('data-theme'), 'light');

    await run.page.locator('[data-role="scenario-title"]').first().fill('Pages作業中');
    await run.page.locator('#char-def').fill('123456');
    await run.page.locator('#damage-reduction').fill('35');
    await run.page.locator('#guard').check();
    await run.page.locator('.critical-settings summary').first().click();
    await run.page.locator('[data-role="is-critical"]').first().check();
    await run.page.locator('[data-role="critical-attack"]').first().fill('200');
    await run.page.locator('[data-role="critical-defense"]').first().fill('100');
    await run.page.locator('#durability-enemy-affinity').selectOption('extreme:phy');
    await run.page.locator('#mode-damage').check();
    await run.page.locator('.manual-attack-settings').first().evaluate((element) => { element.open = true; });
    await run.page.locator('[data-role="manual-enemy-attack"]').first().fill('321');
    await run.page.locator('[data-role="manual-enemy-class"]').first().selectOption('extreme');
    await run.page.locator('[data-role="manual-enemy-type"]').first().selectOption('int');
    await run.page.locator('#add-scenario-button').click();
    await run.page.locator('[data-role="scenario-title"]').nth(1).fill('Pages比較用');
    await run.page.locator('#theme-button').click();

    const stored = await run.page.evaluate(({ pagesKey, onedriveKey, importedKey, patKey }) => ({
      pages: JSON.parse(localStorage.getItem(pagesKey)),
      onedrive: localStorage.getItem(onedriveKey),
      imported: localStorage.getItem(importedKey),
      pat: localStorage.getItem(patKey),
      unknown: localStorage.getItem('owner_unknown_key')
    }), {
      pagesKey: RC_STORAGE_KEY,
      onedriveKey: ONEDRIVE_STORAGE_KEY,
      importedKey: RETIRED_IMPORTED_STORAGE_KEY,
      patKey: PAT_STORAGE_KEY
    });
    assert.deepEqual(Object.keys(stored.pages).sort(), ['currentScenarios', 'durabilityLines', 'phase8PagesStateVersion', 'theme']);
    assert.equal(stored.pages.phase8PagesStateVersion, 1);
    assert.equal(stored.pages.currentScenarios.length, 2);
    assert.equal(stored.pages.currentScenarios[0].enemy_atk, '321');
    assert.equal(stored.pages.currentScenarios[0].enemy_class, 'extreme');
    assert.equal(stored.pages.currentScenarios[0].enemy_type, 'int');
    assert.equal(stored.pages.currentScenarios[0].is_critical, true);
    assert.equal(stored.pages.currentScenarios[0].phase8_durability_enemy_affinity, 'extreme:phy');
    assert.equal(stored.pages.theme, 'dark');
    assert.deepEqual({ onedrive: stored.onedrive, imported: stored.imported, pat: stored.pat, unknown: stored.unknown }, seeded);

    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('.scenario-card').count(), 2);
    assert.deepEqual(await run.page.locator('[data-role="scenario-title"]').evaluateAll((inputs) => inputs.map((input) => input.value)), ['Pages作業中', 'Pages比較用']);
    assert.equal(await run.page.locator('#char-def').inputValue(), '123456');
    assert.equal(await run.page.locator('[data-role="manual-enemy-attack"]').first().inputValue(), '321');
    assert.equal(await run.page.locator('[data-role="is-critical"]').first().isChecked(), true);
    assert.equal(await run.page.locator('html').getAttribute('data-theme'), 'dark');
  } finally {
    await run.close();
  }
});

test('追加feedback: 壊れたPages内保存は初期状態へ安全に戻し、旧loadedEnemyを移行しない', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('pages-local-storage-recovery'));
  try {
    await run.goto();
    await run.page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        phase8PagesStateVersion: 1,
        durabilityLines: [],
        currentScenarios: { broken: true },
        theme: 'dark'
      }));
    }, RC_STORAGE_KEY);
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('.scenario-card').count(), 1);
    assert.equal(await run.page.locator('[data-role="scenario-title"]').first().inputValue(), '状況 1');
    assert.equal(await run.page.locator('html').getAttribute('data-theme'), 'light');
    const recovered = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY);
    assert.equal(Array.isArray(recovered.currentScenarios), true);
    assert.equal(recovered.currentScenarios.length, 1);
    assert.deepEqual(recovered.durabilityLines, [{ name: '完封', value: 0 }, { name: '70万', value: 700000 }]);

    await run.page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        phase8PagesStateVersion: 1,
        durabilityLines: [{ name: '完封', value: 0 }],
        currentScenarios: [{
          scenario_title: 'Pages内の状況',
          char_def: '246810',
          loadedEnemy: { name: '旧版保存敵', baseAtk: 999999, class: 'extreme', type: 'str' }
        }],
        theme: 'light'
      }));
    }, RC_STORAGE_KEY);
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('[data-role="scenario-title"]').first().inputValue(), 'Pages内の状況');
    assert.equal(await run.page.locator('#char-def').inputValue(), '246810');
    assert.equal(await run.page.locator('#event-select').inputValue(), '');
    assert.equal(await run.page.locator('#event-select option[value="__legacy__"]').count(), 0);
    const cleaned = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY);
    assert.equal('loadedEnemy' in cleaned.currentScenarios[0], false);
  } finally {
    await run.close();
  }
});

test('追加feedback: 個別に閉じても計算・入力・Pages内保存内容は変わらない', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('additional-feedback-collapse'));
  try {
    await run.goto();
    await run.page.locator('#char-def').fill('123456');
    await run.page.locator('[data-role="scenario-title"]').first().fill('折りたたみ確認');
    const before = await run.page.locator('#final-defense').textContent();
    const beforeStorage = await run.page.evaluate((key) => localStorage.getItem(key), RC_STORAGE_KEY);
    await run.page.locator('[data-action="toggle-collapse"]').first().click();
    assert.equal(await run.page.locator('[data-role="scenario-body"]').first().isHidden(), true);
    assert.equal(await run.page.locator('[data-action="toggle-collapse"]').first().getAttribute('aria-expanded'), 'false');
    assert.equal(await run.page.locator('#final-defense').textContent(), before);
    assert.equal(await run.page.locator('#char-def').inputValue(), '123456');
    assert.equal(await run.page.evaluate((key) => localStorage.getItem(key), RC_STORAGE_KEY), beforeStorage);
    const stored = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY);
    assert.equal(stored.currentScenarios[0].char_def, '123456');
    assert.equal('savedCharacters' in stored, false);

    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('#char-def').inputValue(), '123456');
    assert.equal(await run.page.locator('#final-defense').textContent(), before);
    assert.equal(await run.page.locator('[data-role="scenario-body"]').first().isVisible(), true);
  } finally {
    await run.close();
  }
});

test('追加feedback: すべて開く・閉じるは表示だけを変え、全カードの計算・入力・保存を維持する', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('additional-feedback-collapse-all'));
  try {
    await run.goto();
    await run.page.locator('#add-scenario-button').click();
    await run.page.locator('#add-scenario-button').click();
    await run.page.waitForFunction(() => document.querySelectorAll('.scenario-card').length === 3);
    for (const [index, value] of ['111111', '222222', '333333'].entries()) {
      await run.page.locator('[data-role="char-def"]').nth(index).fill(value);
      await run.page.locator('[data-role="scenario-title"]').nth(index).fill(`一括確認${index + 1}`);
    }
    const before = {
      results: await run.page.locator('[data-role="final-defense"]').allTextContents(),
      inputs: await run.page.locator('[data-role="char-def"]').evaluateAll((inputs) => inputs.map((input) => input.value)),
      storage: await run.page.evaluate((key) => localStorage.getItem(key), RC_STORAGE_KEY)
    };

    await run.page.locator('#collapse-all-scenarios').click();
    assert.deepEqual(await run.page.locator('[data-role="scenario-body"]').evaluateAll((bodies) => bodies.map((body) => body.hidden)), [true, true, true]);
    assert.deepEqual(await run.page.locator('[data-action="toggle-collapse"]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-expanded'))), ['false', 'false', 'false']);
    assert.deepEqual(await run.page.locator('[data-role="final-defense"]').allTextContents(), before.results);
    assert.deepEqual(await run.page.locator('[data-role="char-def"]').evaluateAll((inputs) => inputs.map((input) => input.value)), before.inputs);
    assert.equal(await run.page.evaluate((key) => localStorage.getItem(key), RC_STORAGE_KEY), before.storage);

    await run.page.locator('[data-action="toggle-collapse"]').nth(1).click();
    assert.deepEqual(await run.page.locator('[data-role="scenario-body"]').evaluateAll((bodies) => bodies.map((body) => body.hidden)), [true, false, true]);
    await run.page.locator('#expand-all-scenarios').click();
    assert.deepEqual(await run.page.locator('[data-role="scenario-body"]').evaluateAll((bodies) => bodies.map((body) => body.hidden)), [false, false, false]);
    assert.deepEqual(await run.page.locator('[data-action="toggle-collapse"]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-expanded'))), ['true', 'true', 'true']);
    assert.deepEqual(await run.page.locator('[data-role="final-defense"]').allTextContents(), before.results);
    assert.deepEqual(await run.page.locator('[data-role="char-def"]').evaluateAll((inputs) => inputs.map((input) => input.value)), before.inputs);
    assert.equal(await run.page.evaluate((key) => localStorage.getItem(key), RC_STORAGE_KEY), before.storage);
  } finally {
    await run.close();
  }
});

test('PC feedback: 有効な敵状態だけから通常・複数必殺・全体攻撃の範囲を表示する', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('pc-feedback-attack-ranges'));
  try {
    await run.goto();
    await run.page.locator('#mode-damage').check();
    await run.page.locator('#event-select').selectOption('preview:event:forest');
    await run.page.waitForFunction(() => globalThis.Phase8RC.state.event?.id === 'preview:event:forest');
    await run.page.locator('#enemy-select').selectOption('preview:enemy:green');
    const summary = await run.page.locator('[data-role="enemy-attack-summary"]').first().innerText();
    assert.match(summary, /通常攻撃\s*600,000～1,300,000/);
    assert.match(summary, /架空必殺A\s*1,500,000～2,500,000/);
    assert.match(summary, /架空必殺B\s*2,800,000～3,500,000/);
    assert.match(summary, /全体攻撃\s*720,000～1,200,000/);
    assert.doesNotMatch(summary, /複数の必殺技/);
    assert.equal(await run.page.locator('[data-condition="turn"]').count(), 1);
    assert.equal(await run.page.locator('[data-condition="hp"]').count(), 1);
    assert.ok(await run.page.locator('#attack-select option').count() >= 6);
  } finally {
    await run.close();
  }
});

test('最終実機feedback: colonを含む全体攻撃IDでも対象別ATKを選択・計算・保存できる', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('final-feedback-area-attack'));
  try {
    await run.goto();
    await run.page.locator('#mode-damage').check();
    await run.page.locator('#event-select').selectOption('preview:event:forest');
    await run.page.waitForFunction(() => globalThis.Phase8RC.state.event?.id === 'preview:event:forest');
    await run.page.locator('#enemy-select').selectOption('preview:enemy:green');

    const damageResult = run.page.locator('#damage-result');
    await run.page.locator('#attack-select').selectOption('normal');
    assert.match(await damageResult.innerText(), /^通常攻撃：(?!.*攻撃を選択してください)/);
    await run.page.locator('#attack-select').selectOption('super:preview:attack:green:1');
    assert.match(await damageResult.innerText(), /^架空必殺A：/);
    await run.page.locator('[data-condition="hp"]').selectOption('50');
    await run.page.locator('#attack-select').selectOption('super:preview:attack:green:2');
    assert.match(await damageResult.innerText(), /^架空必殺B：/);
    await run.page.locator('[data-condition="hp"]').selectOption('100');

    await run.page.locator('#char-def').fill('100000');
    await run.page.locator('#damage-reduction').fill('17');
    await run.page.locator('#guard').check();
    await run.page.locator('#attribute-defense').fill('5');
    await run.page.locator('.critical-settings summary').first().click();
    await run.page.locator('[data-role="is-critical"]').first().check();
    await run.page.locator('[data-role="critical-attack"]').first().fill('150');
    await run.page.locator('[data-role="critical-defense"]').first().fill('50');

    const firstSelection = 'area:preview:area:green:1:first';
    const additionalSelection = 'area:preview:area:green:1:additional';
    await run.page.locator('#attack-select').selectOption(firstSelection);
    assert.equal(await run.page.locator('#attack-select').inputValue(), firstSelection);
    const firstTargetResult = await damageResult.innerText();
    assert.match(firstTargetResult, /^全体攻撃：/);
    assert.doesNotMatch(firstTargetResult, /攻撃を選択してください/);

    await run.page.locator('.manual-attack-settings').first().evaluate((element) => { element.open = true; });
    await run.page.locator('[data-role="manual-enemy-attack"]').first().fill('72');
    await run.page.locator('[data-role="manual-enemy-class"]').first().selectOption('extreme');
    await run.page.locator('[data-role="manual-enemy-type"]').first().selectOption('teq');
    await run.page.locator('#attack-select').selectOption('custom');
    assert.equal(
      (await damageResult.innerText()).replace(/^[^：]+：/, ''),
      firstTargetResult.replace(/^[^：]+：/, ''),
      'first target must use 600,000 × 1.20 = 720,000 ATK'
    );

    await run.page.locator('#attack-select').selectOption(additionalSelection);
    assert.equal(await run.page.locator('#attack-select').inputValue(), additionalSelection);
    const additionalTargetResult = await damageResult.innerText();
    assert.match(additionalTargetResult, /^全体攻撃（2体目以降）：/);
    assert.doesNotMatch(additionalTargetResult, /攻撃を選択してください/);
    await run.page.locator('[data-role="manual-enemy-attack"]').first().fill('54');
    await run.page.locator('#attack-select').selectOption('custom');
    assert.equal(
      (await damageResult.innerText()).replace(/^[^：]+：/, ''),
      additionalTargetResult.replace(/^[^：]+：/, ''),
      'additional target must use 450,000 × 1.20 = 540,000 ATK'
    );

    await run.page.locator('#attack-select').selectOption(firstSelection);
    const stored = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY);
    assert.equal(stored.currentScenarios[0].phase8_attack_id, firstSelection);
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    await run.page.locator('#mode-damage').check();
    assert.equal(await run.page.locator('#attack-select').inputValue(), firstSelection);
    assert.equal(await damageResult.innerText(), firstTargetResult);
    assert.deepEqual({
      finalDefense: await run.page.locator('[data-role="damage-summary-final-defense"]').first().innerText(),
      reduction: await run.page.locator('[data-role="damage-summary-reduction"]').first().innerText(),
      guard: await run.page.locator('[data-role="damage-summary-guard"]').first().innerText()
    }, { finalDefense: '100,000', reduction: '17%', guard: 'あり' });
  } finally {
    await run.close();
  }
});

test('追加feedback: 管理UIなしでも複数計算カードとPages内自動保存を使える', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('pc-feedback-characters'));
  try {
    await run.goto();
    assert.equal(await run.page.locator('#character-management').count(), 0);
    assert.equal(await run.page.getByText('キャラクター管理', { exact: true }).count(), 0);
    assert.equal(await run.page.locator('#save-character-button, #load-character-button, #new-character-button, #delete-character-button').count(), 0);
    assert.equal(await run.page.locator('.scenario-card').count(), 1);
    await run.page.locator('[data-role="scenario-title"]').first().fill('基準状況');
    await run.page.locator('#add-scenario-button').click();
    await run.page.waitForFunction(() => document.querySelectorAll('.scenario-card').length === 2);
    await run.page.locator('[data-role="scenario-title"]').nth(1).fill('アイテム使用後');
    await run.page.locator('[data-action="duplicate"]').first().click();
    await run.page.waitForFunction(() => document.querySelectorAll('.scenario-card').length === 3);
    await run.page.locator('[data-action="delete"]').nth(1).click();
    await run.page.waitForFunction(() => document.querySelectorAll('.scenario-card').length === 2);
    const stored = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), RC_STORAGE_KEY);
    assert.equal(stored.currentScenarios.length, 2);
    assert.deepEqual(stored.currentScenarios.map((scenario) => scenario.scenario_title), ['基準状況', 'アイテム使用後']);
    assert.equal('savedCharacters' in stored, false);
  } finally {
    await run.close();
  }
});

test('追加feedback: 360px・390pxでoverflowなしを維持し、展開時の主要縦寸法を前版から短縮する', { timeout: TEST_TIMEOUT }, async () => {
  for (const width of [360, 390]) {
    const run = await openChecked(chromiumBrowser, rcUrl(`additional-feedback-mobile-${width}`), {
      viewport: { width, height: 900 },
      context: { isMobile: true, hasTouch: true }
    });
    try {
      await run.goto();
      const layout = await run.page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const first = document.querySelector('#char-def').getBoundingClientRect();
        const second = document.querySelector('#leader').getBoundingClientRect();
        const card = document.querySelector('.scenario-card').getBoundingClientRect();
        const basic = document.querySelector('section[aria-label="基本DEF設定"]');
        const affinity = document.querySelector('.affinity-section').getBoundingClientRect();
        const critical = document.querySelector('.critical-settings');
        const ownClass = rect('#own-class');
        const ownType = rect('#own-type');
        const attributeDefense = rect('#attribute-defense');
        const guardLabel = document.querySelector('#guard').closest('label').getBoundingClientRect();
        const damageReduction = rect('#damage-reduction');
        const conditionSummary = document.querySelector('[data-role="durability-condition-summary"]');
        const conditionCells = [...document.querySelectorAll('[data-role="durability-condition-summary"] > span')].map((element) => element.getBoundingClientRect());
        return {
          noOverflow: document.documentElement.scrollWidth <= innerWidth,
          sameRow: Math.abs(first.top - second.top) < 2,
          inputHeight: first.height,
          pageHeight: document.documentElement.scrollHeight,
          scenarioCardHeight: card.height,
          scenarioInputsHeight: affinity.bottom - card.top,
          cardWidth: card.width,
          actionButtonsSameRow: new Set([...document.querySelectorAll('.scenario-actions button')].map((button) => Math.round(button.getBoundingClientRect().top))).size === 1,
          actionsWithinViewport: document.querySelector('.scenario-actions').getBoundingClientRect().right <= innerWidth,
          defenseRowAligned: Math.abs(attributeDefense.top - guardLabel.top) < 2,
          damageReductionIsBasicLast: basic.querySelector('.input-grid').lastElementChild?.contains(document.querySelector('#damage-reduction')) === true,
          sectionOrder: basic.nextElementSibling === document.querySelector('.affinity-section') && basic.nextElementSibling.nextElementSibling === critical,
          reductionBeforeAffinity: damageReduction.bottom <= affinity.top,
          criticalClosed: critical.open === false,
          criticalSummaryHeight: critical.querySelector('summary').getBoundingClientRect().height,
          leftColumnAligned: Math.abs(ownClass.left - attributeDefense.left) < 2,
          rightColumnAligned: Math.abs(ownType.left - guardLabel.left) < 2,
          summarySameRow: new Set(conditionCells.map((cell) => Math.round(cell.top))).size === 1,
          summaryOverflow: conditionSummary.scrollWidth - conditionSummary.clientWidth
        };
      });
      const previous = PREVIOUS_MOBILE_LAYOUT[width];
      const immediatePrevious = IMMEDIATE_PREVIOUS_MOBILE_LAYOUT[width];
      assert.equal(layout.noOverflow, true);
      assert.equal(layout.sameRow, true);
      assert.ok(layout.inputHeight >= 40);
      assert.ok(layout.cardWidth <= width);
      assert.ok(layout.pageHeight <= previous.pageHeight * 0.75);
      assert.ok(layout.pageHeight < BEFORE_MANAGEMENT_REMOVAL_LAYOUT[width].pageHeight);
      assert.ok(layout.scenarioCardHeight <= previous.scenarioCardHeight * 0.85);
      assert.ok(layout.scenarioInputsHeight <= previous.scenarioInputsHeight * 0.82);
      assert.ok(layout.pageHeight <= immediatePrevious.pageHeight, JSON.stringify(layout));
      assert.ok(Math.round(layout.scenarioCardHeight) <= immediatePrevious.scenarioCardHeight, JSON.stringify(layout));
      assert.ok(Math.round(layout.scenarioInputsHeight) <= immediatePrevious.scenarioInputsHeight, JSON.stringify(layout));
      assert.equal(layout.actionButtonsSameRow, true);
      assert.equal(layout.actionsWithinViewport, true);
      assert.equal(layout.defenseRowAligned, true);
      assert.equal(layout.damageReductionIsBasicLast, true);
      assert.equal(layout.sectionOrder, true);
      assert.equal(layout.reductionBeforeAffinity, true);
      assert.equal(layout.criticalClosed, true);
      assert.ok(layout.criticalSummaryHeight >= 40);
      assert.equal(layout.leftColumnAligned, true);
      assert.equal(layout.rightColumnAligned, true);
      assert.equal(layout.summarySameRow, true);
      assert.ok(layout.summaryOverflow <= 1, JSON.stringify(layout));

      await run.page.locator('.critical-settings summary').first().click();
      const openCritical = await run.page.evaluate(() => {
        const details = document.querySelector('.critical-settings');
        const grid = details.querySelector('.critical-grid').getBoundingClientRect();
        const toggle = details.querySelector('.critical-toggle').getBoundingClientRect();
        const attack = details.querySelector('[data-role="critical-attack"]').getBoundingClientRect();
        const defense = details.querySelector('[data-role="critical-defense"]').getBoundingClientRect();
        return {
          open: details.open,
          inputsAligned: Math.abs(attack.top - defense.top) < 2 && Math.abs(attack.height - defense.height) < 2,
          toggleFullWidth: Math.abs(toggle.left - grid.left) < 2 && Math.abs(toggle.right - grid.right) < 2,
          toggleHeight: toggle.height,
          noOverflow: document.documentElement.scrollWidth <= innerWidth
        };
      });
      assert.equal(openCritical.open, true);
      assert.equal(openCritical.inputsAligned, true);
      assert.equal(openCritical.toggleFullWidth, true);
      assert.equal(openCritical.noOverflow, true);
      assert.ok(openCritical.toggleHeight >= 40);
      await run.page.locator('.critical-settings summary').first().click();

      await run.page.locator('#mode-damage').check();
      await run.page.locator('#event-select').selectOption('preview:event:forest');
      await run.page.waitForFunction(() => globalThis.Phase8RC.state.event?.id === 'preview:event:forest');
      await run.page.locator('#enemy-select').selectOption('preview:enemy:green');
      const rangeLayout = await run.page.locator('.attack-range-value').evaluateAll((elements) => elements.map((element) => {
        const textRange = document.createRange();
        textRange.selectNodeContents(element);
        const style = getComputedStyle(element);
        return {
          text: element.textContent,
          textLineCount: textRange.getClientRects().length,
          whiteSpace: style.whiteSpace,
          overflowX: style.overflowX,
          caretColor: style.caretColor,
          scrollOverflow: element.scrollWidth - element.clientWidth,
          labelFallback: getComputedStyle(element.previousElementSibling).overflowWrap,
          elementChildren: element.childElementCount,
          beforeContent: getComputedStyle(element, '::before').content,
          afterContent: getComputedStyle(element, '::after').content
        };
      }));
      assert.ok(rangeLayout.some((entry) => entry.text === '1,500,000～2,500,000'));
      assert.ok(rangeLayout.every((entry) => entry.textLineCount === 1 && entry.whiteSpace === 'nowrap'), JSON.stringify(rangeLayout));
      assert.ok(rangeLayout.every((entry) => entry.overflowX === 'hidden' && entry.caretColor === 'rgba(0, 0, 0, 0)'), JSON.stringify(rangeLayout));
      assert.ok(rangeLayout.every((entry) => entry.scrollOverflow <= 1), JSON.stringify(rangeLayout));
      assert.ok(rangeLayout.every((entry) => entry.labelFallback === 'anywhere'));
      assert.ok(rangeLayout.every((entry) => entry.elementChildren === 0 && entry.beforeContent === 'none' && entry.afterContent === 'none'));

      await run.page.locator('.attack-summary-row > span').first().evaluate((element) => { element.textContent = '非常に長い名前の必殺攻撃'; });
      const longLabelLayout = await run.page.locator('.attack-summary-row').first().evaluate((row) => {
        const value = row.querySelector('.attack-range-value');
        const textRange = document.createRange();
        textRange.selectNodeContents(value);
        return { valueLines: textRange.getClientRects().length, pageOverflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.deepEqual(longLabelLayout, { valueLines: 1, pageOverflow: false });

      await run.page.locator('#attack-select').selectOption('normal');
      const resultLayout = await run.page.evaluate(() => {
        const cards = document.querySelectorAll('.damage-results > div');
        const damage = cards[0].getBoundingClientRect();
        const types = cards[1].getBoundingClientRect();
        const value = document.querySelector('.damage-range-value');
        const textRange = document.createRange();
        textRange.selectNodeContents(value);
        return {
          widthRatio: damage.width / types.width,
          resultText: document.querySelector('#damage-result').textContent,
          rangeText: value.textContent,
          rangeLines: textRange.getClientRects().length,
          rangeWhiteSpace: getComputedStyle(value).whiteSpace,
          rangeOverflow: value.scrollWidth - value.clientWidth,
          typeText: document.querySelector('[data-role="result-types"]').innerText,
          typeOverflow: cards[1].scrollWidth - cards[1].clientWidth,
          pageOverflow: document.documentElement.scrollWidth > innerWidth
        };
      });
      assert.ok(resultLayout.widthRatio >= 1.55, JSON.stringify(resultLayout));
      assert.match(resultLayout.resultText, /^通常攻撃：/);
      assert.match(resultLayout.rangeText, /〜/);
      assert.equal(resultLayout.rangeLines, 1);
      assert.equal(resultLayout.rangeWhiteSpace, 'nowrap');
      assert.ok(resultLayout.rangeOverflow <= 1, JSON.stringify(resultLayout));
      assert.match(resultLayout.typeText, /自分：超技\s*敵：極技/);
      assert.ok(resultLayout.typeOverflow <= 1, JSON.stringify(resultLayout));
      assert.equal(resultLayout.pageOverflow, false);
      assert.equal(await run.page.locator('body').evaluate(() => document.body.scrollWidth <= innerWidth), true);

      await run.page.locator('#mode-durability').check();
      assert.equal(await run.page.locator('#expand-all-scenarios').isVisible(), true);
      assert.equal(await run.page.locator('#collapse-all-scenarios').isVisible(), true);

      await run.page.locator('[data-action="toggle-collapse"]').first().click();
      const collapsed = await run.page.locator('.scenario-card').first().evaluate((element) => element.getBoundingClientRect().height);
      assert.ok(collapsed < 100);
      assert.equal(await run.page.locator('body').evaluate(() => document.body.scrollWidth <= innerWidth), true);
    } finally {
      await run.close();
    }
  }
});

for (const [browserName, getBrowser] of [['Chromium', () => chromiumBrowser], ['WebKit', () => webkitBrowser]]) {
  test(`${browserName}: 360px・390pxでrange・結果縦位置・select focus枠を実描画する`, { timeout: TEST_TIMEOUT }, async () => {
    for (const width of [360, 390]) {
      const run = await openChecked(getBrowser(), rcUrl(`range-render-${browserName}-${width}`), {
        viewport: { width, height: 900 },
        context: { isMobile: true, hasTouch: true }
      });
      try {
        await run.goto();
        await run.page.locator('#mode-damage').check();
        await run.page.locator('#event-select').selectOption('preview:event:forest');
        await run.page.waitForFunction(() => globalThis.Phase8RC.state.event?.id === 'preview:event:forest');
        await run.page.locator('#enemy-select').selectOption('preview:enemy:green');

        const enemySelects = [
          '#event-select',
          '#stage-select',
          '#enemy-select',
          '#attack-select',
          '[data-condition="turn"]',
          '[data-condition="hp"]'
        ];
        for (const selector of enemySelects) {
          const control = run.page.locator(selector).first();
          assert.equal(await control.count(), 1, `${browserName} ${width}px: ${selector} must exist`);
          await control.focus();
          const focusRing = await control.evaluate((element) => {
            const style = getComputedStyle(element);
            const controlRect = element.getBoundingClientRect();
            const labelRect = element.closest('label')?.getBoundingClientRect();
            return {
              focused: element.matches(':focus'),
              outlineStyle: style.outlineStyle,
              borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
              ringInsideLabel: !labelRect || (
                controlRect.left >= labelRect.left - 1
                && controlRect.top >= labelRect.top - 1
                && controlRect.right <= labelRect.right + 1
                && controlRect.bottom <= labelRect.bottom + 1
              ),
              pageOverflow: document.documentElement.scrollWidth > innerWidth
            };
          });
          assert.equal(focusRing.focused, true, JSON.stringify({ selector, focusRing }));
          assert.equal(focusRing.outlineStyle, 'none', JSON.stringify({ selector, focusRing }));
          assert.ok(focusRing.borderWidths.every((value) => parseFloat(value) >= 2), JSON.stringify({ selector, focusRing }));
          assert.equal(focusRing.ringInsideLabel, true, JSON.stringify({ selector, focusRing }));
          assert.equal(focusRing.pageOverflow, false, JSON.stringify({ selector, focusRing }));
        }

        const shortRange = await run.page.locator('.attack-summary-row').first().evaluate((row) => {
          const value = row.querySelector('.attack-range-value');
          const range = document.createRange();
          range.selectNodeContents(value);
          return { label: row.querySelector('span').textContent, lines: range.getClientRects().length };
        });
        assert.deepEqual(shortRange, { label: '通常攻撃', lines: 1 });

        await run.page.locator('.attack-summary-row > span').nth(1).evaluate((element) => { element.textContent = '非常に長い名前の必殺攻撃'; });
        const renderedRanges = await run.page.locator('.attack-range-value').evaluateAll((elements) => elements.map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const style = getComputedStyle(element);
          return {
            lines: range.getClientRects().length,
            overflowX: style.overflowX,
            whiteSpace: style.whiteSpace,
            children: element.childElementCount,
            before: getComputedStyle(element, '::before').content,
            after: getComputedStyle(element, '::after').content
          };
        }));
        assert.ok(renderedRanges.every((item) => item.lines === 1 && item.overflowX === 'hidden' && item.whiteSpace === 'nowrap'), JSON.stringify(renderedRanges));
        assert.ok(renderedRanges.every((item) => item.children === 0 && item.before === 'none' && item.after === 'none'));

        await run.page.locator('#attack-select').selectOption('normal');
        const damageLayout = await run.page.evaluate(() => {
          const cards = document.querySelectorAll('.damage-results > div');
          const range = document.querySelector('.damage-range-value');
          const textRange = document.createRange();
          textRange.selectNodeContents(range);
          return {
            ratio: cards[0].getBoundingClientRect().width / cards[1].getBoundingClientRect().width,
            lines: textRange.getClientRects().length,
            text: range.textContent,
            types: document.querySelector('[data-role="result-types"]').innerText,
            overflow: document.documentElement.scrollWidth > innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            bodyClientWidth: document.body.clientWidth,
            innerWidth,
            overflowElements: [...document.querySelectorAll('body *')]
              .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
              .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
            internalOverflowElements: [...document.querySelectorAll('body *')]
              .filter((element) => element.scrollWidth > element.clientWidth + 1)
              .map((element) => `${element.tagName.toLowerCase()}.${element.className}:${element.clientWidth}/${element.scrollWidth}`)
          };
        });
        assert.ok(damageLayout.ratio >= 1.55, JSON.stringify(damageLayout));
        assert.equal(damageLayout.lines, 1);
        assert.match(damageLayout.text, /〜/);
        assert.match(damageLayout.types, /自分：超技\s*敵：極技/);
        assert.equal(damageLayout.overflow, false, JSON.stringify({ width, browserName, ...damageLayout }));

        const measureRhythm = (labelText, rangeText) => run.page.locator('#damage-result').evaluate((value, content) => {
          const card = value.closest('.damage-results > div');
          const heading = card.querySelector(':scope > span');
          const contentBlock = value.querySelector('.damage-result-content');
          const label = value.querySelector('.damage-result-label');
          const range = value.querySelector('.damage-range-value');
          label.textContent = content.labelText;
          range.textContent = content.rangeText;
          const cardRect = card.getBoundingClientRect();
          const headingRect = heading.getBoundingClientRect();
          const valueRect = value.getBoundingClientRect();
          const contentRect = contentBlock.getBoundingClientRect();
          const labelRect = label.getBoundingClientRect();
          const rangeRect = range.getBoundingClientRect();
          const valueStyle = getComputedStyle(value);
          const cardStyle = getComputedStyle(card);
          const lineHeight = parseFloat(valueStyle.lineHeight);
          return {
            sameLine: Math.abs(labelRect.top - rangeRect.top) < lineHeight * 0.6,
            headingValueGap: Math.min(labelRect.top, rangeRect.top) - headingRect.bottom,
            bottomInset: cardRect.bottom - Math.max(labelRect.bottom, rangeRect.bottom),
            valueAreaHeight: valueRect.height,
            valueTopInset: contentRect.top - valueRect.top,
            valueBottomInset: valueRect.bottom - contentRect.bottom,
            paddingTop: parseFloat(valueStyle.paddingTop),
            paddingBottom: parseFloat(valueStyle.paddingBottom),
            lineHeightRatio: lineHeight / parseFloat(valueStyle.fontSize),
            valueDisplay: valueStyle.display,
            valueAlignContent: valueStyle.alignContent,
            cardRows: cardStyle.gridTemplateRows,
            wrapperIsOnlyChild: value.childElementCount === 1 && value.firstElementChild === contentBlock,
            wrapperContainsRangeParts: contentBlock.querySelector(':scope > .damage-result-label + wbr + .damage-range-value') !== null,
            pageOverflow: document.documentElement.scrollWidth > innerWidth
          };
        }, { labelText, rangeText });
        const exactOneLineRhythm = await measureRhythm('架空必殺A：', '171.9万〜177.2万');
        const oneLineRhythm = await measureRhythm('技：', '171.9万〜177.2万');
        const twoLineRhythm = await measureRhythm('非常に長い攻撃名：', '171.9万〜177.2万');
        if (width === 390) assert.equal(exactOneLineRhythm.sameLine, true, JSON.stringify({ width, browserName, exactOneLineRhythm }));
        assert.equal(oneLineRhythm.sameLine, true, JSON.stringify({ width, browserName, oneLineRhythm }));
        assert.equal(twoLineRhythm.sameLine, false, JSON.stringify({ width, browserName, twoLineRhythm }));
        for (const rhythm of [exactOneLineRhythm, oneLineRhythm, twoLineRhythm]) {
          assert.ok(rhythm.headingValueGap >= 5, JSON.stringify({ width, browserName, rhythm }));
          assert.ok(rhythm.bottomInset >= 5, JSON.stringify({ width, browserName, rhythm }));
          assert.ok(rhythm.valueAreaHeight >= 50, JSON.stringify({ width, browserName, rhythm }));
          assert.ok(Math.abs(rhythm.valueTopInset - rhythm.valueBottomInset) <= 1, JSON.stringify({ width, browserName, rhythm }));
          assert.equal(rhythm.paddingTop, 0, JSON.stringify({ width, browserName, rhythm }));
          assert.equal(rhythm.paddingBottom, 0, JSON.stringify({ width, browserName, rhythm }));
          assert.ok(rhythm.lineHeightRatio >= 1.25 && rhythm.lineHeightRatio <= 1.4, JSON.stringify({ width, browserName, rhythm }));
          assert.equal(rhythm.valueDisplay, 'grid', JSON.stringify({ width, browserName, rhythm }));
          assert.equal(rhythm.valueAlignContent, 'center', JSON.stringify({ width, browserName, rhythm }));
          assert.match(rhythm.cardRows, /50px/, JSON.stringify({ width, browserName, rhythm }));
          assert.equal(rhythm.wrapperIsOnlyChild, true, JSON.stringify({ width, browserName, rhythm }));
          assert.equal(rhythm.wrapperContainsRangeParts, true, JSON.stringify({ width, browserName, rhythm }));
          assert.equal(rhythm.pageOverflow, false, JSON.stringify({ width, browserName, rhythm }));
        }
      } finally {
        await run.close();
      }
    }
  });
}

for (const [browserName, getBrowser] of [['Chromium', () => chromiumBrowser], ['WebKit', () => webkitBrowser]]) {
  test(`${browserName}: 単一HTML確認版をfile/OneDrive相当で直接開ける`, { timeout: TEST_TIMEOUT }, async () => {
    const url = new URL(DEVICE_PREVIEW_URL);
    url.searchParams.set('dbName', `phase8-file-${browserName}-${crypto.randomUUID()}`);
    const run = await openChecked(getBrowser(), url.href, { viewport: { width: 390, height: 844 }, context: { isMobile: true, hasTouch: true } });
    try {
      await run.goto();
      assert.equal(await run.page.locator('#event-select option').count(), 4);
      assert.equal(await run.page.locator('#character-management').count(), 0);
      assert.equal(await run.page.locator('#expand-all-scenarios').isVisible(), true);
      assert.equal(await run.page.locator('#collapse-all-scenarios').isVisible(), true);
      await selectAndCalculate(run.page, 'preview:event:void');
      assert.match(await run.page.locator('.preview-notice').innerText(), /単一HTML/);
      assert.equal(await run.page.locator('body').evaluate(() => document.body.scrollWidth <= innerWidth), true);
    } finally {
      await run.close();
    }
  });
}

test('削除済み・破損・旧raw形式の前回eventを安全に復元または初回へ戻す', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('last-event'));
  try {
    await run.goto();
    await run.page.evaluate(({ last, state }) => {
      localStorage.removeItem(state);
      localStorage.setItem(last, 'preview:event:forest');
    }, { last: LAST_EVENT_KEY, state: RC_STORAGE_KEY });
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('#event-select').inputValue(), 'preview:event:forest');

    await run.page.evaluate(({ last, state }) => {
      localStorage.removeItem(state);
      localStorage.setItem(last, '{broken');
    }, { last: LAST_EVENT_KEY, state: RC_STORAGE_KEY });
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('#event-select').inputValue(), '');

    await run.page.evaluate(({ last, state }) => {
      localStorage.removeItem(state);
      localStorage.setItem(last, JSON.stringify({ schemaVersion: 1, eventId: 'preview:event:deleted' }));
    }, { last: LAST_EVENT_KEY, state: RC_STORAGE_KEY });
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('#event-select').inputValue(), '');
    assert.equal(await run.page.evaluate((key) => localStorage.getItem(key), LAST_EVENT_KEY), null);
  } finally {
    await run.close();
  }
});

test('1操作更新は全検査後だけ永続known-good化し、reload後も新releaseを使う', { timeout: TEST_TIMEOUT }, async () => {
  const candidate = newerRelease('phase8-synthetic-preview-v2', '2026-08-25T00:00:00.000Z', (runtime) => {
    runtime.events[1].name.value = '架空イベント・空（更新後）';
  });
  const responses = artifactsAsResponses(candidate);
  let candidateEnabled = false;
  const run = await openChecked(chromiumBrowser, rcUrl('update-success'));
  await run.context.route('**/release-candidate/phase8/data/**', async (route) => {
    if (!candidateEnabled) return route.continue();
    const marker = '/release-candidate/phase8/data/';
    const relative = new URL(route.request().url()).pathname.split(marker)[1];
    const response = responses.get(relative);
    if (!response) return route.continue();
    return route.fulfill({ status: 200, body: response.text, contentType: response.contentType });
  });
  try {
    await run.goto();
    await selectAndCalculate(run.page, 'preview:event:sky');
    candidateEnabled = true;
    await run.page.locator('#data-settings').evaluate((element) => { element.open = true; });
    await run.page.locator('#update-button').click();
    await run.page.waitForFunction(() => globalThis.Phase8RC.store.active?.datasetVersion === 'phase8-synthetic-preview-v2');
    await run.page.waitForFunction(() => document.querySelector('#update-status')?.textContent.includes('更新しました'));
    assert.match(await run.page.locator('#update-status').innerText(), /更新しました/);
    assert.equal(await run.page.locator('#event-select').inputValue(), 'preview:event:sky');
    assert.match(await run.page.locator('#event-select option:checked').innerText(), /更新後/);
    const stored = await run.page.evaluate(async () => {
      const active = globalThis.Phase8RC.store.active.datasetVersion;
      const knownGood = globalThis.Phase8RC.store.knownGood.datasetVersion;
      const history = JSON.parse(localStorage.getItem('dokkan_phase8_rc_update_history_v1'));
      return { active, knownGood, history };
    });
    assert.equal(stored.active, candidate.manifest.datasetVersion);
    assert.equal(stored.knownGood, candidate.manifest.datasetVersion);
    assert.equal(stored.history.at(-1).status, 'applied');

    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.match(await run.page.locator('#data-version').textContent(), /phase8-synthetic-preview-v2/);

    await run.page.evaluate(() => globalThis.Phase8RC.store.corruptActiveForTest());
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.match(await run.page.locator('#data-version').textContent(), /phase8-synthetic-pc-recheck-v2/);

    await run.page.locator('#data-settings').evaluate((element) => { element.open = true; });
    await run.page.locator('#update-button').click();
    await run.page.waitForFunction(() => globalThis.Phase8RC.store.active?.datasetVersion === 'phase8-synthetic-preview-v2');
    await run.page.evaluate(() => globalThis.Phase8RC.store.deleteKnownGoodForTest());
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.match(await run.page.locator('#data-version').textContent(), /phase8-synthetic-pc-recheck-v2/);
  } finally {
    await run.close();
  }
});

test('追加feedback: 保存移行UI・通常導線・専用entry・PAT要求がrelease candidateに存在しない', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('no-saved-data-migration'));
  try {
    await run.goto();
    assert.equal(await run.page.getByText('保存データ移行', { exact: true }).count(), 0);
    assert.equal(await run.page.locator('#migration-link, #migration-button, #saved-data-summary, a[href*="migration"]').count(), 0);
    assert.equal(await run.page.locator('input[name*="pat" i], input[id*="pat" i], input[placeholder*="PAT" i]').count(), 0);
    assert.equal(await run.page.locator('body').innerText().then((text) => /Pagesへ保存データを移す/.test(text)), false);
    for (const relativePath of [
      'migration-device-check.html',
      'migration-from-current.html',
      'migration-target.html',
      'migration-bridge.js',
      'migration-target.mjs'
    ]) {
      assert.equal(existsSync(path.join(REPO_ROOT, 'release-candidate', 'phase8', relativePath)), false);
    }
    const [appSource, devicePreview] = await Promise.all([
      readFile(path.join(REPO_ROOT, 'release-candidate', 'phase8', 'app.mjs'), 'utf8'),
      readFile(path.join(REPO_ROOT, 'release-candidate', 'phase8', 'device-preview.html'), 'utf8')
    ]);
    for (const text of [appSource, devicePreview]) {
      for (const migrationOnlyToken of [
        'legacyEnemyToRuntime',
        'configureLegacyEnemy',
        'loadedEnemy',
        'dokkan_phase8_rc_imported_',
        'migration-device-check.html',
        'migration-from-current.html',
        'migration-target.html'
      ]) {
        assert.doesNotMatch(text, new RegExp(migrationOnlyToken.replaceAll('.', '\\.')));
      }
    }
  } finally {
    await run.close();
  }
});

test('digest不一致・health失敗・適用途中失敗は1操作UIで旧known-goodを維持する', { timeout: TEST_TIMEOUT }, async () => {
  const digestCandidate = newerRelease('phase8-synthetic-rejected-digest', '2026-08-25T01:00:00.000Z');
  const healthCandidate = newerRelease('phase8-synthetic-rejected-health', '2026-08-25T02:00:00.000Z');
  const applyCandidate = newerRelease('phase8-synthetic-rejected-apply', '2026-08-25T03:00:00.000Z');
  let scenario = null;
  const run = await openChecked(chromiumBrowser, rcUrl('update-failures'));
  await run.context.route('**/release-candidate/phase8/data/**', async (route) => {
    if (!scenario) return route.continue();
    const marker = '/release-candidate/phase8/data/';
    const relative = new URL(route.request().url()).pathname.split(marker)[1];
    if (scenario.healthIndexPath === relative) return route.fulfill({ status: 200, body: '{}', contentType: 'application/json' });
    const response = scenario.responses.get(relative);
    if (!response) return route.continue();
    const body = scenario.corruptFullPath === relative ? response.text + ' ' : response.text;
    return route.fulfill({ status: 200, body, contentType: response.contentType });
  });
  try {
    await run.goto();
    await run.page.locator('#data-settings').evaluate((element) => { element.open = true; });
    const cases = [
      { candidate: digestCandidate, code: 'FULL_RUNTIME_SIZE_MISMATCH', corruptFullPath: digestCandidate.manifest.full.json.path },
      { candidate: healthCandidate, code: 'HEALTH_CHECK_FAILED', healthIndexPath: healthCandidate.manifest.chunked.indexJson.path },
      { candidate: applyCandidate, code: 'ATOMIC_APPLY_FAILED', failpoint: 'after-pointer' }
    ];
    for (const item of cases) {
      scenario = { responses: artifactsAsResponses(item.candidate), corruptFullPath: item.corruptFullPath, healthIndexPath: item.healthIndexPath };
      await run.page.evaluate((failpoint) => { globalThis.Phase8RC.store.failpoint = failpoint; }, item.failpoint ?? null);
      await run.page.locator('#update-button').click();
      await run.page.waitForFunction(() => !document.querySelector('#update-button').disabled);
      const state = await run.page.evaluate(() => {
        const history = JSON.parse(localStorage.getItem('dokkan_phase8_rc_update_history_v1'));
        return {
          active: globalThis.Phase8RC.store.active.datasetVersion,
          knownGood: globalThis.Phase8RC.store.knownGood.datasetVersion,
          latest: history.at(-1)
        };
      });
      assert.equal(state.active, 'phase8-synthetic-pc-recheck-v2');
      assert.equal(state.knownGood, 'phase8-synthetic-pc-recheck-v2');
      assert.equal(state.latest.code, item.code);
      assert.match(await run.page.locator('#update-status').innerText(), /更新しませんでした.*そのまま安全に使えます/);
    }
  } finally {
    await run.close();
  }
});

test('壊れたbrowser cacheはdigestで破棄し、同じartifactを再取得する', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, rcUrl('cache-recovery'));
  try {
    await run.goto();
    await run.page.evaluate(async () => {
      const client = globalThis.Phase8RC.client;
      const descriptor = client.manifest.chunked.indexJson;
      const key = `${client.url(descriptor.path)}?phase8Digest=${encodeURIComponent(descriptor.digest)}`;
      const cache = await caches.open('dokkan-phase8-rc-artifacts-v1');
      await cache.put(key, new Response('{"broken":true}', { headers: { 'Content-Type': 'application/json' } }));
    });
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    const metrics = await run.page.evaluate(() => globalThis.Phase8RC.client.metrics);
    assert.equal(metrics.corruptCacheEntries, 1);
    assert.ok(metrics.networkLoads >= 1);
    assert.equal(await run.page.locator('#event-select option').count(), 4);
  } finally {
    await run.close();
  }
});
