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

/* Finta (19/11): índice "pid|mk|linha" → odd do over, da leitura da coleta (finta.json); só over */
export function fintaIdx(F) { const m = {}; for (const l of F?.lines ?? []) if (+l.o > 1) m[`${l.pid}|${l.mk}|${+l.line}`] = +l.o; return m; }
/* grava o fechamento da Finta (fclose) nas pernas de over que ainda não começaram; mesma regra da 99play */
export function updateFinta(legs, idx, { now = Date.now(), gen = null } = {}) {
  let changed = false;
  const out = (legs ?? []).map(l => {
    const tip = Date.parse(l.tip); if (l.side !== 'o' || !(tip > now) || (gen && Date.parse(gen) >= tip)) return l;
    const o = idx?.[`${l.pid}|${l.mk}|${+l.line}`]; if (!o || +l.fclose === o) return l;
    changed = true; return { ...l, fclose: o };
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

// ---------- Veredito pelo fechamento (19/11, ideia do BankrollSZN: julgar o método pelo CLV, não só por green/red) ----------
// Com ~100 entradas a sorte ainda manda no resultado (±19u numa odd de 1,90); o CLV tem pouco ruído por entrada e mostra
// valor com algumas centenas. CLV de uma entrada, em pontos de chance: chance implícita no fechamento − na entrada
// (1/odd de fechamento − 1/odd da entrada, mesma linha). Positivo = o mercado andou para o nosso lado.
// Linha que mudou: conta em "bateu o fechamento" (a favor/contra), mas fica fora da média em pontos (não dá para pôr as
// duas linhas na mesma escala sem o modelo). Veredito pelo t da média: 2+ bate o fechamento, −2 ou menos atrás,
// entre os dois sem prova; menos de 30 leituras = cedo demais.

/* uma entrada (open_* = na hora da entrada; line/odd = fechamento) → { v: 'f'|'c'|'n'|'s', pp } */
export function pickClv({ side, open_line, open_odd, line, odd }) {
  if (open_line == null || open_odd == null || line == null || odd == null || !(+odd > 1) || !(+open_odd > 1)) return { v: 's', pp: null };
  if (+line !== +open_line) return { v: (side === 'u' ? +line < +open_line : +line > +open_line) ? 'f' : 'c', pp: null };
  const pp = Math.round((1 / +odd - 1 / +open_odd) * 10000) / 100;
  return { v: pp > 0 ? 'f' : pp < 0 ? 'c' : 'n', pp };
}

/* odd da entrada × odd de fechamento (mesma linha) → pontos de chance */
export const ppOf = (odd, close) => (+odd > 1 && +close > 1) ? Math.round((1 / +close - 1 / +odd) * 10000) / 100 : null;

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sdv = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const r2 = x => Math.round(x * 100) / 100, r3 = x => Math.round(x * 1000) / 1000;

/* lista de { v, pp, status, profit } → números do veredito */
export function clvStats(list) {
  const pp = list.map(x => x.pp).filter(x => x != null);
  const lidas = list.filter(x => x.v && x.v !== 's'), f = lidas.filter(x => x.v === 'f').length, c = lidas.filter(x => x.v === 'c').length;
  const dec = list.filter(x => x.status === 'green' || x.status === 'red'), prof = dec.map(x => +x.profit || 0);
  const m = pp.length ? mean(pp) : null, se = pp.length >= 2 ? sdv(pp) / Math.sqrt(pp.length) : null;
  const t = m == null || !se ? null : r2(m / se);
  const roi = dec.length ? mean(prof) : null, faixa = dec.length >= 2 ? 2 * sdv(prof) / Math.sqrt(dec.length) : null;
  return { n: list.length, g: dec.filter(x => x.status === 'green').length, r: dec.filter(x => x.status === 'red').length,
    lucro: r2(prof.reduce((s, x) => s + x, 0)), roi: roi == null ? null : r3(roi), faixa: faixa == null ? null : r3(faixa),
    lidas: lidas.length, f, c, npp: pp.length, clv: m == null ? null : r2(m), t, ver: verdict(pp.length, t) };
}
export function verdict(n, t) {
  if (n < 30 || t == null) return { k: 'cedo', lb: 'Cedo demais' };
  if (t >= 2) return { k: 'bate', lb: 'Bate o fechamento' };
  if (t <= -2) return { k: 'atras', lb: 'Atrás do fechamento' };
  return { k: 'semprova', lb: 'Sem prova ainda' };
}

/* faixas de valor (EV do modelo na entrada) */
export const EDGE_BANDS = [[-9, 0, 'EV negativo'], [0, .03, '0–3%'], [.03, .05, '3–5%'], [.05, .10, '5–10%'], [.10, .15, '10–15%'], [.15, 9, '15%+']];
export const edgeBand = e => e == null ? 'Sem EV' : (EDGE_BANDS.find(([a, b]) => +e >= a && +e < b) ?? EDGE_BANDS[0])[2];

/* família de cada estratégia do papel (para o veredito por método) */
export function familia(id) {
  if (id === 'minutos') return 'Método Minutos';
  if (id === 'tendencia') return 'Tendência';
  if (id.startsWith('v2-')) return 'Modelo v2 (todos os mercados)';
  if (id.startsWith('m-')) return 'Modelo por mercado';
  return 'Outras do modelo';
}

/* entradas do papel (strategy_picks) → veredito por método, estratégia, lado e faixa de valor */
export function veredito(rows, { nomes = {} } = {}) {
  const P = rows.map(r => ({ ...r, ...pickClv(r) }));
  const group = (keyFn, order) => {
    const m = new Map(); for (const x of P) { const k = keyFn(x); if (k == null) continue; (m.get(k) ?? m.set(k, []).get(k)).push(x); }
    const out = [...m].map(([k, l]) => ({ k, ...clvStats(l) }));
    return order ? out.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k)) : out.sort((a, b) => b.npp - a.npp);
  };
  const famOrder = ['Método Minutos', 'Modelo v2 (todos os mercados)', 'Modelo por mercado', 'Tendência', 'Outras do modelo'];
  const bandOrder = [...EDGE_BANDS.map(b => b[2]), 'Sem EV'];
  // Finta (19/11): só over; CLV pela odd da Finta na linha da entrada (fin_open → fin_odd) e lucro na odd dela
  const F = P.map(r => ({ r, c: finClv(r) })).filter(x => x.c).map(({ r, c }) => ({ ...c, status: r.status, profit: r.status === 'green' ? +r.fin_open - 1 : r.status === 'red' ? -1 : 0 }));
  return {
    total: clvStats(P),
    casa: [{ k: '99play', ...clvStats(P) }, { k: 'Finta (só over)', ...clvStats(F) }],
    comparo: comparaCasas(rows),
    metodo: group(x => familia(x.strategy_id), famOrder),
    estrategia: group(x => x.strategy_id).map(e => ({ ...e, nome: nomes[e.k] ?? e.k })),
    lado: group(x => x.side === 'o' ? 'Over' : 'Under', ['Over', 'Under']),
    faixa: group(x => x.strategy_id === 'tendencia' ? null : edgeBand(x.edge), bandOrder),
  };
}

/* CLV de uma entrada na Finta (só over; odd do mesmo over na hora da entrada e no fechamento) */
export function finClv(r) {
  if (r.side !== 'o' || !(+r.fin_open > 1) || !(+r.fin_odd > 1)) return null;
  const pp = ppOf(r.fin_open, r.fin_odd); return { v: pp > 0 ? 'f' : pp < 0 ? 'c' : 'n', pp };
}

/* qual casa pagou mais no mesmo over, na hora da entrada (99play open_odd × Finta fin_open, mesma linha), e o lucro de
   entrar em cada uma e na melhor das duas, nas entradas já conferidas */
export function comparaCasas(rows) {
  const B = rows.filter(r => r.side === 'o' && +r.open_odd > 1 && +r.fin_open > 1);
  const D = B.filter(r => r.status === 'green' || r.status === 'red');
  const roi = f => D.length ? r3(D.reduce((a, r) => a + (r.status === 'green' ? f(r) - 1 : -1), 0) / D.length) : null;
  return { n: B.length, fin: B.filter(r => +r.fin_open > +r.open_odd).length, p99: B.filter(r => +r.open_odd > +r.fin_open).length,
    ganho: B.length ? r3(B.reduce((a, r) => a + Math.max(+r.fin_open, +r.open_odd) / +r.open_odd - 1, 0) / B.length) : null,
    conferidas: D.length, roi99: roi(r => +r.open_odd), roiFin: roi(r => +r.fin_open), roiMelhor: roi(r => Math.max(+r.open_odd, +r.fin_open)) };
}

/* posts do canal (endpoint ?resultados) → veredito por tipo: simples, múltiplas, Criar Aposta */
export function vereditoCanal(posts) {
  const P = posts.map(p => {
    const s = p.kind === 'simples', l = p.legs?.[0];
    // múltipla: produto das odds das pernas na entrada × no fechamento (a odd postada do Criar Aposta é estimada)
    const sep = (p.legs ?? []).reduce((a, x) => a * (+x.odd || NaN), 1);
    const pp = s && l ? (l.cline != null && +l.cline === +l.line ? ppOf(l.odd, l.close) : null) : (p.clv?.closeOdd && sep > 1 ? ppOf(sep, p.clv.closeOdd) : null);
    const v = p.clv?.bateu == null ? (pp == null ? 's' : 'n') : p.clv.bateu ? 'f' : 'c';
    const tipo = s ? 'Simples' : String(p.band ?? '').startsWith('ca-') ? 'Criar Aposta' : 'Múltiplas';
    return { tipo, v, pp, status: p.status, profit: p.profit };
  });
  const tipos = ['Simples', 'Múltiplas', 'Criar Aposta'].map(k => ({ k, ...clvStats(P.filter(x => x.tipo === k)) })).filter(x => x.n);
  // Finta: simples de over com odd da Finta na postagem (fodd) e no fechamento (fclose), mesma linha
  const F = posts.filter(p => p.kind === 'simples' && p.legs?.[0]?.side === 'o' && +p.legs[0].fodd > 1 && +p.legs[0].fclose > 1).map(p => {
    const l = p.legs[0], pp = ppOf(l.fodd, l.fclose);
    return { v: pp > 0 ? 'f' : pp < 0 ? 'c' : 'n', pp, status: p.status, profit: p.status === 'green' ? (+p.stake || 1) * (+l.fodd - 1) : p.status === 'red' ? -(+p.stake || 1) : 0 };
  });
  if (F.length) tipos.push({ k: 'Simples na Finta (over)', ...clvStats(F) });
  return { total: clvStats(P), tipos };
}
