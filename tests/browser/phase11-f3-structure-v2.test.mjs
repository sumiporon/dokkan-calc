import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';
import { CASES, fixture } from '../../prototypes/phase11-f3-structure-v2-extension/fixtures.mjs';
const out = 'generated/phase11-f3-structure-extension/v2';
const probe = page => page.evaluate(() => JSON.parse(document.documentElement.dataset.structureProbe));
const report = async page => JSON.parse(await page.locator('#diagnostic-json').inputValue());
async function setup() {
  const server = await startStaticServer();
  const profile = await mkdtemp(path.join(tmpdir(), 'phase11-structure-v2-'));
  const ext = path.resolve(out + '/fixture-test');
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', viewport: { width: 390, height: 844 }, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  const external = [], errors = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== server.origin) { external.push(u.href); return route.abort(); }
    const f = Object.keys(CASES).map(fixture).find(f => u.pathname === `/events/challenge/${f.eventId}/${f.stageId}`);
    return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; connect-src 'none'" }, body: f?.html ?? '<html><body>Not allowed fixture</body></html>' });
  });
  const page = await context.newPage();
  const visit = async kind => { const f = fixture(kind); await page.goto(`${server.origin}/events/challenge/${f.eventId}/${f.stageId}`); await page.getByRole('button', { name: 'このstageの構造を確認' }).waitFor(); };
  return { server, context, page, external, errors, visit, async close() { await context.close(); await server.close(); await rm(profile, { recursive: true, force: true }); } };
}

test('v2 isolated content world: all fixtures, trusted tap only, one snapshot, no source operations, 360/390', { timeout: 120000 }, async () => {
  const t = await setup();
  try {
    for (const kind of Object.keys(CASES)) {
      await t.visit(kind); assert.deepEqual(await probe(t.page), { html: 0, digest: 0, network: 0, storage: 0, copy: 0 });
      assert.equal(await t.page.locator('#diagnostic-json').count(), 0);
      await t.page.getByRole('button', { name: 'このstageの構造を確認' }).evaluate(b => b.click());
      assert.equal((await probe(t.page)).html, 0);
      const requests = [], listener = r => requests.push(r.url()); t.page.on('request', listener);
      await t.page.getByRole('button', { name: 'このstageの構造を確認' }).click(); await t.page.locator('#diagnostic-json').waitFor();
      assert.deepEqual(await probe(t.page), { html: 1, digest: 1, network: 0, storage: 0, copy: 0 });
      const r = await report(t.page); assert.equal(r.formatVersion, 2); assert.equal(r.coverage.status, 'unconfirmed');
      assert.ok(Buffer.byteLength(JSON.stringify(r)) <= 250000); assert.equal('classification' in r, false); assert.equal('snapshot' in r, false);
      for (const n of r.nodes) assert.ok(n.text.length <= 160 && n.path.length <= 1000);
      if (kind === 'normal') { assert.equal(r.counts.superCandidates, 1); assert.equal(r.counts.conditionCandidates, 2); }
      if (kind === 'noClass') { assert.equal(r.observations.find(o => o.field === 'super-root').state, 'ambiguous'); assert.ok(r.observations.some(o => o.field === 'hp-condition' && o.state === 'ambiguous')); }
      if (kind === 'blank') { assert.ok(r.observations.some(o => o.field === 'super-specific-count' && o.state === 'blank')); assert.ok(r.observations.some(o => o.field === 'super-specific-count' && o.metadata.valueText === '0')); }
      assert.equal(await t.page.getByRole('button', { name: 'このstageの構造を確認' }).isDisabled(), true);
      for (const width of [360, 390]) { await t.page.setViewportSize({ width, height: 844 }); assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
      assert.deepEqual(requests, []); t.page.off('request', listener);
    }
    assert.deepEqual(t.external, []); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('v2 URL sandwich stop, real permissionless copy/failure, reload noncapture and entry gates', { timeout: 120000 }, async () => {
  const t = await setup();
  try {
    await t.visit('normal'); await t.page.evaluate(() => { document.documentElement.dataset.testUrlDrift = 'yes'; });
    await t.page.getByRole('button', { name: 'このstageの構造を確認' }).click();
    await t.page.getByText('取得中にページのURLが変わったため停止しました。', { exact: true }).waitFor();
    assert.equal(await t.page.locator('#diagnostic-json').count(), 0); assert.deepEqual(await probe(t.page), { html: 1, digest: 0, network: 0, storage: 0, copy: 0 });
    await t.visit('blank'); await t.page.getByRole('button', { name: 'このstageの構造を確認' }).click(); await t.page.locator('#diagnostic-json').waitFor();
    const expected = await t.page.locator('#diagnostic-json').inputValue();
    await t.page.getByRole('button', { name: '診断結果をコピー' }).evaluate(b => b.click()); assert.equal((await probe(t.page)).copy, 0);
    await t.page.getByRole('button', { name: '診断結果をコピー' }).click(); await t.page.getByText('診断結果をコピーしました。', { exact: true }).waitFor();
    // Only the test PAGE receives read permission, after actual gesture copy.
    await t.context.grantPermissions(['clipboard-read'], { origin: t.server.origin });
    assert.equal(await t.page.evaluate(() => navigator.clipboard.readText()), expected);
    await t.page.evaluate(() => { document.documentElement.dataset.testCopyFailure = 'yes'; });
    await t.page.getByRole('button', { name: '診断結果をコピー' }).click();
    await t.page.getByText('コピーできませんでした。診断結果の欄を長押しして手動でコピーできます。', { exact: true }).waitFor();
    assert.equal((await probe(t.page)).copy, 2); assert.equal((await probe(t.page)).html, 1);
    await t.page.reload(); await t.page.getByRole('button', { name: 'このstageの構造を確認' }).waitFor();
    assert.equal(await t.page.locator('#diagnostic-json').count(), 0); assert.deepEqual(await probe(t.page), { html: 0, digest: 0, network: 0, storage: 0, copy: 0 });
    await t.page.goto(`${t.server.origin}/events/challenge/993300/99330099`); assert.equal(await t.page.locator('#f3-structure-ui').count(), 0);
    await t.page.goto(`${t.server.origin}/events/challenge/993300/99330001?wrong`); assert.equal(await t.page.locator('#f3-structure-ui').count(), 0);
    assert.deepEqual(t.external, []); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('v2 owner preview serves same UI: result/copy, bounded text and narrow layout', { timeout: 60000 }, async () => {
  const server = await startStaticServer({ root: path.resolve(out + '/preview') });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => { if (new URL(route.request().url()).origin !== server.origin) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
    await page.goto(`${server.origin}/index.html`); await page.getByRole('link', { name: CASES.normal, exact: true }).click();
    assert.equal(await page.locator('#diagnostic-json').count(), 0); await page.screenshot({ path: out + '/preview-initial.png' });
    await page.getByRole('button', { name: 'このstageの構造を確認' }).click(); await page.getByRole('heading', { name: '構造診断結果', exact: true }).waitFor();
    assert.equal((await report(page)).formatVersion, 2);
    await page.getByRole('button', { name: '診断結果をコピー' }).click(); await page.getByText('診断結果をコピーしました。', { exact: true }).waitFor();
    await page.setViewportSize({ width: 360, height: 800 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: out + '/preview-result.png' }); assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser.close(); await server.close(); }
});
