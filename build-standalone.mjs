import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=import.meta.dirname;
const read=name=>readFile(resolve(root,'dist',name),'utf8');
let html=await read('index.html');
let css=await read('styles.css');
const main='data:image/png;base64,'+(await readFile(resolve(root,'dist/assets/garden-reference.png'))).toString('base64');
const header='data:image/png;base64,'+(await readFile(resolve(root,'dist/assets/header-reference.png'))).toString('base64');
css=css.replaceAll("url('./assets/garden-reference.png')",'var(--garden-art)').replaceAll("url('./assets/header-reference.png')",'var(--header-art)');
const rules=(await read('game.js')).replace(/^export /gm,'').replace("'farm-zone-garden-v1'","'farm-zone-garden-portable-v1'");
const app=(await read('app.js')).replace(/^import .*?;\r?\n/,'');
html=html.replace(/  <link rel="preload"[^>]*>\r?\n/g,'')
  .replace('  <link rel="stylesheet" href="./styles.css">',`  <style>\n${css}\n</style>`)
  .replace('  <script src="https://telegram.org/js/telegram-web-app.js" defer></script>','')
  .replace('  <script type="module" src="./app.js"></script>','')
  .replace('src="./assets/garden-reference.png"',`src="${main}"`)
  .replace('src="./assets/header-reference.png"',`src="${header}"`)
  .replace('</body>',`<script type="module">\ndocument.documentElement.style.setProperty('--garden-art','url('+document.querySelector('.scene').src+')');\ndocument.documentElement.style.setProperty('--header-art','url('+document.querySelector('.header-art').src+')');\n${rules}\n${app}\n</script>\n</body>`);
await writeFile(resolve(root,'dist/prototype.html'),html);
await writeFile(resolve(root,'../Farm Zone — открыть игру.html'),html);
console.log('Готов автономный HTML-прототип: '+Buffer.byteLength(html)+' байт');
