/** Fixture-only F3-prep entry: reader -> immutable capture -> scan -> typed save. */
import { captureF3ImmutableSnapshot } from './phase11-f3-capture.mjs';
import { scanF3Snapshot, partialFromF3Scan } from './phase11-f3-scan.mjs';
import { classifyDokkanInfoF1 } from './phase11-dokkaninfo-f1.mjs';
import { validatePackage } from './phase11-intake.mjs';
import { validateDokkanInfoF1Partial } from './phase11-partial-material.mjs';
import { validateF3FullPersistability } from './phase11-f3-persistability.mjs';

const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }); };
const owner = code => `このstageの材料を安全に確認できませんでした。（補助code: ${code}）`;
function unusableInput(scan, code) {
  const capture = scan?.capture;
  return { capture, ownerMessage: owner(code), sourceEvidence: capture ? { eventId: scan.source.eventId, stageId: scan.source.stageId, captureId: capture.id, snapshotDigest: capture.snapshotDigest, stopCode: code } : null,
    fullInput: { capture, package: { kind: 'f3-unusable-proof', code } }, partialInput: { capture, material: { kind: 'f3-unusable-proof', code } } };
}
function fullOwner(pack) { const stage = pack?.canonical?.events?.[0]?.stages?.[0]; return { eventId: stage?.id?.split(':')[2], stageId: stage?.id?.split(':').at(-1) }; }

export async function classifyF3CapturedSnapshot({ captured, eventHtml = null, expectedEventId, expectedStageId }) {
  const scan = await scanF3Snapshot({ snapshot: captured.snapshot, capture: captured.capture, expectedEventId, expectedStageId });
  if (!scan.coverage.complete) return { classification: 'unusable', scan, code: scan.failures[0] ?? 'F3_COVERAGE_INCOMPLETE' };
  const f1 = typeof eventHtml === 'string' ? await classifyDokkanInfoF1({ eventHtml, stageHtml: captured.snapshot, captureId: captured.capture.id, revision: captured.capture.revision, capturedAt: captured.capture.observedAt, expectedEventId, expectedStageId }) : null;
  const f3CompleteFacts = scan.observations.every(field => field.state === 'known' || field.state === 'not-applicable');
  if (f1?.classification === 'full' && f3CompleteFacts) {
    try { const pack = validateF3FullPersistability(await validatePackage(f1.package)); return { classification: 'full', scan, package: pack }; }
    catch (error) { return { classification: 'unusable', scan, code: error.code ?? 'F3_FULL_PERSISTABILITY' }; }
  }
  if (!f1 && f3CompleteFacts) return { classification: 'unusable', scan, code: 'F3_FULL_EVENT_MATERIAL_REQUIRED' };
  try { const material = await validateDokkanInfoF1Partial(await partialFromF3Scan(scan)); return { classification: 'partial', scan, material }; }
  catch (error) { return { classification: 'unusable', scan, code: error.code ?? 'F3_PARTIAL_REJECTED' }; }
}

export async function classifyF3Fixture({ eventHtml, expectedEventId, expectedStageId, captureInput }) {
  const captured = await captureF3ImmutableSnapshot({ ...captureInput, expectedEventId, expectedStageId });
  return classifyF3CapturedSnapshot({ captured, eventHtml, expectedEventId, expectedStageId });
}

/** The only fixture flow that can enter the typed session; preclassified inputs are impossible here. */
export async function captureF3FixtureHtml({ session, ticket, eventHtml, expectedEventId, expectedStageId, captureInput }) {
  const current = await session.load();
  if (!current || ticket?.unitId !== `stage:${expectedStageId}` || current.eventId !== expectedEventId) fail('F3_PLAN_OWNERSHIP');
  const result = await classifyF3Fixture({ eventHtml, expectedEventId, expectedStageId, captureInput });
  if (result.classification === 'full') return { ...result, committed: await session.commitCapture(ticket, { classification:'full', capture:result.scan.capture, package:result.package, fingerprint:result.package.digest }) };
  if (result.classification === 'partial') return { ...result, committed: await session.commitCapture(ticket, { classification:'partial', capture:result.material.capture, material:result.material, fingerprint:result.material.contentDigest }) };
  return { ...result, stopped: await session.recordUnusable(ticket, unusableInput(result.scan, result.code)) };
}
