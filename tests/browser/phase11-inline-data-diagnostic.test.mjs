import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const code = await readFile(new URL('../../scripts/phase11-inline-data-diagnostic.js', import.meta.url), 'utf8');
test('inline diagnostic reads synthetic JSON only, preserves scope and never executes source code', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    let requests = 0;
    await context.route('**/*', route => { requests++; return route.abort(); });
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const run = () => page.evaluate(command => {
      const before = document.documentElement.outerHTML;
      let result;
      new Function('document', 'location', 'copy', command)(document,
        { origin: 'https://jpnja.dokkaninfo.com', pathname: '/events/challenge/1705/17050015' },
        text => { result = JSON.parse(text); });
      if (before !== document.documentElement.outerHTML) throw new Error('DOM changed');
      return result;
    }, code);
    assert.equal((await run()).status, 'no-count-candidate-in-limited-inline-data');
    // Artificial identifiers/counts; not a captured source page or game data.
    await page.evaluate(() => {
      const add = (text, attributes = {}) => {
        // innerHTML-created script elements are inert: even test source JS
        // is never executed, and no real page is navigated to.
        const holder = document.createElement('div'); holder.innerHTML = '<script></script>';
        const script = holder.firstChild; script.textContent = text;
        for (const [key, value] of Object.entries(attributes)) script.setAttribute(key, value);
        document.body.append(script);
      };
      add(JSON.stringify({ stageId: 17050015, enemies: [{ id: 999001, attacks: [{ id: 999002, hpMinPercent: 12, maxPerTurn: 987 }] }],
        auth: { token: 'DO_NOT_EXPORT', maxPerTurn: 999 } }), { type: 'application/json' });
      add('window.__INITIAL_STATE__ = {"stageId":17050015,"usageCount":876};');
      add('window.__INITIAL_STATE__ = (() => { throw new Error("MUST_NOT_EXECUTE") })();');
      add('{"stageId":17050015,"maxPerTurn":555}', { src: '/external.js', type: 'application/json' });
      add('{"stageId":17050015,"maxPerTurn":444}', { id: 'analytics', type: 'application/json' });
      add('{"unrelated":"PRIVATE_UNRELATED","maxPerTurn":333}', { type: 'application/json' });
    });
    const beforeRequests = requests;
    const result = await run();
    assert.equal(result.status, 'candidate-fields-only-not-usable');
    const fields = result.candidates.flatMap(x => x.fields);
    assert.deepEqual(fields.map(x => x.value), [987, 876]);
    assert.equal(fields[0].enclosingContext.at(-1).context.hpMinPercent, 12);
    assert.equal(result.excluded.external, 1);
    assert.equal(result.excluded.thirdParty, 1);
    assert.equal(result.excluded.invalidJson, 1);
    assert.equal(result.excluded.privateSubtrees, 1);
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPORT|PRIVATE_UNRELATED|MUST_NOT_EXECUTE/);
    assert.equal(requests, beforeRequests);
    await assert.rejects(page.evaluate(command => new Function('document', 'location', 'copy', command)(document,
      { origin: 'https://example.invalid', pathname: '/' }, () => {}), code), /既存タブ/);
  } finally { await browser.close(); }
});
