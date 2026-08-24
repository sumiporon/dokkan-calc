import { Phase8ReleaseStore } from '../../src/release-candidate/phase8-release-store.mjs';
import { Phase8RuntimeClient } from '../../src/release-candidate/phase8-runtime-client.mjs';
import { readLastEvent, saveLastEvent } from '../../src/release-candidate/phase8-selection-state.mjs';
import {
  describeImportedStorage,
  enemyAttackRanges,
  enemyAttackState,
  enemyConditionDimensions,
  enumerateValidEnemyStates,
  formatAttackRange,
  japaneseType,
  known,
  normalizeNumericInputValue,
  superAttackAvailableInState
} from '../../src/release-candidate/phase8-ui-model.mjs';

const params = new URLSearchParams(location.search);
const dataRoot = params.get('dataRoot') || './data';
const storagePrefix = 'dokkan_phase8_rc_imported_';
const storageKey = storagePrefix + 'dokkan_calc_data_v22';
const phase8UiSchemaVersion = 2;
const core = globalThis.DokkanCalcCore;
const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
const store = new Phase8ReleaseStore({ dbName: params.get('dbName') || 'dokkan-phase8-rc-releases-v1' });
const clientOptions = { dataRoot, store };
if (globalThis.__phase8EmbeddedFetch) {
  clientOptions.fetchImpl = globalThis.__phase8EmbeddedFetch;
  clientOptions.cacheStorage = null;
}
const client = new Phase8RuntimeClient(clientOptions);
const state = {
  event: null,
  cards: [],
  cardCounter: 0,
  durabilityLines: [],
  savedCharacters: [],
  savedEnemies: [],
  savedRoot: {},
  initializing: true
};
const metrics = globalThis.__phase8Metrics = { startedAt: performance.now(), readyMs: null, lastEventMs: null };

const firstCardIds = Object.freeze({
  'event-select': 'event-select',
  'stage-select': 'stage-select',
  'enemy-select': 'enemy-select',
  'attack-select': 'attack-select',
  'char-def': 'char-def',
  leader: 'leader',
  passive: 'passive',
  'multi-passive': 'multi-passive',
  'damage-reduction': 'damage-reduction',
  'own-class': 'own-class',
  'own-type': 'own-type',
  memory: 'memory',
  link: 'link',
  'super-attack': 'super-attack',
  field: 'field',
  active: 'active',
  'support-item': 'support-item',
  'attribute-defense': 'attribute-defense',
  guard: 'guard',
  'durability-own-affinity': 'durability-own-affinity',
  'durability-enemy-affinity': 'durability-enemy-affinity',
  'final-defense': 'final-defense',
  'damage-result': 'damage-result'
});

const affinityOptions = ['super', 'extreme'].flatMap((alignment) =>
  ['agl', 'teq', 'int', 'str', 'phy'].map((type) => ({ value: `${alignment}:${type}`, label: japaneseType(alignment, type) }))
);

function setStatus(message, error = false) {
  elements['app-status'].textContent = message;
  elements['app-status'].classList.toggle('error', error);
}

function role(context, name) {
  return context.element.querySelector(`[data-role="${name}"]`);
}

function replaceOptions(select, items, placeholder) {
  select.replaceChildren(new Option(placeholder, ''), ...items.map((item) => new Option(item.label, item.value)));
  select.disabled = items.length === 0;
}

function defaultScenario(index = 0) {
  return {
    scenario_title: `状況 ${index + 1}`,
    char_def: '0', leader: '0', passive: '0', multi_passive: '0', memory: '0', link: '0',
    super_attack: '0', field: '0', active: '0', support_item: '0', dr_input: '0',
    own_class: 'super', own_type: 'teq', attr_def_up: '0', is_guard: false,
    is_critical: false, crit_atk_up: '0', crit_def_down: '0',
    enemy_atk: '', enemy_class: 'super', enemy_type: 'teq',
    phase8_durability_enemy_affinity: 'super:teq'
  };
}

function inputValue(element) {
  return element.type === 'checkbox' ? element.checked : element.value;
}

function scenarioData(context) {
  const data = { originalIndex: state.cards.indexOf(context) };
  for (const input of context.element.querySelectorAll('[data-input]')) data[input.dataset.input] = inputValue(input);
  data.phase8_event_id = role(context, 'event-select').value;
  data.phase8_stage_id = role(context, 'stage-select').value;
  data.phase8_enemy_id = role(context, 'enemy-select').value;
  data.phase8_attack_id = role(context, 'attack-select').value;
  for (const select of context.element.querySelectorAll('[data-condition]')) data[`phase8_condition_${select.dataset.condition}`] = select.value;
  if (context.legacyEnemy) data.loadedEnemy = context.legacyEnemy;
  return data;
}

function allScenarioData() {
  return state.cards.map(scenarioData);
}

function persistState() {
  if (state.initializing) return;
  const next = {
    ...state.savedRoot,
    phase8UiSchemaVersion,
    durabilityLines: state.durabilityLines,
    savedCharacters: state.savedCharacters,
    savedEnemies: state.savedEnemies,
    currentScenarios: allScenarioData(),
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  };
  state.savedRoot = next;
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch (error) {
    console.error('Failed to save Phase 8 RC state', error);
  }
}

function migrateSavedState(saved) {
  if (Number(saved.phase8UiSchemaVersion || 1) >= phase8UiSchemaVersion) return saved;
  const migrateScenario = (scenario = {}) => ({
    ...scenario,
    phase8_durability_enemy_affinity: scenario.phase8_durability_enemy_affinity
      || `${scenario.own_class || 'super'}:${scenario.own_type || 'teq'}`
  });
  return {
    ...saved,
    phase8UiSchemaVersion,
    currentScenarios: Array.isArray(saved.currentScenarios) ? saved.currentScenarios.map(migrateScenario) : saved.currentScenarios,
    savedCharacters: Array.isArray(saved.savedCharacters)
      ? saved.savedCharacters.map((character) => ({
        ...character,
        scenarios: Array.isArray(character.scenarios) ? character.scenarios.map(migrateScenario) : character.scenarios
      }))
      : saved.savedCharacters
  };
}

function readSavedState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const saved = migrateSavedState(parsed);
    state.savedRoot = saved;
    state.durabilityLines = Array.isArray(saved.durabilityLines) ? saved.durabilityLines : [];
    state.savedCharacters = Array.isArray(saved.savedCharacters) ? saved.savedCharacters : [];
    state.savedEnemies = Array.isArray(saved.savedEnemies) ? saved.savedEnemies : [];
    return saved;
  } catch {
    elements['saved-data-summary'].textContent = '移行済みデータを確認できませんでした。元の保存データは変更していません。';
    return null;
  }
}

function setTheme(theme, { persist = true } = {}) {
  document.documentElement.dataset.theme = theme;
  elements['theme-button'].textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('dokkan_phase8_rc_theme', theme);
  if (persist) persistState();
}

function formatTargetDamage(value) {
  if (Number(value) === 0) return '完封（0）';
  return core.formatNumber(value);
}

function renderDurabilityLines() {
  elements['durability-lines-list'].replaceChildren();
  state.durabilityLines.forEach((line, index) => {
    const badge = document.createElement('span');
    badge.className = 'line-badge';
    const label = document.createElement('span');
    label.textContent = line.name || formatTargetDamage(line.value);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.lineIndex = String(index);
    button.setAttribute('aria-label', `${label.textContent}を削除`);
    button.textContent = '×';
    badge.append(label, button);
    elements['durability-lines-list'].append(badge);
  });
  updateAllCards();
}

function addDurabilityLine() {
  if (state.durabilityLines.length >= 4) {
    setStatus('耐久ラインは4件までです。');
    return;
  }
  const raw = Number.parseInt(elements['new-line-input'].value, 10);
  if (!Number.isFinite(raw) || raw < 0) return;
  const value = raw * 10_000;
  if (!state.durabilityLines.some((line) => Number(line.value) === value)) {
    state.durabilityLines.push({ name: value === 0 ? '完封' : core.formatNumber(value), value });
    state.durabilityLines.sort((left, right) => Number(left.value) - Number(right.value));
  }
  elements['new-line-input'].value = '';
  renderDurabilityLines();
  persistState();
}

function renderPreview() {
  elements['preview-content'].replaceChildren();
  for (const context of state.cards) {
    const data = scenarioData(context);
    const calculation = core.calculateDurability(calculationInput(context, null, true));
    const item = document.createElement('section');
    item.className = 'preview-item';
    const title = document.createElement('h3');
    title.textContent = data.scenario_title || '名称なし';
    const summary = document.createElement('p');
    summary.textContent = `最終DEF ${Math.round(calculation.final_def).toLocaleString()} / 軽減 ${data.dr_input || 0}% / 全属性ガード ${data.is_guard ? 'あり' : 'なし'}`;
    const lines = document.createElement('ul');
    for (const line of state.durabilityLines) {
      const row = document.createElement('li');
      row.textContent = `${line.name || formatTargetDamage(line.value)}：敵ATK ${core.formatDurabilityLimit(core.calculateSafeDurabilityLine(line.value, calculation))}`;
      lines.append(row);
    }
    item.append(title, summary, lines);
    elements['preview-content'].append(item);
  }
  elements['preview-dialog'].showModal();
}

function runtimeField(value, stateName = 'known') {
  return value == null ? { state: 'unknown', value: null } : { state: stateName, value };
}

function legacyEffect(id, kind, value, { start = null, hpMax = null, cap = null, bracket = 'start-of-turn' } = {}) {
  return {
    id,
    trigger: {
      kind,
      start: runtimeField(start),
      end: runtimeField(null),
      hpMinPercent: kind === 'hp-range' ? runtimeField(0) : runtimeField(null),
      hpMaxPercent: runtimeField(hpMax)
    },
    appliesTo: 'enemy-stats', target: 'attack', operation: 'add-percent',
    value: runtimeField(value), cap: runtimeField(cap), durationTurns: runtimeField(null), bracket
  };
}

function legacyEnemyToRuntime(enemy) {
  const baseAttack = Number(enemy.baseAtk) || Number(enemy.attacks?.find((attack) => attack.name === '通常')?.value) || 0;
  const passiveEffects = [];
  if (Number(enemy.turnAtkUp) > 0) passiveEffects.push(legacyEffect('legacy-turn', 'elapsed-turn', Number(enemy.turnAtkUp), { start: Number(enemy.turnAtkUpStartTurn) || 1, cap: Number(enemy.turnAtkMax) || null }));
  if (Number(enemy.hitAtkUp) > 0) passiveEffects.push(legacyEffect('legacy-hit', 'received-hit-count', Number(enemy.hitAtkUp), { start: 1, cap: Number(enemy.hitAtkMax) || null, bracket: 'mid-battle' }));
  if (Number(enemy.hpAtkUp) > 0) passiveEffects.push(legacyEffect('legacy-hp', 'hp-range', Number(enemy.hpAtkUp), { hpMax: Number(enemy.hpAtkThreshold) || 100 }));
  let previousAppearance = 0;
  for (const [index, entry] of (enemy.appearEntries ?? []).entries()) {
    const cumulative = Number(entry.cumulativeAtkUp) || 0;
    passiveEffects.push(legacyEffect(`legacy-appearance-${index}`, 'appearance-turn', cumulative - previousAppearance, { start: Number(entry.turn) || 1 }));
    previousAppearance = cumulative;
  }
  const superRows = (enemy.attacks ?? []).filter((attack) => String(attack.name).includes('必殺'));
  if (superRows.length === 0 && Number(enemy.saMulti) > 0) {
    superRows.push({ name: '必殺', value: Math.floor(baseAttack * (Number(enemy.saMulti) + Number(enemy.saBuffMod || 0))) });
  }
  const postSuperEffect = Number(enemy.saBuffMod) > 0 ? [{
    id: 'legacy-post-super', trigger: { kind: 'after-super', start: runtimeField(null), end: runtimeField(null), hpMinPercent: runtimeField(null), hpMaxPercent: runtimeField(null) },
    appliesTo: 'subsequent-normal-attacks', target: 'attack', operation: 'add-percent', value: runtimeField(Number(enemy.saBuffMod) * 100),
    cap: runtimeField(null), durationTurns: runtimeField(1), bracket: 'post-super'
  }] : [];
  return {
    id: `legacy:${enemy.name || 'enemy'}`,
    name: runtimeField(enemy.name || '移行済み保存敵'),
    type: runtimeField(enemy.type || 'teq'),
    alignment: runtimeField(enemy.class || 'neutral'),
    baseAttack: runtimeField(baseAttack),
    passiveEffects,
    superAttacks: superRows.map((attack, index) => ({
      id: `legacy-super-${index}`, name: runtimeField(attack.name || `必殺${index + 1}`), displayedDamage: runtimeField(Number(attack.value) || 0), effects: index === 0 ? postSuperEffect : []
    }))
  };
}

function allEnemies(stage) {
  return stage?.encounters.flatMap((encounter) => encounter.enemies.map((enemy) => ({ enemy, encounter }))) ?? [];
}

function currentStage(context) {
  return context.event?.stages.find((stage) => stage.id === role(context, 'stage-select').value) ?? null;
}

function currentEnemyContext(context) {
  if (context.legacyEnemy) return { enemy: context.runtimeLegacyEnemy, encounter: { areaAttacks: [] } };
  return allEnemies(currentStage(context)).find((item) => item.enemy.id === role(context, 'enemy-select').value) ?? null;
}

function customAttackValue(context) {
  return Number(role(context, 'manual-enemy-attack').value || 0) * 10_000;
}

function customAttackOption(context) {
  const value = customAttackValue(context);
  return value > 0 ? { value: 'custom', label: `カスタム攻撃 ${value.toLocaleString()}` } : null;
}

function clearEnemyResult(context, message = '敵を選択してください') {
  const custom = customAttackOption(context);
  replaceOptions(role(context, 'attack-select'), custom ? [custom] : [], '攻撃を選択');
  if (custom) role(context, 'attack-select').value = custom.value;
  role(context, 'condition-controls').replaceChildren();
  if (custom) {
    const alignment = role(context, 'manual-enemy-class').value;
    const type = role(context, 'manual-enemy-type').value;
    role(context, 'enemy-name').textContent = '保存敵なし（カスタム攻撃）';
    role(context, 'enemy-type').textContent = `敵属性：${japaneseType(alignment, type)}`;
    role(context, 'enemy-attack-summary').textContent = custom.label;
  } else {
    role(context, 'enemy-name').textContent = message;
    role(context, 'enemy-type').textContent = '敵属性：未選択';
    role(context, 'enemy-attack-summary').textContent = '敵を選ぶと通常攻撃・必殺攻撃を表示します。';
  }
  renderCard(context);
}

function renderConditionControls(context, enemy, initial = {}) {
  const container = role(context, 'condition-controls');
  container.replaceChildren();
  const dimensions = enemyConditionDimensions(enemy);
  const configurations = [
    ['turn', 'ターン', dimensions.turns, initial.phase8_condition_turn],
    ['hits', '被弾回数', dimensions.hits, initial.phase8_condition_hits],
    ['hp', 'HP', dimensions.hp, initial.phase8_condition_hp]
  ];
  for (const [name, labelText, options, saved] of configurations) {
    if (options.length <= 1) continue;
    const label = document.createElement('label');
    label.textContent = labelText;
    const select = document.createElement('select');
    select.dataset.condition = name;
    options.forEach((option) => select.append(new Option(option.label, String(option.value))));
    if (saved != null && options.some((option) => String(option.value) === String(saved))) select.value = String(saved);
    else if (name === 'hp' && options.some((option) => option.value === 100)) select.value = '100';
    label.append(select);
    container.append(label);
  }
}

function currentCondition(context) {
  const dimensions = enemyConditionDimensions(currentEnemyContext(context)?.enemy);
  const selected = Object.fromEntries([...context.element.querySelectorAll('[data-condition]')].map((select) => [select.dataset.condition, Number(select.value)]));
  return {
    turn: selected.turn ?? dimensions.turns[0]?.value ?? 1,
    hits: selected.hits ?? dimensions.hits[0]?.value ?? 0,
    hp: selected.hp ?? dimensions.hp.find((option) => option.value === 100)?.value ?? dimensions.hp[0]?.value ?? 100
  };
}

function areaAttacksFor(item) {
  if (!item) return [];
  return (item.encounter.areaAttacks ?? []).filter((attack) => {
    const sourceId = known(attack.sourceEnemyId, null);
    return sourceId == null || sourceId === item.enemy.id;
  });
}

function areaAttackValue(attack, stateResult, target = 'first') {
  const field = target === 'additional' ? attack.additionalTargetDamage : attack.firstTargetDamage;
  let value = Number(known(field, 0));
  value = core.applyPercentAndFloor(value, stateResult.startOfTurnPercent);
  return core.applyPercentAndFloor(value, stateResult.receivedHitPercent);
}

function renderEnemyAttackSummary(context, item) {
  const ranges = enemyAttackRanges(item.enemy, core);
  const container = role(context, 'enemy-attack-summary');
  container.replaceChildren();
  const rows = [
    ['通常攻撃', formatAttackRange(ranges.normal)],
    ...ranges.supers.map((attack) => [attack.name, formatAttackRange(attack.range)])
  ];
  const validStates = enumerateValidEnemyStates(item.enemy, core);
  for (const area of areaAttacksFor(item)) {
    const values = validStates.map((entry) => areaAttackValue(area, entry.attacks, 'first'));
    rows.push(['全体攻撃', formatAttackRange({ minimum: Math.min(...values), maximum: Math.max(...values) })]);
  }
  for (const [name, value] of rows) {
    const row = document.createElement('div');
    row.className = 'attack-summary-row';
    const label = document.createElement('span');
    label.textContent = name;
    const strong = document.createElement('strong');
    strong.textContent = value;
    row.append(label, strong);
    container.append(row);
  }
  if (ranges.supers.length > 1) {
    const note = document.createElement('small');
    note.textContent = '複数の必殺技は、情報をまとめず技ごとに表示しています。';
    container.append(note);
  }
}

function renderAttackOptions(context, { initial = {} } = {}) {
  const item = currentEnemyContext(context);
  if (!item) {
    clearEnemyResult(context);
    return;
  }
  const ranges = enemyAttackRanges(item.enemy, core);
  const options = [{ value: 'normal', label: `通常攻撃 ${formatAttackRange(ranges.normal)}` }];
  const baseState = enemyAttackState(item.enemy, currentCondition(context), core);
  baseState.normalValues.slice(1).forEach((value, index) => options.push({ value: `post-super:${index}`, label: `通常攻撃（必殺後） ${value.toLocaleString()}` }));
  const selectedState = currentCondition(context);
  ranges.supers.forEach((attack) => {
    const source = item.enemy.superAttacks.find((candidate) => candidate.id === attack.id);
    if (superAttackAvailableInState(source, selectedState)) options.push({ value: `super:${attack.id}`, label: `${attack.name} ${formatAttackRange(attack.range)}` });
  });
  for (const area of areaAttacksFor(item)) {
    options.push({ value: `area:${area.id}:first`, label: `全体攻撃 ${Number(known(area.firstTargetDamage, 0)).toLocaleString()}` });
    if (known(area.additionalTargetDamage, null) != null && known(area.additionalTargetDamage, null) !== known(area.firstTargetDamage, null)) {
      options.push({ value: `area:${area.id}:additional`, label: `全体攻撃（2体目以降） ${Number(known(area.additionalTargetDamage, 0)).toLocaleString()}` });
    }
  }
  const custom = customAttackOption(context);
  if (custom) options.push(custom);
  const current = role(context, 'attack-select').value;
  replaceOptions(role(context, 'attack-select'), options, '攻撃を選択');
  const wanted = initial.phase8_attack_id || context.pendingAttackId || current;
  role(context, 'attack-select').value = options.some((option) => option.value === wanted) ? wanted : 'normal';
  context.pendingAttackId = null;
  const alignment = known(item.enemy.alignment, 'neutral');
  const type = known(item.enemy.type, null);
  role(context, 'enemy-name').textContent = String(known(item.enemy.name, item.enemy.id));
  role(context, 'enemy-type').textContent = `敵属性：${japaneseType(alignment, type)}`;
  renderEnemyAttackSummary(context, item);
  renderCard(context);
}

function renderEnemies(context, { selectedEnemyId = '', initial = {} } = {}) {
  context.legacyEnemy = null;
  context.runtimeLegacyEnemy = null;
  const enemies = allEnemies(currentStage(context));
  replaceOptions(role(context, 'enemy-select'), enemies.map(({ enemy }) => ({ value: enemy.id, label: String(known(enemy.name, enemy.id)) })), '敵を選択してください');
  if (selectedEnemyId && enemies.some(({ enemy }) => enemy.id === selectedEnemyId)) {
    role(context, 'enemy-select').value = selectedEnemyId;
    const item = currentEnemyContext(context);
    renderConditionControls(context, item.enemy, initial);
    renderAttackOptions(context, { initial });
  } else clearEnemyResult(context);
}

function renderStages(context, { selectedStageId = '', selectedEnemyId = '', initial = {} } = {}) {
  const stages = context.event?.stages ?? [];
  replaceOptions(role(context, 'stage-select'), stages.map((stage) => ({ value: stage.id, label: String(known(stage.name, stage.id)) })), 'ステージを選択');
  if (stages.length === 0) return renderEnemies(context);
  role(context, 'stage-select').value = stages.some((stage) => stage.id === selectedStageId) ? selectedStageId : stages[0].id;
  renderEnemies(context, { selectedEnemyId, initial });
}

async function selectEventForCard(context, eventId, { persist = true, selectedStageId = '', selectedEnemyId = '', initial = {} } = {}) {
  const started = performance.now();
  context.legacyEnemy = null;
  context.runtimeLegacyEnemy = null;
  if (!eventId) {
    context.event = null;
    replaceOptions(role(context, 'stage-select'), [], '—');
    replaceOptions(role(context, 'enemy-select'), [], '敵を選択してください');
    clearEnemyResult(context, 'イベントを選択してください');
    return false;
  }
  setStatus('選んだイベントを読み込んでいます…');
  try {
    const event = await client.event(eventId);
    if (!event) throw new Error('missing event');
    context.event = event;
    role(context, 'event-select').value = eventId;
    renderStages(context, { selectedStageId, selectedEnemyId, initial });
    if (state.cards[0] === context) state.event = event;
    if (persist) saveLastEvent(localStorage, eventId, client.manifest.datasetVersion);
    metrics.lastEventMs = performance.now() - started;
    setStatus('準備完了');
    globalThis.dispatchEvent(new CustomEvent('phase8-event-ready', { detail: { eventId, cardId: context.id } }));
    persistState();
    return true;
  } catch {
    context.event = null;
    role(context, 'event-select').value = '';
    replaceOptions(role(context, 'stage-select'), [], '—');
    replaceOptions(role(context, 'enemy-select'), [], '敵を選択してください');
    clearEnemyResult(context, 'イベントを読み込めませんでした');
    setStatus('イベントを読み込めませんでした。現在のデータは変更されていません。', true);
    return false;
  }
}

function configureLegacyEnemy(context, data) {
  context.legacyEnemy = data.loadedEnemy;
  context.runtimeLegacyEnemy = legacyEnemyToRuntime(data.loadedEnemy);
  const eventSelect = role(context, 'event-select');
  eventSelect.append(new Option('移行済みの保存敵', '__legacy__'));
  eventSelect.disabled = false;
  eventSelect.value = '__legacy__';
  replaceOptions(role(context, 'stage-select'), [{ value: '__legacy__', label: '保存データ' }], '—');
  role(context, 'stage-select').value = '__legacy__';
  replaceOptions(role(context, 'enemy-select'), [{ value: context.runtimeLegacyEnemy.id, label: String(known(context.runtimeLegacyEnemy.name, '保存敵')) }], '敵を選択してください');
  role(context, 'enemy-select').value = context.runtimeLegacyEnemy.id;
  renderConditionControls(context, context.runtimeLegacyEnemy, data);
  context.pendingAttackId = data.phase8_attack_id;
  renderAttackOptions(context, { initial: data });
}

function populateEventSelect(context) {
  replaceOptions(role(context, 'event-select'), client.index.events.map((entry) => ({ value: entry.id, label: entry.name })), 'イベントを選択してください');
}

function populateAffinitySelects(context) {
  for (const name of ['durability-own-affinity', 'durability-enemy-affinity']) {
    const select = role(context, name);
    select.replaceChildren(...affinityOptions.map((option) => new Option(option.label, option.value)));
  }
}

function syncDurabilityOwnAffinity(context) {
  role(context, 'durability-own-affinity').value = `${role(context, 'own-class').value}:${role(context, 'own-type').value}`;
}

function applyDurabilityOwnAffinity(context) {
  const [alignment, type] = role(context, 'durability-own-affinity').value.split(':');
  if (!['super', 'extreme'].includes(alignment) || !['agl', 'teq', 'int', 'str', 'phy'].includes(type)) return;
  role(context, 'own-class').value = alignment;
  role(context, 'own-type').value = type;
}

function applyScenarioInputs(context, data) {
  const merged = { ...defaultScenario(state.cards.length), ...data };
  if (!data.phase8_durability_enemy_affinity) {
    merged.phase8_durability_enemy_affinity = `${merged.own_class || 'super'}:${merged.own_type || 'teq'}`;
  }
  for (const input of context.element.querySelectorAll('[data-input]')) {
    const value = merged[input.dataset.input];
    if (value === undefined || value === null) continue;
    if (input.type === 'checkbox') input.checked = value === true || String(value) === 'true';
    else input.value = String(value);
  }
  syncDurabilityOwnAffinity(context);
}

function assignCardIds(context, isFirst) {
  for (const element of context.element.querySelectorAll('[data-role]')) {
    const name = element.dataset.role;
    element.id = isFirst && firstCardIds[name] ? firstCardIds[name] : `${context.id}-${name}`;
  }
}

async function addScenarioCard(data = defaultScenario(state.cards.length), { insertAfter = null, restoreLastEvent = false } = {}) {
  state.cardCounter += 1;
  const element = elements['scenario-card-template'].content.firstElementChild.cloneNode(true);
  const context = { id: `scenario-${state.cardCounter}`, element, event: null, legacyEnemy: null, runtimeLegacyEnemy: null, pendingAttackId: null };
  const insertIndex = insertAfter ? state.cards.indexOf(insertAfter) + 1 : state.cards.length;
  state.cards.splice(insertIndex, 0, context);
  assignCardIds(context, state.cards.length === 1);
  populateAffinitySelects(context);
  applyScenarioInputs(context, data);
  if (insertAfter) insertAfter.element.insertAdjacentElement('afterend', element);
  else elements['scenario-cards-container'].append(element);
  populateEventSelect(context);
  if (data.loadedEnemy && typeof data.loadedEnemy === 'object') {
    configureLegacyEnemy(context, data);
  } else {
    let eventId = data.phase8_event_id || '';
    if (!eventId && restoreLastEvent) eventId = readLastEvent(localStorage, new Set(client.index.events.map((entry) => entry.id))).eventId || '';
    if (eventId) await selectEventForCard(context, eventId, {
      persist: false,
      selectedStageId: data.phase8_stage_id || '',
      selectedEnemyId: data.phase8_enemy_id || '',
      initial: data
    });
    else clearEnemyResult(context, '敵を選択してください');
  }
  updateMode();
  renderCard(context);
  persistState();
  return context;
}

async function recreateScenarioCards(scenarios = []) {
  state.cards = [];
  state.cardCounter = 0;
  elements['scenario-cards-container'].replaceChildren();
  const values = scenarios.length > 0 ? scenarios : [defaultScenario(0)];
  for (const [index, data] of values.entries()) await addScenarioCard(data, { restoreLastEvent: index === 0 && !data.loadedEnemy && !data.phase8_event_id });
}

function calculationInput(context, enemy, durabilityMode = false) {
  const ownClass = role(context, 'own-class').value;
  const ownType = role(context, 'own-type').value;
  const [durabilityEnemyClass, durabilityEnemyType] = role(context, 'durability-enemy-affinity').value.split(':');
  const alignment = durabilityMode ? durabilityEnemyClass : known(enemy?.alignment, ownClass);
  const enemyClass = alignment === 'neutral' ? ownClass : alignment;
  const enemyType = durabilityMode ? durabilityEnemyType : known(enemy?.type, ownType);
  const values = Object.fromEntries([...context.element.querySelectorAll('[data-input]')].map((input) => [input.dataset.input, inputValue(input)]));
  return { ...values, own_class: ownClass, own_type: ownType, enemy_class: enemyClass, enemy_type: enemyType };
}

function selectedAttack(context, item) {
  const value = role(context, 'attack-select').value;
  if (value === 'custom') {
    const attackValue = customAttackValue(context);
    return attackValue > 0 ? { name: 'カスタム攻撃', value: attackValue } : null;
  }
  if (!item) return null;
  const condition = enemyAttackState(item.enemy, currentCondition(context), core);
  if (value === 'normal') return { name: '通常攻撃', value: condition.normalValues[0] };
  if (value.startsWith('post-super:')) {
    const index = Number.parseInt(value.split(':')[1], 10);
    return { name: '通常攻撃（必殺後）', value: condition.normalValues[index + 1] };
  }
  if (value.startsWith('super:')) {
    const id = value.slice('super:'.length);
    const attack = condition.supers.find((candidate) => candidate.id === id);
    return attack ? { name: attack.name, value: attack.value } : null;
  }
  if (value.startsWith('area:')) {
    const [, id, target] = value.split(':');
    const attack = areaAttacksFor(item).find((candidate) => candidate.id === id);
    return attack ? { name: target === 'additional' ? '全体攻撃（2体目以降）' : '全体攻撃', value: areaAttackValue(attack, condition, target) } : null;
  }
  return null;
}

function renderDurabilityResult(context, calculation) {
  const container = role(context, 'durability-table');
  if (state.durabilityLines.length === 0) {
    container.textContent = '耐久ライン設定から1件以上追加してください。';
    return;
  }
  const table = document.createElement('table');
  table.className = 'durability-table';
  const body = document.createElement('tbody');
  const criticalUnconfigured = role(context, 'is-critical').checked
    && Number(role(context, 'critical-attack').value || 0) === 0
    && Number(role(context, 'critical-defense').value || 0) === 0;
  for (const line of state.durabilityLines) {
    const row = document.createElement('tr');
    const target = document.createElement('th');
    target.textContent = line.name || formatTargetDamage(line.value);
    const result = document.createElement('td');
    result.textContent = criticalUnconfigured
      ? '—（会心補正を設定）'
      : core.formatDurabilityLimit(core.calculateSafeDurabilityLine(line.value, calculation));
    row.append(target, result);
    body.append(row);
  }
  table.append(body);
  container.replaceChildren(table);
}

function renderDamageResult(context) {
  const ownLabel = japaneseType(role(context, 'own-class').value, role(context, 'own-type').value);
  const item = currentEnemyContext(context);
  const usesCustomAttack = role(context, 'attack-select').value === 'custom' && customAttackValue(context) > 0;
  if ((!item || !role(context, 'enemy-select').value) && !usesCustomAttack) {
    role(context, 'damage-result').textContent = '敵を選択してください';
    role(context, 'result-types').innerHTML = `自分：${ownLabel}<br>敵：未選択`;
    return;
  }
  if (
    role(context, 'is-critical').checked
    && Number(role(context, 'critical-attack').value || 0) === 0
    && Number(role(context, 'critical-defense').value || 0) === 0
  ) {
    role(context, 'damage-result').textContent = '会心補正を設定してください';
    return;
  }
  const manualEnemy = usesCustomAttack ? {
    alignment: runtimeField(role(context, 'manual-enemy-class').value),
    type: runtimeField(role(context, 'manual-enemy-type').value)
  } : null;
  const enemy = item?.enemy ?? manualEnemy;
  const calculationEnemy = usesCustomAttack ? manualEnemy : enemy;
  const attack = selectedAttack(context, item);
  if (!attack || !Number.isFinite(Number(attack.value))) {
    role(context, 'damage-result').textContent = '攻撃を選択してください';
    return;
  }
  const calculation = core.calculateDurability(calculationInput(context, calculationEnemy, false));
  const range = core.calculateDamageRange(attack.value, calculation);
  const enemyLabel = japaneseType(known(calculationEnemy.alignment, 'neutral'), known(calculationEnemy.type, null));
  role(context, 'damage-result').textContent = `${attack.name}：${core.formatDamageRange(range)}`;
  role(context, 'result-types').innerHTML = `自分：${ownLabel}<br>敵：${enemyLabel}`;
}

function renderCard(context) {
  const durabilityCalculation = core.calculateDurability(calculationInput(context, null, true));
  role(context, 'final-defense').textContent = Math.round(durabilityCalculation.final_def).toLocaleString();
  renderDurabilityResult(context, durabilityCalculation);
  renderDamageResult(context);
}

function updateAllCards() {
  state.cards.forEach(renderCard);
}

function updateMode() {
  const mode = document.querySelector('input[name="calculation-mode"]:checked')?.value || 'durability';
  elements['durability-settings'].hidden = mode !== 'durability';
  state.cards.forEach((context) => {
    role(context, 'durability-result').hidden = mode !== 'durability';
    role(context, 'damage-panel').hidden = mode !== 'damage';
  });
  updateAllCards();
}

function setScenarioCollapsed(context, collapsed) {
  const body = role(context, 'scenario-body');
  const button = context.element.querySelector('[data-action="toggle-collapse"]');
  body.hidden = collapsed;
  button.setAttribute('aria-expanded', String(!collapsed));
  button.textContent = collapsed ? '開く' : '閉じる';
}

function setAllScenariosCollapsed(collapsed) {
  state.cards.forEach((context) => setScenarioCollapsed(context, collapsed));
}

function renderSavedDataSummary() {
  const container = elements['saved-data-summary'];
  container.replaceChildren();
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    container.textContent = 'この確認版に移行された保存データはありません。';
    return;
  }
  try {
    const saved = JSON.parse(raw);
    let criticalOverrides = {};
    try {
      criticalOverrides = JSON.parse(localStorage.getItem(`${storagePrefix}dokkan_crit_overrides`) || '{}');
    } catch {
      criticalOverrides = {};
    }
    const summary = describeImportedStorage(saved, criticalOverrides);
    const intro = document.createElement('p');
    intro.textContent = '移行済みの内容：';
    const list = document.createElement('ul');
    list.className = 'migration-summary-list';
    const entries = [
      `保存キャラクター：${summary.characters}件${summary.characterNames.length ? `（${summary.characterNames.join('、')}）` : ''}`,
      `保存済み状況：${summary.savedScenarios}件`,
      `作業中の状況：${summary.currentScenarios}件`,
      `手動保存した敵：${summary.manualEnemies}件`,
      `設定：${summary.settings}分類（耐久ライン・配色）`,
      `会心補正：${summary.criticalOverrides}件`,
      'GitHub PAT：移行していません',
      'イベント・ステージ・配布敵データ：増えません'
    ];
    entries.forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      list.append(item);
    });
    const guide = document.createElement('p');
    guide.textContent = `上の「計算する状況」に、移行した作業中の状況${summary.currentScenarios}件を直接表示しています。状況名と入力値を確認してください。以前の保存キャラクターと保存済み状況も互換性のため内部に残しています（通常画面には表示しません）。`;
    container.append(intro, list, guide);
  } catch {
    container.textContent = '移行済みデータを確認できませんでした。元の保存データは変更していません。';
  }
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
    const selections = state.cards.map((context) => ({ context, data: scenarioData(context) }));
    const result = await client.update();
    const message = updateMessage(result);
    elements['update-status'].textContent = message.text;
    elements['update-status'].classList.toggle('error', message.error);
    elements['data-version'].textContent = 'データ版: ' + client.store.active.datasetVersion;
    if (result.status === 'applied') {
      for (const { context, data } of selections) {
        populateEventSelect(context);
        if (data.loadedEnemy) configureLegacyEnemy(context, data);
        else if (data.phase8_event_id && client.index.events.some((entry) => entry.id === data.phase8_event_id)) {
          await selectEventForCard(context, data.phase8_event_id, { persist: false, selectedStageId: data.phase8_stage_id, selectedEnemyId: data.phase8_enemy_id, initial: data });
        } else clearEnemyResult(context);
      }
    }
  } catch {
    elements['update-status'].textContent = '更新しませんでした。現在の敵データはそのまま安全に使えます。';
    elements['update-status'].classList.add('error');
  } finally {
    elements['update-button'].disabled = false;
  }
}

function cardContext(element) {
  const card = element.closest('.scenario-card');
  return state.cards.find((context) => context.element === card) ?? null;
}

elements['scenario-cards-container'].addEventListener('focusin', (event) => {
  if (event.target.matches('input[type="number"]') && event.target.value === '0') event.target.select();
});

elements['scenario-cards-container'].addEventListener('input', (event) => {
  const context = cardContext(event.target);
  if (!context || !event.target.matches('[data-input]')) return;
  if (event.target.type === 'number') {
    const normalized = normalizeNumericInputValue(event.target.value);
    if (normalized !== event.target.value) event.target.value = normalized;
  }
  if (event.target.matches('[data-role="manual-enemy-attack"]')) renderAttackOptions(context);
  else renderCard(context);
  persistState();
});

elements['scenario-cards-container'].addEventListener('change', async (event) => {
  const context = cardContext(event.target);
  if (!context) return;
  if (event.target.matches('[data-role="event-select"]')) {
    if (event.target.value === '__legacy__' && context.legacyEnemy) configureLegacyEnemy(context, scenarioData(context));
    else await selectEventForCard(context, event.target.value);
  } else if (event.target.matches('[data-role="stage-select"]')) {
    renderEnemies(context);
  } else if (event.target.matches('[data-role="enemy-select"]')) {
    const item = currentEnemyContext(context);
    if (item) {
      renderConditionControls(context, item.enemy);
      renderAttackOptions(context);
    } else clearEnemyResult(context);
  } else if (event.target.matches('[data-condition]')) {
    renderAttackOptions(context);
  } else if (event.target.matches('[data-role="durability-own-affinity"]')) {
    applyDurabilityOwnAffinity(context);
    renderCard(context);
  } else if (event.target.matches('[data-role="own-class"], [data-role="own-type"]')) {
    syncDurabilityOwnAffinity(context);
    renderCard(context);
  } else if (event.target.matches('[data-role="manual-enemy-class"], [data-role="manual-enemy-type"]') && !currentEnemyContext(context)) {
    clearEnemyResult(context);
  } else {
    renderCard(context);
  }
  persistState();
});

elements['scenario-cards-container'].addEventListener('click', async (event) => {
  const context = cardContext(event.target);
  if (!context) return;
  if (event.target.matches('[data-action="toggle-collapse"]')) {
    setScenarioCollapsed(context, !role(context, 'scenario-body').hidden);
  }
  if (event.target.matches('[data-action="duplicate"]')) await addScenarioCard(scenarioData(context), { insertAfter: context });
  if (event.target.matches('[data-action="delete"]')) {
    if (state.cards.length === 1) {
      setStatus('状況カードは最低1件必要です。');
      return;
    }
    state.cards.splice(state.cards.indexOf(context), 1);
    context.element.remove();
    state.cards.forEach((item, index) => role(item, 'scenario-title').value ||= `状況 ${index + 1}`);
    persistState();
  }
});

for (const input of document.querySelectorAll('input[name="calculation-mode"]')) input.addEventListener('change', updateMode);
elements['add-line-button'].addEventListener('click', addDurabilityLine);
elements['new-line-input'].addEventListener('input', (event) => {
  const normalized = normalizeNumericInputValue(event.target.value);
  if (normalized !== event.target.value) event.target.value = normalized;
});
elements['new-line-input'].addEventListener('focus', (event) => { if (event.target.value === '0') event.target.select(); });
elements['durability-lines-list'].addEventListener('click', (event) => {
  const index = Number.parseInt(event.target.dataset.lineIndex, 10);
  if (!Number.isInteger(index)) return;
  state.durabilityLines.splice(index, 1);
  renderDurabilityLines();
  persistState();
});
elements['add-scenario-button'].addEventListener('click', () => addScenarioCard(defaultScenario(state.cards.length)));
elements['expand-all-scenarios'].addEventListener('click', () => setAllScenariosCollapsed(false));
elements['collapse-all-scenarios'].addEventListener('click', () => setAllScenariosCollapsed(true));
elements['preview-button'].addEventListener('click', renderPreview);
elements['close-preview-button'].addEventListener('click', () => elements['preview-dialog'].close());
elements['update-button'].addEventListener('click', updateData);
elements['theme-button'].addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

async function initialize() {
  if (!core) throw new Error('計算コアを読み込めませんでした。');
  const saved = readSavedState();
  const savedTheme = saved?.theme === 'dark' || localStorage.getItem('dokkan_phase8_rc_theme') === 'dark' ? 'dark' : 'light';
  setTheme(savedTheme, { persist: false });
  if (!saved) {
    state.durabilityLines = [{ name: '完封', value: 0 }, { name: '70万', value: 700_000 }];
    state.savedCharacters = [];
    state.savedEnemies = [];
  }
  try {
    const recovery = await client.initialize();
    elements['data-version'].textContent = 'データ版: ' + client.store.active.datasetVersion;
    renderDurabilityLines();
    await recreateScenarioCards(saved?.currentScenarios ?? []);
    renderSavedDataSummary();
    state.initializing = false;
    persistState();
    const restoredEvent = role(state.cards[0], 'event-select').value;
    setStatus(restoredEvent || recovery.recovery.includes('restored') ? '準備完了' : '準備完了。被ダメージ計算ではイベントと敵を選んでください。');
    metrics.readyMs = performance.now() - metrics.startedAt;
    globalThis.__phase8Ready = true;
    globalThis.dispatchEvent(new CustomEvent('phase8-ready'));
  } catch (error) {
    console.error(error);
    setStatus('敵データを準備できませんでした。OneDrive backupはヘルプから確認できます。', true);
    globalThis.__phase8Error = true;
  }
}

globalThis.Phase8RC = {
  client,
  store,
  state,
  selectEvent: async (eventId) => selectEventForCard(state.cards[0], eventId),
  calculate: () => renderCard(state.cards[0]),
  currentEnemy: () => currentEnemyContext(state.cards[0])?.enemy ?? null,
  updateData,
  scenarioData: () => allScenarioData()
};

initialize();
