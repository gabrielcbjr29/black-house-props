// Aba Jogador (23/11): jogada a jogada da ESPN → arremessos com coordenada, quem deu o passe, rebotes e box score.
// Funções puras, usadas pela coleta (collector/jogador.js) e pela página (jogador.html).
//
// Coordenadas da ESPN: x de 0 a 50 pés (largura da quadra), y sobe a partir do aro, que fica perto de (25, 0).
// O rebote não tem lugar próprio: a ESPN repete o lugar do arremesso que errou.

const FIX = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' };
export const abbr = t => FIX[t] || t;
const okXY = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= -5 && x <= 55 && y >= -10 && y <= 100;
const xy = c => { const x = +c?.x, y = +c?.y; return okXY(x, y) ? [Math.round(x), Math.round(y)] : [null, null]; };
const isFT = p => /free throw/i.test(p?.type?.text || '');
const ptsOf = p => +p?.pointsAttempted || (/three point/i.test(p?.text || p?.type?.text || '') ? 3 : 2);

/* resumo da ESPN (summary?event=) → jogo compacto. null se o jogo não terminou.
   box[T]: [pid, min, pts, fgm, fga, tpm, tpa, ftm, fta, reb, ast, oreb, dreb]
   sh: [T, pid, quemPassou (0 = sem assistência), cesta 0/1, pontos 2/3, x, y]
   rb: [T, pid, ofensivo 0/1, x, y, pontos do arremesso que errou] */
export function parseJogo(j, d) {
  const comp = j?.header?.competitions?.[0];
  if (!comp?.status?.type?.completed || !j?.boxscore) return null;
  const tid = {}; let h = null, a = null;
  for (const c of comp.competitors || []) { const T = abbr(c.team?.abbreviation); tid[c.team?.id] = T; if (c.homeAway === 'home') h = T; else a = T; }
  if (!h || !a) return null;
  const nm = {}, box = {};
  for (const P of j.boxscore.players || []) {
    const T = abbr(P.team?.abbreviation); const st = P.statistics?.[0]; if (!st) continue;
    const k = st.keys || [];
    for (const at of st.athletes || []) {
      if (at.didNotPlay || !at.stats?.length) continue;
      const v = n => at.stats[k.indexOf(n)];
      const min = parseFloat(v('minutes')) || 0; if (!(min > 0)) continue;
      const pr = n => String(v(n) ?? '0-0').split('-').map(x => +x || 0);
      const n = x => +v(x) || 0;
      const pid = +at.athlete?.id; if (!pid) continue;
      nm[pid] = at.athlete.displayName || at.athlete.fullName || String(pid);
      (box[T] ||= []).push([pid, Math.round(min), n('points'), ...pr('fieldGoalsMade-fieldGoalsAttempted'), ...pr('threePointFieldGoalsMade-threePointFieldGoalsAttempted'),
        ...pr('freeThrowsMade-freeThrowsAttempted'), n('rebounds'), n('assists'), n('offensiveRebounds'), n('defensiveRebounds')]);
    }
  }
  const sh = [], rb = [], plays = j.plays || [];
  plays.forEach((p, i) => {
    const T = tid[p.team?.id]; const who = +p.participants?.[0]?.athlete?.id; if (!T || !who) return;
    if (p.shootingPlay && !isFT(p)) {
      const made = p.scoringPlay ? 1 : 0;
      sh.push([T, who, made ? +p.participants?.[1]?.athlete?.id || 0 : 0, made, ptsOf(p), ...xy(p.coordinate)]);
    } else if (/rebound/i.test(p.type?.text || '')) {
      const prev = plays[i - 1];
      if (prev?.shootingPlay && !isFT(prev) && !prev.scoringPlay) rb.push([T, who, /offensive/i.test(p.type.text) ? 1 : 0, ...xy(prev.coordinate), ptsOf(prev)]);
    }
  });
  return { id: String(comp.id), d, h, a, nm, box, sh, rb };
}

/* jogos compactos de um time → arquivo do time (public/data/jogador/<T>.json)
   jogos: [eid, data, adversário, casa 1/0]; box: [gi, pid, min, pts, fgm, fga, tpm, tpa, ftm, fta, reb, ast, oreb, dreb]
   sh: [gi, pid, quemPassou, cesta, pontos, x, y]; rb: [gi, pid, ofensivo, x, y, pontos] */
export function montaTime(T, jogos) {
  const out = { t: T, nomes: {}, jogos: [], box: [], sh: [], rb: [] };
  jogos.filter(g => g.h === T || g.a === T).sort((x, y) => x.d.localeCompare(y.d) || x.id.localeCompare(y.id)).forEach(g => {
    const gi = out.jogos.length; out.jogos.push([g.id, g.d, g.h === T ? g.a : g.h, g.h === T ? 1 : 0]);
    for (const r of g.box[T] || []) { out.box.push([gi, ...r]); out.nomes[r[0]] = g.nm[r[0]]; }
    for (const s of g.sh) if (s[0] === T) out.sh.push([gi, ...s.slice(1)]);
    for (const r of g.rb) if (r[0] === T) out.rb.push([gi, ...r.slice(1)]);
  });
  return out;
}

export const linha = r => ({ g: r[0], pid: r[1], min: r[2], pts: r[3], fgm: r[4], fga: r[5], tpm: r[6], tpa: r[7], ftm: r[8], fta: r[9], reb: r[10], ast: r[11], oreb: r[12], dreb: r[13] });

// mercados: v = o número da aposta, w = o volume que é repassado quando alguém sai
export const MERCADOS = {
  pts: { nome: 'Pontos', v: r => r.pts, w: r => r.fga + 0.44 * r.fta },
  tpm: { nome: '3PM', v: r => r.tpm, w: r => r.tpa },
  reb: { nome: 'Rebotes', v: r => r.reb, w: r => r.reb },
  ast: { nome: 'Assistências', v: r => r.ast, w: r => r.ast },
};
export const COMBOS = { PRA: ['pts', 'reb', 'ast'], PR: ['pts', 'reb'], PA: ['pts', 'ast'], RA: ['reb', 'ast'] };

export function porJogador(time) {
  const m = {};
  for (const r of time.box) (m[r[1]] ||= []).push(linha(r));
  return m;
}

/* rotação: jogou 40%+ dos jogos do time (mínimo 3) com 18+ minutos de média. Até 10 jogadores, por minutos. */
export function rotacao(time, pj = porJogador(time)) {
  const G = time.jogos.length;
  return Object.entries(pj).map(([pid, j]) => [+pid, j.length, j.reduce((s, r) => s + r.min, 0) / j.length])
    .filter(([, n, m]) => n >= Math.max(3, 0.4 * G) && m >= 18).sort((a, b) => b[2] - a[2]).slice(0, 10).map(x => x[0]);
}

const media = (j, f) => j.length ? j.reduce((s, r) => s + f(r), 0) / j.length : 0;

/* quem está fora: o volume (w) de quem sai vai para os outros da rotação na proporção do volume deles,
   convertido pela eficiência de cada um (v/w). k = quanto desse repasse acontece de verdade (calibrado nos jogos reais).
   Devolve { pid: { n: média normal, a: ajustada (null = fora) } } para a rotação + o jogador escolhido. */
export function ajuste(time, mk, fora, k = 1, extra = null, pj = porJogador(time), rot = rotacao(time, pj)) {
  const M = MERCADOS[mk], ids = [...new Set([...rot, ...(extra != null && pj[extra] ? [extra] : [])])];
  const base = {};
  for (const i of ids) { const j = pj[i]; const W = media(j, M.w), V = media(j, M.v); base[i] = { W, V, e: W ? V / W : 0 }; }
  const pool = ids.filter(i => fora.has(i)).reduce((s, i) => s + base[i].W, 0);
  const resto = ids.filter(i => !fora.has(i)).reduce((s, i) => s + base[i].W, 0) || 1;
  const out = {};
  for (const i of ids) { const b = base[i]; out[i] = { n: b.V, a: fora.has(i) ? null : b.V + k * (pool * b.W / resto) * b.e }; }
  return out;
}

/* calibra k por mercado: nos jogos em que alguém da rotação ficou fora (entre o primeiro e o último jogo dele),
   compara o que os presentes fizeram a mais (contra a média deles nos jogos em que quem saiu jogou) com o repasse de 100%. */
export function calibra(times) {
  const acc = {}; for (const mk in MERCADOS) acc[mk] = { real: 0, prev: 0, n: 0 };
  for (const time of times) {
    const pj = porJogador(time), rot = rotacao(time, pj);
    const faixa = {}; for (const i of rot) { const gs = pj[i].map(r => r.g); faixa[i] = [Math.min(...gs), Math.max(...gs)]; }
    for (let g = 0; g < time.jogos.length; g++) {
      const jogou = new Set(time.box.filter(r => r[0] === g).map(r => r[1]));
      if (!jogou.size) continue;
      const fora = rot.filter(i => !jogou.has(i) && faixa[i][0] < g && g < faixa[i][1]);
      const pres = rot.filter(i => jogou.has(i));
      if (!fora.length || pres.length < 3) continue;
      // base de comparação: os jogos em que quem saiu estava em quadra (é o "normal" de cada presente)
      const comTodos = new Set(fora.map(i => new Set(pj[i].map(r => r.g))).reduce((a, b) => new Set([...a].filter(x => b.has(x)))));
      if (comTodos.size < 3) continue;
      for (const mk in MERCADOS) {
        const M = MERCADOS[mk];
        const loo = i => pj[i].filter(r => comTodos.has(r.g));
        const W = i => media(loo(i), M.w), V = i => media(loo(i), M.v);
        const pool = fora.reduce((s, i) => s + media(pj[i], M.w), 0), resto = pres.reduce((s, i) => s + W(i), 0);
        if (!pool || !resto) continue;
        for (const i of pres) {
          const w = W(i), v = V(i), r = pj[i].find(x => x.g === g); if (!r || !w) continue;
          acc[mk].prev += pool * w / resto * (v / w); acc[mk].real += M.v(r) - v;
        }
        acc[mk].n++;
      }
    }
  }
  // com poucos jogos, puxa para 60% (o que a literatura de "usage" costuma achar); com 60+ jogos vale o medido
  const k = {}; for (const mk in acc) { const a = acc[mk]; const bruto = a.prev > 0 ? Math.max(0, Math.min(1, a.real / a.prev)) : 0.6;
    k[mk] = { k: Math.round((bruto * a.n + 0.6 * 20) / (a.n + 20) * 100) / 100, bruto: Math.round(bruto * 100) / 100, n: a.n }; }
  return k;
}

/* quem mais ganha quando os desfalques do dia ficam fora (vai para a aba Jogos e para o bot) */
export function ganhos(time, foraIds, K) {
  const pj = porJogador(time), rot = rotacao(time, pj), fora = new Set(foraIds.filter(i => rot.includes(i)));
  if (!fora.size) return [];
  const por = {};
  for (const mk of ['pts', 'reb', 'ast']) {
    const o = ajuste(time, mk, fora, K?.[mk]?.k ?? 0.5, null, pj, rot);
    for (const i in o) if (o[i].a != null) (por[i] ||= { pid: +i })[mk] = Math.round((o[i].a - o[i].n) * 10) / 10;
  }
  return Object.values(por).filter(x => x.pts >= 1 || x.reb >= 0.5 || x.ast >= 0.5)
    .sort((a, b) => (b.pts + b.reb + b.ast) - (a.pts + a.reb + a.ast)).slice(0, 4).map(x => ({ ...x, nome: time.nomes[x.pid] }));
}
