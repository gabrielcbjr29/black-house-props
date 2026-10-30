// The Odds API (https://the-odds-api.com) — opcional, precisa de ODDS_API_KEY.
// Custo: a lista de jogos (/events) é GRÁTIS; cada jogo custa (mercados × regiões) créditos.
// Com `bookmakers` (até 10 casas) o custo é o de 1 região. O plano de quando buscar fica em oddsplan.js.
import { getJSON, normName } from './http.js';
import { MARKETS } from '../public/engine.js';
import { snapshotKind, dailyAllowance } from './oddsplan.js';

const BASE = 'https://api.the-odds-api.com/v4/sports/basketball_nba';
export const TEAM_BY_NAME = {
  'atlanta hawks': 'ATL', 'boston celtics': 'BOS', 'brooklyn nets': 'BKN', 'charlotte hornets': 'CHA', 'chicago bulls': 'CHI', 'cleveland cavaliers': 'CLE',
  'dallas mavericks': 'DAL', 'denver nuggets': 'DEN', 'detroit pistons': 'DET', 'golden state warriors': 'GSW', 'houston rockets': 'HOU', 'indiana pacers': 'IND',
  'los angeles clippers': 'LAC', 'la clippers': 'LAC', 'los angeles lakers': 'LAL', 'memphis grizzlies': 'MEM', 'miami heat': 'MIA', 'milwaukee bucks': 'MIL',
  'minnesota timberwolves': 'MIN', 'new orleans pelicans': 'NOP', 'new york knicks': 'NYK', 'oklahoma city thunder': 'OKC', 'orlando magic': 'ORL',
  'philadelphia 76ers': 'PHI', 'phoenix suns': 'PHX', 'portland trail blazers': 'POR', 'sacramento kings': 'SAC', 'san antonio spurs': 'SAS',
  'toronto raptors': 'TOR', 'utah jazz': 'UTA', 'washington wizards': 'WAS'
};
const MK_BY_ODDS = Object.fromEntries(Object.entries(MARKETS).filter(([, m]) => m.odds).map(([k, m]) => [m.odds, k]));

/* lê as linhas de um evento e devolve [{name, mk, line, books:{Casa:{o,u}}}] — todas as linhas (o merge escolhe) */
export function parseEventOdds(json) {
  const groups = {};
  for (const bm of json?.bookmakers || []) {
    for (const mkt of bm.markets || []) {
      const mk = MK_BY_ODDS[mkt.key]; if (!mk) continue;
      for (const o of mkt.outcomes || []) {
        if (o.point == null || !o.description) continue;
        const key = normName(o.description) + '|' + mk;
        const g = groups[key] ||= { name: o.description, mk, byLine: {} };
        const b = (g.byLine[o.point] ||= {})[bm.title] ||= {};
        if (/^over$/i.test(o.name)) b.o = o.price; else if (/^under$/i.test(o.name)) b.u = o.price;
      }
    }
  }
  const out = [];
  for (const g of Object.values(groups)) for (const [line, books] of Object.entries(g.byLine)) out.push({ name: g.name, mk: g.mk, line: +line, books });
  return out;
}

/**
 * Busca só os jogos que precisam de foto agora, dentro do orçamento.
 * state: estado persistente (oddsplan.js). Devolve { lines (todas as fotos válidas de hoje), fetched, credits, remaining }.
 */
export async function fetchLines({ key, date, teams, markets, regions, bookmakers, state, wantOpen = true, wantClose = true, closeWindow = 150, monthlyBudget = null, log = console.log, now = new Date() }) {
  const S = state.providers.oddsapi ||= { events: {}, remaining: null, usedToday: 0, day: null };
  if (S.day !== date) { S.day = date; S.usedToday = 0; }
  if (S.month !== date.slice(0, 7)) { S.month = date.slice(0, 7); S.usedMonth = 0; }
  const events = await getJSON(`${BASE}/events?apiKey=${key}`); // grátis
  if (events.__remaining != null) S.remaining = events.__remaining;
  const todays = (events || []).filter(e => teams.has(TEAM_BY_NAME[String(e.home_team).toLowerCase()]));
  const nMk = markets.split(',').filter(Boolean).length;
  const groups = bookmakers ? Math.ceil(bookmakers.split(',').filter(Boolean).length / 10) : regions.split(',').filter(Boolean).length;
  const cost = nMk * groups;
  let allowance = dailyAllowance({ remaining: monthlyBudget != null && S.remaining != null ? Math.min(S.remaining, monthlyBudget - (S.usedMonth || 0)) : S.remaining, now });
  allowance = Math.max(0, allowance - S.usedToday);
  // fechamento primeiro (mais valioso para o CLV), depois abertura
  const plan = todays.map(e => {
    const st = S.events[e.id] ||= { date, snaps: [], lines: [] };
    const kind = snapshotKind({ snaps: st.snaps, minutesToTip: (Date.parse(e.commence_time) - now) / 6e4, wantOpen, wantClose, closeWindow });
    return { e, st, kind };
  }).filter(x => x.kind).sort((a, b) => (a.kind === 'close' ? 0 : 1) - (b.kind === 'close' ? 0 : 1));
  let spent = 0, fetched = 0, skipped = 0;
  for (const { e, st, kind } of plan) {
    if (spent + cost > allowance) { skipped++; continue; }
    try {
      const q = bookmakers ? `bookmakers=${bookmakers}` : `regions=${regions}`;
      const j = await getJSON(`${BASE}/events/${e.id}/odds?apiKey=${key}&${q}&markets=${markets}&oddsFormat=decimal`);
      if (j.__remaining != null) S.remaining = j.__remaining;
      const used = j.__last ?? cost; spent += used; S.usedToday += used; S.usedMonth = (S.usedMonth || 0) + used;
      st.lines = parseEventOdds(j); st.snaps.push({ at: now.toISOString(), kind }); fetched++;
    } catch (err) { log('  aviso: odds de ' + e.home_team + ' falharam: ' + err.message); }
  }
  // limpa jogos de outros dias e devolve todas as fotos de hoje
  for (const id in S.events) if (S.events[id].date !== date) delete S.events[id];
  const lines = Object.values(S.events).flatMap(x => x.lines || []);
  log(`  The Odds API: ${todays.length} jogos, ${fetched} buscados agora (${spent} créditos)${skipped ? `, ${skipped} adiados pelo orçamento` : ''}, restam ${S.remaining ?? '?'}`);
  return { lines, fetched, credits: spent, remaining: S.remaining, skipped, games: todays.length };
}
