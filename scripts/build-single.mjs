// Gera um único HTML autocontido (CSS, JS, fontes e dados embutidos) para testar sem servidor.
// Uso: npm i -D esbuild && node scripts/build-single.mjs public black-house-teste.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const P = process.argv[2], OUT = process.argv[3];
const r = await build({ entryPoints: [P + '/app.js'], bundle: true, format: 'iife', write: false, minify: true, target: 'es2020' });
let js = r.outputFiles[0].text;
const data = {};
for (const f of ['slate', 'results', 'backtest']) data['data/' + f + '.json'] = readFileSync(`${P}/data/${f}.json`, 'utf8');
// os pedidos a data/*.json são atendidos pelos dados embutidos
const shim = `(()=>{const D=${JSON.stringify(data)};const f=window.fetch.bind(window);window.fetch=(u,o)=>{const k=String(u).replace(/^\\.\\//,'').split('?')[0];if(D[k]!=null)return Promise.resolve(new Response(D[k],{status:200,headers:{'Content-Type':'application/json'}}));return f(u,o);};})();`;
let css = readFileSync(P + '/styles.css', 'utf8');
for (const f of ['manrope', 'archivo', 'bigshoulders']) css = css.split(`url("fonts/${f}.woff2")`).join(`url(data:font/woff2;base64,${readFileSync(`${P}/fonts/${f}.woff2`).toString('base64')})`);
let html = readFileSync(P + '/index.html', 'utf8');
const icon = readFileSync(P + '/icon.svg').toString('base64');
html = html
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
  .replace(/<link rel="preload"[^>]*>\n?/, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis[^>]*>\n?/, '')
  .replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', `<link rel="icon" href="data:image/svg+xml;base64,${icon}">`)
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="app\.js"><\/script>/, () => `<script>${shim}</script>\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
if (html.includes('src="app.js"')) throw new Error('não achei a tag do app.js');
writeFileSync(OUT, html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');
