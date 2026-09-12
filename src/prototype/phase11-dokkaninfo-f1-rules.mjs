/** Shared F1 partial-material contract; no DOM, network, storage, or calculation. */
export const F1_PARTIAL_FORMAT = 'phase11-dokkaninfo-f1-partial-1';
export const F1_RULES = Object.freeze({ adapter: 'dokkaninfo-f1-adapter-1', extraction: 'dokkaninfo-f1-structure-1', interpretation: 'dokkaninfo-f1-display-1' });
export const F1_SOURCE = Object.freeze({ key: 'self-authored-dokkaninfo-f1', region: 'jpnja' });
export function f1Stable(value) { if (Array.isArray(value)) return `[${value.map(f1Stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${f1Stable(value[k])}`).join(',')}}`; return JSON.stringify(value); }
export async function f1Digest(value) { const bytes = new TextEncoder().encode(f1Stable(value)); return `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')}`; }
export function f1SafeText(value) { return typeof value === 'string' && value.length <= 240 && !/[<>\u0000-\u001f]/.test(value); }
export function f1ExactKeys(value, keys, code = 'F1_FORMAT') { if (!value || typeof value !== 'object' || Array.isArray(value) || f1Stable(Object.keys(value).sort()) !== f1Stable([...keys].sort())) throw Object.assign(new Error(code), { code }); }
export function f1Fail(ok, code) { if (!ok) throw Object.assign(new Error(code), { code }); }
