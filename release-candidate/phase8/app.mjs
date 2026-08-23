import { Phase8ReleaseStore } from '../../src/release-candidate/phase8-release-store.mjs';
import { Phase8RuntimeClient } from '../../src/release-candidate/phase8-runtime-client.mjs';
import { readLastEvent, saveLastEvent } from '../../src/release-candidate/phase8-selection-state.mjs';

const params = new URLSearchParams(location.search);
const dataRoot = params.get('dataRoot') || './data';
const storagePrefix = 'dokkan_phase8_rc_imported_';
const core = globalThis.DokkanCalcCore;
const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
const store = new Phase8ReleaseStore({ dbName: params.get('dbName') || 'dokkan-phase8-rc-releases-v1' });
const clientOptions = { dataRoot, store };
if (globalThis.__phase8EmbeddedFetch) {
  clientOptions.fetchImpl = globalThis.__phase8EmbeddedFetch;
  clientOptions.cacheStorage = null;
}
const client = new Phase8RuntimeClient(clientOptions);
const state = { event: null };
const metrics = globalThis.__phase8Metrics = { startedAt: performance.now(), readyMs: null, lastEventMs: null };

function known(field, fallback = '—') {
  return field?.state === 'known' ? field.value : fallback;
}

function setStatus(message, error = false) {
  elements['app-status'].textContent = message;
  elements['app-status'].classList.toggle('error', error);
}

function replaceOptions(select, items, placeholder) {
  select.replaceChildren(new Option(placeholder, ''), ...items.map((item) => new Option(item.label, item.value)));
  select.disabled = items.length === 0;
}

function resetEnemySelection(message = 'イベントを選択してください') {
  state.event = null;
  replaceOptions(elements['stage-select'], [], '—');
  replaceOptions(elements['enemy-select'], [], '—');
  replaceOptions(elements['attack-select'], [], '—');
  elements['enemy-name'].textContent = message;
  elements['enemy-details'].textContent = '選んだイベントだけを読み込みます。';
  elements['calculate-button'].disabled = true;
}

function allEnemies(stage) {
  return stage?.encounters.flatMap((encounter) => encounter.enemies) ?? [];
}

function currentStage() {
  return state.event?.stages.find((stage) => stage.id === elements['stage-select'].value) ?? null;
}

function currentEnemy() {
  return allEnemies(currentStage()).find((enemy) => enemy.id === elements['enemy-select'].value) ?? null;
}

function renderAttackOptions() {
  const enemy = currentEnemy();
  if (!enemy) {
    replaceOptions(elements['attack-select'], [], '—');
    elements['calculate-button'].disabled = true;
    return;
  }
  const attacks = [{ value: 'normal', label: '通常攻撃 ' + Number(known(enemy.baseAttack, 0)).toLocaleString() }];
  enemy.superAttacks.forEach((attack) => attacks.push({ value: attack.id, label: known(attack.name, '必殺技') + ' ' + Number(known(attack.displayedDamage, 0)).toLocaleString() }));
  replaceOptions(elements['attack-select'], attacks, '攻撃を選択');
  elements['attack-select'].value = attacks[0].value;
  elements['enemy-name'].textContent = known(enemy.name, enemy.id);
  elements['enemy-details'].textContent = known(enemy.alignment, '不明') + ' / ' + known(enemy.type, '不明') + '・基礎ATK ' + Number(known(enemy.baseAttack, 0)).toLocaleString();
  elements['calculate-button'].disabled = false;
}

function renderEnemies() {
  const enemies = allEnemies(currentStage());
  replaceOptions(elements['enemy-select'], enemies.map((enemy) => ({ value: enemy.id, label: known(enemy.name, enemy.id) })), '敵を選択');
  if (enemies.length > 0) {
    elements['enemy-select'].value = enemies[0].id;
    renderAttackOptions();
  }
}

function renderStages() {
  const stages = state.event?.stages ?? [];
  replaceOptions(elements['stage-select'], stages.map((stage) => ({ value: stage.id, label: known(stage.name, stage.id) })), 'ステージを選択');
  if (stages.length > 0) {
    elements['stage-select'].value = stages[0].id;
    renderEnemies();
  }
}

async function selectEvent(eventId, { persist = true } = {}) {
  const started = performance.now();
  if (!eventId) {
    resetEnemySelection();
    return false;
  }
  setStatus('選んだイベントを読み込んでいます…');
  try {
    const event = await client.event(eventId);
    if (!event) {
      resetEnemySelection('このイベントは現在のデータにありません');
      elements['event-select'].value = '';
      setStatus('イベントを選び直してください。');
      return false;
    }
    state.event = event;
    elements['event-select'].value = eventId;
    renderStages();
    if (persist) saveLastEvent(localStorage, eventId, client.manifest.datasetVersion);
    metrics.lastEventMs = performance.now() - started;
    setStatus('準備完了');
    globalThis.dispatchEvent(new CustomEvent('phase8-event-ready', { detail: { eventId } }));
    return true;
  } catch {
    resetEnemySelection('イベントを読み込めませんでした');
    setStatus('イベントを読み込めませんでした。現在のデータは変更されていません。', true);
    return false;
  }
}

function calculationInput(enemy) {
  const ownClass = elements['own-class'].value;
  const enemyAlignment = known(enemy.alignment, ownClass);
  return {
    char_def: elements['char-def'].value, leader: elements.leader.value, passive: elements.passive.value,
    multi_passive: elements['multi-passive'].value, memory: elements.memory.value, link: elements.link.value,
    super_attack: elements['super-attack'].value, field: elements.field.value, active: elements.active.value,
    support_item: elements['support-item'].value, dr_input: elements['damage-reduction'].value,
    is_guard: elements.guard.checked, attr_def_up: elements['attribute-defense'].value,
    own_class: ownClass, own_type: elements['own-type'].value,
    enemy_class: enemyAlignment === 'neutral' ? ownClass : enemyAlignment,
    enemy_type: known(enemy.type, elements['own-type'].value)
  };
}

function selectedAttackValue(enemy) {
  if (elements['attack-select'].value === 'normal') return Number(known(enemy.baseAttack, 0));
  const attack = enemy.superAttacks.find((item) => item.id === elements['attack-select'].value);
  return Number(known(attack?.displayedDamage, 0));
}

function calculate() {
  const enemy = currentEnemy();
  if (!enemy) return;
  const calculation = core.calculateDurability(calculationInput(enemy));
  const attack = selectedAttackValue(enemy);
  const range = core.calculateDamageRange(attack, calculation);
  elements['final-defense'].textContent = Math.floor(calculation.final_def).toLocaleString();
  elements['damage-result'].textContent = core.formatDamageRange(range);
  elements['perfect-defense'].textContent = core.formatDurabilityLimit(core.calculateSafeDurabilityLine(0, calculation));
}

function updateMessage(result) {
  if (result.status === 'applied') return { text: '敵データを更新しました。', error: false };
  if (result.status === 'unchanged') return { text: 'すでに最新です。', error: false };
  const reasons = {
    INCOMPATIBLE_APP_VERSION: 'この確認版とは互換性がありません。',
    STALE_DATASET: '現在より古いデータでした。',
    SAFETY_GATE_REJECTED: 'データ件数に大きな異常がありました。',
    RUNTIME_SCHEMA_INVALID: 'データの形式に問題がありました。',
    HEALTH_CHECK_FAILED: '適用後の確認に失敗したため元に戻しました。',
    ATOMIC_APPLY_FAILED: '適用途中で問題が起きたため元に戻しました。',
    FULL_RUNTIME_MISSING: '更新データを取得できませんでした。',
    FULL_RUNTIME_SIZE_MISMATCH: '取得した更新データが壊れていました。',
    FULL_RUNTIME_DIGEST_MISMATCH: '取得した更新データが壊れていました。'
  };
  return { text: '更新しませんでした。現在の敵データはそのまま安全に使えます。' + (reasons[result.code] ?? '取得または検査に失敗しました。'), error: true };
}

async function updateData() {
  elements['update-button'].disabled = true;
  elements['update-status'].textContent = '更新を確認しています…';
  elements['update-status'].classList.remove('error');
  try {
    const previousEvent = elements['event-select'].value;
    const result = await client.update();
    const message = updateMessage(result);
    elements['update-status'].textContent = message.text;
    elements['update-status'].classList.toggle('error', message.error);
    elements['data-version'].textContent = 'データ版: ' + client.store.active.datasetVersion;
    if (result.status === 'applied') {
      populateEvents();
      if (previousEvent && client.index.events.some((entry) => entry.id === previousEvent)) await selectEvent(previousEvent);
      else resetEnemySelection('イベントを選択してください');
    }
  } catch {
    elements['update-status'].textContent = '更新しませんでした。現在の敵データはそのまま安全に使えます。';
    elements['update-status'].classList.add('error');
  } finally {
    elements['update-button'].disabled = false;
  }
}

function populateEvents() {
  replaceOptions(elements['event-select'], client.index.events.map((entry) => ({ value: entry.id, label: entry.name })), 'イベントを選択してください');
}

function savedDataSummary() {
  try {
    const raw = localStorage.getItem(storagePrefix + 'dokkan_calc_data_v22');
    if (!raw) return;
    const saved = JSON.parse(raw);
    elements['saved-data-summary'].textContent = '移行済み: 保存キャラクター ' + (saved.savedCharacters?.length ?? 0) + '件、保存した敵 ' + (saved.savedEnemies?.length ?? 0) + '分類、作業中の状況 ' + (saved.currentScenarios?.length ?? 0) + '件';
    if (saved.theme === 'dark' && localStorage.getItem('dokkan_phase8_rc_theme') == null) setTheme('dark');
  } catch {
    elements['saved-data-summary'].textContent = '移行済みデータを確認できませんでした。元の保存データは変更していません。';
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  elements['theme-button'].textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('dokkan_phase8_rc_theme', theme);
}

async function initialize() {
  if (!core) throw new Error('計算コアを読み込めませんでした。');
  setTheme(localStorage.getItem('dokkan_phase8_rc_theme') === 'dark' ? 'dark' : 'light');
  try {
    const recovery = await client.initialize();
    populateEvents();
    elements['data-version'].textContent = 'データ版: ' + client.store.active.datasetVersion;
    const restored = readLastEvent(localStorage, new Set(client.index.events.map((entry) => entry.id)));
    if (restored.eventId) await selectEvent(restored.eventId, { persist: false });
    else {
      resetEnemySelection('初回はイベントを選んでください');
      setStatus(recovery.recovery.includes('restored') ? '安全な保存版で準備しました。イベントを選んでください。' : '準備完了。イベントを選んでください。');
    }
    savedDataSummary();
    metrics.readyMs = performance.now() - metrics.startedAt;
    globalThis.__phase8Ready = true;
    globalThis.dispatchEvent(new CustomEvent('phase8-ready'));
  } catch {
    setStatus('敵データを準備できませんでした。OneDrive backupはヘルプから確認できます。', true);
    globalThis.__phase8Error = true;
  }
}

elements['event-select'].addEventListener('change', () => selectEvent(elements['event-select'].value));
elements['stage-select'].addEventListener('change', renderEnemies);
elements['enemy-select'].addEventListener('change', renderAttackOptions);
elements['calculate-button'].addEventListener('click', calculate);
elements['update-button'].addEventListener('click', updateData);
elements['theme-button'].addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
globalThis.Phase8RC = { client, store, state, selectEvent, calculate, currentEnemy, updateData };
initialize();
