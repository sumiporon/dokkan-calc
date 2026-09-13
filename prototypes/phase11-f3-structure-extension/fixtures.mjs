import { CASES, structureFixture } from '../phase11-f3-structure/fixtures.mjs';
export const DIAGNOSTIC_CASES = { ...CASES, empty: '敵rootが0件', ownership: 'stage識別が不一致', long: '長い表示文と非表示情報の除外' };
export function diagnosticFixture(kind) {
  if (Object.hasOwn(CASES, kind)) return structureFixture(kind);
  const f = structureFixture('normal');
  const stageId = String(99220001 + Object.keys(DIAGNOSTIC_CASES).indexOf(kind));
  let html = f.html.replaceAll(f.stageId, stageId);
  if (kind === 'empty') html = html.replaceAll('row d-flex align-items-center', 'unrecognized-enemy');
  else if (kind === 'ownership') html = html.replace(`/992200/${stageId}`, '/992200/99999999');
  else if (kind === 'long') html = html.replace('架空の敵A', '長'.repeat(2000) + '<script>PRIVATE_CANARY</script><input value="PRIVATE_CANARY"><span hidden>PRIVATE_CANARY</span><!--PRIVATE_CANARY-->');
  else throw new Error('Unknown diagnostic fixture');
  return { ...f, html, stageId, kind };
}
