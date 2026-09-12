import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as api from '../../generated/phase11/typed-one-tap/api.mjs';
import { fullFixture, partialFixture, unusableFixture } from '../../prototypes/phase11-f3-prep/fixtures.mjs';

async function batchFor(fixture){
  const draftStore=new api.MemoryTypedDraftStore(),backend=new api.MemoryTypedSessionBackend(),session=new api.TypedOneTapSessionCoordinator({draftStore,backend}),writerId='f3-extension-unit-writer';
  await session.start({eventId:fixture.expectedEventId,eventName:'fixture',writerId,plan:[{id:`stage:${fixture.expectedStageId}`,kind:'stage-page',stageId:fixture.expectedStageId,url:fixture.url,label:'fixture'}]});
  const ticket=await session.beginCapture({writerId,currentUrl:fixture.url}),captureId=`f1-f3-${fixture.expectedStageId}-extension`;
  await api.captureF3FixtureHtml({session,ticket,eventHtml:fixture.eventHtml,expectedEventId:fixture.expectedEventId,expectedStageId:fixture.expectedStageId,captureInput:{readUrl:()=>fixture.url,readOuterHTML:()=>fixture.stageHtml,captureId,now:()=> '2026-09-12T00:00:00.000Z'}});
  return {captureId,batch:await api.createTypedInspectionBatch({session})};
}
test('extension records preserve full, partial, and unusable as distinct typed review inputs',async()=>{
  for(const [fixture,classification] of [[fullFixture,'full'],[partialFixture,'partial'],[unusableFixture,'unusable']]){
    const input=await batchFor(fixture),sealed=await api.makeF3ExtensionRecords({...input,createdAt:'2026-09-12T00:00:00.000Z'}),verified=await api.validateF3ExtensionRecords({captureId:input.captureId,records:sealed.records});
    assert.equal(verified.batch.stages[0].classification,classification);assert.equal(Date.parse(sealed.expiresAt)-Date.parse('2026-09-12T00:00:00.000Z'),7*24*60*60*1000);
    const text=JSON.stringify(sealed.records);assert.equal(/<html|<script/i.test(text),false);assert.equal(text.includes('outerHTML'),false);
  }
});
test('extension record validation rejects review tamper and raw source fields',async()=>{
  const input=await batchFor(partialFixture),sealed=await api.makeF3ExtensionRecords({...input,createdAt:'2026-09-12T00:00:00.000Z'}),tampered=structuredClone(sealed.records);
  tampered[sealed.keys.review].payload.batchDigest='sha256:'+'0'.repeat(64);await assert.rejects(api.validateF3ExtensionRecords({captureId:input.captureId,records:tampered}),error=>error?.code==='INSPECTION_BATCH_DIGEST');
  const hidden=structuredClone(sealed.records);delete hidden[sealed.keys.material];hidden[sealed.keys.capture].payload.recordKeys=hidden[sealed.keys.capture].payload.recordKeys.filter(key=>key!==sealed.keys.material);await assert.rejects(api.validateF3ExtensionRecords({captureId:input.captureId,records:hidden}),error=>error?.code==='F3_EXTENSION_INDEX');
  assert.throws(()=>api.auditF3ExtensionValue({rawHtml:'<html>bad</html>'}),error=>['F3_RECORD_FORBIDDEN_FIELD','F3_RECORD_RAW_SOURCE'].includes(error?.code));
});
test('preflight manifest is one-stage scoped and extension source has no source-network/navigation API',async()=>{
  const root=new URL('../../prototypes/phase11-f3-prep-extension/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.f3-preflight.json',root),'utf8'));
  assert.deepEqual(manifest.permissions,['storage']);assert.deepEqual(manifest.host_permissions,['https://jpnja.dokkaninfo.com/events/challenge/1705/17050015']);assert.deepEqual(manifest.content_scripts[0].matches,manifest.host_permissions);
  assert.deepEqual(manifest.background,{scripts:['background.js']});assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required,['none']);
  const source=(await Promise.all(['f3-content.mjs','f3-background.mjs','f3-review.mjs'].map(name=>readFile(new URL(name,root),'utf8')))).join('\n');
  for(const forbidden of ['fetch(', 'XMLHttpRequest', 'location.assign', 'location.replace', '.reload(', 'window.open(', 'webRequest', 'downloads.', 'cookies.'])assert.equal(source.includes(forbidden),false,forbidden);
  assert.equal(source.includes('phase11-one-tap-receiver'),false);assert.equal(source.match(/document\.documentElement\.outerHTML/g)?.length,1);
});
