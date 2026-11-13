// Cards em imagem para o bot do Telegram (public/data/cards/<id>-<mercado>-<lado>.jpg).
// Lê o bot.json que a coleta gerou e renderiza as linhas marcadas com cd=1 num Chromium (Playwright).
// Uso: node scripts/cards.mjs [pasta-public]   (no GitHub roda no job "publicar")
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAM_INFO, jerseySVG } from '../public/engine.js';

const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MK = { PTS: 'pontos', REB: 'rebotes', AST: 'assistências', '3PM': 'bolas de 3', PRA: 'pts + reb + ast', PR: 'pts + reb', PA: 'pts + ast', RA: 'reb + ast', FGM: 'arremessos convertidos', FGA: 'arremessos tentados', '2PM': 'de 2 convertidos', '2PA': 'de 2 tentados', '3PA': 'bolas de 3 tentadas', FTM: 'lances livres convertidos', FTA: 'lances livres tentados', STL: 'roubos', BLK: 'tocos', SB: 'roubos + tocos', TOV: 'erros', PF: 'faltas' };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = x => (Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1)).replace('.', ',');
const n2 = x => x.toFixed(2).replace('.', ',');
const pct = x => Math.round(x * 100) + '%';
const hit = h => h?.[1] ? `${h[0]}/${h[1]}` : '–';
const font = f => readFileSync(join(ROOT, 'fonts', f)).toString('base64');

const css = () => `
@font-face { font-family: BS; src: url(data:font/woff2;base64,${font('bigshoulders.woff2')}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: MR; src: url(data:font/woff2;base64,${font('manrope.woff2')}) format('woff2'); font-weight: 200 800; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1080px; height: 1350px; background: #000; color: #F2F5F2; font-family: MR, sans-serif; }
.c { position: relative; width: 1080px; height: 1350px; padding: 56px 60px 44px; overflow: hidden;
  background: radial-gradient(900px 620px at 85% -8%, rgba(45,180,110,.30), transparent 62%), radial-gradient(700px 500px at -10% 105%, rgba(255,201,51,.10), transparent 60%), linear-gradient(180deg, #070A08, #020302); display: flex; flex-direction: column; }
.c::after { content: ''; position: absolute; inset: 18px; border: 2px solid rgba(255,255,255,.06); border-radius: 36px; pointer-events: none; }
.top { display: flex; align-items: center; justify-content: space-between; }
.brand { font-family: BS; font-weight: 900; font-size: 40px; letter-spacing: 2px; line-height: 1; }
.brand b { color: #2DB46E; font-weight: 900; }
.brand small { display: block; font-family: MR; font-weight: 700; font-size: 17px; letter-spacing: 4px; color: #8A968E; margin-top: 6px; }
.pill { font-family: MR; font-weight: 800; font-size: 20px; letter-spacing: 3px; padding: 12px 22px; border-radius: 99px; border: 2px solid #FFC933; color: #FFC933; }
.who { display: flex; align-items: center; gap: 28px; margin-top: 44px; }
.jer { flex: none; width: 128px; height: 138px; filter: drop-shadow(0 12px 24px rgba(0,0,0,.55)); }
.jer text { font-family: BS, sans-serif; }
.badge { flex: none; width: 132px; height: 132px; border-radius: 30px; display: grid; place-items: center; font-family: BS; font-weight: 900; font-size: 50px; color: #fff; letter-spacing: 1px; box-shadow: inset 0 0 0 3px rgba(255,255,255,.18), 0 12px 30px rgba(0,0,0,.5); }
.name { font-family: BS; font-weight: 800; font-size: 76px; line-height: .95; letter-spacing: .5px; }
.sub { margin-top: 10px; font-size: 26px; color: #A3AEA6; font-weight: 600; }
.grade { margin-left: auto; flex: none; display: grid; justify-items: center; gap: 6px; }
.grade .g { min-width: 110px; height: 92px; padding: 0 16px; border-radius: 22px; display: grid; place-items: center; font-family: BS; font-weight: 900; font-size: 64px; }
.g.gAp { background: #2DB46E; color: #00170B; } .g.gA { color: #2DB46E; box-shadow: inset 0 0 0 4px #2DB46E; } .g.gB { color: #E8ECE9; box-shadow: inset 0 0 0 3px #3A453E; }
.grade small { font-size: 18px; font-weight: 700; color: #8A968E; letter-spacing: 2px; }
.line { margin-top: 40px; display: flex; align-items: baseline; gap: 22px; flex-wrap: wrap; }
.side { font-family: MR; font-weight: 800; font-size: 26px; letter-spacing: 3px; padding: 10px 18px; border-radius: 12px; align-self: center; }
.side.o { background: #2DB46E; color: #00170B; } .side.u { background: #FFC933; color: #1D1500; }
.ln { font-family: BS; font-weight: 900; font-size: 112px; line-height: .9; }
.mk { font-family: BS; font-weight: 700; font-size: 54px; color: #DDE3DE; }
.kpis { margin-top: 36px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.k { background: rgba(255,255,255,.045); border: 2px solid rgba(255,255,255,.07); border-radius: 22px; padding: 20px 22px; }
.k small { display: block; font-size: 19px; font-weight: 700; color: #8A968E; letter-spacing: 1px; }
.k b { display: block; margin-top: 6px; font-family: BS; font-weight: 800; font-size: 56px; line-height: 1; }
.k span { display: block; margin-top: 6px; font-size: 17px; color: #8A968E; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k.hl b { color: #FFC933; } .k.gr b { color: #2DB46E; }
.chart { margin-top: 30px; background: rgba(255,255,255,.035); border: 2px solid rgba(255,255,255,.06); border-radius: 26px; padding: 22px 26px 14px; }
.chart h3 { font-size: 21px; font-weight: 700; color: #C9D1CB; display: flex; justify-content: space-between; }
.chart h3 b { color: #F2F5F2; }
.bars { position: relative; height: 236px; margin-top: 46px; display: grid; grid-template-columns: repeat(10, 1fr); gap: 14px; align-items: end; }
.bar { position: relative; border-radius: 10px 10px 4px 4px; min-height: 8px; }
.bar.y { background: linear-gradient(180deg, #45CF88, #1E8E54); } .bar.n { background: #2A322D; }
.bar i { position: absolute; top: -32px; left: 0; right: 0; text-align: center; font-style: normal; font-family: BS; font-weight: 800; font-size: 26px; color: #E8ECE9; }
.bar.n i { color: #7D8A81; }
.thr { position: absolute; left: -6px; right: -6px; border-top: 3px dashed #FFC933; opacity: .9; }
.chart h3 .lg { color: #FFC933; font-weight: 800; } .chart h3 .lg::before { content: ''; display: inline-block; width: 26px; border-top: 3px dashed #FFC933; vertical-align: middle; margin-right: 8px; }
.opp { display: grid; grid-template-columns: repeat(10, 1fr); gap: 14px; margin-top: 8px; text-align: center; font-size: 16px; font-weight: 700; color: #6F7C73; }
.hits { margin-top: 22px; display: flex; gap: 14px; }
.h { flex: 1; display: flex; align-items: baseline; justify-content: space-between; padding: 14px 20px; border-radius: 16px; background: rgba(255,255,255,.04); }
.h small { font-size: 19px; color: #8A968E; font-weight: 700; } .h b { font-family: BS; font-weight: 800; font-size: 36px; }
.def { margin-top: 18px; font-size: 22px; color: #A3AEA6; font-weight: 600; }
.def b { color: #F2F5F2; } .def .fav { color: #2DB46E; font-weight: 800; } .def .bad { color: #FF6A5C; font-weight: 800; }
.why { margin-top: 18px; display: grid; gap: 10px; }
.why div { display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: start; font-size: 23px; line-height: 1.3; font-weight: 600; color: #DDE3DE; }
.why div::before { content: '✓'; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: rgba(45,180,110,.18); color: #2DB46E; font-weight: 900; font-size: 18px; }
.why div.n::before { content: '!'; background: rgba(255,201,51,.16); color: #FFC933; }
.foot { margin-top: auto; padding-top: 20px; display: flex; justify-content: space-between; font-size: 18px; color: #6F7C73; font-weight: 600; }
`;

export function cardHTML(r, date) {
  const over = r.s === 'o', col = TEAM_INFO[r.t]?.[1] || '#2DB46E';
  const vs = r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`;
  const v = (r.v10 || []).slice(0, 10).reverse(); // mais antigo à esquerda
  const max = Math.max(r.l * 1.35, ...v.map(x => x[0]), 1);
  const ok = x => over ? x > r.l : x < r.l;
  const bars = v.map(([x]) => `<div class="bar ${ok(x) ? 'y' : 'n'}" style="height:${Math.max(3, x / max * 100)}%"><i>${n1(x)}</i></div>`).join('');
  const nHit = v.filter(([x]) => ok(x)).length;
  let def = '';
  if (r.dv?.r) {
    const good = over ? r.dv.r >= r.dv.of - 5 : r.dv.r <= 6, bad = over ? r.dv.r <= 6 : r.dv.r >= r.dv.of - 5;
    def = `<p class="def">Defesa do ${r.o}: <b>${r.dv.r}ª de ${r.dv.of}</b> contra ${esc(r.dv.ps)} em ${esc(r.dv.k)}${good ? ' · <span class="fav">favorável</span>' : bad ? ' · <span class="bad">difícil</span>' : ''}</p>`;
  }
  const dup = /^(Bateu em|Defesa do|Contra o )/;
  const why = [...(r.wy || []).filter(t => !dup.test(t)).slice(0, 2).map(t => `<div>${esc(t)}</div>`), ...(r.wn || []).filter(t => !dup.test(t)).slice(0, 1).map(t => `<div class="n">${esc(t)}</div>`)].join('');
  const odd = r.d ? `<div class="k hl"><small>ODD</small><b>${n2(r.d)}</b><span>${esc(r.b)}${r.k ? ' (bolsa)' : ''}</span></div>` : `<div class="k"><small>ODD JUSTA</small><b>${n2(1 / r.p)}</b><span>sem casa</span></div>`;
  const [, mm, dd] = date.split('-');
  return `<div class="c">
  <div class="top"><div class="brand">BLACK <b>HOUSE</b><small>PROPS NBA · ${dd}/${mm}</small></div><div class="pill">ENTRADA DO DIA</div></div>
  <div class="who">${jerseySVG({ team: r.t, num: r.nu, name: r.n }, 2)}
    <div><div class="name">${esc(r.n)}</div><div class="sub">${esc(r.ps || '')}${r.ps ? ' · ' : ''}${vs} · ${esc(r.h)}</div></div>
    <div class="grade"><div class="g g${r.gr === 'A+' ? 'Ap' : r.gr}">${esc(r.gr)}</div><small>NOTA ${r.nt ?? '–'}</small></div></div>
  <div class="line"><span class="side ${r.s}">${over ? 'MAIS DE' : 'MENOS DE'}</span><span class="ln">${n1(r.l)}</span><span class="mk">${esc(MK[r.m] || r.m)}</span></div>
  <div class="kpis">${odd}<div class="k gr"><small>CHANCE</small><b>${pct(r.p)}</b><span>${r.q != null ? 'mercado ' + pct(r.q) : 'modelo'}</span></div>
    <div class="k"><small>${r.mb ? 'MODELO BH' : 'PROJEÇÃO'}</small><b>${n1(Math.round(r.pj * 10) / 10)}</b><span>linha ${n1(r.l)}</span></div>
    <div class="k"><small>EV</small><b>${r.e == null ? '–' : (r.e >= 0 ? '+' : '') + (r.e * 100).toFixed(1).replace('.', ',') + '%'}</b><span>${r.e == null ? 'falta odd' : 'valor esperado'}</span></div></div>
  <div class="chart"><h3><span>Últimos ${v.length} jogos · bateu <b>${nHit} de ${v.length}</b></span><span class="lg">linha ${n1(r.l)}</span></h3>
    <div class="bars">${bars}<div class="thr" style="bottom:${r.l / max * 100}%"></div></div>
    <div class="opp">${v.map(([, o]) => `<span>${esc(o)}</span>`).join('')}</div></div>
  <div class="hits"><div class="h"><small>L10</small><b>${hit(r.l10)}</b></div><div class="h"><small>Temporada</small><b>${hit(r.ss)}</b></div><div class="h"><small>vs ${esc(r.o)}</small><b>${hit(r.hh)}</b></div></div>
  ${def}
  ${why ? `<div class="why">${why}</div>` : ''}
  <div class="foot"><span>Análise de dados, não é garantia</span><span>🔞 18+ · Aposte com responsabilidade</span></div>
</div>`;
}

export async function renderCards(root = ROOT) {
  const bot = JSON.parse(readFileSync(join(root, 'data', 'bot.json'), 'utf8'));
  const rows = bot.rows.filter(r => r.cd);
  const out = join(root, 'data', 'cards');
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body><div id="root"></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const t0 = Date.now(); const index = {};
  for (const r of rows) {
    const key = `${r.id}-${r.m}-${r.s}`;
    await page.evaluate(h => { document.getElementById('root').innerHTML = h; }, cardHTML(r, bot.date));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, key + '.jpg'), type: 'jpeg', quality: 80 });
    index[key] = 1;
  }
  await browser.close();
  writeFileSync(join(out, 'index.json'), JSON.stringify({ date: bot.date, gen: bot.gen, n: rows.length, keys: Object.keys(index) }));
  console.log(`cards: ${rows.length} imagens em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return rows.length;
}

if (import.meta.url === `file://${process.argv[1]}`) renderCards().catch(e => { console.error(e); process.exit(1); });
