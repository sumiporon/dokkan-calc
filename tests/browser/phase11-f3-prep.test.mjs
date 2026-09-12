import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';

test('F3-prep stays fixture-only, waits for the owner tap, and reaches read-only inspection', async () => {
  const server=await startStaticServer(), browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844}}), external=[],errors=[];
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==server.origin){external.push(route.request().url());return route.abort();}return route.continue();});
    await context.addInitScript(()=>{window.fetch=()=>{throw new Error('unexpected fetch');};XMLHttpRequest.prototype.open=()=>{throw new Error('unexpected XHR');};});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    const base=`${server.origin}/prototypes/phase11-f3-prep/index.html`;
    await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'FULL fixture'}).click();
    assert.match(await page.locator('#screen').innerText(),/まだcapture・scan・保存は実行していません/);
    await page.getByRole('button',{name:'このstageを確認'}).click();await page.getByRole('heading',{name:'完全データを保存しました'}).waitFor();
    await page.getByRole('button',{name:'取得結果を確認'}).click();await page.getByRole('heading',{name:'typed inspection review'}).waitFor();assert.match(await page.locator('#screen').innerText(),/完全データ保存済み: 1stage/);
    await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'PARTIAL fixture'}).click();await page.getByRole('button',{name:'このstageを確認'}).click();await page.getByRole('heading',{name:'一部の材料を保存しました'}).waitFor();assert.match(await page.locator('#screen').innerText(),/計算できるかどうかは、この段階ではまだ判定していません/);await page.getByRole('button',{name:'この限定確認を破棄'}).click();await page.getByRole('heading',{name:'限定確認を破棄しました'}).waitFor();
    await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'UNUSABLE fixture'}).click();await page.getByRole('button',{name:'このstageを確認'}).click();await page.getByRole('heading',{name:'このstageでは安全に保存できません'}).waitFor();assert.equal(await page.getByRole('button',{name:'次のステージへ'}).count(),0);
    for(const width of [360,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  } finally {await browser.close();await server.close();}
});
