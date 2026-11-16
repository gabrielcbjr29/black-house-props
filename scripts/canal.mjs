// Canal do Telegram (pedido do usuário em 15/11): pauta do dia com as melhores simples e 3 múltiplas, no padrão
// de postagem dele (card + "🏀 NBA 🏀 / 💰 1 unidade / Sequência / link"). Roda no passo de publicar, logo depois
// dos cards: escolhe as entradas, desenha um card por entrada e grava public/data/canal.json + public/data/canal/*.jpg.
// Quem posta é a função canal (Supabase), espaçando ao longo do dia; aqui só a pauta.
//   Simples: entradas das estratégias com linha e odd da 99play, uma por jogador, EV 5%+ (3%+ se faltar), odd 1,40–3,50,
//            leitura da 99play com menos de 2h. Ordem: EV.
//   Múltiplas: faixas de odd 7–10, 12–17 e 20–25, em duas versões (só over e só under), uma perna por jogo, pernas das
//              linhas da 99play do bot com chance 57%+ e EV 0+, a de maior chance em cada faixa; sem repetir jogador entre as
//              faixas do mesmo lado (só se faltar perna).
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
/* pernas para múltiplas: todas as linhas da 99play do bot (os dois lados), não só as das estratégias, porque a escolha
   de cada jogador nas estratégias quase sempre cai no under (pedido de 16/11: múltiplas de over e de under).
   Jogador de rotação (24+ min), sem desfalque, nota A/B, chance 57%+, EV 0+, odd 1,40–3,50, leitura fresca. */
export function legPool({ bot, slate, events = {}, now = Date.now() }) {
  const gameOf = {};
  for (const g of slate?.games ?? []) for (const t of [g.home, g.away]) gameOf[t] = g;
  const best = new Map();
  for (const r of bot?.rows ?? []) {
    if (!r.c9 || !r.d || r.d < 1.4 || r.d > 3.5 || r.p < .57 || (r.e ?? -1) < 0 || (r.mn ?? 0) < 24 || (r.st && r.st !== 'ok')) continue;
    if (!/^[AB]/.test(r.gr ?? '')) continue;
    const g = gameOf[r.t]; if (!g || !g.timeUTC || Date.parse(g.timeUTC) <= now) continue;
    if (r.t9 && (now - Date.parse(r.t9)) / 36e5 >= STALE_H) continue;
    const x = { key: `${r.id}-${r.m}-${r.s}`, pid: r.id, name: r.n, team: r.t, opp: r.o, away: g.away, home: g.home, game: g.id, ev: events[g.id] ?? null,
      mk: r.m, side: r.s, line: +r.l, odd: +r.d, p: +r.p, edge: +r.e, tip: g.timeUTC, sq: r.sq ?? null, t9: r.t9 ?? null };
    const k = r.id + r.s, cur = best.get(k); if (!cur || x.p > cur.p) best.set(k, x); // uma perna por jogador e lado
  }
  return [...best.values()];
}
/* múltiplas: em cada faixa, a combinação de maior chance (uma perna por jogo, 2 a 6 pernas), separadas por lado:
   só over e só under. band = "10-over", "10-under", ... */
export function multiples(cands, lados = ['u', 'o']) {
  const out = [];
  for (const lado of lados) {
    const pool0 = cands.filter(x => x.side === lado && x.p >= .57 && x.edge >= 0).sort((a, b) => b.p - a.p).slice(0, 16);
    const used = new Set();
    for (const [b, lo, hi] of BANDS) {
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
      if (!best) run(pool0); // sem pernas novas suficientes: pode repetir jogador de outra múltipla do mesmo lado
      if (!best) continue;
      best.legs.forEach(l => used.add(l.pid));
      const legs = best.legs.slice().sort((a, b) => Date.parse(a.tip) - Date.parse(b.tip));
      const band = `${b}-${lado === 'o' ? 'over' : 'under'}`;
      out.push({ key: `m${band}-` + legs.map(l => keyOf(l)).join('.'), band, lado, odd: Math.round(best.odd * 100) / 100, prob: Math.round(best.prob * 1000) / 1000, legs });
    }
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
export function plan({ strat, slate, events, bot, now = Date.now() }) {
  const c = candidates({ strat, slate, events, now });
  const S = singles(c), M = multiples(bot ? legPool({ bot, slate, events, now }) : c);
  const pack = x => { const f = `${x.legs ? 'm' + x.band : 's-' + x.key}.jpg`; return { ...x, img: `canal/${f}`, img365: `canal/365/${f}`, cap: caption(x) }; };
  return { date: slate?.meta?.date ?? strat?.date, gen: strat?.gen ?? null, singles: S.map(pack), multis: M.map(pack) };
}

// ======================= HUB DE CANAIS (pedido de 16/11) =======================
// Vários canais (o dele, o do amigo e mais dois), cada um com a sua configuração (/canais no bot). Nenhum canal tem
// prioridade: a cada rodada da divisão os canais escolhem um por vez, numa ordem que gira (por rodada e por dia). Cada
// canal pode ter no máximo 30% de simples "repetidas" com os outros canais no dia (mesmo jogador + mesmo mercado; conta
// para todos os canais que têm a entrada); cada múltipla repete no máximo 30% das pernas e nenhuma sai igual em dois canais.
export const SHARE_CAP = .3;
export const DEFAULT_SPECS = [ // slot = hora (Brasília) a partir da qual a múltipla sai
  { nome: '10', min: 7, max: 10, lado: 'u', slot: 12 }, { nome: '10', min: 7, max: 10, lado: 'o', slot: 13 },
  { nome: '15', min: 12, max: 17, lado: 'u', slot: 15 }, { nome: '15', min: 12, max: 17, lado: 'o', slot: 16 },
  { nome: '25', min: 20, max: 25, lado: 'u', slot: 17 }, { nome: '25', min: 20, max: 25, lado: 'o', slot: 18 }];
export const DEFAULT_CFG = { max: 20, oddMin: 1.4, oddMax: 3.5, evMin: .03, mercados: null, lado: 'ambos', multis: null };
const LADO = { u: 'under', o: 'over', m: 'misto' };
export const normCfg = c => ({ ...DEFAULT_CFG, ...(c ?? {}) });
/* especificação da múltipla: faixa de odd (min–max), nº de pernas (ou livre: 2 a 6) e lado (u, o ou m = misto).
   "odd 10 com 4 jogadores" vira { odd: 10, pernas: 4 } → faixa 8,5–11,5. band = nome único no dia ("10x4-under"). */
export function specsOf(cfg) {
  const raw = cfg.multis?.length ? cfg.multis : DEFAULT_SPECS, seen = {};
  return raw.map((sp, i) => {
    const odd = +sp.odd || null, min = +sp.min || (odd ? Math.round(odd * .85 * 100) / 100 : 7), max = +sp.max || (odd ? Math.round(odd * 1.15 * 100) / 100 : 10);
    const pernas = +sp.pernas || null, lado = ['u', 'o', 'm'].includes(sp.lado) ? sp.lado : 'u';
    let band = `${sp.nome ?? (odd ?? max)}${pernas ? 'x' + pernas : ''}-${LADO[lado]}`;
    seen[band] = (seen[band] ?? 0) + 1; if (seen[band] > 1) band += '-' + seen[band];
    const slot = +sp.slot || 12 + Math.round(i * 6 / Math.max(1, raw.length - 1)); // personalizadas: espalhadas das 12h às 18h
    return { min, max, pernas, lado, band, slot };
  });
}
const ident = x => `${x.pid}-${x.mk}`; // "repetida" = mesmo jogador no mesmo mercado
/* todas as simples possíveis do dia (linhas da 99play do bot), com qualidade mínima; cada canal ainda aplica o seu filtro */
export function singlesPool({ bot, slate, events = {}, now = Date.now() }) {
  const gameOf = {};
  for (const g of slate?.games ?? []) for (const t of [g.home, g.away]) gameOf[t] = g;
  const out = [];
  for (const r of bot?.rows ?? []) {
    if (!r.c9 || !r.d || r.d < 1.3 || r.d > 5 || r.p < .55 || (r.e ?? -1) < 0 || r.e > .25 || (r.mn ?? 0) < 24 || (r.st && r.st !== 'ok')) continue;
    if (!/^[AB]/.test(r.gr ?? '')) continue;
    const g = gameOf[r.t]; if (!g?.timeUTC || Date.parse(g.timeUTC) <= now) continue;
    if (r.t9 && (now - Date.parse(r.t9)) / 36e5 >= STALE_H) continue;
    out.push({ key: `${r.id}-${r.m}-${r.s}`, pid: r.id, name: r.n, team: r.t, opp: r.o, away: g.away, home: g.home, game: g.id, ev: events[g.id] ?? null,
      mk: r.m, side: r.s, line: +r.l, odd: +r.d, p: +r.p, edge: Math.round(+r.e * 1e4) / 1e4, tip: g.timeUTC, sq: r.sq ?? null, t9: r.t9 ?? null });
  }
  return out.sort((a, b) => b.edge - a.edge || b.p - a.p);
}
const fits = (x, c, legs = false) => x.odd >= c.oddMin && x.odd <= (legs ? Math.max(c.oddMax, 3.5) : c.oddMax) && (legs || x.edge >= c.evMin)
  && (!c.mercados?.length || c.mercados.includes(x.mk)) && (legs || c.lado === 'ambos' || x.side === c.lado);
const dayN = d => Math.floor(Date.parse(d + 'T12:00:00Z') / 864e5);
/* divisão do dia. hub = { canais: [{ id, cfg }], postados: [{ canal_id, kind, pkey, band, legs: [{ pid, mk, side }] }] } */
export function planHub({ bot, slate, events = {}, hub, now = Date.now() }) {
  const date = slate?.meta?.date, chans = (hub?.canais ?? []).map(c => ({ id: c.id, cfg: normCfg(c.cfg) })).sort((a, b) => a.id - b.id);
  const order = r => chans.map((_, i) => chans[(i + r + dayN(date)) % chans.length]);
  const posted = hub?.postados ?? [];
  // quem já usou cada "identidade" no dia (simples e pernas de múltiplas separadas)
  const usedS = new Map(), usedM = new Map(), add = (m, k, id) => (m.get(k) ?? m.set(k, new Set()).get(k)).add(id);
  for (const p of posted) for (const l of p.legs ?? []) add(p.kind === 'simples' ? usedS : usedM, ident(l), p.canal_id);
  const sharedBy = (m, k, id) => [...(m.get(k) ?? [])].some(o => o !== id);
  const S = {}, M = {};
  // ---- simples: "repetida" conta para todos os canais que têm a entrada; ninguém passa de 30% das suas simples
  const pool = singlesPool({ bot, slate, events, now });
  const st = Object.fromEntries(chans.map(c => {
    const mine = posted.filter(p => p.canal_id === c.id && p.kind === 'simples');
    return [c.id, { need: Math.max(0, c.cfg.max - mine.length), cap: Math.floor(c.cfg.max * SHARE_CAP), shared: 0,
      pids: new Set(mine.flatMap(p => (p.legs ?? []).map(l => l.pid))), list: pool.filter(x => fits(x, c.cfg)) }];
  }));
  for (const [k, hs] of usedS) if (hs.size > 1) for (const h of hs) if (st[h]) st[h].shared++;
  for (const c of chans) S[c.id] = [];
  const canTake = (x, id) => {
    const hs = [...(usedS.get(ident(x)) ?? [])].filter(h => h !== id);
    if (!hs.length) return true;
    if (st[id].shared >= st[id].cap) return false;
    return usedS.get(ident(x)).size > 1 || hs.every(h => !st[h] || st[h].shared < st[h].cap); // o outro canal também fica com uma repetida
  };
  for (let r = 0, moved = true; moved; r++) {
    moved = false;
    for (const c of order(r)) {
      const k = st[c.id]; if (S[c.id].length >= k.need) continue;
      const i = k.list.findIndex(x => !k.pids.has(x.pid) && canTake(x, c.id));
      if (i < 0) continue;
      const x = k.list.splice(i, 1)[0], hs = usedS.get(ident(x));
      if (hs?.size) { k.shared++; if (hs.size === 1) for (const h of hs) if (st[h]) st[h].shared++; }
      k.pids.add(x.pid); add(usedS, ident(x), c.id); S[c.id].push(x); moved = true;
    }
  }
  // ---- múltiplas: cada uma pode repetir no máximo 30% das pernas (arredondado para cima) com múltiplas de outros
  // canais; nunca duas iguais; entre as combinações possíveis, ganha a de maior chance com desconto por perna repetida
  const legs0 = legPool({ bot, slate, events, now });
  const legSt = Object.fromEntries(chans.map(c => {
    const mine = posted.filter(p => p.canal_id === c.id && p.kind === 'multipla');
    const done = new Set(mine.map(p => p.band));
    return [c.id, { specs: specsOf(c.cfg).filter(sp => !done.has(sp.band)), used: new Set(mine.flatMap(p => (p.legs ?? []).map(l => l.pid))) }];
  }));
  const sigs = new Set(posted.filter(p => p.kind === 'multipla').map(p => (p.legs ?? []).map(ident).sort().join('|')));
  for (const c of chans) M[c.id] = [];
  const maxSpecs = Math.max(0, ...chans.map(c => legSt[c.id].specs.length));
  for (let r = 0; r < maxSpecs; r++) for (const c of order(r)) {
    const k = legSt[c.id], sp = k.specs[r]; if (!sp) continue;
    const pool0 = legs0.filter(x => fits(x, c.cfg, true) && (sp.lado === 'm' || x.side === sp.lado)).sort((a, b) => b.p - a.p).slice(0, sp.pernas && sp.pernas > 6 ? 20 : 16);
    const lo = sp.pernas ?? 2, hi = sp.pernas ?? 6;
    let best = null;
    const run = (pool, cap = SHARE_CAP, perGame = 1) => {
      const rec = (i, legs, odd, prob, games, sh) => {
        if (odd > sp.max) return;
        if (odd >= sp.min && legs.length >= lo && legs.length <= hi && sh <= Math.ceil(legs.length * cap)) {
          const score = prob * Math.pow(.85, sh);
          if (!best || score > best.score) { const sig = legs.map(ident).sort().join('|'); if (!sigs.has(sig)) best = { legs: [...legs], odd, prob, score }; }
        }
        if (legs.length >= hi || sh > Math.ceil(hi * cap)) return;
        for (let j = i; j < pool.length; j++) {
          const x = pool[j]; if ((games.get(x.game) ?? 0) >= perGame || legs.some(l => l.pid === x.pid)) continue;
          games.set(x.game, (games.get(x.game) ?? 0) + 1); legs.push(x);
          rec(j + 1, legs, odd * x.odd, prob * x.p, games, sh + (sharedBy(usedM, ident(x), c.id) ? 1 : 0));
          legs.pop(); games.set(x.game, games.get(x.game) - 1);
        }
      };
      rec(0, [], 1, 1, new Map(), 0);
    };
    run(pool0.filter(x => !k.used.has(x.pid)));
    if (!best) run(pool0); // sem pernas novas: pode repetir jogador de outra múltipla do mesmo canal
    if (!best) run(pool0, .5); // dia magro: até metade das pernas repetidas com outros canais (nunca a múltipla igual)
    if (!best && (sp.pernas ?? 0) >= 5) run(pool0, .5, 2); // muitas pernas e poucos jogos: até 2 jogadores do mesmo jogo
    if (!best) continue;
    const legs = best.legs.slice().sort((a, b) => Date.parse(a.tip) - Date.parse(b.tip));
    legs.forEach(l => { k.used.add(l.pid); add(usedM, ident(l), c.id); });
    sigs.add(legs.map(ident).sort().join('|'));
    M[c.id].push({ key: `m${sp.band}-` + legs.map(keyOf).join('.'), band: sp.band, lado: sp.lado, slot: sp.slot, odd: Math.round(best.odd * 100) / 100, prob: Math.round(best.prob * 1000) / 1000, legs });
  }
  const packS = x => ({ ...x, img: `canal/s-${x.key}.jpg`, img365: `canal/365/s-${x.key}.jpg`, cap: caption(x) });
  const packM = id => x => ({ ...x, img: `canal/m-${id}-${x.band}.jpg`, img365: `canal/365/m-${id}-${x.band}.jpg`, cap: caption(x) });
  return { v: 2, date, canais: Object.fromEntries(chans.map(c => [c.id, { singles: S[c.id].map(packS), multis: M[c.id].map(packM(c.id)) }])) };
}

async function main() {
  const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  const J = f => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
  const strat = J('strategies.json'), slate = J('slate.json'), bot = J('bot.json');
  const stPath = join(ROOT, '..', 'data', 'odds-state.json');
  const c99 = existsSync(stPath) ? JSON.parse(readFileSync(stPath, 'utf8')).providers?.c99 : null;
  const events = c99?.date === slate.meta?.date ? Object.fromEntries(Object.entries(c99.events ?? {}).map(([g, v]) => [g, v.ev])) : {};
  // hub de canais: configurações e o que já foi postado hoje (endpoint público da função canal, sem dados sensíveis)
  const hub = await fetch('https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/canal?hub=1').then(r => r.ok ? r.json() : null).catch(() => null);
  const botOk = bot?.date === slate.meta?.date ? bot : null;
  const P = hub?.canais?.length && botOk ? { ...planHub({ bot: botOk, slate, events, hub }), gen: strat?.gen ?? null } : plan({ strat, slate, events, bot: botOk });
  const dir = join(ROOT, 'data', 'canal'); rmSync(dir, { recursive: true, force: true }); mkdirSync(join(dir, '365'), { recursive: true });
  const font = f => readFileSync(join(ROOT, 'fonts', f)).toString('base64');
  const css = CSS(font); const css365 = CSS365(font);
  const { chromium } = await import('playwright');
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 540, height: 800 }, deviceScaleFactor: 2 });
  let n = 0;
  const all = P.v === 2 ? [...new Map(Object.values(P.canais).flatMap(c => [...c.singles, ...c.multis]).map(x => [x.img, x])).values()] : [...P.singles, ...P.multis];
  for (const x of all) {
    await pg.setContent(page(css, cardHTML(x)), { waitUntil: 'load' });
    await (await pg.$('.phone')).screenshot({ path: join(ROOT, 'data', x.img), type: 'jpeg', quality: 90 }); n++;
    await pg.setContent(page365(css365, card365HTML(x)), { waitUntil: 'load' });
    await (await pg.$('.s365')).screenshot({ path: join(ROOT, 'data', x.img365), type: 'jpeg', quality: 92 });
  }
  await b.close();
  writeFileSync(join(ROOT, 'data', 'canal.json'), JSON.stringify(P));
  if (P.v === 2) for (const [id, c] of Object.entries(P.canais)) console.log(`canal ${id}: ${c.singles.length} simples, ${c.multis.length} múltiplas (${c.multis.map(m => m.band + '@' + m.odd).join(', ')})`);
  else console.log(`canal: ${P.singles.length} simples, ${P.multis.length} múltiplas (${P.multis.map(m => m.band + '@' + m.odd).join(', ')})`);
  console.log(`canal: ${n} cards`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
