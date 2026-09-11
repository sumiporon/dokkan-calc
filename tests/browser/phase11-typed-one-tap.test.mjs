import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';

test('Phase C browser flow stops at unusable and opens a read-only full/partial/unusable/unvisited summary without external request', async () => {
  const server = await startStaticServer(), browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const external = [], errors = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new Error('Unexpected localStorage write'); };
      window.fetch = () => { throw new Error('Unexpected fetch'); };
      XMLHttpRequest.prototype.open = () => { throw new Error('Unexpected XHR'); };
      const original = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, ...args) {
        if (name !== 'dokkan-phase11-typed-one-tap-PROTOTYPE-v2') throw new Error('Unexpected DB namespace');
        return original.call(this, name, ...args);
      };
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${server.origin}/prototypes/phase11-typed-one-tap/index.html`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '開始' }).click();
    await page.getByText('完全データを保存しました').waitFor();
    assert.match(await page.locator('#screen').innerText(), /validator成功 → payload保存・read-back → typed draft保存 → session保存・read-back/);
    await page.getByRole('button', { name: '次のステージへ' }).click();
    await page.getByText('一部の材料を保存しました').waitFor();
    assert.match(await page.locator('#screen').innerText(), /現在は計算できません/);
    assert.doesNotMatch(await page.locator('#screen').innerText(), /500,000|824,000|この敵を完封/);
    await page.getByRole('button', { name: '次のステージへ' }).click();
    await page.getByText('このstageでは安全に保存できません').waitFor();
    assert.equal(await page.getByRole('button', { name: '次のステージへ' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '最終確認' }).count(), 0);
    await page.getByRole('button', { name: 'ここまでの取得結果を確認' }).click();
    await page.getByRole('heading', { name: 'ここまでの取得結果' }).waitFor();
    assert.match(await page.locator('#screen').innerText(), new RegExp('完全データ保存済み: 1stage / 部分材料保存済み: 1stage / 利用不可: 1stage / 未取得: 1stage'));
    assert.match(await page.locator('#screen').innerText(), /架空stage 1（完全データ）: 完全データ保存済み/);
    assert.match(await page.locator('#screen').innerText(), /架空stage 2（部分材料）: 部分材料保存済み — 材料のみ保存・現在は計算できません/);
    assert.match(await page.locator('#screen').innerText(), /架空stage 3（利用不可）: 利用不可/);
    assert.match(await page.locator('#screen').innerText(), /架空stage 4（未取得）: 未取得 — 未取得/);
    assert.doesNotMatch(await page.locator('#screen').innerText(), /apply|skip|retry/);
    const stored = await page.evaluate(async () => {
      const api = await import('/generated/phase11/typed-one-tap/api.mjs');
      const drafts = new api.IndexedDbTypedDraftStore(), backend = new api.IndexedDbTypedSessionBackend();
      const session = new api.TypedOneTapSessionCoordinator({ draftStore: drafts, backend }); const summary = await session.readOnlySummary();
      drafts.close(); backend.close();
      return { states: summary.stages.map(value => value.state), stages: summary.total, full: summary.full, partial: summary.partial, unusable: summary.unusable, unvisited: summary.unvisited };
    });
    assert.deepEqual(stored, { states: ['full', 'partial', 'unusable', 'unvisited'], stages: 4, full: 1, partial: 1, unusable: 1, unvisited: 1 });
    for (const width of [360, 390]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
