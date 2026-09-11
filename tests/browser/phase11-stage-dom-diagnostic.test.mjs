import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { dokkanInfoStageHtml } from '../fixtures/phase11/dokkaninfo-source.mjs';
import { parseCachedStageHtml } from '../../src/data-foundation/dokkaninfo-saved-stage.mjs';

const command = await readFile(new URL('../../scripts/phase11-stage-dom-diagnostic.js', import.meta.url), 'utf8');

test('USB diagnostic distinguishes blank / hidden text / attributes without requests or page writes', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    let requests = 0;
    await context.route('**/*', route => { requests++; return route.abort(); });
    // Fictional document only, never navigate to the real source URL.
    const html = dokkanInfoStageHtml().replaceAll(/最大ATK\/ターン:(<\/b>)? 1/g, '最大ATK/ターン:$1 ');
    await page.setContent(html);
    const run = () => page.evaluate(code => {
      const before = document.documentElement.outerHTML;
      let diagnostic;
      // Local test supplies only identity strings; location is not navigated.
      const execute = new Function('document', 'location', 'copy', code);
      execute(document, { origin: 'https://jpnja.dokkaninfo.com', pathname: '/events/challenge/1705/17050015' }, text => { diagnostic = JSON.parse(text); });
      return { diagnostic, unchanged: before === document.documentElement.outerHTML };
    }, command);
    const beforeRequests = requests;
    const blank = await run();
    assert.equal(blank.unchanged, true);
    assert.equal(blank.diagnostic.counts.enemyRows, 1);
    assert.match(blank.diagnostic.enemies[0].enemyWideMaxLabel, /8$/);
    assert.equal(parseCachedStageHtml(html, {}).enemies[0].superAttacks[0].usageRules[0].maxPerTurn, null);
    await page.evaluate(() => {
      const column = document.querySelector('.row.d-flex.align-items-center').children[2];
      column.setAttribute('data-max-per-turn', '4');
      column.setAttribute('data-session-token', 'DO_NOT_EXPORT');
      const hidden = document.createElement('span'); hidden.hidden = true; hidden.textContent = '最大ATK/ターン: 7'; column.append(hidden);
      const input = document.createElement('input'); input.type = 'hidden'; input.value = '3'; column.append(input);
      const script = document.createElement('script'); script.type = 'application/json'; script.textContent = '{"unrelated":"DO_NOT_EXPORT"}'; column.append(script);
    });
    const changed = await run();
    assert.equal(changed.unchanged, true);
    assert.equal(changed.diagnostic.enemies[0].superColumn.attributes['data-max-per-turn'], '4');
    const json = JSON.stringify(changed.diagnostic);
    assert.ok(json.includes('最大ATK/ターン: 7'));
    assert.ok(json.includes('"display":"none"'));
    assert.ok(json.includes('"currentValue":"3"'));
    assert.ok(!json.includes('DO_NOT_EXPORT'));
    assert.ok(changed.diagnostic.omissions.includes('SCRIPT'));
    assert.equal(requests, beforeRequests);
    const hiddenHtml = dokkanInfoStageHtml().replaceAll(/最大ATK\/ターン:(<\/b>)? 1/g, '最大ATK/ターン:$1 <span hidden>7</span>');
    assert.equal(parseCachedStageHtml(hiddenHtml, {}).enemies[0].superAttacks[0].usageRules[0].maxPerTurn, 7);
    await assert.rejects(page.evaluate(code => new Function('document', 'location', 'copy', code)(document,
      { origin: 'https://example.invalid', pathname: '/' }, () => {}), command), /対象のAndroid/);
  } finally { await browser.close(); }
});
