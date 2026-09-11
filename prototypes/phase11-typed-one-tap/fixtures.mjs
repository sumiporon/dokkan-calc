/** Phase B's mixed event and three stages are entirely self-authored. */
import { inspectDokkanInfoDocument, buildDokkanInfoStagePackage, dokkanInfoStageFingerprint } from '../../src/prototype/phase11-one-tap-adapter.mjs';
import { inspectFictionalPartial } from '../../src/prototype/phase11-partial-adapter.mjs';
import { sourceFixture } from '../phase11-partial/fixtures.mjs';
import { dokkanInfoEventHtml, dokkanInfoStageHtml } from '../../tests/fixtures/phase11/dokkaninfo-source.mjs';

export const PHASE_B_EVENT_ID = '990011';
export const PHASE_B_EVENT_NAME = 'typed draft用・架空mixed event';
export const PHASE_B_STAGES = Object.freeze([
  { id: '99001102', key: 'full-1', label: '架空stage 1（完全データ）', normalAtk: 600000 },
  { id: '99001101', key: 'partial', label: '架空stage 2（部分材料）' },
  { id: '99001103', key: 'full-2', label: '架空stage 3（完全データ）', normalAtk: 700000 }
]);
const sourceEventUrl = `https://jpnja.dokkaninfo.com/events/challenge/${PHASE_B_EVENT_ID}`;
const sourceStages = PHASE_B_STAGES.map(stage => ({ id: stage.id, name: stage.label }));
const event = inspectDokkanInfoDocument({ html: dokkanInfoEventHtml({ eventId: PHASE_B_EVENT_ID, eventName: PHASE_B_EVENT_NAME, stages: sourceStages }), currentUrl: sourceEventUrl, sourceUrl: sourceEventUrl, capturedAt: '2026-09-01T00:00:00.000Z' });

export const phaseBPlan = base => PHASE_B_STAGES.map(stage => ({ id: `stage:${stage.id}`, kind: 'stage-page', stageId: stage.id, url: `${base}#${stage.key}`, label: stage.label }));

export async function fixtureCandidate(stageKey) {
  const fullStage = PHASE_B_STAGES.find(stage => stage.key === stageKey && stage.normalAtk != null);
  if (fullStage) {
    const stageUrl = `${sourceEventUrl}/${fullStage.id}`;
    const inspected = inspectDokkanInfoDocument({ html: dokkanInfoStageHtml({ eventId: PHASE_B_EVENT_ID, stageId: fullStage.id, stageName: fullStage.label, normalAtk: fullStage.normalAtk }), currentUrl: stageUrl, sourceUrl: stageUrl, capturedAt: '2026-09-01T00:00:00.000Z' });
    if (event.state !== 'ready' || inspected.state !== 'ready') throw new Error('Self-authored full fixture did not parse.');
    const pack = await buildDokkanInfoStagePackage(event.material, inspected.material);
    return { classification: 'full', capture: { id: `fictional-capture-full-${fullStage.id}`, revision: 1, observedAt: '2026-09-01T00:00:00.000Z' }, package: pack,
      fingerprint: await dokkanInfoStageFingerprint(inspected.material) };
  }
  if (stageKey === 'partial') {
    const inspected = await inspectFictionalPartial(sourceFixture('C'));
    if (inspected.kind !== 'partial') throw new Error('Self-authored partial fixture did not become partial.');
    return { classification: 'partial', capture: inspected.material.capture, material: inspected.material, fingerprint: inspected.material.contentDigest, capabilityCandidates: 0 };
  }
  throw new Error('Unknown Phase B fixture stage.');
}
