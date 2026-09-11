/* One-off Firefox Web Console command. Read the existing Android tab over USB.
 * No requests, navigation, page/storage writes, or extension/session operations.
 * copy() is Firefox's console helper; only the diagnostic reaches the clipboard.
 * This is not an intake parser and never supplies missing game values.
 */
copy(JSON.stringify((() => {
  'use strict';
  if (location.origin !== 'https://jpnja.dokkaninfo.com'
    || location.pathname.replace(/\/$/, '') !== '/events/challenge/1705/17050015') {
    throw new Error('対象のAndroid stage 17050015タブではありません。ページ移動はせず停止します。');
  }
  const boxSelector = '.row.margin-5.border.border-1.border-main-box-darker.bg-main';
  const rowSelector = '.row.d-flex.align-items-center';
  const iconSelector = 'img[src*="cha_type_icon_"]';
  const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const excluded = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/;
  const omissions = new Set();
  let nodeCount = 0;
  let textCount = 0;
  const bounded = value => {
    const text = String(value ?? '');
    textCount += text.length;
    if (text.length > 16000 || textCount > 100000) {
      throw new Error('診断対象が想定より大きいため停止しました。全文保存は不要です。このエラーだけ報告してください。');
    }
    return text;
  };
  function attributes(element) {
    return Object.fromEntries([...element.attributes].flatMap(({ name, value }) => {
      // No URLs, handlers, style URLs, credentials, or arbitrary form values.
      if (/token|auth|cookie|session|password|secret|nonce/i.test(name)) return [];
      if (!/^(class|hidden|title|aria-label|aria-hidden|type|value|data-[\w-]+)$/.test(name)) return [];
      if (/https?:|\/\/|javascript:/i.test(value)) { omissions.add('URL-bearing attributes'); return []; }
      if (element.tagName === 'INPUT' && element.type === 'password') return [];
      return [[name, bounded(value)]];
    }));
  }
  function snapshot(node, depth = 0) {
    if (++nodeCount > 2000 || depth > 30) throw new Error('診断対象DOMが想定より複雑なため停止しました。このエラーだけ報告してください。');
    if (node.nodeType === 3) return { text: bounded(node.nodeValue) };
    if (node.nodeType === 8) return { comment: bounded(node.nodeValue) };
    if (node.nodeType !== 1) return { nodeType: node.nodeType };
    if (excluded.test(node.tagName)) {
      omissions.add(node.tagName);
      return { tag: node.tagName, omitted: true };
    }
    if (node.tagName === 'INPUT' && node.type === 'password') return { tag: 'INPUT', omitted: true };
    const css = document.defaultView.getComputedStyle(node);
    const result = {
      tag: node.tagName, attributes: attributes(node),
      display: css.display, visibility: css.visibility,
      opacity: css.opacity,
      superIcon: node.matches('img[src*="sp_skill_icon_"]')
    };
    for (const pseudo of ['::before', '::after']) {
      const content = document.defaultView.getComputedStyle(node, pseudo).content;
      if (content && !['none', 'normal', '""'].includes(content)) {
        if (/url\(/i.test(content)) omissions.add('pseudo-element URL');
        else result[pseudo] = bounded(content);
      }
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) result.currentValue = bounded(node.value);
    if (node.shadowRoot) omissions.add('shadow tree not inspected');
    result.children = [...node.childNodes].map(child => snapshot(child, depth + 1));
    if (node.tagName === 'TEMPLATE') result.template = [...node.content.childNodes].map(child => snapshot(child, depth + 1));
    return result;
  }
  function rawText(node) {
    if (node.nodeType === 3) return node.nodeValue ?? '';
    if (node.nodeType !== 1 || excluded.test(node.tagName)) return '';
    return [...node.childNodes].map(rawText).join('');
  }
  const boxes = [...document.querySelectorAll(boxSelector)];
  const rows = [...new Set(boxes.flatMap(box => [...box.querySelectorAll(iconSelector)]
    .map(icon => icon.closest(rowSelector)).filter(Boolean)))];
  if (rows.length > 8) throw new Error('想定より敵欄が多いため停止しました。このエラーだけ報告してください。');
  const enemies = rows.map((row, index) => {
    const columns = [...row.children];
    const column = columns[2];
    return {
      index, name: bounded(compact(columns[0]?.querySelector('.font-size-1_2 b')?.textContent)),
      columnCount: columns.length, rowAttributes: attributes(row),
      // Enemy-wide count is deliberately kept separate from Super schedules.
      enemyWideMaxLabel: compact(rawText(columns[1] ?? row)).match(/最大ATK\/ターン:\s*([\d,]+)/)?.[0] ?? null,
      superColumnPresent: Boolean(column),
      superHeaderIconCount: column?.querySelectorAll('img[src*="sp_skill_icon_"]').length ?? 0,
      // Direct-child boundaries are what the existing parser uses to split
      // Super headers and HP usage bands. These are observations, not results.
      directChildTexts: column ? [...column.childNodes].map(node => bounded(compact(rawText(node)))) : [],
      superColumn: column ? snapshot(column) : null
    };
  });
  return {
    diagnostic: 'phase11-stage-dom-v1', capturedAt: new Date().toISOString(),
    stageId: '17050015', readyState: document.readyState,
    selectors: { boxSelector, rowSelector, iconSelector, superColumnIndex: 2 },
    counts: { boxes: boxes.length, enemyRows: rows.length }, enemies,
    omissions: [...omissions],
    scope: 'Existing DOM: enemy identity and Super columns only. No script bodies, other columns, page-wide embedded data, JS heap, network or storage. Absence here does not prove absence at the server. Not actual adapter output.'
  };
})(), null, 2));
