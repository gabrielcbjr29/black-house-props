#!/usr/bin/env node
// Gera um slate de DEMONSTRAÇÃO (números fictícios) passando pelo mesmo
// caminho do coletor real (boxscores → buildSlate). Serve para testar o app
// sem internet. Uso: node collector/demo.js
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSlate, buildResults } from './slate.js';
import { runBacktest } from './backtest.js';
import { TEAM_INFO, MARKETS, buildProps } from '../public/engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(20261028);
const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pois = mu => { if (mu <= 0) return 0; if (mu > 30) return Math.max(0, Math.round(mu + gauss() * Math.sqrt(mu))); let L = Math.exp(-mu), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };
const binom = (n, p) => { let s = 0; for (let i = 0; i < n; i++) if (R() < p) s++; return s; };

// [nome, time, pos, min, pts, reb, ast, 3pa, 3p%, fta, ft%, stl, blk, tov, pf, extras]
const PL = [
  ['Donovan Mitchell', 'CLE', 'G', 33, 26.1, 4.6, 5.1, 8.8, .37, 5.6, .86, 1.3, .3, 2.6, 2.2],
  ['Evan Mobley', 'CLE', 'C', 32, 18.4, 9.2, 3.4, 2.6, .35, 4.4, .72, .9, 1.6, 2.0, 2.6],
  ['Darius Garland', 'CLE', 'G', 30, 19.2, 2.9, 6.7, 6.4, .39, 3.3, .87, 1.1, .1, 2.8, 2.0, { st: 'questionable', note: 'Dedo do pé' }],
  ['Jarrett Allen', 'CLE', 'C', 29, 13.1, 9.5, 1.8, 0, 0, 3.6, .68, .8, .9, 1.4, 2.3],
  ['Cade Cunningham', 'DET', 'G', 35, 26.0, 6.1, 9.1, 5.6, .35, 7.0, .85, 1.1, .8, 4.1, 2.4],
  ['Jalen Duren', 'DET', 'C', 29, 12.3, 10.6, 2.6, 0, 0, 3.9, .66, .7, .9, 1.8, 3.1],
  ['Ausar Thompson', 'DET', 'F', 27, 10.4, 6.1, 2.6, .9, .3, 2.3, .62, 1.6, .9, 1.5, 2.6],
  ['Tobias Harris', 'DET', 'F', 28, 13.5, 5.6, 2.0, 3.3, .36, 2.6, .85, .8, .6, 1.2, 2.0],
  ['Jaylen Brown', 'BOS', 'F', 34, 25.4, 6.0, 4.3, 6.4, .36, 6.0, .76, 1.1, .4, 2.8, 2.4],
  ['Derrick White', 'BOS', 'G', 33, 16.8, 4.4, 4.6, 8.4, .38, 2.7, .89, 1.0, 1.1, 1.4, 2.1],
  ['Payton Pritchard', 'BOS', 'G', 33, 15.1, 3.9, 3.7, 7.6, .39, 1.6, .85, .8, .1, 1.1, 1.8],
  ['Neemias Queta', 'BOS', 'C', 24, 9.4, 7.8, 1.2, 0, 0, 2.6, .69, .6, 1.4, 1.0, 2.8],
  ['Jalen Brunson', 'NYK', 'G', 35, 26.8, 3.4, 7.3, 6.5, .38, 7.0, .83, .9, .1, 2.5, 2.0],
  ['Karl-Anthony Towns', 'NYK', 'C', 34, 24.2, 12.6, 3.1, 5.8, .40, 5.8, .84, .9, .7, 3.0, 3.3],
  ['Josh Hart', 'NYK', 'F', 34, 12.4, 9.1, 5.6, 3.4, .34, 2.4, .73, 1.3, .3, 1.7, 2.6],
  ['OG Anunoby', 'NYK', 'F', 35, 16.3, 4.9, 2.1, 6.2, .37, 2.8, .80, 1.4, .8, 1.3, 2.4],
  ['Mikal Bridges', 'NYK', 'F', 35, 17.6, 3.3, 3.6, 5.2, .36, 1.8, .82, 1.0, .5, 1.6, 1.7],
  ['Shai Gilgeous-Alexander', 'OKC', 'G', 34, 31.2, 5.0, 6.3, 5.4, .37, 9.0, .89, 1.6, 1.0, 2.4, 2.2],
  ['Chet Holmgren', 'OKC', 'C', 30, 17.4, 8.6, 2.1, 4.4, .36, 4.2, .79, .6, 2.1, 1.6, 2.4],
  ['Jalen Williams', 'OKC', 'F', 32, 19.1, 5.4, 5.0, 4.7, .36, 3.8, .83, 1.4, .6, 2.1, 2.5, { st: 'out', note: 'Punho' }],
  ['Luguentz Dort', 'OKC', 'G', 28, 9.8, 4.1, 1.5, 5.6, .37, 1.4, .76, 1.1, .4, .8, 2.8],
  ['Victor Wembanyama', 'SAS', 'C', 33, 25.1, 11.4, 3.6, 8.0, .36, 5.2, .82, 1.1, 3.6, 3.2, 2.3],
  ["De'Aaron Fox", 'SAS', 'G', 33, 20.2, 4.1, 6.4, 4.8, .33, 5.0, .78, 1.4, .4, 2.4, 2.2],
  ['Stephon Castle', 'SAS', 'G', 29, 14.3, 4.6, 4.1, 3.4, .30, 4.4, .74, .9, .4, 2.2, 2.2],
  ['Devin Vassell', 'SAS', 'F', 29, 14.8, 4.0, 2.8, 6.6, .37, 1.6, .80, 1.2, .4, 1.1, 1.6],
  ['Anthony Edwards', 'MIN', 'G', 36, 27.6, 5.7, 4.6, 10.2, .37, 6.6, .83, 1.2, .6, 3.2, 1.9],
  ['Rudy Gobert', 'MIN', 'C', 33, 11.4, 11.1, 1.6, 0, 0, 4.4, .64, .7, 1.6, 1.4, 2.6],
  ['Julius Randle', 'MIN', 'F', 34, 19.0, 7.0, 4.8, 4.2, .34, 5.2, .80, .8, .2, 2.6, 2.9],
  ['Jaden McDaniels', 'MIN', 'F', 32, 12.0, 5.4, 1.8, 3.6, .37, 2.2, .78, 1.1, .9, 1.2, 3.2],
  ['Nikola Jokić', 'DEN', 'C', 36, 29.4, 12.5, 10.1, 4.6, .41, 6.8, .80, 1.6, .7, 3.3, 2.4],
  ['Jamal Murray', 'DEN', 'G', 35, 22.0, 4.2, 6.1, 6.9, .38, 3.8, .88, 1.2, .4, 2.3, 2.0],
  ['Aaron Gordon', 'DEN', 'F', 30, 14.1, 5.4, 3.1, 3.4, .38, 3.6, .78, .8, .4, 1.4, 1.9, { st: 'questionable', note: 'Panturrilha' }],
  ['Christian Braun', 'DEN', 'G', 33, 14.6, 5.9, 2.8, 3.0, .37, 3.0, .76, 1.1, .5, 1.3, 2.4],
  ['Luka Dončić', 'LAL', 'G', 36, 30.1, 8.4, 8.6, 10.0, .35, 8.8, .79, 1.6, .5, 3.8, 2.6],
  ['Austin Reaves', 'LAL', 'G', 35, 21.3, 4.6, 6.0, 6.8, .38, 6.0, .87, 1.1, .3, 2.2, 1.8],
  ['Deandre Ayton', 'LAL', 'C', 30, 14.2, 10.1, 1.6, 0, 0, 2.2, .75, .6, 1.0, 1.6, 2.8],
  ['Rui Hachimura', 'LAL', 'F', 30, 12.8, 4.5, 1.2, 3.6, .40, 2.0, .78, .6, .3, .9, 1.9],
  ['Stephen Curry', 'GSW', 'G', 32, 25.0, 4.4, 6.0, 11.6, .39, 4.8, .92, 1.1, .4, 3.0, 1.6],
  ['Jimmy Butler', 'GSW', 'F', 31, 18.1, 5.6, 5.5, 2.4, .33, 8.0, .84, 1.4, .3, 1.6, 1.5],
  ['Draymond Green', 'GSW', 'F', 28, 8.6, 6.1, 5.6, 3.6, .35, 1.6, .70, 1.1, .9, 2.0, 3.2],
  ['Brandin Podziemski', 'GSW', 'G', 27, 11.2, 5.0, 3.4, 4.6, .37, 1.6, .78, 1.0, .2, 1.2, 1.8]
];
const TODAY = '2026-10-28';
const TODAY_GAMES = [['DET', 'CLE', '2026-10-28T23:00:00Z', -5.5, 226.0], ['NYK', 'BOS', '2026-10-28T23:30:00Z', -3.5, 221.5], ['SAS', 'OKC', '2026-10-29T00:00:00Z', -8.5, 224.5], ['MIN', 'DEN', '2026-10-29T01:00:00Z', -4.5, 229.5], ['GSW', 'LAL', '2026-10-29T02:00:00Z', -2.5, 231.0]];

// elenco de cada time: os reais listados + reservas genéricos (poucos minutos, não aparecem no app)
let pid = 100000;
const roster = {};
for (const t of Object.keys(TEAM_INFO)) roster[t] = [];
for (const r of PL) roster[r[1]].push({ id: pid++, name: r[0], team: r[1], pos: r[2], min: r[3], pts: r[4], reb: r[5], ast: r[6], tpa: r[7], tpp: r[8], fta: r[9], ftp: r[10], stl: r[11], blk: r[12], tov: r[13], pf: r[14], ex: r[15] || {} });
for (const t in roster) {
  const need = 9 - roster[t].length;
  const lvl = .85 + R() * .3;
  const isToday = TODAY_GAMES.some(g => g[0] === t || g[1] === t);
  for (let i = 0; i < need; i++) {
    const pos = ['G', 'G', 'F', 'F', 'C', 'G', 'F', 'C', 'F'][i];
    const big = roster[t].length < 5;
    const min = isToday ? 7 : big ? 30 : 9.5;
    roster[t].push({ id: pid++, name: `${t} ${pos}${i}`, team: t, pos, min, pts: (big ? 17 : 4) * lvl, reb: pos === 'C' ? (big ? 9 : 3) : (big ? 4.5 : 1.6), ast: pos === 'G' ? (big ? 5.5 : 1.5) : (big ? 2.5 : .7), tpa: pos === 'C' ? .8 : (big ? 5.5 : 1.4), tpp: .36, fta: big ? 3.5 : .8, ftp: .78, stl: .9, blk: pos === 'C' ? 1.2 : .4, tov: big ? 1.8 : .5, pf: big ? 2.2 : 1.1, ex: {} });
  }
}
// defesa de cada time: fator por posição (alguns cedem mais a armadores, outros a pivôs)
const defF = {}; for (const t in roster) defF[t] = { G: .9 + R() * .2, F: .9 + R() * .2, C: .9 + R() * .2 };

function playerLine(p, opp, form, minF) {
  let m = p.min * minF + gauss() * 3; if (R() < .05) m *= .7; m = Math.max(0, Math.min(46, m));
  const s = m / p.min, df = defF[opp][p.pos] * form;
  const tpa = pois(p.tpa * s * df); const tpm = binom(tpa, p.tpp);
  const fta = pois(p.fta * s * df); const ftm = binom(fta, p.ftp);
  const two2 = Math.max(0, (p.pts - 3 * p.tpa * p.tpp - p.fta * p.ftp) / 2);
  const twoP = p.pos === 'C' ? .62 : .52;
  const twoa = pois(two2 / twoP * s * df); const twom = binom(twoa, twoP);
  const reb = pois(p.reb * s * (2 - df) ** .3); const oreb = binom(reb, p.pos === 'C' ? .3 : .15);
  return { m: Math.round(m * 10) / 10, pts: 2 * twom + 3 * tpm + ftm, reb, oreb, ast: pois(p.ast * s * df), stl: pois(p.stl * s), blk: pois(p.blk * s), tov: pois(p.tov * s), pf: Math.min(6, pois(p.pf * s)), fgm: twom + tpm, fga: twoa + tpa, tpm, tpa, ftm, fta };
}
function sim(gid, date, home, away, cur) {
  const r = [], names = {}; let hs = 0, as = 0; const poss = { [home]: 0, [away]: 0 };
  for (const [t, opp] of [[home, away], [away, home]]) {
    roster[t].forEach((p, i) => {
      if (p.ex.st === 'out' && cur && date > '2026-10-21') return;
      const form = 1 + (cur ? (((p.id * 7919) % 17) - 8) / 100 : 0);
      const minF = p.name === 'Payton Pritchard' && !cur ? .85 : 1;
      const g = playerLine(p, opp, form, minF); if (g.m <= 0) return;
      names[p.id] = p.name;
      r.push([p.id, t, i < 5 ? p.pos : null, i < 5 ? 1 : 0, g.m, g.pts, g.reb, g.oreb, g.ast, g.stl, g.blk, g.tov, g.pf, g.fgm, g.fga, g.tpm, g.tpa, g.ftm, g.fta]);
      if (t === home) hs += g.pts; else as += g.pts;
      poss[t] += g.fga + .44 * g.fta - g.oreb + g.tov;
    });
  }
  return { gid, d: date, h: home, a: away, hs, as, gm: 48, ph: Math.round(poss[home] * 10) / 10, pa: Math.round(poss[away] * 10) / 10, r, names };
}
const teams = Object.keys(TEAM_INFO);
function season(startDate, nRounds, cur, prefix) {
  const out = []; let n = 1; const d0 = new Date(startDate + 'T12:00:00Z');
  for (let round = 0; round < nRounds; round++) {
    const sh = teams.slice().sort(() => R() - .5);
    const date = new Date(d0); date.setUTCDate(d0.getUTCDate() + round * 2);
    const iso = date.toISOString().slice(0, 10);
    for (let i = 0; i < sh.length; i += 2) out.push(sim(prefix + String(n++).padStart(5, '0'), iso, sh[i], sh[i + 1], cur));
  }
  return out;
}
const prev = season('2026-02-10', 30, 0, '00225');
const cur = season('2026-10-20', 4, 1, '00226');
// times de hoje: garantir 1 confronto direto recente na temporada passada
for (const [a, h] of TODAY_GAMES) prev.push(sim('00225' + String(900 + prev.length).padStart(5, '0'), '2026-03-25', h, a, 0), sim('00225' + String(901 + prev.length).padStart(5, '0'), '2026-01-15', a, h, 0));
// GSW jogou ontem (back-to-back)
cur.push(sim('0022600099', '2026-10-27', 'GSW', 'PHX', 1));

const names = {}; for (const g of [...prev, ...cur]) Object.assign(names, g.names);
const injuries = {};
for (const p of PL) if (p[15]) injuries[p[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim()] = { name: p[0], status: p[15].st, note: p[15].note, team: p[1] };
const gameOdds = {};
const base0 = buildSlate({ date: TODAY, season: '2026-27', cur, prev, today: [], names });
for (const [a, h, , s, t] of TODAY_GAMES) gameOdds[a + '@' + h] = { spread: s, total: Math.round((base0.league.avgTotal + (t - 226)) * 2) / 2 };

// linhas de casas simuladas para os mercados que a The Odds API cobre
const slate0 = buildSlate({ date: TODAY, season: '2026-27', cur, prev, today: TODAY_GAMES.map(([a, h, utc], i) => ({ gid: '00226' + String(200 + i).padStart(5, '0'), utc, home: h, away: a })), b2b: new Set(['GSW']), injuries, gameOdds, names });
const PR0 = new Map(buildProps(slate0).map(x => [x.id, x]));
const BOOKS = ['Bet365', 'Betano', 'Superbet', 'KTO', 'Betfair', 'Novibet'];
const oddsLines = [];
for (const p of slate0.players) for (const mk of ['PTS', 'REB', 'AST', '3PM', 'PRA']) {
  const k = MARKETS[mk].k; const vals = p.logs.slice(0, 15).map(l => k.reduce((a, s) => a + l[{ pts: 4, reb: 5, ast: 7, tpm: 14 }[s]], 0)).sort((x, y) => x - y);
  if (!vals.length) continue; const med = vals[vals.length >> 1]; if (med < 1) continue;
  const line = Math.floor(med + (R() - .5) * 2) + .5; const books = {};
  const overRate = vals.filter(x => x > line).length / vals.length;
  const pr0 = PR0.get(p.id + '-' + mk); const pm = pr0 ? 1 - pr0.dist.cdf(Math.floor(Math.max(.5, line))) : overRate;
  for (const b of BOOKS) { if (R() < .2) continue; const pb = Math.min(.88, Math.max(.12, .75 * pm + .25 * overRate + (R() - .5) * .07)); books[b] = { o: +(1 / (pb * 1.06)).toFixed(2), u: +(1 / ((1 - pb) * 1.06)).toFixed(2) }; }
  if (Object.keys(books).length) oddsLines.push({ name: p.name, mk, line: Math.max(.5, line), books });
}
// quinteto do dia: Mikal Bridges previsto no banco (para mostrar o ajuste de minutos)
const lineups = {}; for (const t of ['NYK']) roster[t].forEach((p, i) => { lineups[String(p.id)] = { role: p.name === 'Mikal Bridges' ? 'bench' : i < 6 ? 'starter' : 'bench', confirmed: false, team: t }; });
const slate = buildSlate({ date: TODAY, season: '2026-27', cur, prev, today: TODAY_GAMES.map(([a, h, utc], i) => ({ gid: '00226' + String(200 + i).padStart(5, '0'), utc, home: h, away: a })), b2b: new Set(['GSW']), injuries, gameOdds, oddsLines, names, lineups,
  sources: { boxscores: 'simulados (demonstração)', injuries: 'simuladas', gameLines: 'simulados', odds: 'simuladas para PTS, REB, AST, 3PT e PRA; demais mercados com linha de referência' } });
slate.meta.demo = true;
// linha de abertura simulada (para mostrar movimento de linha e CLV)
for (const l of slate.lines) if (R() < .35) {
  const dl = R() < .5 ? -1 : 1; const books = {};
  for (const b in l.books) books[b] = { o: +(l.books[b].o * (dl > 0 ? 1.06 : .95)).toFixed(2), u: +(l.books[b].u * (dl > 0 ? .95 : 1.06)).toFixed(2) };
  l.open = { line: Math.max(.5, l.line - dl), books, at: '2026-10-28T13:00:00Z' };
}
for (const g of slate.games) { g.openSpread = g.spread == null ? null : g.spread + (R() < .5 ? .5 : -1); g.openTotal = g.total == null ? null : g.total - 1.5; }
const out = join(ROOT, 'public', 'data', 'slate.json');
await mkdir(dirname(out), { recursive: true });
// backtest de calibração nos dados simulados (últimas datas da temporada passada simulada)
const bt = runBacktest({ cur: [], prev: prev.filter(g => g.d >= '2026-02-10'), names, days: 14 });
bt.demo = true;
await writeFile(join(ROOT, 'public', 'data', 'backtest.json'), JSON.stringify(bt));
slate.calib = bt.calib;
await writeFile(out, JSON.stringify(slate));
// resultados: na demonstração os jogos de HOJE também são simulados, para ver a liquidação das tips
const todaySim = TODAY_GAMES.map(([a, h], i) => sim('00226' + String(200 + i).padStart(5, '0'), TODAY, h, a, 1));
const res = buildResults([...cur, ...prev, ...todaySim], Object.assign({}, names, ...todaySim.map(g => g.names)), '2026-10-29');
res.demo = true;
await writeFile(join(ROOT, 'public', 'data', 'results.json'), JSON.stringify(res));
console.log(`Demo: ${slate.games.length} jogos, ${slate.players.length} jogadores, ${slate.lines.length} linhas → public/data/slate.json`);
