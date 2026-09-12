/* F3-only local storage controller. There is no timer and no source request. */
import { F3_EXTENSION_PREFIX, keysForCapture, makeF3ExtensionRecords, validateF3ExtensionRecords } from '../../src/prototype/phase11-f3-extension-record.mjs';
const api=globalThis.browser??globalThis.chrome;
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const all=()=>api.storage.local.get(null);
async function removeCapture(captureId){
  const values=await all(),keys=Object.values(keysForCapture(captureId)).filter(key=>Object.hasOwn(values,key));
  if(!keys.length)return true;
  await api.storage.local.remove(keys);
  const after=await api.storage.local.get(keys);if(Object.keys(after).length)fail('F3_DELETE_VERIFY');
  return true;
}
async function cleanupExpired(now=Date.now()){
  const values=await all(),ids=[];
  for(const [key,value] of Object.entries(values))if(key.startsWith(`${F3_EXTENSION_PREFIX}capture:`)&&Date.parse(value?.expiresAt)<=now)ids.push(value.captureId);
  for(const id of ids)await removeCapture(id);
  return ids.length;
}
async function save(message){
  const sealed=await makeF3ExtensionRecords(message);await api.storage.local.set(sealed.records);
  const readBack=await api.storage.local.get(sealed.presentKeys);const verified=await validateF3ExtensionRecords({captureId:message.captureId,records:readBack});
  if(verified.recordDigest!==sealed.recordDigest)fail('F3_STORAGE_READ_BACK');
  return {ok:true,captureId:message.captureId,classification:verified.batch.stages[0].classification,expiresAt:sealed.expiresAt};
}
async function read(captureId){const values=await all();const verified=await validateF3ExtensionRecords({captureId,records:values});return{ok:true,batch:verified.batch};}
api.runtime.onMessage.addListener(message=>(async()=>{
  try{
    if(message?.kind==='f3-init')return{ok:true,removed:await cleanupExpired()};
    if(message?.kind==='f3-save')return save(message);
    if(message?.kind==='f3-read')return read(message.captureId);
    if(message?.kind==='f3-open-review'){await api.tabs.create({url:api.runtime.getURL(`review.html#capture=${encodeURIComponent(message.captureId)}`)});return{ok:true};}
    if(message?.kind==='f3-discard'){await removeCapture(message.captureId);return{ok:true};}
    return{ok:false,code:'F3_MESSAGE_KIND'};
  }catch(error){return{ok:false,code:error?.code??'F3_STORAGE_ERROR'};}
})());
cleanupExpired().catch(()=>{});
