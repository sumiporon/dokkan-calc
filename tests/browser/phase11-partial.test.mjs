import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';

async function withPage(action) {
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
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, ...args) {
        if (!name.startsWith('dokkan-phase11-partial-OFFLINE-PROTOTYPE-v1')) throw new Error('Unexpected DB namespace');
        return open.call(this, name, ...args);
      };
      window.fetch = () => { throw new Error('Unexpected fetch'); };
      XMLHttpRequest.prototype.open = () => { throw new Error('Unexpected XHR'); };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${server.origin}/prototypes/phase11-partial/index.html`);
    await page.waitForFunction(() => !document.querySelector('#case').disabled && document.querySelectorAll('.value').length === 3);
    await action(page);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
}
async function select(page, id) {
  await page.selectOption('#case', id);
  await page.waitForFunction(() => !document.querySelector('#case').disabled);
}

test('Partial UI: full vs A-F, zero-output save, persistent reload, rollback, no stale values or production access', async () => withPage(async page => {
  assert.match(await page.locator('#results').innerText(), /500,000～524,000/);
  assert.match(await page.locator('#results').innerText(), /824,000/);
  assert.match(await page.locator('#full-check').innerText(), /不合格/);
  await page.click('#save'); await page.waitForFunction(() => document.querySelector('#storage-status').textContent.startsWith('保存成功'));
  for (const id of ['B', 'C', 'D', 'F']) {
    await select(page, id);
    assert.equal(await page.locator('.value').count(), 0);
    assert.equal(await page.locator('[data-status="blocked"]').count(), 3);
    assert.equal(await page.locator('#availability').innerText(), '材料のみ保存・現在は計算できません');
    assert.equal(await page.locator('#save').isEnabled(), true);
    assert.doesNotMatch(await page.locator('#results').innerText(), /524,000|824,000|774,000|Infinity|NaN/);
  }
  await select(page, 'B'); await page.click('#save'); await page.waitForFunction(() => document.querySelector('#storage-status').textContent.startsWith('保存成功'));
  await page.reload(); await page.waitForFunction(() => document.querySelector('#storage-status').textContent.startsWith('保存済み'));
  assert.equal(await page.locator('#case').inputValue(), 'B'); assert.equal(await page.locator('.value').count(), 0);
  await page.click('#rollback'); await page.waitForFunction(() => document.querySelector('#storage-status').textContent.startsWith('rollback成功'));
  assert.equal(await page.locator('#case').inputValue(), 'A'); assert.equal(await page.locator('.value').count(), 3);
  assert.equal(await page.locator('#rollback').isEnabled(), false);
  await select(page, 'C'); await page.click('#save'); await page.waitForFunction(() => document.querySelector('#storage-status').textContent.startsWith('保存成功'));
  assert.equal(await page.locator('#case').inputValue(), 'C'); assert.equal(await page.locator('.value').count(), 0);
  await page.click('#rollback'); await page.waitForFunction(() => document.querySelector('#storage-status').textContent.startsWith('rollback成功'));
  assert.equal(await page.locator('#case').inputValue(), 'A'); assert.equal(await page.locator('#rollback').isEnabled(), false);
  await page.reload(); await page.waitForFunction(() => document.querySelector('#storage-status').textContent.startsWith('保存済み'));
  assert.equal(await page.locator('#case').inputValue(), 'A'); assert.equal(await page.locator('#rollback').isEnabled(), false);
  await select(page, 'E'); assert.match(await page.locator('[data-output="damage"] .value').innerText(), /0 ／ この1発：完封/);
  assert.equal(await page.locator('[data-output="zero-defense"] .value').innerText(), '算出可能：0');
  await select(page, 'FULL'); assert.match(await page.locator('#full-check').innerText(), /合格/);
  assert.equal(await page.locator('#save').isEnabled(), false); assert.equal(await page.locator('.value').count(), 0);
  await select(page, 'A'); await page.locator('details').click();
  for (const width of [360, 390, 1000]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.doesNotMatch(await page.locator('body').innerText(), /この敵を完封/);
  await page.locator('details').click(); await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/phase11-partial.png', fullPage: true });
}));

test('Partial DB: read-back failure and aborted write leave active material unchanged; invalid/full materials rejected', async () => withPage(async page => {
  const outcome = await page.evaluate(async () => {
    const { PartialMaterialStore, PARTIAL_DB, inspectFictionalPartial, calculatePartial } = await import('/generated/phase11/partial/api.mjs');
    const { sourceFixture, defenderFixture } = await import('/prototypes/phase11-partial/fixtures.mjs');
    const a = (await inspectFictionalPartial(sourceFixture('A'))).material;
    const c = (await inspectFictionalPartial(sourceFixture('C', { revision: 2 }))).material;
    const store = new PartialMaterialStore({ name: `${PARTIAL_DB}-test-failures` });
    const saved = await store.save(a), expected = saved.current.contentDigest;
    const read = store.readMaterial.bind(store); let readFailed = false, writeFailed = false;
    store.readMaterial = async key => { if (key === c.contentDigest) throw new Error('Injected read-back failure'); return read(key); };
    try { await store.save(c); } catch { readFailed = true; }
    store.readMaterial = read; const afterRead = (await store.load()).current.contentDigest;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const req = put.apply(this, args); if (this.name === 'materials') this.transaction.abort(); return req;
    };
    try { await store.save(c); } catch { writeFailed = true; } finally { IDBObjectStore.prototype.put = put; }
    const afterWrite = (await store.load()).current.contentDigest;
    let rejected = 0;
    for (const bad of [{ ...a, kind: 'full' }, (await inspectFictionalPartial(sourceFixture('A', { full: true }))).package]) {
      try { await store.save(bad); } catch { rejected++; }
    }
    const savedZero = await store.save(c); store.close();
    const reopened = new PartialMaterialStore({ name: `${PARTIAL_DB}-test-failures` });
    const loaded = await reopened.load();
    const noCore = new Proxy({}, { get() { throw new Error('Unexpected core entry'); } });
    const blocked = await calculatePartial(loaded.current, 'damage', defenderFixture(), noCore);
    const restored = await reopened.rollback(); reopened.close();
    return { readFailed, writeFailed, unchangedRead: afterRead === expected, unchangedWrite: afterWrite === expected, rejected,
      verified: savedZero.readBackVerified, reopened: loaded.current.contentDigest === c.contentDigest,
      blocked: blocked.status, hasValue: Object.hasOwn(blocked, 'value'), restored: restored.current.contentDigest === expected };
  });
  assert.deepEqual(outcome, { readFailed: true, writeFailed: true, unchangedRead: true, unchangedWrite: true, rejected: 2,
    verified: true, reopened: true, blocked: 'blocked', hasValue: false, restored: true });
}));

test('Partial DB: concurrent stale save cannot replace newer head; corrupted persistent data stops on load', async () => withPage(async page => {
  const outcome = await page.evaluate(async () => {
    const { PartialMaterialStore, PARTIAL_DB, inspectFictionalPartial } = await import('/generated/phase11/partial/api.mjs');
    const { sourceFixture } = await import('/prototypes/phase11-partial/fixtures.mjs');
    const a = (await inspectFictionalPartial(sourceFixture('A'))).material;
    const b = (await inspectFictionalPartial(sourceFixture('B', { revision: 2 }))).material;
    const c = (await inspectFictionalPartial(sourceFixture('C', { revision: 2 }))).material;
    const options = { name: `${PARTIAL_DB}-test-concurrency` }, first = new PartialMaterialStore(options), other = new PartialMaterialStore(options);
    await first.save(a); const activate = first.activate.bind(first);
    first.activate = async (...args) => { await other.save(c); return activate(...args); };
    let code;
    try { await first.save(b); } catch (e) { code = e.code; }
    const kept = (await other.load()).current.contentDigest === c.contentDigest;
    let revisionCode; try { await other.save(a); } catch (e) { revisionCode = e.code; }
    const db = await other.open(), tx = db.transaction('materials', 'readwrite');
    const finished = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
    tx.objectStore('materials').put({ ...c, contentDigest: 'corrupted' }, c.contentDigest); await finished;
    let corruptCode; try { await other.load(); } catch (e) { corruptCode = e.code; }
    first.close(); other.close(); return { code, kept, revisionCode, corruptCode };
  });
  assert.deepEqual(outcome, { code: 'STALE_SAVE', kept: true, revisionCode: 'REVISION_CONFLICT', corruptCode: 'CONTENT_DIGEST' });
}));

test('Partial DB: existing two-pointer A/B storage migrates once to one-way history', async () => withPage(async page => {
  const outcome = await page.evaluate(async () => {
    const { PartialMaterialStore, PARTIAL_DB, inspectFictionalPartial } = await import('/generated/phase11/partial/api.mjs');
    const { sourceFixture } = await import('/prototypes/phase11-partial/fixtures.mjs');
    const a = (await inspectFictionalPartial(sourceFixture('A'))).material;
    const b = (await inspectFictionalPartial(sourceFixture('B', { revision: 2 }))).material;
    const name = `${PARTIAL_DB}-test-migration`;
    const seeded = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('materials'); request.result.createObjectStore('head'); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['materials', 'head'], 'readwrite');
        tx.objectStore('materials').put(a, a.contentDigest); tx.objectStore('materials').put(b, b.contentDigest);
        tx.objectStore('head').put({ version: 1, generation: 7, current: b.contentDigest, previous: a.contentDigest }, 'active');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = tx.onabort = () => reject(tx.error);
      };
    });
    void seeded;
    const store = new PartialMaterialStore({ name }); const first = await store.load();
    const rolled = await store.rollback(); let code;
    try { await store.rollback(); } catch (e) { code = e.code; }
    const raw = await store.read('head', 'active'); store.close();
    return { first: first.current.capture.id, firstPrevious: first.previous.capture.id, migrated: raw.version,
      history: raw.history.length, position: raw.position, rolled: rolled.current.capture.id, noSecondRollback: code };
  });
  assert.deepEqual(outcome, { first: 'fictional-capture-B-partial-2', firstPrevious: 'fictional-capture-A-partial-1', migrated: 2,
    history: 2, position: 0, rolled: 'fictional-capture-A-partial-1', noSecondRollback: 'NO_ROLLBACK' });
}));
