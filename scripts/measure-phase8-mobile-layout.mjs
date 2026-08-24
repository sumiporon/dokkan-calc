import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

import { startStaticServer } from '../tests/helpers/static-server.mjs';

const SYSTEM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const requestedUrl = process.argv.find((argument) => argument.startsWith('--url='))?.slice('--url='.length) ?? null;
let server = null;
let browser = null;

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

async function openPreview(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const warningButton = page.getByRole('button', { name: 'Open the page' });
  if (await warningButton.count()) await warningButton.click();
  await page.waitForFunction(() => globalThis.__phase8Ready === true, null, { timeout: 60_000 });
}

async function measure(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true, locale: 'ja-JP' });
  const page = await context.newPage();
  const url = requestedUrl ?? new URL('/release-candidate/phase8/index.html?dbName=phase8-mobile-measure', server.origin).href;
  await openPreview(page, url);
  const result = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const card = rect('.scenario-card');
    const affinity = rect('.affinity-section');
    const durability = rect('[data-role="durability-result"]');
    const firstInput = rect('[data-role="char-def"]');
    const criticalAttack = rect('[data-role="critical-attack"]');
    const criticalDefense = rect('[data-role="critical-defense"]');
    const criticalToggle = rect('.critical-toggle');
    const summary = document.querySelector('[data-role="durability-condition-summary"]');
    const summaryCells = [...summary.children].map((element) => element.getBoundingClientRect());
    return {
      pageHeight: document.documentElement.scrollHeight,
      scenarioCardHeight: Math.round(card?.height ?? 0),
      scenarioInputsHeight: Math.round((affinity?.bottom ?? 0) - (card?.top ?? 0)),
      durabilityBottom: Math.round((durability?.bottom ?? 0) - (card?.top ?? 0)),
      inputHeight: Math.round(firstInput?.height ?? 0),
      criticalInputsSameRow: Math.abs((criticalAttack?.top ?? 0) - (criticalDefense?.top ?? 0)) < 2,
      criticalToggleHeight: Math.round(criticalToggle?.height ?? 0),
      resultSummarySameRow: new Set(summaryCells.map((cell) => Math.round(cell.top))).size === 1,
      resultSummaryOverflow: summary.scrollWidth - summary.clientWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      viewportWidth: innerWidth
    };
  });
  const collapseButton = page.locator('[data-action="toggle-collapse"]').first();
  if (await collapseButton.count()) {
    await collapseButton.click();
    result.collapsedPageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    result.collapsedScenarioCardHeight = Math.round(await page.locator('.scenario-card').first().evaluate((element) => element.getBoundingClientRect().height));
  }
  await context.close();
  return result;
}

try {
  if (!requestedUrl) server = await startStaticServer();
  browser = await launchBrowser();
  const measurements = [];
  for (const width of [360, 390]) measurements.push(await measure(width));
  console.log(JSON.stringify({ source: requestedUrl ?? 'local', measurements }, null, 2));
} finally {
  await browser?.close();
  await server?.close();
}
