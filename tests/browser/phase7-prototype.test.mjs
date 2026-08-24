import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { chromium } from 'playwright';

import { generatePhase7Delivery } from '../../scripts/generate-phase7-runtime-delivery.mjs';
import { startStaticServer } from '../helpers/static-server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROTOTYPE_PATH = '/prototypes/phase7-runtime-delivery/index.html';
const FILE_PROTOTYPE_URL = new URL('../../prototypes/phase7-runtime-delivery/index.html', import.meta.url);
const REPRESENTATIVE_ROOT = path.join(REPO_ROOT, 'generated', 'phase7', 'representative-data');
const REPRESENTATIVE_RUNTIME = path.join(REPO_ROOT, 'tests', 'fixtures', 'future', 'enemy-data-runtime-v1.representative.json');
const DATA_QUERY = '../../generated/phase7/representative-data';
const SYSTEM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TEST_TIMEOUT = 90_000;

let browser;
let staticServer;

async function launchBrowser() {
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

function prototypeUrl({ mode, delivery = 'fetch', file = false }) {
  const url = file ? new URL(FILE_PROTOTYPE_URL) : new URL(PROTOTYPE_PATH, staticServer.origin);
  url.searchParams.set('mode', mode);
  url.searchParams.set('delivery', delivery);
  url.searchParams.set('dataRoot', DATA_QUERY);
  return url.href;
}

async function openChecked(url, { viewport = { width: 1440, height: 1000 } } = {}) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport });
  const page = await context.newPage();
  const diagnostics = { console: [], page: [], failed: [] };
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.console.push(message.text()); });
  page.on('pageerror', (error) => diagnostics.page.push(error.message));
  page.on('requestfailed', (request) => diagnostics.failed.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  return {
    context,
    page,
    diagnostics,
    async close() {
      await page.waitForTimeout(25).catch(() => {});
      assert.deepEqual(diagnostics.page, [], `page errors: ${JSON.stringify(diagnostics.page)}`);
      assert.deepEqual(diagnostics.console, [], `console errors: ${JSON.stringify(diagnostics.console)}`);
      assert.deepEqual(diagnostics.failed, [], `failed requests: ${JSON.stringify(diagnostics.failed)}`);
      await context.close();
    }
  };
}

async function verifyCalculatorFlow(page, mode) {
  await page.waitForFunction(() => globalThis.__phase7Ready === true);
  assert.equal(await page.locator('#event-select option').count(), 18);
  assert.match(await page.locator('#load-status').innerText(), /準備完了/);
  const lastEventId = await page.locator('#event-select option').last().getAttribute('value');
  await page.locator('#event-select').selectOption(lastEventId);
  await page.waitForFunction((id) => globalThis.Phase7Prototype.state.event?.id === id, lastEventId);
  assert.equal(await page.locator('#event-select').inputValue(), lastEventId);
  assert.notEqual(await page.locator('#enemy-name').innerText(), '敵を選択してください');
  await page.locator('#character-defense').fill('0');
  await page.locator('#calculate-button').click();
  assert.match(await page.locator('#damage-result').innerText(), /\d/);
  const metrics = await page.evaluate(() => globalThis.__phase7Metrics);
  assert.equal(metrics.mode, mode);
  assert.ok(metrics.eventListReadyMs >= 0);
  if (mode === 'chunk') assert.ok(metrics.selectedEventBytes > 0);
}

test.before(async () => {
  await generatePhase7Delivery({ runtimePath: REPRESENTATIVE_RUNTIME, outputRoot: REPRESENTATIVE_ROOT });
  staticServer = await startStaticServer();
  browser = await launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await staticServer?.close();
});

for (const mode of ['full', 'chunk']) {
  test(`Pages相当HTTP ${mode}: event選択と主要計算がPC・mobile viewportで動く`, { timeout: TEST_TIMEOUT }, async () => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const run = await openChecked(prototypeUrl({ mode }), { viewport });
      try {
        await verifyCalculatorFlow(run.page, mode);
        assert.equal(await run.page.locator('body').evaluate((element) => element.scrollWidth <= innerWidth), true);
      } finally {
        await run.close();
      }
    }
  });
}

for (const mode of ['full', 'chunk']) {
  test(`file-compatible ${mode}: file直開きでevent選択と主要計算が動く`, { timeout: TEST_TIMEOUT }, async () => {
    const run = await openChecked(prototypeUrl({ mode, delivery: 'script', file: true }), { viewport: { width: 390, height: 844 } });
    try {
      await verifyCalculatorFlow(run.page, mode);
      assert.equal((await run.page.evaluate(() => globalThis.__phase7Metrics.delivery)), 'script');
    } finally {
      await run.close();
    }
  });
}

test('一操作更新画面はfull/chunk成功と各失敗時known-good維持を表示する', { timeout: TEST_TIMEOUT }, async () => {
  const url = new URL('/prototypes/phase7-runtime-delivery/update-prototype.html', staticServer.origin);
  url.searchParams.set('dataRoot', DATA_QUERY);
  const run = await openChecked(url.href);
  try {
    const cases = [
      ['full', 'none', 'applied', 'UPDATE_APPLIED'],
      ['chunk', 'none', 'applied', 'UPDATE_APPLIED'],
      ['full', 'digest', 'rejected', 'FULL_RUNTIME_SIZE_MISMATCH'],
      ['chunk', 'missing', 'rejected', 'EVENT_CHUNK_MISSING'],
      ['full', 'apply', 'rolled-back', 'ATOMIC_APPLY_FAILED'],
      ['full', 'health', 'rolled-back', 'HEALTH_CHECK_FAILED']
    ];
    for (const [mode, scenario, status, code] of cases) {
      await run.page.locator('#update-mode').selectOption(mode);
      await run.page.locator('#failure-scenario').selectOption(scenario);
      await run.page.locator('#update-button').click();
      await run.page.waitForFunction(() => globalThis.__phase7UpdateResult != null);
      const actual = await run.page.evaluate(() => globalThis.__phase7UpdateResult);
      assert.equal(actual.status, status, `${mode}/${scenario}: ${JSON.stringify(actual)}`);
      assert.equal(actual.code, code, `${mode}/${scenario}: ${JSON.stringify(actual)}`);
      assert.match(await run.page.locator('#update-result').innerText(), /known-good phase7-prototype-older-known-good|known-good runtime:/);
    }
  } finally {
    await run.close();
  }
});
