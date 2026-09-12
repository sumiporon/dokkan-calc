import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CASES, structureFixture } from '../prototypes/phase11-f3-structure/fixtures.mjs';
const root = fileURLToPath(new URL('../',import.meta.url));
const out = new URL('../generated/phase11-f3-structure/',import.meta.url);
await mkdir(new URL('events/challenge/992200/',out),{recursive:true});
await build({ absWorkingDir:root, entryPoints:['prototypes/phase11-f3-structure/app.mjs'], outfile:fileURLToPath(new URL('app.mjs',out)),bundle:true,format:'esm',platform:'browser',target:'es2022' });
for(const kind of Object.keys(CASES)) {
  const f=structureFixture(kind);
  const style='<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'"><style>body{margin:0;padding:16px;font:15px/1.5 system-ui;background:#101827;color:#eee}main{max-width:800px;margin:auto}main .row{border:1px solid #42516a;padding:8px;margin:8px 0}#f3-structure-ui{max-width:800px;margin:auto}button{padding:14px;width:100%;background:#285ea7;color:white;font:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere}#result p{border-bottom:1px solid #42516a;overflow-wrap:anywhere}img{width:1px;height:1px}</style>';
  const ui='<section id="f3-structure-ui"><h1>構造診断・架空stage</h1><p id="status">実行前は何も取得しません。ボタンを押す前はcapture・scan・保存を行いません。</p><button>このstageの構造を確認</button><div id="result"></div></section><script type="module" src="/generated/phase11-f3-structure/app.mjs"></script>';
  await writeFile(new URL(`events/challenge/992200/${f.stageId}.html`,out),f.html.replace('</head>',`${style}</head>`).replace('<body>',`<body>${ui}`));
}
console.log('Built fixture-only structure diagnostic (no extension build).');
