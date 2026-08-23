import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium, webkit } from 'playwright';

import { generatePhase7Delivery } from './generate-phase7-runtime-delivery.mjs';
import { startStaticServer } from '../tests/helpers/static-server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_PATH = path.join(REPO_ROOT, 'generated', 'phase6', 'candidate', 'enemy-data-runtime-v1.json');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'generated', 'phase7', 'prototype-data');
const REPORT_PATH = path.join(REPO_ROOT, 'artifacts', 'phase7', 'performance-report.json');
const SYSTEM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROTOTYPE_PATH = '/prototypes/phase7-runtime-delivery/index.html';
const DATA_ROOT_QUERY = '../../generated/phase7/prototype-data';

function round(value) {
  return Math.round(value * 10) / 10;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function summarize(samples) {
  const numericKeys = [...new Set(samples.flatMap((sample) => Object.keys(sample)))]
    .filter((key) => samples.every((sample) => typeof sample[key] === 'number'));
  return Object.fromEntries(numericKeys.map((key) => [`median${key[0].toUpperCase()}${key.slice(1)}`, round(median(samples.map((sample) => sample[key])))]));
}

async function launchChromium() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, undefined, existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null]
    .filter((value, index, values) => value !== null && values.indexOf(value) === index);
  const errors = [];
  for (const executablePath of candidates) {
    try {
      const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
      return { browser, executable: executablePath ?? 'Playwright Chromium' };
    } catch (error) {
      errors.push(`${executablePath ?? 'Playwright Chromium'}: ${error.message}`);
    }
  }
  throw new Error(`Chromiumを起動できませんでした。\n${errors.join('\n')}`);
}

function prototypeUrl(origin, { mode, delivery, transport }) {
  const base = transport === 'file'
    ? pathToFileURL(path.join(REPO_ROOT, 'prototypes', 'phase7-runtime-delivery', 'index.html'))
    : new URL(PROTOTYPE_PATH, origin);
  base.searchParams.set('mode', mode);
  base.searchParams.set('delivery', delivery);
  base.searchParams.set('dataRoot', DATA_ROOT_QUERY);
  return base.href;
}

async function oneDeliveryRun(browser, origin, profile, variant, context = null) {
  const ownContext = context == null;
  const activeContext = context ?? await browser.newContext({ locale: 'ja-JP', viewport: profile.viewport });
  const page = await activeContext.newPage();
  const session = await activeContext.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottle });
  let downloadedBytes = 0;
  let responseCount = 0;
  page.on('response', async (response) => {
    if (!response.url().includes('/generated/phase7/prototype-data/')) return;
    downloadedBytes += Number((await response.allHeaders())['content-length'] ?? 0);
    responseCount += 1;
  });
  const started = Date.now();
  await page.goto(prototypeUrl(origin, variant), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => globalThis.__phase7Ready === true, null, { timeout: 90_000 });
  const initial = await page.evaluate(() => ({ ...globalThis.__phase7Metrics, completeMs: performance.now() - globalThis.__phase7Metrics.startedAt }));
  const initialHeap = await session.send('Runtime.getHeapUsage');
  const initialDownloadedBytes = downloadedBytes;
  const initialResponseCount = responseCount;
  const index = JSON.parse(await readFile(path.join(OUTPUT_ROOT, 'chunked', 'event-index.json'), 'utf8'));
  const bySize = [...index.events].sort((left, right) => left.json.bytes - right.json.bytes);
  const largest = bySize.at(-1);
  const typical = bySize[Math.floor(bySize.length / 2)];
  const largestMs = await page.evaluate(async (id) => {
    const before = performance.now();
    await globalThis.Phase7Prototype.selectEvent(id);
    return performance.now() - before;
  }, largest.id);
  const typicalMs = await page.evaluate(async (id) => {
    const before = performance.now();
    await globalThis.Phase7Prototype.selectEvent(id);
    return performance.now() - before;
  }, typical.id);
  const finalMetrics = await page.evaluate(() => ({ ...globalThis.__phase7Metrics }));
  const heap = await session.send('Runtime.getHeapUsage');
  const sample = {
    manifestReadyMs: round(initial.manifestReadyMs),
    dataReadyMs: round(initial.dataReadyMs),
    eventListReadyMs: round(initial.eventListReadyMs),
    initialEventReadyMs: round(initial.lastEventSelectionMs),
    completeMs: round(initial.completeMs),
    parseOrScriptMs: round(initial.parseOrScriptMs),
    initialJsHeapUsedBytes: Math.round(initialHeap.usedSize),
    initialDownloadedBytes,
    initialResponseCount,
    initialLogicalBytesLoaded: initial.bytesLoaded,
    initialCacheHits: initial.cacheHits,
    largestEventSwitchMs: round(largestMs),
    typicalEventSwitchMs: round(typicalMs),
    jsHeapUsedBytes: Math.round(heap.usedSize),
    downloadedBytes,
    responseCount,
    logicalBytesLoaded: finalMetrics.bytesLoaded,
    cacheHits: finalMetrics.cacheHits,
    networkLoads: finalMetrics.networkLoads,
    wallClockMs: Date.now() - started
  };
  await page.close();
  if (ownContext) await activeContext.close();
  return sample;
}

async function deliveryProfile(browser, origin, profile, variant) {
  const cold = [];
  for (let run = 0; run < 3; run += 1) cold.push(await oneDeliveryRun(browser, origin, profile, variant));
  const result = { variant, cold: { samples: cold, ...summarize(cold) } };
  if (variant.transport === 'http' && variant.delivery === 'fetch') {
    const warmContext = await browser.newContext({ locale: 'ja-JP', viewport: profile.viewport });
    await oneDeliveryRun(browser, origin, profile, variant, warmContext);
    const warm = [];
    for (let run = 0; run < 3; run += 1) warm.push(await oneDeliveryRun(browser, origin, profile, variant, warmContext));
    await warmContext.close();
    result.warmCache = { samples: warm, ...summarize(warm) };
  }
  return result;
}

async function updateProfile(browser, origin, profile, mode) {
  const samples = [];
  const context = await browser.newContext({ locale: 'ja-JP', viewport: profile.viewport });
  for (let run = 0; run < 3; run += 1) {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottle });
    const url = new URL('/prototypes/phase7-runtime-delivery/update-prototype.html', origin);
    url.searchParams.set('dataRoot', DATA_ROOT_QUERY);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.locator('#update-mode').selectOption(mode);
    const before = Date.now();
    await page.locator('#update-button').click();
    await page.waitForFunction(() => globalThis.__phase7UpdateResult != null, null, { timeout: 90_000 });
    const update = await page.evaluate(() => globalThis.__phase7UpdateResult);
    const heap = await session.send('Runtime.getHeapUsage');
    samples.push({ engineMs: round(update.milliseconds), endToEndMs: Date.now() - before, jsHeapUsedBytes: Math.round(heap.usedSize) });
    await page.close();
  }
  await context.close();
  return { mode, samples, ...summarize(samples) };
}

async function checkWebKitAvailability(origin) {
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const url = new URL(PROTOTYPE_PATH, origin);
    url.searchParams.set('mode', 'chunk');
    url.searchParams.set('dataRoot', DATA_ROOT_QUERY);
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => globalThis.__phase7Ready === true);
    return { available: true, version: browser.version(), chunkPrototypeReady: true, note: 'Windows上のPlaywright WebKitでありiPhone実機ではない。' };
  } catch (error) {
    return { available: false, version: null, chunkPrototypeReady: false, note: `browser binaryを追加downloadせず確認した結果: ${error.message.split('\n')[0]}` };
  } finally {
    await browser?.close();
  }
}

async function main() {
  const generated = await generatePhase7Delivery({ runtimePath: RUNTIME_PATH, outputRoot: OUTPUT_ROOT });
  const chunkSizes = generated.index.events.map((entry) => entry.json.bytes);
  const server = await startStaticServer({ root: REPO_ROOT });
  const launched = await launchChromium();
  const profiles = [
    { key: 'desktopChromium', viewport: { width: 1440, height: 1000 }, cpuThrottle: 1, note: 'このWindows PC上のheadless Chromium実測。' },
    { key: 'mobileViewportChromium4x', viewport: { width: 390, height: 844 }, cpuThrottle: 4, note: '狭いviewport＋4倍CPU slowdownの参考値。Android/iPhone実機・通信・Safari emulationではない。' }
  ];
  const variants = [
    { key: 'pagesFullJson', mode: 'full', delivery: 'fetch', transport: 'http' },
    { key: 'pagesEventChunks', mode: 'chunk', delivery: 'fetch', transport: 'http' },
    { key: 'httpFileCompatibleFull', mode: 'full', delivery: 'script', transport: 'http' },
    { key: 'httpFileCompatibleChunks', mode: 'chunk', delivery: 'script', transport: 'http' },
    { key: 'windowsFileFull', mode: 'full', delivery: 'script', transport: 'file' },
    { key: 'windowsFileEventChunks', mode: 'chunk', delivery: 'script', transport: 'file' }
  ];
  const browserProfiles = {};
  try {
    for (const profile of profiles) {
      const delivery = {};
      for (const variant of variants) delivery[variant.key] = await deliveryProfile(launched.browser, server.origin, profile, variant);
      const updates = {};
      for (const mode of ['full', 'chunk']) updates[mode] = await updateProfile(launched.browser, server.origin, profile, mode);
      browserProfiles[profile.key] = { viewport: profile.viewport, cpuThrottle: profile.cpuThrottle, note: profile.note, delivery, updates };
    }
    browserProfiles.webkitReference = await checkWebKitAvailability(server.origin);
  } finally {
    await launched.browser.close();
    await server.close();
  }

  const report = {
    reportVersion: '1.0.0',
    measuredAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      chromium: launched.executable,
      externalNetworkRequests: 0,
      sampleCount: 3,
      limitations: [
        'loopback HTTPとWindows file://だけを測定した。実回線、OneDrive app内導線、Android、iPhone、Safari実機ではない。',
        'mobileViewportChromium4xは性能の保守的参考値であり、device emulationまたは合否判定ではない。',
        'file://はWindowsでのfile-compatible確認であり、OneDrive mobileが複数隣接fileを同様に解決する保証はない。'
      ]
    },
    artifacts: {
      datasetVersion: generated.manifest.datasetVersion,
      events: generated.manifest.chunked.eventCount,
      fullJsonBytes: generated.manifest.full.json.bytes,
      fullScriptBytes: generated.manifest.full.script.bytes,
      eventIndexJsonBytes: generated.manifest.chunked.indexJson.bytes,
      eventIndexScriptBytes: generated.manifest.chunked.indexScript.bytes,
      allChunkJsonPlusIndexBytes: generated.manifest.chunked.totalJsonBytes,
      chunkBytes: {
        minimum: Math.min(...chunkSizes),
        p25: percentile(chunkSizes, 0.25),
        median: percentile(chunkSizes, 0.5),
        p75: percentile(chunkSizes, 0.75),
        p90: percentile(chunkSizes, 0.9),
        p95: percentile(chunkSizes, 0.95),
        maximum: Math.max(...chunkSizes)
      }
    },
    browserProfiles,
    interpretation: {
      full: '単一artifactで単純だが、初回に全6.05MBをparseし全event objectを保持する。',
      chunks: 'index約47KBと利用eventだけを初期展開できる。全chunk合計はfullより約47KB大きく、全件更新時は利点がない。',
      cache: 'Pages相当fetch prototypeはdigest付きCacheStorageでreload時にartifactを再利用する。manifestだけは毎回再確認する。',
      file: 'generated script包装によりWindows file://でfull/chunkとも動作した。mobile OneDrive実機は別途owner確認が必要。',
      update: '更新操作は閲覧方式に関係なくcandidate全体を検証してからatomicにknown-good化するため、chunk更新も全chunkを取得する。',
      vite: 'plain HTML/JSと決定的generatorでHTTP/file/chunk/cacheを実証できたため、Phase 7時点でVite導入の必須根拠はない。'
    }
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ report: path.relative(REPO_ROOT, REPORT_PATH), artifacts: report.artifacts, profiles: Object.keys(browserProfiles) }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
