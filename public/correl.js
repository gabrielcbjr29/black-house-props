// Props correlacionadas (21/11): conta pura usada pelo bot (/correl) e pelos testes. Dados: public/data/correl/<TIME>.json
// ---------- conta do /correl (pura: o bot importa daqui) ----------
const K_SHRINK = 6;
const VAL = { PTS: g => g[1], REB: g => g[2], AST: g => g[3], '3PM': g => g[4], PRA: g => g[1] + g[2] + g[3] };
/* T = arquivo do time; pid = jogador foco; mk/thr = patamar (ex.: AST 10 = 10+); devolve os companheiros que mais
   sobem/caem na linha de hoje nos jogos em que o foco bateu o patamar */
export function correlOf(T, pid, mk, thr, { minH = 4 } = {}) {
  const G = T.games.filter(([, s]) => s[pid]), H = G.filter(([, s]) => VAL[mk](s[pid]) >= thr);
  const out = [];
  for (const [tid, P] of Object.entries(T.players)) {
    if (tid === pid) continue;
    const gH = H.filter(([, s]) => s[tid]), gA = G.filter(([, s]) => s[tid]);
    if (gH.length < minH || gA.length < gH.length + 3) continue;
    for (const [m, L] of Object.entries(P.lines ?? {})) {
      const hit = gs => gs.filter(([, s]) => VAL[m](s[tid]) > L.l).length;
      const avg = gs => gs.reduce((a, [, s]) => a + VAL[m](s[tid]), 0) / gs.length;
      const hH = hit(gH), hA = hit(gA), rH = hH / gH.length, rA = hA / gA.length;
      out.push({ pid: tid, n: P.n, st: P.st, mk: m, line: L.l, o: L.o, u: L.u, fo: L.fo, nH: gH.length, hH, rH, nA: gA.length, rA,
        aH: Math.round(avg(gH) * 10) / 10, aA: Math.round(avg(gA) * 10) / 10, lift: Math.round((rH - rA) * 1000) / 1000,
        // acerto "encolhido" para a média geral dele (peso de 6 jogos): 7 de 8 vira ~69%, não 88%; ordena por isso
        ls: Math.round(((hH + K_SHRINK * rA) / (gH.length + K_SHRINK) - rA) * 1000) / 1000 });
    }
  }
  return { nG: G.length, nH: H.length, list: out.sort((a, b) => Math.abs(b.ls) - Math.abs(a.ls)) };
}
