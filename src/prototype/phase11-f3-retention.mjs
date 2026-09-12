/** Seven-day, capture-scoped lifecycle index. Snapshot strings are never inputs here. */
import { digest, stable } from './phase11-partial-rules.mjs';
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const DAY=24*60*60*1000, clone=value=>structuredClone(value);
function containsSnapshot(value){if(typeof value==='string')return /<\/?(?:html|body|script)\b/i.test(value)||value.length>1000;if(!value||typeof value!=='object')return false;return Object.values(value).some(containsSnapshot);}
function valid(record){if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).sort().join(',')!=='captureId,createdAt,expiresAt,refs'||typeof record.captureId!=='string'||!Number.isFinite(Date.parse(record.createdAt))||!Number.isFinite(Date.parse(record.expiresAt))||Date.parse(record.expiresAt)-Date.parse(record.createdAt)!==7*DAY||!record.refs||typeof record.refs!=='object'||Array.isArray(record.refs)||stable(record.refs).length>4000||containsSnapshot(record.refs))fail('F3_RETENTION_FORMAT');}
export class MemoryF3RetentionStore {
  constructor(){this.records=new Map();this.failDelete=false;}
  async save(record){valid(record);const body=clone(record);body.digest=await digest(body);this.records.set(body.captureId,body);return clone(body);}
  async list(){return [...this.records.values()].map(clone);}
  async discard(captureId,remove){const record=this.records.get(captureId);if(!record)fail('F3_RETENTION_MISSING');if(this.failDelete||!(await remove(clone(record))))fail('F3_DELETE_FAILED');this.records.delete(captureId);return true;}
  async cleanup(now,remove){let removed=0;for(const record of await this.list())if(Date.parse(record.expiresAt)<=Date.parse(now)){await this.discard(record.captureId,remove);removed++;}return removed;}
}
export const expiryAfterSevenDays=createdAt=>new Date(Date.parse(createdAt)+7*DAY).toISOString();

/**
 * Coordinates capture-scoped deletion. The caller supplies the storage
 * operation so this remains usable with fixture memory stores and later
 * extension-local storage alike. A failed sub-delete leaves the index record
 * in place and throws; callers must never display a success message.
 */
export async function discardF3Capture({ retention, captureId, removeArtifacts }) {
  if (!retention || typeof removeArtifacts !== 'function') fail('F3_DELETE_DEPENDENCY');
  return retention.discard(captureId, async record => Boolean(await removeArtifacts(record)));
}
