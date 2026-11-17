// Método Alavanca (pedido de 17/11, só no Canal teste): entrada só quando a odd da 99play paga MAIS que o preço justo da
// Kalshi (bolsa regulada dos EUA, sem margem de casa) na mesma linha, e alavancagem combinando essas pernas em duplas e
// triplas (o valor de pernas independentes se multiplica: duas de +5% dão ~+10% na dupla).
//
// Por quê: a 99play cobra ~8–10% de margem nos props (ex.: 1,87/1,77). Contra essa margem, o backtest de 13–16/11 mostrou
// que nenhum critério de sequência/matchup/modelo ganha na odd de fechamento. A única vantagem com base de mercado é a
// diferença entre a casa "lenta" (99play) e um preço afiado (Kalshi). São poucas por dia (~2–4% dos lados), então o
// método é seletivo nas simples e agressivo nas combinadas.
//
// Regras (v1):
//   • mercados PTS, REB, AST e 3PM (os que a Kalshi tem em escada: 10+, 15+, 20+...); linha da 99play = degrau − 0,5
//     exato, ou interpolado (logit) entre degraus vizinhos até 5,5 pts (PTS) / 2,5 (demais); spread ≤ 5 centavos nos
//     degraus usados e algum volume negociado;
//   • valor contra a Kalshi (EV_k = chance Kalshi × odd − 1): simples com 4%+; odd 1,50–3,50; sem desfalque/dúvida,
//     20+ min previstos, leitura da 99play e preço da Kalshi com menos de 2h;
//   • o Modelo BH é trava, não gatilho: fica de fora se o modelo der EV abaixo de −5% (discorda forte);
//   • simples: até 8 por dia, uma por jogador, ordem por EV_k (+ metade do EV do modelo, + bônus de sequência);
//     1u; 1,5u se EV_k ≥ 8% e o modelo concorda (EV ≥ 0);
//   • duplas (até 2, odd 2,8–5,0, valor combinado ≥ 6%) e tripla (1; 2 em dia de 8+ jogos; odd 4,5–12, valor ≥ 10%):
//     pernas com EV_k ≥ 2% e modelo não contra (EV ≥ −3%), jogos diferentes; 0,5u cada.
import { buildProps, evaluate } from '../public/engine.js';

export const ALV = {
  mk: ['PTS', 'REB', 'AST', '3PM'], oddMin: 1.5, oddMax: 3.5, evMin: .04, evLeg: .02, evStrong: .08, modelVeto: -.05, modelLeg: -.03,
  gap: { PTS: 5.5, REB: 2.5, AST: 2.5, '3PM': 2.5 }, spread: .05, minExp: 20, staleH: 2, maxS: 8,
  dupla: { n: 2, lo: 2.8, hi: 5, ev: .06, un: .5, max: 2 }, tripla: { n: 3, lo: 4.5, hi: 12, ev: .10, un: .5, max: 1 },
};
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const lg = p => Math.log(p / (1 - p)), ex = z => 1 / (1 + Math.exp(-z));
const r3 = x => Math.round(x * 1000) / 1000;

/* chance do OVER na linha L pela escada da Kalshi { lines: {linha: p}, q: {linha: {s, v}} } → { p, how } ou null */
export function kalshiAt(k, L, mk = 'PTS', A = ALV) {
  if (!k?.lines) return null;
  const ok = t => { const q = k.q?.[t]; return !q || q.s <= A.spread; };
  const vol = t => k.q?.[t]?.v ?? 1;
  if (k.lines[L] != null) return ok(L) && vol(L) > 0 ? { p: k.lines[L], how: 'exata' } : null;
  const ks = Object.keys(k.lines).map(Number).sort((a, b) => a - b), lo = ks.filter(t => t < L).pop(), hi = ks.find(t => t > L);
  if (lo == null || hi == null || hi - lo > (A.gap[mk] ?? 2.5) * 2 || L - lo > (A.gap[mk] ?? 2.5) || hi - L > (A.gap[mk] ?? 2.5)) return null;
  if (!ok(lo) || !ok(hi) || !(vol(lo) > 0 || vol(hi) > 0)) return null;
  const pl = Math.min(.995, Math.max(.005, k.lines[lo])), ph = Math.min(.995, Math.max(.005, k.lines[hi]));
  return { p: ex(lg(pl) + (L - lo) / (hi - lo) * (lg(ph) - lg(pl))), how: 'interp' };
}

/* pernas candidatas: cada linha da 99play coberta pela Kalshi, os dois lados, com valor contra a Kalshi e a opinião do modelo */
export function alavancaPool({ slate, kalshi, events = {}, now = Date.now(), A = ALV }) {
  if (!kalshi?.list?.length || (kalshi.gen && (now - Date.parse(kalshi.gen)) / 36e5 >= A.staleH)) return [];
  const K = new Map(kalshi.list.map(k => [norm(k.name) + '|' + k.mk, k]));
  const out = [];
  for (const pr of buildProps(slate)) {
    if (!A.mk.includes(pr.mk)) continue;
    const g = pr.game, b = pr.book?.books?.['99play'];
    if (!g?.timeUTC || Date.parse(g.timeUTC) <= now || !b?.o || !b?.u) continue;
    if (b.at && (now - Date.parse(b.at)) / 36e5 >= A.staleH) continue;
    if (pr.p.status && pr.p.status !== 'ok') continue;
    if ((pr.ctx?.exp ?? 0) < A.minExp) continue;
    const k = K.get(norm(pr.p.name) + '|' + pr.mk); if (!k) continue;
    const line = pr.book.line, kk = kalshiAt(k, line, pr.mk, A); if (!kk) continue;
    let e; try { e = evaluate(pr, { line, oOver: b.o, oUnder: b.u, book: '99play' }, { w: .4 }); } catch { continue; }
    for (const [side, odd, pk] of [['o', b.o, kk.p], ['u', b.u, 1 - kk.p]]) {
      if (odd < A.oddMin || odd > A.oddMax) continue;
      const E = e[side === 'o' ? 'over' : 'under'], evk = pk * odd - 1, evm = E.p * odd - 1;
      if (evk < A.evLeg || evm < A.modelVeto) continue;
      const h10 = E.hits.L10?.[1] >= 8 ? E.hits.L10[0] / E.hits.L10[1] : null;
      out.push({ key: `a-${pr.p.id}-${pr.mk}-${side}`, pid: String(pr.p.id), name: pr.p.name, team: pr.p.team, opp: pr.opp, away: g.away, home: g.home, game: g.id,
        ev: events[g.id] ?? null, mk: pr.mk, side, line, odd: +odd, p: r3(E.p), edge: r3(evm), pk: r3(pk), evk: r3(evk), how: kk.how, met: 'alavanca',
        tip: g.timeUTC, sq: pr.vals?.slice(0, 10) ?? null, t9: b.at ?? null, l10: E.hits.L10 ?? null,
        score: evk + .5 * Math.max(0, evm) + (h10 != null && h10 >= .7 ? .02 : 0) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/* combinações (jogos diferentes, sem repetir jogador) na faixa de odd, a de maior valor combinado */
function bestCombo(pool, spec, avoid = new Set(), maxShared = 0) {
  let best = null;
  const rec = (i, legs, odd, v, games) => {
    if (odd > spec.hi) return;
    if (legs.length === spec.n) {
      const shared = legs.filter(l => avoid.has(l.key)).length;
      if (odd >= spec.lo && shared <= maxShared && v - 1 >= spec.ev && (!best || v > best.v)) best = { legs: [...legs], odd, v };
      return;
    }
    for (let j = i; j < pool.length; j++) {
      const x = pool[j]; if (games.has(x.game) || legs.some(l => l.pid === x.pid)) continue;
      games.add(x.game); legs.push(x); rec(j + 1, legs, odd * x.odd, v * (1 + x.evk), games); legs.pop(); games.delete(x.game);
    }
  };
  rec(0, [], 1, 1, new Set());
  return best;
}

/* pauta do dia do Método Alavanca. posted = chaves já postadas hoje no canal (simples e faixas de múltipla). */
export function alavancaPlan({ slate, kalshi, events = {}, now = Date.now(), posted = { keys: new Set(), pids: new Set(), bands: new Set() }, A = ALV }) {
  const pool = alavancaPool({ slate, kalshi, events, now, A });
  const singles = [], seen = new Set(posted.pids);
  for (const x of pool) {
    if (singles.length >= A.maxS) break;
    if (x.evk < A.evMin || seen.has(x.pid) || posted.keys.has(x.key)) continue;
    seen.add(x.pid); singles.push({ ...x, un: x.evk >= A.evStrong && x.edge >= 0 ? 1.5 : 1 });
  }
  const legs = pool.filter(x => x.edge >= A.modelLeg).sort((a, b) => b.evk - a.evk).slice(0, 14);
  const multis = [], used = new Set();
  const games = new Set((slate?.games ?? []).map(g => g.id)).size;
  const add = (spec, name, i, slot, maxShared) => {
    const band = `${name}-${i}`; if (posted.bands.has(band)) return;
    const c = bestCombo(legs, spec, used, maxShared); if (!c) return;
    c.legs.forEach(l => used.add(l.key));
    const L = c.legs.slice().sort((a, b) => Date.parse(a.tip) - Date.parse(b.tip));
    multis.push({ key: `ma-${band}-` + L.map(l => `${l.pid}-${l.mk}-${l.side}`).join('.'), band, lado: 'm', slot, met: 'alavanca', un: spec.un,
      odd: Math.round(c.odd * 100) / 100, prob: r3(L.reduce((a, l) => a * l.pk, 1)), evk: r3(c.v - 1), legs: L });
  };
  for (let i = 1; i <= A.dupla.max; i++) add(A.dupla, 'dupla', i, 15 + i, 0);
  for (let i = 1; i <= (games >= 8 ? 2 : A.tripla.max); i++) add(A.tripla, 'tripla', i, 18 + i - 1, 1);
  return { singles, multis, pool: pool.length };
}
