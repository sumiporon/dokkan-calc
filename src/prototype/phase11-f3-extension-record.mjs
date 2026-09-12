/** Validation shared by the F3 content/background/review extension bundles. */
import { TypedInspectionReceiver, validateTypedInspectionBatch } from './phase11-typed-inspection-receiver.mjs';
import { digest, exactKeys, insist, stable } from './phase11-partial-rules.mjs';

export const F3_EXTENSION_RECORD_VERSION='phase11-f3-extension-record-1';
export const F3_EXTENSION_PREFIX='phase11-f3:';
export const F3_RETENTION_MS=7*24*60*60*1000;
const forbiddenKey=/(?:^|[-_])(html|script|cookie|token|browserHistory|externalResource)(?:$|[-_])/i;
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};

function audit(value,depth=0){
  insist(depth<=40,'F3_RECORD_DEPTH');
  if(typeof value==='string'){insist(value.length<=16384&&!/<\/?(?:html|body|script)\b/i.test(value),'F3_RECORD_RAW_SOURCE');return;}
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){insist(!forbiddenKey.test(key),'F3_RECORD_FORBIDDEN_FIELD');audit(child,depth+1);}
}
function captureIdFromBatch(batch){
  const stage=batch?.stages?.[0];
  if(stage?.draft?.capture?.id)return stage.draft.capture.id;
  if(stage?.failure?.sourceEvidence?.captureId)return stage.failure.sourceEvidence.captureId;
  return null;
}
export function keysForCapture(captureId){
  insist(/^f1-f3-[A-Za-z0-9-]{1,160}$/.test(captureId),'F3_EXTENSION_CAPTURE');
  return Object.fromEntries(['capture','session','draft','material','failure','review'].map(kind=>[kind,`${F3_EXTENSION_PREFIX}${kind}:${captureId}`]));
}
export async function makeF3ExtensionRecords({captureId,createdAt,batch}){
  const verified=await validateTypedInspectionBatch(batch);
  insist(captureIdFromBatch(verified)===captureId&&verified.stages.length===1,'F3_EXTENSION_CAPTURE');
  const created=Date.parse(createdAt),expiresAt=new Date(created+F3_RETENTION_MS).toISOString();
  insist(Number.isFinite(created),'F3_EXTENSION_TIME');
  const keys=keysForCapture(captureId),stage=verified.stages[0];
  const envelope=(kind,payload)=>({version:F3_EXTENSION_RECORD_VERSION,kind,captureId,createdAt:new Date(created).toISOString(),expiresAt,payload});
  const records={
    [keys.session]:envelope('session',{eventId:verified.eventId,session:verified.session,planDigest:verified.planDigest}),
    [keys.review]:envelope('review',verified),
    [keys.capture]:null
  };
  if(stage.classification==='full'||stage.classification==='partial'){
    records[keys.draft]=envelope('draft',{classification:stage.classification,draftDigest:stage.draft.draftDigest,contentDigest:stage.draft.contentDigest});
    records[keys.material]=envelope('material',{classification:stage.classification,contentDigest:stage.draft.contentDigest});
  }else if(stage.classification==='unusable')records[keys.failure]=envelope('failure',{failureDigest:stage.failure.failureDigest,ownerMessage:stage.failure.ownerMessage});
  const presentKeys=[keys.capture,...Object.keys(records).filter(key=>key!==keys.capture&&records[key]!==null)];
  records[keys.capture]=envelope('capture',{recordKeys:presentKeys,classification:stage.classification,batchDigest:verified.batchDigest});
  audit(records);insist(stable(records).length<500000,'F3_EXTENSION_SIZE');
  const recordDigest=await digest(records);
  return {records,keys,presentKeys,recordDigest,expiresAt};
}
export async function validateF3ExtensionRecords({captureId,records}){
  const keys=keysForCapture(captureId),index=records?.[keys.capture];
  exactKeys(index,['version','kind','captureId','createdAt','expiresAt','payload']);
  insist(index.version===F3_EXTENSION_RECORD_VERSION&&index.kind==='capture'&&index.captureId===captureId,'F3_EXTENSION_INDEX');
  exactKeys(index.payload,['recordKeys','classification','batchDigest']);
  audit(records);const batch=records[keys.review]?.payload;await new TypedInspectionReceiver().receive(batch);const stage=batch.stages[0];
  insist(batch.stages.length===1&&captureIdFromBatch(batch)===captureId,'F3_EXTENSION_CAPTURE');
  const expectedKinds=stage.classification==='unusable'?['capture','session','failure','review']:['capture','session','draft','material','review'];
  const expected=expectedKinds.map(kind=>keys[kind]),actual=Object.values(keys).filter(key=>Object.hasOwn(records,key));
  insist(stable([...index.payload.recordKeys].sort())===stable([...expected].sort())&&stable(actual.sort())===stable([...expected].sort()),'F3_EXTENSION_INDEX');
  insist(index.payload.classification===stage.classification&&index.payload.batchDigest===batch.batchDigest,'F3_EXTENSION_INDEX');
  for(const kind of expectedKinds){const record=records[keys[kind]];insist(record?.version===F3_EXTENSION_RECORD_VERSION&&record.kind===kind&&record.captureId===captureId&&record.createdAt===index.createdAt&&record.expiresAt===index.expiresAt,'F3_EXTENSION_REFERENCE');}
  insist(Date.parse(index.expiresAt)-Date.parse(index.createdAt)===F3_RETENTION_MS,'F3_EXTENSION_TIME');
  const session=records[keys.session].payload;insist(session.eventId===batch.eventId&&session.planDigest===batch.planDigest&&stable(session.session)===stable(batch.session),'F3_EXTENSION_SESSION');
  if(stage.classification==='unusable'){
    const failure=records[keys.failure].payload;insist(failure.failureDigest===stage.failure.failureDigest&&failure.ownerMessage===stage.failure.ownerMessage,'F3_EXTENSION_FAILURE');
  }else{
    const draft=records[keys.draft].payload,material=records[keys.material].payload;
    insist(draft.classification===stage.classification&&draft.draftDigest===stage.draft.draftDigest&&draft.contentDigest===stage.draft.contentDigest,'F3_EXTENSION_DRAFT');
    insist(material.classification===stage.classification&&material.contentDigest===stage.draft.contentDigest,'F3_EXTENSION_MATERIAL');
  }
  return {index,batch,keys,recordDigest:await digest(records)};
}
export function ownerStopMessage(code){
  const messages={F3_RELATIONSHIP_UNRESOLVED:'攻撃条件との対応を安全に確認できませんでした。',F3_COVERAGE_INCOMPLETE:'必要な表示範囲を最後まで確認できませんでした。',F3_FULL_EVENT_MATERIAL_REQUIRED:'完全データとして確認するためのevent材料がありません。'};
  return messages[code]??'このstageの材料を安全に確認できませんでした。';
}
export { audit as auditF3ExtensionValue };
