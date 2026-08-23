import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, webkit } from 'playwright';

import { generatePhase8Release } from './generate-phase8-release-candidate.mjs';
import { startStaticServer } from '../tests/helpers/static-server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'generated', 'phase8', 'release-candidate');
const REPORT_PATH = path.join(REPO_ROOT, 'artifacts', 'phase8', 'performance-report.json');
const SYSTEM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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

async function measure(browser, origin, sample) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: sample.viewport, ...(sample.mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  const dataResponses = [];
  page.on('response', (response) => {
    if (!response.url().includes('/generated/phase8/release-candidate/')) return;
    dataResponses.push({ url: response.url(), bytes: Number(response.headers()['content-length'] ?? 0), fromServiceWorker: response.fromServiceWorker() });
  });
  const url = new URL('/release-candidate/phase8/index.html', origin);
  url.searchParams.set('dataRoot', '../../generated/phase8/release-candidate');
  url.searchParams.set('dbName', `phase8-benchmark-${sample.name}-${Date.now()}`);
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => globalThis.__phase8Ready === true, null, { timeout: 90_000 });
  const cold = await page.evaluate(() => ({
    readyMs: globalThis.__phase8Metrics.readyMs,
    clientMetrics: { ...globalThis.Phase8RC.client.metrics },
    events: globalThis.Phase8RC.client.index.events.length
  }));
  const largestEvent = await page.evaluate(() => globalThis.Phase8RC.client.index.events.reduce((largest, event) => event.json.bytes > largest.json.bytes ? event : largest).id);
  const eventStarted = Date.now();
  await page.locator('#event-select').selectOption(largestEvent);
  await page.waitForFunction((eventId) => globalThis.Phase8RC.state.event?.id === eventId, largestEvent, { timeout: 90_000 });
  const largestEventMs = Date.now() - eventStarted;
  await page.locator('#calculate-button').click();
  assert.match(await page.locator('#damage-result').innerText(), /\d|完封/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__phase8Ready === true, null, { timeout: 90_000 });
  const warm = await page.evaluate(() => ({ readyMs: globalThis.__phase8Metrics.readyMs, clientMetrics: { ...globalThis.Phase8RC.client.metrics } }));
  const result = {
    name: sample.name,
    viewport: sample.viewport,
    touch: sample.mobile,
    cold,
    largestEventMs,
    warm,
    networkBytes: dataResponses.reduce((total, response) => total + response.bytes, 0),
    dataRequestCount: dataResponses.length
  };
  await context.close();
  return result;
}

export async function benchmarkPhase8ReleaseCandidate() {
  const generated = await generatePhase8Release({ outputRoot: OUTPUT_ROOT });
  const server = await startStaticServer();
  const chromiumBrowser = await launchChromium();
  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    const samples = [];
    samples.push(await measure(chromiumBrowser, server.origin, { name: 'chromium-desktop', viewport: { width: 1440, height: 1000 }, mobile: false }));
    samples.push(await measure(chromiumBrowser, server.origin, { name: 'chromium-mobile', viewport: { width: 390, height: 844 }, mobile: true }));
    samples.push(await measure(webkitBrowser, server.origin, { name: 'webkit-mobile', viewport: { width: 390, height: 844 }, mobile: true }));
    const thresholds = { maximumColdReadyMs: 3000, maximumLargestEventMs: 1000, expectedEvents: generated.summary.events };
    const violations = samples.flatMap((sample) => [
      ...(sample.cold.readyMs > thresholds.maximumColdReadyMs ? [`${sample.name}: cold ${sample.cold.readyMs}ms`] : []),
      ...(sample.largestEventMs > thresholds.maximumLargestEventMs ? [`${sample.name}: event ${sample.largestEventMs}ms`] : []),
      ...(sample.cold.events !== thresholds.expectedEvents ? [`${sample.name}: events ${sample.cold.events}`] : [])
    ]);
    const report = {
      measuredAt: new Date().toISOString(),
      environment: 'Windows loopback; actual Android/iPhone and network latency remain hands-on checks',
      dataset: generated.summary,
      phase7Reference: { desktopChunkReadyMs: 165.4, mobileFourTimesCpuChunkReadyMs: 1098.8, note: 'Different benchmark harness; directional comparison only.' },
      thresholds,
      violations,
      samples
    };
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    assert.deepEqual(violations, [], `Phase 8 performance threshold violations: ${violations.join(' / ')}`);
    return report;
  } finally {
    await chromiumBrowser.close();
    await webkitBrowser.close();
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  benchmarkPhase8ReleaseCandidate().then((report) => process.stdout.write(`${JSON.stringify(report)}\n`)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
