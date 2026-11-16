// Escadas (pedido de 16/11): pontos + rebotes + assistências "mais de" do MESMO jogador, como no Criar Aposta da 99play/BR365.
// Para cada jogador com as três linhas da 99play hoje:
//   • chance de cada linha (Modelo BH misturado com o mercado, como no resto do bot);
//   • chance das TRÊS juntas com a correlação real do jogador (engine.parlayProb: nos jogos do histórico, quantas vezes as
//     três bateram juntas ÷ o produto das chances individuais, encolhido pelo tamanho da amostra) — pontos, rebotes e
//     assistências andam juntos (minutos, ritmo), então a chance conjunta é maior que o simples produto;
//   • odd justa = 1 / chance conjunta. Se o Criar Aposta da casa pagar acima disso, tem valor;
//   • quantas vezes as três bateram juntas nos últimos 10 jogos (entra na chance final: peso 10 contra 15 do modelo).
// Também monta duplas e triplas de escadas (jogos diferentes, chances multiplicadas).
// Grava public/data/escadas.json; o bot mostra em 🪜 Escadas.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProps, evaluate, parlayProb } from '../public/engine.js';

export const ESC_MK = ['PTS', 'REB', 'AST'];
const STALE_H = 2, r3 = x => Math.round(x * 1000) / 1000;

export function escadas(slate, { now = Date.now(), w = .4 } = {}) {
  const props = buildProps(slate), by = {};
  for (const pr of props) if (ESC_MK.includes(pr.mk)) (by[pr.p.id] ??= {})[pr.mk] = pr;
  const out = [];
  for (const [pid, P] of Object.entries(by)) {
    if (!ESC_MK.every(m => P[m]?.book?.books?.['99play']?.o)) continue;
    const any = P.PTS, p = any.p, g = any.game;
    if (p.status && p.status !== 'ok') continue;                           // dúvida/fora: escada é tudo ou nada
    if (!g?.timeUTC || Date.parse(g.timeUTC) <= now) continue;
    if ((any.ctx.exp ?? 0) < 26) continue;                                   // precisa de minutos para bater as três
    const at = any.book.books['99play'].at; if (at && (now - Date.parse(at)) / 36e5 >= STALE_H) continue;
    const legs = ESC_MK.map(m => {
      const pr = P[m], b = pr.book.books['99play'], line = pr.book.line;
      const e = evaluate(pr, { line, oOver: b.o, oUnder: b.u, book: '99play' }, { w });
      // projeção usada na chance (Modelo BH misturado com o mercado) e a defesa do adversário nessa estatística (30ª = cede mais)
      return { mk: m, line, odd: b.o, p: e.over.p, pr, side: 'over', l10: e.over.hits.L10, sq: pr.vals.slice(0, 10), proj: Math.round(e.muF * 10) / 10, dv: pr.rank?.rank ? [pr.rank.rank, pr.rank.of] : null };
    });
    const pm = parlayProb(legs.map(l => ({ pr: l.pr, p: l.p, line: l.line, side: 'over' }))).prob;
    const n10 = Math.min(10, ...legs.map(l => l.pr.vals.length));
    let j10 = 0; for (let i = 0; i < n10; i++) if (legs.every(l => l.pr.vals[i] > l.line)) j10++;
    // forma recente: mistura com as três juntas nos últimos 10 (peso de 10 jogos contra 15 "jogos" do modelo)
    const pj = (pm * 15 + j10) / (15 + n10);
    out.push({
      pid, name: p.name, team: p.team, opp: any.opp, game: g.id, home: g.home, away: g.away, tip: g.timeUTC, num: p.num ?? null,
      legs: legs.map(l => ({ mk: l.mk, line: l.line, odd: r3(l.odd), p: r3(l.p), l10: l.l10, sq: l.sq, proj: l.proj, dv: l.dv })), isHome: g.home === p.team,
      pj: r3(pj), pm: r3(pm), fair: r3(1 / pj), sep: r3(legs.reduce((a, l) => a * l.odd, 1)), ind: r3(legs.reduce((a, l) => a * l.p, 1)), j10: [j10, n10], min: Math.round(any.ctx.exp),
    });
  }
  out.sort((a, b) => b.pj - a.pj || b.j10[0] - a.j10[0]);
  return out;
}
/* combinações de escadas de jogos diferentes (k = 2 duplas, 3 triplas): as de maior chance, sem repetir jogador entre elas */
export function combos(list, k, n = 3, pool = 12) {
  const top = list.slice(0, pool), res = [];
  const rec = (i, cur) => {
    if (cur.length === k) { res.push(cur.slice()); return; }
    for (let j = i; j < top.length; j++) { if (cur.some(x => x.game === top[j].game)) continue; cur.push(top[j]); rec(j + 1, cur); cur.pop(); }
  };
  rec(0, []);
  const scored = res.map(c => ({ items: c, p: c.reduce((a, x) => a * x.pj, 1) })).sort((a, b) => b.p - a.p);
  const used = new Set(), out = [];
  for (const c of scored) {
    if (c.items.some(x => used.has(x.pid))) continue;
    c.items.forEach(x => used.add(x.pid));
    out.push({ pids: c.items.map(x => x.pid), p: r3(c.p), fair: r3(1 / c.p), sep: r3(c.items.reduce((a, x) => a * x.sep, 1)) });
    if (out.length >= n) break;
  }
  return out;
}

async function main() {
  const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  const slate = JSON.parse(readFileSync(join(ROOT, 'data', 'slate.json'), 'utf8'));
  const list = escadas(slate);
  const out = { date: slate.meta?.date, gen: new Date().toISOString(), list: list.slice(0, 30), duplas: combos(list, 2), triplas: combos(list, 3, 2) };
  writeFileSync(join(ROOT, 'data', 'escadas.json'), JSON.stringify(out));
  console.log(`escadas: ${list.length} jogadores com as 3 linhas; top: ${list.slice(0, 5).map(x => `${x.name} ${Math.round(x.pj * 100)}%`).join(', ')}; ${out.duplas.length} duplas, ${out.triplas.length} triplas`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
