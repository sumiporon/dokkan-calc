import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from '../helpers/static-server.mjs';
import { CASES, structureFixture } from '../../prototypes/phase11-f3-structure/fixtures.mjs';

test('six fixture screens: explicit tap, one outerHTML, no network/storage, bounded observational result',async()=>{
  const server=await startStaticServer(),browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const external=[],errors=[];
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==server.origin){external.push(route.request().url());return route.abort();}return route.continue();});
    await context.addInitScript(()=>{
      window.__diagProbe={html:0,digest:0,storage:0,network:0};
      const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'outerHTML');
      Object.defineProperty(Element.prototype,'outerHTML',{...descriptor,get(){window.__diagProbe.html++;return descriptor.get.call(this);}});
      const digest=SubtleCrypto.prototype.digest;
      SubtleCrypto.prototype.digest=function(...args){window.__diagProbe.digest++;return digest.apply(this,args);};
      const noNetwork=()=>{window.__diagProbe.network++;throw new Error('Unexpected network API');};
      window.fetch=noNetwork;window.WebSocket=noNetwork;XMLHttpRequest.prototype.open=noNetwork;navigator.sendBeacon=noNetwork;
      const noStorage=()=>{window.__diagProbe.storage++;throw new Error('Unexpected storage access');};
      for(const key of ['getItem','setItem','removeItem','clear'])Storage.prototype[key]=noStorage;
      indexedDB.open=noStorage;Object.defineProperty(document,'cookie',{get:noStorage,set:noStorage});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    for(const kind of Object.keys(CASES)) {
      await page.goto(`${server.origin}/prototypes/phase11-f3-structure/index.html`,{waitUntil:'load'});
      await page.getByRole('link',{name:CASES[kind],exact:true}).click();await page.waitForLoadState('load');
      await page.getByRole('button',{name:'このstageの構造を確認'}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.__diagProbe),{html:0,digest:0,storage:0,network:0});
      assert.equal(await page.locator('#result').innerText(),'');
      const postTapRequests=[];const listener=req=>postTapRequests.push(req.url());page.on('request',listener);
      await page.getByRole('button',{name:'このstageの構造を確認'}).click();await page.getByRole('heading',{name:'構造診断結果',exact:true}).waitFor();
      const result=JSON.parse(await page.locator('#result pre').textContent());
      assert.deepEqual(await page.evaluate(()=>window.__diagProbe),{html:1,digest:1,storage:0,network:0});
      assert.equal(result.coverage.status,'unconfirmed');assert.equal(result.kind,'structure-diagnostic');assert.equal('snapshot' in result,false);
      assert.equal(JSON.stringify(result).includes('<html'),false);
      assert.equal(await page.getByRole('button',{name:'このstageの構造を確認'}).isDisabled(),true);
      if(kind==='normal'){assert.equal(result.counts.enemies,2);assert.equal(result.counts.supers,4);assert.deepEqual(result.issues,[]);}
      if(kind==='blank')assert.ok(result.observations.some(o=>o.field==='super-specific-count'&&o.state==='blank'));
      if(['orphan','ambiguous','missing','duplicate'].includes(kind))assert.equal(result.coverage.unresolved,true);
      for(const width of [360,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
      assert.match(await page.locator('#status').innerText(),/raw HTMLは保存していません/);
      assert.deepEqual(postTapRequests,[]);page.off('request',listener);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await context.close();
  } finally {await browser.close();await server.close();}
});
