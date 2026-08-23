import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { chromium } from 'playwright';

import { startStaticServer } from '../helpers/static-server.mjs';

const APP_PATH = '/dokkan_calc_final.html';
const FILE_APP_URL = new URL('../../dokkan_calc_final.html', import.meta.url).href;
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

async function runInFreshApp(
  runAssertions,
  {
    appPath = APP_PATH,
    appUrl,
    viewport = { width: 1440, height: 1100 },
  } = {},
) {
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport,
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
    await page.goto(appUrl ?? `${staticServer.origin}${appPath}`, {
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

test('PC viewport: 起動、DEF計算、安全側耐久ライン、モード切替、被ダメ範囲', { timeout: TEST_TIMEOUT }, async () => {
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
    assert.deepEqual(durabilityRows, ['完封 131万', '70万 199万']);

    await expandOpponentSettings(card);
    await page.locator('#mode-damage').check();
    assert.equal(await page.locator('#mode-damage').isChecked(), true);
    assert.equal(await card.locator('[data-input="enemy_atk"]').isVisible(), true);
    await card.locator('[data-input="enemy_atk"]').fill('200');
    assert.equal(
      normalizeText(await card.locator('.manual-damage-result').innerText()),
      '敵ATK: 200万 → 被ダメ: 65万〜71万',
    );

    await card.locator('[data-input="enemy_atk"]').fill('100');
    assert.equal(
      normalizeText(await card.locator('.manual-damage-result').innerText()),
      '敵ATK: 100万 → 被ダメ: 0',
    );

    await page.locator('#mode-durability').check();
    assert.equal(await page.locator('#mode-durability').isChecked(), true);
    assert.equal(await card.locator('.result-body tr').count(), 2);
  });
});

test('スマホviewportでも主要なDEF・安全側耐久ライン・被ダメ範囲操作ができる', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    assert.deepEqual(page.viewportSize(), { width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      '390px viewport must not introduce horizontal page overflow',
    );
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await card.locator('[data-input="char_def"]').fill('100000');
    await card.locator('[data-input="leader"]').fill('200');
    await card.locator('[data-input="passive"]').fill('100');
    await card.locator('[data-input="active"]').fill('50');
    await card.locator('[data-input="support_item"]').fill('50');

    assert.equal(await card.locator('.final-def-display').innerText(), '最終DEF: 1,350,000');
    assert.deepEqual(
      (await card.locator('.result-body tr').allInnerTexts()).map(normalizeText),
      ['完封 131万', '70万 199万'],
    );

    await expandOpponentSettings(card);
    await page.locator('#mode-damage').check();
    await card.locator('[data-input="enemy_atk"]').fill('200');
    assert.equal(
      normalizeText(await card.locator('.manual-damage-result').innerText()),
      '敵ATK: 200万 → 被ダメ: 65万〜71万',
    );

    await page.locator('#mode-durability').check();
    assert.equal(await card.locator('.result-body tr').count(), 2);
  }, { viewport: { width: 390, height: 844 } });
});

test('表示境界: 被ダメ範囲を外向きに丸め、1万未満の耐久上限を下向きに丸める', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await expandOpponentSettings(card);

    await card.locator('[data-input="char_def"]').fill('200000');
    await card.locator('[data-input="dr_input"]').fill('40');
    await page.locator('#mode-damage').check();
    await card.locator('[data-input="enemy_atk"]').fill('100');
    assert.equal(
      normalizeText(await card.locator('.manual-damage-result').innerText()),
      '敵ATK: 100万 → 被ダメ: 40万〜41.8万',
    );

    await page.locator('#mode-durability').check();
    await card.locator('[data-input="dr_input"]').fill('0');
    await card.locator('[data-input="char_def"]').fill('9000');
    assert.equal(
      normalizeText(await card.locator('.result-body tr').first().innerText()),
      '完封 8,737',
    );
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
    assert.equal(attackTexts[0], '通常 ATK: 20万 被ダメ: 10万〜10.3万');
    assert.equal(attackTexts[1], '必殺 ATK: 50万 被ダメ: 25万〜25.8万');
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

test('暫定データマッピング: 合成敵のターン・被弾・HP・登場・必殺後を反映する', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await expandOpponentSettings(card);

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
    await card.locator('[data-input="enemy_class"]').selectOption('extreme');
    await card.locator('[data-input="enemy_type"]').selectOption('str');
    await page.locator('#mode-damage').check();

    const dynamicContainer = card.locator('.dynamic-damage-container');
    await dynamicContainer.waitFor();
    assert.deepEqual(
      await dynamicContainer.locator('.cond-turn option').allInnerTexts(),
      ['1ターンまで (ATK+0%)', '2ターン (ATK+10%)', '3ターン (ATK+20%)'],
    );
    assert.deepEqual(
      await dynamicContainer.locator('.cond-hit option').allInnerTexts(),
      ['0回 (ATK+0%)', '1回 (ATK+20%)', '2回 (ATK+40%)'],
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
    assert.equal(initialRows[0], '通常 ATK: 100万 被ダメ: 115万〜118.5万');
    assert.equal(initialRows[1], '通常(必殺後) ATK: 130万 被ダメ: 149.5万〜154万');
    assert.equal(initialRows[2], '必殺 ATK: 330万 被ダメ: 379.5万〜390.9万');

    await dynamicContainer.locator('.cond-turn').selectOption('20');
    await dynamicContainer.locator('.cond-hit').selectOption('40');
    await dynamicContainer.locator('.cond-hp').selectOption('30');
    await dynamicContainer.locator('.cond-appear').selectOption('40');

    assert.equal(await dynamicContainer.locator('.cond-turn').inputValue(), '20');
    assert.equal(await dynamicContainer.locator('.cond-hit').inputValue(), '40');
    assert.equal(await dynamicContainer.locator('.cond-hp').inputValue(), '30');
    assert.equal(await dynamicContainer.locator('.cond-appear').inputValue(), '40');
    assert.match(
      await dynamicContainer.innerText(),
      /ATK補正: 開始時 \+90% × 被弾後 \+40% \(x2\.66\)/,
    );

    const boostedRows = (await dynamicContainer.locator('.multi-attack-result-item').allInnerTexts()).map(normalizeText);
    assert.equal(boostedRows[0], '通常 ATK: 266万 被ダメ: 305.9万〜315.1万');
    assert.equal(boostedRows[1], '通常(必殺後) ATK: 345万 被ダメ: 397.6万〜409.7万');
    assert.equal(boostedRows[2], '必殺 ATK: 877万 被ダメ: 1009.4万〜1039.8万');
  });
});

test('整数化修正: 100,000 × 2.3 を正確に23万と表示する', { timeout: TEST_TIMEOUT }, async () => {
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

    assert.match(normalRow, /^通常 ATK: 23万 被ダメ:/);
  });
});

test('実敵ブロリーで第1ターンとターン×被弾の最大値を再現する', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await expandOpponentSettings(card);

    await card.locator('[data-input="loaded_enemy_event_type"]').selectOption({ label: 'レッドゾーン' });
    await card.locator('[data-input="loaded_enemy_series"]').selectOption({ label: '純粋サイヤ人編' });
    await card.locator('[data-input="loaded_enemy_stage"]').selectOption({ label: 'VS ブロリー' });
    await card.locator('[data-input="loaded_enemy_boss"]').selectOption({ label: '超サイヤ人ブロリー(フルパワー)' });
    await card.locator('.load-enemy-to-card-cascade-btn').click();
    await page.locator('#mode-damage').check();

    const dynamicContainer = card.locator('.dynamic-damage-container');
    await dynamicContainer.waitFor();
    const turnOptions = await dynamicContainer.locator('.cond-turn option').allInnerTexts();
    assert.deepEqual(turnOptions, [
      '1ターン (ATK+30%)',
      '2ターン (ATK+60%)',
      '3ターン (ATK+90%)',
      '4ターン (ATK+120%)',
      '5ターン (ATK+150%)',
    ]);

    const initialRows = (await dynamicContainer.locator('.multi-attack-result-item').allInnerTexts()).map(normalizeText);
    assert.match(initialRows[0], /^通常 ATK: 156万 被ダメ:/);
    assert.match(initialRows[1], /^通常\(必殺後\) ATK: 234万 被ダメ:/);
    assert.match(initialRows[2], /^必殺 ATK: 546万 被ダメ:/);

    await dynamicContainer.locator('.cond-turn').selectOption('150');
    await dynamicContainer.locator('.cond-hit').selectOption('100');
    assert.match(
      await dynamicContainer.innerText(),
      /ATK補正: 開始時 \+150% × 被弾後 \+100% \(x5\.00\)/,
    );

    const maximumRows = (await dynamicContainer.locator('.multi-attack-result-item').allInnerTexts()).map(normalizeText);
    assert.match(maximumRows[0], /^通常 ATK: 600万 被ダメ:/);
    assert.match(maximumRows[1], /^通常\(必殺後\) ATK: 900万 被ダメ:/);
    assert.match(maximumRows[2], /^必殺 ATK: 2100万 被ダメ:/);
  });
});

test('必殺だけ会心の敵はモーダル読込でも通常攻撃を会心扱いしない', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await expandOpponentSettings(card);
    // The old modal hook no longer has a visible button, but its listener is
    // still retained for compatibility. Add only the trigger element so both
    // loading paths remain covered until that legacy path is removed safely.
    await card.evaluate((element) => {
      const button = document.createElement('button');
      button.className = 'load-enemy-to-card-btn';
      button.type = 'button';
      button.textContent = 'legacy modal test trigger';
      element.appendChild(button);
    });
    await card.locator('.load-enemy-to-card-btn').click();

    const enemy = page.locator(
      '.modal-enemy-item[data-et-index="0"][data-ser-index="8"][data-stg-index="1"][data-boss-index="4"]',
    );
    assert.equal(await enemy.innerText(), 'フリーザ(フルパワー)');
    await enemy.click();

    assert.equal(await card.locator('[data-input="is_critical"]').isChecked(), false);
    await page.locator('#mode-damage').check();
    const rows = (await card.locator('.multi-attack-result-item').allInnerTexts()).map(normalizeText);
    assert.match(rows[0], /^通常 ATK: 75万 被ダメ: [\d.]+万〜[\d.]+万$/);
    assert.match(rows[1], /^通常\(必殺後\) ATK: 112万 被ダメ: [\d.]+万〜[\d.]+万$/);
    assert.match(rows[2], /^必殺 ATK: 247万 被ダメ: [\d.]+万〜[\d.]+万$/);
    assert.match(rows[3], /^必殺\[会心\] ATK: 247万 .*被ダメ: --$/);

    await card.locator('[data-input="loaded_enemy_event_type"]').selectOption({ label: 'レッドゾーン' });
    await card.locator('[data-input="loaded_enemy_series"]').selectOption({ label: '孫悟空の軌跡編' });
    await card.locator('[data-input="loaded_enemy_stage"]').selectOption({ label: 'ナメック星編' });
    await card.locator('[data-input="loaded_enemy_boss"]').selectOption({ label: 'フリーザ(フルパワー)' });
    await card.locator('.load-enemy-to-card-cascade-btn').click();
    assert.equal(await card.locator('[data-input="is_critical"]').isChecked(), false);
    const cascadeRows = (await card.locator('.multi-attack-result-item').allInnerTexts()).map(normalizeText);
    assert.deepEqual(cascadeRows, rows);
  });
});

test('一覧・スクリーンショット用プレビューもメイン画面と同じ計算を使う', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await card.locator('[data-input="char_def"]').fill('100000');
    await card.locator('[data-input="leader"]').fill('200');
    await card.locator('[data-input="passive"]').fill('100');
    await card.locator('[data-input="active"]').fill('50');
    await card.locator('[data-input="support_item"]').fill('50');
    assert.equal(await card.locator('.final-def-display').innerText(), '最終DEF: 1,350,000');

    await page.locator('#summary-view-btn').click();
    await page.locator('#preview-overlay:not(.hidden)').waitFor();
    await page.locator('#selection-select-all-btn').click();
    await page.locator('#selection-generate-btn').click();

    const previewItems = (await page.locator('#overlay-cards-container .summary-item-pair').allInnerTexts())
      .map(normalizeText);
    assert.deepEqual(previewItems, [
      'DEF: 135万',
      '軽減: -',
      '全ガ: -',
      '完封: 131万',
      '70万: 199万',
    ]);
  });
});

test('公開入口のindex.htmlも共有計算コアを読み込んで起動する', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    assert.match(normalizeText(await page.locator('h1').innerText()), /^ドッカンバトル 耐久計算ツール/);
    assert.equal(await page.locator('#scenario-cards-container .card').count(), 1);
    assert.equal(
      await page.evaluate(() => typeof globalThis.DokkanCalcCore?.calculateDurability),
      'function',
    );
  }, { appPath: '/index.html' });
});

test('file直開きでもカード・主要計算・localStorage保存が動作する', { timeout: TEST_TIMEOUT }, async () => {
  await runInFreshApp(async ({ page }) => {
    assert.equal(page.url(), FILE_APP_URL);
    assert.equal(await page.locator('#scenario-cards-container .card').count(), 1);
    assert.equal(
      await page.evaluate(() => typeof globalThis.DokkanCalcCore?.calculateDamageRange),
      'function',
    );

    const card = page.locator('#scenario-cards-container .card').first();
    await expandScenario(card);
    await card.locator('[data-input="char_def"]').fill('100000');
    await card.locator('[data-input="leader"]').fill('200');
    await card.locator('[data-input="passive"]').fill('100');
    await card.locator('[data-input="active"]').fill('50');
    await card.locator('[data-input="support_item"]').fill('50');
    assert.deepEqual(
      (await card.locator('.result-body tr').allInnerTexts()).map(normalizeText),
      ['完封 131万', '70万 199万'],
    );

    await expandOpponentSettings(card);
    await page.locator('#mode-damage').check();
    await card.locator('[data-input="enemy_atk"]').fill('200');
    assert.equal(
      normalizeText(await card.locator('.manual-damage-result').innerText()),
      '敵ATK: 200万 → 被ダメ: 65万〜71万',
    );

    await page.locator('#new-character-name').fill('file直開きテスト');
    await page.locator('#save-character-btn').click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dokkan_calc_data_v22')));
    assert.equal(stored.savedCharacters.at(-1).name, 'file直開きテスト');
  }, { appUrl: FILE_APP_URL });
});
