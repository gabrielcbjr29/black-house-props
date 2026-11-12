// Linhas de jogador da 99play (a casa que o usuário usa), que viram a linha principal do bot e dos tops.
// A 99play usa o sportsbook da Altenar; a API de widget é pública (a mesma que o site chama no navegador).
// As duas integrações do código do site (24games1 e 24games2) trazem as mesmas linhas e odds.
// Fluxo: GetEvents (jogos da NBA) → GetEventDetails de cada jogo de hoje que ainda não começou
// → mercados de jogador "Mais de/Menos de" → {pid, mk, line, books: {'99play': {o, u}}}.
// Jogo que já começou mantém a última foto antes do início (state.providers.c99).
import { getJSON, normName } from './http.js';
import { TEAM_BY_NAME } from './oddsapi.js';

const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget';
export const C99_INTEGRATION = '24games1';
export const C99_BOOK = '99play';
const NBA_CHAMP = 2980;
// typeId do mercado de jogador na Altenar → nosso código
export const C99_MARKETS = {
  768: 'PTS', 772: 'REB', 770: 'AST', 774: '3PM', 773: 'STL', 771: 'BLK', 25050: 'TOV', 2312: 'PF',
  2313: '3PA', 2314: '2PA', 2315: 'FGM', 2317: 'FTM', 2318: 'FTA', 2322: '2PM',
  30070: 'PR', 30071: 'PA', 30072: 'PRA', 30073: 'RA', 30078: 'SB',
};
const OVER = 2501, UNDER = 2502;
const qs = extra => new URLSearchParams({ culture: 'pt-BR', timezoneOffset: '180', integration: C99_INTEGRATION, deviceType: '1', numFormat: 'en-GB', countryCode: 'BR', ...extra });
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
 * Busca as linhas da 99play para os jogos de hoje. state: data/odds-state.json (providers.c99).
 * Devolve todas as linhas do dia (as novas dos jogos que não começaram + a última foto dos que já começaram).
 */
export async function fetch99({ slate, state, now = new Date(), log = console.log, get = getJSON }) {
  const date = slate.meta?.date;
  const S = state.providers.c99 ||= {};
  if (S.date !== date) { S.date = date; S.events = {}; }
  const ours = new Map(slate.games.map(g => [[g.away, g.home].sort().join('|'), g]));
  let events;
  try { events = parseEvents(await get(`${BASE}/GetEvents?${qs({ eventCount: '0', sportId: '0', champIds: String(NBA_CHAMP) })}`)); }
  catch (e) { log(`  99play: lista de jogos falhou (${e.message}); uso a última foto`); events = []; }
  let fetched = 0, n = 0;
  for (const ev of events) {
    const g = ours.get(ev.teams.slice().sort().join('|')); if (!g) continue;
    if (Date.parse(ev.start) <= now.getTime()) continue; // começou: fica a foto de antes
    try {
      const lines = parseEventLines(await get(`${BASE}/GetEventDetails?${qs({ eventId: String(ev.id) })}`, { timeout: 30000 }), slate.players.filter(p => p.team === g.home || p.team === g.away));
      fetched++;
      if (lines.length) S.events[g.id] = { at: now.toISOString(), ev: ev.id, lines };
    } catch (e) { log(`  99play: ${g.away}@${g.home} falhou (${e.message})`); }
  }
  const all = Object.values(S.events).flatMap(x => x.lines);
  n = all.length;
  log(`  99play: ${fetched} jogos lidos agora, ${Object.keys(S.events).length} com linhas, ${n} linhas de jogador`);
  return all;
}

/* linha da 99play passa por cima de qualquer outra do mesmo jogador/mercado */
export function merge99(slate, lines) {
  const k = l => l.pid + '|' + l.mk, has = new Set(lines.map(k));
  slate.lines = [...(slate.lines || []).filter(l => !has.has(k(l))), ...lines];
  return lines.length;
}
