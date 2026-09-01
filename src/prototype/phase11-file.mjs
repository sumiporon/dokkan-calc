/** Bounded local decoding only. No browser DOM, scripts, images, fetch or I/O. */
export const FILE_LIMIT = 8 * 1024 * 1024;
const HTML_LIMIT = 2 * 1024 * 1024;
const PART_LIMIT = 128;
export class IntakeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function requireIntake(condition, code, message) {
  if (!condition) throw new IntakeError(code, message);
}
const bytesOf = (text) => Uint8Array.from(text, (char) => char.charCodeAt(0));
function byteString(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 32768) result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return result;
}
function headersAndBody(text) {
  const at = text.search(/\r?\n\r?\n/);
  requireIntake(at >= 0 && at < 32768, 'MIME_HEADERS', '保存ファイルの見出しが壊れているか、大きすぎます。');
  const split = /^\r?\n\r?\n/.exec(text.slice(at))[0].length;
  const headers = Object.create(null);
  for (const line of text.slice(0, at).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const match = /^([a-z0-9-]+):[ \t]*(.*)$/i.exec(line);
    requireIntake(match && !(match[1].toLowerCase() in headers), 'MIME_HEADERS', '保存ファイルの見出しが重複、または不正です。');
    headers[match[1].toLowerCase()] = match[2];
  }
  return { headers, body: text.slice(at + split) };
}
function contentType(value = '') {
  // Reject exotic/ambiguous parameters rather than misidentifying an iframe as root.
  const parts = value.match(/(?:"(?:[^"\\]|\\.)*"|[^;])+/g) ?? [];
  const type = (parts.shift() ?? '').trim().toLowerCase();
  const params = Object.create(null);
  for (const part of parts) {
    const match = /^\s*([\w-]+)\s*=\s*(?:"([^"\\]*)"|([^\s;]+))\s*$/.exec(part);
    requireIntake(match && !(match[1].toLowerCase() in params), 'MIME_PARAMETERS', 'このMHTMLの指定形式は試作では未対応です。');
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return { type, params };
}
function decodeTransfer(body, encoding = '7bit') {
  const mode = encoding.toLowerCase();
  if (['7bit', '8bit', 'binary'].includes(mode)) return bytesOf(body);
  if (mode === 'base64') {
    const compact = body.replace(/[\t\r\n ]/g, '');
    requireIntake(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact), 'MIME_BASE64', 'MHTMLのbase64が壊れています。');
    return bytesOf(atob(compact));
  }
  if (mode === 'quoted-printable') {
    const compact = body.replace(/=\r?\n/g, '');
    requireIntake(!/=(?![a-f0-9]{2})/i.test(compact), 'MIME_QP', 'MHTMLの文字エンコードが壊れています。');
    return bytesOf(compact.replace(/=([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
  }
  throw new IntakeError('MIME_ENCODING', 'この保存ファイルのエンコードは未対応です。');
}
function decodeHtml(bytes, charset = 'utf-8') {
  requireIntake(bytes.length <= HTML_LIMIT, 'HTML_TOO_LARGE', '本文が試作の上限2MBを超えています。');
  requireIntake(['utf-8', 'utf8', 'us-ascii', 'windows-1252', 'shift_jis'].includes(charset.toLowerCase()), 'HTML_CHARSET', 'この文字コードは試作では未対応です。');
  try { return new TextDecoder(charset, { fatal: true }).decode(bytes); }
  catch { throw new IntakeError('HTML_DECODE', '本文の文字コードを正しく読み取れません。'); }
}
export function decodeLocalFile(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  requireIntake(bytes.length > 0 && bytes.length <= FILE_LIMIT, 'FILE_SIZE', '空のファイル、または試作上限8MBを超えるファイルは読めません。');
  const head = byteString(bytes.subarray(0, 32768));
  if (!/^content-type:\s*multipart\//im.test(head)) {
    const html = decodeHtml(bytes);
    requireIntake(/<(?:!doctype\s+html|html|main)\b/i.test(html), 'HTML_REQUIRED', 'HTMLの本文が必要です。URL・PDF・画像・JSONだけでは取り込めません。');
    return { html, format: 'html', observedUrl: null, resources: new Map() };
  }
  const message = headersAndBody(byteString(bytes));
  const top = contentType(message.headers['content-type']);
  requireIntake(top.type === 'multipart/related' && top.params.boundary && /^[\x20-\x7e]{1,200}$/.test(top.params.boundary), 'MIME_CONTAINER', 'このMHTMLコンテナ形式は試作では未対応です。');
  const marker = `--${top.params.boundary}`;
  const lines = message.body.split(/\r?\n/);
  const sections = []; let active = null; let closed = false;
  for (const line of lines) {
    if (line === marker || line === `${marker}--`) {
      if (active !== null) sections.push(active.join('\r\n'));
      requireIntake(!closed && sections.length <= PART_LIMIT, 'MIME_PARTS', 'MHTMLの構造が不正、または部品が多すぎます。');
      if (line === `${marker}--`) { closed = true; active = null; } else active = [];
    } else if (active !== null) active.push(line);
  }
  requireIntake(closed && sections.length > 0, 'MIME_INCOMPLETE', '保存ファイルが途中で切れています。');
  const parts = sections.map((text) => {
    const part = headersAndBody(text);
    part.contentType = contentType(part.headers['content-type']);
    requireIntake(!part.contentType.type.startsWith('multipart/'), 'MIME_NESTED', '入れ子のMHTMLは試作では未対応です。元データは変更しません。');
    return part;
  });
  const byId = new Map();
  for (const part of parts) {
    const id = part.headers['content-id'];
    if (!id) continue;
    requireIntake(!byId.has(id), 'MIME_DUPLICATE_ID', 'MHTMLの部品IDが重複しています。');
    byId.set(id, part);
  }
  const root = top.params.start ? byId.get(top.params.start) : parts[0];
  requireIntake(root?.contentType.type === 'text/html', 'MIME_ROOT', 'MHTMLの本文を一意に特定できません。');
  const observedUrl = root.headers['content-location'] ?? null;
  const snapshotUrl = message.headers['snapshot-content-location'];
  requireIntake(!snapshotUrl || snapshotUrl === observedUrl, 'MIME_URL_CONFLICT', '保存元URLと本文のURLが一致しません。');
  const resources = new Map();
  for (const [id, part] of byId) if (part.headers['content-location']) resources.set(`cid:${id.replace(/^<|>$/g, '')}`, part.headers['content-location']);
  return { html: decodeHtml(decodeTransfer(root.body, root.headers['content-transfer-encoding']), root.contentType.params.charset), format: 'mhtml', observedUrl, resources };
}
