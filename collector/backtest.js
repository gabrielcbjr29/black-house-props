#!/usr/bin/env node
/* Backtest de calibração: refaz o modelo em datas passadas usando SÓ o que se sabia antes de
   cada jogo, e compara a chance prevista com o que aconteceu. Mostra onde o modelo é confiável
   (por mercado, por nota e por faixa de chance) — é o que separa tipster lucrativo de achismo.
   Uso: node collector/backtest.js [--days 30]   → public/data/backtest.json
   Limite: sem odds históricas, a linha usada é a de referência (mediana dos últimos 15). */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSlate } from './slate.js';
import { buildProps, evaluate, MARKETS, BASE } from '../public/engine.js';

const RI = { pid: 0, team: 1, min: 4, pts: 5, reb: 6, ast: 8, stl: 9, blk: 10, tov: 11, pf: 12, fgm: 13, fga: 14, tpm: 15, tpa: 16, ftm: 17, fta: 18 };
// linha do boxscore → linha compacta do motor (mesmos índices de L em engine.js)
const asLog = r => { const g = []; g[4] = r[RI.pts]; g[5] = r[RI.reb]; g[7] = r[RI.ast]; g[8] = r[RI.stl]; g[9] = r[RI.blk]; g[10] = r[RI.tov]; g[11] = r[RI.pf]; g[12] = r[RI.fgm]; g[13] = r[RI.fga]; g[14] = r[RI.tpm]; g[15] = r[RI.tpa]; g[16] = r[RI.ftm]; g[17] = r[RI.fta]; return g; };
const BUCKETS = [[.5, .55], [.55, .6], [.6, .65], [.65, .7], [.7, 1.01]];
const PRICE = 1.87; // odd típica de prop (−115) para simular retorno

export function runBacktest({ cur = [], prev = [], names = {}, days = 30, minDate = null, log = () => { } }) {
  // datas avaliadas: as últimas `days` com jogos; se a temporada atual for curta, usa a anterior
  const curDates = [...new Set(cur.filter(g => g?.r).map(g => g.d))].sort();
  let pool, before, label;
  if (curDates.length >= 20) { pool = cur; before = prev; label = 'atual'; }
  else { pool = prev; before = []; label = 'anterior'; }
  const dates = [...new Set(pool.filter(g => g?.r).map(g => g.d))].sort().filter(d => !minDate || d >= minDate).slice(-days);
  const acc = {}; const add = (key, p, hit) => { const a = acc[key] ||= { n: 0, hit: 0, p: 0, brier: 0, pnl: 0, sxy: 0, sxx: 0 }; a.n++; a.hit += hit; a.p += p; a.brier += (p - hit) ** 2; a.pnl += hit ? PRICE - 1 : -1; a.sxy += (hit - .5) * (p - .5); a.sxx += (p - .5) ** 2; };
  let total = 0;
  for (const D of dates) {
    const todays = pool.filter(g => g?.r && g.d === D);
    const prevDay = new Date(Date.parse(D + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
    const b2b = new Set(pool.filter(g => g.d === prevDay).flatMap(g => [g.h, g.a]));
    const slate = buildSlate({ date: D, season: label, cur: pool.filter(g => g.d < D), prev: before, today: todays.map(g => ({ gid: g.gid, utc: D + 'T23:00:00Z', home: g.h, away: g.a })), b2b, names });
    const actual = new Map(); for (const g of todays) for (const r of g.r) if (r[RI.min] > 0) actual.set(String(r[RI.pid]), asLog(r));
    // DNP é anulada nas casas: só entra quem jogou
    slate.players = slate.players.filter(p => actual.has(p.id));
    for (const pr of buildProps(slate, { calib: false })) {
      const a = actual.get(pr.p.id); if (!a) continue;
      const v = MARKETS[pr.mk].k.reduce((s, k) => s + BASE[k](a), 0);
      const e = evaluate(pr), s = e[e.best];
      if (v === e.line) continue; // devolução
      const hit = (s.side === 'over' ? v > e.line : v < e.line) ? 1 : 0;
      add('mk:' + pr.mk, s.p, hit); add('g:' + s.grade, s.p, hit); add('all', s.p, hit); add('side:' + s.side, s.p, hit);
      const b = BUCKETS.find(([lo, hi]) => s.p >= lo && s.p < hi); if (b) add('b:' + b[0], s.p, hit);
      total++;
    }
    log(`  ${D}: ${total} linhas acumuladas`);
  }
  // fator de calibração k: quanto encolher (k<1) ou esticar (k>1) a distância da chance até 50%.
  // Encolhido para 1 quando a amostra é pequena. O motor aplica como ajuste da dispersão (d ÷ k²).
  const kOf = a => { if (!a?.sxx) return 1; const raw = a.sxy / a.sxx, w = a.n / (a.n + 1500); return +Math.min(1.15, Math.max(.45, 1 + (raw - 1) * w)).toFixed(3); };
  const fin = a => ({ n: a.n, pred: +(a.p / a.n).toFixed(4), real: +(a.hit / a.n).toFixed(4), brier: +(a.brier / a.n).toFixed(4), roi: +(a.pnl / a.n).toFixed(4), k: kOf(a) });
  const pick = pre => Object.fromEntries(Object.entries(acc).filter(([k]) => k.startsWith(pre)).map(([k, v]) => [k.slice(pre.length), fin(v)]));
  const markets = pick('mk:');
  const calib = Object.fromEntries(Object.entries(markets).map(([mk, v]) => [mk, v.k]));
  return { generatedAt: new Date().toISOString(), season: label, from: dates[0] || null, to: dates.at(-1) || null, days: dates.length, price: PRICE, total, all: acc.all ? fin(acc.all) : null, markets, grades: pick('g:'), sides: pick('side:'), buckets: pick('b:'), calib };
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2); const i = args.indexOf('--days'); const days = i >= 0 ? +args[i + 1] : 30;
  const files = existsSync(join(ROOT, 'data', 'history')) ? (await import('node:fs')).readdirSync(join(ROOT, 'data', 'history')).filter(f => f.endsWith('.json')).sort() : [];
  if (files.length < 1) { console.log('Sem histórico em data/history. Rode npm run update primeiro.'); process.exit(0); }
  const H = await Promise.all(files.map(async f => JSON.parse(await readFile(join(ROOT, 'data', 'history', f), 'utf8'))));
  const curH = H.at(-1), prevH = H.length > 1 ? H.at(-2) : { games: {}, names: {} };
  console.log(`Backtest: temporada ${curH.season} (anterior ${prevH.season || '—'}), ${days} dias`);
  const t0 = Date.now();
  const r = runBacktest({ cur: Object.values(curH.games), prev: Object.values(prevH.games), names: { ...prevH.names, ...curH.names }, days, log: console.log });
  await mkdir(join(ROOT, 'public', 'data'), { recursive: true });
  await writeFile(join(ROOT, 'public', 'data', 'backtest.json'), JSON.stringify(r));
  console.log(`Pronto em ${((Date.now() - t0) / 1000).toFixed(0)}s: ${r.total} linhas · acerto ${(r.all?.real * 100).toFixed(1)}% vs previsto ${(r.all?.pred * 100).toFixed(1)}%`);
}
