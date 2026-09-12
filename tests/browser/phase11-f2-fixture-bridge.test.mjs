import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';

test('F2 browser fixture uses only self-authored HTML, reaches the mixed final state, and sends a stopped batch only to inspection', async () => {
  const server=await startStaticServer(), browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844}}), external=[], errors=[];
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==server.origin){external.push(route.request().url());return route.abort();}return route.continue();});
    await context.addInitScript(()=>{window.fetch=()=>{throw new Error('Unexpected fetch');}; XMLHttpRequest.prototype.open=()=>{throw new Error('Unexpected XHR');};});
    const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message)); page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    const base=`${server.origin}/prototypes/phase11-f2/index.html`;
    await page.goto(base,{waitUntil:'domcontentloaded'}); await page.getByRole('button',{name:'Event A：mixed完走'}).click();
    for(let index=0;index<3;index+=1){await page.getByRole('button',{name:index===2?'最終確認へ':'次のステージへ'}).click(); if(index<2)await page.getByRole('button',{name:'次のステージへ'}).click();}
    assert.match(await page.locator('#screen').innerText(),/完全データ 2stage \/ 部分材料 1stage \/ 合計 3stage/);
    await page.goto(base,{waitUntil:'domcontentloaded'}); await page.getByRole('button',{name:'Event B：unusable停止'}).click();
    for(let index=0;index<3;index+=1){await page.getByRole('button',{name:'次のステージへ'}).click(); if(index<2)await page.getByRole('button',{name:'次のステージへ'}).click();}
    await page.getByRole('heading',{name:'このstageでは安全に保存できません'}).waitFor(); assert.equal(await page.getByRole('button',{name:'次のステージへ'}).count(),0);
    await page.getByRole('button',{name:'取得結果を確認'}).click(); await page.getByRole('heading',{name:'typed inspection review'}).waitFor();
    assert.match(page.url(),/prototypes\/phase11-typed-inspection\/index\.html#batch=/); assert.match(await page.locator('#screen').innerText(),/完全データ保存済み: 1stage \/ 部分材料保存済み: 1stage \/ 利用不可: 1stage \/ 未取得: 1stage/);
    assert.match(await page.locator('#screen').innerText(),/部分材料保存済み・計算可否は未判定です/); assert.equal(await page.getByRole('button').count(),0);
    for(const width of [360,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  } finally {await browser.close();await server.close();}
});
