// Leitura do mercado (21/11, ideias do MC Analytics que melhoram a decisão):
//  1) Movimento de linha: a primeira leitura do dia de cada linha da 99play e da Finta fica guardada
//     (data/abertura.json) e cada linha do bot ganha "abriu X @odd → agora Y @odd" quando mudou.
//  2) Props correlacionadas: para cada time do dia, os jogos do histórico com os números de cada jogador do elenco
//     atual (public/data/correl/<TIME>.json) e as linhas de hoje; o bot calcula, na hora, como os companheiros foram
//     nos jogos em que um jogador bateu um patamar (/correl).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const H_IDX = { min: 4, PTS: 5, REB: 6, AST: 8, '3PM': 15 }; // linha do boxscore no histórico (data/history)
export const CORREL_MK = ['PTS', 'REB', 'AST', 'PRA', '3PM'];

/* abre/atualiza a abertura do dia e marca o movimento nas linhas do bot (rows) e nos overs da Finta */
export function aberturaDoDia(path, slate, finta, now = new Date().toISOString()) {
  let A = null; try { A = JSON.parse(readFileSync(path, 'utf8')); } catch { }
  if (!A || A.date !== slate.meta?.date) A = { date: slate.meta?.date, l99: {}, fin: {} };
  for (const l of slate.lines ?? []) {
    const b = l.books?.['99play']; if (!(b?.o > 1 || b?.u > 1)) continue;
    const k = `${l.pid}|${l.mk}`; if (!A.l99[k]) A.l99[k] = [+l.line, b.o ? +b.o : null, b.u ? +b.u : null, b.at ?? now];
  }
  if (finta?.date === slate.meta?.date) for (const l of finta.lines ?? []) {
    const k = `${l.pid}|${l.mk}|${+l.line}`; if (!A.fin[k] && +l.o > 1) A.fin[k] = [+l.o, finta.gen ?? now];
  }
  writeFileSync(path, JSON.stringify(A));
  return A;
}
/* rows do bot.json: mv = [linha, odd do lado, hora] da abertura na 99play quando mudou; fmv = odd de abertura da Finta
   no mesmo over quando mudou */
export function marcaMovimento(rows, A) {
  let n = 0;
  for (const r of rows ?? []) {
    const a = A?.l99?.[`${r.id}|${r.m}`];
    if (a && r.b === '99play' && r.d) {
      const o0 = r.s === 'o' ? a[1] : a[2];
      if (o0 && (+a[0] !== +r.l || Math.abs(o0 - r.d) >= .01)) { r.mv = [a[0], o0, a[3]]; n++; }
    }
    if (r.s === 'o' && r.fo) { const f = A?.fin?.[`${r.id}|${r.m}|${+r.l}`]; if (f && Math.abs(f[0] - r.fo) >= .01) r.fmv = f[0]; }
  }
  return n;
}

/* arquivos do /correl: um por time do dia */
export function buildCorrel(slate, finta, histPaths, outDir) {
  const hist = histPaths.flatMap(p => { try { return Object.values(JSON.parse(readFileSync(p, 'utf8')).games ?? {}); } catch { return []; } }).filter(g => g.hs != null);
  const fin = {}; if (finta?.date === slate.meta?.date) for (const l of finta.lines ?? []) if (!l.alt) fin[`${l.pid}|${l.mk}`] = [+l.line, +l.o];
  const lines = {}; for (const l of slate.lines ?? []) { const b = l.books?.['99play']; if (b && CORREL_MK.includes(l.mk)) lines[`${l.pid}|${l.mk}`] = [+l.line, b.o ? +b.o : null, b.u ? +b.u : null]; }
  const teams = new Set((slate.games ?? []).flatMap(g => [g.home, g.away]));
  mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const t of teams) {
    const roster = (slate.players ?? []).filter(p => p.team === t);
    const ids = new Set(roster.map(p => String(p.id)));
    const games = [];
    for (const g of hist) {
      const rows = (g.r ?? []).filter(r => r[1] === t && ids.has(String(r[0])) && r[H_IDX.min] > 0);
      if (rows.length < 2) continue;
      games.push([g.d ?? '', Object.fromEntries(rows.map(r => [String(r[0]), [Math.round(r[H_IDX.min]), r[H_IDX.PTS], r[H_IDX.REB], r[H_IDX.AST], r[H_IDX['3PM']]]]))]);
    }
    games.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const players = Object.fromEntries(roster.map(p => [String(p.id), { n: p.name, st: p.status ?? 'ok',
      lines: Object.fromEntries(CORREL_MK.map(mk => { const l = lines[`${p.id}|${mk}`], f = fin[`${p.id}|${mk}`]; return [mk, l || f ? { l: l?.[0] ?? f[0], o: l?.[1] ?? null, u: l?.[2] ?? null, fo: f && (!l || f[0] === l[0]) ? f[1] : null } : null]; }).filter(x => x[1])) }]));
    writeFileSync(`${outDir}/${t}.json`, JSON.stringify({ team: t, date: slate.meta?.date, gen: new Date().toISOString(), games: games.slice(0, 120), players }));
    n++;
  }
  return n;
}

export { correlOf } from '../public/correl.js';
