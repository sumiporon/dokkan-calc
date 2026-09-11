/** Phase C's stopped mixed event and four stages are entirely self-authored. */
import { inspectDokkanInfoDocument, buildDokkanInfoStagePackage, dokkanInfoStageFingerprint } from '../../src/prototype/phase11-one-tap-adapter.mjs';
import { inspectFictionalPartial } from '../../src/prototype/phase11-partial-adapter.mjs';
import { sourceFixture } from '../phase11-partial/fixtures.mjs';
import { dokkanInfoEventHtml, dokkanInfoStageHtml } from '../../tests/fixtures/phase11/dokkaninfo-source.mjs';

export const PHASE_C_EVENT_ID = '990011';
export const PHASE_C_EVENT_NAME = 'typed draft用・架空停止event';
export const PHASE_C_STAGES = Object.freeze([
  { id: '99001102', key: 'full-1', label: '架空stage 1（完全データ）', normalAtk: 600000 },
  { id: '99001101', key: 'partial', label: '架空stage 2（部分材料）' },
  { id: '99001103', key: 'unusable', label: '架空stage 3（利用不可）' },
  { id: '99001104', key: 'unvisited', label: '架空stage 4（未取得）' }
]);
const sourceEventUrl = `https://jpnja.dokkaninfo.com/events/challenge/${PHASE_C_EVENT_ID}`;
const sourceStages = PHASE_C_STAGES.map(stage => ({ id: stage.id, name: stage.label }));
const event = inspectDokkanInfoDocument({ html: dokkanInfoEventHtml({ eventId: PHASE_C_EVENT_ID, eventName: PHASE_C_EVENT_NAME, stages: sourceStages }), currentUrl: sourceEventUrl, sourceUrl: sourceEventUrl, capturedAt: '2026-09-01T00:00:00.000Z' });

const phaseDProgressStages = [
  { id: '99001102', key: 'd-full-1', label: '架空stage 1（完全データ）', normalAtk: 600000 },
  { id: '99001101', key: 'd-partial', label: '架空stage 2（部分材料）' },
  { id: '99001103', key: 'd-full-2', label: '架空stage 3（完全データ）', normalAtk: 700000 }
];
const phaseDEvent = inspectDokkanInfoDocument({ html: dokkanInfoEventHtml({ eventId: PHASE_C_EVENT_ID, eventName: 'typed draft用・架空再開event', stages: phaseDProgressStages.map(stage => ({ id: stage.id, name: stage.label })) }), currentUrl: sourceEventUrl, sourceUrl: sourceEventUrl, capturedAt: '2026-09-01T00:00:00.000Z' });

export const phaseCPlan = base => PHASE_C_STAGES.map(stage => ({ id: `stage:${stage.id}`, kind: 'stage-page', stageId: stage.id, url: `${base}#${stage.key}`, label: stage.label }));
export const phaseDPlan = (base, caseId) => (caseId === 'progress' ? phaseDProgressStages : PHASE_C_STAGES)
  .map(stage => ({ id: `stage:${stage.id}`, kind: 'stage-page', stageId: stage.id, url: `${base}#d-${caseId}-${stage.key.replace(/^d-/, '')}`, label: stage.label }));

async function fullCandidate(stage, eventMaterial = event.material) {
  const stageUrl = `${sourceEventUrl}/${stage.id}`;
  const inspected = inspectDokkanInfoDocument({ html: dokkanInfoStageHtml({ eventId: PHASE_C_EVENT_ID, stageId: stage.id, stageName: stage.label, normalAtk: stage.normalAtk }), currentUrl: stageUrl, sourceUrl: stageUrl, capturedAt: '2026-09-01T00:00:00.000Z' });
  if (!eventMaterial || inspected.state !== 'ready') throw new Error('Self-authored full fixture did not parse.');
  const pack = await buildDokkanInfoStagePackage(eventMaterial, inspected.material);
  return { classification: 'full', capture: { id: `fictional-capture-full-${stage.id}`, revision: 1, observedAt: '2026-09-01T00:00:00.000Z' }, package: pack,
    fingerprint: await dokkanInfoStageFingerprint(inspected.material) };
}

export async function fixtureCandidate(stageKey) {
  const fullStage = PHASE_C_STAGES.find(stage => stage.key === stageKey && stage.normalAtk != null);
  if (fullStage) {
    return fullCandidate(fullStage, event.state === 'ready' ? event.material : null);
  }
  if (stageKey === 'partial') {
    const inspected = await inspectFictionalPartial(sourceFixture('C'));
    if (inspected.kind !== 'partial') throw new Error('Self-authored partial fixture did not become partial.');
    return { classification: 'partial', capture: inspected.material.capture, material: inspected.material, fingerprint: inspected.material.contentDigest, capabilityCandidates: 0 };
  }
  if (stageKey === 'unusable') {
    const inspected = await inspectFictionalPartial(sourceFixture('C'));
    if (inspected.kind !== 'partial') throw new Error('Self-authored unusable fixture did not parse its controlled material.');
    return { classification: 'unusable', ownerMessage: '完全データにも部分材料にも安全に分類できません。',
      fullInput: { capture: inspected.material.capture, package: inspected.material },
      partialInput: { capture: inspected.material.capture, material: { ...inspected.material, contentDigest: 'sha256:' + '0'.repeat(64) } } };
  }
  throw new Error('Unknown Phase C fixture stage.');
}

export async function phaseDCandidate(caseId, stageIndex) {
  if (caseId === 'progress') {
    const stage = phaseDProgressStages[stageIndex];
    if (!stage) throw new Error('Unknown Phase D progress stage.');
    if (stageIndex === 1) return fixtureCandidate('partial');
    return fullCandidate(stage, phaseDEvent.state === 'ready' ? phaseDEvent.material : null);
  }
  if (caseId === 'stopped') {
    const stage = PHASE_C_STAGES[stageIndex];
    if (!stage) throw new Error('Unknown Phase D stopped stage.');
    return fixtureCandidate(stage.key);
  }
  throw new Error('Unknown Phase D case.');
}
