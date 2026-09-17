import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createStructureDiagnosticV2, diagnoseStructureV2, LIMITS, RULE } from '../../src/prototype/phase11-f3-structure-v2.mjs';
import { diagnoseStructureSnapshot } from '../../src/prototype/phase11-f3-structure-diagnostic.mjs';
import { CASES, fixture, fixtureHTML, header, band, row, skillRow } from '../../prototypes/phase11-f3-structure-v2-extension/fixtures.mjs';
const inspect = html => diagnoseStructureV2({ snapshot: html, expectedEventId: '993300', expectedStageId: '99330001' });
const run = kind => { const f = fixture(kind); return diagnoseStructureV2({ snapshot: f.html, expectedEventId: f.eventId, expectedStageId: f.stageId }); };
const fields = (r, field) => r.observations.filter(o => o.field === field);
const codes = r => r.issues.map(i => i.code);
const read = f => readFile(new URL('../../' + f, import.meta.url), 'utf8');
const dir = 'prototypes/phase11-f3-structure-v2-extension/';
const out = 'generated/phase11-f3-structure-extension/v2/';
function checkContract(r) {
  assert.equal(r.kind, 'structure-diagnostic'); assert.equal(r.formatVersion, 2); assert.equal(r.ruleVersion, RULE);
  assert.equal(r.snapshotDigestEncoding, 'utf8-outerHTML'); assert.equal(r.coverage.status, 'unconfirmed');
  assert.ok(Buffer.byteLength(JSON.stringify(r)) <= LIMITS.output);
  assert.ok(r.nodes.length <= LIMITS.nodes && r.observations.length <= LIMITS.observations && r.issues.length <= LIMITS.issues);
  assert.equal('classification' in r, false); assert.equal('snapshot' in r, false);
  const ids = new Set(r.nodes.map(n => n.id)); assert.equal(ids.size, r.nodes.length);
  for (const n of r.nodes) {
    assert.ok(n.path.length <= LIMITS.path); assert.ok(n.text.length <= LIMITS.text && n.ownText.length <= LIMITS.text);
    assert.ok(n.classes.length <= LIMITS.classes && n.classes.split(' ').filter(Boolean).length <= LIMITS.classTokens);
    assert.ok(n.childRefs.length <= LIMITS.children); assert.ok(!n.parentNodeId || ids.has(n.parentNodeId));
    for (const id of n.childRefs) assert.ok(ids.has(id));
  }
  for (const o of r.observations) {
    assert.ok(['detected', 'blank', 'non-empty-unparsed', 'missing', 'ambiguous', 'not-observed'].includes(o.state));
    for (const id of o.candidateNodeRefs) assert.ok(ids.has(id));
    if (o.metadata.labelValueParts) for (const part of o.metadata.labelValueParts) assert.ok(ids.has(part.nodeRef));
  }
  for (const s of r.coverage.scopes) { assert.ok(ids.has(s.rootRef)); for (const id of s.nodeRefs) assert.ok(ids.has(id)); }
}
for (const kind of Object.keys(CASES)) test(`v2 fixture ${kind}: bounded diagnostic contract, no canonical/partial/calculation`, async () => checkContract(await run(kind)));

test('v2 exact manifest, same ID/version bump only; source and generated dependency graph safety', async () => {
  const m = JSON.parse(await read(dir + 'manifest.json')), old = JSON.parse(await read('prototypes/phase11-f3-structure-extension/manifest.json'));
  assert.equal(m.version, '0.0.2'); assert.equal(old.version, '0.0.1');
  assert.equal(m.browser_specific_settings.gecko.id, old.browser_specific_settings.gecko.id);
  assert.deepEqual(m.permissions, []); assert.deepEqual(m.host_permissions, ['https://jpnja.dokkaninfo.com/events/challenge/1705/17050015']);
  assert.deepEqual(m.content_scripts, old.content_scripts); assert.equal(JSON.stringify(m).includes('*'), false);
  for (const key of ['background', 'action', 'optional_permissions', 'web_accessible_resources']) assert.equal(key in m, false);
  assert.deepEqual(JSON.parse(await read(out + 'candidate/manifest.json')), m);
  const own = [dir + 'content.mjs', dir + 'ui.mjs', 'src/prototype/phase11-f3-structure-v2.mjs', 'src/prototype/phase11-f3-structure-diagnostic.mjs'];
  const inputs = JSON.parse(await read(out + 'candidate-inputs.json'));
  assert.ok(inputs.every(p => p.startsWith('node_modules/') || own.includes(p)));
  const forbidden = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|indexedDB|localStorage|sessionStorage|sendBeacon|postMessage)\s*[.(]|\b(?:chrome|browser)\.\s*(?:storage|tabs|runtime|downloads|cookies)|\.sendMessage\s*\(/;
  const navigation = /(?:location|window)\.(?:replace|assign|reload|open)\s*\(|location\.(?:href|pathname)\s*=\s*[^=]|document\.cookie|navigator\.clipboard|\b(?:preload|prerender)\b/;
  for (const f of own) { const s = await read(f); assert.doesNotMatch(s, forbidden, f); assert.doesNotMatch(s, navigation, f); }
  const bundle = await read(out + 'candidate/content.js');
  assert.doesNotMatch(bundle, /(?:window|globalThis)\.fetch\s*\(|new\s+(?:XMLHttpRequest|WebSocket|EventSource)\b|navigator\.sendBeacon\s*\(|(?:chrome|browser)\.(?:storage|runtime|tabs)/);
  assert.doesNotMatch(bundle, navigation); assert.doesNotMatch(bundle, /structureProbe|fixture.invalid|993300|PRIVATE_CANARY/);
  assert.equal((bundle.match(/document\.documentElement\.outerHTML/g) ?? []).length, 1);
  const ui = await read(dir + 'ui.mjs'), entry = await read(dir + 'content.mjs');
  assert.match(entry, /window\.top === window/); assert.match(ui, /event\.isTrusted/); assert.match(ui, /copyEvent\.isTrusted/); assert.match(ui, /execCommand\('copy'\)/);
});

test('one-shot: no reads before invocation; URL/html/URL; drift and repeat rejected', async () => {
  const f = fixture('normal'), url = `http://127.0.0.1/events/challenge/${f.eventId}/${f.stageId}`, log = [];
  const opts = { expectedUrl: url, expectedEventId: f.eventId, expectedStageId: f.stageId, readUrl: () => { log.push('URL'); return url; }, readOuterHTML: () => { log.push('HTML'); return f.html; } };
  const c = createStructureDiagnosticV2(opts); assert.deepEqual(log, []); await c.run(); assert.deepEqual(log, ['URL', 'HTML', 'URL']);
  await assert.rejects(c.run(), { code: 'DIAGNOSTIC_ALREADY_RUN' });
  await assert.rejects(createStructureDiagnosticV2({ ...opts, readUrl: () => url + '?wrong' }).run(), { code: 'DIAGNOSTIC_URL' });
  let count = 0; await assert.rejects(createStructureDiagnosticV2({ ...opts, readUrl: () => count++ ? url + '?drift' : url }).run(), { code: 'DIAGNOSTIC_URL_CHANGED' });
});

test('root diagnostics preserve v1 ambiguous test; children remain unresolved but observable', async () => {
  for (const [kind, byClass, icons] of [['oneBand', true, 1], ['noClass', false, 1], ['noIcon', true, 0], ['manyIcons', true, 2], ['bothMismatch', false, 2]]) {
    const f = fixture(kind), r = await run(kind), h = fields(r, 'super-root')[0];
    const v1 = await diagnoseStructureSnapshot({ snapshot: f.html, expectedEventId: f.eventId, expectedStageId: f.stageId });
    assert.equal(h.state, fields(v1, 'super-root')[0].state);
    assert.equal(h.metadata.byClass, byClass); assert.equal(h.metadata.iconCount, icons);
    assert.equal(h.metadata.iconRefs.length, icons);
    for (const i of h.metadata.iconRefs) { assert.equal(i.basename, 'sp_skill_icon_etc.png'); assert.ok(r.nodes.find(n => n.id === i.nodeRef).path); }
    assert.equal(r.counts.conditionCandidates, 1);
    if (!byClass || icons !== 1) {
      assert.equal(h.state, 'ambiguous'); assert.ok(fields(r, 'hp-condition').some(o => o.state === 'ambiguous' && o.metadata.valueText));
      for (const o of r.observations.filter(o => ['super-name', 'super-atk', 'probability', 'super-specific-count', 'reuse'].includes(o.field))) assert.ok(['ambiguous', 'not-observed', 'missing'].includes(o.state));
    }
  }
});

test('separate and same-text label/value offsets, DOM order and HP intervals are structural only', async () => {
  for (const kind of ['normal', 'sameText']) {
    const r = await run(kind), damage = fields(r, 'super-atk')[0];
    const ps = damage.metadata.labelValueParts;
    assert.ok(ps.some(p => p.labelRange)); assert.ok(ps.some(p => p.valueRange));
    assert.equal(ps.some(p => p.labelRange && p.valueRange), kind === 'sameText');
    for (const p of ps) {
      const text = r.nodes.find(n => n.id === p.nodeRef).ownText;
      if (p.labelRange) assert.ok('ダメージ:'.includes(text.slice(...p.labelRange)));
      if (p.valueRange) assert.equal(text.slice(...p.valueRange).trim(), '420');
    }
    assert.equal(damage.metadata.relationshipStatus, 'structural-only');
  }
  const r = await run('normal'), bands = fields(r, 'hp-condition'), probs = fields(r, 'probability');
  assert.equal(bands.length, 2); assert.equal(probs.length, 2);
  assert.notEqual(probs[0].metadata.conditionCandidateRef, probs[1].metadata.conditionCandidateRef);
  assert.equal(probs[0].metadata.boundaryEnd, bands[1].candidateNodeRefs[0]);
  assert.ok(probs[0].metadata.domOrder < probs[1].metadata.domOrder);
  const ambiguous = await run('ambiguousBand'); assert.ok(fields(ambiguous, 'hp-condition').some(o => o.state === 'ambiguous' && o.metadata.relationshipStatus === 'unresolved'));
});

test('blank, zero, missing, unobserved and duplicate remain distinct without fallback count', async () => {
  const r = await run('blank'), counts = fields(r, 'super-specific-count');
  assert.equal(counts[0].state, 'blank'); assert.equal(counts[0].metadata.valueText, '');
  assert.equal(counts[1].state, 'non-empty-unparsed'); assert.equal(counts[1].metadata.valueText, '0');
  assert.equal(fields(r, 'def')[0].state, 'non-empty-unparsed');
  assert.ok(!counts.some(o => o.metadata.valueText === '8'));
  assert.equal(fields(await run('missingReuse'), 'reuse')[0].state, 'missing');
  assert.equal(fields(await run('deep'), 'hp-condition')[0].state, 'not-observed');
  assert.ok(fields(await run('duplicate'), 'super-specific-count').every(o => o.state === 'ambiguous'));
});

test('skill rows have bounded description/value/ID positions; AI/AOE only declared siblings/depth', async () => {
  const r = await run('skills'), skills = fields(r, 'skill-row'); assert.equal(skills.length, 3);
  assert.ok(skills[0].metadata.descriptionRefs.length); assert.ok(skills[0].metadata.valueRefs.length); assert.ok(skills[0].metadata.displayedIds.length);
  assert.equal(skills[2].state, 'not-observed'); assert.equal(skills[2].metadata.truncated, true); assert.ok(codes(r).includes('LIMIT_TEXT'));
  const near = await run('nearby'); for (const field of ['ai-region', 'aoe-region']) assert.equal(fields(near, field)[0].state, 'non-empty-unparsed');
  const absent = await run('missing'); for (const field of ['ai-region', 'aoe-region']) { assert.equal(fields(absent, field)[0].state, 'missing'); assert.equal(fields(absent, field)[0].metadata.absenceMeaning, 'not-found-in-declared-scopes-only'); }
  const outside = await inspect(fixtureHTML({ adjacent: '<aside>one</aside><aside>two</aside><aside>AI: PRIVATE_OUTSIDE / AOE: PRIVATE_OUTSIDE</aside>' }));
  assert.doesNotMatch(JSON.stringify(outside), /PRIVATE_OUTSIDE/);
  const deep = await inspect(fixtureHTML({ adjacent: '<aside><div><div><span>AI: PRIVATE_DEEP</span></div></div></aside>' }));
  assert.doesNotMatch(JSON.stringify(deep), /PRIVATE_DEEP/);
});

test('same immutable raw UTF8 digest; scripts/hidden/forms/outside text never retained', async () => {
  let html = fixtureHTML().replace('</body>', '<script>PRIVATE_CANARY</script><div hidden>PRIVATE_CANARY</div><form>PRIVATE_CANARY<input value="PRIVATE_CANARY"></form><footer>PRIVATE_CANARY</footer></body>');
  const r = await inspect(html); assert.equal(r.snapshotDigest, 'sha256:' + createHash('sha256').update(html, 'utf8').digest('hex'));
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE_CANARY|<html|<script/);
  assert.deepEqual(await inspect(html), r);
  assert.equal((await run('ownership')).source.identityState, 'unconfirmed');
});

test('snapshot/element/path limits stop without partial graph or success counts', async () => {
  for (const [html, expected] of [['x'.repeat(LIMITS.snapshot + 1), 'LIMIT_SNAPSHOT'], [fixtureHTML().replace('</body>', '<i></i>'.repeat(30001) + '</body>'), 'LIMIT_ELEMENTS'], [fixtureHTML().replace('<main>', '<main>' + '<section>'.repeat(70)).replace('</main>', '</section>'.repeat(70) + '</main>'), 'LIMIT_PATH']]) {
    const r = await inspect(html); checkContract(r); assert.deepEqual(codes(r), [expected]); assert.equal(r.observations[0].state, 'not-observed'); assert.equal(r.counts.enemies, null);
  }
});

test('local child/depth/skill/icon/class/text limits mark omissions and unresolved', async () => {
  const cases = [
    [fixtureHTML({ supers: header() + '<div>x</div>'.repeat(65) }), 'LIMIT_CHILDREN'],
    [fixture('deep'), 'LIMIT_DEPTH'],
    [fixtureHTML({ skills: skillRow('fixture').repeat(33) }), 'LIMIT_SKILL_ROWS'],
    [fixtureHTML({ supers: header(true, 9) + band() }), 'LIMIT_ICONS'],
    [fixtureHTML({ supers: header().replace('super-header', 'super-header a b c d e f g h i') + band() }), 'LIMIT_CLASSES'],
    [fixtureHTML({ skills: skillRow('x'.repeat(161)) }), 'LIMIT_TEXT'],
    [fixtureHTML({ supers: header().repeat(41) }), 'LIMIT_CANDIDATES']
  ];
  for (const [input, code] of cases) {
    const r = typeof input === 'string' ? await inspect(input) : await run('deep'); checkContract(r);
    assert.ok(codes(r).includes(code), code + ': ' + codes(r)); assert.equal(r.coverage.unresolved, true);
    if (code === 'LIMIT_SKILL_ROWS') assert.equal(fields(r, 'skill-row').length, 32);
    if (code === 'LIMIT_ICONS') assert.equal(fields(r, 'super-root')[0].metadata.iconRefs.length, 8);
  }
});

test('detailed node and serialized UTF8 ceilings stop with bounded unresolved report', async () => {
  const nodeLimit = await inspect(fixtureHTML({ enemyCount: 25 })); checkContract(nodeLimit); assert.ok(codes(nodeLimit).includes('LIMIT_NODES'), codes(nodeLimit).join(','));
  // Long but individually bounded Japanese strings make UTF8 bytes exceed the
  // serialization budget before the detailed-node ceiling.
  const outputLimit = await inspect(fixtureHTML({ enemyCount: 3, skills: skillRow('あ'.repeat(150)).repeat(12) }));
  checkContract(outputLimit); assert.ok(codes(outputLimit).includes('LIMIT_OUTPUT'), codes(outputLimit).join(','));
  assert.equal(outputLimit.nodes.length, 0); assert.equal(outputLimit.counts.enemies, null);
});

test('observation and issue budgets independently fail closed before node overflow', async () => {
  const observations = await inspect(fixtureHTML({ enemyCount: 3, supers: header().repeat(40) }));
  assert.deepEqual(codes(observations), ['LIMIT_OBSERVATIONS']); checkContract(observations);
  const c = 'a b c d e f g h i', t = 'x'.repeat(161);
  const noisy = `<div class="${c}">${t}<b class="${c}">${t}</b><i class="${c}">${t}</i></div>`;
  const issues = await inspect(fixtureHTML({ enemyCount: 3, skills: noisy.repeat(32) }));
  assert.deepEqual(codes(issues), ['LIMIT_ISSUES']); checkContract(issues);
});

test('multiple enemies/Supers retain distinct ordinals and condition ownership', async () => {
  const r = await inspect(fixtureHTML({ enemyCount: 2, supers: header() + row('ダメージ', '420') + band('0% ~ 100%', '') + header() + row('ダメージ', '840') + band('0% ~ 100%', '0') }));
  checkContract(r); assert.equal(r.counts.enemies, 2); assert.equal(r.counts.superCandidates, 4); assert.equal(r.counts.conditionCandidates, 4);
  const roots = fields(r, 'super-root'); assert.deepEqual(roots.map(o => [o.parent.enemy, o.parent.superCandidate]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  const counts = fields(r, 'super-specific-count'); assert.deepEqual(counts.map(o => o.metadata.valueText), ['', '0', '', '0']);
  assert.equal(new Set(counts.map(o => o.metadata.headerCandidateRef)).size, 4);
  assert.equal(new Set(counts.map(o => o.metadata.conditionCandidateRef)).size, 4);
});

test('overlapping scopes cannot union more than 64 direct-child summaries', async () => {
  const mixed = '<b>x</b>y'.repeat(40);
  const r = await inspect(fixtureHTML({ skills: `<section><div>${mixed}</div></section>` }));
  checkContract(r); assert.ok(codes(r).includes('LIMIT_CHILDREN'));
});

test('ambiguous enclosing Super root still exposes internal field/condition boundaries without promotion', async () => {
  const r = await run('enclosed'), h = fields(r, 'super-root')[0];
  assert.equal(h.state, 'ambiguous'); assert.equal(h.metadata.byClass, false); assert.equal(h.metadata.iconCount, 1);
  for (const field of ['super-atk', 'probability', 'hp-condition', 'super-specific-count', 'reuse']) {
    const observed = fields(r, field); assert.ok(observed.length);
    for (const o of observed) {
      assert.equal(o.state, 'ambiguous'); assert.equal(o.metadata.relationshipStatus, 'unresolved');
      assert.equal(o.metadata.headerCandidateRef, h.candidateNodeRefs[0]); assert.equal(o.metadata.placement, 'inside-header-candidate');
      assert.ok(o.metadata.labelValueParts.length);
    }
  }
  assert.equal(fields(r, 'hp-condition').length, 2);
  assert.deepEqual(fields(r, 'super-specific-count').map(o => o.metadata.valueText), ['', '0']);
  checkContract(r);
});

test('skill sub-searches obey 40-candidate budget rather than the 64-child budget', async () => {
  const r = await inspect(fixtureHTML({ skills: '<section>' + '<div class="col-sm-9">ID: 90001</div>'.repeat(41) + '</section>' }));
  assert.ok(codes(r).includes('LIMIT_CANDIDATES')); const o = fields(r, 'skill-row')[0];
  assert.equal(o.state, 'not-observed'); assert.equal(o.metadata.descriptionRefs.length, 40); assert.equal(o.metadata.descriptionCandidateCount, null);
  assert.equal(o.metadata.displayedIds.length, 40); assert.equal(o.metadata.idCandidateCount, null); checkContract(r);
});
