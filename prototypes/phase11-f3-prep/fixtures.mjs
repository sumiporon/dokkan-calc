/** F3-prep self-authored HTML only. The F3 contract markers are intentionally explicit. */
import { fixture as f1Fixture } from '../phase11-dokkaninfo-f1/fixtures.mjs';
import { F3_DOMAINS } from '../../src/prototype/phase11-f3-scan.mjs';

const labels = {
  'event-stage-identity':'event/stage', encounter:'encounter', 'enemy-identity':'enemy', 'type-class':'type/class', hp:'HP', atk:'ATK', def:'DEF', 'enemy-wide-attack-count':'enemy max',
  'super-header-name':'super name', 'super-atk':'super ATK', 'condition-hp-range':'HP range', probability:'probability', 'super-max-per-turn':'max per turn', reuse:'reuse',
  'super-effect':'effect', 'skill-passive':'skill', ai:'AI', aoe:'AOE'
};
const values = { 'event-stage-identity':'fixture identity', encounter:'1', 'enemy-identity':'Fixture Enemy', 'type-class':'super', hp:'100', atk:'200', def:'0', 'enemy-wide-attack-count':'2',
  'super-header-name':'Fixture Super', 'super-atk':'300', 'condition-hp-range':'0-100', probability:'50', 'super-max-per-turn':'1', reuse:'1',
  'super-effect':'fixture effect', 'skill-passive':'fixture passive', ai:'fixture AI', aoe:'not applicable' };
function markers({ eventId, stageId, mode }) {
  const state = domain => mode === 'partial' && domain === 'super-max-per-turn' ? 'unavailable' : mode === 'unknown' && domain === 'super-effect' ? 'unknown' : domain === 'aoe' ? 'not-applicable' : 'known';
  const value = domain => state(domain) === 'unavailable' || state(domain) === 'not-applicable' ? '' : state(domain) === 'unknown' ? 'uninterpreted fictional effect' : values[domain];
  const list = F3_DOMAINS.filter(domain => !(mode === 'coverage' && domain === 'ai')).map(domain => `<div data-f3-domain="${domain}" data-f3-state="${state(domain)}" data-f3-label="${labels[domain]}" data-f3-value="${value(domain)}" data-f3-encounter="0" data-f3-enemy="0" data-f3-attack="0" data-f3-condition="0">${labels[domain]}: ${value(domain)}</div>`).join('');
  return `<section data-f3-snapshot data-f3-event-id="${eventId}" data-f3-stage-id="${stageId}" data-f3-relationship="${mode === 'relationship' ? 'unresolved' : 'resolved'}" data-f3-coverage="${mode === 'coverage' ? 'incomplete' : 'complete'}">${list}</section>`;
}
export function f3Fixture(kind = 'full', { eventId='991001', stageId='99100101', stageName='F3 fixture stage', stages=[{ id:stageId, name:stageName }] } = {}) {
  const f1Case = kind === 'full' ? 'A' : kind === 'partial' ? 'B' : 'A';
  const page = f1Fixture(f1Case, { eventId, stageId, stageName, stages });
  const mode = kind === 'full' ? 'full' : kind === 'partial' ? 'partial' : kind === 'unknown' ? 'unknown' : kind === 'relationship' ? 'relationship' : 'coverage';
  return { ...page, stageHtml: page.stageHtml.replace('</body>', `${markers({ eventId, stageId, mode })}</body>`), url:`https://fixture.invalid/events/challenge/${eventId}/${stageId}` };
}
export const fullFixture = f3Fixture('full');
export const partialFixture = f3Fixture('partial', { eventId:'991002',stageId:'99100201',stageName:'F3 partial stage' });
export const unusableFixture = f3Fixture('relationship', { eventId:'991003',stageId:'99100301',stageName:'F3 unusable stage' });
