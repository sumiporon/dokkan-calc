/**
 * Phase 11 live-DOM adapter boundary.
 *
 * This module has no network or session/storage API. It receives only the
 * currently displayed document and URL, normalizes the source-specific
 * material, and reuses the audited saved-page adapter and canonical pipeline.
 */
import {
  DOKKANINFO_ADAPTER_VERSION,
  parseDokkanInfoSavedPage,
  validateDokkanInfoMaterial,
  dokkanInfoStageProblems
} from './phase11-dokkaninfo-adapter.mjs';
import { packagePages } from './phase11-intake.mjs';
import { describe } from './phase11-intake.mjs';
import { stableJson } from '../data-migration/phase4-enemy-migration.ts';

export const ONE_TAP_ADAPTER_VERSION = `${DOKKANINFO_ADAPTER_VERSION}+live-dom-1`;
export const ONE_TAP_SOURCE_KEY = 'manual-dokkaninfo';

const state = (kind, details = {}) => ({
  adapterVersion: ONE_TAP_ADAPTER_VERSION,
  sourceKey: ONE_TAP_SOURCE_KEY,
  state: kind,
  targetPage: kind === 'ready',
  requiredComplete: kind === 'ready',
  ...details
});

function normalizedInput(html) {
  return { format: 'html', html, observedUrl: null, resources: new Map() };
}

function classifyFailure(error, readyState) {
  if (readyState !== 'complete') return 'rendering';
  if (['SOURCE_UNSUPPORTED', 'DOKKANINFO_URL', 'DOKKANINFO_IDENTITY'].includes(error?.code)) return 'unsupported';
  if (['DOKKANINFO_EVENT_LAYOUT', 'DOKKANINFO_EVENT_NAME'].includes(error?.code)) return 'incomplete';
  return 'ambiguous';
}

export function inspectDokkanInfoDocument({ html, currentUrl, sourceUrl = currentUrl, fixtureMode = false, readyState = 'complete', capturedAt = new Date().toISOString() }) {
  if (typeof html !== 'string' || !html.trim()) return state(readyState === 'complete' ? 'incomplete' : 'rendering', { message: '表示中DOMをまだ確認できません。' });
  try {
    const material = validateDokkanInfoMaterial(parseDokkanInfoSavedPage(normalizedInput(html), { capturedAt }));
    if (fixtureMode) {
      const host = new URL(currentUrl).hostname;
      if (!['127.0.0.1', 'localhost', 'raw.githack.com'].includes(host)) return state('unsupported', { message: 'fixture modeを許可していないhostです。' });
    }
    if (material.sourceUrl !== sourceUrl) return state('unsupported', {
      pageKind: material.pageKind,
      eventId: material.eventId,
      stageId: material.stageId,
      message: '表示中URLとページ内のsource IDが一致しません。'
    });
    if (material.pageKind === 'stage') {
      const missing = dokkanInfoStageProblems(material);
      if (missing.length) return state('incomplete', {
        pageKind: material.pageKind, eventId: material.eventId, stageId: material.stageId,
        missing, message: missing.join('\n')
      });
    }
    return state('ready', {
      pageKind: material.pageKind,
      eventId: material.eventId,
      stageId: material.stageId,
      coverage: material.pageKind === 'event'
        ? { visitUnits: material.stageLinks.map(({ stageId, href, label }) => ({
          id: `stage:${stageId}`, kind: 'stage-page', stageId,
          url: fixtureMode ? new URL(`stage-${stageId}.html`, currentUrl).href : href,
          sourceUrl: href, label
        })) }
        : { visitUnitId: `stage:${material.stageId}`, stageId: material.stageId, difficulty: null, phaseCount: material.parsedStage?.groups?.length ?? 0 },
      material
    });
  } catch (error) {
    return state(classifyFailure(error, readyState), { code: error?.code ?? 'PARSE_FAILED', message: error?.message ?? '表示中DOMを解析できません。' });
  }
}

export async function buildDokkanInfoStagePackage(eventMaterial, stageMaterial) {
  validateDokkanInfoMaterial(eventMaterial);
  validateDokkanInfoMaterial(stageMaterial);
  if (eventMaterial.pageKind !== 'event' || stageMaterial.pageKind !== 'stage'
      || eventMaterial.eventId !== stageMaterial.eventId
      || !eventMaterial.stageLinks.some((link) => link.href === stageMaterial.sourceUrl)) {
    const error = new Error('表示中stageが開始したeventの取得計画に含まれていません。');
    error.code = 'ONE_TAP_PLAN_MISMATCH';
    throw error;
  }
  return packagePages([eventMaterial, stageMaterial]);
}

export async function dokkanInfoStageFingerprint(stageMaterial) {
  validateDokkanInfoMaterial(stageMaterial);
  if (stageMaterial.pageKind !== 'stage') throw Object.assign(new Error('stage fingerprintにはstage材料が必要です。'), { code: 'DOKKANINFO_MATERIAL' });
  const stable = structuredClone(stageMaterial); delete stable.capturedAt;
  return (await describe(stableJson(stable))).digest;
}
