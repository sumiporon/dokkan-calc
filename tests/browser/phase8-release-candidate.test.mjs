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
  await page.locator('#event-select').selectOption(eventId);
  await page.waitForFunction((id) => globalThis.Phase8RC.state.event?.id === id, eventId);
  await page.locator('#char-def').fill('500000');
  await page.locator('#calculate-button').click();
  assert.match(await page.locator('#damage-result').innerText(), /〜|0/);
  assert.match(await page.locator('#perfect-defense').innerText(), /\d|完封/);
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
        await selectAndCalculate(run.page);
        await run.page.reload({ waitUntil: 'domcontentloaded' });
        await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
        assert.equal(await run.page.locator('#event-select').inputValue(), 'preview:event:sky');
        assert.equal(await run.page.locator('body').evaluate(() => document.body.scrollWidth <= innerWidth), true);
        assert.ok(await run.page.locator('#calculate-button').evaluate((element) => element.getBoundingClientRect().height >= 44));
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
    await run.page.evaluate((key) => localStorage.setItem(key, 'preview:event:forest'), LAST_EVENT_KEY);
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('#event-select').inputValue(), 'preview:event:forest');

    await run.page.evaluate((key) => localStorage.setItem(key, '{broken'), LAST_EVENT_KEY);
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.equal(await run.page.locator('#event-select').inputValue(), '');

    await run.page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, eventId: 'preview:event:deleted' })), LAST_EVENT_KEY);
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
    assert.match(await run.page.locator('#data-version').textContent(), /phase8-synthetic-preview-v1/);

    await run.page.locator('#data-settings').evaluate((element) => { element.open = true; });
    await run.page.locator('#update-button').click();
    await run.page.waitForFunction(() => globalThis.Phase8RC.store.active?.datasetVersion === 'phase8-synthetic-preview-v2');
    await run.page.evaluate(() => globalThis.Phase8RC.store.deleteKnownGoodForTest());
    await run.page.reload({ waitUntil: 'domcontentloaded' });
    await run.page.waitForFunction(() => globalThis.__phase8Ready === true);
    assert.match(await run.page.locator('#data-version').textContent(), /phase8-synthetic-preview-v1/);
  } finally {
    await run.close();
  }
});

test('実機確認用の架空移行も1ボタンで完了する', { timeout: TEST_TIMEOUT }, async () => {
  const source = new URL('/release-candidate/phase8/migration-device-check.html', staticServer.origin);
  const run = await openChecked(chromiumBrowser, source.href);
  try {
    await run.page.goto(source.href, { waitUntil: 'domcontentloaded' });
    const popupPromise = run.context.waitForEvent('page');
    await run.page.locator('#migration-button').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await run.page.waitForFunction(() => ['imported', 'unchanged'].includes(globalThis.__phase8MigrationResult?.status));
    const saved = await popup.evaluate(() => ({
      state: localStorage.getItem('dokkan_phase8_rc_imported_dokkan_calc_data_v22'),
      pat: localStorage.getItem('dokkan_phase8_rc_imported_dokkan_github_pat')
    }));
    assert.match(saved.state, /架空の保存キャラクター/);
    assert.equal(saved.pat, null);
    await popup.close();
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
      assert.equal(state.active, 'phase8-synthetic-preview-v1');
      assert.equal(state.knownGood, 'phase8-synthetic-preview-v1');
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

test('file移行元からPages相当へ1回移し、PAT・未知key・元データを変更しない', { timeout: TEST_TIMEOUT }, async () => {
  const target = new URL('/release-candidate/phase8/migration-target.html', staticServer.origin);
  const source = new URL('../../release-candidate/phase8/migration-from-current.html', import.meta.url);
  source.searchParams.set('target', target.href);
  const run = await openChecked(chromiumBrowser, source.href);
  try {
    await run.page.goto(source.href, { waitUntil: 'domcontentloaded' });
    const state = JSON.stringify({ durabilityLines: [], savedCharacters: [{ name: '移行確認' }], savedEnemies: [], currentScenarios: [], theme: 'dark' });
    await run.page.evaluate(({ state }) => {
      localStorage.setItem('dokkan_calc_data_v22', state);
      localStorage.setItem('dokkan_crit_overrides', '{"preview":true}');
      localStorage.setItem('dokkan_github_pat', 'must-not-migrate');
      localStorage.setItem('unknown-key', 'must-not-migrate');
    }, { state });
    const popupPromise = run.context.waitForEvent('page');
    await run.page.locator('#migration-button').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await run.page.waitForFunction(() => ['imported', 'unchanged'].includes(globalThis.__phase8MigrationResult?.status));
    const migrated = await popup.evaluate(() => ({
      state: localStorage.getItem('dokkan_phase8_rc_imported_dokkan_calc_data_v22'),
      critical: localStorage.getItem('dokkan_phase8_rc_imported_dokkan_crit_overrides'),
      pat: localStorage.getItem('dokkan_phase8_rc_imported_dokkan_github_pat'),
      unknown: localStorage.getItem('dokkan_phase8_rc_imported_unknown-key')
    }));
    assert.equal(migrated.state, state);
    assert.equal(migrated.critical, '{"preview":true}');
    assert.equal(migrated.pat, null);
    assert.equal(migrated.unknown, null);
    const sourceValues = await run.page.evaluate(() => ({
      state: localStorage.getItem('dokkan_calc_data_v22'),
      pat: localStorage.getItem('dokkan_github_pat'),
      unknown: localStorage.getItem('unknown-key')
    }));
    assert.equal(sourceValues.state, state);
    assert.equal(sourceValues.pat, 'must-not-migrate');
    assert.equal(sourceValues.unknown, 'must-not-migrate');
    await popup.close();
  } finally {
    await run.close();
  }
});
