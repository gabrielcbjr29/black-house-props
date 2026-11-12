// Dados prontos para o bot do Telegram (public/data/bot.json).
// O modelo roda aqui, na coleta; o bot só filtra e formata, então responde rápido.
import { buildProps, evaluate, bestPrice, GRADE_ORDER, bhScore, reasons, inOddRange, L, POSLB } from '../public/engine.js';

const POS_PT = { G: 'armadores', F: 'alas', C: 'pivôs' };
const STAT_PT = { pts: 'pontos', reb: 'rebotes', ast: 'assistências', tpm: 'bolas de 3', stl: 'roubos', blk: 'tocos', tov: 'erros', fgm: 'arremessos convertidos', fga: 'arremessos tentados', fta: 'lances livres tentados', ftm: 'lances livres', tpa: 'bolas de 3 tentadas', twom: 'arremessos de 2', twoa: 'arremessos de 2 tentados', oreb: 'rebotes ofensivos', pf: 'faltas' };
// movimento do mercado desde a abertura a favor (+1) ou contra (−1) do lado
// top 10 do Modelo BH: só jogador de rotação (24+ min) e linhas que as casas costumam abrir
export const TOP_MIN_LINE = { FGA: 7.5, '3PA': 2.5, FTA: 2.5, '2PA': 4.5, '2PM': 2.5, FGM: 3.5, RA: 4.5 };
export const topEligible = (r, g) => r.mb && g.includes(r.m) && r.st !== 'questionable' && r.p <= .85 && (r.mn ?? 0) >= 24 && r.l >= (TOP_MIN_LINE[r.m] ?? 0);
// grupos das listas do bot (mesmos mercados dos comandos)
const CARD_GROUPS = [['PTS'], ['REB'], ['AST'], ['3PM'], ['PRA'], ['PR'], ['PA'], ['RA'], ['FGA', '2PA', '3PA', 'FTA'], ['FGM', '2PM', 'FTM'], ['STL', 'BLK', 'SB', 'TOV'], ['FGA', '3PA', 'FTA', '2PA', '2PM', 'FGM']];
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
      ss: s.hits?.CUR?.[1] ? s.hits.CUR : null, hh: s.hits?.H2H?.[1] ? s.hits.H2H : null, dv: rk, pj: r3(e.muF), mb: pr.model ? 1 : 0, mn: Math.round((pr.ctx.m5 + pr.ctx.m20) / 2),
      st: pr.p.status, rl: pr.ctx.role || null, nt, sc: nt + h10 / 10,
      // L5, sequência atual, vantagem (projeção − linha a favor do lado), temporada passada e "sem o colega"
      l5: s.hits?.L5?.[1] ? s.hits.L5 : null, sk: s.streak || 0, ed: Math.round(s.gap * 10) / 10, tp: s.hits?.PS?.[1] ? s.hits.PS : null,
      wo: pr.ctx.wo && s.hits?.WO?.[1] >= 2 ? { q: pr.ctx.wo.q.name, h: s.hits.WO, a: Math.round(pr.woVals.reduce((a, x) => a + x, 0) / pr.woVals.length * 10) / 10, x: pr.ctx.wo.active ? 1 : 0 } : null, _r: () => reasons(pr, { ...e, [s.side]: sv }, s.side, { max: 3 }),
      _v: () => ({ ps: POSLB[pr.p.pos] || '', v10: pr.vals.slice(0, 10).map((v, i) => [v, pr.ctx.logs[i][L.opp]]) }) });
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
  // cards em imagem (o publicar renderiza): as entradas que as listas do bot mostram por padrão
  const key = r => `${r.id}-${r.m}-${r.s}`, sel = new Set();
  const inR = r => inOddRange(r.d ?? (r.p > 0 ? 1 / r.p : 99));
  const take = (arr, n, one = true) => { const seen = new Set(); let k = 0; for (const r of arr) { if (one && seen.has(r.id)) continue; seen.add(r.id); sel.add(key(r)); if (++k >= n) break; } };
  const R = rows.filter(inR);
  take(R, 20);
  for (const g of CARD_GROUPS) take(R.filter(r => g.includes(r.m)), 10, g.length === 1);
  take(R.filter(r => r.p >= .65 && GRADE_ORDER[r.gr] >= 3).sort((a, b) => b.p - a.p), 10);
  // top 10 do Modelo BH (sem faixa de odd: são linhas de referência, sem odd de casa)
  for (const g of [['FGA', '3PA', 'FTA', '2PA', '2PM', 'FGM'], ['RA']]) take(rows.filter(r => topEligible(r, g)).sort((a, b) => b.sc - a.sc), 10);
  for (const g of games) take(R.filter(r => r.g === g.id), 8);
  for (const r of rows) { if (sel.has(key(r))) Object.assign(r, { cd: 1 }, r._v()); delete r._v; }
  const injuries = slate.players.filter(p => p.status !== 'ok').map(p => ({ n: p.name, t: p.team, st: p.status, no: p.note || '' }));
  // Modelo BH por jogador (para o /modelo do bot): média e dispersão de cada estatística + últimos 10 jogos e média na temporada
  const mdl = {};
  if (slate.model?.players && slate.model.date === slate.meta.date) {
    const gameOf = {}; for (const g of slate.games) { gameOf[g.home] = g; gameOf[g.away] = g; }
    const ST = { pts: x => x[L.pts], reb: x => x[L.reb], ast: x => x[L.ast], fgm: x => x[L.fgm], fga: x => x[L.fga], tpm: x => x[L.tpm], tpa: x => x[L.tpa], ftm: x => x[L.ftm], fta: x => x[L.fta], twoa: x => x[L.fga] - x[L.tpa], twom: x => x[L.fgm] - x[L.tpm], stl: x => x[L.stl], blk: x => x[L.blk], tov: x => x[L.tov] };
    for (const p of slate.players) {
      const M = slate.model.players[p.id], g = gameOf[p.team]; if (!M || !g || p.status === 'out') continue;
      const logs = p.logs || [], cur = logs.filter(x => x[L.cur]);
      const st = {};
      for (const k in M) { if (!ST[k]) continue; const v = logs.slice(0, 10).map(ST[k]); st[k] = [M[k][0], M[k][1], v, cur.length ? r3(cur.reduce((a, x) => a + ST[k](x), 0) / cur.length) : null]; }
      mdl[p.id] = { n: p.name, t: p.team, o: g.home === p.team ? g.away : g.home, home: g.home === p.team, h: brTime(g.timeUTC), g: g.id, st: p.status, gp: cur.length, s: st,
        h2h: logs.filter(x => x[L.opp] === (g.home === p.team ? g.away : g.home)).slice(0, 10).map(x => Object.fromEntries(Object.keys(ST).map(k => [k, ST[k](x)]))) };
    }
  }
  return { v: 3, date: slate.meta.date, gen: slate.meta.generatedAt, demo: !!slate.meta.demo, w, games, injuries, rows, mdl };
}
