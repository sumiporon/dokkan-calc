import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';

const TIMEOUT = 120000;
const extensionPath = path.resolve('generated/phase11-one-tap/chromium-test');
let server; let profile;

test.before(async () => { server = await startStaticServer(); profile = await mkdtemp(path.join(tmpdir(), 'phase11-one-tap-')); });
test.after(async () => { await server?.close(); if (profile) await rm(profile, { recursive: true, force: true }); });

async function launch(width) {
  return chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    viewport: { width, height: 844 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
}
const fixture = (name) => `${server.origin}/phase11-one-tap-fixture/${name}`;
const bar = (page) => page.locator('#phase11-one-tap-root');

test('actual extension fixture flow waits for owner taps, survives restart, receives/reviews/applies batch once', { timeout: TIMEOUT }, async () => {
  const requests = []; let context = await launch(390); context.on('request', (request) => requests.push(request.url()));
  try {
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto(fixture('event.html'));
    await bar(page).getByText('eventを確認しました').waitFor();
    await page.waitForTimeout(300);
    assert.equal(requests.filter((url) => /stage-9900010[123]\.html$/.test(url)).length, 0, 'no stage page before owner start tap');
    const box = await bar(page).boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391);
    await bar(page).getByRole('button', { name: '開始' }).click();
    await page.waitForURL(fixture('stage-99000101.html'));
    await bar(page).getByText('draft保存済み').waitFor();
    assert.equal(requests.filter((url) => /stage-99000102\.html$/.test(url)).length, 0, 'no next stage before owner tap');
    await page.reload(); await bar(page).getByText('draft保存済み').waitFor();
    await context.close();

    context = await launch(390); context.on('request', (request) => requests.push(request.url()));
    page = context.pages()[0] ?? await context.newPage();
    await page.goto(fixture('stage-99000101.html'));
    await bar(page).getByText('このstageで停止').waitFor();
    await bar(page).getByRole('button', { name: 'このタブへ担当を移す' }).click();
    await bar(page).getByText('draft保存済み').waitFor();
    await bar(page).getByRole('button', { name: '次のステージへ' }).click();
    await page.waitForURL(fixture('stage-99000102.html')); await bar(page).getByText('draft保存済み').waitFor();
    assert.equal(requests.filter((url) => /stage-99000103\.html$/.test(url)).length, 0, 'no third stage before owner tap');
    await bar(page).getByRole('button', { name: '次のステージへ' }).click();
    await page.waitForURL(fixture('stage-99000103.html')); await bar(page).getByText('draft保存済み').waitFor();
    const reviewOpened = context.waitForEvent('page');
    await bar(page).getByRole('button', { name: '計算画面で確認' }).click();
    const review = await reviewOpened; await review.waitForLoadState();
    await review.getByText('calculatorが検証し、端末へ永続受領しました。').waitFor();
    assert.match(await review.locator('#summary').innerText(), /stage数\s*3[\s\S]*安全検査\s*passed/);
    await review.locator('#reviewed').check(); await review.getByText('owner確認済み').waitFor();
    await review.locator('#apply').click(); await review.getByText('このbatchは適用済みです。').waitFor();
    await review.locator('#rollback').click(); await review.getByText('owner確認済み').waitFor();
    await review.locator('#apply').click(); await review.getByText('このbatchは適用済みです。').waitFor();

    await page.reload(); await bar(page).getByText('draft保存済み').waitFor();
    const duplicateOpened = context.waitForEvent('page');
    await bar(page).getByRole('button', { name: '計算画面で確認' }).click();
    const duplicate = await duplicateOpened; await duplicate.waitForLoadState();
    await duplicate.getByText('このbatchは適用済みです。').waitFor();
    assert.equal(await duplicate.locator('#apply').isDisabled(), true);
    assert.equal(requests.filter((url) => /stage-99000101\.html$/.test(url)).length >= 2, true);
    assert.equal(requests.filter((url) => /stage-99000102\.html$/.test(url)).length, 1);
    assert.equal(requests.filter((url) => /stage-99000103\.html$/.test(url)).length, 2);
  } finally { await context.close().catch(() => {}); }
});

for (const width of [360, 390]) test(`extension control stays inside ${width}px viewport`, { timeout: TIMEOUT }, async () => {
  const isolated = await mkdtemp(path.join(tmpdir(), `phase11-one-tap-${width}-`));
  const context = await chromium.launchPersistentContext(isolated, {
    headless: true, channel: 'chromium', viewport: { width, height: 800 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  try {
    const page = context.pages()[0] ?? await context.newPage(); await page.goto(fixture('event.html'));
    await bar(page).getByText('eventを確認しました').waitFor();
    const value = await page.evaluate(() => {
      const root = document.querySelector('#phase11-one-tap-root'); const rect = root.shadowRoot.querySelector('.bar').getBoundingClientRect();
      return { viewport: innerWidth, left: rect.left, right: rect.right, documentWidth: document.documentElement.scrollWidth };
    });
    assert.equal(value.viewport, width); assert.ok(value.left >= 0 && value.right <= width + 1); assert.ok(value.documentWidth <= width + 1);
  } finally { await context.close(); await rm(isolated, { recursive: true, force: true }); }
});

test('calculator receiver is idempotent and rejects a valid changed payload with the same batch ID', { timeout: TIMEOUT }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' }); const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(fixture('event.html'));
    const value = await page.evaluate(async () => {
      const api = await import('/generated/phase11/api.mjs');
      const { default: baseline } = await import('/generated/phase11/baseline.mjs');
      const eventHtml = await (await fetch('/phase11-one-tap-fixture/event.html')).text();
      const stageHtml = await (await fetch('/phase11-one-tap-fixture/stage-99000101.html')).text();
      const decode = (html) => ({ format: 'html', html, observedUrl: null, resources: new Map() });
      const capturedAt = '2026-09-09T00:00:00.000Z';
      const event = api.parseDokkanInfoSavedPage(decode(eventHtml), { capturedAt });
      const first = api.parseDokkanInfoSavedPage(decode(stageHtml), { capturedAt });
      const changed = api.parseDokkanInfoSavedPage(decode(stageHtml.replace('600,000', '610,000')), { capturedAt });
      const firstPack = await api.packagePages([event, first]); const changedPack = await api.packagePages([event, changed]);
      const batchId = 'batch-conflict-fixture-1';
      const firstBatch = await api.makeOneTapBatch({ batchId, eventId: '990001', packages: [firstPack] });
      const changedBatch = await api.makeOneTapBatch({ batchId, eventId: '990001', packages: [changedPack] });
      const personal = new api.PrototypeStore({ name: `${api.DATABASE_NAME}-test-${crypto.randomUUID()}` });
      const store = new api.BatchReceiverStore({ name: `${api.RECEIVER_DATABASE_NAME}-test-${crypto.randomUUID()}`, official: baseline.runtime, personalStore: personal });
      const received = await store.receive(firstBatch); const duplicate = await store.receive(firstBatch); let conflict = null;
      try { await store.receive(changedBatch); } catch (error) { conflict = error.code; }
      store.close(); return { first: received.record.state, duplicate: duplicate.duplicate, conflict };
    });
    assert.deepEqual(value, { first: 'received', duplicate: true, conflict: 'BATCH_CONFLICT' });
  } finally { await context.close(); await browser.close(); }
});
