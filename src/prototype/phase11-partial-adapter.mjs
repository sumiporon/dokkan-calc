/** No acquisition: only self-authored, explicitly marked HTML passed by the caller. */
import { load } from 'cheerio/lib/slim';
import { parseDokkanInfoSavedPage } from './phase11-dokkaninfo-adapter.mjs';
import { packagePages, validatePackage } from './phase11-intake.mjs';
import { SOURCE, SLOTS, TARGETS, insist } from './phase11-partial-rules.mjs';
import { evidenceFor, materialFromObservations } from './phase11-partial-material.mjs';

export async function inspectFictionalPartial({ html, eventHtml, capture }) {
  insist(typeof html === 'string' && html.length < 100000 && typeof eventHtml === 'string' && eventHtml.length < 10000, 'INPUT_SIZE');
  const $ = load(html);
  insist($('html[data-offline-partial="1"]').length === 1 && $('script, iframe, input, template').length === 0, 'FIXTURE_ONLY');
  const parse = text => parseDokkanInfoSavedPage({ format: 'html', html: text, resources: new Map() }, { capturedAt: capture.observedAt });
  const event = parse(eventHtml), stage = parse(html);
  insist(event.eventId === SOURCE.eventId && stage.eventId === SOURCE.eventId && stage.stageId === SOURCE.stageId
    && event.stageLinks.some(link => link.stageId === stage.stageId && link.href === stage.sourceUrl), 'SOURCE_MEMBERSHIP');
  // Extract before the complete gate; partial evidence is not a runtime projection.
  insist($('[data-proof]').length === SLOTS.length, 'COVERAGE');
  const observations = SLOTS.map(slot => {
    const nodes = $('[data-proof]').filter((_, el) => $(el).attr('data-proof') === slot.key);
    insist(nodes.length === 1 && nodes.children().length === 0, 'OBSERVATION_BINDING');
    return evidenceFor(slot, nodes.text().trim(), capture);
  });
  const uninterpreted = $('[data-uninterpreted]').map((i, el) => {
    const target = TARGETS.find(t => t.attackId === $(el).attr('data-uninterpreted'));
    insist(target && $(el).children().length === 0, 'EFFECT_BINDING');
    return { id: `fixture:${capture.id}:uninterpreted:${i}`, captureId: capture.id, revision: capture.revision, ...target, rawText: $(el).text().trim() };
  }).get();
  try {
    const pack = await packagePages([event, stage]);
    await validatePackage(pack);
    return { kind: 'full', fullCheck: { status: 'passed' }, package: pack };
  } catch (error) {
    // Never turn an identity/schema/digest/other safety failure into partial success.
    if (error.code !== 'INCOMPLETE_STAGE') throw error;
    const fullCheck = { status: 'failed', code: error.code };
    const material = await materialFromObservations(observations, uninterpreted, capture, fullCheck);
    return { kind: 'partial', fullCheck: { ...fullCheck, reason: error.message }, material };
  }
}
