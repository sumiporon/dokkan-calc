/**
 * F2 fixture-only bridge.  Its only public intake is an HTML receipt; callers
 * cannot supply a preclassified object.  It never opens a source URL.
 */
import { classifyDokkanInfoF1, digest } from './phase11-dokkaninfo-f1.mjs';
import { validatePackage } from './phase11-intake.mjs';
import { validateDokkanInfoF1Partial } from './phase11-partial-material.mjs';
import { exactKeys, insist } from './phase11-partial-rules.mjs';

const fail = (code, message = code) => { const error = new Error(message); error.code = code; throw error; };
function receipt(input) {
  exactKeys(input, ['eventHtml','stageHtml','captureId','revision','capturedAt','expectedEventId','expectedStageId']);
  insist(typeof input.eventHtml === 'string' && typeof input.stageHtml === 'string' && /^\d+$/.test(input.expectedEventId) && /^\d+$/.test(input.expectedStageId), 'F2_HTML_RECEIPT');
  return structuredClone(input);
}
function packageOwner(pack) {
  const event = pack?.canonical?.events?.[0], stage = event?.stages?.[0];
  return { eventId: event?.id?.replace(/^jpnja:event:/, ''), stageId: stage?.id?.split(':').at(-1) };
}
function unusableInputs(result) {
  const capture = result.scan?.capture;
  const code = result.code ?? 'F1_UNUSABLE';
  return { capture, ownerMessage: `F1 scan ${code}：このstageでは安全に保存できません。`,
    sourceEvidence: capture && result.scan?.source ? { eventId: result.scan.source.eventId, stageId: result.scan.source.stageId,
      captureId: capture.id, snapshotDigest: capture.snapshotDigest, stopCode: code } : null,
    fullInput: { capture, package: { kind: 'f1-unusable-proof', code } },
    partialInput: { capture, material: { kind: 'f1-unusable-proof', code } } };
}

export async function captureF2FixtureHtml({ session, ticket, html }) {
  if (!session || !ticket) fail('F2_DEPENDENCY');
  const input = receipt(html);
  const current = await session.load();
  if (!current || current.eventId !== input.expectedEventId || ticket.unitId !== `stage:${input.expectedStageId}`) fail('F2_PLAN_OWNERSHIP');
  const result = await classifyDokkanInfoF1(input);
  if (result.classification === 'full') {
    const pack = await validatePackage(result.package), owner = packageOwner(pack);
    if (owner.eventId !== input.expectedEventId || owner.stageId !== input.expectedStageId) fail('F2_FULL_OWNERSHIP');
    const candidate = { classification: 'full', capture: result.scan.capture, package: pack, fingerprint: pack.digest };
    const committed = await session.commitCapture(ticket, candidate);
    return { classification: 'full', scan: result.scan, committed };
  }
  if (result.classification === 'partial') {
    const material = await validateDokkanInfoF1Partial(result.material);
    if (material.source.eventId !== input.expectedEventId || material.source.stageId !== input.expectedStageId || material.capture.snapshotDigest !== result.scan.capture.snapshotDigest) fail('F2_PARTIAL_OWNERSHIP');
    const candidate = { classification: 'partial', capture: material.capture, material, fingerprint: material.contentDigest };
    const committed = await session.commitCapture(ticket, candidate);
    return { classification: 'partial', scan: result.scan, committed };
  }
  const stopped = await session.recordUnusable(ticket, unusableInputs(result));
  return { classification: 'unusable', scan: result.scan, stopped };
}

/** Binds an immutable receipt to a test assertion without exposing a candidate API. */
export async function f2ReceiptDigest(html) { return digest(receipt(html)); }
