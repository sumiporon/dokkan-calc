/** F3's non-mutating persistence audit. A valid package can still be rejected. */
import { stable } from './phase11-partial-rules.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const MAX_TEXT = 16384, MAX_SERIALIZED = 150000;
const forbidden = /(?:^|[_-])(html|script|cookie|token|storage|history|external(?:resource)?)(?:$|[_-])/i;
const allowedRoot = new Set(['version','classification','productionApplyAllowed','stageKey','revision','receipts','materials','canonical','runtime','canonicalDigest','runtimeDigest','digest']);
function visit(value, path = []) {
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT) fail('F3_FULL_UNBOUNDED_TEXT');
    if (/<\/?(?:html|script|body)\b/i.test(value)) fail('F3_FULL_RAW_SOURCE');
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key)) fail('F3_FULL_FORBIDDEN_FIELD');
    visit(child, [...path, key]);
  }
}
export function validateF3FullPersistability(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) fail('F3_FULL_FORMAT');
  for (const key of Object.keys(pack)) if (!allowedRoot.has(key)) fail('F3_FULL_ALLOWLIST');
  if (stable(pack).length > MAX_SERIALIZED) fail('F3_FULL_SIZE');
  visit(pack);
  return structuredClone(pack);
}
