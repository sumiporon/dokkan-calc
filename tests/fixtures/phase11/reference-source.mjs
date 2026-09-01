/** Self-authored test page. No data copied from a game/source site. */
export function referencePage({ stageId = 'forest-1', revision = '2026-08-31T00:00:00Z', normalAtk = 600000, split = false, detail = false } = {}) {
  const rows = [
    { kind: 'encounter', id: 'phase-1', parent: stageId, order: 1, fields: { layout: 'sequential' } },
    { kind: 'enemy', id: 'green', parent: 'phase-1', order: 1, fields: { name: '取込確認用・架空の緑敵', type: 'teq', alignment: 'extreme', hp: 10000000, atk: normalAtk, def: 150000, reduction: 10, 'max-attacks': 8, critical: false, 'critical-multiplier': 1, 'critical-ignore': 0 } },
    { kind: 'super', id: 'super:a', parent: 'green', order: 1, fields: { name: '架空必殺A', atk: 1500000, target: 'single', 'hp-min': 51, 'hp-max': 100, probability: 25, 'max-per-turn': 1, cooldown: 0 } },
    { kind: 'super', id: 'super:b', parent: 'green', order: 2, fields: { name: '架空必殺B', atk: 2500000, target: 'single', 'hp-min': 0, 'hp-max': 50, probability: 35, 'max-per-turn': 1, cooldown: 1 } },
    { kind: 'area', id: 'area:wave', parent: 'phase-1', order: 1, fields: { enemy: 'green', kind: 'normal', first: 1200000, additional: split ? null : 720000, 'max-per-turn': 1, target: 'selected-and-others' } },
    { kind: 'ai', id: 'action-1', parent: 'phase-1', order: 1, fields: { enemy: 'green', kind: 'normal', slot: 1, 'hp-min': 0, 'hp-max': 100, probability: 100, 'max-uses': 1, cooldown: 0, text: '1番目は通常攻撃。架空試験用の行動。' } }
  ];
  const part = detail ? 'detail' : 'main';
  return {
    format: 'phase11-reference-html-v1', sourceKey: 'phase11-self-authored-reference', sourceUrl: `https://manual-fixture.invalid/stages/${stageId}/${part}`,
    revision, eventId: 'manual-forest', eventName: '取込試験・架空の森', stageId, stageName: `架空ステージ ${stageId}`, part, requiredParts: split ? ['main', 'detail'] : ['main'],
    expectedCounts: { encounter: 1, enemy: 1, super: 2, area: 1, ai: 1 },
    records: detail ? [{ kind: 'area', id: 'area:wave', parent: 'phase-1', order: 1, fields: { additional: 720000 } }] : rows,
    links: split && !detail ? [{ part: 'detail', href: `https://manual-fixture.invalid/stages/${stageId}/detail`, label: '全体攻撃の追加対象を確認する補足ページ（架空）' }] : []
  };
}
export function referenceMhtml(html, { encoding = 'quoted-printable', location = 'https://manual-fixture.invalid/stages/forest-1/main', boundary = '----phase11-boundary--', start = true } = {}) {
  const bytes = new TextEncoder().encode(html);
  const body = encoding === 'base64' ? btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join('')) : Array.from(bytes, (value) => `=${value.toString(16).padStart(2, '0').toUpperCase()}`).join('').match(/.{1,60}/g).join('=\r\n');
  return `From: <Saved by Phase11 fixture>\r\nSnapshot-Content-Location: ${location}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${boundary}"${start ? '; start="<root>"' : ''}\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-ID: <root>\r\nContent-Location: ${location}\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${body}\r\n--${boundary}--\r\n`;
}
