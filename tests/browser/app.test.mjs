import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { chromium } from 'playwright';

import { startStaticServer } from '../helpers/static-server.mjs';

const APP_PATH = '/dokkan_calc_final.html';
const SYSTEM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TEST_TIMEOUT = 90_000;

let browser;
let staticServer;

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function launchTestBrowser() {
  const configuredExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const candidates = [];

  if (configuredExecutable) candidates.push(configuredExecutable);
  candidates.push(undefined);
  if (existsSync(SYSTEM_CHROME)) candidates.push(SYSTEM_CHROME);

  const failures = [];
  for (const executablePath of [...new Set(candidates)]) {
    try {
      return await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      });
    } catch (error) {
      failures.push(`${executablePath ?? 'Playwright Chromium'}: ${error.message}`);
    }
  }

  throw new Error(`Unable to launch a test browser.\n${failures.join('\n')}`);
}

const CDN_STUBS = {
  html2canvas: `
    window.html2canvas = async function html2canvasStub() {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas;
    };
  `,
  sortable: `
    window.Sortable = class SortableStub {
      constructor(element, options = {}) {
        this.element = element;
        this.options = { ...options };
      }
      destroy() {}
      option(name, value) {
        if (arguments.length === 1) return this.options[name];
        this.options[name] = value;
        return value;
      }
    };
  `,
};

async function runInFreshApp(runAssertions) {
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1440, height: 1100 },
  });
  const emptyStorage = await context.storageState();
  assert.deepEqual(emptyStorage.origins, [], 'A new BrowserContext must start without localStorage data.');

  await context.route('https://cdnjs.cloudflare.com/**', async (route) => {
    const body = route.request().url().includes('Sortable')
      ? CDN_STUBS.sortable
      : CDN_STUBS.html2canvas;
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body,
    });
  });

  const diagnostics = {
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
  };
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push({
      error: request.failure()?.errorText ?? 'unknown error',
      url: request.url(),
    });
  });
  page.on('dialog', (dialog) => dialog.accept());

  let testError;
  try {
    await page.goto(`${staticServer.origin}${APP_PATH}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.locator('#scenario-cards-container .card').first().waitFor();
    await runAssertions({ context, page });
  } catch (error) {
    testError = error;
  }

  await page.waitForTimeout(25).catch(() => {});
  try {
    assert.deepEqual(diagnostics.pageErrors, [], `Page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
    assert.deepEqual(diagnostics.consoleErrors, [], `Console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
    assert.deepEqual(diagnostics.failedRequests, [], `Failed requests: ${JSON.stringify(diagnostics.failedRequests)}`);
  } catch (diagnosticError) {
    if (testError) {
      testError.message += `\nBrowser diagnostics also failed: ${diagnosticError.message}`;
    } else {
      testError = diagnosticError;
    }
  } finally {
    await context.close();
  }

  if (testError) throw testError;
}

async function expandScenario(card) {
  await card.locator('.scenario-card-header').click();
  await assert.doesNotReject(async () => {
    await card.locator('.scenario-card-body.show').waitFor();
  });
}

async function expandOpponentSettings(card) {
  const body = card.locator('.sub-section-body');
  if (!(await body.isVisible())) {
    await card.locator('.sub-section-header').click();
  }
  await body.waitFor({ state: 'visible' });
}

test.before(async () => {
  staticServer = await startStaticServer();
  browser = await launchTestBrowser();
});

test.after(async () => {
  await browser?.close();
  await staticServer?.close();
});

test('起動、DEF計算、耐久ライン、モード切替、手動被ダメージ', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    assert.match(await page.locator('h1').innerText(), /耐久計算ツール \(v66\)/);
    assert.equal(await page.locator('#scenario-cards-container .card').count(), 1);

    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await card.locator('[data-input="char_def"]').fill('100000');
    await card.locator('[data-input="leader"]').fill('200');
    await card.locator('[data-input="passive"]').fill('100');
    await card.locator('[data-input="active"]').fill('50');
    await card.locator('[data-input="support_item"]').fill('50');

    assert.equal(await card.locator('.final-def-display').innerText(), '最終DEF: 1,350,000');
    const durabilityRows = (await card.locator('.result-body tr').allInnerTexts()).map(normalizeText);
    assert.deepEqual(durabilityRows, ['完封 135万', '70万 205万']);

    await expandOpponentSettings(card);
    await page.locator('#mode-damage').check();
    assert.equal(await page.locator('#mode-damage').isChecked(), true);
    assert.equal(await card.locator('[data-input="enemy_atk"]').isVisible(), true);
    await card.locator('[data-input="enemy_atk"]').fill('200');
    assert.equal(
      normalizeText(await card.locator('.manual-damage-result').innerText()),
      '敵ATK: 200万 → 被ダメ: 65万',
    );

    await page.locator('#mode-durability').check();
    assert.equal(await page.locator('#mode-durability').isChecked(), true);
    assert.equal(await card.locator('.result-body tr').count(), 2);
  });
});

test('登録済みの実敵をカスケード選択し、通常・必殺を表示する', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await expandOpponentSettings(card);

    await card.locator('[data-input="loaded_enemy_event_type"]').selectOption({ label: 'レッドゾーン' });
    await card.locator('[data-input="loaded_enemy_series"]').selectOption({ label: 'GT編' });
    await card.locator('[data-input="loaded_enemy_stage"]').selectOption({ label: 'VSレジック' });
    await card.locator('[data-input="loaded_enemy_boss"]').selectOption({ label: 'レジック' });
    await card.locator('.load-enemy-to-card-cascade-btn').click();

    const loadedEnemy = await card.evaluate((element) => JSON.parse(element.dataset.loadedEnemy ?? 'null'));
    assert.equal(loadedEnemy.name, 'レジック');
    assert.equal(loadedEnemy.baseAtk, 200_000);
    assert.equal(loadedEnemy.attacks.length, 2);
    assert.equal(await card.locator('[data-input="enemy_class"]').inputValue(), 'extreme');
    assert.equal(await card.locator('[data-input="enemy_type"]').inputValue(), 'agl');

    await page.locator('#mode-damage').check();
    const attackRows = card.locator('.dynamic-attacks-list .multi-attack-result-item');
    await attackRows.first().waitFor();
    assert.equal(await attackRows.count(), 2);
    const attackTexts = (await attackRows.allInnerTexts()).map(normalizeText);
    // Independent expectation: Super TEQ defending against Extreme AGL is
    // natural advantage across classes (type 1.0, guard 0.5), with zero DEF.
    assert.equal(attackTexts[0], '通常 ATK: 20万 被ダメ: 10万');
    assert.equal(attackTexts[1], '必殺 ATK: 50万 被ダメ: 25万');
    assert.equal(await card.locator('[data-input="enemy_atk"]').isVisible(), false);
  });
});

test('状況カードの追加・複製とキャラクター保存・読込', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const firstCard = page.locator('#scenario-cards-container .card').first();
    await expandScenario(firstCard);
    await firstCard.locator('[data-input="char_def"]').fill('123456');
    await firstCard.locator('.duplicate-scenario-btn').click();

    const cards = page.locator('#scenario-cards-container .card');
    assert.equal(await cards.count(), 2);
    assert.equal(await cards.nth(1).locator('.scenario-title-text').innerText(), '状況 1 (コピー)');
    assert.equal(await cards.nth(1).locator('[data-input="char_def"]').inputValue(), '123456');

    await page.locator('#new-character-name').fill('ブラウザテスト用');
    await page.locator('#save-character-btn').click();
    assert.deepEqual(await page.locator('#characters-list option').allInnerTexts(), ['ブラウザテスト用']);

    await page.locator('#add-scenario-btn').click();
    assert.equal(await cards.count(), 3);
    await firstCard.locator('[data-input="char_def"]').fill('999');
    await page.locator('#characters-list').selectOption({ label: 'ブラウザテスト用' });
    await page.locator('#load-character-btn').click();

    assert.equal(await cards.count(), 2);
    assert.equal(await cards.first().locator('[data-input="char_def"]').inputValue(), '123456');
    assert.equal(await cards.nth(1).locator('.scenario-title-text').innerText(), '状況 1 (コピー)');

    const storedState = await page.evaluate(() => JSON.parse(localStorage.getItem('dokkan_calc_data_v22')));
    assert.equal(storedState.savedCharacters.length, 1);
    assert.equal(storedState.savedCharacters[0].name, 'ブラウザテスト用');
    assert.equal(storedState.savedCharacters[0].scenarios.length, 2);
  });
});

test('合成敵でターン・被弾・HP・登場ターン・必殺後強化を反映する', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);

    const syntheticEnemy = {
      name: '条件テスト敵',
      class: 'extreme',
      type: 'str',
      attacks: [
        { name: '通常', value: 1_000_000 },
        { name: '必殺', value: 3_300_000 },
      ],
      baseAtk: 1_000_000,
      saMulti: 3,
      saBuffMod: 0.3,
      aoeDamage: 0,
      hasSaCrit: false,
      turnAtkUpStartTurn: 2,
      turnAtkUp: 10,
      turnAtkMax: 20,
      hitAtkUp: 20,
      hitAtkMax: 40,
      hpAtkThreshold: 50,
      hpAtkUp: 30,
      appearEntries: [{ turn: 3, cumulativeAtkUp: 40 }],
    };
    await card.evaluate((element, enemy) => {
      element.dataset.loadedEnemy = JSON.stringify(enemy);
    }, syntheticEnemy);
    await page.locator('#mode-damage').check();

    const dynamicContainer = card.locator('.dynamic-damage-container');
    await dynamicContainer.waitFor();
    assert.deepEqual(
      await dynamicContainer.locator('.cond-turn option').allInnerTexts(),
      ['なし', '2ターン (ATK+10%)', '3ターン (ATK+20%)'],
    );
    assert.deepEqual(
      await dynamicContainer.locator('.cond-hit option').allInnerTexts(),
      ['なし', '1回 (ATK+20%)', '2回 (ATK+40%)'],
    );
    assert.deepEqual(
      await dynamicContainer.locator('.cond-hp option').allInnerTexts(),
      ['HP50%以上', 'HP50%以下 (ATK+30%)'],
    );
    assert.deepEqual(
      await dynamicContainer.locator('.cond-appear option').allInnerTexts(),
      ['初期', '3ターン目 (ATK+40%)'],
    );

    const initialRows = (await dynamicContainer.locator('.multi-attack-result-item').allInnerTexts()).map(normalizeText);
    assert.match(initialRows[0], /^通常 ATK: 100万 被ダメ:/);
    assert.match(initialRows[1], /^通常\(必殺後\) ATK: 130万 被ダメ:/);
    assert.match(initialRows[2], /^必殺 ATK: 330万 被ダメ:/);

    await dynamicContainer.locator('.cond-turn').selectOption('20');
    await dynamicContainer.locator('.cond-hit').selectOption('40');
    await dynamicContainer.locator('.cond-hp').selectOption('30');
    await dynamicContainer.locator('.cond-appear').selectOption('40');

    assert.equal(await dynamicContainer.locator('.cond-turn').inputValue(), '20');
    assert.equal(await dynamicContainer.locator('.cond-hit').inputValue(), '40');
    assert.equal(await dynamicContainer.locator('.cond-hp').inputValue(), '30');
    assert.equal(await dynamicContainer.locator('.cond-appear').inputValue(), '40');
    assert.match(await dynamicContainer.innerText(), /合計ATK \+130% \(x2\.30\)/);

    const boostedRows = (await dynamicContainer.locator('.multi-attack-result-item').allInnerTexts()).map(normalizeText);
    assert.match(boostedRows[0], /^通常 ATK: 230万 被ダメ:/);
    assert.match(boostedRows[1], /^通常\(必殺後\) ATK: 299万 被ダメ:/);
    assert.match(boostedRows[2], /^必殺 ATK: 759万 被ダメ:/);
  });
});

test('legacy表示仕様: 浮動小数の床丸めによる23万→22万差を記録する', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await card.evaluate((element) => {
      element.dataset.loadedEnemy = JSON.stringify({
        name: '丸め差テスト敵',
        class: 'extreme',
        type: 'str',
        attacks: [{ name: '通常', value: 100_000 }],
        baseAtk: 100_000,
        saMulti: 3,
        saBuffMod: 0,
        aoeDamage: 0,
        hasSaCrit: false,
        turnAtkUpStartTurn: 1,
        turnAtkUp: 130,
        turnAtkMax: 130,
        hitAtkUp: 0,
        hitAtkMax: 0,
        hpAtkThreshold: 0,
        hpAtkUp: 0,
        appearEntries: [],
      });
    });
    await page.locator('#mode-damage').check();

    const dynamicContainer = card.locator('.dynamic-damage-container');
    await dynamicContainer.locator('.cond-turn').selectOption('130');
    const normalRow = normalizeText(await dynamicContainer.locator('.multi-attack-result-item').first().innerText());

    // The intended arithmetic is 100,000 * 2.3 = 230,000. In the current
    // browser code, binary floating-point produces 229,999.999..., then the
    // first Math.floor makes the internal attack 229,999. formatNumber applies
    // a second floor in units of 10,000, so the visible value is 22万. This is
    // a deliberately named legacy characterization, not a correctness claim.
    assert.match(normalRow, /^通常 ATK: 22万 被ダメ:/);
  });
});
