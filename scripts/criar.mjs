// Método Criar Aposta (pedido de 17/11, só no Canal teste, ao lado do Alavanca): a lógica dos tipsters agressivos que o
// usuário segue (Igux Casebre na NBA: Criar Aposta de UM jogador, 2–3 linhas de pontos/rebotes/assistências "mais de",
// odd ~5–13, stake pequena e fixa), com o nosso preço justo no lugar do olho.
//
// De onde vem o valor: pontos, rebotes e assistências do mesmo jogador andam juntos (minutos, ritmo, papel no jogo). No
// histórico, as três batem juntas ~1,6–1,8× mais que o produto das chances. A 99play quase não desconta isso no Criar
// Aposta: nos dois bilhetes conferidos em 16/11 ela pagou 0,90× (Fears 5,50 contra 6,11 das três separadas) e 0,97×
// (Boozer 4,25 contra 4,37) o produto das odds separadas. Então a odd da casa é estimada em 0,90× o produto (o lado
// conservador) e a entrada sai quando a nossa chance × essa odd dá 10%+ de valor.
//
// Regras (v1, pedido do usuário: priorizar over, sem limite de entradas, "o que tiver valor vamos planilhar"):
//   • só over; linhas da 99play de PTS, REB e AST (as que a casa monta no Criar Aposta); combinações de 2 ou 3 do mesmo
//     jogador; uma entrada por jogador no dia: a de 3 pernas se tiver valor, senão a de 2 com mais valor;
//   • chance conjunta = engine.parlayProb (correlação do próprio jogador no histórico) misturada com quantas vezes a
//     combinação bateu nos últimos 10 (peso 10 contra 15 do modelo), como em 🪜 Escadas;
//   • valor = chance × odd estimada − 1 ≥ 10%; odd estimada 2,5–25;
//   • perna fraca fica de fora: chance da perna < 35%, modelo bem contra o mercado (EV da perna < −10%) ou Kalshi bem
//     contra (EV < −8%, quando a Kalshi cobre a linha);
//   • jogador sem dúvida/fora, 22+ min previstos (jogador de rotação entra: é onde a casa mais erra), leitura da 99play com
//     menos de 2h; sai no canal até 90 min antes do jogo (depois do relatório de lesões e das escalações);
//   • 0,5u; 0,25u com odd estimada 10+. No card: odd estimada, odd justa e a odd mínima para entrar (justa + 5%).
import { buildProps, evaluate, parlayProb } from '../public/engine.js';
import { kalshiAt, norm } from './alavanca.mjs';

export const CRIAR = { mk: ['PTS', 'REB', 'AST'], K: .9, evMin: .10, oddMin: 2.5, oddMax: 25, legP: .35, legEv: -.10, legKalshi: -.08,
  minExp: 22, staleH: 2, w10: 15, un: .5, unAlta: .25, altaOdd: 10, folga: 1.05, slot: 23 };
const r3 = x => Math.round(x * 1000) / 1000, r2 = x => Math.round(x * 100) / 100;
const subsets = a => { const out = []; for (let m = 1; m < 1 << a.length; m++) { const s = a.filter((_, i) => m >> i & 1); if (s.length >= 2) out.push(s); } return out; };

/* todas as Criar Aposta com valor do dia (uma por jogador, a de maior valor), da maior para a menor */
export function criarPool({ slate, kalshi = null, events = {}, now = Date.now(), C = CRIAR }) {
  const by = {};
  for (const pr of buildProps(slate)) if (C.mk.includes(pr.mk) && pr.book?.books?.['99play']?.o) (by[pr.p.id] ??= {})[pr.mk] = pr;
  const K = kalshi?.list?.length && !(kalshi.gen && (now - Date.parse(kalshi.gen)) / 36e5 >= C.staleH)
    ? new Map(kalshi.list.map(k => [norm(k.name) + '|' + k.mk, k])) : null;
  const out = [];
  for (const [pid, P] of Object.entries(by)) {
    const any = Object.values(P)[0], p = any.p, g = any.game;
    if (p.status && p.status !== 'ok') continue;
    if (!g?.timeUTC || Date.parse(g.timeUTC) <= now || (any.ctx?.exp ?? 0) < C.minExp) continue;
    const legs = [];
    for (const [mk, pr] of Object.entries(P)) {
      const b = pr.book.books['99play'], line = pr.book.line;
      if (b.at && (now - Date.parse(b.at)) / 36e5 >= C.staleH) continue;
      let e; try { e = evaluate(pr, { line, oOver: b.o, oUnder: b.u, book: '99play' }, { w: .4 }); } catch { continue; }
      const lp = e.over.p, evm = lp * b.o - 1;
      if (lp < C.legP || evm < C.legEv) continue;
      const kk = K ? kalshiAt(K.get(norm(p.name) + '|' + mk), line, mk) : null, evk = kk ? kk.p * b.o - 1 : null;
      if (evk != null && evk < C.legKalshi) continue;
      legs.push({ pr, mk, line, odd: +b.o, p: lp, edge: evm, pk: kk ? r3(kk.p) : null, evk: evk == null ? null : r3(evk), t9: b.at ?? null, l10: e.over.hits.L10 ?? null });
    }
    let best = null;
    for (const S of subsets(legs)) {
      const pm = parlayProb(S.map(l => ({ pr: l.pr, p: l.p, line: l.line, side: 'over' }))).prob;
      const n10 = Math.min(10, ...S.map(l => l.pr.vals.length));
      let j10 = 0; for (let i = 0; i < n10; i++) if (S.every(l => l.pr.vals[i] > l.line)) j10++;
      const pj = (pm * C.w10 + j10) / (C.w10 + n10), sep = S.reduce((a, l) => a * l.odd, 1), est = sep * C.K, ev = pj * est - 1;
      if (est < C.oddMin || est > C.oddMax || ev < C.evMin) continue;
      // agressivo: entre as que têm valor, a de mais pernas (odd maior); empate → a de mais valor
      if (!best || S.length > best.S.length || (S.length === best.S.length && ev > best.ev)) best = { S, pm, pj, j10: [j10, n10], sep, est, ev };
    }
    if (!best) continue;
    const L = best.S.map(l => ({ key: `${pid}-${l.mk}-o`, pid: String(pid), name: p.name, team: p.team, opp: l.pr.opp, away: g.away, home: g.home, game: g.id,
      ev: events[g.id] ?? null, mk: l.mk, side: 'o', line: l.line, odd: r3(l.odd), p: r3(l.p), edge: r3(l.edge), pk: l.pk, evk: l.evk, met: 'criar',
      tip: g.timeUTC, sq: l.pr.vals?.slice(0, 10) ?? null, t9: l.t9, l10: l.l10 }));
    const fair = 1 / best.pj, odd = r2(best.est);
    out.push({ key: `ca-${pid}-` + L.map(l => l.mk).join('.'), band: `ca-${pid}`, lado: 'o', slot: C.slot, met: 'criar', ca: true,
      un: odd >= C.altaOdd ? C.unAlta : C.un, odd, sep: r2(best.sep), fair: r2(fair), min: r2(fair * C.folga), prob: r3(best.pj), pm: r3(best.pm),
      evc: r3(best.ev), j10: best.j10, mins: Math.round(any.ctx.exp), legs: L });
  }
  return out.sort((a, b) => b.evc - a.evc);
}

/* pauta do Método Criar Aposta: tudo que tem valor, menos os jogadores que já saíram hoje nesse método */
export function criarPlan({ slate, kalshi, events = {}, now = Date.now(), posted = { bands: new Set() }, C = CRIAR }) {
  return criarPool({ slate, kalshi, events, now, C }).filter(x => !posted.bands?.has(x.band));
}
