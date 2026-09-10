/** Source-neutral minimum session coordinator. No URL parsing or network I/O. */
import { describe } from './phase11-intake.mjs';
import { stableJson } from '../data-migration/phase4-enemy-migration.ts';

export const ONE_TAP_SESSION_VERSION = 'phase11-one-tap-session-1';

const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const clone = (value) => value == null ? value : structuredClone(value);

export async function makeOneTapBatch({ batchId, eventId, packages }) {
  const core = { version: 'phase11-one-tap-batch-1', batchId, sourceKey: packages[0]?.canonical?.sourceSnapshots?.[0]?.sourceKey ?? null, eventId, packages };
  return { ...core, digest: (await describe(stableJson(core))).digest };
}

export class MemorySessionBackend {
  constructor(value = null) { this.value = clone(value); this.failWrites = false; }
  async read() { return clone(this.value); }
  async write(value) { if (this.failWrites) fail('DRAFT_SAVE_FAILED', '端末へのdraft保存に失敗しました。'); this.value = clone(value); }
}

export class WebExtensionSessionBackend {
  constructor(storageArea, key = 'phase11-one-tap-session-v1') { this.storageArea = storageArea; this.key = key; }
  async read() { return (await this.storageArea.get(this.key))[this.key] ?? null; }
  async write(value) { await this.storageArea.set({ [this.key]: value }); }
}

function validatePlan(plan) {
  if (!Array.isArray(plan) || !plan.length || plan.length > 20) fail('PLAN_INVALID', 'prototypeで扱える訪問計画は1～20stageです。');
  const ids = new Set(); const urls = new Set();
  for (const unit of plan) {
    if (!unit?.id || unit.kind !== 'stage-page' || !unit.url || ids.has(unit.id) || urls.has(unit.url)) fail('PLAN_INVALID', 'eventの訪問対象に重複または不正な項目があります。');
    ids.add(unit.id); urls.add(unit.url);
  }
}

export class OneTapSessionCoordinator {
  constructor(backend) { this.backend = backend; }

  async load() {
    const value = await this.backend.read();
    if (!value) return null;
    if (value.version !== ONE_TAP_SESSION_VERSION || !value.sessionId || !value.eventId || !value.writerId || !Number.isSafeInteger(value.revision)) fail('SESSION_VERSION', '保存済みsessionはこのprototypeと互換性がありません。再開始してください。');
    validatePlan(value.plan);
    if (Object.values(value.completed ?? {}).some((entry) => !entry?.digest || !entry?.fingerprint || !entry?.package)) fail('SESSION_VERSION', '保存済みdraftはこのprototypeと互換性がありません。再開始してください。');
    return value;
  }

  async persist(next) {
    await this.backend.write(next);
    const verified = await this.backend.read();
    if (stableJson(verified) !== stableJson(next)) fail('DRAFT_SAVE_VERIFY_FAILED', 'draft保存後の確認に失敗しました。');
    return verified;
  }

  async start({ eventMaterial, plan, writerId, adapterVersion }) {
    if (!eventMaterial?.eventId || eventMaterial.pageKind !== 'event') fail('EVENT_INVALID', '開始eventを確認できません。');
    validatePlan(plan);
    if (!writerId) fail('WRITER_INVALID', '書き込み担当タブを確認できません。');
    return this.persist({
      version: ONE_TAP_SESSION_VERSION,
      sessionId: crypto.randomUUID(),
      adapterVersion,
      eventId: eventMaterial.eventId,
      eventName: eventMaterial.eventName,
      eventMaterial,
      plan: clone(plan),
      currentIndex: 0,
      completed: {},
      failures: {},
      writerId: String(writerId),
      writerGeneration: 1,
      revision: 1,
      status: 'collecting',
      sentBatches: {}
    });
  }

  async takeOver(writerId) {
    const current = await this.load();
    if (!current) fail('NO_SESSION', '再開できるsessionがありません。');
    const next = { ...current, writerId: String(writerId), writerGeneration: current.writerGeneration + 1, revision: current.revision + 1 };
    return this.persist(next);
  }

  async beginCapture({ writerId, currentUrl, adapterVersion = null }) {
    const current = await this.load();
    if (!current) fail('NO_SESSION', '開始済みeventがありません。');
    if (adapterVersion && current.adapterVersion !== adapterVersion) fail('ADAPTER_VERSION', 'adapter版が変わったため、このsessionは再開始してください。');
    if (String(writerId) !== current.writerId) fail('WRITER_MISMATCH', 'このタブは書き込み担当ではありません。明示的に担当を引き継いでください。');
    const unit = current.plan.find((entry) => entry.url === currentUrl);
    if (!unit) fail('EVENT_MISMATCH', '表示中ページは現在eventの訪問計画に含まれていません。');
    return {
      sessionId: current.sessionId,
      eventId: current.eventId,
      unitId: unit.id,
      unitUrl: unit.url,
      revision: current.revision,
      writerId: current.writerId,
      writerGeneration: current.writerGeneration,
      eventMaterial: clone(current.eventMaterial)
    };
  }

  async commitCapture(ticket, pack, fingerprint = pack.digest) {
    const current = await this.load();
    if (!current || current.sessionId !== ticket.sessionId || current.eventId !== ticket.eventId
        || current.revision !== ticket.revision || current.writerId !== ticket.writerId
        || current.writerGeneration !== ticket.writerGeneration) {
      fail('STALE_CAPTURE', '古い解析結果は現在sessionへ保存しませんでした。');
    }
    const unit = current.plan.find((entry) => entry.id === ticket.unitId);
    if (!unit || unit.url !== ticket.unitUrl) fail('STALE_CAPTURE', '解析対象が現在の取得計画と一致しません。');
    const previous = current.completed[unit.id];
    if (previous && previous.fingerprint !== fingerprint) fail('CAPTURE_CHANGED', '同じstageの内容が以前のdraftと異なります。確認が必要なため停止しました。');
    if (previous) return { session: current, duplicate: true, readyForNext: true };
    const completed = { ...current.completed, [unit.id]: { digest: pack.digest, fingerprint, package: pack, savedAt: new Date().toISOString() } };
    const firstIncomplete = current.plan.findIndex((entry) => !completed[entry.id]);
    const next = {
      ...current,
      completed,
      currentIndex: firstIncomplete < 0 ? current.plan.length : firstIncomplete,
      revision: current.revision + 1,
      status: firstIncomplete < 0 ? 'ready-for-review' : 'collecting'
    };
    const verified = await this.persist(next);
    return { session: verified, duplicate: false, readyForNext: true };
  }

  async recordFailure(ticket, error) {
    const current = await this.load();
    if (!current || current.sessionId !== ticket.sessionId || current.revision !== ticket.revision) fail('STALE_CAPTURE', '古い解析失敗は現在sessionへ記録しませんでした。');
    const next = { ...current, failures: { ...current.failures, [ticket.unitId]: { code: error?.code ?? 'CAPTURE_FAILED', message: error?.message ?? '解析に失敗しました。' } }, revision: current.revision + 1 };
    return this.persist(next);
  }

  async nextNavigation({ writerId, currentUrl }) {
    const current = await this.load();
    if (!current || String(writerId) !== current.writerId) fail('WRITER_MISMATCH', 'このタブからは次へ進めません。');
    const currentUnit = current.plan.find((entry) => entry.url === currentUrl);
    if (!currentUnit || !current.completed[currentUnit.id]) fail('NOT_READY', 'validationとdraft永続保存が完了するまで次へ進めません。');
    const index = current.plan.findIndex((entry) => entry.id === currentUnit.id);
    if (index < current.plan.length - 1) return { kind: 'navigate', url: current.plan[index + 1].url };
    if (Object.keys(current.completed).length !== current.plan.length) fail('NOT_READY', '未取得stageが残っています。');
    return { kind: 'review' };
  }

  async createBatch() {
    const current = await this.load();
    if (!current || current.status !== 'ready-for-review' || Object.keys(current.completed).length !== current.plan.length) fail('BATCH_NOT_READY', 'event全体の取得が完了していません。');
    const packages = current.plan.map((unit) => current.completed[unit.id].package);
    return makeOneTapBatch({ batchId: current.sessionId, eventId: current.eventId, packages });
  }

  async markSent(batch) {
    const current = await this.load();
    if (!current || current.sessionId !== batch.batchId) fail('BATCH_SESSION', '送信batchと現在sessionが一致しません。');
    const prior = current.sentBatches[batch.batchId];
    if (prior && prior.digest !== batch.digest) fail('BATCH_CONFLICT', '同じbatch IDの内容が変わっています。');
    return this.persist({ ...current, sentBatches: { ...current.sentBatches, [batch.batchId]: { digest: batch.digest, sentAt: prior?.sentAt ?? new Date().toISOString() } }, revision: current.revision + 1 });
  }

  async discard() { await this.backend.write(null); return null; }
}
