/**
 * Owner-provided DokkanInfo saved-page adapter for the Phase 11 private trial.
 *
 * This module never opens a URL and never performs network or filesystem I/O.
 * It accepts only HTML/MHTML bytes already selected by the owner, resolves
 * MHTML cid: references from the received MIME resource map, and reuses the
 * audited Phase 3/4 parser and Phase 6 canonical/runtime projection.
 */
import { load } from 'cheerio/lib/slim';
import { parseCachedStageHtml, classifyCachedEvent } from '../data-foundation/dokkaninfo-saved-stage.mjs';
import { futureEncounter } from '../data-foundation/dokkaninfo-saved-stage-v1.mjs';
import { adaptPhase4CandidateWithProvenance } from '../data-foundation/phase6-canonical.ts';
import { projectCanonicalToRuntime } from '../data-foundation/phase6-runtime.ts';
import { requireIntake } from './phase11-file.mjs';

export const DOKKANINFO_SOURCE = 'manual-dokkaninfo';
export const DOKKANINFO_FORMAT = 'dokkaninfo-owner-saved-page-v1';
export const DOKKANINFO_CLASSIFICATION = 'manual-dokkaninfo-private-prototype';
export const DOKKANINFO_ADAPTER_VERSION = 'phase11-manual-dokkaninfo-1';
const HOST = 'jpnja.dokkaninfo.com';
const EVENT_PATH = /^\/events\/challenge\/(\d+)\/?$/;
const STAGE_PATH = /^\/events\/challenge\/(\d+)\/(\d+)\/?$/;

const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function exactSourceUrl(value, label = '保存元URL') {
  let url;
  try { url = new URL(value); }
  catch { throw Object.assign(new Error(`${label}を確認できません。`), { code: 'DOKKANINFO_URL' }); }
  requireIntake(
    url.protocol === 'https:' && url.hostname === HOST && url.port === ''
      && url.username === '' && url.password === '' && url.search === '' && url.hash === '',
    'DOKKANINFO_URL',
    `${label}が対応するDokkanInfo日本語版challengeページではありません。`
  );
  const stage = STAGE_PATH.exec(url.pathname);
  const event = stage ? null : EVENT_PATH.exec(url.pathname);
  requireIntake(stage || event, 'DOKKANINFO_URL', `${label}がeventまたはstageページではありません。`);
  const canonicalPath = stage ? `/events/challenge/${stage[1]}/${stage[2]}` : `/events/challenge/${event[1]}`;
  return {
    href: `https://${HOST}${canonicalPath}`,
    pageKind: stage ? 'stage' : 'event',
    eventId: (stage ?? event)[1],
    stageId: stage?.[2] ?? null
  };
}

function resolveReceivedResources($, resources) {
  $('[src]').each((_, element) => {
    const value = $(element).attr('src');
    if (!value?.startsWith('cid:')) return;
    const resolved = resources?.get(value);
    if (resolved) $(element).attr('src', resolved);
  });
}

function captureTime(context = {}) {
  const value = context.capturedAt ?? (Number.isFinite(context.lastModified) && context.lastModified > 0
    ? new Date(context.lastModified).toISOString()
    : new Date().toISOString());
  requireIntake(Number.isFinite(Date.parse(value)), 'DOKKANINFO_CAPTURE_TIME', 'ファイルの取得時刻を確認できません。');
  return value;
}

function parseIdentity(decoded) {
  const $ = load(decoded.html);
  const og = $('meta[property="og:url"]');
  requireIntake(og.length === 1, 'DOKKANINFO_IDENTITY', '保存ページのog:urlを一意に確認できません。');
  const identity = exactSourceUrl(og.attr('content'), '保存ページのog:url');
  requireIntake(decoded.format !== 'mhtml' || decoded.observedUrl, 'DOKKANINFO_IDENTITY', 'MHTMLのContent-Locationから保存元URLを確認できません。');
  if (decoded.observedUrl) {
    const observed = exactSourceUrl(decoded.observedUrl, 'MHTMLのContent-Location');
    requireIntake(observed.href === identity.href, 'DOKKANINFO_IDENTITY', 'MHTMLの保存元URLとページ内og:urlが一致しません。');
  }
  resolveReceivedResources($, decoded.resources);
  return { $, identity, resolvedHtml: $.html() };
}

function eventTitle($) {
  const candidates = [
    $('.row.bg-third .font-size-2').first().text(),
    $('.font-size-2').first().text(),
    $('title').first().text().split('|')[0]
  ].map(compact).filter(Boolean);
  const value = candidates[0] ?? '';
  requireIntake(value.length > 0 && value.length <= 160, 'DOKKANINFO_EVENT_NAME', 'イベント名を保存ページから確認できません。');
  return value;
}

function eventStageLinks($, identity) {
  const values = new Map();
  $('a[href]').each((_, element) => {
    let candidate;
    try { candidate = exactSourceUrl(new URL($(element).attr('href'), identity.href).href, 'eventページ内のstageリンク'); }
    catch { return; }
    if (candidate.pageKind !== 'stage' || candidate.eventId !== identity.eventId) return;
    const container = $(element).closest('.col-sm.border, .row.padding-top-bottom-5');
    const label = compact(container.find('.font-size-1_5').first().text()) || compact($(element).text()).slice(0, 160) || `ステージ ${candidate.stageId}`;
    values.set(candidate.href, { eventId: identity.eventId, stageId: candidate.stageId, href: candidate.href, label, observedInMaterial: true });
  });
  return [...values.values()].sort((left, right) => left.stageId.localeCompare(right.stageId, 'en'));
}

export function canHandleDokkanInfo(decoded) {
  return /<meta\b[^>]*\bproperty=["']og:url["'][^>]*\bcontent=["']https:\/\/jpnja\.dokkaninfo\.com\/events\/challenge\//i.test(decoded?.html ?? '')
    || /<meta\b[^>]*\bcontent=["']https:\/\/jpnja\.dokkaninfo\.com\/events\/challenge\/[^"']+["'][^>]*\bproperty=["']og:url["']/i.test(decoded?.html ?? '');
}

export function parseDokkanInfoSavedPage(decoded, context = {}) {
  requireIntake(canHandleDokkanInfo(decoded), 'SOURCE_UNSUPPORTED', 'この保存ページは対応するDokkanInfo challengeページとして確認できません。');
  const { $, identity, resolvedHtml } = parseIdentity(decoded);
  const capturedAt = captureTime(context);
  if (identity.pageKind === 'event') {
    const stageLinks = eventStageLinks($, identity);
    requireIntake(stageLinks.length > 0 && stageLinks.length <= 200, 'DOKKANINFO_EVENT_LAYOUT', 'eventページからstageリンクを確認できません。');
    return {
      format: DOKKANINFO_FORMAT,
      sourceKey: DOKKANINFO_SOURCE,
      pageKind: 'event',
      sourceUrl: identity.href,
      capturedAt,
      eventId: identity.eventId,
      eventName: eventTitle($),
      stageId: null,
      stageName: null,
      stageLinks,
      parsedStage: null
    };
  }

  const parsedStage = parseCachedStageHtml(resolvedHtml, {
    eventId: identity.eventId,
    eventTitle: null,
    eventType: null,
    seriesName: null,
    stageId: identity.stageId,
    sourceFile: null
  });
  return validateDokkanInfoMaterial({
    format: DOKKANINFO_FORMAT,
    sourceKey: DOKKANINFO_SOURCE,
    pageKind: 'stage',
    sourceUrl: identity.href,
    capturedAt,
    eventId: identity.eventId,
    eventName: null,
    stageId: identity.stageId,
    stageName: parsedStage.stageName,
    stageLinks: [],
    parsedStage
  });
}

function stageMissing(page) {
  const missing = [];
  const parsed = page.parsedStage;
  if (!page.eventName) missing.push(`イベント ${page.eventId}: イベント名の確認にeventページも必要です。`);
  if (!page.stageName) missing.push(`ステージ ${page.stageId}: ステージ名が不足しています。`);
  if (!parsed?.groups?.length || !parsed?.enemies?.length) missing.push(`ステージ ${page.stageId}: 敵・出現区分を確認できません。`);
  if (parsed?.orphanTypeIcons) missing.push(`ステージ ${page.stageId}: ${parsed.orphanTypeIcons}件の属性アイコンを敵へ対応付けられません。`);
  for (const enemy of parsed?.enemies ?? []) {
    const who = enemy.name || `出現${enemy.encounterIndex + 1}・敵${enemy.orderInEncounter + 1}`;
    if (!enemy.name) missing.push(`${who}: 敵名が不足しています。`);
    if (!['agl', 'teq', 'int', 'str', 'phy'].includes(enemy.type)) missing.push(`${who}: 属性が不足しています。`);
    if (!['super', 'extreme', 'neutral'].includes(enemy.class)) missing.push(`${who}: 超・極・中立の区分が不足しています。`);
    if (!(enemy.hp > 0)) missing.push(`${who}: HPが不足、または0です。`);
    if (!(enemy.atk > 0)) missing.push(`${who}: ATKが不足、または0です。`);
    if (!(Number.isFinite(enemy.def) && enemy.def >= 0)) missing.push(`${who}: DEFが不足しています。`);
    if (!enemy.superAttackColumnObserved) missing.push(`${who}: 必殺技欄の構造を確認できません。`);
    for (const [index, attack] of (enemy.superAttacks ?? []).entries()) {
      if (!attack.name) missing.push(`${who}: 必殺技${index + 1}の名前が不足しています。`);
      if (!(attack.damage > 0)) missing.push(`${who}: 必殺技${index + 1}のATKが不足、または0です。`);
      const baseScheduleComplete = attack.probabilityPercent != null
        && attack.maxPerTurn != null && attack.cooldownTurns != null;
      const rulesComplete = attack.usageRules?.length > 0 && attack.usageRules.every((rule) =>
        rule.hpMinPercent != null && rule.hpMaxPercent != null
          && rule.probabilityPercent != null && rule.maxPerTurn != null
          && rule.cooldownTurns != null);
      const scheduleComplete = attack.usageRules?.length > 0 ? rulesComplete : baseScheduleComplete;
      if (!scheduleComplete) missing.push(`${who}: 必殺技${index + 1}の確率・回数・再使用条件が不足しています。`);
    }
    if (enemy.areaDamage) {
      if (!(enemy.areaDamage.maxPerTurn > 0)) missing.push(`${who}: 全体攻撃の回数が不足、または0です。`);
      if (!(enemy.areaDamage.firstTargetDamage > 0)) missing.push(`${who}: 全体攻撃の最初の対象ATKが不足、または0です。`);
      if (!(enemy.areaDamage.additionalTargetDamage > 0)) missing.push(`${who}: 全体攻撃の追加対象ATKが不足、または0です。`);
    }
  }
  for (const group of parsed?.groups ?? []) for (const action of group.actions ?? []) {
    if (!action.type || action.probabilityPercent == null) missing.push(`出現${group.encounterIndex + 1}: AI行動${action.sourceOrder}の種類または確率が不足しています。`);
    if (!Number.isInteger(action.enemyOrder)
      || !group.enemies.some((enemy) => enemy.orderInEncounter === action.enemyOrder)) {
      missing.push(`出現${group.encounterIndex + 1}: AI行動${action.sourceOrder}を対象の敵へ対応付けられません。`);
    }
  }
  return [...new Set(missing)];
}

export function validateDokkanInfoMaterial(page) {
  requireIntake(page?.format === DOKKANINFO_FORMAT && page.sourceKey === DOKKANINFO_SOURCE, 'DOKKANINFO_MATERIAL', 'DokkanInfo正規化材料の版が不正です。');
  const identity = exactSourceUrl(page.sourceUrl);
  requireIntake(identity.pageKind === page.pageKind && identity.eventId === page.eventId && identity.stageId === page.stageId, 'DOKKANINFO_MATERIAL', 'DokkanInfo正規化材料のURLとIDが一致しません。');
  requireIntake(Number.isFinite(Date.parse(page.capturedAt)), 'DOKKANINFO_CAPTURE_TIME', 'ファイルの取得時刻を確認できません。');
  if (page.pageKind === 'event') {
    requireIntake(page.parsedStage === null && page.stageId === null && page.stageName === null && compact(page.eventName).length > 0, 'DOKKANINFO_MATERIAL', 'eventページの正規化材料が不正です。');
    const links = page.stageLinks ?? [];
    requireIntake(links.length > 0 && links.every((link) => {
      const target = exactSourceUrl(link.href, '保存済みeventページ内のstageリンク');
      return target.pageKind === 'stage' && target.eventId === page.eventId && target.stageId === link.stageId && link.observedInMaterial === true;
    }), 'DOKKANINFO_MATERIAL', 'eventページのstageリンクを確認できません。');
  } else {
    requireIntake(page.pageKind === 'stage' && page.parsedStage && page.stageLinks?.length === 0, 'DOKKANINFO_MATERIAL', 'stageページの正規化材料が不正です。');
    requireIntake(page.parsedStage.eventId === page.eventId && page.parsedStage.stageId === page.stageId && page.parsedStage.stageName === page.stageName, 'DOKKANINFO_MATERIAL', 'stage解析結果の所属が一致しません。');
  }
  return page;
}

export function resolveDokkanInfoSelection(pages) {
  pages = pages.map(validateDokkanInfoMaterial);
  const eventPages = new Map();
  const stagePages = new Map();
  for (const page of pages) {
    const key = page.pageKind === 'event' ? page.eventId : `${page.eventId}/${page.stageId}`;
    const target = page.pageKind === 'event' ? eventPages : stagePages;
    requireIntake(!target.has(key), 'DUPLICATE_PAGE', '同じDokkanInfo保存ページが複数選択されています。');
    target.set(key, page);
  }
  const bundles = [];
  const missing = [];
  const links = [];
  for (const stagePage of stagePages.values()) {
    const eventPage = eventPages.get(stagePage.eventId) ?? null;
    if (eventPage) {
      requireIntake(eventPage.stageLinks.some((link) => link.href === stagePage.sourceUrl), 'DOKKANINFO_EVENT_STAGE', '選択したeventページにこのstageリンクがありません。');
    }
    const eventName = eventPage?.eventName ?? null;
    const resolved = { ...stagePage, eventName };
    const stageProblems = stageMissing(resolved);
    if (stageProblems.length) missing.push(...stageProblems);
    else bundles.push({ eventPage, stagePage: resolved });
  }
  for (const eventPage of eventPages.values()) {
    if ([...stagePages.values()].some((page) => page.eventId === eventPage.eventId)) continue;
    missing.push(`${eventPage.eventName}: eventページだけでは敵のHP・ATK・DEF・攻撃情報を取得できません。追加するstageページを保存してください。`);
    links.push(...eventPage.stageLinks);
  }
  requireIntake(stagePages.size > 0 || eventPages.size > 0, 'EMPTY_SELECTION', '対応する保存ページがありません。');
  return { bundles, missing: [...new Set(missing)], links: [...new Map(links.map((link) => [link.href, link])).values()] };
}

export function dokkanInfoStageToFutureDataset(bundle, contentDigest) {
  const { stagePage } = bundle;
  requireIntake(bundle.eventPage, 'DOKKANINFO_EVENT_REQUIRED', 'イベント名の出典となるeventページが必要です。');
  const classification = classifyCachedEvent(stagePage.eventName);
  const parsed = stagePage.parsedStage;
  const context = {
    eventId: stagePage.eventId,
    stageId: stagePage.stageId,
    stageUrl: stagePage.sourceUrl,
    sourceFile: null,
    checkedAt: stagePage.capturedAt,
    providerKey: DOKKANINFO_SOURCE,
    region: 'jpnja'
  };
  return {
    schemaVersion: 1,
    datasetId: `phase11-manual-dokkaninfo-${contentDigest.slice(7, 19)}`,
    generatedAt: stagePage.capturedAt,
    sourceSnapshot: {
      provider: 'DokkanInfo owner-saved local page',
      region: 'jpnja',
      acquiredAt: stagePage.capturedAt,
      importMethod: 'owner-local-html-or-mhtml-file',
      policyStatus: 'manual-private-prototype-permission-unverified',
      parserVersion: DOKKANINFO_ADAPTER_VERSION,
      sourceRootUrl: stagePage.sourceUrl,
      contentDigest,
      notes: 'Owner-selected local file only. No fetch; no publication or redistribution permission is implied.'
    },
    events: [{
      eventId: stagePage.eventId,
      name: stagePage.eventName,
      category: 'challenge',
      legacyEventType: classification.eventType,
      sourceUrl: bundle.eventPage.sourceUrl,
      stages: [{
        stageId: stagePage.stageId,
        name: stagePage.stageName,
        legacySeriesName: classification.seriesName,
        sourceUrl: stagePage.sourceUrl,
        encounters: parsed.groups.map((group) => futureEncounter(group, context))
      }]
    }],
    manualCorrections: []
  };
}

export function adaptDokkanInfoStage(bundle, sourceMaterials, contentDigest) {
  const future = dokkanInfoStageToFutureDataset(bundle, contentDigest);
  const adapted = adaptPhase4CandidateWithProvenance(future, {
    inputPath: sourceMaterials.map((material) => material.page.sourceUrl).join(' + '),
    inputDigest: contentDigest,
    inputBytes: sourceMaterials.reduce((sum, material) => sum + material.bytes, 0),
    reproducibleBy: 'Phase11 manual-dokkaninfo local-file adapter; no network'
  }, {
    sourceKey: DOKKANINFO_SOURCE,
    inputFormat: DOKKANINFO_FORMAT
  });
  // Phase 6's full-cache adapter historically left event/stage name fields
  // without direct evidence because its cache index supplied them. Here the
  // owner-selected event page is direct evidence for the event name, while
  // the selected stage page is evidence for the stage title and URL identity.
  const snapshotId = adapted.canonical.sourceSnapshots[0].id;
  const eventEvidence = {
    id: `${snapshotId}:evidence:event-page:${bundle.eventPage.eventId}`,
    sourceSnapshotId: snapshotId,
    sourceUrl: bundle.eventPage.sourceUrl,
    sourceFile: null,
    observedAt: bundle.eventPage.capturedAt,
    confidence: 'high',
    notes: 'ownerが選択した保存済みeventページでイベント名とstageリンクを確認。'
  };
  adapted.canonical.evidence.push(eventEvidence);
  adapted.canonical.evidence.sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const stageEvidenceIds = adapted.canonical.evidence
    .filter((item) => item.sourceUrl === bundle.stagePage.sourceUrl)
    .map((item) => item.id);
  requireIntake(stageEvidenceIds.length > 0, 'DOKKANINFO_EVIDENCE', 'stageページの出典情報を確認できません。');
  for (const event of adapted.canonical.events) {
    if (event.name.state === 'known') event.name.evidenceIds = [eventEvidence.id];
    if (event.category.state === 'known') event.category.evidenceIds = [eventEvidence.id];
    for (const stage of event.stages) if (stage.name.state === 'known') stage.name.evidenceIds = stageEvidenceIds;
  }
  return { future, canonical: adapted.canonical, runtime: projectCanonicalToRuntime(adapted.canonical).runtime, sourceMaterial: adapted.sourceMaterial };
}

export function dokkanInfoSourceFacts(packageValue) {
  const stage = packageValue.canonical.events[0]?.stages[0];
  if (!stage) return [];
  const facts = [{ kind: 'stage', id: stage.id, value: stage }];
  for (const encounter of stage.encounters) {
    facts.push({ kind: 'encounter', id: encounter.id, value: encounter });
    for (const enemy of encounter.enemies) {
      facts.push({ kind: 'enemy', id: enemy.id, value: enemy });
      for (const attack of enemy.superAttacks) facts.push({ kind: 'super', id: attack.id, value: attack });
      for (const skill of enemy.skills) facts.push({ kind: 'skill', id: skill.id, value: skill });
    }
    for (const area of encounter.areaAttacks) facts.push({ kind: 'area', id: area.id, value: area });
    for (const action of encounter.aiActions) facts.push({ kind: 'ai', id: action.id, value: action });
  }
  return facts;
}
