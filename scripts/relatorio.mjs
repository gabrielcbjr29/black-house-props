// Relatório do dia em PDF: as melhores entradas por mercado (as de maior chance, sem valor negativo na 99play),
// duplo-duplo e triplo-duplo pelo histórico, as entradas do método e algumas múltiplas.
// Uso: node scripts/relatorio.mjs [pasta public]  →  public/data/relatorio.pdf (o bot do Telegram envia esse arquivo).
// Roda no job "publicar" (não vai para o repositório).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jerseySVG, L } from '../public/engine.js';
import { buildBotData } from '../collector/botdata.js';

const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const J = f => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = x => (Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1)).replace('.', ',');
const n2 = x => (+x).toFixed(2).replace('.', ',');
const pc = x => Math.round(x * 100) + '%';
const ev = x => (x >= 0 ? '+' : '−') + (Math.abs(x) * 100).toFixed(1).replace('.', ',') + '%';
const hit = h => h?.[1] ? `${h[0]}/${h[1]}` : '–';
const font = f => readFileSync(join(ROOT, 'fonts', f)).toString('base64');
const MK = { PTS: 'Pontos', REB: 'Rebotes', AST: 'Assistências', '3PM': 'Bolas de 3', PRA: 'Pts+Reb+Ast', PR: 'Pts+Reb', PA: 'Pts+Ast', RA: 'Reb+Ast', FGM: 'Arremessos convertidos', '2PM': 'De 2 convertidos', '2PA': 'Tentativas de 2', '3PA': 'Tentativas de 3', FTM: 'Lances livres convertidos', FTA: 'Lances livres tentados', STL: 'Roubos', BLK: 'Tocos', SB: 'Roubos+Tocos', TOV: 'Erros', PF: 'Faltas' };

let NUM = new Map(); // número da camisa por jogador (slate)
export function buildReport(bot, slate, strat) {
  NUM = new Map(slate.players.map(p => [p.id, p.num]));
  const games = Object.fromEntries((bot.games || []).map(g => [g.id, g]));
  const cov = new Set(bot.rows.filter(r => r.c9).map(r => r.g)); // jogos com linhas da 99play
  // linha da 99play: só sem valor negativo; sem linha da 99play para o jogador e mercado: linha de referência
  const ok = r => r.p != null && r.p >= .55 && (r.mn ?? 0) >= 24 && r.st !== 'questionable' && r.st !== 'out' && r.p <= .92 && r.m !== 'FGA'
    && (r.c9 ? r.d && r.e != null && r.e >= 0 : true);
  const best = (mks, n = 6) => {
    const seen = new Set(), out = [];
    for (const r of bot.rows.filter(r => mks.includes(r.m) && ok(r)).sort((a, b) => b.p - a.p || (b.sc ?? 0) - (a.sc ?? 0))) {
      if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (out.length >= n) break;
    }
    return out;
  };
  const sections = [
    ['Pontos', ['PTS'], 10], ['Rebotes', ['REB'], 10], ['Assistências', ['AST'], 10], ['Bolas de 3', ['3PM'], 8],
    ['Pts+Reb+Ast', ['PRA'], 6], ['Pts+Reb', ['PR'], 6], ['Pts+Ast', ['PA'], 6], ['Reb+Ast', ['RA'], 6],
    ['Tentativas', ['3PA', '2PA', 'FTA'], 8], ['Convertidos', ['FGM', '2PM', 'FTM'], 8],
    ['Defesa e outros', ['STL', 'BLK', 'SB', 'TOV', 'PF'], 6],
  ].map(([t, mks, n]) => ({ t, rows: best(mks, n) })).filter(s => s.rows.length);

  // duplo-duplo e triplo-duplo: chance pelo histórico (últimos 10, últimos 20 e temporada), só jogador de rotação
  const rot = new Map(); for (const r of bot.rows) if ((r.mn ?? 0) >= 24 && r.st !== 'out') rot.set(r.id, r);
  const ddtd = (need) => slate.players.filter(p => rot.has(p.id) && p.status !== 'out').map(p => {
    const lg = (p.logs || []).filter(x => x[L.min] >= 10);
    const k = x => [L.pts, L.reb, L.ast, L.stl, L.blk].filter(i => x[i] >= 10).length >= need;
    const rate = a => a.length ? a.filter(k).length / a.length : 0;
    const cur = lg.filter(x => x[L.cur]), l10 = lg.slice(0, 10), l20 = lg.slice(0, 20);
    if (l10.length < 5) return null;
    const raw = .4 * rate(l10) + .3 * rate(l20) + .3 * rate(cur.length ? cur : l20);
    const n = Math.min(lg.length, 20), prior = need === 2 ? .12 : .01; // puxa para a média da liga com pouca amostra
    const prob = (raw * n + prior * 4) / (n + 4);
    const r = rot.get(p.id);
    return { p, r, prob, h10: [l10.filter(k).length, l10.length], h20: [l20.filter(k).length, l20.length], ss: [cur.filter(k).length, cur.length], sq: l10.map(x => k(x) ? 1 : 0) };
  }).filter(x => x && x.prob >= (need === 2 ? .25 : .05)).sort((a, b) => b.prob - a.prob).slice(0, need === 2 ? 8 : 5);
  const dd = ddtd(2), td = ddtd(3);

  // entradas do método (as alertadas pelo bot hoje, com a odd da entrada)
  const alerted = (strat?.picks || []).filter(x => x.edge != null && x.edge >= .05);
  const seenP = new Set(), metodo = [];
  for (const x of alerted.sort((a, b) => b.edge - a.edge)) { if (seenP.has(x.pid)) continue; seenP.add(x.pid); metodo.push(x); if (metodo.length >= 10) break; }
  const rowOf = new Map(bot.rows.map(r => [`${r.id}|${r.m}|${r.s}`, r]));

  // múltiplas: pernas da 99play, sem valor negativo, uma por jogo (jogos diferentes não se puxam)
  const pool = bot.rows.filter(r => r.c9 && ok(r) && r.p >= .58 && r.p <= .9).sort((a, b) => b.p - a.p);
  const pick = (n, score, minP = .58) => {
    const g = new Set(), out = [];
    for (const r of [...pool].filter(r => r.p >= minP).sort(score)) { if (g.has(r.g)) continue; g.add(r.g); out.push(r); if (out.length >= n) break; }
    return out.length === n ? out : null;
  };
  const multi = [
    ['Dupla mais provável', pick(2, (a, b) => b.p - a.p, .6)],
    ['Tripla mais provável', pick(3, (a, b) => b.p - a.p, .6)],
    ['Tripla de valor', pick(3, (a, b) => (b.p * b.d) - (a.p * a.d), .58)],
  ].filter(([, legs]) => legs).map(([t, legs]) => {
    const odd = legs.reduce((a, r) => a * r.d, 1), prob = legs.reduce((a, r) => a * r.p, 1);
    return { t, legs, odd, prob, ev: prob * odd - 1 };
  });
  return { games, sections, dd, td, metodo, rowOf, multi };
}

const dots = (sq, line, side) => (sq || []).slice(0, 10).map(v => {
  const okk = side === 'o' ? v > line : v < line; return `<i class="${v === line ? 'p' : okk ? 'g' : 'r'}"></i>`;
}).join('');
const vs = (r, games) => { const g = games[r.g]; return `${r.home ? r.t + ' x ' + r.o : r.t + ' @ ' + r.o}${g?.t ? ' · ' + g.t : r.h ? ' · ' + r.h : ''}`; };
const entry = r => `${r.s === 'o' ? 'Mais de' : 'Menos de'} ${n1(r.l)}`;
const oddCell = r => r.c9 && r.d ? `<b>@${n2(r.d)}</b><small>99play · EV ${ev(r.e)}</small>` : `<b>${n2(1 / r.p)}</b><small>odd justa · linha ref.</small>`;

function rowHTML(r, games, extra = '') {
  return `<tr><td class="pl">${jerseySVG({ team: r.t, num: r.nu ?? NUM.get(r.id), name: r.n }, 1)}<div><b>${esc(r.n)}</b><small>${esc(vs(r, games))}</small></div></td>
  <td><b class="${r.s}">${entry(r)}</b><small>${esc(MK[r.m] || r.m)}</small></td>
  <td class="pr"><b>${pc(r.p)}</b><small>${r.gr ? 'nota ' + esc(r.gr) : ''}</small></td><td class="od">${oddCell(r)}</td>
  <td class="hs"><span class="dots">${dots(r.sq, r.l, r.s)}</span><small>L5 ${hit(r.l5)} · L10 ${hit(r.l10)} · L20 ${hit(r.l20)} · vs ${esc(r.o)} ${hit(r.hh)}</small></td>
  <td class="df">${r.dv?.r ? `${r.dv.r}ª/${r.dv.of}<small>defesa ${esc(r.o)}</small>` : '–'}${extra}</td></tr>`;
}
const TH = `<tr><th>Jogador</th><th>Entrada</th><th>Chance</th><th>Odd</th><th>Últimos 10 · histórico</th><th>Defesa</th></tr>`;

export function reportHTML(bot, rep) {
  const { games, sections, dd, td, metodo, rowOf, multi } = rep;
  const d = new Date(bot.date + 'T12:00:00Z');
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' });
  const gen = new Date(bot.gen).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const jogos = Object.values(games).sort((a, b) => String(a.utc).localeCompare(String(b.utc))).map(g => `<span>${esc(g.a)} @ ${esc(g.h)} <b>${esc(g.t)}</b></span>`).join('');
  const sec = (t, sub, body) => `<section><h2>${t}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</section>`;
  const met = metodo.map(x => { const r = rowOf.get(`${x.pid}|${x.mk}|${x.side}`); return r ? rowHTML({ ...r, l: +x.line, d: +x.odd, e: +x.edge, c9: 1 }, games) : ''; }).join('');
  const ddRows = (list, lb) => list.map(x => `<tr><td class="pl">${jerseySVG({ team: x.p.team, num: x.p.num, name: x.p.name }, 1)}<div><b>${esc(x.p.name)}</b><small>${esc(vs(x.r, games))}</small></div></td>
    <td><b class="o">${lb}</b><small>sim</small></td><td class="pr"><b>${pc(x.prob)}</b><small>histórico</small></td><td class="od"><b>${n2(1 / x.prob)}</b><small>odd justa</small></td>
    <td class="hs"><span class="dots">${x.sq.map(v => `<i class="${v ? 'g' : 'r'}"></i>`).join('')}</span><small>L10 ${hit(x.h10)} · L20 ${hit(x.h20)} · temporada ${hit(x.ss)}</small></td><td class="df">${x.r?.dv?.r ? `${x.r.dv.r}ª/${x.r.dv.of}<small>defesa ${esc(x.r.o)}</small>` : '–'}</td></tr>`).join('');
  const mul = multi.map(m => `<div class="tk"><div class="tkh"><b>${m.t}</b><span>@${n2(m.odd)} · chance ${pc(m.prob)} · EV ${ev(m.ev)}</span></div>
    ${m.legs.map(r => `<div class="lg">${jerseySVG({ team: r.t, num: r.nu ?? NUM.get(r.id), name: r.n }, 1)}<div><b>${esc(r.n)}</b> · <span class="${r.s}">${entry(r)} ${esc(MK[r.m])}</span><small>${esc(vs(r, games))} · @${n2(r.d)} · ${pc(r.p)}</small></div></div>`).join('')}</div>`).join('');
  const css = `@font-face{font-family:BS;src:url(data:font/woff2;base64,${font('bigshoulders.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:MR;src:url(data:font/woff2;base64,${font('manrope.woff2')}) format('woff2');font-weight:200 800}
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#050807;color:#EEF3EF;font:11px/1.35 MR,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:28px 30px}header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #2DB46E;padding-bottom:12px;margin-bottom:6px}
h1{font:800 34px/1 BS,sans-serif;margin:0;letter-spacing:.01em;text-transform:uppercase}h1 em{color:#2DB46E;font-style:normal}.hd small{display:block;color:#8FA196;font-size:12px;margin-top:4px;text-transform:capitalize}
.brand{text-align:right;font:700 13px BS;letter-spacing:.12em;color:#2DB46E}.brand small{display:block;color:#8FA196;font:500 10px MR;letter-spacing:0}
.games{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}.games span{background:#0E1511;border:1px solid #1C2A22;border-radius:6px;padding:3px 8px;font-size:10px}.games b{color:#2DB46E}
section{margin-top:16px;break-inside:avoid}h2{font:800 19px/1 BS,sans-serif;text-transform:uppercase;margin:0 0 3px;color:#fff;letter-spacing:.02em}h2::before{content:'';display:inline-block;width:5px;height:15px;background:#2DB46E;margin-right:8px;border-radius:2px;vertical-align:-1px}
.sub{color:#8FA196;margin:0 0 6px;font-size:10px}table{width:100%;border-collapse:separate;border-spacing:0 3px}th{font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#6E8075;text-align:left;font-weight:700;padding:0 6px}
td{background:#0C120F;padding:5px 6px;vertical-align:middle;border-top:1px solid #16211B;border-bottom:1px solid #16211B}td:first-child{border-left:1px solid #16211B;border-radius:7px 0 0 7px}td:last-child{border-right:1px solid #16211B;border-radius:0 7px 7px 0}
td small{display:block;color:#8FA196;font-size:9px}td b{font-size:11.5px}.pl{display:flex;gap:7px;align-items:center;min-width:170px}.pl .jer{width:22px;height:24px;flex:none}
b.o,span.o{color:#4FD18B}b.u,span.u{color:#F2B544}.pr b{font:800 17px BS;color:#fff}.od b{font:700 13px BS}
.dots{display:flex;gap:2px;margin-bottom:2px}.dots i{width:9px;height:9px;border-radius:2px;display:block}.dots .g{background:#2DB46E}.dots .r{background:#E5534B}.dots .p{background:#6B7570}
.df{font:700 12px BS;white-space:nowrap}.tks{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.tk{background:#0C120F;border:1px solid #1C2A22;border-radius:9px;padding:9px}
.tkh b{font:800 14px BS;text-transform:uppercase;display:block}.tkh span{color:#2DB46E;font-weight:700;font-size:10px}.lg{display:flex;gap:6px;align-items:center;margin-top:7px}.lg .jer{width:20px;height:22px;flex:none}.lg small{display:block;color:#8FA196;font-size:9px}
footer{margin-top:18px;border-top:1px solid #1C2A22;padding-top:8px;color:#6E8075;font-size:9px}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Black House · ${esc(bot.date)}</title><style>${css}</style></head><body><div class="page">
<header><div class="hd"><h1>Melhores entradas <em>do dia</em></h1><small>${esc(dia)} · dados das ${esc(gen)} (Brasília)</small></div><div class="brand">BLACK HOUSE<small>Modelo BH · NBA</small></div></header>
<div class="games">${jogos}</div>
${met ? sec('Entradas do método', 'As que o bot alertou hoje (EV de 5% ou mais na odd da 99play, uma por jogador). Ficam registradas no papel com 1u.', `<table>${TH}${met}</table>`) : ''}
${sections.map(s => sec(s.t, 'As de maior chance do Modelo BH, só jogador de rotação (24+ min). Com linha da 99play, só as sem valor negativo; sem ela, a linha de referência.', `<table>${TH}${s.rows.map(r => rowHTML(r, games)).join('')}</table>`)).join('')}
${dd.length ? sec('Duplo-duplo', 'Chance pelo histórico (últimos 10, últimos 20 e temporada). Compare a odd justa com a da casa: só vale se a casa pagar mais.', `<table>${TH}${ddRows(dd, 'Duplo-duplo')}</table>`) : ''}
${td.length ? sec('Triplo-duplo', 'Mercado raro e de odd alta: mesma conta do duplo-duplo.', `<table>${TH}${ddRows(td, 'Triplo-duplo')}</table>`) : ''}
${mul ? sec('Múltiplas', 'Uma perna por jogo, só linhas da 99play sem valor negativo. Chance da múltipla = produto das chances (as pernas são de jogos diferentes).', `<div class="tks">${mul}</div>`) : ''}
<footer>Black House · Modelo BH. Chance = estimativa do modelo, não garantia. Linha ref. = jogo ainda sem linha da 99play (mediana dos últimos 15 jogos). Confira a escalação antes de apostar. 🔞 18+ · Aposte com responsabilidade.</footer>
</div></body></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bot0 = J('bot.json'), slate = J('slate.json'), strat = existsSync(join(ROOT, 'data', 'strategies.json')) ? J('strategies.json') : null;
  if (bot0.demo || !bot0.rows?.length) { console.log('relatório: sem dados do dia'); process.exit(0); }
  // todas as linhas do dia (o bot.json corta as de nota baixa); "por que sim" e cards não são usados aqui
  let prev = null; try { prev = J('prev.json'); } catch { }
  const full = buildBotData({ ...slate, prev }, { w: .4, full: true });
  const bot = { ...bot0, rows: full.rows };
  const rep = buildReport(bot, slate, strat);
  const html = reportHTML(bot, rep);
  writeFileSync(join(ROOT, 'data', 'relatorio.html'), html);
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({ path: join(ROOT, 'data', 'relatorio.pdf'), format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await browser.close();
  console.log(`relatório: ${rep.sections.length} mercados, ${rep.dd.length} duplo-duplo, ${rep.td.length} triplo-duplo, ${rep.metodo.length} do método, ${rep.multi.length} múltiplas`);
}
