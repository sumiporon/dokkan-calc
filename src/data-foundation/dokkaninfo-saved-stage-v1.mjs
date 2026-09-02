/**
 * Pure DokkanInfo saved-stage -> Phase 4 candidate conversion helpers.
 *
 * This is intentionally network- and filesystem-free. It preserves the exact
 * Phase 4 conversion semantics so the Phase 11 browser prototype can reuse the
 * audited saved-HTML parser without duplicating or weakening its mappings.
 */

const PROVIDER = 'dokkaninfo-cache';
const REGION = 'jpnja';

function evidence(stageUrl, sourceFile, checkedAt, confidence = 'high', notes = '保存済みHTMLに表示された値。', sourcePathPrefix = 'scraper/html_cache/') {
  return {
    sourceUrl: stageUrl,
    sourceFile: sourceFile == null ? null : `${sourcePathPrefix}${sourceFile}`,
    checkedAt,
    confidence,
    notes
  };
}
function stateCollector() {
  const states = new Map();
  return {
    add(fieldPath, value, state, notes) {
      if (value === null && !states.has(fieldPath)) states.set(fieldPath, { fieldPath, state, notes });
    },
    list() {
      return [...states.values()].sort((left, right) => left.fieldPath.localeCompare(right.fieldPath, 'en'));
    }
  };
}

function makeEffect({
  effectId,
  kind,
  start = null,
  end = null,
  hpMinPercent = null,
  hpMaxPercent = null,
  appliesTo = 'enemy-stats',
  target = 'attack',
  operation = 'add-percent',
  value,
  cap = null,
  durationTurns = null,
  bracket = 'start-of-turn',
  sourceSkillId = null,
  rawText,
  confidence = 'medium'
}) {
  return {
    effectId,
    trigger: { kind, start, end, hpMinPercent, hpMaxPercent, raw: rawText },
    appliesTo,
    target,
    operation,
    value,
    cap,
    durationTurns,
    bracket,
    sourceSkillId,
    rawText,
    confidence
  };
}

function parsePercentEffects(sourceEnemy, occurrenceId) {
  const passiveEffects = [];
  const rateRules = [];
  let effectIndex = 0;
  const nextId = (label) => `${occurrenceId}:effect:${String(effectIndex++).padStart(2, '0')}:${label}`;

  for (const skill of sourceEnemy.skills) {
    const rawText = [skill.description, skill.valueText].filter(Boolean).join(' ');
    const compact = rawText.replace(/\s+/g, '');
    const sourceSkillId = skill.id == null ? null : String(skill.id);

    const turn = compact.match(/(?:(\d+)ターン目以降、?)?ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/i);
    if (turn) {
      passiveEffects.push(makeEffect({
        effectId: nextId('turn-atk'),
        kind: 'elapsed-turn',
        start: turn[1] ? Number(turn[1]) : 1,
        value: Number(turn[2]),
        cap: Number(turn[3]),
        sourceSkillId,
        rawText
      }));
    }

    const hit = compact.match(/(?:攻撃されるたびに?|攻撃を受けるたび)ATK(\d+)%UP\(最大(\d+)%\)/i);
    if (hit) {
      passiveEffects.push(makeEffect({
        effectId: nextId('received-hit-atk'),
        kind: 'received-hit-count',
        start: 1,
        value: Number(hit[1]),
        cap: Number(hit[2]),
        bracket: 'mid-battle',
        sourceSkillId,
        rawText
      }));
    }

    const hp = compact.match(/HP(\d+)%以下でATK(\d+)%UP/i);
    if (hp) {
      passiveEffects.push(makeEffect({
        effectId: nextId('hp-atk'),
        kind: 'hp-range',
        hpMinPercent: 0,
        hpMaxPercent: Number(hp[1]),
        value: Number(hp[2]),
        sourceSkillId,
        rawText
      }));
    }

    const appearance = /登場から(\d+)ターン目にATK(\d+)%UP/gi;
    let appearanceMatch;
    while ((appearanceMatch = appearance.exec(compact)) !== null) {
      passiveEffects.push(makeEffect({
        effectId: nextId('appearance-atk'),
        kind: 'appearance-turn',
        start: Number(appearanceMatch[1]),
        value: Number(appearanceMatch[2]),
        sourceSkillId,
        rawText
      }));
    }

    const criticalHp = compact.match(/HP(\d+)%以下で会心発動率(\d+)%UP/);
    if (criticalHp) {
      rateRules.push(makeEffect({
        effectId: nextId('critical-hp'),
        kind: 'hp-range',
        hpMinPercent: 0,
        hpMaxPercent: Number(criticalHp[1]),
        target: 'critical-rate',
        value: Number(criticalHp[2]),
        sourceSkillId,
        rawText
      }));
    }
    const criticalTurn = compact.match(/ターン経過ごとに会心発動率(\d+)%UP\(最大(\d+)%\)/);
    if (criticalTurn) {
      rateRules.push(makeEffect({
        effectId: nextId('critical-turn'),
        kind: 'elapsed-turn',
        start: 1,
        target: 'critical-rate',
        value: Number(criticalTurn[1]),
        cap: Number(criticalTurn[2]),
        sourceSkillId,
        rawText
      }));
    }
    if (!criticalHp && !criticalTurn) {
      const fixed = compact.match(/会心発動率(\d+)%UP/);
      if (fixed) {
        rateRules.push(makeEffect({
          effectId: nextId('critical-fixed'),
          kind: 'always',
          target: 'critical-rate',
          value: Number(fixed[1]),
          sourceSkillId,
          rawText
        }));
      }
    }
  }
  return { passiveEffects, rateRules, nextId };
}

function parseSuperEffects(superAttack, nextId) {
  const effects = [];
  const description = superAttack.description ?? '';
  const compact = description.replace(/\s+/g, '');
  let value = null;
  if (/ATK(?:とDEF)?が(?:超)?大幅(?:に)?上昇/.test(compact)) value = /超大幅/.test(compact) ? 100 : 50;
  else if (/ATK(?:とDEF)?が上昇/.test(compact)) value = 30;
  if (value != null) {
    const duration = Number(compact.match(/(\d+)ターンATK/)?.[1] ?? 1);
    effects.push(makeEffect({
      effectId: nextId('post-super-atk'),
      kind: 'after-super',
      appliesTo: 'subsequent-normal-attacks',
      value,
      durationTurns: duration,
      bracket: 'post-super',
      rawText: description,
      confidence: 'unconfirmed'
    }));
  }
  return effects;
}

function futureSuperAttack(superAttack, index, sourceEnemy, states, nextId) {
  const prefix = `attacks.superAttacks.${index}`;
  const displayedDamage = superAttack.damage;
  const derivedMultiplier = sourceEnemy.atk > 0 && displayedDamage != null
    ? displayedDamage / sourceEnemy.atk
    : null;
  const explicitCritical = /(会心が発動|必ず会心|高確率で会心)/.test(superAttack.description ?? '');
  const criticalOverride = explicitCritical
    ? { enabled: true, attackMultiplier: null, defenseIgnorePercent: null, rateRules: [] }
    : null;
  const output = {
    skillId: null,
    name: superAttack.name,
    description: superAttack.description,
    displayedDamage,
    derivedMultiplier,
    probabilityPercent: superAttack.probabilityPercent,
    maxPerTurn: superAttack.maxPerTurn,
    cooldownTurns: superAttack.cooldownTurns,
    slot: null,
    usageRules: superAttack.usageRules.map((rule) => ({ ...rule })),
    targetMode: 'unknown',
    attackType: superAttack.attackType,
    effectIcons: superAttack.effectIcons,
    effects: parseSuperEffects(superAttack, nextId),
    criticalOverride
  };
  for (const field of ['skillId', 'name', 'description', 'displayedDamage', 'derivedMultiplier', 'probabilityPercent', 'maxPerTurn', 'cooldownTurns', 'slot', 'attackType', 'criticalOverride']) {
    states.add(`${prefix}.${field}`, output[field], field === 'criticalOverride' ? 'not-applicable' : 'source-not-rendered', '保存HTMLにこの値が表示されていない。');
  }
  if (criticalOverride) {
    states.add(`${prefix}.criticalOverride.attackMultiplier`, criticalOverride.attackMultiplier, 'unconfirmed', '会心ATK倍率は保存HTMLから確定できない。');
    states.add(`${prefix}.criticalOverride.defenseIgnorePercent`, criticalOverride.defenseIgnorePercent, 'unconfirmed', '会心DEF無視率は保存HTMLから確定できない。');
  }
  output.usageRules.forEach((rule, ruleIndex) => {
    for (const field of ['hpMinPercent', 'hpMaxPercent', 'probabilityPercent', 'maxPerTurn', 'cooldownTurns']) {
      states.add(`${prefix}.usageRules.${ruleIndex}.${field}`, rule[field], 'source-not-rendered', 'このusage ruleに値が表示されていない。');
    }
  });
  return output;
}

function futureEnemy(sourceEnemy, context) {
  const occurrenceId = [
    context.providerKey ?? PROVIDER,
    context.region ?? REGION,
    context.eventId,
    context.stageId,
    sourceEnemy.encounterIndex,
    sourceEnemy.orderInEncounter
  ].join(':');
  const states = stateCollector();
  const parsed = parsePercentEffects(sourceEnemy, occurrenceId);
  const critical = {
    enabled: parsed.rateRules.length > 0 ? true : null,
    attackMultiplier: null,
    defenseIgnorePercent: null,
    rateRules: parsed.rateRules
  };
  const identity = {
    sourceEnemyId: null,
    cardId: sourceEnemy.cardId == null ? null : String(sourceEnemy.cardId),
    thumbId: sourceEnemy.thumbId == null ? null : String(sourceEnemy.thumbId),
    isEzaCardLink: sourceEnemy.isEzaCardLink
  };
  const stats = {
    hp: sourceEnemy.hp,
    baseAttack: sourceEnemy.atk,
    defense: sourceEnemy.def,
    damageReductionPercent: sourceEnemy.damageReductionPercent,
    maxAttacksPerTurn: sourceEnemy.maxAttacksPerTurn
  };
  for (const [field, value] of Object.entries(identity)) {
    states.add(`identity.${field}`, value, 'source-not-rendered', field === 'sourceEnemyId'
      ? '保存HTMLにcard/thumbとは別のenemy専用IDが表示されていない。'
      : '保存HTMLにこの識別値が表示されていない。');
  }
  for (const [field, value] of Object.entries(stats)) {
    states.add(`stats.${field}`, value, 'source-not-rendered', '保存HTMLのこの敵行にステータスが表示されていない。');
  }
  states.add('critical.enabled', critical.enabled, 'unconfirmed', '会心記述がないことだけでは会心なしと断定できない。');
  states.add('critical.attackMultiplier', critical.attackMultiplier, 'unconfirmed', '会心ATK倍率は保存HTMLから確定できない。');
  states.add('critical.defenseIgnorePercent', critical.defenseIgnorePercent, 'unconfirmed', '会心DEF無視率は保存HTMLから確定できない。');

  const superAttacks = sourceEnemy.superAttacks.map((attack, index) => futureSuperAttack(
    attack,
    index,
    sourceEnemy,
    states,
    parsed.nextId
  ));
  const skills = sourceEnemy.skills.map((skill, index) => {
    const rawText = [skill.description, skill.valueText].filter(Boolean).join(' ') || null;
    const output = {
      skillId: skill.id == null ? null : String(skill.id),
      description: skill.description || null,
      probabilityPercent: skill.probabilityPercent,
      icons: skill.icons,
      rawText
    };
    for (const field of ['skillId', 'description', 'probabilityPercent', 'rawText']) {
      states.add(`skills.${index}.${field}`, output[field], 'source-not-rendered', '保存HTMLのskill行にこの値が表示されていない。');
    }
    return output;
  });
  return {
    occurrenceId,
    orderInEncounter: sourceEnemy.orderInEncounter,
    identity,
    name: sourceEnemy.name,
    type: sourceEnemy.type ?? 'unknown',
    alignment: sourceEnemy.class ?? 'unknown',
    stats,
    attacks: { superAttacks },
    passiveEffects: parsed.passiveEffects,
    critical,
    skills,
    evidence: evidence(context.stageUrl, sourceEnemy.sourceFile, context.checkedAt, 'high', '保存済みHTMLに表示された値。', context.sourcePathPrefix),
    fieldStates: states.list(),
    raw: {
      cardHref: sourceEnemy.cardHref,
      rarity: sourceEnemy.rarity,
      thumbSource: sourceEnemy.thumbSource,
      typeIconId: sourceEnemy.typeIconId,
      typeIconSource: sourceEnemy.typeIconSource,
      sourceAreaDamage: sourceEnemy.areaDamage,
      sourceSuperAttacks: sourceEnemy.superAttacks.map((attack) => ({
        attackTypeIcon: attack.attackTypeIcon,
        rawText: attack.rawText,
        usageRules: attack.usageRules
      }))
    }
  };
}

function actionKind(type) {
  if (type === 'ノーマル') return 'normal';
  if (type === '必殺技') return 'super';
  if (type === 'カウントダウン') return 'countdown';
  if (type === 'ヒール') return 'heal';
  return 'other';
}

export function futureEncounter(group, context) {
  const enemies = group.enemies.map((enemy) => futureEnemy(enemy, context));
  const byOrder = new Map(enemies.map((enemy) => [enemy.orderInEncounter, enemy]));
  const aiActions = group.actionSequences.flatMap((sequence) => sequence.actions.map((action) => ({
    sequenceIndex: action.sequenceIndex,
    sourceOrder: action.sourceOrder,
    kind: actionKind(action.type),
    enemyOrder: action.enemyOrder,
    slot: action.slot,
    probabilityPercent: action.probabilityPercent,
    hpMinPercent: null,
    hpMaxPercent: null,
    maxUses: null,
    cooldownTurns: null,
    rawText: action.rawText
  })));

  const rowAreaSources = group.enemies.filter((enemy) => enemy.areaDamage != null);
  const makeAreaAttack = (area, sourceEnemy = null) => {
    const areaSource = sourceEnemy == null ? null : byOrder.get(sourceEnemy.orderInEncounter);
    return {
      sourceOccurrenceId: areaSource?.occurrenceId ?? null,
      attackKind: 'unknown',
      maxPerTurn: area.maxPerTurn,
      firstTargetDamage: area.firstTargetDamage,
      additionalTargetDamage: area.additionalTargetDamage,
      firstTargetMultiplierDerived: areaSource?.stats.baseAttack > 0 && area.firstTargetDamage != null
        ? area.firstTargetDamage / areaSource.stats.baseAttack
        : null,
      additionalTargetMultiplierDerived: areaSource?.stats.baseAttack > 0 && area.additionalTargetDamage != null
        ? area.additionalTargetDamage / areaSource.stats.baseAttack
        : null,
      targetMode: 'selected-and-others',
      evidence: evidence(
        context.stageUrl,
        sourceEnemy?.sourceFile ?? group.enemies[0]?.sourceFile ?? context.sourceFile,
        context.checkedAt,
        areaSource ? 'high' : 'unconfirmed',
        areaSource
          ? '同じ敵行に表示されたAOE元値。倍率はその行の基礎ATKから派生。'
          : 'encounterにはAOE表示があるが、元敵を一意に関連付けられない。',
        context.sourcePathPrefix
      ),
      rawText: `エリア/ターン: ${area.maxPerTurn}; エリアダメージ 1: ${area.firstTargetDamage}; エリアダメージ 2+: ${area.additionalTargetDamage}`
    };
  };
  // Six encounters render more than one AOE-capable enemy. Preserve all 75
  // row-level AOE records instead of collapsing them to the first of 65 groups.
  const areaAttacks = rowAreaSources.length > 0
    ? rowAreaSources.map((sourceEnemy) => makeAreaAttack(sourceEnemy.areaDamage, sourceEnemy))
    : group.areaDamage == null ? [] : [makeAreaAttack(group.areaDamage)];
  return {
    encounterIndex: group.encounterIndex,
    phaseId: null,
    layoutKind: 'unknown',
    enemies,
    aiActions,
    areaAttacks
  };
}
