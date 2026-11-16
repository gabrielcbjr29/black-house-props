// Canal do Telegram (pedido do usuário em 15/11): pauta do dia com as melhores simples e 3 múltiplas, no padrão
// de postagem dele (card + "🏀 NBA 🏀 / 💰 1 unidade / Sequência / link"). Roda no passo de publicar, logo depois
// dos cards: escolhe as entradas, desenha um card por entrada e grava public/data/canal.json + public/data/canal/*.jpg.
// Quem posta é a função canal (Supabase), espaçando ao longo do dia; aqui só a pauta.
//   Simples: entradas das estratégias com linha e odd da 99play, uma por jogador, EV 5%+ (3%+ se faltar), odd 1,40–3,50,
//            leitura da 99play com menos de 2h. Ordem: EV.
//   Múltiplas: faixas de odd 7–10, 12–17 e 20–25, uma perna por jogo, pernas de chance 57%+ e EV 0+, a de maior chance
//              de bater em cada faixa; sem repetir jogador entre as faixas (só se faltar perna).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JER } from '../public/engine.js';

// nomes como aparecem no bilhete da 99play
export const MKF = { PTS: 'Pontos', REB: 'Rebotes', AST: 'Assistências', '3PM': 'Arremessos de 3 Pontos Convertidos', PRA: 'Pontos + Rebotes + Assistências',
  PR: 'Pontos + Rebotes', PA: 'Pontos + Assistências', RA: 'Rebotes + Assistências', FGM: 'Arremessos de Quadra Convertidos', FGA: 'Tentativas de Arremessos de Quadra',
  '2PM': 'Arremessos de 2 Pontos Convertidos', '2PA': 'Tentativas de Arremessos de 2 Pontos', '3PA': 'Tentativas de Arremessos de 3 Pontos',
  FTM: 'Lances Livres Convertidos', FTA: 'Tentativas de Lances Livres', STL: 'Roubos de Bola', BLK: 'Tocos', SB: 'Roubos + Tocos', TOV: 'Erros', PF: 'Faltas' };
export const TEAM = { ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets', CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons', GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'LA Clippers', LAL: 'LA Lakers', MEM: 'Memphis Grizzlies', MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans', NYK: 'NY Knicks', OKC: 'Oklahoma City Thunder', ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs', TOR: 'Toronto Raptors', UTA: 'Utah Jazz', WAS: 'Washington Wizards' };
export const BANDS = [['10', 7, 10], ['15', 12, 17], ['25', 20, 25]];
const STALE_H = 2;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = x => String(x).replace('.', ',');
const n2 = x => (+x).toFixed(2).replace('.', ',');
const brDate = iso => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso));
const brHour = iso => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const keyOf = x => `${x.pid}-${x.mk}-${x.side}`;

/* candidatas: picks das estratégias com jogo, evento da 99play e odd fresca; uma por jogador (a de maior EV) */
export function candidates({ strat, slate, events = {}, now = Date.now() }) {
  const gameOf = {};
  for (const g of slate?.games ?? []) for (const t of [g.home, g.away]) gameOf[t] = g;
  const best = new Map();
  for (const p of strat?.picks ?? []) {
    const g = gameOf[p.team]; if (!g || !p.odd || p.odd < 1.4 || p.odd > 3.5) continue;
    const tip = p.tip_utc || g.timeUTC; if (!tip || Date.parse(tip) <= now) continue;
    if (p.t9 && (now - Date.parse(p.t9)) / 36e5 >= STALE_H) continue; // odd velha (leitor parado): não vai para o canal
    const edge = p.edge ?? (p.p * p.odd - 1);
    if (edge > .25) continue; // muito acima do mercado: costuma ser notícia que o modelo não viu
    const x = { key: keyOf(p), pid: p.pid, name: p.name, team: p.team, opp: p.opp, away: g.away, home: g.home, game: g.id, ev: events[g.id] ?? null,
      mk: p.mk, side: p.side, line: +p.line, odd: +p.odd, p: +p.p, edge: Math.round(edge * 1e4) / 1e4, tip, sq: p.sq ?? null, t9: p.t9 ?? null, st: p.strategy_id };
    const cur = best.get(p.pid); if (!cur || x.edge > cur.edge) best.set(p.pid, x);
  }
  return [...best.values()].sort((a, b) => b.edge - a.edge);
}
/* simples do dia: EV 5%+; se ficarem menos de 15, completa com EV 3%+ */
export function singles(cands, max = 30) {
  const a = cands.filter(x => x.edge >= .05);
  const out = a.length >= 15 ? a : cands.filter(x => x.edge >= .03);
  return out.slice(0, max);
}
/* múltiplas: em cada faixa, a combinação de maior chance (uma perna por jogo, 2 a 6 pernas) */
export function multiples(cands) {
  const pool0 = cands.filter(x => x.p >= .57 && x.edge >= 0).sort((a, b) => b.p - a.p).slice(0, 16);
  const used = new Set(), out = [];
  for (const [band, lo, hi] of BANDS) {
    let best = null;
    const run = pool => {
      const rec = (i, legs, odd, prob, games) => {
        if (odd > hi) return;
        if (odd >= lo && legs.length >= 2 && (!best || prob > best.prob)) best = { legs: [...legs], odd, prob };
        if (legs.length >= 6) return;
        for (let j = i; j < pool.length; j++) {
          const x = pool[j]; if (games.has(x.game)) continue;
          games.add(x.game); legs.push(x); rec(j + 1, legs, odd * x.odd, prob * x.p, games); legs.pop(); games.delete(x.game);
        }
      };
      rec(0, [], 1, 1, new Set());
    };
    run(pool0.filter(x => !used.has(x.pid)));
    if (!best) run(pool0); // sem pernas novas suficientes: pode repetir jogador de outra múltipla
    if (!best) continue;
    best.legs.forEach(l => used.add(l.pid));
    const legs = best.legs.slice().sort((a, b) => Date.parse(a.tip) - Date.parse(b.tip));
    out.push({ key: `m${band}-` + legs.map(l => keyOf(l)).join('.'), band, odd: Math.round(best.odd * 100) / 100, prob: Math.round(best.prob * 1000) / 1000, legs });
  }
  return out;
}
/* legenda no padrão do canal; {UN} (unidade) e {LINK} são preenchidos pela função canal na hora de postar */
export function caption(x) {
  const legs = x.legs ?? [x];
  const seqs = legs.filter(l => l.sq?.length);
  const sq = legs.length === 1 ? (seqs[0] ? `Sequência: ${seqs[0].sq.slice(0, 10).join('-')}` : '')
    : seqs.map(l => `${esc(l.name)}: ${l.sq.slice(0, 10).join('-')}`).join('\n');
  return `🏀 NBA 🏀\n\n💰 {UN}\n\n${sq ? `<blockquote>${legs.length > 1 && sq ? 'Sequências:\n' : ''}${sq}</blockquote>\n\n` : ''}{LINK}`;
}

// ---------- cards (casa primeiro, como no bilhete da 99play; o mesmo padrão aprovado em 15/11: múltipla agrupada por jogo, selos próprios com a sigla) ----------
const badge = t => {
  const [a, b] = JER[t] || ['#444', '#FFFFFF']; const ring = b.toUpperCase() === '#FFFFFF' ? '#ffffff' : b;
  return `<svg class="bd" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.5" fill="${a}"/><circle cx="20" cy="20" r="15.2" fill="none" stroke="${ring}" stroke-width="1.6" opacity=".9"/><text x="20" y="24" text-anchor="middle" font-size="10.5" font-weight="800" fill="${ring}">${t}</text></svg>`;
};
const tm = t => `<span class="tm">${badge(t)}<b>${esc(TEAM[t] ?? t)}</b></span>`;
const legHTML = l => `<li><p class="mk">${MKF[l.mk] ?? l.mk} Mais de/Menos de (incluindo Prorrogação)</p><p class="pl">${esc(l.name)} (${l.team}) ${l.side === 'o' ? 'mais' : 'menos'} ${n1(l.line)}</p></li>`;
function groupHTML(legs, odd) {
  const g = legs[0], one = legs.length === 1, when = `${brDate(g.tip)} • ${brHour(g.tip)}`;
  return `<section class="g"><div class="top">${one ? `<span class="when">${when}</span>` : '<span class="tag">CRIAR APOSTA</span>'}<b class="odd">${n2(odd)}</b></div>
<div class="teams">${tm(g.home)}<span class="x">x</span>${tm(g.away)}</div><ul class="${one ? 'tl one' : 'tl'}">${legs.map(legHTML).join('')}</ul>${one ? '' : `<p class="dt">${when}</p>`}</section>`;
}
export function cardHTML(x) {
  if (!x.legs) { // simples
    const when = `${brDate(x.tip)} • ${brHour(x.tip)}`;
    return `<div class="c"><section class="g s"><div class="top"><span class="when">${when}</span><b class="odd big">${n2(x.odd)}</b></div>
<div class="teams col">${tm(x.home)}${tm(x.away)}</div><p class="mk">${MKF[x.mk] ?? x.mk} Mais de/Menos de (incluindo Prorrogação)</p>
<p class="pl blue">${esc(x.name)} (${x.team}) ${x.side === 'o' ? 'mais' : 'menos'} ${n1(x.line)}</p></section></div>`;
  }
  const games = new Map(); for (const l of x.legs) (games.get(l.game) ?? games.set(l.game, []).get(l.game)).push(l);
  return `<div class="c"><header><h1>Múltipla <i>${games.size}</i></h1><span class="pill">🏀 NBA</span></header>
${[...games.values()].map(ls => groupHTML(ls, ls.reduce((o, l) => o * l.odd, 1))).join('')}<footer><span>Odd total</span><b>${n2(x.odd)}</b></footer></div>`;
}
export const CSS = font => `@font-face{font-family:MR;src:url(data:font/woff2;base64,${font('manrope.woff2')}) format('woff2');font-weight:200 800}
@font-face{font-family:BS;src:url(data:font/woff2;base64,${font('bigshoulders.woff2')}) format('woff2');font-weight:100 900}
*{box-sizing:border-box}body{margin:0;background:#0b0c0f;font-family:MR,sans-serif}
.phone{width:540px;padding:28px 22px 20px;background:linear-gradient(180deg,#14161b 0%,#0b0c0f 100%)}
.brand{text-align:center;color:#fff;font:900 34px/1 BS,sans-serif;letter-spacing:5px;margin-bottom:20px}.brand span{color:#d4af37;margin-left:8px}
.c{background:#fff;border-radius:22px;overflow:hidden;color:#121826}
header{display:flex;justify-content:space-between;align-items:center;padding:20px 22px;border-bottom:2px solid #eceff3}
h1{margin:0;font-size:28px;font-weight:800;display:flex;align-items:center;gap:12px}h1 i{font-style:normal;background:#121826;color:#fff;border-radius:50%;width:27px;height:27px;display:grid;place-items:center;font-size:16px}
.pill{border:2px solid #121826;border-radius:9px;padding:5px 11px;font-weight:800;font-size:15px}
.g{padding:20px 22px 18px;border-bottom:2px solid #eceff3}.g.s{border-bottom:0;padding:22px 24px 22px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.tag{background:#1f63d0;color:#fff;font-weight:800;font-size:14px;padding:5px 10px;border-radius:6px;letter-spacing:.3px}
.odd{font-size:24px;font-weight:800}.odd.big{font-size:30px}.when{color:#66748a;font-size:15px;font-weight:600}
.teams{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}.teams.col{flex-direction:column;align-items:flex-start;gap:10px;margin-bottom:14px}
.teams b{font-size:18.5px;font-weight:800}.teams.col b{font-size:21px}.x{color:#6b7584;margin:0 4px;font-size:17px}
.tm{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.bd{width:30px;height:30px;flex:none}.teams.col .bd{width:34px;height:34px}
.tl{list-style:none;margin:0;padding:0 0 0 26px;position:relative}.tl:not(.one):before{content:"";position:absolute;left:6px;top:10px;bottom:34px;width:2px;background:#d3dae4}
.tl li{position:relative;margin-bottom:10px}.tl li:before{content:"";position:absolute;left:-26px;top:5px;width:12px;height:12px;border-radius:50%;background:#1f63d0}.tl.one{padding-left:0}.tl.one li:before{display:none}
.mk{margin:0 0 4px;color:#66748a;font-size:16px;line-height:1.3}.g.s .mk{font-size:17px;margin-bottom:6px}
.pl{margin:0;font-weight:800;font-size:19px}.pl.blue{color:#1f5fbf;font-size:22px}.dt{margin:6px 0 0;color:#66748a;font-size:15px}
footer{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;background:#f2f4f7}footer span{font-size:18px;color:#3a4558}footer b{font-size:26px}
.sub{text-align:center;color:#8a909c;font-size:14px;margin-top:16px;letter-spacing:1px}`;
// ---------- card no estilo do bilhete da BR365 (pedido de 16/11): só a linha da seleção, sem moldura nem marca ----------
const odd365 = x => (+x).toFixed(2);
const leg365 = l => `<div class="r"><span class="xx">×</span><div class="c1"><div class="l1"><b>${esc(l.name)} — ${esc(l.name)} (${l.team}) ${l.side === 'o' ? 'mais' : 'menos'} ${n1(l.line)}</b><b class="od">${odd365(l.odd)}</b></div>
<div class="l2">${MKF[l.mk] ?? l.mk} Mais de/Menos de (incluindo Prorrogação)</div><div class="l3">${esc(TEAM[l.home] ?? l.home)} x ${esc(TEAM[l.away] ?? l.away)}</div></div></div>`;
export const card365HTML = x => `<div class="s365">${(x.legs ?? [x]).map(leg365).join('')}${x.legs ? `<div class="tot"><b>Odd total</b><b>${odd365(x.odd)}</b></div>` : ''}</div>`;
export const CSS365 = font => `@font-face{font-family:MR;src:url(data:font/woff2;base64,${font('manrope.woff2')}) format('woff2');font-weight:200 800}
*{box-sizing:border-box}body{margin:0;background:#fff;font-family:MR,Roboto,Arial,sans-serif}
.s365{width:540px;background:#fff;padding:4px 0}.r{display:flex;gap:14px;padding:14px 18px 14px 16px;border-bottom:1px solid #e9ecef}.r:last-child{border-bottom:0}
.xx{color:#5f6b66;font-size:24px;line-height:20px;flex:none;width:14px}.c1{flex:1;min-width:0}
.l1{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.l1 b{color:#155e36;font-size:17px;font-weight:800;line-height:1.3}.l1 .od{color:#2f3a35;font-weight:700;font-size:16px;white-space:nowrap}
.l2{color:#155e36;font-weight:700;font-size:15px;margin-top:3px;line-height:1.3}.l3{color:#6c7570;font-size:14px;margin-top:3px}
.tot{display:flex;justify-content:space-between;padding:12px 18px 12px 46px;border-top:2px solid #e2e6e4;color:#155e36;font-size:17px}.tot b:last-child{color:#2f3a35}`;
export const page365 = (css, inner) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${inner}</body></html>`;
export const page = (css, inner) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="phone"><div class="brand">BLACK<span>HOUSE</span></div>${inner}<div class="sub">Sequências · NBA Props</div></div></body></html>`;

/* pauta completa (sem desenhar): usada aqui e nos testes */
export function plan({ strat, slate, events, now = Date.now() }) {
  const c = candidates({ strat, slate, events, now });
  const S = singles(c), M = multiples(c);
  const pack = x => { const f = `${x.legs ? 'm' + x.band : 's-' + x.key}.jpg`; return { ...x, img: `canal/${f}`, img365: `canal/365/${f}`, cap: caption(x) }; };
  return { date: slate?.meta?.date ?? strat?.date, gen: strat?.gen ?? null, singles: S.map(pack), multis: M.map(pack) };
}

async function main() {
  const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  const J = f => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
  const strat = J('strategies.json'), slate = J('slate.json');
  const stPath = join(ROOT, '..', 'data', 'odds-state.json');
  const c99 = existsSync(stPath) ? JSON.parse(readFileSync(stPath, 'utf8')).providers?.c99 : null;
  const events = c99?.date === slate.meta?.date ? Object.fromEntries(Object.entries(c99.events ?? {}).map(([g, v]) => [g, v.ev])) : {};
  const P = plan({ strat, slate, events });
  const dir = join(ROOT, 'data', 'canal'); rmSync(dir, { recursive: true, force: true }); mkdirSync(join(dir, '365'), { recursive: true });
  const font = f => readFileSync(join(ROOT, 'fonts', f)).toString('base64');
  const css = CSS(font); const css365 = CSS365(font);
  const { chromium } = await import('playwright');
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 540, height: 800 }, deviceScaleFactor: 2 });
  let n = 0;
  for (const x of [...P.singles, ...P.multis]) {
    await pg.setContent(page(css, cardHTML(x)), { waitUntil: 'load' });
    await (await pg.$('.phone')).screenshot({ path: join(ROOT, 'data', x.img), type: 'jpeg', quality: 90 }); n++;
    await pg.setContent(page365(css365, card365HTML(x)), { waitUntil: 'load' });
    await (await pg.$('.s365')).screenshot({ path: join(ROOT, 'data', x.img365), type: 'jpeg', quality: 92 });
  }
  await b.close();
  writeFileSync(join(ROOT, 'data', 'canal.json'), JSON.stringify(P));
  console.log(`canal: ${P.singles.length} simples, ${P.multis.length} múltiplas (${P.multis.map(m => m.band + '@' + m.odd).join(', ')}), ${n} cards`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
