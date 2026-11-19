// Combo Finta × 99play (pedido de 19/11): para cada jogador com escada de rebotes/assistências na Finta, as pernas que o
// /combo do bot monta (Ast + Reb, Ast/Reb + duplo-duplo, Ast + Reb + triplo-duplo) e os últimos 20 jogos dele, compactos,
// para o bot contar quantas vezes cada combinação bateu. A escada da 99play (marcos) entra no bot na hora, direto da
// última foto do leitor (public/ladder99.js); aqui vai só a linha principal da 99play, como reserva.
import { L } from '../public/engine.js';
import { normName, COMBO_K, COMBO_MIN } from '../public/ladder99.js';
export { combosOf } from '../public/ladder99.js';
const isDD = g => [g[L.pts], g[L.reb], g[L.ast], g[L.stl], g[L.blk]].filter(x => x >= 10).length >= 2;
const isTD = g => [g[L.pts], g[L.reb], g[L.ast], g[L.stl], g[L.blk]].filter(x => x >= 10).length >= 3;
const brTime = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '';

export function buildCombo(slate, finta) {
  if (!finta?.lines?.length) return null;
  const gameOf = {}; for (const g of slate.games ?? []) { gameOf[g.home] = g; gameOf[g.away] = g; }
  const by = new Map(); for (const l of finta.lines) { if (!['REB', 'AST', 'DD', 'TD'].includes(l.mk)) continue; (by.get(l.pid) ?? by.set(l.pid, []).get(l.pid)).push(l); }
  const main99 = {}; for (const l of slate.lines ?? []) { const b = l.books?.['99play']; if (b?.o && ['REB', 'AST'].includes(l.mk)) main99[`${l.pid}|${l.mk}`] = [l.line, +b.o]; }
  const players = [];
  for (const p of slate.players ?? []) {
    const F = by.get(String(p.id)); if (!F || !F.some(l => l.mk === 'REB' || l.mk === 'AST')) continue;
    if (p.status === 'out') continue;
    const g = gameOf[p.team]; if (!g) continue;
    const legs = { REB: [], AST: [] };
    for (const l of F) {
      if (l.mk === 'DD' || l.mk === 'TD') { legs[l.mk] = +l.o; continue; }
      const m = main99[`${p.id}|${l.mk}`];
      legs[l.mk].push([+l.line, +l.o, m && m[0] === +l.line ? m[1] : null]);
    }
    for (const k of ['REB', 'AST']) legs[k].sort((a, b) => a[0] - b[0]);
    const last = (p.logs ?? []).filter(x => x[L.min] > 0).slice(0, 20).map(x => [x[L.reb], x[L.ast], isDD(x) ? 1 : 0, isTD(x) ? 1 : 0]);
    players.push({ id: String(p.id), n: p.name, k: normName(p.name), t: p.team, o: g.home === p.team ? g.away : g.home, home: g.home === p.team,
      h: brTime(g.timeUTC), utc: g.timeUTC, st: p.status ?? 'ok', legs, last, m99: Object.fromEntries(['REB', 'AST'].map(k => [k, main99[`${p.id}|${k}`] ?? null])) });
  }
  return { date: slate.meta?.date, gen: new Date().toISOString(), fg: finta.gen ?? null, K: COMBO_K, min: COMBO_MIN, players };
}

