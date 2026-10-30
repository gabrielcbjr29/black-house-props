/* Garrafão Props — motor de projeção
   Usado no navegador (app) e no Node (testes). Sem dependências.
   Entrada: o "slate" gerado pelo coletor (public/data/slate.json). */

// ---------- linha de jogo (array compacto vindo do coletor) ----------
export const L = { date: 0, opp: 1, home: 2, min: 3, pts: 4, reb: 5, oreb: 6, ast: 7, stl: 8, blk: 9, tov: 10, pf: 11, fgm: 12, fga: 13, tpm: 14, tpa: 15, ftm: 16, fta: 17, cur: 18, starter: 19, gid: 20 };

export const BASE = {
  pts: g => g[L.pts], reb: g => g[L.reb], ast: g => g[L.ast], stl: g => g[L.stl], blk: g => g[L.blk],
  tov: g => g[L.tov], pf: g => g[L.pf], fgm: g => g[L.fgm], fga: g => g[L.fga], tpm: g => g[L.tpm], tpa: g => g[L.tpa],
  ftm: g => g[L.ftm], fta: g => g[L.fta], twom: g => g[L.fgm] - g[L.tpm], twoa: g => g[L.fga] - g[L.tpa]
};
// estatísticas "de ataque": recebem o ajuste de uso quando um titular do time está fora
const OFFENSIVE = new Set(['pts', 'ast', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'twom', 'twoa', 'tov']);
// quanto o ritmo do jogo afeta cada estatística
const PACEW = { pts: 1, reb: .5, ast: .8, stl: .6, blk: .4, tov: .7, pf: .5, fgm: .9, fga: 1, tpm: .8, tpa: .9, ftm: .7, fta: .7, twom: .9, twoa: .95 };

export const MARKETS = {
  PTS: { lb: 'Pontos', k: ['pts'], g: 'main', odds: 'player_points' },
  REB: { lb: 'Rebotes', k: ['reb'], g: 'main', odds: 'player_rebounds' },
  AST: { lb: 'Assistências', k: ['ast'], g: 'main', odds: 'player_assists' },
  '3PM': { lb: 'Bolas de 3 convertidas', short: '3PT', k: ['tpm'], g: 'main', odds: 'player_threes' },
  PRA: { lb: 'Pts+Reb+Ast', k: ['pts', 'reb', 'ast'], g: 'main', odds: 'player_points_rebounds_assists' },
  PR: { lb: 'Pts+Reb', k: ['pts', 'reb'], g: 'main', odds: 'player_points_rebounds' },
  PA: { lb: 'Pts+Ast', k: ['pts', 'ast'], g: 'main', odds: 'player_points_assists' },
  RA: { lb: 'Reb+Ast', k: ['reb', 'ast'], g: 'main', odds: 'player_rebounds_assists' },
  FGM: { lb: 'Arremessos de quadra convertidos', k: ['fgm'], g: 'shot', odds: 'player_field_goals' },
  FGA: { lb: 'Arremessos de quadra tentados', k: ['fga'], g: 'shot' },
  '2PM': { lb: 'Arremessos de 2 convertidos', k: ['twom'], g: 'shot' },
  '2PA': { lb: 'Arremessos de 2 tentados', k: ['twoa'], g: 'shot' },
  '3PA': { lb: 'Bolas de 3 tentadas', k: ['tpa'], g: 'shot' },
  FTM: { lb: 'Lances livres convertidos', k: ['ftm'], g: 'shot', odds: 'player_frees_made' },
  FTA: { lb: 'Lances livres tentados', k: ['fta'], g: 'shot', odds: 'player_frees_attempts' },
  STL: { lb: 'Roubos', k: ['stl'], g: 'other', odds: 'player_steals' },
  BLK: { lb: 'Tocos', k: ['blk'], g: 'other', odds: 'player_blocks' },
  SB: { lb: 'Roubos+Tocos', k: ['stl', 'blk'], g: 'other', odds: 'player_blocks_steals' },
  TOV: { lb: 'Erros (turnovers)', k: ['tov'], g: 'other', odds: 'player_turnovers' },
  PF: { lb: 'Faltas pessoais', k: ['pf'], g: 'other' }
};
export const GROUPS = { main: 'Principais', shot: 'Arremessos', other: 'Defesa e outros' };
export const POSLB = { G: 'Armador', F: 'Ala', C: 'Pivô' };

// ---------- matemática ----------
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sum = a => a.reduce((x, y) => x + y, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
export const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));

/* Distribuição de um valor inteiro (pontos, rebotes...) com média mu e
   dispersão d = variância/média. d≈1 → Poisson; d>1 → binomial negativa;
   médias altas → normal com correção de continuidade. Devolve cdf(k)=P(X<=k). */
export function makeDist(mu, d) {
  mu = Math.max(mu, 0.01); d = clamp(d, 1, 9);
  if (mu >= 14) { const sd = Math.sqrt(mu * d); return { type: 'normal', mu, sd, cdf: k => k < 0 ? 0 : Phi((k + 0.5 - mu) / sd) }; }
  const pmf = [];
  if (d <= 1.05) { let p = Math.exp(-mu); for (let k = 0; k < 400 && (k < mu * 3 + 20); k++) { pmf.push(p); p *= mu / (k + 1); } }
  else { const pp = 1 / d, r = mu / (d - 1); let p = Math.pow(pp, r); for (let k = 0; k < 400 && (k < mu * 4 + 30); k++) { pmf.push(p); p *= (k + r) / (k + 1) * (1 - pp); } }
  const cum = []; let c = 0; for (const p of pmf) { c += p; cum.push(Math.min(1, c)); }
  return { type: d <= 1.05 ? 'poisson' : 'negbin', mu, sd: Math.sqrt(mu * d), cdf: k => k < 0 ? 0 : k >= cum.length ? 1 : cum[Math.floor(k)] };
}

// P(mais de `line`) numa distribuição; em linha inteira, condicionado a não dar devolução (como a casa precifica)
export function overProb(dist, line) {
  const k = Math.floor(line);
  if (Number.isInteger(line)) { const push = dist.cdf(k) - dist.cdf(k - 1); const o = 1 - dist.cdf(k); return push < 1 ? o / (1 - push) : .5; }
  return 1 - dist.cdf(k);
}

// ---------- mercado: tirar a margem da casa (devig) ----------
/* Método da potência: acha k com (1/odd_mais)^k + (1/odd_menos)^k = 1. Corrige o viés
   favorito-zebra melhor que a divisão simples (multiplicativa). Devolve chances justas. */
export function devig(o, u, method = 'power') {
  if (!(o > 1) || !(u > 1)) return null;
  const a = 1 / o, b = 1 / u, over = a + b;
  if (method === 'mult' || over <= 1) return { pO: a / over, pU: b / over, margin: over - 1 };
  let lo = 1, hi = 4;
  for (let i = 0; i < 60; i++) { const k = (lo + hi) / 2; if (a ** k + b ** k > 1) lo = k; else hi = k; }
  const k = (lo + hi) / 2;
  return { pO: a ** k, pU: b ** k, margin: over - 1 };
}
// peso de cada casa no consenso (casas "afiadas" ajustam a linha mais rápido)
const SHARP = { pinnacle: 3, circa: 2.5, kalshi: 1.5, fanduel: 1.6, draftkings: 1.3, betonlineag: 1.2, lowvig: 1.2, betmgm: 1, caesars: 1, williamhillus: 1, espnbet: .9, betrivers: .8, bovada: .8 };
export const bookWeight = name => SHARP[String(name || '').toLowerCase().replace(/[^a-z]/g, '')] ?? 1;
/* Consenso do mercado numa linha: média ponderada das chances sem margem de cada casa */
export function consensus(books) {
  let W = 0, s = 0, m = 0, n = 0;
  for (const b in books || {}) {
    const x = books[b]; const d = devig(x?.o, x?.u); if (!d) continue;
    const w = bookWeight(b); W += w; s += w * d.pO; m += d.margin; n++;
  }
  return n ? { pO: s / W, n, margin: m / n } : null;
}
/* Média implícita do mercado: o valor de mu que, com a dispersão do jogador, dá a chance de
   "mais de" que o mercado cobra. Permite avaliar QUALQUER linha (ex.: casa BR 1 ponto abaixo). */
export function impliedMu(pOver, line, d) {
  let lo = 0.02, hi = Math.max(4, line * 3 + 15);
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (overProb(makeDist(mid, d), line) < pOver) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/* Kelly: fração da banca que maximiza o crescimento. Tipster usa fração (1/4) e teto. */
export function kelly(p, odd) { if (!odd || odd <= 1 || p == null) return 0; return Math.max(0, (p * odd - 1) / (odd - 1)); }

// ---------- informações fixas dos times ----------
export const TEAM_INFO = {
  ATL: ['Hawks', '#C8102E'], BOS: ['Celtics', '#007A33'], BKN: ['Nets', '#1F1F1F'], CHA: ['Hornets', '#1D1160'], CHI: ['Bulls', '#CE1141'],
  CLE: ['Cavaliers', '#860038'], DAL: ['Mavericks', '#00538C'], DEN: ['Nuggets', '#0E2240'], DET: ['Pistons', '#C8102E'], GSW: ['Warriors', '#1D428A'],
  HOU: ['Rockets', '#CE1141'], IND: ['Pacers', '#002D62'], LAC: ['Clippers', '#1D428A'], LAL: ['Lakers', '#552583'], MEM: ['Grizzlies', '#5D76A9'],
  MIA: ['Heat', '#98002E'], MIL: ['Bucks', '#00471B'], MIN: ['Timberwolves', '#236192'], NOP: ['Pelicans', '#0C2340'], NYK: ['Knicks', '#E2701A'],
  OKC: ['Thunder', '#007AC1'], ORL: ['Magic', '#0077C0'], PHI: ['76ers', '#006BB6'], PHX: ['Suns', '#1D1160'], POR: ['Trail Blazers', '#E03A3E'],
  SAC: ['Kings', '#5A2D81'], SAS: ['Spurs', '#5B6770'], TOR: ['Raptors', '#CE1141'], UTA: ['Jazz', '#3E2680'], WAS: ['Wizards', '#002B5C']
};

// ---------- defesa × posição ----------
function allowedValue(team, pos, k, slate) {
  const a = slate.teams?.[team]?.allowed?.[pos]; const lg = slate.league?.allowed?.[pos];
  const get = (o) => { if (!o) return null; if (k === 'twom') return o.fgm - o.tpm; if (k === 'twoa') return o.fga - o.tpa; return o[k]; };
  return { team: get(a), league: get(lg) };
}
const rankCache = new WeakMap();
export function dvpRank(slate, team, pos, k) {
  let c = rankCache.get(slate); if (!c) { c = {}; rankCache.set(slate, c); }
  const key = pos + k;
  if (!c[key]) {
    const arr = Object.keys(slate.teams || {}).map(t => [t, allowedValue(t, pos, k, slate).team]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    c[key] = {}; arr.forEach(([t], i) => c[key][t] = i + 1); c[key].n = arr.length;
  }
  return { rank: c[key][team] || null, of: c[key].n || 30 };
}

// ---------- contexto do jogador (minutos, uso) ----------
function playedLogs(p) { return p.logs.filter(g => g[L.min] > 0); }
function avgMin(logs, n) { return mean(logs.slice(0, n).map(g => g[L.min])); }

const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);

function context(p, slate, game) {
  const logs = playedLogs(p);
  const m5 = avgMin(logs, 5), m10 = avgMin(logs, 10), m20 = avgMin(logs, 20);
  let base = .4 * m5 + .35 * m10 + .25 * m20;
  const adj = [];
  const opp = game.home === p.team ? game.away : game.home;
  const isHome = game.home === p.team;
  const today = slate.meta?.date || game.date;
  // descanso: dias desde o último jogo e 3º jogo em 4 noites
  const rest = logs.length && today ? dayDiff(today, logs[0][L.date]) - 1 : null;
  const in4 = today ? logs.filter(g => { const dd = dayDiff(today, g[L.date]); return dd >= 1 && dd <= 3; }).length : 0;
  if ((game.b2b || []).includes(p.team)) adj.push({ lb: 'Back-to-back', f: .96 });
  if (in4 >= 2) adj.push({ lb: '3º jogo em 4 noites', f: .98 });
  // quinteto previsto/confirmado (stats.nba.com): reserva que vira titular ganha minutos, e o contrário
  const st10 = logs.slice(0, 10); const startRate = st10.length ? st10.filter(g => g[L.starter] === 1).length / st10.length : 0;
  let role = null;
  if (p.lineup?.role === 'starter' && startRate < .5) {
    const asSt = logs.filter(g => g[L.starter] === 1).slice(0, 10);
    const target = asSt.length >= 3 ? mean(asSt.map(g => g[L.min])) : base * 1.22;
    base = .6 * Math.max(target, base) + .4 * base; role = 'up';
    adj.push({ lb: (p.lineup.confirmed ? 'Titular confirmado' : 'Previsto como titular') + ' (era reserva)', f: 1 });
  } else if (p.lineup?.role === 'bench' && startRate >= .7) {
    const asB = logs.filter(g => g[L.starter] === 0).slice(0, 10);
    const target = asB.length >= 3 ? mean(asB.map(g => g[L.min])) : base * .82;
    base = .6 * Math.min(target, base) + .4 * base; role = 'down';
    adj.push({ lb: (p.lineup.confirmed ? 'Reserva confirmado' : 'Previsto no banco') + ' (era titular)', f: 1 });
  }
  const spread = game.spread == null ? null : Math.abs(game.spread);
  if (spread != null && spread >= 10 && m10 >= 26) adj.push({ lb: 'Risco de lavada (handicap ' + spread.toFixed(1).replace('.', ',') + ')', f: .94 });
  else if (spread != null && spread >= 7.5 && m10 >= 26) adj.push({ lb: 'Jogo pode abrir (handicap ' + spread.toFixed(1).replace('.', ',') + ')', f: .97 });
  if (p.status === 'questionable') adj.push({ lb: 'Dúvida', f: .9 });
  if (p.status === 'doubtful') adj.push({ lb: 'Provável desfalque', f: .75 });
  // colegas fora: parte dos minutos vai para quem fica, mais para a mesma posição
  const mates = slate.players.filter(q => q.team === p.team && q.id !== p.id);
  const out = mates.filter(q => (q.status === 'out' || q.status === 'doubtful') && avgMin(playedLogs(q), 5) >= 15);
  let extra = 0, usage = 1;
  if (out.length) {
    const active = [p, ...mates.filter(q => q.status !== 'out' && q.status !== 'doubtful')];
    const totSame = sum(active.filter(q => q.pos === p.pos).map(q => avgMin(playedLogs(q), 10))) || 1;
    const totAll = sum(active.map(q => avgMin(playedLogs(q), 10))) || 1;
    for (const q of out) {
      const qm = avgMin(playedLogs(q), 5);
      extra += q.pos === p.pos ? qm * .45 * (m10 / totSame) : qm * .15 * (m10 / totAll);
      if (qm >= 26) usage += .035;
    }
    extra = Math.min(extra, 8); usage = Math.min(usage, 1.10);
  }
  // histórico real SEM o colega mais importante que está fora hoje (gids vêm do coletor)
  let wo = null;
  const cand = [...out, ...mates.filter(q => q.status === 'questionable' && avgMin(playedLogs(q), 5) >= 20)];
  for (const q of cand.sort((a, b) => avgMin(playedLogs(b), 5) - avgMin(playedLogs(a), 5))) {
    const gids = p.wo?.[q.id]; if (!gids?.length) continue;
    const set = new Set(gids.map(String));
    const woLogs = logs.filter(g => set.has(String(g[L.gid]))), withLogs = logs.filter(g => !set.has(String(g[L.gid]))).slice(0, 20);
    if (woLogs.length < 2 || withLogs.length < 3) continue;
    wo = { q, set, n: woLogs.length, woLogs, withLogs, mWo: mean(woLogs.map(g => g[L.min])), mWith: mean(withLogs.map(g => g[L.min])), active: q.status !== 'questionable' };
    break;
  }
  if (wo?.active) {
    // mistura o salto de minutos observado com a estimativa por posição (mais peso com mais jogos)
    const w = wo.n / (wo.n + 5);
    extra = clamp(w * (wo.mWo - wo.mWith) + (1 - w) * extra, -4, 12);
  }
  let exp = base + extra;
  for (const a of adj) exp *= a.f;
  exp = clamp(exp, 0, 44);
  return { logs, m5, m10, m20, base, extra, adj, exp, usage, out, opp, isHome, rest, in4, startRate, role, wo };
}
// ritmo por minuto de uma estatística num conjunto de jogos
function ratePM(logs, k) { const mm = sum(logs.map(g => g[L.min])); return mm ? sum(logs.map(g => BASE[k](g))) / mm : 0; }

// ---------- monta todas as props ----------
/* opts.calib: aplica a calibração do backtest (slate.calib = {mercado: k}). k<1 = modelo
   confiante demais → aumenta a dispersão (d ÷ k²), o que puxa as chances para perto de 50%. */
export function buildProps(slate, opts = {}) {
  const calib = opts.calib === false ? null : slate.calib || null;
  const gameByTeam = {};
  for (const g of slate.games) { gameByTeam[g.home] = g; gameByTeam[g.away] = g; }
  const lines = {};
  for (const ln of slate.lines || []) lines[ln.pid + '|' + ln.mk] = ln;
  const lgPace = slate.league?.pace || 100, lgTotal = slate.league?.avgTotal || null;
  const props = [];
  for (const p of slate.players) {
    const game = gameByTeam[p.team]; if (!game || p.status === 'out') continue;
    const ctx = context(p, slate, game); if (ctx.logs.length < 3 || ctx.exp < 8) continue;
    const opp = ctx.opp;
    const tp = slate.teams?.[p.team]?.pace, op = slate.teams?.[opp]?.pace;
    let paceRatio = tp && op ? ((tp + op) / 2) / lgPace : 1;
    if (game.total && lgTotal) paceRatio = (paceRatio + game.total / lgTotal) / 2;
    for (const mk in MARKETS) {
      const M = MARKETS[mk];
      const vals = ctx.logs.map(g => sum(M.k.map(k => BASE[k](g))));
      const book = lines[p.id + '|' + mk];
      const avg20 = mean(vals.slice(0, 20));
      if (!book && avg20 < .6 && mk !== 'PF') continue;
      let proj = 0; const fac = [];
      for (const k of M.k) {
        const rate = n => ratePM(ctx.logs.slice(0, n), k);
        const r = .25 * rate(5) + .35 * rate(10) + .40 * rate(20);
        const av = allowedValue(opp, p.pos, k, slate);
        const mf = av.team && av.league ? clamp(1 + (av.team / av.league - 1) * .5, .88, 1.12) : 1;
        const pf = 1 + (paceRatio - 1) * (PACEW[k] ?? .7);
        let uf = OFFENSIVE.has(k) ? ctx.usage : 1;
        if (ctx.wo?.active) {
          // ritmo por minuto observado sem o colega × com ele (vale também para rebotes, tocos…)
          const rw = ratePM(ctx.wo.woLogs, k), rc = ratePM(ctx.wo.withLogs, k);
          if (rc > 0 && rw > 0) { const w = ctx.wo.n / (ctx.wo.n + 8); uf = clamp(1 + w * (rw / rc - 1) + (1 - w) * (uf - 1), .85, 1.3); }
        }
        const v = r * ctx.exp * mf * pf * uf;
        proj += v; fac.push({ k, r, mf, pf, uf, v });
      }
      // dispersão observada (variância/média) nos últimos 20, com piso por mercado
      const v20 = vals.slice(0, 20); const m = mean(v20);
      const varr = v20.length > 1 ? sum(v20.map(x => (x - m) ** 2)) / (v20.length - 1) : m;
      let d = m > 0 ? varr / m : 1.4; if (v20.length < 8) d = Math.max(d, 1.5);
      const kc = calib?.[mk]; if (kc && kc > 0) d = d / (kc * kc);
      const dist = makeDist(proj, d);
      // linha de referência: entre as duas linhas .5 vizinhas da mediana, a que dividiu
      // os últimos 15 jogos mais perto de 50/50 (é o que as casas tentam fazer)
      const last15 = vals.slice(0, 15), md = Math.floor(median(last15));
      const refLine = [md - .5, md + .5].filter(x => x > 0).map(x => [x, Math.abs(last15.filter(v => v > x).length / last15.length - .5)]).sort((a, b) => a[1] - b[1] || b[0] - a[0])[0][0];
      // fatores médios ponderados (para explicar)
      const wsum = sum(fac.map(f => f.v)) || 1;
      const mfAvg = sum(fac.map(f => f.mf * f.v)) / wsum, pfAvg = sum(fac.map(f => f.pf * f.v)) / wsum, ufAvg = sum(fac.map(f => f.uf * f.v)) / wsum;
      const mainK = fac.slice().sort((a, b) => b.v - a.v)[0].k;
      const rk = { ...dvpRank(slate, opp, p.pos, mainK), k: mainK };
      // mercado: consenso sem margem na linha das casas → média implícita (vale para qualquer linha)
      let mkt = null;
      if (book) {
        const c = consensus(book.books);
        if (c) {
          const mu = impliedMu(c.pO, book.line, d);
          mkt = { pO: c.pO, n: c.n, margin: c.margin, mu, dist: makeDist(mu, d), line: book.line };
          const oc = book.open?.books && consensus(book.open.books);
          if (oc) { mkt.openP = oc.pO; mkt.openLine = book.open.line; mkt.openMu = impliedMu(oc.pO, book.open.line, d); }
        }
      }
      props.push({
        id: p.id + '-' + mk, p, mk, game, opp, ctx, vals, proj, d, dist, refLine, mkt, _df: {},
        book: book || null, line: book ? book.line : refLine, lineSource: book ? 'book' : 'ref',
        factors: { base: sum(fac.map(f => f.r)) * ctx.exp, mf: mfAvg, pf: pfAvg, uf: ufAvg, paceRatio, per36: sum(fac.map(f => f.r)) * 36 },
        rank: rk
      });
    }
  }
  return props;
}

// ---------- avalia uma linha (da casa, de referência ou digitada) ----------
export function bestPrice(books, side) {
  let best = null;
  for (const b in books || {}) { const x = books[b]; const o = side === 'over' ? x?.o : x?.u; if (o && (!best || o > best.odd)) best = { odd: o, book: b }; }
  return best;
}
/* Avalia uma linha. opts.w = peso do modelo na mistura com o mercado (0..1).
   Com consenso das casas, a projeção final = w·modelo + (1−w)·mercado (média implícita).
   Sem mercado, vale só o modelo. */
export function evaluate(pr, ov, opts = {}) {
  const W = opts.w ?? .55;
  const line = ov?.line ?? pr.line;
  const isInt = Number.isInteger(line);
  const k = Math.floor(line);
  const muF = pr.mkt && W < 1 ? W * pr.proj + (1 - W) * pr.mkt.mu : pr.proj;
  const df = pr.mkt && W < 1 ? ((pr._df ||= {})[W] ||= makeDist(muF, pr.d)) : pr.dist;
  const sides = dist => { const u = isInt ? dist.cdf(k - 1) : dist.cdf(k); const o = 1 - dist.cdf(k); return { o, u, push: isInt ? Math.max(0, 1 - o - u) : 0 }; };
  const F = sides(df), Mo = sides(pr.dist), Mk = pr.mkt ? sides(pr.mkt.dist) : null;
  // casa digitada com as duas odds: chance sem margem dela (só para referência)
  const myDv = ov?.oOver && ov?.oUnder ? devig(ov.oOver, ov.oUnder) : null;
  const v = pr.vals, logs = pr.ctx.logs;
  const res = {};
  for (const side of ['over', 'under']) {
    const hit = x => side === 'over' ? x > line : x < line;
    const cnt = a => [a.filter(hit).length, a.length];
    const h2h = v.filter((_, i) => logs[i][L.opp] === pr.opp).slice(0, 10);
    const cur = v.filter((_, i) => logs[i][L.cur] === 1);
    let streak = 0; for (const x of v) { if (hit(x)) streak++; else break; }
    const p = side === 'over' ? F.o : F.u;
    const pModel = side === 'over' ? Mo.o : Mo.u;
    const pMkt = Mk ? (side === 'over' ? Mk.o : Mk.u) : null;
    let odd = null, book = null;
    if (ov && (side === 'over' ? ov.oOver : ov.oUnder)) { odd = side === 'over' ? ov.oOver : ov.oUnder; book = ov.book || 'Sua casa'; }
    else if (pr.book && (ov?.line == null || ov.line === pr.book.line)) { const b = bestPrice(pr.book.books, side); if (b) { odd = b.odd; book = b.book; } }
    const ev = odd ? p * odd + F.push - 1 : null;
    const hits = { L5: cnt(v.slice(0, 5)), L10: cnt(v.slice(0, 10)), L20: cnt(v.slice(0, 20)), H2H: cnt(h2h), CUR: cnt(cur) };
    // sem o colega que está fora hoje (histórico real)
    if (pr.ctx.wo) hits.WO = cnt(v.filter((_, i) => pr.ctx.wo.set.has(String(logs[i][L.gid]))));
    const pNoPush = p / Math.max(1e-9, 1 - F.push);
    res[side] = {
      side, p, pModel, pMkt, pPush: F.push, odd, book, ev, fair: p > 0 ? 1 / pNoPush : null,
      kelly: odd ? kelly(pNoPush, odd) * (1 - F.push) : 0,
      myFair: myDv ? (side === 'over' ? myDv.pO : myDv.pU) : null,
      hits, streak, gap: side === 'over' ? muF - line : line - muF, grade: grade(p, hits, ev, logs.length)
    };
    const r = pr.rank?.rank; res[side].fav = r ? (side === 'over' ? r >= 21 : r <= 10) : false;
  }
  res.line = line; res.muF = muF; res.w = pr.mkt ? W : 1;
  res.best = (res.over.ev ?? res.over.p - .5) >= (res.under.ev ?? res.under.p - .5) ? 'over' : 'under';
  if (res.over.ev == null && res.under.ev == null) res.best = res.over.p >= res.under.p ? 'over' : 'under';
  return res;
}
/* Nota pensada para tipster: com odd, manda o valor (EV) com chance e histórico de apoio;
   sem odd, não há como medir valor, então a nota máxima é A.
   Trava de consistência: A+ exige 7+ acertos nos últimos 10 e 60%+ nos últimos 20; A exige 6+ nos
   últimos 10. Com menos de 10 jogos de histórico (n), a nota máxima é A. */
export function grade(p, hits, ev, n = 99) {
  const h10 = hits.L10?.[1] >= 8 ? hits.L10[0] / hits.L10[1] * 10 : 0;
  const h20 = hits.L20?.[1] >= 12 ? hits.L20[0] / hits.L20[1] : 0;
  if (ev != null) {
    if (ev >= .06 && p >= .56 && h10 >= 7 && h20 >= .6) return n >= 10 ? 'A+' : 'A';
    if (ev >= .03 && p >= .53 && h10 >= 6) return 'A';
    if (ev >= 0 && p >= .45) return 'B';
    return 'C';
  }
  if (p >= .62 && h10 >= 7) return 'A';
  if (p >= .55) return 'B';
  return 'C';
}
/* Múltipla: chance combinada com correlação empírica. Pernas do mesmo jogo são comparadas
   nos jogos em que todos estiveram em quadra juntos (mesmo gid): taxa de acerto conjunta
   observada ÷ produto das taxas individuais, encolhida pelo tamanho da amostra. */
export function parlayProb(legs) {
  const byGame = {};
  for (const l of legs) (byGame[l.pr.game.id] ||= []).push(l);
  let prob = 1; const groups = [];
  for (const gid in byGame) {
    const G = byGame[gid]; const base = G.reduce((a, l) => a * l.p, 1);
    if (G.length < 2) { prob *= base; continue; }
    const maps = G.map(l => { const m = new Map(); l.pr.ctx.logs.forEach((g, i) => m.set(String(g[L.gid]), l.pr.vals[i])); return m; });
    const common = [...maps[0].keys()].filter(k => maps.every(m => m.has(k))).slice(0, 30);
    const n = common.length; let f = 1;
    if (n >= 5) {
      const hitOf = (l, x) => l.side === 'over' ? x > l.line : x < l.line;
      const ind = G.map((l, j) => (common.filter(k => hitOf(l, maps[j].get(k))).length + .5) / (n + 1));
      const joint = (common.filter(k => G.every((l, j) => hitOf(l, maps[j].get(k)))).length + .5 * ind.reduce((a, b) => a * b, 1)) / (n + .5);
      const I = ind.reduce((a, b) => a * b, 1);
      f = clamp(1 + (n / (n + 12)) * (joint / I - 1), .6, 1.8);
    }
    prob *= Math.min(base * f, Math.min(...G.map(l => l.p)));
    groups.push({ gid, legs: G.length, n, f });
  }
  return { prob, groups };
}
export const GRADE_ORDER = { 'A+': 4, A: 3, B: 2, C: 1 };

/* ---------- v7: faixa provável, escada de linhas e radar de divergência ---------- */
// quantil: menor valor inteiro k com P(X ≤ k) ≥ q
export function quantile(dist, q) { const cap = Math.ceil(dist.mu * 6 + 60); let k = 0; while (k < cap && dist.cdf(k) < q) k++; return k; }
/* Escada "X ou mais": chance de cada degrau inteiro (linha X − 0,5) com o acerto real em L10/L20.
   Degraus entre os quantis 10% e 75% da projeção final, no máximo `max` degraus. */
export function ladder(pr, opts = {}) {
  const e0 = evaluate(pr, null, opts); const df = makeDist(e0.muF, pr.d);
  const lo = Math.max(1, quantile(df, .1)), hi = Math.max(lo + 1, quantile(df, .75));
  const max = opts.max || 8, step = Math.max(1, Math.ceil((hi - lo + 1) / max));
  const out = [];
  for (let t = lo; t <= hi && out.length < max; t += step) {
    const s = evaluate(pr, { line: t - .5 }, opts).over;
    out.push({ t, p: s.p, fair: s.fair, L10: s.hits.L10, L20: s.hits.L20, H2H: s.hits.H2H, streak: s.streak });
  }
  return out;
}
/* Radar de divergência: a melhor odd de cada lado comparada ao consenso SEM essa casa.
   edge = odd × chance justa das outras − 1. Precisa de 3+ casas com as duas odds. */
export function divergence(books) {
  const names = Object.keys(books || {}).filter(b => books[b]?.o > 1 && books[b]?.u > 1);
  if (names.length < 3) return null;
  let best = null;
  for (const side of ['over', 'under']) {
    const b = bestPrice(Object.fromEntries(names.map(n => [n, books[n]])), side); if (!b) continue;
    const c = consensus(Object.fromEntries(names.filter(n => n !== b.book).map(n => [n, books[n]]))); if (!c) continue;
    const pFair = side === 'over' ? c.pO : 1 - c.pO;
    const r = { side, book: b.book, odd: b.odd, fairOdd: 1 / pFair, pFair, edge: b.odd * pFair - 1, n: c.n };
    if (!best || r.edge > best.edge) best = r;
  }
  return best;
}

