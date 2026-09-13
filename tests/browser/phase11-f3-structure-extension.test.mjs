import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';
import { DIAGNOSTIC_CASES, diagnosticFixture } from '../../prototypes/phase11-f3-structure-extension/fixtures.mjs';

async function setup() {
  const server = await startStaticServer();
  const profile = await mkdtemp(path.join(tmpdir(), 'phase11-structure-extension-'));
  const ext = path.resolve('generated/phase11-f3-structure-extension/fixture-test');
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', viewport: { width: 390, height: 844 }, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  const external = [], errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== server.origin) { external.push(url.href); return route.abort(); }
    const f = Object.keys(DIAGNOSTIC_CASES).map(diagnosticFixture).find(f => url.pathname === `/events/challenge/${f.eventId}/${f.stageId}`);
    if (!f) return route.fulfill({ contentType: 'text/html', body: '<html><body>Not an allowed fixture</body></html>' });
    return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; connect-src 'none'" }, body: f.html });
  });
  const page = await context.newPage();
  const visit = async kind => { const f = diagnosticFixture(kind); await page.goto(`${server.origin}/events/challenge/${f.eventId}/${f.stageId}`); await page.getByRole('button', { name: 'このstageの構造を確認' }).waitFor(); };
  return { context, page, server, external, errors, visit, async close() { await context.close(); await server.close(); await rm(profile, { recursive: true, force: true }); } };
}
const probe = page => page.evaluate(() => JSON.parse(document.documentElement.dataset.structureProbe));
const report = async page => JSON.parse(await page.locator('#diagnostic-json').inputValue());

test('actual isolated content script: nine fixtures, no operations before tap, one snapshot and bounded memory-only results', { timeout: 120000 }, async () => {
  const t = await setup();
  try {
    for (const kind of Object.keys(DIAGNOSTIC_CASES)) {
      await t.visit(kind);
      assert.deepEqual(await probe(t.page), { html: 0, digest: 0, network: 0, storage: 0, copy: 0 });
      // A page-created synthetic click must not invoke the extension capture.
      await t.page.getByRole('button', { name: 'このstageの構造を確認' }).evaluate(b => b.click());
      assert.equal((await probe(t.page)).html, 0);
      const requests = []; const listener = req => requests.push(req.url()); t.page.on('request', listener);
      await t.page.getByRole('button', { name: 'このstageの構造を確認' }).click();
      await t.page.locator('#diagnostic-json').waitFor();
      assert.deepEqual(await probe(t.page), { html: 1, digest: 1, network: 0, storage: 0, copy: 0 });
      const r = await report(t.page);
      assert.equal(r.coverage.status, 'unconfirmed'); assert.equal('snapshot' in r, false); assert.equal('classification' in r, false);
      assert.doesNotMatch(JSON.stringify(r), /<html|PRIVATE_CANARY/);
      for (const o of r.observations) for (const c of o.candidates) assert.ok(c.text.length <= 160);
      await t.page.getByRole('heading', { name: r.issues.length ? '構造を安全に判定できませんでした' : '構造診断が完了しました', exact: true }).waitFor();
      if (kind === 'normal') { assert.equal(r.counts.enemies, 2); assert.equal(r.counts.supers, 4); }
      if (kind === 'blank') {
        assert.ok(r.observations.some(o => o.field === 'super-specific-count' && o.state === 'blank'));
        assert.ok(r.observations.some(o => o.field === 'super-specific-count' && o.candidates[0]?.text === '0'));
      }
      if (kind === 'empty') assert.equal(r.counts.enemies, 0);
      if (kind === 'ownership') assert.ok(r.issues.some(i => i.code === 'identity-unconfirmed'));
      assert.equal(await t.page.getByRole('button', { name: 'このstageの構造を確認' }).isDisabled(), true);
      for (const width of [360, 390]) { await t.page.setViewportSize({ width, height: 844 }); assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
      assert.deepEqual(requests, []); t.page.off('request', listener);
    }
    assert.deepEqual(t.external, []); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});
test('URL drift rejected, permissionless actual copy and copy failure, reload clears result and does not recapture', { timeout: 120000 }, async () => {
  const t = await setup();
  try {
    await t.visit('normal');
    await t.page.evaluate(() => { document.documentElement.dataset.testUrlDrift = 'yes'; });
    await t.page.getByRole('button', { name: 'このstageの構造を確認' }).click();
    await t.page.getByText('取得中にページのURLが変わったため停止しました。', { exact: true }).waitFor();
    assert.equal(await t.page.locator('#diagnostic-json').count(), 0);
    assert.deepEqual(await probe(t.page), { html: 1, digest: 0, network: 0, storage: 0, copy: 0 });
    await t.visit('blank');
    await t.page.getByRole('button', { name: 'このstageの構造を確認' }).click(); await t.page.locator('#diagnostic-json').waitFor();
    const expected = await t.page.locator('#diagnostic-json').inputValue();
    await t.page.getByRole('button', { name: '診断結果をコピー' }).click();
    await t.page.getByText('診断結果をコピーしました。', { exact: true }).waitFor();
    // Read permission is given to the test page only, AFTER the actual user-gesture copy.
    // Neither candidate nor test extension has any clipboard permission.
    await t.context.grantPermissions(['clipboard-read'], { origin: t.server.origin });
    const copied = await t.page.evaluate(() => navigator.clipboard.readText());
    // Windows clipboard translates line endings; diagnostic bytes inside JSON values must stay intact.
    assert.equal(copied.replace(/\r\n/g, '\n'), expected);
    await t.page.evaluate(() => { document.documentElement.dataset.testCopyFailure = 'yes'; });
    await t.page.getByRole('button', { name: '診断結果をコピー' }).click();
    await t.page.getByText('コピーできませんでした。診断結果の欄を長押しして手動でコピーできます。', { exact: true }).waitFor();
    assert.equal((await probe(t.page)).html, 1); assert.equal((await probe(t.page)).copy, 2);
    await t.page.reload(); await t.page.getByRole('button', { name: 'このstageの構造を確認' }).waitFor();
    assert.equal(await t.page.locator('#diagnostic-json').count(), 0);
    assert.deepEqual(await probe(t.page), { html: 0, digest: 0, network: 0, storage: 0, copy: 0 });
    await t.page.goto(`${t.server.origin}/events/challenge/992200/99220010`);
    assert.equal(await t.page.locator('#f3-structure-ui').count(), 0);
    assert.deepEqual(t.external, []); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('owner localhost preview uses the same UI and shows blank versus zero without runtime errors', { timeout: 60000 }, async () => {
  const server = await startStaticServer({ root: path.resolve('generated/phase11-f3-structure-extension/preview') });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${server.origin}/index.html`);
    await page.getByRole('link', { name: DIAGNOSTIC_CASES.blank, exact: true }).click();
    await page.getByRole('button', { name: 'このstageの構造を確認' }).waitFor();
    assert.equal(await page.locator('#diagnostic-json').count(), 0);
    await page.screenshot({ path: 'generated/phase11-f3-structure-extension/preview-initial.png' });
    await page.getByRole('button', { name: 'このstageの構造を確認' }).click();
    await page.getByRole('heading', { name: '構造診断が完了しました', exact: true }).waitFor();
    const r = await report(page);
    assert.ok(r.observations.some(o => o.field === 'super-specific-count' && o.state === 'blank'));
    assert.ok(r.observations.some(o => o.field === 'super-specific-count' && o.candidates[0]?.text === '0'));
    await page.screenshot({ path: 'generated/phase11-f3-structure-extension/preview-result.png' });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser.close(); await server.close(); }
});
