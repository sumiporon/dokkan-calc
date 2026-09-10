import { BatchReceiverStore } from '../../src/prototype/phase11-one-tap-receiver.mjs';
const field = (x) => x?.state === 'known' ? String(x.value) : (x?.state ?? 'unknown');
const attributes = { agl: '速', teq: '技', int: '知', str: '力', phy: '体', super: '超', extreme: '極', neutral: '中立' };
const attr = (x) => attributes[field(x)] ?? field(x);
function row(list, key, value) {
  const dt = document.createElement('dt'); dt.textContent = key;
  const dd = document.createElement('dd'); dd.textContent = value;
  list.append(dt, dd);
}
async function init() {
try {
  // Extension-local immutable comparison data only; never a source request.
  const response = await fetch(browser.runtime.getURL('baseline-runtime.json'));
  if (!response.ok) throw new Error('比較用baselineを読み込めません。');
  const message = await browser.runtime.sendMessage({ type: 'batch:get' });
  if (!message?.ok || !message.value) throw new Error('batchが未受領です。');
  const store = new BatchReceiverStore({ official: await response.json() });
  const { record } = await store.receive(message.value);
  const summary = document.querySelector('#summary');
  row(summary, '受領状態', record.state); row(summary, 'stage数', String(record.batch.packages.length));
  row(summary, '安全検査', record.review.status);
  row(summary, '警告 / エラー', `${record.review.findings.filter(x => x.severity !== 'hard-fail').length} / ${record.review.findings.filter(x => x.severity === 'hard-fail').length}`);
  document.querySelector('#findings').textContent = JSON.stringify(record.review.findings, null, 2);
  for (const pack of record.batch.packages) for (const event of pack.canonical.events) for (const stage of event.stages) {
    const section = document.createElement('section'); const heading = document.createElement('h2');
    heading.textContent = field(stage.name); section.append(heading);
    for (const encounter of stage.encounters) for (const enemy of encounter.enemies) {
      const label = document.createElement('h3'); label.textContent = `${encounter.order}: ${field(enemy.name)}`; section.append(label);
      const list = document.createElement('dl');
      row(list, '属性', `${attr(enemy.alignment)}${attr(enemy.type)}`);
      row(list, 'HP', field(enemy.stats.hp)); row(list, 'ATK（通常基準）', field(enemy.stats.baseAttack)); row(list, 'DEF', field(enemy.stats.defense));
      for (const attack of enemy.superAttacks) {
        row(list, `必殺: ${field(attack.name)}`, field(attack.displayedDamage));
        for (const rule of attack.usageRules) row(list, '必殺条件', `HP ${field(rule.hpMinPercent)}～${field(rule.hpMaxPercent)}% / 確率 ${field(rule.probabilityPercent)}% / 回数 ${field(rule.maxPerTurn)} / 再使用 ${field(rule.cooldownTurns)}`);
      }
      section.append(list);
    }
    const details = document.createElement('details'); const title = document.createElement('summary'); title.textContent = '条件・AI・AOE・変換結果の詳細';
    const pre = document.createElement('pre'); pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
    pre.textContent = JSON.stringify({ canonicalStage: stage, runtime: pack.runtime, loss: pack.lossReport }, null, 2);
    details.append(title, pre); section.append(details); document.querySelector('#records').append(section);
  }
  document.querySelector('#status').textContent = 'received：限定batchを端末へ受領しました。値の照合後、この検証は終了です。';
  store.close();
} catch (error) { document.querySelector('#status').textContent = `停止：${error.message}`; }
}
init();
