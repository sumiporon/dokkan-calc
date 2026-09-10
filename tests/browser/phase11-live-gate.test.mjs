import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';
import { dokkanInfoEventHtml, dokkanInfoStageHtml } from '../fixtures/phase11/dokkaninfo-source.mjs';

const eventId = '990001';
const stages = [1, 2, 3, 4].map(n => ({ id: `9900010${n}`, name: `架空${n}` }));
const source = `https://jpnja.dokkaninfo.com/events/challenge/${eventId}`;
const meta = (html, url) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8"><meta name="phase11-fixture-source-url" content="${url}">`);
const bar = page => page.locator('#phase11-one-tap-root');
async function setup(options = {}) {
  const server = await startStaticServer();
  const profile = await mkdtemp(path.join(tmpdir(), 'phase11-live-gate-'));
  const ext = path.resolve('generated/phase11-one-tap/live-gate-test');
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', viewport: { width: 390, height: 844 }, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  const visited = [];
  await context.route('**/live-gate-fixture/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop(); visited.push(name);
    const index = stages.findIndex(x => name === `stage-${x.id}.html`);
    const html = index < 0 ? meta(dokkanInfoEventHtml({ eventId, stages }), source) : meta(dokkanInfoStageHtml({ eventId, stageId: stages[index].id, ...options }), `${source}/${stages[index].id}`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  const page = context.pages()[0]; await page.goto(`${server.origin}/live-gate-fixture/event.html`);
  return { page, context, visited, close: async () => { await context.close(); await server.close(); await rm(profile, { recursive: true, force: true }); } };
}
test('live gate stops at three of four links, persists before tap, exposes review values without apply', { timeout: 120000 }, async () => {
  const t = await setup();
  try {
    await bar(t.page).getByText('先頭3stage', { exact: false }).waitFor();
    assert.deepEqual(t.visited, ['event.html']);
    await bar(t.page).getByRole('button', { name: '開始', exact: true }).click();
    for (let n = 1; n <= 3; n++) {
      await bar(t.page).getByText(`${n}/3 stage`, { exact: false }).waitFor();
      assert.equal(t.visited.filter(x => x.startsWith('stage-')).length, n);
      if (n < 3) await bar(t.page).getByRole('button', { name: '次のステージへ' }).click();
    }
    const opened = t.context.waitForEvent('page');
    await bar(t.page).getByRole('button', { name: '計算画面で確認' }).click();
    const review = await opened;
    await review.getByText('received：限定batch', { exact: false }).waitFor();
    assert.match(await review.locator('#summary').innerText(), /stage数\s*3/);
    const values = await review.locator('#records').innerText();
    for (const number of ['10000000', '600000', '150000', '1500000', '2500000']) assert.ok(values.includes(number), number);
    assert.match(values, /必殺条件/);
    assert.equal(await review.getByRole('button').count(), 0);
    assert.equal(t.visited.includes('stage-99000104.html'), false);
    await t.page.goto(t.page.url().replace(/stage-[^/]+$/, 'event.html'));
    await bar(t.page).getByText('この検証は開始済みです').waitFor();
    assert.equal(await bar(t.page).getByRole('button', { name: '開始', exact: true }).count(), 0);
  } finally { await t.close(); }
});
for (const [name, options] of [['missing ATK', { missing: 'atk' }], ['unknown AOE meaning', { includeArea: true }]]) {
  test(`live gate fails closed on ${name}`, { timeout: 120000 }, async () => {
    const t = await setup(options);
    try {
      await bar(t.page).getByRole('button', { name: '開始', exact: true }).click();
      await bar(t.page).getByText(/^この(stage|ページ)で停止$/).waitFor();
      assert.equal(await bar(t.page).getByRole('button', { name: '次のステージへ' }).count(), 0);
      assert.equal(t.visited.filter(x => x.startsWith('stage-')).length, 1);
    } finally { await t.close(); }
  });
}
