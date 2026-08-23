(function phase7Prototype(root) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') === 'chunk' ? 'chunk' : 'full';
  const delivery = params.get('delivery') === 'script' || location.protocol === 'file:' ? 'script' : 'fetch';
  const dataRoot = params.get('dataRoot') || '../../generated/phase7/prototype-data';
  const metrics = root.__phase7Metrics = {
    mode, delivery, startedAt: performance.now(), bytesLoaded: 0, cacheHits: 0, networkLoads: 0,
    manifestReadyMs: null, dataReadyMs: null, eventListReadyMs: null, lastEventSelectionMs: null,
    lastEnemyRenderMs: null, selectedEventBytes: 0
  };
  const state = { manifest: null, runtime: null, index: null, event: null };
  const eventSelect = document.querySelector('#event-select');
  const stageSelect = document.querySelector('#stage-select');
  const enemySelect = document.querySelector('#enemy-select');
  const status = document.querySelector('#load-status');
  const metricSummary = document.querySelector('#metrics-summary');

  function dataUrl(relativePath) {
    return new URL(`${dataRoot.replace(/\/$/, '')}/${relativePath}`, location.href).href;
  }

  function loadScript(relativePath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = dataUrl(relativePath);
      script.onload = resolve;
      script.onerror = () => reject(new Error(`script load failed: ${relativePath}`));
      document.head.append(script);
    });
  }

  async function cachedText(relativePath, digest) {
    const url = dataUrl(relativePath);
    const cacheKey = `${url}?phase7Digest=${encodeURIComponent(digest || 'manifest')}`;
    if ('caches' in root && digest) {
      const cache = await caches.open('phase7-prototype-assets-v1');
      const cached = await cache.match(cacheKey);
      if (cached) {
        metrics.cacheHits += 1;
        return cached.text();
      }
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status} ${relativePath}`);
      const text = await response.text();
      await cache.put(cacheKey, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
      metrics.networkLoads += 1;
      return text;
    }
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${relativePath}`);
    metrics.networkLoads += 1;
    return response.text();
  }

  function known(field, fallback = '—') {
    return field && field.state === 'known' ? field.value : fallback;
  }

  function updateMetrics() {
    metricSummary.textContent = `方式: ${mode}/${delivery}・読込 ${metrics.bytesLoaded.toLocaleString()} bytes・cache hit ${metrics.cacheHits}`;
  }

  async function loadManifest() {
    if (delivery === 'script') {
      await loadScript('delivery-manifest.data.js');
      state.manifest = root.__DOKKAN_PHASE7_DELIVERY_MANIFEST__;
    } else {
      state.manifest = JSON.parse(await cachedText('delivery-manifest.json'));
    }
    metrics.manifestReadyMs = performance.now() - metrics.startedAt;
  }

  async function loadInitialData() {
    if (mode === 'full') {
      const descriptor = delivery === 'script' ? state.manifest.full.script : state.manifest.full.json;
      const before = performance.now();
      if (delivery === 'script') {
        await loadScript(descriptor.path);
        state.runtime = root.__DOKKAN_PHASE7_FULL_RUNTIME__;
      } else state.runtime = JSON.parse(await cachedText(descriptor.path, descriptor.digest));
      metrics.parseOrScriptMs = performance.now() - before;
      metrics.bytesLoaded += descriptor.bytes;
    } else {
      const descriptor = delivery === 'script' ? state.manifest.chunked.indexScript : state.manifest.chunked.indexJson;
      const before = performance.now();
      if (delivery === 'script') {
        await loadScript(descriptor.path);
        state.index = root.__DOKKAN_PHASE7_EVENT_INDEX__;
      } else state.index = JSON.parse(await cachedText(descriptor.path, descriptor.digest));
      metrics.parseOrScriptMs = performance.now() - before;
      metrics.bytesLoaded += descriptor.bytes;
    }
    metrics.dataReadyMs = performance.now() - metrics.startedAt;
  }

  function eventsForList() {
    return mode === 'full'
      ? state.runtime.events.map((event) => ({ id: event.id, name: known(event.name, event.id), event }))
      : state.index.events;
  }

  function populateEventList() {
    eventSelect.replaceChildren(...eventsForList().map((event) => new Option(event.name, event.id)));
    eventSelect.disabled = eventSelect.options.length === 0;
    metrics.eventListReadyMs = performance.now() - metrics.startedAt;
  }

  async function eventById(id) {
    if (mode === 'full') return state.runtime.events.find((event) => event.id === id);
    const entry = state.index.events.find((event) => event.id === id);
    if (!entry) throw new Error(`event not found: ${id}`);
    if (root.__DOKKAN_PHASE7_EVENT_CHUNKS__?.[id]) return root.__DOKKAN_PHASE7_EVENT_CHUNKS__[id];
    const descriptor = delivery === 'script' ? entry.script : entry.json;
    const started = performance.now();
    let event;
    if (delivery === 'script') {
      await loadScript(descriptor.path);
      event = root.__DOKKAN_PHASE7_EVENT_CHUNKS__[id];
    } else event = JSON.parse(await cachedText(descriptor.path, descriptor.digest));
    metrics.lastChunkLoadMs = performance.now() - started;
    metrics.bytesLoaded += descriptor.bytes;
    metrics.selectedEventBytes = descriptor.bytes;
    return event;
  }

  function populateStages(event) {
    state.event = event;
    stageSelect.replaceChildren(...event.stages.map((stage, index) => new Option(known(stage.name, stage.id), String(index))));
    stageSelect.disabled = stageSelect.options.length === 0;
    populateEnemies();
  }

  function currentStage() {
    return state.event?.stages[Number(stageSelect.value)] || null;
  }

  function enemiesInStage(stage) {
    return stage ? stage.encounters.flatMap((encounter) => encounter.enemies) : [];
  }

  function populateEnemies() {
    const enemies = enemiesInStage(currentStage());
    enemySelect.replaceChildren(...enemies.map((enemy, index) => new Option(known(enemy.name, enemy.id), String(index))));
    enemySelect.disabled = enemySelect.options.length === 0;
    renderEnemy();
  }

  function currentEnemy() {
    return enemiesInStage(currentStage())[Number(enemySelect.value)] || null;
  }

  function renderEnemy() {
    const before = performance.now();
    const enemy = currentEnemy();
    document.querySelector('#enemy-name').textContent = enemy ? known(enemy.name, enemy.id) : '敵がありません';
    document.querySelector('#enemy-attribute').textContent = enemy ? `${known(enemy.alignment, '?')} / ${known(enemy.type, '?')}` : '—';
    document.querySelector('#enemy-attack').textContent = enemy ? Number(known(enemy.baseAttack, 0)).toLocaleString() : '—';
    const attack = enemy?.superAttacks?.[0];
    document.querySelector('#enemy-super').textContent = attack ? `${known(attack.name, '名称不明')} / ${Number(known(attack.displayedDamage, 0)).toLocaleString()}` : '表示なし';
    metrics.lastEnemyRenderMs = performance.now() - before;
  }

  async function selectEvent(id) {
    const before = performance.now();
    const event = await eventById(id);
    populateStages(event);
    metrics.lastEventSelectionMs = performance.now() - before;
    updateMetrics();
    root.dispatchEvent(new CustomEvent('phase7-event-ready', { detail: { eventId: id, milliseconds: metrics.lastEventSelectionMs } }));
    return event;
  }

  function calculate() {
    const enemy = currentEnemy();
    if (!enemy) return;
    const calculation = root.DokkanCalcCore.calculateDurability({
      char_def: document.querySelector('#character-defense').value,
      own_class: 'super', own_type: 'teq',
      enemy_class: known(enemy.alignment, 'extreme') === 'neutral' ? 'extreme' : known(enemy.alignment, 'extreme'),
      enemy_type: known(enemy.type, 'teq')
    });
    const range = root.DokkanCalcCore.calculateDamageRange(known(enemy.baseAttack, 0), calculation);
    document.querySelector('#damage-result').textContent = root.DokkanCalcCore.formatDamageRange(range);
  }

  async function initialize() {
    try {
      document.querySelector('#mode-description').textContent = `${mode === 'full' ? '全event一括' : 'event index＋選択chunk'} / ${delivery === 'fetch' ? 'Pages相当HTTP JSON' : 'file-compatible generated JS'}`;
      await loadManifest();
      await loadInitialData();
      populateEventList();
      if (eventSelect.value) await selectEvent(eventSelect.value);
      status.textContent = 'runtime準備完了';
      updateMetrics();
      root.__phase7Ready = true;
      root.dispatchEvent(new CustomEvent('phase7-ready', { detail: metrics }));
    } catch (error) {
      status.textContent = `読み込み失敗: ${error.message}`;
      root.__phase7Error = String(error.stack || error);
    }
  }

  eventSelect.addEventListener('change', () => selectEvent(eventSelect.value));
  stageSelect.addEventListener('change', populateEnemies);
  enemySelect.addEventListener('change', renderEnemy);
  document.querySelector('#calculate-button').addEventListener('click', calculate);
  root.Phase7Prototype = { metrics, state, selectEvent, currentEnemy, calculate };
  initialize();
})(globalThis);
