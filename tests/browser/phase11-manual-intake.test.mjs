import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';
import { referencePage } from '../fixtures/phase11/reference-source.mjs';
import { renderReferenceHtml } from '../../src/prototype/phase11-reference-adapter.mjs';

const TIMEOUT = 120000;
const artifact = path.resolve('generated/phase11/preview.html');
const sample = (name) => path.resolve(`generated/phase11/sample-${name}`);
const output = path.resolve('test-results/phase11');
const browsers = {};
let server;
test.before(async () => {
  server = await startStaticServer(); await mkdir(output, { recursive: true });
  const systemChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browsers.chromium = await chromium.launch({ headless: true, ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}) });
  browsers.webkit = await webkit.launch({ headless: true });
});
test.after(async () => { await Promise.all(Object.values(browsers).map((browser) => browser.close())); await server?.close(); });
async function open(engine, width = 390, url) {
  const context = await browsers[engine].newContext({ viewport: { width, height: 844 }, locale: 'ja-JP', ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  // Isolated test profile: never access a real user's credentials or app data.
  await context.addInitScript(() => {
    for (const key of ['dokkan_calc_pages_state_v1', 'dokkan_calc_data_v22', 'dokkan_github_pat']) localStorage.setItem(key, 'test-sentinel-untouched');
  });
  const page = await context.newPage(); const errors = [], requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(url ?? `${server.origin}/generated/phase11/preview.html`);
  await page.locator('#status').filter({ hasText: '新しい試作状態' }).waitFor();
  return { page, context, errors, requests };
}
async function pick(page, files, expected = '検査が終わりました') {
  await page.locator('#source-files').setInputFiles(files);
  await page.locator('#status').filter({ hasText: expected }).waitFor({ timeout: 60000 });
}
async function apply(page) {
  await page.locator('#apply').click();
  await page.locator('#status').filter({ hasText: '試作へ保存しました' }).waitFor({ timeout: 60000 });
}
async function noOverflow(page, width) {
  const value = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.equal(value.width, width); assert.ok(value.document <= width + 1, JSON.stringify(value)); assert.ok(value.body <= width + 1, JSON.stringify(value));
}
async function close(run) { assert.deepEqual(run.errors, []); await run.context.close(); }

for (const engine of ['chromium', 'webkit']) for (const width of [360, 390]) {
  test(`Phase11 ${engine} ${width}px file → preview → explicit save → reload without overflow or requests`, { timeout: TIMEOUT }, async () => {
    const run = await open(engine, width), { page } = run;
    try {
      await noOverflow(page, width);
      await page.getByText('従来の汎用架空サンプルで試す', { exact: true }).click();
      const downloadPromise = page.waitForEvent('download'); await page.locator('[data-sample=mhtml]').click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'sample-complete.mhtml');
      const downloadPath = await download.path(); assert.ok(downloadPath);
      assert.match(await readFile(downloadPath, 'utf8'), /multipart\/related/);
      await pick(page, downloadPath);
      assert.equal(await page.locator('#saved-count').innerText(), '0ステージ（この試作だけ）');
      assert.match(await page.locator('#preview-body').innerText(), /イベント[\s\S]*追加 1[\s\S]*敵[\s\S]*追加 1[\s\S]*必殺[\s\S]*追加 2[\s\S]*全体攻撃[\s\S]*追加 1[\s\S]*警告 \/ エラー[\s\S]*0 \/ 0/);
      assert.match(await page.locator('#preview-body').innerText(), /全体攻撃・追加[\s\S]*720,000/);
      await noOverflow(page, width);
      await page.locator('#preview').screenshot({ path: path.join(output, `${engine}-${width}-preview.png`) });
      await apply(page);
      assert.match(await page.locator('#saved-list').innerText(), /架空必殺A[\s\S]*1,500,000[\s\S]*架空必殺B[\s\S]*2,500,000/);
      await page.reload(); await page.locator('#status').filter({ hasText: '復元しました' }).waitFor();
      assert.equal(await page.locator('#saved-count').innerText(), '1ステージ（この試作だけ）');
      await noOverflow(page, width);
      await page.screenshot({ path: path.join(output, `${engine}-${width}-saved.png`), fullPage: true });
      const keys = await page.evaluate(() => ['dokkan_calc_pages_state_v1', 'dokkan_calc_data_v22', 'dokkan_github_pat'].map((key) => localStorage.getItem(key)));
      assert.deepEqual(keys, Array(3).fill('test-sentinel-untouched'));
      assert.ok(run.requests.every((url) => url === `${server.origin}/generated/phase11/preview.html`), JSON.stringify(run.requests));
    } finally { await close(run); }
  });
}
for (const engine of ['chromium', 'webkit']) {
  test(`Phase11 ${engine} 390px self-authored DokkanInfo-shaped event + MHTML stage saves and restores locally`, { timeout: TIMEOUT }, async () => {
    const run = await open(engine, 390), { page } = run;
    try {
      await pick(page, [sample('dokkaninfo-event.html'), sample('dokkaninfo-stage.mhtml')]);
      assert.match(await page.locator('#preview-body').innerText(), /取込確認用・架空の敵[\s\S]*架空必殺A[\s\S]*1,500,000[\s\S]*架空必殺B[\s\S]*2,500,000/);
      assert.match(await page.locator('#preview-body').innerText(), /警告 \/ エラー[\s\S]*0 \/ 0/);
      await noOverflow(page, 390);
      await page.locator('#preview').screenshot({ path: path.join(output, `${engine}-390-dokkaninfo-preview.png`) });
      await apply(page);
      await page.reload(); await page.locator('#status').filter({ hasText: '復元しました' }).waitFor();
      assert.match(await page.locator('#saved-list').innerText(), /架空ステージ1[\s\S]*極知[\s\S]*600,000/);
      await noOverflow(page, 390);
      assert.ok(run.requests.every((url) => url === `${server.origin}/generated/phase11/preview.html`), JSON.stringify(run.requests));
    } finally { await close(run); }
  });

  test(`Phase11 ${engine} incomplete guidance, multi-file completion, update and rollback`, { timeout: TIMEOUT }, async () => {
    const run = await open(engine, 390), { page } = run;
    try {
      await pick(page, sample('main.html'), '不足するページ');
      assert.equal(await page.locator('#apply').isEnabled(), false);
      assert.match(await page.locator('#preview-body').innerText(), /補足[\s\S]*detail/);
      await pick(page, [sample('main.html'), sample('detail.html'), sample('second.html')]);
      await apply(page); assert.match(await page.locator('#saved-count').innerText(), /^2ステージ/);
      await pick(page, sample('updated.html')); await apply(page);
      assert.match(await page.locator('#saved-list').innerText(), /660,000/);
      await page.locator('#rollback').click(); await page.locator('#status').filter({ hasText: '1つ前の状態に戻しました' }).waitFor();
      assert.doesNotMatch(await page.locator('#saved-list').innerText(), /660,000/);
      page.once('dialog', (dialog) => dialog.accept()); await page.locator('#clear-all').click();
      await page.locator('#status').filter({ hasText: '正式データだけの状態' }).waitFor();
      assert.match(await page.locator('#saved-count').innerText(), /^0ステージ/);
      await page.reload(); await page.locator('#status').filter({ hasText: '復元しました' }).waitFor();
      assert.match(await page.locator('#saved-count').innerText(), /^0ステージ/);
      await pick(page, { name: 'unrecognized.html', mimeType: 'text/html', buffer: Buffer.from('<html><script>fetch("https://example.invalid/")</script><img src="https://example.invalid/track"></html>') }, '停止：');
      assert.match(await page.locator('#saved-count').innerText(), /^0ステージ/); assert.equal(await page.locator('#apply').isEnabled(), false);
      assert.ok(!run.requests.some((url) => !url.startsWith(server.origin)), JSON.stringify(run.requests));
      await noOverflow(page, 390);
    } finally { await close(run); }
  });
}
test('Phase11 Windows desktop preview, cancelled import and suspicious attribute change preserve save', { timeout: TIMEOUT }, async () => {
  const run = await open('chromium', 1280), { page } = run;
  try {
    await pick(page, sample('complete.html')); await page.locator('#discard').click();
    assert.match(await page.locator('#saved-count').innerText(), /^0ステージ/);
    await pick(page, sample('complete.html')); await apply(page);
    const source = referencePage(); source.records.find((row) => row.kind === 'enemy').fields.type = 'str';
    await pick(page, { name: 'attribute.html', mimeType: 'text/html', buffer: Buffer.from(renderReferenceHtml(source)) }, '安全検査で停止');
    assert.equal(await page.locator('#apply').isEnabled(), false); assert.match(await page.locator('#saved-list').innerText(), /極技/);
    await noOverflow(page, 1280); await page.screenshot({ path: path.join(output, 'chromium-desktop-blocked.png'), fullPage: true });
  } finally { await close(run); }
});

for (const engine of ['chromium', 'webkit']) {
  test(`Phase11 ${engine} isolated IndexedDB atomic abort, stale preview, corruption and rollback`, { timeout: TIMEOUT }, async () => {
    const context = await browsers[engine].newContext(); const page = await context.newPage();
    // Deliberate test harness outside the CSP-locked app, using disposable browser state.
    await page.goto(`${server.origin}/generated/phase11/sample-complete.html`);
    try {
      const result = await page.evaluate(async () => {
        const api = await import('/generated/phase11/api.mjs');
        const { default: baseline } = await import('/generated/phase11/baseline.mjs');
        const { default: samples } = await import('/generated/phase11/samples.mjs');
        const store = new api.PrototypeStore({ name: `${api.DATABASE_NAME}-test-${crypto.randomUUID()}` });
        const initial = await store.load();
        const prepare = (name, current) => api.prepareFiles([new File([samples[name]], 'fixture.html')], current, baseline.runtime);
        const ready = await prepare('complete', initial.current);
        let abort = '', stale = '', corruption = '';
        try { await store.apply(ready, baseline.runtime, { failBeforeCommit: true }); } catch (error) { abort = error.message; }
        const afterAbort = await store.load();
        const first = await store.apply(ready, baseline.runtime);
        try { await store.apply(ready, baseline.runtime); } catch (error) { stale = error.code; }
        const update = await prepare('updated', first.current);
        const second = await store.apply(update, baseline.runtime);
        const rolled = await store.rollback();
        const cleared = await store.clearAll();
        const restoredAfterClear = await store.rollback();
        const bad = structuredClone(second.current); bad.packages[0].runtime.events = [];
        await store.write(bad, restoredAfterClear.current.digest, restoredAfterClear.current);
        const recovered = await store.load();
        await store.write(bad, bad.digest, null);
        try { await store.load(); } catch (error) { corruption = error.message; }
        const raw = await store.read();
        store.close();
        return { abort, afterAbort: afterAbort.current.packages.length, first: first.current.digest, rolled: rolled.current.digest, cleared: cleared.current.packages.length, restoredAfterClear: restoredAfterClear.current.digest, stale, recovered: recovered.recovery, recoveredDigest: recovered.current.digest, corruption, badPreserved: raw.current.digest === bad.digest };
      });
      assert.match(result.abort, /atomic failure/); assert.equal(result.afterAbort, 0);
      assert.equal(result.stale, 'STALE_PREVIEW'); assert.equal(result.rolled, result.first);
      assert.equal(result.cleared, 0); assert.equal(result.restoredAfterClear, result.first);
      assert.equal(result.recovered, 'previous-recovered'); assert.equal(result.recoveredDigest, result.first);
      assert.match(result.corruption, /自動で初期化・上書きはしていません/); assert.equal(result.badPreserved, true);
    } finally { await context.close(); }
  });
}
test('Phase11 Chromium standalone file route imports and restores without HTTP', { timeout: TIMEOUT }, async () => {
  const run = await open('chromium', 390, pathToFileURL(artifact).href), { page } = run;
  try {
    await pick(page, sample('complete.mhtml')); await apply(page);
    await page.reload(); await page.locator('#status').filter({ hasText: '復元しました' }).waitFor();
    assert.match(await page.locator('#saved-count').innerText(), /^1ステージ/);
    assert.ok(run.requests.every((url) => url.startsWith('file:')), JSON.stringify(run.requests));
  } finally { await close(run); }
});

test('Phase11 fixed-tag preview route is self-contained and makes no external request', { timeout: TIMEOUT }, async () => {
  const url = `${server.origin}/phase11-preview/index.html`;
  const run = await open('chromium', 390, url), { page } = run;
  try {
    assert.match(await page.locator('main').innerText(), /DokkanInfo[\s\S]*利用許可は未確認/);
    await noOverflow(page, 390);
    assert.ok(run.requests.every((request) => request === url), JSON.stringify(run.requests));
  } finally { await close(run); }
});
