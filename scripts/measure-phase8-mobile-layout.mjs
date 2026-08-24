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
    const criticalDetails = document.querySelector('.critical-settings');
    const summary = document.querySelector('[data-role="durability-condition-summary"]');
    const summaryCells = [...summary.children].map((element) => element.getBoundingClientRect());
    return {
      pageHeight: document.documentElement.scrollHeight,
      scenarioCardHeight: Math.round(card?.height ?? 0),
      scenarioInputsHeight: Math.round((affinity?.bottom ?? 0) - (card?.top ?? 0)),
      durabilityBottom: Math.round((durability?.bottom ?? 0) - (card?.top ?? 0)),
      inputHeight: Math.round(firstInput?.height ?? 0),
      criticalDefaultClosed: criticalDetails.open === false,
      criticalSummaryHeight: Math.round(criticalDetails.querySelector('summary').getBoundingClientRect().height),
      resultSummarySameRow: new Set(summaryCells.map((cell) => Math.round(cell.top))).size === 1,
      resultSummaryOverflow: summary.scrollWidth - summary.clientWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      viewportWidth: innerWidth
    };
  });
  await page.locator('.critical-settings summary').first().click();
  Object.assign(result, await page.evaluate(() => {
    const criticalAttack = document.querySelector('[data-role="critical-attack"]').getBoundingClientRect();
    const criticalDefense = document.querySelector('[data-role="critical-defense"]').getBoundingClientRect();
    const criticalToggle = document.querySelector('.critical-toggle').getBoundingClientRect();
    return {
      criticalInputsSameRow: Math.abs(criticalAttack.top - criticalDefense.top) < 2,
      criticalToggleHeight: Math.round(criticalToggle.height),
      criticalOpenPageHeight: document.documentElement.scrollHeight,
      criticalOpenNoHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
    };
  }));
  await page.locator('.critical-settings summary').first().click();
  await page.locator('#mode-damage').check();
  await page.locator('#event-select').selectOption('preview:event:forest');
  await page.waitForFunction(() => globalThis.Phase8RC.state.event?.id === 'preview:event:forest');
  await page.locator('#enemy-select').selectOption('preview:enemy:green');
  result.enemySelectFocus = [];
  for (const selector of ['#event-select', '#stage-select', '#enemy-select', '#attack-select', '[data-condition="turn"]', '[data-condition="hp"]']) {
    const control = page.locator(selector).first();
    await control.focus();
    result.enemySelectFocus.push(await control.evaluate((element, currentSelector) => {
      const style = getComputedStyle(element);
      return {
        selector: currentSelector,
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        outlineStyle: style.outlineStyle,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    }, selector));
  }
  Object.assign(result, await page.evaluate(() => {
    const ranges = [...document.querySelectorAll('.attack-range-value')];
    const rangeLines = ranges.map((element) => {
      const textRange = document.createRange();
      textRange.selectNodeContents(element);
      return textRange.getClientRects().length;
    });
    return {
      attackRangeCount: ranges.length,
      attackRangesSingleLine: rangeLines.every((count) => count === 1),
      attackRangeOverflow: Math.max(0, ...ranges.map((element) => element.scrollWidth - element.clientWidth)),
      attackRangesNotScrollable: ranges.every((element) => getComputedStyle(element).overflowX === 'hidden'),
      damageModeHorizontalOverflow: document.documentElement.scrollWidth > innerWidth
    };
  }));
  await page.locator('#attack-select').selectOption('normal');
  Object.assign(result, await page.evaluate(() => {
    const cards = document.querySelectorAll('.damage-results > div');
    const damageHeading = cards[0].querySelector(':scope > span').getBoundingClientRect();
    const damageValue = document.querySelector('[data-role="damage-result"]');
    const damageValueStyle = getComputedStyle(damageValue);
    const damageContent = damageValue.querySelector('.damage-result-content');
    const damageLabelElement = damageValue.querySelector('.damage-result-label');
    const range = document.querySelector('.damage-range-value');
    const measureRhythm = (labelText, rangeText) => {
      damageLabelElement.textContent = labelText;
      range.textContent = rangeText;
      const valueRect = damageValue.getBoundingClientRect();
      const contentRect = damageContent.getBoundingClientRect();
      const labelRect = damageLabelElement.getBoundingClientRect();
      const rangeRect = range.getBoundingClientRect();
      return {
        sameLine: Math.abs(labelRect.top - rangeRect.top) < parseFloat(damageValueStyle.lineHeight) * 0.6,
        headingValueGap: Number((Math.min(labelRect.top, rangeRect.top) - damageHeading.bottom).toFixed(2)),
        valueAreaHeight: Number(valueRect.height.toFixed(2)),
        valueTopInset: Number((contentRect.top - valueRect.top).toFixed(2)),
        valueBottomInset: Number((valueRect.bottom - contentRect.bottom).toFixed(2))
      };
    };
    const oneLineRhythm = measureRhythm('架空必殺A：', '171.9万〜177.2万');
    const twoLineRhythm = measureRhythm('非常に長い攻撃名：', '171.9万〜177.2万');
    const textRange = document.createRange();
    textRange.selectNodeContents(range);
    return {
      damageResultWidthRatio: Number((cards[0].getBoundingClientRect().width / cards[1].getBoundingClientRect().width).toFixed(3)),
      damageRangeSingleLine: textRange.getClientRects().length === 1,
      damageRangeOverflow: range.scrollWidth - range.clientWidth,
      damageValuePaddingTop: damageValueStyle.paddingTop,
      damageValuePaddingBottom: damageValueStyle.paddingBottom,
      damageValueLineHeight: damageValueStyle.lineHeight,
      damageValueDisplay: damageValueStyle.display,
      damageValueAlignContent: damageValueStyle.alignContent,
      damageOneLineRhythm: oneLineRhythm,
      damageTwoLineRhythm: twoLineRhythm,
      damageResultHorizontalOverflow: document.documentElement.scrollWidth > innerWidth
    };
  }));
  await page.locator('#mode-durability').check();
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
