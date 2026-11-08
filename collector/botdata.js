// Dados prontos para o bot do Telegram (public/data/bot.json).
// O modelo roda aqui, na coleta; o bot só filtra e formata, então responde rápido.
import { buildProps, evaluate, bestPrice, GRADE_ORDER } from '../public/engine.js';

const brTime = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '';
const r3 = x => x == null ? null : Math.round(x * 1000) / 1000;

export function buildBotData(slate, { w = .4 } = {}) {
  const games = slate.games.map(g => ({ id: g.id, a: g.away, h: g.home, t: brTime(g.timeUTC), utc: g.timeUTC, sp: g.spread ?? null, to: g.total ?? null }));
  const gById = Object.fromEntries(slate.games.map(g => [g.id, g]));
  const rows = [];
  for (const pr of buildProps(slate, { calib: true })) {
    if (pr.p.status === 'out' || pr.p.status === 'doubtful') continue;
    const e = evaluate(pr, null, { w });
    const s = e[e.best];
    if (GRADE_ORDER[s.grade] < 2) continue;
    // odd: casa de verdade primeiro; Kalshi só se não houver casa
    let odd = null, book = null, kal = false;
    if (pr.book?.books) {
      const real = Object.fromEntries(Object.entries(pr.book.books).filter(([b]) => b !== 'Kalshi'));
      const bp = bestPrice(real, s.side) || bestPrice(pr.book.books, s.side);
      if (bp) { odd = bp.odd; book = bp.book; kal = bp.book === 'Kalshi'; }
    }
    const ev = odd ? s.p * odd - 1 : null;
    const g = gById[pr.game.id];
    const opp = pr.p.team === g.home ? g.away : g.home;
    // ordem: nota, valor (limitado a 12% para EV exagerado não dominar), chance
    const sc = GRADE_ORDER[s.grade] * 10 + (ev == null ? 0 : Math.max(-.1, Math.min(ev, .12)) * 50) + s.p * 5 + (odd && !kal ? 1 : 0);
    rows.push({ id: pr.p.id, n: pr.p.name, t: pr.p.team, o: opp, home: pr.p.team === g.home, g: pr.game.id, h: brTime(g.timeUTC), m: pr.mk, s: s.side === 'over' ? 'o' : 'u', l: e.line,
      p: r3(s.p), q: r3(s.pMkt), d: odd, b: book, k: kal ? 1 : 0, e: r3(ev), gr: s.grade, l10: s.hits?.L10 || null, l20: s.hits?.L20 || null, pj: r3(e.muF),
      st: pr.p.status, rl: pr.ctx.role || null, sc: r3(sc) });
  }
  rows.sort((a, b) => b.sc - a.sc);
  const injuries = slate.players.filter(p => p.status !== 'ok').map(p => ({ n: p.name, t: p.team, st: p.status, no: p.note || '' }));
  return { v: 1, date: slate.meta.date, gen: slate.meta.generatedAt, demo: !!slate.meta.demo, w, games, injuries, rows };
}
