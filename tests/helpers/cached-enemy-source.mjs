import { createRequire } from 'node:module';

const rootRequire = createRequire(import.meta.url);
const cheerio = rootRequire('cheerio');

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
  const superAttackText = compactText(superAttackColumn.text());
  const descriptionRow = superAttackColumn.find('.row.padding-top-5 .row.align-items-center').first();
  const description = compactText(descriptionRow.children('.col-sm').first().text());
  const superAttackIcons = descriptionRow.find('img').map((_, image) => ({
    alt: $(image).attr('alt') || null,
    src: $(image).attr('src') || null
  })).get();
  const superAttackTypeImage = superAttackColumn.find('img[src*="sp_skill_icon_"]').first();
  const superAttackTypeSource = superAttackTypeImage.attr('src') || null;

  const atk = matchInteger(statsText, /\bATK:\s*([\d,]+)/i);
  const superAttackDamage = matchInteger(superAttackText, /ダメージ:\s*([\d,]+)/);

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
    superAttack: {
      name: superAttackColumn.find('.row.padding-top-5 b').first().text().trim() || null,
      description: description || null,
      damage: superAttackDamage,
      multiplier: atk > 0 && superAttackDamage != null ? superAttackDamage / atk : null,
      probabilityPercent: matchDecimal(superAttackText, /パーセンテージ:\s*([\d.]+)%/),
      maxPerTurn: matchInteger(superAttackText, /最大ATK\/ターン:\s*([\d,]+)/),
      cooldownTurns: matchInteger(superAttackText, /再使用までの時間:\s*([\d,]+)/),
      attackType: superAttackTypeImage.attr('alt') || superAttackTypeSource?.match(/sp_skill_icon_([^./]+)/)?.[1] || null,
      attackTypeIcon: superAttackTypeSource,
      effectIcons: superAttackIcons
    },
    skills: parseSkills($, skillColumn)
  };
}

function parseActions($, box) {
  const actions = [];
  box.find('.col-md-3.border.border-1.border-main-box-darker.padding-5').each((index, element) => {
    const text = compactText($(element).text());
    const match = text.match(/アクション\s*(\d+)(?:\/スロット\s*(\d+))?:\s*(.*?)\s*-\s*([\d.]+)%/);
    const type = match ? compactText(match[3]) : null;
    actions.push({
      order: match ? parseInteger(match[1]) : index + 1,
      slot: match && match[2] != null ? parseInteger(match[2]) : null,
      type,
      conditionExpression: type?.startsWith('[') ? type : null,
      probabilityPercent: match ? parseDecimal(match[4]) : null,
      rawText: text
    });
  });
  return actions;
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
  const $ = cheerio.load(html);
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
    groups.push({
      encounterIndex,
      enemyCount: groupEnemies.length,
      enemies: groupEnemies,
      actions: parseActions($, box),
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
