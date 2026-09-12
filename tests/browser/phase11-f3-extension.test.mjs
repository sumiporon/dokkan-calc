import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';
import { f3Fixture } from '../../prototypes/phase11-f3-prep/fixtures.mjs';

async function setup(kind,index=1){
  const server=await startStaticServer(),profile=await mkdtemp(path.join(tmpdir(),'phase11-f3-extension-')),eventId=`99200${index}`,stageId=`99200${index}01`,fixture=f3Fixture(kind,{eventId,stageId,stageName:`${kind} fixture`});
  const ext=path.resolve('generated/phase11-f3-extension/fixture-test'),context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chromium',viewport:{width:390,height:844},args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]}),external=[];
  await context.route('**/*',async route=>{const url=route.request().url();if(url.startsWith(server.origin)){const marked=fixture.stageHtml.replace('<meta charset="utf-8">',`<meta charset="utf-8"><meta name="phase11-f3-fixture-kind" content="${kind}">`);return route.fulfill({contentType:'text/html',body:marked});}if(/^https?:/i.test(url))external.push(url);return route.continue();});
  const page=context.pages()[0],url=`${server.origin}/events/challenge/${eventId}/${stageId}`;await page.goto(url);await page.locator('#phase11-f3-root').waitFor();
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  return{page,context,worker,external,close:async()=>{await context.close();await server.close();await rm(profile,{recursive:true,force:true});}};
}
const storage=worker=>worker.evaluate(()=>chrome.storage.local.get(null));
for(const [kind,title,index] of [['full','完全データを保存しました',1],['partial','一部の材料を保存しました',2],['relationship','このstageでは安全に保存できません',3]])test(`F3 extension ${kind} waits for tap, saves typed records, reviews, and discards`,{timeout:120000},async()=>{
  const t=await setup(kind,index);try{
    assert.deepEqual(await storage(t.worker),{});assert.match(await t.page.locator('#phase11-f3-root').innerText(),/明示操作前/);
    await t.page.getByRole('button',{name:'このstageを確認'}).click();await t.page.getByText(title,{exact:true}).waitFor();const values=await storage(t.worker),keys=Object.keys(values);assert.ok(keys.some(key=>key.includes(':review:')));assert.equal(JSON.stringify(values).includes('<html'),false);
    const opened=t.context.waitForEvent('page');await t.page.getByRole('button',{name:'取得結果を確認'}).click();const review=await opened;await review.waitForLoadState('domcontentloaded');await review.getByRole('heading',{name:'取得結果の確認'}).waitFor({timeout:5000}).catch(async()=>{throw new Error(`review failed at ${review.url()}: ${await review.locator('body').innerText()}`);});assert.match(await review.locator('#screen').innerText(),kind==='relationship'?/利用不可|安全に確認/:kind==='partial'?/部分材料/:/完全データ/);
    await review.getByRole('button',{name:'この限定確認を破棄'}).click();await review.getByRole('heading',{name:'限定確認を破棄しました'}).waitFor();assert.deepEqual(await storage(t.worker),{});assert.deepEqual(t.external,[]);
  }finally{await t.close();}
});
test('F3 extension startup cleanup and review tamper fail closed',{timeout:120000},async()=>{
  const t=await setup('partial',4);try{
    const prefix='phase11-f3:',id='f1-f3-expired',index=`${prefix}capture:${id}`,other=`${prefix}review:${id}`;
    await t.worker.evaluate(({index,other,id})=>chrome.storage.local.set({[index]:{captureId:id,expiresAt:'2000-01-01T00:00:00.000Z',payload:{recordKeys:[index,other]}},[other]:{captureId:id}}),{index,other,id});
    await t.page.reload();await t.page.locator('#phase11-f3-root').waitFor();
    await assert.doesNotReject(async()=>{for(let attempt=0;attempt<20;attempt+=1){if(Object.keys(await storage(t.worker)).length===0)return;await t.page.waitForTimeout(50);}throw new Error('expired capture was not removed');});
    await t.page.getByRole('button',{name:'このstageを確認'}).click();await t.page.getByText('一部の材料を保存しました',{exact:true}).waitFor();
    await t.worker.evaluate(async()=>{const all=await chrome.storage.local.get(null),key=Object.keys(all).find(value=>value.includes(':review:'));all[key].payload.batchDigest='sha256:'+'0'.repeat(64);await chrome.storage.local.set({[key]:all[key]});});
    const opened=t.context.waitForEvent('page');await t.page.getByRole('button',{name:'取得結果を確認'}).click();const review=await opened;await review.waitForLoadState('domcontentloaded');await review.getByRole('heading',{name:'確認結果を表示できません'}).waitFor();
    await t.page.getByRole('button',{name:'この限定確認を破棄'}).click();await t.page.getByRole('strong').filter({hasText:'限定確認を破棄しました'}).waitFor();assert.deepEqual(await storage(t.worker),{});assert.deepEqual(t.external,[]);
  }finally{await t.close();}
});
