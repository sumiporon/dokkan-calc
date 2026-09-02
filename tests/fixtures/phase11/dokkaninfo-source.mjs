/**
 * Self-authored DokkanInfo-shaped fixtures. Class names exercise the reused
 * parser, but names, IDs and values are fictional and are not copied from a
 * game or third-party page.
 */
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function dokkanInfoEventHtml({ eventId = '990001', eventName = '取込確認用・架空チャレンジ', stages = [{ id: '99000101', name: '架空ステージ1' }] } = {}) {
  const links = stages.map((stage) => `<div class="row padding-top-bottom-5"><div class="col-sm border"><div class="row font-size-1_5"><div class="col">${esc(stage.name)}</div></div><a href="https://jpnja.dokkaninfo.com/events/challenge/${eventId}/${stage.id}">stage ${stage.id}</a></div></div>`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta property="og:url" content="https://jpnja.dokkaninfo.com/events/challenge/${eventId}"><title>${esc(eventName)} | 架空保存確認</title></head><body><div class="row bg-third"><div class="col-sm font-size-2">${esc(eventName)}</div></div>${links}</body></html>`;
}

export function dokkanInfoStageHtml({
  eventId = '990001', stageId = '99000101', stageName = '架空ステージ1', normalAtk = 600000,
  hp = 10000000, def = 150000, typeIcon = 22, includeArea = false, missing = null,
  longAttackName = false
} = {}) {
  const value = (key, fallback) => missing === key ? '' : fallback;
  const area = includeArea ? `<div class="row"><div class="col-sm"><b>エリア/ターン:</b> ${value('area-max', 1)}</div></div><div class="row"><div class="col-sm"><b>エリアダメージ 1:</b> ${value('area-first', '1,200,000')}</div></div><div class="row"><div class="col-sm"><b>エリアダメージ 2+:</b> ${value('area-additional', '720,000')}</div></div>` : '';
  const firstName = longAttackName ? '取込確認用の非常に長い架空必殺技A' : '架空必殺A';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta property="og:url" content="https://jpnja.dokkaninfo.com/events/challenge/${eventId}/${stageId}"><title>${esc(stageName)} | 架空保存確認</title></head><body>
  <div class="row margin-5 border border-1 border-main-box-darker bg-main">
    <div class="row d-flex align-items-center">
      <div class="col col-xl-2"><a href="/cards/9000001"><img src="/character/thumb/card_9000000_thumb.png"><img src="/layout/cha_rare_sm_ur.png"><img src="/layout/cha_type_icon_${typeIcon}.png"></a><div class="font-size-1_2"><b>取込確認用・架空の敵</b></div></div>
      <div class="col-md-2"><div><b>HP:</b> ${value('hp', Number(hp).toLocaleString('en-US'))}</div> <div><b>ATK:</b> ${value('atk', Number(normalAtk).toLocaleString('en-US'))}</div> <div><b>DEF:</b> ${value('def', Number(def).toLocaleString('en-US'))}</div> <div><b>DR:</b> 10%</div> <div><b>最大ATK/ターン:</b> 8</div></div>
      <div class="col-md">
        <div class="super-header"><div><b>${esc(firstName)}</b></div><div class="row align-items-center"><div class="col-sm">1ターンATKが大幅上昇する架空説明</div><img src="/sp_skill_icon_etc.png" alt="other"></div></div>
        <div><b>ダメージ:</b> ${value('super-a', '1,500,000')}</div><div><b>パーセンテージ:</b> 25%</div><div><b>最大ATK/ターン:</b> 1</div><div><b>再使用までの時間:</b> 0</div><div>HPレンジ: 51% ~ 100%</div><div>パーセンテージ: 25%</div><div>最大ATK/ターン: 1</div><div>再使用までの時間: 0</div>
        <div class="super-header"><div><b>架空必殺B</b></div><div class="row align-items-center"><div class="col-sm">架空の2つ目の必殺</div><img src="/sp_skill_icon_etc.png" alt="other"></div></div>
        <div><b>ダメージ:</b> 2,500,000</div><div><b>パーセンテージ:</b> 35%</div><div><b>最大ATK/ターン:</b> 1</div><div><b>再使用までの時間:</b> 1</div><div>HPレンジ: 0% ~ 50%</div><div>パーセンテージ: 35%</div><div>最大ATK/ターン: 1</div><div>再使用までの時間: 1</div>${area}
      </div>
      <div class="col-md"><div class="row align-items-center padding-top-bottom-1"><div class="col-sm-9">ターン経過ごとにATK10%UP(最大30%)<div class="debug-info">ID: 99001</div></div><div class="col-sm-3">100%</div></div></div>
    </div>
    <div class="row border border-1 border-main-box-darker margin-3"><div class="col-md-3 border border-1 border-main-box-darker padding-5">アクション 1/スロット 1: ノーマル - 100%</div></div>
  </div></body></html>`;
}

export function dokkanInfoMhtml(html, location = 'https://jpnja.dokkaninfo.com/events/challenge/990001/99000101', resources = []) {
  const boundary = '----phase11-dokkaninfo-fixture--';
  const bytes = new TextEncoder().encode(html);
  const body = Array.from(bytes, (byte) => `=${byte.toString(16).padStart(2, '0').toUpperCase()}`).join('').match(/.{1,60}/g).join('=\r\n');
  const parts = resources.map((resource) => `--${boundary}\r\nContent-Type: ${resource.type ?? 'image/png'}\r\nContent-ID: <${resource.id}>\r\nContent-Location: ${resource.location}\r\nContent-Transfer-Encoding: base64\r\n\r\nAA==\r\n`).join('');
  return `From: <Phase11 self-authored fixture>\r\nSnapshot-Content-Location: ${location}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${boundary}"; start="<root>"\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-ID: <root>\r\nContent-Location: ${location}\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${body}\r\n${parts}--${boundary}--\r\n`;
}
