// Linhas de jogador da 99play (a casa que o usuário usa), que viram a linha principal do bot e dos tops.
// A 99play usa o sportsbook da Altenar; a API de widget é pública (a mesma que o site chama no navegador).
// As duas integrações do código do site (24games1 e 24games2) trazem as mesmas linhas e odds.
// O leitor no PC do usuário guarda GetEvents + GetEventDetails (só mercados de jogador) no Supabase;
// aqui viram {pid, mk, line, books: {'99play': {o, u}}}. Jogo que já começou mantém a última foto antes do início.
import { getJSON, normName } from './http.js';
import { TEAM_BY_NAME } from './oddsapi.js';

export const C99_INTEGRATION = '24games1'; // usado pelo leitor (tools/c99-reader.js)
export const C99_BOOK = '99play';
const NBA_CHAMP = 2980;
// typeId do mercado de jogador na Altenar → nosso código
export const C99_MARKETS = {
  768: 'PTS', 772: 'REB', 770: 'AST', 774: '3PM', 773: 'STL', 771: 'BLK', 25050: 'TOV', 2312: 'PF',
  2313: '3PA', 2314: '2PA', 2315: 'FGM', 2317: 'FTM', 2318: 'FTA', 2322: '2PM',
  30070: 'PR', 30071: 'PA', 30072: 'PRA', 30073: 'RA', 30078: 'SB',
};
const OVER = 2501, UNDER = 2502;
const teamOf = c => TEAM_BY_NAME[String(c?.name || '').toLowerCase()] || c?.abbreviation || null;

/* jogos da NBA na 99play → [{id, start, teams: [abbr, abbr]}] */
export function parseEvents(json) {
  const comp = new Map((json?.competitors || []).map(c => [c.id, c]));
  return (json?.events || []).filter(e => e.champId === NBA_CHAMP && (e.competitorIds || []).length === 2)
    .map(e => ({ id: e.id, start: e.startDate, teams: e.competitorIds.map(id => teamOf(comp.get(id))) }));
}

/* detalhes de um jogo → linhas por jogador/mercado (uma por par; se vier mais de uma, a mais equilibrada) */
export function parseEventLines(json, players) {
  const odds = new Map((json?.odds || []).map(o => [o.id, o]));
  const byName = new Map();
  for (const p of players) { const k = normName(p.name); (byName.get(k) || byName.set(k, []).get(k)).push(p); }
  const best = {};
  for (const m of json?.childMarkets || []) {
    const mk = C99_MARKETS[m.typeId]; if (!mk || !m.childName) continue;
    const [lineS, , team] = String(m.sv || '').split('|');
    const line = parseFloat(lineS); if (!Number.isFinite(line)) continue;
    const ids = (m.desktopOddIds || []).flat();
    let o = null, u = null;
    for (const id of ids) { const x = odds.get(id); if (!x || x.oddStatus !== 0 || !(x.price > 1)) continue; if (x.typeId === OVER) o = x.price; else if (x.typeId === UNDER) u = x.price; }
    if (!o || !u) continue;
    const cands = byName.get(normName(m.childName)) || [];
    const p = cands.length > 1 ? cands.find(c => c.team === team) || cands[0] : cands[0];
    if (!p) continue;
    const key = p.id + '|' + mk, bal = Math.abs(1 / o - 1 / u), cur = best[key];
    if (!cur || bal < cur.bal) best[key] = { pid: p.id, mk, line, o, u, bal };
  }
  return Object.values(best).map(b => ({ pid: b.pid, mk: b.mk, line: b.line, books: { [C99_BOOK]: { o: b.o, u: b.u } }, src: 'c99' }));
}

/**
 * Linhas da 99play para os jogos de hoje. A 99play recusa os servidores do GitHub, então quem lê é o navegador
 * do app Claude no computador do usuário (tarefa agendada, tools/c99-reader.js), que grava a foto no Supabase
 * (função c99-ingest). Aqui a coleta lê a foto mais recente. state: data/odds-state.json (providers.c99).
 * Devolve as linhas do dia: as da foto nova + a última foto dos jogos que já começaram (somem da foto nova).
 */
export const C99_SNAPSHOT_URL = 'https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest?latest=1';
export async function fetch99({ slate, state, now = new Date(), log = console.log, get = getJSON, maxAgeH = 18 }) {
  const date = slate.meta?.date;
  const S = state.providers.c99 ||= {};
  if (S.date !== date) { S.date = date; S.events = {}; }
  const ours = new Map(slate.games.map(g => [[g.away, g.home].sort().join('|'), g]));
  let snap = null;
  try { snap = await get(C99_SNAPSHOT_URL, { timeout: 30000 }); } catch (e) { log(`  99play: foto indisponível (${e.message})`); }
  const p = snap?.payload, age = snap?.taken_at ? (now.getTime() - Date.parse(snap.taken_at)) / 3600e3 : Infinity;
  let used = 0;
  if (p && age <= maxAgeH) {
    for (const ev of parseEvents(p)) {
      const g = ours.get(ev.teams.slice().sort().join('|')); if (!g || !p.details?.[ev.id]) continue;
      const lines = parseEventLines(p.details[ev.id], slate.players.filter(x => x.team === g.home || x.team === g.away));
      if (lines.length) { S.events[g.id] = { at: snap.taken_at, ev: ev.id, lines }; used++; }
    }
  } else if (p) log(`  99play: foto de ${Math.round(age)}h atrás, velha demais; uso a última guardada`);
  const all = Object.values(S.events).flatMap(x => x.lines);
  log(`  99play: foto de ${snap?.taken_at ?? '—'}, ${used} jogos dela, ${Object.keys(S.events).length} com linhas, ${all.length} linhas de jogador`);
  return all;
}

/* linha da 99play passa por cima de qualquer outra do mesmo jogador/mercado */
export function merge99(slate, lines) {
  const k = l => l.pid + '|' + l.mk, has = new Set(lines.map(k));
  slate.lines = [...(slate.lines || []).filter(l => !has.has(k(l))), ...lines];
  return lines.length;
}
