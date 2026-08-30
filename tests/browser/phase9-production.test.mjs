import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { chromium, webkit } from 'playwright';

import { startStaticServer } from '../helpers/static-server.mjs';

const SYSTEM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TEST_TIMEOUT = 120_000;
const STATE_KEY = 'dokkan_calc_pages_state_v1';
const LAST_EVENT_KEY = 'dokkan_calc_pages_last_event_v1';
const METRICS_KEY = 'dokkan_calc_production_update_history_v1';
const LEGACY_KEY = 'dokkan_calc_data_v22';
const RETIRED_IMPORT_KEY = 'dokkan_phase8_rc_imported_dokkan_calc_data_v22';
const PAT_KEY = 'dokkan_github_pat';

let chromiumBrowser;
let webkitBrowser;
let server;

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

function productionUrl(label) {
  const url = new URL('/index.html', server.origin);
  url.searchParams.set('dbName', `phase9-production-${label}-${crypto.randomUUID()}`);
  return url.href;
}

async function openChecked(browser, label, viewport, { seedLegacy = false } = {}) {
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport,
    ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {})
  });
  if (seedLegacy) {
    await context.addInitScript(({ legacyKey, retiredKey, patKey }) => {
      localStorage.setItem(legacyKey, JSON.stringify({ characters: [{ name: '移行してはいけない', char_def: '999999' }] }));
      localStorage.setItem(retiredKey, JSON.stringify({ imported: true }));
      localStorage.setItem(patKey, 'test-pat-must-remain-unread');
    }, { legacyKey: LEGACY_KEY, retiredKey: RETIRED_IMPORT_KEY, patKey: PAT_KEY });
  }
  const page = await context.newPage();
  const diagnostics = { console: [], page: [], failed: [], http: [] };
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.console.push(message.text()); });
  page.on('pageerror', (error) => diagnostics.page.push(error.message));
  page.on('requestfailed', (request) => diagnostics.failed.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', (response) => { if (response.status() >= 400) diagnostics.http.push(`${response.status()} ${response.url()}`); });
  const url = productionUrl(label);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => globalThis.__dokkanCalcReady === true, null, { timeout: 60_000 });
  return {
    context,
    page,
    url,
    diagnostics,
    async close() {
      await page.waitForTimeout(50).catch(() => {});
      assert.deepEqual(diagnostics.page, [], `page errors: ${JSON.stringify(diagnostics.page)}`);
      assert.deepEqual(diagnostics.console, [], `console errors: ${JSON.stringify(diagnostics.console)}`);
      assert.deepEqual(diagnostics.failed, [], `failed requests: ${JSON.stringify(diagnostics.failed)}`);
      assert.deepEqual(diagnostics.http, [], `HTTP errors: ${JSON.stringify(diagnostics.http)}`);
      await context.close();
    }
  };
}

async function selectFirstProductionEnemy(page) {
  await page.locator('#mode-damage').check();
  await page.locator('#event-select').selectOption({ index: 1 });
  await page.waitForFunction(() => globalThis.DokkanCalcApp.state.cards[0]?.event != null);
  assert.notEqual(await page.locator('#stage-select').inputValue(), '');
  await page.locator('#enemy-select').selectOption({ index: 1 });
  await page.waitForFunction(() => {
    const value = document.querySelector('#damage-result')?.textContent ?? '';
    return value !== '敵を選択してください' && value !== '攻撃を選択してください';
  });
}

test.before(async () => {
  server = await startStaticServer();
  chromiumBrowser = await launchChromium();
  webkitBrowser = await webkit.launch({ headless: true });
});

test.after(async () => {
  await chromiumBrowser?.close();
  await webkitBrowser?.close();
  await server?.close();
});

test('Phase 9 production root uses the approved UI and only the existing production release', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, 'root-boundary', { width: 1440, height: 1000 }, { seedLegacy: true });
  try {
    const { page } = run;
    assert.equal(await page.locator('html').getAttribute('data-app-environment'), 'production');
    assert.equal(await page.title(), 'ドッカンバトル 耐久計算ツール');
    assert.equal(await page.locator('#event-select option').count(), 57);
    assert.deepEqual(await page.evaluate(() => ({
      datasetVersion: DokkanCalcApp.client.manifest.datasetVersion,
      events: DokkanCalcApp.client.manifest.counts.events,
      enemies: DokkanCalcApp.client.manifest.counts.enemies,
      source: DokkanCalcApp.client.manifest.source,
      areaAttacks: DokkanCalcApp.client.manifest.sourceCounts.areaAttacks,
      production: DokkanCalcApp.environment.production,
      rcGlobal: typeof Phase8RC,
      phase8Ready: typeof __phase8Ready
    })), {
      datasetVersion: 'legacy-production-runtime:f1cb27a2e5cae962',
      events: 56,
      enemies: 4245,
      source: {
        kind: 'existing-production-repository-data',
        path: 'scraper/all_enemies.json',
        digest: 'sha256:f1cb27a2e5cae9627be61934aaabec79e4af0b42d3e21ad0cc7945eb6d7a0b40',
        networkRequests: 0,
        savedCacheCandidateIncluded: false,
        syntheticFixtureIncluded: false,
        embeddedPresetMatches: true
      },
      areaAttacks: 0,
      production: true,
      rcGlobal: 'undefined',
      phase8Ready: 'undefined'
    });
    const body = await page.locator('body').innerText();
    assert.doesNotMatch(body, /Phase 8|確認版|release candidate|架空イベント|キャラクター管理|保存データ移行|GitHub PAT/iu);
    assert.equal(await page.locator('#update-button').count(), 1);
    assert.equal(await page.getByRole('button', { name: '今すぐ再計算' }).count(), 0);
    assert.equal(await page.getByText('被ダメージ0に必要なDEF', { exact: true }).count(), 0);
    assert.equal(await page.locator('#char-def').inputValue(), '0');
    const keys = await page.evaluate(({ state, legacy, retired, pat }) => ({
      state: localStorage.getItem(state),
      legacy: localStorage.getItem(legacy),
      retired: localStorage.getItem(retired),
      pat: localStorage.getItem(pat)
    }), { state: STATE_KEY, legacy: LEGACY_KEY, retired: RETIRED_IMPORT_KEY, pat: PAT_KEY });
    assert.ok(keys.state);
    assert.ok(keys.legacy);
    assert.ok(keys.retired);
    assert.equal(keys.pat, 'test-pat-must-remain-unread');
    assert.doesNotMatch(keys.state, /移行してはいけない|999999|test-pat/);
  } finally {
    await run.close();
  }
});

test('Phase 9 production PC flow calculates durability, normal, Super, and custom attacks automatically', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, 'pc-calculation', { width: 1440, height: 1000 });
  try {
    const { page } = run;
    assert.equal(await page.locator('#mode-durability').isChecked(), true);
    assert.equal(await page.locator('.critical-settings').first().evaluate((element) => element.open), false);
    await page.locator('#char-def').fill('500000');
    const beforeAdditionalDef = await page.locator('#final-defense').innerText();
    await page.locator('#memory').fill('10');
    assert.notEqual(await page.locator('#final-defense').innerText(), beforeAdditionalDef);
    await page.locator('#damage-reduction').fill('30');
    await page.locator('#guard').check();
    await page.locator('#durability-own-affinity').selectOption('extreme:int');
    await page.locator('#durability-enemy-affinity').selectOption('super:phy');
    assert.equal(await page.locator('#own-class').inputValue(), 'extreme');
    assert.equal(await page.locator('#own-type').inputValue(), 'int');
    assert.equal(await page.locator('[data-role="durability-summary-reduction"]').innerText(), '30%');
    assert.equal(await page.locator('[data-role="durability-summary-guard"]').innerText(), 'あり');
    assert.match(await page.locator('[data-role="durability-table"]').innerText(), /完封|70万/);

    await selectFirstProductionEnemy(page);
    assert.equal(await page.locator('#attack-select').inputValue(), 'normal');
    const normalDamage = await page.locator('#damage-result').innerText();
    assert.match(normalDamage, /^通常攻撃：\s*.+/s);
    const superValue = await page.locator('#attack-select option').evaluateAll((options) => options.map((option) => option.value).find((value) => value.startsWith('super:')) ?? null);
    assert.ok(superValue, 'the first production enemy must expose its stored Super attack');
    await page.locator('#attack-select').selectOption(superValue);
    assert.match(await page.locator('#damage-result').innerText(), /^必殺攻撃/);

    await page.locator('.manual-attack-settings').first().evaluate((element) => { element.open = true; });
    await page.locator('[data-role="manual-enemy-attack"]').first().fill('321');
    await page.locator('#attack-select').selectOption('custom');
    assert.match(await page.locator('#damage-result').innerText(), /^カスタム攻撃：/);
    assert.notEqual(await page.locator('#damage-result').innerText(), normalDamage);
    assert.equal(await page.locator('#attack-select option').evaluateAll((options) => options.some((option) => option.value.startsWith('area:'))), false);
  } finally {
    await run.close();
  }
});

test('Phase 9 production Pages-local autosave restores multiple cards without reading legacy state', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, 'autosave', { width: 1280, height: 900 });
  try {
    const { page } = run;
    await page.locator('#char-def').fill('654321');
    await page.locator('#damage-reduction').fill('42');
    await page.locator('#theme-button').click();
    await page.locator('#add-scenario-button').click();
    assert.equal(await page.locator('.scenario-card').count(), 2);
    await page.locator('.scenario-card').nth(1).locator('[data-role="scenario-title"]').fill('保存される状況');
    const before = await page.evaluate(() => JSON.stringify(DokkanCalcApp.scenarioData()));
    await page.locator('#collapse-all-scenarios').click();
    assert.equal(await page.locator('[data-role="scenario-body"]:visible').count(), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(DokkanCalcApp.scenarioData())), before);
    await page.locator('#expand-all-scenarios').click();
    assert.equal(await page.locator('[data-role="scenario-body"]:visible').count(), 2);
    assert.equal(await page.evaluate(() => JSON.stringify(DokkanCalcApp.scenarioData())), before);

    const saved = await page.evaluate((key) => localStorage.getItem(key), STATE_KEY);
    assert.ok(saved?.includes('保存される状況'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__dokkanCalcReady === true);
    assert.equal(await page.locator('.scenario-card').count(), 2);
    assert.equal(await page.locator('#char-def').inputValue(), '654321');
    assert.equal(await page.locator('#damage-reduction').inputValue(), '42');
    assert.equal(await page.locator('.scenario-card').nth(1).locator('[data-role="scenario-title"]').inputValue(), '保存される状況');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  } finally {
    await run.close();
  }
});

test('Phase 9 production one-operation update validates the bundled current release', { timeout: TEST_TIMEOUT }, async () => {
  const run = await openChecked(chromiumBrowser, 'update-current', { width: 1280, height: 900 });
  try {
    await run.page.locator('#data-settings').evaluate((element) => { element.open = true; });
    await run.page.locator('#update-button').click();
    await run.page.waitForFunction(() => document.querySelector('#update-status')?.textContent === 'すでに最新です。');
    const history = await run.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), METRICS_KEY);
    assert.equal(history.at(-1)?.status, 'unchanged');
    assert.equal(history.at(-1)?.code, 'ALREADY_CURRENT');
    assert.equal(await run.page.evaluate(() => DokkanCalcApp.store.active.datasetVersion === DokkanCalcApp.store.knownGood.datasetVersion), true);
  } finally {
    await run.close();
  }
});

for (const [browserName, getBrowser] of [['Chromium', () => chromiumBrowser], ['WebKit', () => webkitBrowser]]) {
  for (const width of [360, 390]) {
    test(`Phase 9 production ${browserName} ${width}px has no overflow or rendering regression`, { timeout: TEST_TIMEOUT }, async () => {
      const run = await openChecked(getBrowser(), `${browserName}-${width}`, { width, height: 844 });
      try {
        const { page } = run;
        assert.equal(await page.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), true);
        assert.ok(await page.locator('#char-def').evaluate((element) => element.getBoundingClientRect().height >= 40));
        await selectFirstProductionEnemy(page);
        assert.equal(await page.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), true);
        assert.equal(await page.locator('.damage-results').evaluate((element) => element.getBoundingClientRect().right <= innerWidth + 0.5), true);
        assert.match(await page.locator('#damage-result').innerText(), /^通常攻撃：/);
        assert.match(await page.locator('[data-role="result-types"]').innerText(), /自分：.+\n敵：.+/);
      } finally {
        await run.close();
      }
    });
  }
}
