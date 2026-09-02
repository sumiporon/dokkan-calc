import { load } from 'cheerio/lib/slim';

const TYPE_MAP = ['agl', 'teq', 'int', 'str', 'phy'];

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseInteger(value) {
  if (value == null) return null;
  const parsed = Number.parseInt(String(value).replace(/,/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimal(value) {
  if (value == null) return null;
  const parsed = Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function matchInteger(text, pattern) {
  return parseInteger(text.match(pattern)?.[1]);
}

function matchDecimal(text, pattern) {
  return parseDecimal(text.match(pattern)?.[1]);
}

function parseTypeIcon(source) {
  const iconId = parseInteger(source?.match(/cha_type_icon_(\d+)/)?.[1]);
  if (iconId == null) return { typeIconId: null, class: null, type: null };
  const classId = Math.floor(iconId / 10);
  return {
    typeIconId: iconId,
    // 0x icons are rendered for enemies that are neither Super nor Extreme.
    // The legacy parser silently defaulted these to Extreme; keep them explicit.
    class: classId === 0 ? 'neutral' : classId === 1 ? 'super' : classId === 2 ? 'extreme' : null,
    type: TYPE_MAP[iconId % 10] ?? null
  };
}

function parseSkills($, skillColumn) {
  const skills = [];
  skillColumn.children('.row.align-items-center.padding-top-bottom-1').each((index, element) => {
    const skill = $(element);
    const debugText = compactText(skill.find('.debug-info').first().text());
    const id = parseInteger(debugText.match(/ID:\s*(\d+)/i)?.[1]);
    const main = skill.find('.col-sm-9').first().clone();
    main.find('.debug-info').remove();
    const description = compactText(main.text());
    const valueColumn = skill.children('.col-sm-3').first();
    const valueText = compactText(valueColumn.text());
    const icons = valueColumn.find('img').map((_, image) => ({
      alt: $(image).attr('alt') || null,
      src: $(image).attr('src') || null
    })).get();
    skills.push({
      order: index,
      id,
      description,
      valueText: valueText || null,
      probabilityPercent: matchDecimal(valueText, /([\d.]+)%/),
      icons
    });
  });
  return skills;
}

function emptySuperAttack() {
  return {
    name: null,
    description: null,
    damage: null,
    multiplier: null,
    probabilityPercent: null,
    maxPerTurn: null,
    cooldownTurns: null,
    attackType: null,
    attackTypeIcon: null,
    effectIcons: [],
    usageRules: [],
    rawText: null
  };
}

function parseSuperAttackUsageRules($, segmentNodes) {
  const rules = [];
  let currentNodes = null;
  for (const node of segmentNodes) {
    const nodeText = compactText($(node).text());
    if (/^HPレンジ\s*:/.test(nodeText)) {
      if (currentNodes) rules.push(currentNodes);
      currentNodes = [node];
    } else if (currentNodes) {
      currentNodes.push(node);
    }
  }
  if (currentNodes) rules.push(currentNodes);

  return rules.map((nodes, sourceIndex) => {
    const rawText = compactText($(nodes).text());
    const hpRange = rawText.match(/HPレンジ\s*:\s*([\d.]+)%\s*~\s*([\d.]+)%/);
    return {
      sourceOrder: sourceIndex + 1,
      hpMinPercent: hpRange ? parseDecimal(hpRange[1]) : null,
      hpMaxPercent: hpRange ? parseDecimal(hpRange[2]) : null,
      probabilityPercent: matchDecimal(rawText, /パーセンテージ:\s*([\d.]+)%/),
      maxPerTurn: matchInteger(rawText, /最大ATK\/ターン:\s*([\d,]+)/),
      cooldownTurns: matchInteger(rawText, /再使用までの時間:\s*([\d,]+)/),
      rawText
    };
  });
}

function parseSuperAttackSegment($, segmentNodes, atk) {
  const segment = $(segmentNodes);
  const segmentText = compactText(segment.text());
  if (!segmentText) return null;

  const usageRules = parseSuperAttackUsageRules($, segmentNodes);
  const firstUsageRuleIndex = segmentNodes.findIndex((node) => /^HPレンジ\s*:/.test(compactText($(node).text())));
  const baseNodes = firstUsageRuleIndex < 0 ? segmentNodes : segmentNodes.slice(0, firstUsageRuleIndex);
  const baseSegment = $(baseNodes);
  const baseText = compactText(baseSegment.text());

  const descriptionRow = baseSegment.find('.row.align-items-center').first();
  const description = compactText(descriptionRow.children('.col-sm').first().text());
  const attackTypeImage = baseSegment.find('img[src*="sp_skill_icon_"]').first();
  const attackTypeSource = attackTypeImage.attr('src') || null;
  const damage = matchInteger(baseText, /ダメージ:\s*([\d,]+)/);

  return {
    name: baseSegment.find('b').first().text().trim() || null,
    description: description || null,
    damage,
    multiplier: atk > 0 && damage != null ? damage / atk : null,
    probabilityPercent: matchDecimal(baseText, /パーセンテージ:\s*([\d.]+)%/),
    maxPerTurn: matchInteger(baseText, /最大ATK\/ターン:\s*([\d,]+)/),
    cooldownTurns: matchInteger(baseText, /再使用までの時間:\s*([\d,]+)/),
    attackType: attackTypeImage.attr('alt') || attackTypeSource?.match(/sp_skill_icon_([^./]+)/)?.[1] || null,
    attackTypeIcon: attackTypeSource,
    effectIcons: descriptionRow.find('img').map((_, image) => ({
      alt: $(image).attr('alt') || null,
      src: $(image).attr('src') || null
    })).get(),
    usageRules,
    rawText: segmentText
  };
}

function parseSuperAttacks($, superAttackColumn, atk) {
  const segments = [];
  let currentSegment = null;
  superAttackColumn.contents().each((_, node) => {
    // A horizontal rule is also used inside one super attack to separate HP
    // usage bands. Only a new rendered super-attack header/icon starts a new
    // segment; condition labels such as "HPレンジ:" never do.
    const startsSuperAttack = node.type === 'tag' && $(node).find('img[src*="sp_skill_icon_"]').length > 0;
    if (startsSuperAttack) {
      currentSegment = [node];
      segments.push(currentSegment);
    } else if (currentSegment) {
      currentSegment.push(node);
    }
  });
  return segments
    .map((nodes) => parseSuperAttackSegment($, nodes, atk))
    .filter(Boolean);
}

function parseEnemyRow($, row, identity) {
  const columns = row.children();
  const identityColumn = columns.eq(0);
  const statsColumn = columns.eq(1);
  const superAttackColumn = columns.eq(2);
  const skillColumn = columns.eq(3);

  const cardHref = identityColumn.find('a[href*="/cards/"]').first().attr('href') || null;
  const cardId = parseInteger(cardHref?.match(/\/cards\/(\d+)/)?.[1]);
  const thumbSource = identityColumn.find('img[src*="/character/thumb/card_"]').first().attr('src') || null;
  const thumbId = parseInteger(thumbSource?.match(/card_(\d+)_thumb/)?.[1]);
  const typeSource = identityColumn.find('img[src*="cha_type_icon_"]').first().attr('src') || null;
  const typeInfo = parseTypeIcon(typeSource);
  const raritySource = identityColumn.find('img[src*="cha_rare_sm_"]').first().attr('src') || null;
  const name = identityColumn.find('.font-size-1_2 b').first().text().trim();

  const statsText = compactText(statsColumn.text());
  const atk = matchInteger(statsText, /\bATK:\s*([\d,]+)/i);
  const superAttacks = parseSuperAttacks($, superAttackColumn, atk);

  return {
    ...identity,
    name,
    normalizedName: compactText(name),
    cardId,
    cardHref,
    isEzaCardLink: cardHref?.includes('eza=true') ?? false,
    thumbId,
    thumbSource,
    rarity: raritySource?.match(/cha_rare_sm_([a-z0-9_]+)/i)?.[1] ?? null,
    ...typeInfo,
    typeIconSource: typeSource,
    hp: matchInteger(statsText, /\bHP:\s*([\d,]+)/i),
    atk,
    def: matchInteger(statsText, /\bDEF:\s*([\d,]+)/i),
    damageReductionPercent: matchDecimal(statsText, /\bDR:\s*([\d.]+)%/i),
    maxAttacksPerTurn: matchInteger(statsText, /最大ATK\/ターン:\s*([\d,]+)/),
    areaDamage: parseAreaDamage(compactText(row.text())),
    // Keep the first entry under the old singular key so Phase 3 reports and
    // fingerprints remain byte-for-byte comparable with their previous logic.
    superAttack: superAttacks[0] ?? emptySuperAttack(),
    superAttacks,
    // Distinguish a genuine zero-Super row from a changed/truncated layout.
    // The Phase 4 candidate ignores this audit-only flag, so its output stays
    // byte-identical while Phase 11 can stop instead of inventing an attack.
    superAttackColumnObserved: columns.length >= 3,
    skills: parseSkills($, skillColumn)
  };
}

function parseActions($, root, sequenceIndex = 0, enemyOrder = null) {
  const actions = [];
  root.find('.col-md-3.border.border-1.border-main-box-darker.padding-5').each((index, element) => {
    const text = compactText($(element).text());
    const match = text.match(/アクション\s*(\d+)(?:\/スロット\s*(\d+))?:\s*(.*?)\s*-\s*([\d.]+)%/);
    const type = match ? compactText(match[3]) : null;
    actions.push({
      order: match ? parseInteger(match[1]) : index + 1,
      sourceOrder: match ? parseInteger(match[1]) : index + 1,
      sequenceIndex,
      enemyOrder,
      slot: match && match[2] != null ? parseInteger(match[2]) : null,
      type,
      conditionExpression: type?.startsWith('[') ? type : null,
      probabilityPercent: match ? parseDecimal(match[4]) : null,
      rawText: text
    });
  });
  return actions;
}

function parseActionSequences($, box, rows) {
  const rowNodes = rows.map((row) => row.get(0));
  const sequences = [];
  box.find('.row.border.border-1.border-main-box-darker.margin-3')
    .filter((_, element) => $(element).find('.col-md-3.border.border-1.border-main-box-darker.padding-5').length > 0)
    .each((sequenceIndex, element) => {
      const wrapper = $(element);
      const precedingEnemy = wrapper.prevAll('.row.d-flex.align-items-center')
        .filter((_, sibling) => $(sibling).find('img[src*="cha_type_icon_"]').length > 0)
        .first()
        .get(0);
      const enemyOrder = precedingEnemy ? rowNodes.indexOf(precedingEnemy) : null;
      sequences.push({
        sequenceIndex,
        enemyOrder: enemyOrder >= 0 ? enemyOrder : null,
        actions: parseActions($, wrapper, sequenceIndex, enemyOrder >= 0 ? enemyOrder : null)
      });
    });
  return sequences;
}

function parseAreaDamage(boxText) {
  const maxPerTurn = matchInteger(boxText, /エリア\/ターン:\s*([\d,]+)/);
  const firstTargetDamage = matchInteger(boxText, /エリアダメージ\s*1:\s*([\d,]+)/);
  const additionalTargetDamage = matchInteger(boxText, /エリアダメージ\s*2\+:\s*([\d,]+)/);
  if (maxPerTurn == null && firstTargetDamage == null && additionalTargetDamage == null) return null;
  return { maxPerTurn, firstTargetDamage, additionalTargetDamage };
}

export function classifyCachedEvent(title) {
  const redZone = title.match(/究極のレッドゾーン\s*(.*)/);
  if (redZone) return { eventType: 'レッドゾーン', seriesName: redZone[1].trim() || '-' };
  const spectacle = title.match(/至上のバトルスペクタクル\s*(.*)/);
  if (spectacle) return { eventType: 'バトルスペクタクル', seriesName: spectacle[1].trim() || '-' };
  return { eventType: title, seriesName: '-' };
}

export function parseCachedStageHtml(html, metadata) {
  const $ = load(html);
  const stageName = $('title').text().split('|')[0].trim();
  const groups = [];
  const enemies = [];
  const enemyRowNodes = new Set();

  const boxes = $('.row.margin-5.border.border-1.border-main-box-darker.bg-main');
  boxes.each((encounterIndex, boxElement) => {
    const box = $(boxElement);
    const groupEnemies = [];
    const rows = [];
    box.find('img[src*="cha_type_icon_"]').each((_, image) => {
      const row = $(image).closest('.row.d-flex.align-items-center');
      const node = row.get(0);
      if (node && !enemyRowNodes.has(node)) {
        enemyRowNodes.add(node);
        rows.push(row);
      }
    });

    rows.forEach((row, orderInEncounter) => {
      const enemy = parseEnemyRow($, row, {
        eventId: metadata.eventId,
        eventTitle: metadata.eventTitle,
        eventType: metadata.eventType,
        seriesName: metadata.seriesName,
        stageId: metadata.stageId,
        stageName,
        sourceFile: metadata.sourceFile,
        encounterIndex,
        orderInEncounter,
        globalOrder: enemies.length
      });
      enemies.push(enemy);
      groupEnemies.push(enemy);
    });

    const boxText = compactText(box.text());
    const actionSequences = parseActionSequences($, box, rows);
    groups.push({
      encounterIndex,
      enemyCount: groupEnemies.length,
      enemies: groupEnemies,
      actionSequences,
      actions: actionSequences.flatMap((sequence) => sequence.actions),
      areaDamage: parseAreaDamage(boxText)
    });
  });

  const allTypeIcons = $('img[src*="cha_type_icon_"]').length;
  return {
    ...metadata,
    stageName,
    groups,
    enemies,
    allTypeIcons,
    orphanTypeIcons: Math.max(0, allTypeIcons - enemies.length)
  };
}

export function legacyEnemyFingerprint(enemy) {
  const rawSuperAttackDamage = enemy.baseAtk != null && enemy.saMulti != null
    ? Math.round(enemy.baseAtk * enemy.saMulti)
    : null;
  return JSON.stringify([
    enemy.name,
    enemy.class,
    enemy.type,
    enemy.baseAtk,
    rawSuperAttackDamage
  ]);
}

export function cachedEnemyFingerprint(enemy) {
  return JSON.stringify([
    enemy.name,
    enemy.class,
    enemy.type,
    enemy.atk,
    enemy.superAttack.damage
  ]);
}

export function legacyStageSignature(stage) {
  return JSON.stringify(stage.bosses.map(legacyEnemyFingerprint));
}

export function cachedStageSignature(stage) {
  return JSON.stringify(stage.enemies.filter((enemy) => enemy.atk > 0).map(cachedEnemyFingerprint));
}
