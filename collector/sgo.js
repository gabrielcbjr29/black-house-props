// SportsGameOdds (https://sportsgameodds.com) — opcional, precisa de SGO_API_KEY.
// Plano grátis "Amateur": 2.500 objetos/mês, 10 req/min, props de jogadores, dados a cada 10 min.
// Uma chamada traz todos os jogos do dia com as props de todas as casas do plano.
// Formato (docs v2): Event.odds[oddID].byBookmaker[casa] = { odds: "-110", overUnder: "24.5", available }
// oddID = {statID}-{playerID}-{periodID}-{betTypeID}-{sideID}, ex.: points-JALEN_DUREN_1_NBA-game-ou-over
import { getJSON } from './http.js';

const BASE = 'https://api.sportsgameodds.com/v2';
const STAT = { points: 'PTS', rebounds: 'REB', assists: 'AST', threePointersMade: '3PM', 'points+rebounds+assists': 'PRA', 'points+rebounds': 'PR', 'points+assists': 'PA', 'rebounds+assists': 'RA', steals: 'STL', blocks: 'BLK', turnovers: 'TOV', 'blocks+steals': 'SB', 'steals+blocks': 'SB' };
const BOOK = { draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', caesars: 'Caesars', espnbet: 'ESPN BET', fanatics: 'Fanatics', betrivers: 'BetRivers', pinnacle: 'Pinnacle', bovada: 'Bovada', bet365: 'Bet365', betonline: 'BetOnline', hardrockbet: 'Hard Rock', prizepicks: 'PrizePicks', underdog: 'Underdog' };

// sites de "pick'em" (pagamento fixo) não têm odd de verdade: ficam fora do consenso
const DFS = new Set(['prizepicks', 'underdog', 'sleeper', 'dabble', 'pick6', 'betr', 'parlayplay']);
export const americanToDecimal = a => { const n = parseFloat(String(a).replace('+', '')); if (!isFinite(n) || n === 0) return null; return +(n > 0 ? 1 + n / 100 : 1 + 100 / -n).toFixed(3); };
// nome a partir do ID quando o evento não traz o mapa de jogadores: JALEN_DUREN_1_NBA → Jalen Duren
export const nameFromID = id => String(id).replace(/(_\d+)?_(NBA|WNBA)$/, '').split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');

/* eventos → [{name, mk, line, books}] (todas as linhas; o merge escolhe a com mais casas) */
export function parseSGOEvents(events) {
  const acc = {};
  for (const ev of events || []) {
    const players = ev.players || {};
    for (const [oddID, odd] of Object.entries(ev.odds || {})) {
      const m = /^(.+)-([A-Z0-9_]+)-game-ou-(over|under)$/.exec(oddID); if (!m) continue;
      const mk = STAT[m[1]]; if (!mk) continue;
      const pid = m[2]; if (pid === 'all' || pid === 'home' || pid === 'away') continue;
      const p = players[pid] || {};
      const name = p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || nameFromID(pid);
      for (const [bk, x] of Object.entries(odd.byBookmaker || {})) {
        if (x?.available === false || DFS.has(bk)) continue;
        const line = parseFloat(x.overUnder ?? odd.bookOverUnder); const dec = americanToDecimal(x.odds);
        if (!isFinite(line) || !dec) continue;
        const g = (acc[pid + '|' + mk + '|' + line] ||= { name, mk, line, books: {} });
        (g.books[BOOK[bk] || bk.charAt(0).toUpperCase() + bk.slice(1)] ||= {})[m[3] === 'over' ? 'o' : 'u'] = dec;
      }
    }
  }
  return Object.values(acc).map(l => ({ ...l, books: Object.fromEntries(Object.entries(l.books).filter(([, b]) => b.o && b.u)) })).filter(l => Object.keys(l.books).length);
}

export async function fetchSGO({ key, date, log = console.log }) {
  const startsAfter = new Date(Date.parse(date + 'T12:00:00Z')).toISOString();
  const startsBefore = new Date(Date.parse(date + 'T12:00:00Z') + 30 * 36e5).toISOString();
  const all = []; let cursor = null, pages = 0;
  do {
    const u = `${BASE}/events?leagueID=NBA&oddsAvailable=true&startsAfter=${encodeURIComponent(startsAfter)}&startsBefore=${encodeURIComponent(startsBefore)}&limit=50${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
    const j = await getJSON(u, { headers: { 'x-api-key': key }, retries: 1 });
    if (j?.success === false) throw new Error(j.error || 'erro da SportsGameOdds');
    all.push(...(j?.data || [])); cursor = j?.nextCursor; pages++;
  } while (cursor && pages < 4);
  const lines = parseSGOEvents(all);
  log(`  SportsGameOdds: ${all.length} jogos, ${lines.length} linhas`);
  return { lines, objects: Math.max(1, all.length), events: all.length };
}
