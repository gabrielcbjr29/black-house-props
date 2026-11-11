// Dados prontos para o bot do Telegram (public/data/bot.json).
// O modelo roda aqui, na coleta; o bot só filtra e formata, então responde rápido.
import { buildProps, evaluate, bestPrice, GRADE_ORDER, bhScore, reasons } from '../public/engine.js';

const POS_PT = { G: 'armadores', F: 'alas', C: 'pivôs' };
const STAT_PT = { pts: 'pontos', reb: 'rebotes', ast: 'assistências', tpm: 'bolas de 3', stl: 'roubos', blk: 'tocos', tov: 'erros', fgm: 'arremessos convertidos', fga: 'arremessos tentados', fta: 'lances livres tentados', ftm: 'lances livres', tpa: 'bolas de 3 tentadas', twom: 'arremessos de 2', twoa: 'arremessos de 2 tentados', oreb: 'rebotes ofensivos', pf: 'faltas' };
// movimento do mercado desde a abertura a favor (+1) ou contra (−1) do lado
const steamOf = (pr, side) => { if (!pr.mkt?.openMu) return 0; const d = (pr.mkt.mu - pr.mkt.openMu) / Math.max(pr.mkt.mu, 1); return Math.abs(d) >= .025 ? Math.sign(side === 'over' ? d : -d) : 0; };

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
    // Nota BH 0–100 (mesma do app), calculada com a odd escolhida acima
    const sv = { ...s, odd, ev };
    const nt = bhScore(pr, { ...e, [s.side]: sv }, s.side, { steam: steamOf(pr, s.side) });
    const rk = pr.rank?.rank ? { r: pr.rank.rank, of: pr.rank.of, ps: POS_PT[pr.p.pos] || '', k: STAT_PT[pr.rank.k] || pr.rank.k } : null;
    const h10 = s.hits?.L10?.[1] ? s.hits.L10[0] / s.hits.L10[1] : 0;
    rows.push({ id: pr.p.id, n: pr.p.name, t: pr.p.team, o: opp, home: pr.p.team === g.home, g: pr.game.id, h: brTime(g.timeUTC), m: pr.mk, s: s.side === 'over' ? 'o' : 'u', l: e.line,
      p: r3(s.p), q: r3(s.pMkt), d: odd, b: book, k: kal ? 1 : 0, e: r3(ev), gr: s.grade, l10: s.hits?.L10 || null, l20: s.hits?.L20 || null,
      ss: s.hits?.CUR?.[1] ? s.hits.CUR : null, hh: s.hits?.H2H?.[1] ? s.hits.H2H : null, dv: rk, pj: r3(e.muF),
      st: pr.p.status, rl: pr.ctx.role || null, nt, sc: nt + h10 / 10, _r: () => reasons(pr, { ...e, [s.side]: sv }, s.side, { max: 3 }) });
  }
  // ordem: Nota BH, desempate pelo acerto nos últimos 10
  rows.sort((a, b) => b.sc - a.sc);
  // "por que sim / por que não": só nas linhas que aparecem nas listas (A/A+ e as 25 melhores de cada mercado), para o arquivo não crescer
  const perMk = {}, keep = [];
  for (const r of rows) {
    perMk[r.m] = (perMk[r.m] || 0) + 1;
    if (GRADE_ORDER[r.gr] >= 3 || perMk[r.m] <= 25) { const R = r._r(); r.wy = R.pro; r.wn = R.con; }
    delete r._r;
    r.sc = Math.round(r.sc * 1000) / 1000;
    // B fraco (nota < 40) fora das 25 melhores do mercado não aparece em nenhuma lista
    if (GRADE_ORDER[r.gr] >= 3 || r.nt >= 40 || perMk[r.m] <= 25) keep.push(r);
  }
  rows.length = 0; rows.push(...keep);
  const injuries = slate.players.filter(p => p.status !== 'ok').map(p => ({ n: p.name, t: p.team, st: p.status, no: p.note || '' }));
  return { v: 2, date: slate.meta.date, gen: slate.meta.generatedAt, demo: !!slate.meta.demo, w, games, injuries, rows };
}
