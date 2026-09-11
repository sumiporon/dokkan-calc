import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';

test('Independent single-hit review: A-F, stale results, mobile layout, no external requests or storage', async () => {
  const server = await startStaticServer(); const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const external = []; const errors = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new Error('Unexpected storage write'); };
      IDBFactory.prototype.open = () => { throw new Error('Unexpected IndexedDB access'); };
      window.fetch = () => { throw new Error('Unexpected fetch'); };
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${server.origin}/prototypes/phase11-single-hit/index.html`);
    await page.locator('[data-output="damage"] .value').waitFor();
    assert.match(await page.locator('#results').innerText(), /500,000～524,000/);
    assert.match(await page.locator('#results').innerText(), /824,000/);
    for (const id of ['B', 'C', 'D', 'F']) {
      await page.selectOption('#fixture', id);
      assert.equal(await page.locator('#results .value').count(), 0);
      assert.equal(await page.locator('[data-status="blocked"]').count(), 3);
      assert.doesNotMatch(await page.locator('#results').innerText(), /524,000|824,000|774,000|Infinity|NaN/);
    }
    await page.selectOption('#fixture', 'D'); assert.match(await page.locator('#facts').innerText(), /1,000,000/);
    await page.selectOption('#fixture', 'E');
    assert.equal(await page.locator('#results .value').count(), 3);
    assert.match(await page.locator('[data-output="damage"]').innerText(), /0 ／ この1発：完封/);
    assert.equal(await page.locator('[data-output="zero-defense"] .value').innerText(), '0');
    for (const width of [360, 390, 1000]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.doesNotMatch(await page.locator('body').innerText(), /この敵を完封/);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 }); await page.selectOption('#fixture', 'A');
    await page.screenshot({ path: 'test-results/phase11-single-hit.png', fullPage: true });
  } finally { await browser.close(); await server.close(); }
});
