import { liveGatePlan, assertLiveGateMeaning } from './live-gate-policy.mjs';
import { OneTapSessionCoordinator, WebExtensionSessionBackend } from '../../src/prototype/phase11-one-tap-session.mjs';

const coordinator = new OneTapSessionCoordinator(new WebExtensionSessionBackend(browser.storage.local));
const OUTBOUND_KEY = 'phase11-one-tap-outbound-v1';
const senderId = (sender) => sender.tab?.id == null ? 'extension-page' : `tab:${sender.tab.id}`;

browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    let value;
    switch (message?.type) {
      case 'session:get': value = await coordinator.load(); break;
      case 'session:start': {
        if (await coordinator.load()) throw new Error('この限定検証は開始済みです。元のstageタブで再開してください。');
        const plan = liveGatePlan(message.eventMaterial, message.plan);
        if (JSON.stringify(plan) !== JSON.stringify(message.plan)) throw new Error('限定検証は先頭3stageまでです。');
        value = await coordinator.start({
          eventMaterial: message.eventMaterial,
          plan: message.plan,
          writerId: senderId(sender),
          adapterVersion: message.adapterVersion
        });
        break;
      }
      case 'session:take-over': value = await coordinator.takeOver(senderId(sender)); break;
      case 'capture:begin': value = await coordinator.beginCapture({ writerId: senderId(sender), currentUrl: message.currentUrl, adapterVersion: message.adapterVersion }); break;
      case 'capture:commit': assertLiveGateMeaning(message.package); value = await coordinator.commitCapture(message.ticket, message.package, message.fingerprint); break;
      case 'capture:failure': value = await coordinator.recordFailure(message.ticket, message.error); break;
      case 'navigation:next': value = await coordinator.nextNavigation({ writerId: senderId(sender), currentUrl: message.currentUrl }); break;
      case 'batch:send': {
        const batch = await coordinator.createBatch();
        await coordinator.markSent(batch);
        await browser.storage.local.set({ [OUTBOUND_KEY]: batch });
        await browser.tabs.create({ url: browser.runtime.getURL('review.html') });
        value = { batchId: batch.batchId, digest: batch.digest };
        break;
      }
      case 'batch:get': value = (await browser.storage.local.get(OUTBOUND_KEY))[OUTBOUND_KEY] ?? null; break;

      default: throw Object.assign(new Error('未対応のprototype操作です。'), { code: 'MESSAGE_UNSUPPORTED' });
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: { code: error?.code ?? 'PROTOTYPE_ERROR', message: error?.message ?? 'prototype処理に失敗しました。' } };
  }
});
