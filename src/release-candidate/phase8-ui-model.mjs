const TYPE_LABELS = Object.freeze({ agl: '速', teq: '技', int: '知', str: '力', phy: '体' });
const ALIGNMENT_LABELS = Object.freeze({ super: '超', extreme: '極', neutral: '中立' });

export function known(field, fallback = null) {
  return field?.state === 'known' ? field.value : fallback;
}

export function japaneseType(alignment, type) {
  const alignmentLabel = ALIGNMENT_LABELS[alignment] ?? '属性不明';
  const typeLabel = TYPE_LABELS[type] ?? '不明';
  return alignment === 'neutral'
    ? `中立（${typeLabel}属性）`
    : `${alignmentLabel}${typeLabel}`;
}

export function normalizeNumericInputValue(value) {
  const text = String(value ?? '');
  if (text === '' || text === '-' || /^-?0(?:\.\d*)?$/.test(text)) return text;
  const match = text.match(/^(-?)0+(\d.*)$/);
  if (!match) return text;
  return `${match[1]}${match[2].replace(/^0+(?=\d)/, '')}`;
}

function knownNumber(field, fallback = 0) {
  const value = Number(known(field, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function relevantEffects(enemy) {
  return (enemy?.passiveEffects ?? []).filter((effect) =>
    effect.appliesTo === 'enemy-stats'
    && effect.target === 'attack'
    && effect.operation === 'add-percent'
    && effect.value?.state === 'known'
  );
}

function sortedUnique(values) {
  return [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right);
}

function turnOptions(effects) {
  const timed = effects.filter((effect) => ['elapsed-turn', 'appearance-turn'].includes(effect.trigger.kind));
  if (timed.length === 0) return [{ value: 1, label: '1ターン' }];
  const candidates = [1];
  for (const effect of timed) {
    const start = Math.max(1, Math.floor(knownNumber(effect.trigger.start, 1)));
    candidates.push(start);
    if (start > 1) candidates.push(start - 1);
    if (effect.trigger.kind === 'elapsed-turn') {
      const value = Math.abs(knownNumber(effect.value));
      const cap = Math.abs(knownNumber(effect.cap));
      if (value > 0 && cap > 0) candidates.push(start + Math.max(0, Math.ceil(cap / value) - 1));
    }
    const end = knownNumber(effect.trigger.end, 0);
    if (end > 0) candidates.push(Math.floor(end), Math.floor(end) + 1);
  }
  return sortedUnique(candidates.filter((value) => value >= 1)).map((value) => ({ value, label: `${value}ターン` }));
}

function hitOptions(effects) {
  const hitEffects = effects.filter((effect) => effect.trigger.kind === 'received-hit-count');
  if (hitEffects.length === 0) return [{ value: 0, label: '被弾0回' }];
  const candidates = [0];
  for (const effect of hitEffects) {
    const start = Math.max(1, Math.floor(knownNumber(effect.trigger.start, 1)));
    const value = Math.abs(knownNumber(effect.value));
    const cap = Math.abs(knownNumber(effect.cap));
    candidates.push(start);
    if (value > 0 && cap > 0) candidates.push(start + Math.max(0, Math.ceil(cap / value) - 1));
  }
  return sortedUnique(candidates).map((value) => ({ value, label: `被弾${value}回` }));
}

function hpOptions(effects, usageRules = []) {
  const hpEffects = effects.filter((effect) => effect.trigger.kind === 'hp-range');
  if (hpEffects.length === 0 && usageRules.length === 0) return [{ value: 100, label: 'HP100%' }];
  const candidates = [0, 100];
  const ranges = [
    ...hpEffects.map((effect) => ({ minimum: effect.trigger.hpMinPercent, maximum: effect.trigger.hpMaxPercent })),
    ...usageRules.map((rule) => ({ minimum: rule.hpMinPercent, maximum: rule.hpMaxPercent }))
  ];
  for (const range of ranges) {
    const minimum = knownNumber(range.minimum, 0);
    const maximum = knownNumber(range.maximum, 100);
    candidates.push(minimum, maximum);
    if (minimum > 0) candidates.push(Math.max(0, minimum - 0.01));
    if (maximum < 100) candidates.push(Math.min(100, maximum + 0.01));
  }
  return sortedUnique(candidates.filter((value) => value >= 0 && value <= 100)).map((value) => ({
    value,
    label: `HP${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '')}%`
  }));
}

export function enemyConditionDimensions(enemy) {
  const effects = relevantEffects(enemy);
  const usageRules = (enemy?.superAttacks ?? []).flatMap((attack) => attack.usageRules ?? []);
  return {
    turns: turnOptions(effects),
    hits: hitOptions(effects),
    hp: hpOptions(effects, usageRules),
    hasConditions: effects.length > 0 || usageRules.length > 0
  };
}

function effectPercent(effect, state) {
  const value = knownNumber(effect.value);
  const cap = knownNumber(effect.cap, Number.POSITIVE_INFINITY);
  const start = Math.max(1, Math.floor(knownNumber(effect.trigger.start, 1)));
  const end = knownNumber(effect.trigger.end, Number.POSITIVE_INFINITY);
  if (effect.trigger.kind === 'elapsed-turn') {
    if (state.turn < start || state.turn > end) return 0;
    return Math.min(cap, value * (state.turn - start + 1));
  }
  if (effect.trigger.kind === 'received-hit-count') {
    if (state.hits < start || state.hits > end) return 0;
    return Math.min(cap, value * (state.hits - start + 1));
  }
  if (effect.trigger.kind === 'hp-range') {
    const minimum = knownNumber(effect.trigger.hpMinPercent, 0);
    const maximum = knownNumber(effect.trigger.hpMaxPercent, 100);
    return state.hp >= minimum && state.hp <= maximum ? value : 0;
  }
  if (effect.trigger.kind === 'appearance-turn') {
    return state.turn >= start && state.turn <= end ? value : 0;
  }
  return 0;
}

export function enemyAttackState(enemy, state, core) {
  const effects = relevantEffects(enemy);
  let startOfTurnPercent = 0;
  let receivedHitPercent = 0;
  for (const effect of effects) {
    const percent = effectPercent(effect, state);
    if (effect.bracket === 'mid-battle') receivedHitPercent += percent;
    else startOfTurnPercent += percent;
  }
  const apply = (base) => {
    const atTurnStart = core.applyPercentAndFloor(base, startOfTurnPercent);
    return core.applyPercentAndFloor(atTurnStart, receivedHitPercent);
  };
  const normal = apply(knownNumber(enemy.baseAttack));
  const postSuperPercents = (enemy.superAttacks ?? []).flatMap((attack) => attack.effects ?? [])
    .filter((effect) => effect.appliesTo === 'subsequent-normal-attacks' && effect.target === 'attack' && effect.operation === 'add-percent')
    .map((effect) => knownNumber(effect.value))
    .filter((value) => value !== 0);
  const normalValues = [normal, ...postSuperPercents.map((percent) => core.applyPercentAndFloor(normal, percent))];
  const supers = (enemy.superAttacks ?? []).map((attack) => ({
    id: attack.id,
    name: String(known(attack.name, '必殺技')),
    value: apply(knownNumber(attack.displayedDamage))
  }));
  return { normalValues, supers, startOfTurnPercent, receivedHitPercent };
}

export function enumerateValidEnemyStates(enemy, core) {
  const dimensions = enemyConditionDimensions(enemy);
  const states = [];
  for (const turn of dimensions.turns) {
    for (const hits of dimensions.hits) {
      for (const hp of dimensions.hp) {
        const state = { turn: turn.value, hits: hits.value, hp: hp.value };
        states.push({ state, attacks: enemyAttackState(enemy, state, core) });
      }
    }
  }
  return states;
}

export function superAttackAvailableInState(attack, state) {
  const rules = Array.isArray(attack?.usageRules) ? attack.usageRules : [];
  if (rules.length === 0) return true;
  return rules.some((rule) => {
    const minimum = knownNumber(rule.hpMinPercent, 0);
    const maximum = knownNumber(rule.hpMaxPercent, 100);
    return state.hp >= minimum && state.hp <= maximum;
  });
}

function rangeOf(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length === 0 ? null : { minimum: Math.min(...finite), maximum: Math.max(...finite) };
}

export function enemyAttackRanges(enemy, core) {
  const states = enumerateValidEnemyStates(enemy, core);
  const normal = rangeOf(states.flatMap((entry) => entry.attacks.normalValues));
  const supers = (enemy.superAttacks ?? []).map((attack) => ({
    id: attack.id,
    name: String(known(attack.name, '必殺技')),
    range: rangeOf(states
      .filter((entry) => superAttackAvailableInState(attack, entry.state))
      .map((entry) => entry.attacks.supers.find((item) => item.id === attack.id)?.value))
  }));
  return { normal, supers, validStateCount: states.length };
}

export function formatAttackRange(range) {
  if (!range) return '不明';
  const minimum = Math.floor(range.minimum).toLocaleString();
  const maximum = Math.floor(range.maximum).toLocaleString();
  return range.minimum === range.maximum ? minimum : `${minimum}～${maximum}`;
}

export function describeImportedStorage(saved = {}) {
  const characters = Array.isArray(saved.savedCharacters) ? saved.savedCharacters : [];
  const currentScenarios = Array.isArray(saved.currentScenarios) ? saved.currentScenarios : [];
  const manualEnemies = Array.isArray(saved.savedEnemies)
    ? saved.savedEnemies.reduce((total, eventType) => total + (eventType.series ?? []).reduce(
      (seriesTotal, series) => seriesTotal + (series.stages ?? []).reduce(
        (stageTotal, stage) => stageTotal + (stage.bosses?.length ?? 0), 0
      ), 0
    ), 0)
    : 0;
  const savedScenarios = characters.reduce((total, character) => total + (character.scenarios?.length ?? 0), 0);
  const settings = [Array.isArray(saved.durabilityLines), typeof saved.theme === 'string'].filter(Boolean).length;
  return {
    characters: characters.length,
    characterNames: characters.map((character) => character.name).filter(Boolean),
    savedScenarios,
    currentScenarios: currentScenarios.length,
    manualEnemies,
    settings
  };
}
