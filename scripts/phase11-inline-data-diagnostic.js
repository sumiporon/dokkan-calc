/* Paste once into the existing Android tab's Firefox USB Web Console.
 * Reads inline data as text/JSON only. Never evaluates source JavaScript.
 * No network, navigation, cookies, storage, globals/heap, or page writes.
 * copy() is the Firefox console helper, not a page clipboard API.
 */
copy(JSON.stringify((() => {
  'use strict';
  if (location.origin !== 'https://jpnja.dokkaninfo.com'
    || location.pathname.replace(/\/$/, '') !== '/events/challenge/1705/17050015') {
    throw new Error('stage 17050015の既存タブではありません。移動せず停止してください。');
  }
  const references = ['17050015', 'スーパージャネンバ', '超ゴジータ', 'ライトニングシャワーレイン', 'ソウルパニッシャー'];
  const privateKey = /auth|token|cookie|session|password|secret|credential|nonce|user|account|email|profile|visitor|tracking|analytics|advert|consent|config|headers/i;
  const thirdParty = /analytics|advert|adsbygoogle|googletag|gtag|doubleclick|facebook|pixel|clarity|hotjar|onetrust|consent|sentry|recaptcha|cloudflare/i;
  const countKey = /max.*(?:atk|attack|super|special|usage|uses|count|turn|times|sa\b)|(?:atk|attack|super|special|usage|use).*?(?:max|limit|count|times)|maxPerTurn|最大ATK|使用回数|必殺回数|^(?:count|times|limit|max_?uses)$/i;
  const contextKey = /^(?:id|name|type|stage_?id|enemy_?id|card_?id|skill_?id|attack_?id|super_?attack_?id|hp(?:Min|Max|Lower|Upper)?(?:Percent)?|hp_?(?:min|max|from|to|lower|upper)(?:_?percent)?|probability(?:Percent)?|cooldown(?:Turns)?|hp_range)$/i;
  const safeKey = key => /^[\w一-龠ぁ-んァ-ヶ% -]{1,64}$/.test(key) ? key : '[key omitted]';
  const numberValue = value => typeof value === 'number' && Number.isFinite(value)
    || typeof value === 'string' && /^-?\d+(?:\.\d+)?%?$/.test(value) && value.length < 24;
  const scalar = value => value == null || typeof value !== 'object';
  function directContext(object) {
    if (!object || Array.isArray(object) || typeof object !== 'object') return {};
    return Object.fromEntries(Object.keys(object).filter(key => !privateKey.test(key) && contextKey.test(key))
      .flatMap(key => {
        const value = object[key];
        return numberValue(value) || typeof value === 'string' && references.includes(value) ? [[safeKey(key), value]] : [];
      }));
  }
  const result = {
    diagnostic: 'phase11-inline-data-v1', stageId: '17050015',
    scannedAt: new Date().toISOString(), candidates: [],
    excluded: { external: 0, thirdParty: 0, nonData: 0, invalidJson: 0, sizeLimit: 0, privateSubtrees: 0 },
    limitsReached: false,
    note: 'References indicate locations in one data tree, not proven enemy/attack/HP associations. No field meaning is verified. Other JS, external scripts, heap and server remain unexamined.'
  };
  let totalCharacters = 0;
  for (const [index, script] of [...document.querySelectorAll('script')].entries()) {
    if (script.hasAttribute('src')) { result.excluded.external++; continue; }
    const type = (script.getAttribute('type') ?? '').trim().toLowerCase();
    const id = script.getAttribute('id') ?? '';
    if (thirdParty.test(`${id} ${script.getAttribute('class') ?? ''}`)) { result.excluded.thirdParty++; continue; }
    // Bound reading before textContent; no script/DOM resource is requested.
    const length = [...script.childNodes].reduce((n, node) => n + (node.nodeValue?.length ?? 0), 0);
    if (length > 2000000 || totalCharacters + length > 4000000) {
      result.excluded.sizeLimit++; result.limitsReached = true; continue;
    }
    totalCharacters += length;
    const text = script.textContent.trim();
    if (thirdParty.test(text.slice(0, 256))) { result.excluded.thirdParty++; continue; }
    let kind = 'inline-json';
    let json = text;
    if (!/^(?:application\/(?:ld\+)?json|text\/json)$/.test(type) && !/^[\[{]/.test(text)) {
      // Only an entire, recognizable hydration assignment whose RHS is JSON.
      // Executable expressions, callbacks and JS object literals stay excluded.
      const match = text.match(/^(?:window\.)?(__INITIAL_STATE__|__PRELOADED_STATE__|__NUXT__|__NEXT_DATA__)\s*=\s*([\s\S]*?)\s*;?$/);
      if (!match) { result.excluded.nonData++; continue; }
      kind = `literal-hydration:${match[1]}`; json = match[2];
    } else if (/__NEXT_DATA__|__NUXT_DATA__|hydration/i.test(id)) kind = 'hydration-json';
    let data;
    try { data = JSON.parse(json); } catch { result.excluded.invalidJson++; continue; }
    const candidate = { scriptIndex: index, kind, type: type || '(unspecified)', references: [], fields: [], complete: true };
    let visited = 0;
    function visit(value, path, ancestors = [], depth = 0) {
      if (!candidate.complete) return;
      if (++visited > 50000 || depth > 40 || candidate.references.length > 100 || candidate.fields.length > 100) {
        candidate.complete = false; result.limitsReached = true; return;
      }
      if (!value || typeof value !== 'object') return;
      const context = directContext(value);
      const chain = Object.keys(context).length ? [...ancestors, { path, context }] : ancestors;
      for (const key of Object.keys(value)) {
        if (candidate.references.length >= 100 || candidate.fields.length >= 100) {
          candidate.complete = false; result.limitsReached = true; return;
        }
        if (privateKey.test(key) || thirdParty.test(key)) { result.excluded.privateSubtrees++; continue; }
        const item = value[key];
        const itemPath = `${path}/${safeKey(key)}`;
        if (references.includes(String(scalar(item) ? item : ''))) {
          candidate.references.push({ path: itemPath, reference: String(item) });
        }
        if (countKey.test(key)) {
          // Never emit free text or an entire object from a candidate field.
          candidate.fields.push({ path: itemPath, field: safeKey(key),
            value: item === null || numberValue(item) ? item : '[non-numeric omitted]',
            enclosingContext: chain.slice(-4) });
        }
        if (!scalar(item)) visit(item, itemPath, chain, depth + 1);
        if (!candidate.complete) return;
      }
    }
    visit(data, '$');
    // Unrelated data bodies are never exported, even if they contain counts.
    if (!candidate.references.length) candidate.fields = [];
    result.candidates.push(candidate);
  }
  const fields = result.candidates.flatMap(candidate => candidate.fields);
  result.status = result.limitsReached ? 'inconclusive-limit'
    : fields.length ? 'candidate-fields-only-not-usable'
      : 'no-count-candidate-in-limited-inline-data';
  return result;
})(), null, 2));
