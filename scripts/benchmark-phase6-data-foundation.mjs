import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';
import { stableJson } from '../generated/phase6/runtime/data-migration/phase4-enemy-migration.js';
import { phase4OfflineAdapter } from '../generated/phase6/runtime/data-foundation/phase6-canonical.js';
import { projectCanonicalToRuntime } from '../generated/phase6/runtime/data-foundation/phase6-runtime.js';
import { startStaticServer } from '../tests/helpers/static-server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHASE4_PATH = path.join(REPO_ROOT, 'generated', 'phase4', 'candidate', 'enemy-data-v1.candidate.json');
const CANONICAL_PATH = path.join(REPO_ROOT, 'generated', 'phase6', 'candidate', 'enemy-data-v2.canonical.json');
const RUNTIME_PATH = path.join(REPO_ROOT, 'generated', 'phase6', 'candidate', 'enemy-data-runtime-v1.json');
const REPORT_PATH = path.join(REPO_ROOT, 'artifacts', 'phase6', 'performance-report.json');

function round(value) {
  return Math.round(value * 10) / 10;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function timedRead(filePath) {
  const start = performance.now();
  const text = await readFile(filePath, 'utf8');
  return { text, milliseconds: round(performance.now() - start) };
}

function timedParse(text, repetitions = 3) {
  const times = [];
  let last;
  for (let index = 0; index < repetitions; index += 1) {
    const start = performance.now();
    last = JSON.parse(text);
    times.push(performance.now() - start);
  }
  return { value: last, milliseconds: times.map(round), medianMilliseconds: round(median(times)) };
}

async function browserProfile(browser, origin, profile) {
  const context = await browser.newContext({ viewport: profile.viewport });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.dismiss());
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottle });
  await page.goto(`${origin}/dokkan_calc_final.html`, { waitUntil: 'domcontentloaded' });
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    samples.push(await page.evaluate(async (url) => {
      const fetchStart = performance.now();
      const response = await fetch(`${url}?sample=${Math.random()}`, { cache: 'no-store' });
      const text = await response.text();
      const fetchedAt = performance.now();
      const parsed = JSON.parse(text);
      const parsedAt = performance.now();
      return {
        fetchMilliseconds: fetchedAt - fetchStart,
        parseMilliseconds: parsedAt - fetchedAt,
        bytes: Number(response.headers.get('content-length')),
        events: parsed.events.length
      };
    }, `${origin}/generated/phase6/candidate/enemy-data-runtime-v1.json`));
  }
  await context.close();
  return {
    label: profile.label,
    viewport: profile.viewport,
    cpuThrottle: profile.cpuThrottle,
    note: profile.note,
    fetchMilliseconds: samples.map((sample) => round(sample.fetchMilliseconds)),
    parseMilliseconds: samples.map((sample) => round(sample.parseMilliseconds)),
    medianFetchMilliseconds: round(median(samples.map((sample) => sample.fetchMilliseconds))),
    medianParseMilliseconds: round(median(samples.map((sample) => sample.parseMilliseconds))),
    bytes: samples[0].bytes,
    events: samples[0].events
  };
}

async function checkFileFetch(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.dismiss());
  const fixtureUrl = pathToFileURL(path.join(REPO_ROOT, 'dokkan_calc_final.html')).href;
  const runtimeUrl = pathToFileURL(RUNTIME_PATH).href;
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async (url) => {
    try {
      const response = await fetch(url);
      return { succeeded: response.ok, status: response.status, error: null };
    } catch (error) {
      return { succeeded: false, status: null, error: String(error) };
    }
  }, runtimeUrl);
  await context.close();
  return result;
}

async function main() {
  global.gc?.();
  const phase4Read = await timedRead(PHASE4_PATH);
  const phase4Parse = timedParse(phase4Read.text, 1);
  const mappingStart = performance.now();
  const adapted = phase4OfflineAdapter.adapt(phase4Parse.value, {
    inputPath: 'generated/phase4/candidate/enemy-data-v1.candidate.json',
    inputDigest: 'measured-existing-generated-fixture',
    inputBytes: Buffer.byteLength(phase4Read.text),
    reproducibleBy: 'npm run benchmark:phase6'
  });
  const mappingMilliseconds = round(performance.now() - mappingStart);
  const projectionStart = performance.now();
  const projection = projectCanonicalToRuntime(adapted.canonical);
  const projectionMilliseconds = round(performance.now() - projectionStart);
  const canonicalStringifyStart = performance.now();
  stableJson(adapted.canonical);
  const canonicalStringifyMilliseconds = round(performance.now() - canonicalStringifyStart);
  const runtimeStringifyStart = performance.now();
  stableJson(projection.runtime);
  const runtimeStringifyMilliseconds = round(performance.now() - runtimeStringifyStart);

  const [canonicalRead, runtimeRead] = await Promise.all([timedRead(CANONICAL_PATH), timedRead(RUNTIME_PATH)]);
  const canonicalParse = timedParse(canonicalRead.text);
  const runtimeParse = timedParse(runtimeRead.text);
  const gzip = {
    canonicalBytes: gzipSync(canonicalRead.text, { level: 9 }).byteLength,
    runtimeBytes: gzipSync(runtimeRead.text, { level: 9 }).byteLength,
    canonicalMinifiedBytes: Buffer.byteLength(JSON.stringify(canonicalParse.value)),
    runtimeMinifiedBytes: Buffer.byteLength(JSON.stringify(runtimeParse.value)),
    canonicalMinifiedGzipBytes: gzipSync(JSON.stringify(canonicalParse.value), { level: 9 }).byteLength,
    runtimeMinifiedGzipBytes: gzipSync(JSON.stringify(runtimeParse.value), { level: 9 }).byteLength
  };
  canonicalParse.value = null;
  runtimeParse.value = null;
  global.gc?.();

  const server = await startStaticServer({ root: REPO_ROOT });
  const browser = await chromium.launch({ headless: true });
  let browserProfiles;
  let fileFetch;
  try {
    browserProfiles = [];
    for (const profile of [
      { label: 'Windows-PC-Chromium', viewport: { width: 1280, height: 900 }, cpuThrottle: 1, note: 'このPC上のheadless Chromium実測。' },
      { label: 'conservative-mobile-Chromium-4x', viewport: { width: 390, height: 844 }, cpuThrottle: 4, note: 'Android/iPhone実機ではなく、狭いviewportと4倍CPU slowdownによる参考値。Safari性能・端末memoryは未検証。' }
    ]) browserProfiles.push(await browserProfile(browser, server.origin, profile));
    fileFetch = await checkFileFetch(browser);
  } finally {
    await browser.close();
    await server.close();
  }

  const report = {
    reportVersion: '1.0.0',
    measuredAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      browser: 'bundled Playwright Chromium',
      externalNetworkRequests: 0,
      note: 'loopback static serverと既存offline生成物だけを使用。real Android/iPhone/Safariは未測定。'
    },
    bytes: {
      phase4Candidate: Buffer.byteLength(phase4Read.text),
      canonical: Buffer.byteLength(canonicalRead.text),
      runtime: Buffer.byteLength(runtimeRead.text),
      canonicalMinified: gzip.canonicalMinifiedBytes,
      runtimeMinified: gzip.runtimeMinifiedBytes,
      canonicalGzip: gzip.canonicalBytes,
      runtimeGzip: gzip.runtimeBytes,
      canonicalMinifiedGzip: gzip.canonicalMinifiedGzipBytes,
      runtimeMinifiedGzip: gzip.runtimeMinifiedGzipBytes
    },
    offlineGenerationMilliseconds: {
      readPhase4: phase4Read.milliseconds,
      parsePhase4: phase4Parse.medianMilliseconds,
      adaptToCanonical: mappingMilliseconds,
      projectRuntime: projectionMilliseconds,
      stableStringifyCanonical: canonicalStringifyMilliseconds,
      stableStringifyRuntime: runtimeStringifyMilliseconds
    },
    nodeParse: {
      canonical: { readMilliseconds: canonicalRead.milliseconds, samples: canonicalParse.milliseconds, medianMilliseconds: canonicalParse.medianMilliseconds },
      runtime: { readMilliseconds: runtimeRead.milliseconds, samples: runtimeParse.milliseconds, medianMilliseconds: runtimeParse.medianMilliseconds }
    },
    pagesLikeBrowser: browserProfiles,
    fileExternalJsonFetch: {
      ...fileFetch,
      implication: 'file://で外部JSON fetchを必須にしない。将来OneDrive/local HTMLを維持する場合は、同梱script data chunkまたは別のfile-compatible包装を実機検証する。'
    },
    assessment: {
      fullCanonicalForBrowser: '不採用。監査・CI側に保持する正本候補。',
      fullRuntimeForMobile: 'minify時は約6MBだが、展開後object memoryと実機Safari/Androidが未検証。full版も比較対象に残しつつ、event indexと必要event単位chunkをPhase 7推奨候補とする。',
      pages: 'HTTP fetch自体は可能だが、転送量・parse・memoryを減らすchunk設計が必要。',
      fileAndOneDrive: '外部JSON fetch依存は互換性リスク。現在の単一HTML利用を変更せず、将来script chunk方式を実機比較する。'
    }
  };
  await writeFile(REPORT_PATH, stableJson(report), 'utf8');
  process.stdout.write(stableJson(report));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
