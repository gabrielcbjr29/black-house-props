// Gabarito do canal · futebol (21/11): corrige sozinho as entradas de futebol postadas no canal principal.
// Entrada = texto da imagem (OCR) + legenda. Acha o jogo pelos dois times (placar do dia da ESPN, soccer/all), lê o
// mercado (gols do jogo/do time, ambas marcam, resultado, escanteios, cartões, chutes, defesas, faltas, jogador para
// marcar/assistência) e confere no resumo da partida (placar + estatísticas do time + estatísticas do jogador).
// Funções puras: a função `canal` busca a ESPN e chama gradeFut; os testes usam dados reais gravados.

export const nrm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
const word = s => nrm(s).replace(/[^a-z0-9.]+/g, ' ').trim();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (txt, alias) => new RegExp(`(^|[^a-z0-9])${esc(alias)}($|[^a-z0-9])`).test(txt);

/* nomes de um time para procurar no texto (sem os curtos demais) */
function aliases(team) {
  const out = new Set();
  for (const v of [team.displayName, team.shortDisplayName, team.name, team.location]) {
    const w = word(v); if (w.length >= 4) out.add(w);
    const sem = w.replace(/\b(fc|cf|afc|sc|ac|cd|club|clube|de|futbol|football)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (sem.length >= 4) out.add(sem);
  }
  return [...out].sort((a, b) => b.length - a.length);
}
const teamsOf = ev => (ev?.competitions?.[0]?.competitors ?? []).map(c => ({ home: c.homeAway === 'home', score: +c.score, name: String(c.team?.displayName ?? '').trim(), al: aliases(c.team ?? {}) }));
const hit = (line, t) => t.al.find(a => has(line, a));

/* os jogos citados na entrada: os dois times na mesma linha (ou em linhas vizinhas). Devolve [{ev, i}] em ordem. */
export function findEvents(text, events) {
  const lines = String(text ?? '').split(/\n+/).map(word).filter(Boolean);
  const found = [];
  for (const ev of events ?? []) {
    const T = teamsOf(ev); if (T.length !== 2) continue;
    // 1º a linha com os dois times ("Real Madrid x Celta Vigo"); só sem ela vale um time por linha em linhas vizinhas
    const near = j => j >= 0 && j < lines.length;
    let f = null;
    for (let i = 0; i < lines.length && !f; i++) { const a = hit(lines[i], T[0]), b = hit(lines[i], T[1]); if (a && b) f = { ev, i, w: a.length + b.length }; }
    for (let i = 0; i < lines.length && !f; i++) {
      const a = hit(lines[i], T[0]), b = a ? [i + 1, i - 1].map(j => near(j) && hit(lines[j], T[1])).find(Boolean) : null;
      if (a && b) f = { ev, i, w: a.length + b.length };
    }
    if (f) found.push(f);
  }
  // mesma linha casando com dois jogos (ex.: "Newcastle" e "Newcastle Jets"): fica o de nome mais completo
  const best = new Map(); for (const f of found) { const o = best.get(f.i); if (!o || f.w > o.w) best.set(f.i, f); }
  return [...best.values()].sort((a, b) => a.i - b.i);
}

const SIDE = t => { let m = /(mais|acima|over|maior)\s*(de|que|do que)?\s*(\d+(?:\.\d+)?)/.exec(t); if (m) return { side: 'o', line: +m[3] };
  m = /(menos|abaixo|under|menor)\s*(de|que|do que)?\s*(\d+(?:\.\d+)?)/.exec(t); if (m) return { side: 'u', line: +m[3] };
  m = /\b(\d{1,2})\s*\+(?!\s*\d)/.exec(t); if (m) return { side: 'o', line: +m[1] - .5 }; return null; };

// mercados: [regex, chave, do jogador?]
const KW = [
  [/ambas?|ambos\s*(os\s*)?(times\s*)?marcam|btts/, 'btts'],
  [/defesas?\b|saves?\b/, 'saves'],
  [/(chutes?|finaliza\w*|remates?)\s*(no|ao|a|em)\s*(gol|alvo)|\bno alvo|chutes? certos|on target/, 'sog'],
  [/chutes?|finaliza\w*|remates?|shots?/, 'shots'],
  [/escanteios?|cantos?\b|corners?/, 'corners'],
  [/cart(ao|oes|oe)\b|cartoes|cards?\b/, 'cards'],
  [/faltas?\b|fouls?/, 'fouls'],
  [/impedimentos?|offsides?/, 'offsides'],
  [/assist/, 'assists'],
  [/para marcar|marca(r)?\s*(a qualquer|em qualquer|gol|um gol)|qualquer momento|goleador|anytime|marcador/, 'scorer'],
  [/gols?\b|goals?\b|total/, 'goals'],
  [/resultado|vencedor|1x2|para vencer|vitoria|dupla chance|empate|moneyline/, 'result'],
];
const TEAM_STAT = { corners: 'wonCorners', shots: 'totalShots', sog: 'shotsOnTarget', fouls: 'foulsCommitted', offsides: 'offsides', saves: 'saves' };
const PLAYER_STAT = { saves: 'SV', sog: 'SOG', shots: 'SHOT', fouls: 'FC', assists: 'A', goals: 'G', scorer: 'G', cards: 'YC' };
const MK_PT = { btts: 'Ambas marcam', saves: 'Defesas', sog: 'Chutes no gol', shots: 'Chutes', corners: 'Escanteios', cards: 'Cartões', fouls: 'Faltas', offsides: 'Impedimentos', assists: 'Assistências', scorer: 'Para marcar', goals: 'Gols', result: 'Resultado' };

function players(sum) {
  const out = [];
  for (const r of sum?.rosters ?? []) for (const a of r.roster ?? []) {
    const name = String(a.athlete?.displayName ?? ''); if (!name) continue;
    const st = {}; for (const s of a.stats ?? []) st[s.abbreviation] = +s.value || 0;
    out.push({ name, key: word(name), last: word(name).split(' ').at(-1), team: String(r.team?.displayName ?? '').trim(), played: !!(a.starter || a.subbedIn || st.APP > 0), st });
  }
  const n = new Map(); for (const p of out) n.set(p.last, (n.get(p.last) ?? 0) + 1);
  return out.map(p => ({ ...p, lastOk: p.last.length >= 4 && n.get(p.last) === 1 }));
}
function teamStats(sum) {
  const m = new Map();
  for (const t of sum?.boxscore?.teams ?? []) { const o = {}; for (const s of t.statistics ?? []) o[s.name] = +s.displayValue || 0; m.set(String(t.team?.displayName ?? '').trim(), o); }
  return m;
}
const cmp = (v, sl) => v === sl.line ? 'void' : (sl.side === 'o' ? v > sl.line : v < sl.line) ? 'green' : 'red';

/* corrige UMA seleção: ctx = linhas da entrada ligadas a este jogo; evLine = a linha "Time A x Time B" */
export function gradeLeg(ctxLines, evLine, ev, sum) {
  const T = teamsOf(ev), all = ctxLines.map(word), t = all.join('\n');
  const st = ev?.status?.type ?? {};
  const jogo = `${T.find(x => x.home)?.name ?? T[0]?.name} x ${T.find(x => !x.home)?.name ?? T[1]?.name}`;
  if (/POSTPONED|CANCEL|ABANDON|SUSPEND/.test(st.name ?? '')) return { status: 'void', jogo, why: 'jogo adiado/cancelado' };
  if (st.state !== 'post' || st.completed === false) return { status: null, jogo, why: 'jogo não terminou' };
  const kw = KW.find(([rx]) => rx.test(t))?.[1] ?? null;
  // jogador citado na entrada (nome completo, ou sobrenome único entre os dois elencos)
  const P = players(sum);
  const pl = P.find(p => all.some(l => has(l, p.key))) ?? P.find(p => p.lastOk && all.some(l => has(l, p.last)));
  // time citado fora da linha do jogo (ex.: "Arsenal total" → gols do Arsenal)
  const sel = all.filter((_, i) => ctxLines[i] !== evLine);
  const teamHits = T.filter(x => sel.some(l => hit(l, x)));
  const tm = teamHits.length === 1 ? teamHits[0] : null;
  const sl = SIDE(t);
  const S = teamStats(sum), stOf = x => S.get(x.name) ?? {};
  const base = { jogo, mercado: kw ? MK_PT[kw] : null };
  if (!kw) return { ...base, status: null, why: 'mercado não reconhecido' };

  if (pl && PLAYER_STAT[kw]) {
    if (!pl.played) return { ...base, status: 'void', quem: pl.name, why: 'jogador não entrou' };
    const v = kw === 'cards' ? (pl.st.YC ?? 0) + (pl.st.RC ?? 0) : pl.st[PLAYER_STAT[kw]] ?? 0;
    const s2 = kw === 'scorer' ? { side: 'o', line: .5 } : sl ?? (kw === 'assists' || kw === 'goals' || kw === 'cards' ? { side: 'o', line: .5 } : null);
    if (!s2) return { ...base, status: null, quem: pl.name, why: 'linha não lida' };
    return { ...base, quem: pl.name, sel: `${s2.side === 'o' ? 'mais' : 'menos'} de ${s2.line}`, valor: v, status: cmp(v, s2) };
  }
  if (kw === 'scorer' || kw === 'assists') return { ...base, status: null, why: 'jogador não achado no elenco' };
  if (kw === 'btts') {
    const nao = /\bnao\b/.test(t), both = T.every(x => x.score > 0);
    return { ...base, sel: nao ? 'não' : 'sim', valor: `${T[0].score}-${T[1].score}`, status: (nao ? !both : both) ? 'green' : 'red' };
  }
  if (kw === 'result') {
    const draw = /\bempate\b|\bdraw\b/.test(t) && !/^dupla chance$/.test(t);
    const ganhou = T[0].score === T[1].score ? null : T[0].score > T[1].score ? T[0] : T[1];
    const ok = [];
    if (tm) ok.push(ganhou === tm); if (draw) ok.push(ganhou === null);
    if (!ok.length) return { ...base, status: null, why: 'seleção do resultado não lida' };
    return { ...base, sel: [tm?.name, draw && 'empate'].filter(Boolean).join(' ou '), valor: `${T[0].score}-${T[1].score}`, status: ok.some(Boolean) ? 'green' : 'red' };
  }
  if (!sl) return { ...base, status: null, why: 'linha não lida' };
  let v;
  if (kw === 'goals') v = tm ? tm.score : T[0].score + T[1].score;
  else if (kw === 'cards') v = (tm ? [tm] : T).reduce((s, x) => s + (stOf(x).yellowCards ?? 0) + (stOf(x).redCards ?? 0), 0);
  else if (TEAM_STAT[kw]) { const k = TEAM_STAT[kw]; if (!T.every(x => stOf(x)[k] != null)) return { ...base, status: null, why: 'estatística sem dado' }; v = (tm ? [tm] : T).reduce((s, x) => s + (stOf(x)[k] ?? 0), 0); }
  else return { ...base, status: null, why: 'mercado não reconhecido' };
  return { ...base, quem: tm?.name ?? 'jogo', sel: `${sl.side === 'o' ? 'mais' : 'menos'} de ${sl.line}`, valor: v, status: cmp(v, sl) };
}

/* corrige a entrada inteira: sums = { [eventId]: resumo }. status null = ainda não dá (jogo não acabou / não leu) */
export function gradeFut(text, events, sums) {
  const raw = String(text ?? '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  const F = findEvents(raw.join('\n'), events);
  if (!F.length) return { status: null, legs: [], why: 'jogo não encontrado' };
  const legs = F.map(f => {
    // um jogo: a entrada toda; vários: a linha do jogo, a de cima e as duas de baixo (sem as linhas de outros jogos)
    const others = new Set(F.filter(o => o !== f).map(o => o.i));
    const idx = F.length === 1 ? raw.map((_, i) => i) : [f.i - 1, f.i, f.i + 1, f.i + 2].filter(i => i >= 0 && i < raw.length && !others.has(i));
    const sum = sums?.[f.ev.id];
    const ty = f.ev?.status?.type ?? {};
    if (!sum && ty.state === 'post' && ty.completed !== false && !/POSTPONED|CANCEL|ABANDON|SUSPEND/.test(ty.name ?? '')) return { status: null, jogo: f.ev.id, why: 'sem resumo da partida' };
    return gradeLeg(idx.map(i => raw[i]), raw[f.i], f.ev, sum ?? {});
  });
  const st = legs.map(l => l.status);
  const status = st.includes('red') ? 'red' : st.includes(null) ? null : st.every(s => s === 'void') ? 'void' : 'green';
  return { status, legs, why: status === null ? legs.find(l => l.status === null)?.why : undefined };
}
