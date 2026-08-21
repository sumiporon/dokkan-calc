function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getPathValue(root, fieldPath) {
  return String(fieldPath).split('.').reduce((value, segment) => {
    if (value == null) return undefined;
    const key = /^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment;
    return value[key];
  }, root);
}

function collectEffects(enemy) {
  const effects = [...(enemy.passiveEffects ?? []), ...(enemy.critical?.rateRules ?? [])];
  for (const superAttack of enemy.attacks?.superAttacks ?? []) {
    effects.push(...(superAttack.effects ?? []));
    effects.push(...(superAttack.criticalOverride?.rateRules ?? []));
  }
  return effects;
}

function countDataset(dataset) {
  const counts = {
    events: 0,
    stages: 0,
    encounters: 0,
    enemies: 0,
    skills: 0,
    passiveEffects: 0,
    superAttacks: 0,
    superEffects: 0,
    configuredCriticalProfiles: 0,
    aiActions: 0,
    areaAttacks: 0,
    fieldStates: 0
  };
  for (const event of dataset.events ?? []) {
    counts.events += 1;
    for (const stage of event.stages ?? []) {
      counts.stages += 1;
      for (const encounter of stage.encounters ?? []) {
        counts.encounters += 1;
        counts.aiActions += (encounter.aiActions ?? []).length;
        counts.areaAttacks += (encounter.areaAttacks ?? []).length;
        counts.enemies += (encounter.enemies ?? []).length;
        for (const enemy of encounter.enemies ?? []) {
          counts.skills += (enemy.skills ?? []).length;
          counts.passiveEffects += (enemy.passiveEffects ?? []).length;
          counts.fieldStates += (enemy.fieldStates ?? []).length;
          counts.superAttacks += (enemy.attacks?.superAttacks ?? []).length;
          counts.superEffects += (enemy.attacks?.superAttacks ?? []).reduce(
            (sum, superAttack) => sum + (superAttack.effects ?? []).length,
            0
          );
          if (
            enemy.critical?.enabled != null
            || enemy.critical?.attackMultiplier != null
            || enemy.critical?.defenseIgnorePercent != null
            || (enemy.critical?.rateRules ?? []).length > 0
          ) {
            counts.configuredCriticalProfiles += 1;
          }
        }
      }
    }
  }
  return counts;
}

export function auditFutureEnemyDataset(dataset, options = {}) {
  const errors = [];
  const addError = (code, path, message) => errors.push({ code, path, message });
  const provider = dataset.sourceSnapshot?.provider;
  const region = dataset.sourceSnapshot?.region;
  const eventIds = new Set();
  const stageKeys = new Set();
  const occurrenceIds = new Set();
  const occurrences = new Map();
  if ((dataset.events ?? []).length === 0) {
    addError('EMPTY_DATASET', 'events', 'datasetにイベントがありません。');
  }

  for (const [eventIndex, event] of (dataset.events ?? []).entries()) {
    const eventPath = `events.${eventIndex}`;
    if (eventIds.has(event.eventId)) {
      addError('DUPLICATE_EVENT_ID', `${eventPath}.eventId`, `eventId ${event.eventId} が重複しています。`);
    }
    eventIds.add(event.eventId);
    if ((event.stages ?? []).length === 0) {
      addError('EMPTY_EVENT', `${eventPath}.stages`, 'イベントにステージがありません。');
    }

    for (const [stageIndex, stage] of (event.stages ?? []).entries()) {
      const stagePath = `${eventPath}.stages.${stageIndex}`;
      const stageKey = `${event.eventId}:${stage.stageId}`;
      if (stageKeys.has(stageKey)) {
        addError('DUPLICATE_STAGE_ID', `${stagePath}.stageId`, `stage key ${stageKey} が重複しています。`);
      }
      stageKeys.add(stageKey);
      if ((stage.encounters ?? []).length === 0) {
        addError('EMPTY_STAGE', `${stagePath}.encounters`, 'ステージにencounterがありません。');
      }

      const encounterIndexes = new Set();
      for (const [encounterArrayIndex, encounter] of (stage.encounters ?? []).entries()) {
        const encounterPath = `${stagePath}.encounters.${encounterArrayIndex}`;
        if (encounterIndexes.has(encounter.encounterIndex)) {
          addError('DUPLICATE_ENCOUNTER_INDEX', `${encounterPath}.encounterIndex`, 'encounterIndexが重複しています。');
        }
        encounterIndexes.add(encounter.encounterIndex);

        const enemies = encounter.enemies ?? [];
        if (enemies.length === 0) {
          addError('EMPTY_ENCOUNTER', `${encounterPath}.enemies`, 'encounterに敵がありません。');
        }
        const orderSet = new Set();
        for (const [enemyArrayIndex, enemy] of enemies.entries()) {
          const enemyPath = `${encounterPath}.enemies.${enemyArrayIndex}`;
          if (orderSet.has(enemy.orderInEncounter)) {
            addError('DUPLICATE_ENEMY_ORDER', `${enemyPath}.orderInEncounter`, '同じencounter内で出現順が重複しています。');
          }
          orderSet.add(enemy.orderInEncounter);

          const expectedOccurrenceId = [
            provider,
            region,
            event.eventId,
            stage.stageId,
            encounter.encounterIndex,
            enemy.orderInEncounter
          ].join(':');
          if (enemy.occurrenceId !== expectedOccurrenceId) {
            addError('OCCURRENCE_ID_MISMATCH', `${enemyPath}.occurrenceId`, `期待値は ${expectedOccurrenceId} です。`);
          }
          if (occurrenceIds.has(enemy.occurrenceId)) {
            addError('DUPLICATE_OCCURRENCE_ID', `${enemyPath}.occurrenceId`, 'occurrenceIdが重複しています。');
          }
          occurrenceIds.add(enemy.occurrenceId);
          occurrences.set(enemy.occurrenceId, enemy);

          const statePaths = new Set();
          for (const [stateIndex, state] of (enemy.fieldStates ?? []).entries()) {
            if (statePaths.has(state.fieldPath)) {
              addError('DUPLICATE_FIELD_STATE', `${enemyPath}.fieldStates.${stateIndex}.fieldPath`, '同じfieldPathの状態が重複しています。');
            }
            statePaths.add(state.fieldPath);
          }
          const requireNullState = (fieldPath, value) => {
            if (value === null && !statePaths.has(fieldPath)) {
              addError('MISSING_NULL_REASON', `${enemyPath}.${fieldPath}`, 'nullの理由がfieldStatesにありません。');
            }
          };
          for (const fieldPath of [
            'identity.sourceEnemyId',
            'identity.cardId',
            'identity.thumbId',
            'identity.isEzaCardLink',
            'stats.hp',
            'stats.baseAttack',
            'stats.defense',
            'stats.damageReductionPercent',
            'stats.maxAttacksPerTurn',
            'critical.enabled',
            'critical.attackMultiplier',
            'critical.defenseIgnorePercent'
          ]) {
            requireNullState(fieldPath, getPathValue(enemy, fieldPath));
          }

          for (const [superIndex, superAttack] of (enemy.attacks?.superAttacks ?? []).entries()) {
            const superPrefix = `attacks.superAttacks.${superIndex}`;
            for (const fieldName of [
              'skillId',
              'name',
              'description',
              'displayedDamage',
              'derivedMultiplier',
              'probabilityPercent',
              'maxPerTurn',
              'cooldownTurns',
              'slot',
              'attackType',
              'criticalOverride'
            ]) {
              requireNullState(`${superPrefix}.${fieldName}`, superAttack[fieldName]);
            }
            if (
              superAttack.derivedMultiplier != null
              && (enemy.stats?.baseAttack == null || superAttack.displayedDamage == null)
            ) {
              addError('DERIVED_VALUE_WITHOUT_SOURCE', `${enemyPath}.${superPrefix}.derivedMultiplier`, '基礎ATKと表示ダメージが揃わない状態で派生倍率を保存できません。');
            }
            if (
              enemy.stats?.baseAttack > 0
              && superAttack.displayedDamage != null
              && superAttack.derivedMultiplier != null
            ) {
              const derived = superAttack.displayedDamage / enemy.stats.baseAttack;
              if (Math.abs(derived - superAttack.derivedMultiplier) > 0.005) {
                addError('SUPER_MULTIPLIER_MISMATCH', `${enemyPath}.${superPrefix}.derivedMultiplier`, '表示ダメージと基礎ATKから導いた倍率に一致しません。');
              }
            }
            if (superAttack.criticalOverride) {
              for (const fieldName of ['enabled', 'attackMultiplier', 'defenseIgnorePercent']) {
                requireNullState(
                  `${superPrefix}.criticalOverride.${fieldName}`,
                  superAttack.criticalOverride[fieldName]
                );
              }
            }
          }

          for (const [skillIndex, skill] of (enemy.skills ?? []).entries()) {
            for (const fieldName of ['skillId', 'description', 'probabilityPercent', 'rawText']) {
              requireNullState(`skills.${skillIndex}.${fieldName}`, skill[fieldName]);
            }
          }

          for (const effect of collectEffects(enemy)) {
            const minimum = effect.trigger?.hpMinPercent;
            const maximum = effect.trigger?.hpMaxPercent;
            if (minimum != null && maximum != null && minimum > maximum) {
              addError('INVALID_HP_RANGE', `${enemyPath}.passiveEffects`, 'HP条件の下限が上限を超えています。');
            }
          }
        }

        const sortedOrders = [...orderSet].sort((left, right) => left - right);
        sortedOrders.forEach((order, index) => {
          if (order !== index) {
            addError('ENEMY_ORDER_GAP', `${encounterPath}.enemies`, 'orderInEncounterは0からの連番である必要があります。');
          }
        });

        const actionSequences = new Map();
        for (const [actionIndex, action] of (encounter.aiActions ?? []).entries()) {
          const actionPath = `${encounterPath}.aiActions.${actionIndex}`;
          const sequence = actionSequences.get(action.sequenceIndex) ?? [];
          sequence.push({ action, actionPath });
          actionSequences.set(action.sequenceIndex, sequence);
          if (action.enemyOrder != null && !orderSet.has(action.enemyOrder)) {
            addError('AI_ENEMY_REFERENCE_MISSING', `${actionPath}.enemyOrder`, 'AI actionのenemyOrderがencounter内に存在しません。');
          }
          if (
            action.hpMinPercent != null
            && action.hpMaxPercent != null
            && action.hpMinPercent > action.hpMaxPercent
          ) {
            addError('INVALID_AI_HP_RANGE', actionPath, 'AI actionのHP下限が上限を超えています。');
          }
        }

        [...actionSequences.keys()].sort((left, right) => left - right).forEach((sequenceIndex, index) => {
          if (sequenceIndex !== index) {
            addError('AI_ACTION_SEQUENCE_GAP', `${encounterPath}.aiActions`, 'AI actionのsequenceIndexは0からの連番である必要があります。');
          }
        });

        for (const [sequenceIndex, sequence] of actionSequences) {
          const positions = new Set();
          const sourceOrders = new Set();
          const referencedEnemies = new Set();
          for (const { action, actionPath } of sequence) {
            const slotKey = action.slot == null ? 'none' : action.slot;
            const positionKey = `${action.sourceOrder}:${slotKey}`;
            if (positions.has(positionKey)) {
              addError('DUPLICATE_AI_ACTION_POSITION', `${actionPath}.sourceOrder`, '同じAI sequence内でsourceOrderとslotの組が重複しています。');
            }
            positions.add(positionKey);
            sourceOrders.add(action.sourceOrder);
            if (action.enemyOrder != null) referencedEnemies.add(action.enemyOrder);
          }
          if (referencedEnemies.size > 1) {
            addError('AI_SEQUENCE_ENEMY_MISMATCH', `${encounterPath}.aiActions`, `sequenceIndex ${sequenceIndex} が複数の敵を参照しています。`);
          }
          [...sourceOrders].sort((left, right) => left - right).forEach((sourceOrder, index) => {
            if (sourceOrder !== index + 1) {
              addError('AI_ACTION_SOURCE_ORDER_GAP', `${encounterPath}.aiActions`, `sequenceIndex ${sequenceIndex} のsourceOrderは元表示どおり1からの連番である必要があります。`);
            }
          });
        }

        const encounterOccurrences = new Map(enemies.map((enemy) => [enemy.occurrenceId, enemy]));
        for (const [areaIndex, areaAttack] of (encounter.areaAttacks ?? []).entries()) {
          const areaPath = `${encounterPath}.areaAttacks.${areaIndex}`;
          const sourceEnemy = areaAttack.sourceOccurrenceId == null
            ? null
            : encounterOccurrences.get(areaAttack.sourceOccurrenceId);
          if (areaAttack.sourceOccurrenceId != null && !sourceEnemy) {
            addError('AREA_SOURCE_MISSING', `${areaPath}.sourceOccurrenceId`, 'AOE派生値の元となる敵がencounter内にありません。');
          }
          for (const [damageField, multiplierField] of [
            ['firstTargetDamage', 'firstTargetMultiplierDerived'],
            ['additionalTargetDamage', 'additionalTargetMultiplierDerived']
          ]) {
            const damage = areaAttack[damageField];
            const multiplier = areaAttack[multiplierField];
            if (multiplier != null && (!sourceEnemy || sourceEnemy.stats?.baseAttack == null || damage == null)) {
              addError('DERIVED_VALUE_WITHOUT_SOURCE', `${areaPath}.${multiplierField}`, 'AOE派生倍率の元敵・基礎ATK・表示ダメージが揃っていません。');
            } else if (multiplier != null) {
              const derived = damage / sourceEnemy.stats.baseAttack;
              if (Math.abs(derived - multiplier) > 0.005) {
                addError('AREA_MULTIPLIER_MISMATCH', `${areaPath}.${multiplierField}`, 'AOE表示ダメージと基礎ATKから導いた倍率に一致しません。');
              }
            }
          }
        }
      }
    }
  }

  const correctionIds = new Set();
  const correctionTargets = new Set();
  for (const [correctionIndex, correction] of (dataset.manualCorrections ?? []).entries()) {
    const correctionPath = `manualCorrections.${correctionIndex}`;
    if (correctionIds.has(correction.correctionId)) {
      addError('DUPLICATE_CORRECTION_ID', `${correctionPath}.correctionId`, 'correctionIdが重複しています。');
    }
    correctionIds.add(correction.correctionId);
    const targetKey = `${correction.target?.occurrenceId}:${correction.target?.fieldPath}`;
    if (correctionTargets.has(targetKey)) {
      addError('DUPLICATE_CORRECTION_TARGET', `${correctionPath}.target`, '同じ敵・fieldへの補正が競合しています。');
    }
    correctionTargets.add(targetKey);
    const targetEnemy = occurrences.get(correction.target?.occurrenceId);
    if (!targetEnemy) {
      addError('CORRECTION_TARGET_MISSING', `${correctionPath}.target.occurrenceId`, '補正対象の安定IDがデータ内にありません。');
      continue;
    }
    if (correction.sourceDatasetId !== dataset.datasetId) {
      addError('CORRECTION_DATASET_MISMATCH', `${correctionPath}.sourceDatasetId`, '補正対象datasetIdが一致しません。');
    }
    if (
      !dataset.sourceSnapshot?.contentDigest
      || correction.sourceContentDigest !== dataset.sourceSnapshot.contentDigest
    ) {
      addError('CORRECTION_DIGEST_MISMATCH', `${correctionPath}.sourceContentDigest`, '補正対象のsource digestが一致しません。');
    }
    const currentValue = getPathValue(targetEnemy, correction.target.fieldPath);
    if (!sameJsonValue(currentValue, correction.expectedOriginalValue)) {
      addError('CORRECTION_ORIGINAL_VALUE_MISMATCH', `${correctionPath}.expectedOriginalValue`, '補正前の期待値が現在値と一致しません。');
    }
  }

  const counts = countDataset(dataset);
  if (options.baseline?.counts) {
    const allowedDropRatio = 1 - (options.allowedDropPercent ?? 5) / 100;
    for (const key of Object.keys(counts)) {
      const baselineCount = options.baseline.counts[key] ?? 0;
      if (baselineCount > 0 && counts[key] < baselineCount * allowedDropRatio) {
        addError('COUNT_DROP', key, `${key} が基準 ${baselineCount} から ${counts[key]} へ急減しました。`);
      }
    }
  }

  return { counts, errors };
}
