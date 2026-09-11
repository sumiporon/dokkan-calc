import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';

test('Phase E browser fixture restores safely, transfers a verified mixed batch, and renders only read-only inspection', async () => {
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
    const base = `${server.origin}/prototypes/phase11-typed-one-tap/index.html`;

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'ケースA：進行途中を準備' }).click();
    await page.getByRole('heading', { name: 'このタブでは操作を続けられません' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '次のstageへ' }).count(), 0);
    assert.match(await page.locator('#screen').innerText(), /続けるには、このタブへ担当を移してください/);
    const beforeTakeover = await page.evaluate(async () => {
      const api = await import('/generated/phase11/typed-one-tap/api.mjs'); const drafts = new api.IndexedDbTypedDraftStore(), backend = new api.IndexedDbTypedSessionBackend();
      const value = await new api.TypedOneTapSessionCoordinator({ draftStore: drafts, backend }).load(); drafts.close(); backend.close();
      return { writerGeneration: value.writerGeneration, revision: value.revision, currentIndex: value.currentIndex, types: Object.values(value.drafts).map(x => x.classification).sort() };
    });
    assert.deepEqual(beforeTakeover, { writerGeneration: 1, revision: 3, currentIndex: 2, types: ['full', 'partial'] });
    await page.getByRole('button', { name: 'このタブへ担当を移す' }).click();
    await page.getByRole('heading', { name: 'このタブで続けられます' }).waitFor();
    assert.match(await page.locator('#screen').innerText(), /writer generation 2 \/ session revision 4/);
    await page.getByRole('button', { name: '次のstageへ' }).click();
    await page.getByText('完全データを保存しました').waitFor();
    assert.match(await page.locator('#screen').innerText(), /3\/3 stage。引継ぎ後に操作できることを確認しました/);

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'ケースB：停止済みを準備' }).click();
    await page.getByRole('heading', { name: 'このタブでは操作を続けられません' }).waitFor();
    await page.getByRole('button', { name: 'このタブへ担当を移す' }).click();
    await page.getByRole('heading', { name: 'このタブで続けられます' }).waitFor();
    assert.match(await page.locator('#screen').innerText(), /利用不可stageで停止中/);
    assert.equal(await page.getByRole('button', { name: '次のstageへ' }).count(), 0);
    const beforeInspection = await page.evaluate(async () => {
      const api = await import('/generated/phase11/typed-one-tap/api.mjs'); const drafts = new api.IndexedDbTypedDraftStore(), backend = new api.IndexedDbTypedSessionBackend();
      const value = await new api.TypedOneTapSessionCoordinator({ draftStore: drafts, backend }).load(); drafts.close(); backend.close();
      return value;
    });
    await page.getByRole('button', { name: '取得結果を確認' }).click();
    await page.getByRole('heading', { name: 'typed inspection review' }).waitFor();
    assert.match(page.url(), /prototypes\/phase11-typed-inspection\/index\.html#batch=/);
    assert.match(await page.locator('#screen').innerText(), /完全データ保存済み: 1stage \/ 部分材料保存済み: 1stage \/ 利用不可: 1stage \/ 未取得: 1stage \/ 合計: 4stage/);
    assert.match(await page.locator('#screen').innerText(), /材料のみ保存・現在は計算できません/);
    assert.equal(await page.getByRole('button').count(), 0);
    const afterInspection = await page.evaluate(async () => {
      const api = await import('/generated/phase11/typed-one-tap/api.mjs'); const drafts = new api.IndexedDbTypedDraftStore(), backend = new api.IndexedDbTypedSessionBackend();
      const value = await new api.TypedOneTapSessionCoordinator({ draftStore: drafts, backend }).load(); drafts.close(); backend.close();
      return value;
    });
    assert.deepEqual(afterInspection, beforeInspection);
    for (const width of [360, 390]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
