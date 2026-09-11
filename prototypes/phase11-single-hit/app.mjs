import { fixtures } from './fixtures.mjs';
import { evaluateSingleHit, SINGLE_HIT_OUTPUTS } from '../../src/prototype/phase11-single-hit.mjs';
const core = globalThis.DokkanCalcCore;
const select = document.querySelector('#fixture');
const results = document.querySelector('#results');
const titles = { damage: 'この1発の被ダメ', 'zero-defense': 'この1発：完封に必要な最終DEF', 'target-defense': 'この1発：目標被ダメ以下に必要な最終DEF' };
const number = value => value.toLocaleString('ja-JP');
const fact = field => field.state === 'known' ? number(field.value) : '不明';
for (const fixture of fixtures) { const option = document.createElement('option'); option.value = fixture.id; option.textContent = `${fixture.id}：${fixture.title}`; select.append(option); }
function render() {
  const fixture = fixtures.find(item => item.id === select.value);
  document.querySelector('#facts').textContent = `fixtureの掲載ATK：${fact(fixture.attack.displayedDamage)} ／ 回数：不明 ／ 現在の最終DEF：${fact(fixture.defender.finalDefense)} ／ 目標被ダメ：${fact(fixture.targetDamage)}`;
  results.replaceChildren(); // No stale numbers after a blocked selection.
  for (const output of SINGLE_HIT_OUTPUTS) {
    const result = evaluateSingleHit(fixture, output, core);
    const card = document.createElement('article'); card.dataset.output = output; card.dataset.status = result.status;
    const title = document.createElement('h2'); title.textContent = titles[output]; card.append(title);
    const body = document.createElement('p');
    if (result.status === 'available') {
      body.className = 'value';
      body.textContent = output === 'damage'
        ? result.value.maximum === 0 ? '0 ／ この1発：完封' : `${number(Math.floor(result.value.minimum))}～${number(Math.ceil(result.value.maximum))}`
        : number(result.value);
      if (output === 'damage') { const note = document.createElement('p'); note.textContent = '幅は乱数1.00～1.03のみ。敵状態の不確定幅ではありません。'; card.append(note); }
    } else { body.className = 'blocked'; body.textContent = `算出できません：${result.reasons.map(reason => reason.message).join(' ')}`; }
    card.append(body); results.append(card);
  }
}
select.addEventListener('change', render); render();
