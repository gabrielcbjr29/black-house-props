/* Garrafão Props — registro de tips do tipster: liquidação automática, desempenho e exportação.
   Funções puras (usadas no app e nos testes). Sem dependências. */
import { MARKETS } from './engine.js';

// linha de results.json: [min, pts, reb, ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta]
const RX = { min: 0, pts: 1, reb: 2, ast: 3, stl: 4, blk: 5, tov: 6, pf: 7, fgm: 8, fga: 9, tpm: 10, tpa: 11, ftm: 12, fta: 13 };
const stat = (k, r) => k === 'twom' ? r[8] - r[10] : k === 'twoa' ? r[9] - r[11] : r[RX[k]];
export const statValue = (mk, row) => MARKETS[mk].k.reduce((a, k) => a + stat(k, row), 0);

export function newTip({ legs, odd, units, book, note = '', date, unitValue = null }) {
  const ts = new Date().toISOString();
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts, upd: ts, date, kind: legs.length > 1 ? 'multi' : 'single', book: book || '', odd: +odd, units: +units, unitValue, note, legs, status: 'pending', profit: null };
}

/* Liquida uma perna com os resultados. Jogador sem estatística num dia em que o time dele jogou
   (DNP) = devolvida, como nas casas. Dia ainda sem resultado = pendente. */
export function settleLeg(leg, R, date) {
  if (!R?.stats) return { status: 'pending' };
  const day = R.stats[date];
  if (!day) return { status: 'pending' };
  const row = day[leg.pid];
  if (!row || !row[0]) {
    const played = (R.games?.[date] || []).some(g => g[1] === leg.team || g[2] === leg.team);
    return played ? { status: 'void', why: 'não jogou' } : { status: 'pending' };
  }
  const v = statValue(leg.mk, row);
  if (v === leg.line) return { status: 'void', value: v, why: 'devolução' };
  const win = leg.side === 'over' ? v > leg.line : v < leg.line;
  return { status: win ? 'green' : 'red', value: v };
}
/* Liquida a tip inteira (simples ou múltipla). Múltipla: perna vermelha derruba; pernas
   devolvidas saem da conta (odd recalculada só com as pernas válidas). */
export function settleTip(tip, R) {
  if (tip.manual) return tip;
  const res = tip.legs.map(l => ({ ...l, ...settleLeg(l, R, l.date || tip.date) }));
  tip.legs = res;
  const st = res.map(l => l.status);
  let status = 'pending', odd = tip.odd;
  if (st.includes('red')) status = 'red';
  else if (st.every(s => s === 'void')) status = 'void';
  else if (st.every(s => s === 'green' || s === 'void')) {
    status = 'green';
    if (tip.kind === 'multi' && st.includes('void')) { const legOdds = res.filter(l => l.status === 'green').map(l => l.odd); if (legOdds.every(Boolean)) odd = legOdds.reduce((a, b) => a * b, 1); }
  }
  tip.status = status; tip.effOdd = status === 'green' ? odd : null;
  tip.profit = profitOf(tip);
  if (status !== 'pending' && !tip.settledAt) tip.settledAt = new Date().toISOString();
  return tip;
}
export function profitOf(t) {
  if (t.status === 'green') return +(t.units * ((t.effOdd || t.odd) - 1)).toFixed(4);
  if (t.status === 'red') return -t.units;
  if (t.status === 'void') return 0;
  if (t.status === 'halfgreen') return +(t.units / 2 * (t.odd - 1)).toFixed(4);
  if (t.status === 'halfred') return -t.units / 2;
  return null;
}
// CLV: quanto a odd pega bate o preço justo de fechamento (sem margem). Positivo = pegou valor.
export const clvOf = t => t.close?.p && t.odd ? t.odd * t.close.p - 1 : null;

const pBand = p => p == null ? '—' : p < .55 ? 'até 54%' : p < .6 ? '55–59%' : p < .65 ? '60–64%' : p < .7 ? '65–69%' : '70%+';
const oddBand = o => o < 1.6 ? 'até 1,59' : o < 1.9 ? '1,60–1,89' : o < 2.2 ? '1,90–2,19' : '2,20+';
export function summarize(tips, { from = null, kind = 'all' } = {}) {
  const list = tips.filter(t => (!from || t.date >= from) && (kind === 'all' || t.kind === kind));
  const done = list.filter(t => t.status !== 'pending');
  const agg = () => ({ n: 0, green: 0, red: 0, void: 0, staked: 0, profit: 0, odd: 0, p: 0, np: 0 });
  const push = (a, t) => {
    a.n++; if (t.status === 'green' || t.status === 'halfgreen') a.green++; else if (t.status === 'red' || t.status === 'halfred') a.red++; else a.void++;
    if (t.status !== 'void') { a.staked += t.units; a.odd += t.odd; }
    a.profit += t.profit || 0;
    const p = t.kind === 'single' ? t.legs[0]?.p : t.pCombo; if (p && t.status !== 'void') { a.p += p; a.np++; }
  };
  const fin = a => ({ ...a, hit: a.green + a.red ? a.green / (a.green + a.red) : null, roi: a.staked ? a.profit / a.staked : null, avgOdd: a.n - a.void ? a.odd / (a.n - a.void) : null, pred: a.np ? a.p / a.np : null });
  const all = agg(), by = { market: {}, grade: {}, band: {}, pband: {}, side: {}, book: {} };
  for (const t of done) {
    push(all, t);
    const l = t.legs[0];
    const keys = { market: t.kind === 'multi' ? 'Múltipla' : MARKETS[l.mk]?.lb || l.mk, grade: t.kind === 'multi' ? 'Múltipla' : l.grade || '—', band: oddBand(t.odd), pband: t.kind === 'multi' ? 'Múltipla' : pBand(l.p), side: t.kind === 'multi' ? 'Múltipla' : l.side === 'over' ? 'Mais de' : 'Menos de', book: t.book || '—' };
    for (const k in keys) push(by[k][keys[k]] ||= agg(), t);
  }
  const clvs = done.concat(list.filter(t => t.status === 'pending')).map(clvOf).filter(x => x != null);
  // curva da banca em unidades, na ordem das datas
  let acc = 0; const curve0 = done.slice().sort((a, b) => (a.date + a.ts).localeCompare(b.date + b.ts)).map(t => ({ date: t.date, u: (acc += t.profit || 0) }));
  const curve = curve0.length ? [{ date: curve0[0].date, u: 0 }, ...curve0] : [];
  // maior sequência negativa (drawdown) em unidades
  let peak = 0, dd = 0; for (const c of curve) { peak = Math.max(peak, c.u); dd = Math.min(dd, c.u - peak); }
  return {
    ...fin(all), pending: list.filter(t => t.status === 'pending').length, pendingUnits: list.filter(t => t.status === 'pending').reduce((a, t) => a + t.units, 0),
    clv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null, beatClose: clvs.length ? clvs.filter(x => x > 0).length / clvs.length : null, nClv: clvs.length,
    curve, drawdown: dd, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([kk, a]) => [kk, fin(a)]).sort((x, y) => y[1].n - x[1].n))]))
  };
}

// texto que começa com = + - @ vira fórmula no Excel: prefixa com ' (números negativos ficam como estão)
const csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s) && isNaN(+s.replace(',', '.'))) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCSV(tips) {
  const head = ['data', 'tipo', 'jogador', 'time', 'adversario', 'mercado', 'lado', 'linha', 'casa', 'odd', 'stake_u', 'status', 'lucro_u', 'resultado', 'chance_modelo', 'chance_final', 'ev', 'nota', 'odd_fechamento', 'clv', 'obs'];
  const rows = [head.join(';')];
  for (const t of tips) {
    const l = t.legs[0], multi = t.kind === 'multi';
    const f = x => x == null ? '' : String(+x.toFixed(4)).replace('.', ',');
    rows.push([t.date, multi ? 'multipla' : 'simples', multi ? t.legs.map(x => x.name).join(' + ') : l.name, multi ? '' : l.team, multi ? '' : l.opp,
      multi ? t.legs.map(x => x.mk).join('+') : l.mk, multi ? '' : l.side === 'over' ? 'mais' : 'menos', multi ? '' : f(l.line), t.book, f(t.odd), f(t.units), t.status, f(t.profit),
      multi ? t.legs.map(x => x.value ?? '').join('/') : l.value ?? '', multi ? '' : f(l.pModel), f(multi ? t.pCombo : l.p), multi ? '' : f(l.ev), multi ? '' : l.grade, f(t.close?.odd), f(clvOf(t)), t.note].map(csvCell).join(';'));
  }
  return '﻿' + rows.join('\n');
}
