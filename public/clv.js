// Fechamento e CLV das entradas do canal (pedido de 17/11).
// "Fechamento" = a odd e a linha da 99play na última leitura ANTES do início do jogo (o leitor roda de hora em hora no PC;
// a função canal grava em cada perna, a cada 15 min, até o jogo começar).
// Bateu o fechamento = pegamos odd melhor que a de fechamento (mesma linha) ou uma linha que depois andou a nosso favor
// (under: a linha caiu; over: a linha subiu). É o melhor sinal de que a entrada tinha valor, ganhe ou perca.
// Usado pela função canal (Deno), pelo painel (navegador) e pelos testes (Node): sem dependências.

export const key99 = (pid, mk) => `${pid}|${mk}`;

/* linhas da 99play do slate → { gen, l: { "pid|mk": [linha, odd over, odd under, lida_em] } } (arquivo leve para a função) */
export function lines99(slate, gen = new Date().toISOString()) {
  const l = {};
  for (const x of slate?.lines ?? []) {
    const b = x.books?.['99play']; if (!b || !(b.o || b.u)) continue;
    l[key99(x.pid, x.mk)] = [x.line, b.o ?? null, b.u ?? null, b.at ?? null];
  }
  return { date: slate?.meta?.date ?? null, gen, l };
}

/* grava o fechamento nas pernas que ainda não começaram. L = lines99().l; gen = quando os dados foram gerados.
   Só aceita leitura feita antes do início do jogo. Devolve { legs, changed }. */
export function updateClosing(legs, L, { now = Date.now(), gen = null } = {}) {
  let changed = false;
  const out = (legs ?? []).map(l => {
    const tip = Date.parse(l.tip); if (!(tip > now)) return l;
    const v = L?.[key99(l.pid, l.mk)]; if (!v) return l;
    const at = v[3] ?? gen; if (at && Date.parse(at) >= tip) return l;
    const close = l.side === 'o' ? v[1] : v[2]; if (!close) return l;
    if (l.cline === v[0] && l.close === close && l.cat === at) return l;
    changed = true; return { ...l, cline: v[0], close, cat: at };
  });
  return { legs: out, changed };
}

/* veredito de uma perna: f = bateu o fechamento, c = contra, n = igual, s = sem leitura */
export function legVerdict(l) {
  if (l?.close == null || l?.cline == null) return { v: 's' };
  const line = +l.line, cl = +l.cline;
  if (cl !== line) {
    const fav = l.side === 'u' ? cl < line : cl > line;
    return { v: fav ? 'f' : 'c', pts: Math.round((fav ? 1 : -1) * Math.abs(cl - line) * 10) / 10 };
  }
  const pct = +l.odd / +l.close - 1;
  return { v: pct > .005 ? 'f' : pct < -.005 ? 'c' : 'n', pct: Math.round(pct * 1000) / 1000 };
}

/* resumo da entrada: quantas pernas bateram/contra, odd de fechamento (se todas as linhas ficaram iguais) e CLV % */
export function postClv(p) {
  const legs = p?.legs ?? [], vs = legs.map(legVerdict);
  const f = vs.filter(x => x.v === 'f').length, c = vs.filter(x => x.v === 'c').length, s = vs.filter(x => x.v === 's').length;
  const same = legs.length && legs.every(l => l.close != null && +l.cline === +l.line);
  const closeOdd = same ? Math.round(legs.reduce((a, l) => a * +l.close, 1) * 100) / 100 : null;
  const clv = same ? Math.round((+p.odd / legs.reduce((a, l) => a * +l.close, 1) - 1) * 1000) / 1000 : null;
  // simples: o veredito da perna; múltipla: mais pernas a favor que contra (sem leitura em todas = desconhecido)
  const bateu = s === legs.length ? null : legs.length === 1 ? (vs[0].v === 'f' ? true : vs[0].v === 'c' ? false : null) : f > c ? true : c > f ? false : null;
  return { f, c, s, n: legs.length, closeOdd, clv, bateu, vs };
}
