// Fonte principal: arquivos JSON públicos do CDN da NBA (os mesmos que o nba.com usa).
// Documentação dos formatos: https://github.com/swar/nba_api/tree/master/docs/nba_api/live
import { getJSON } from './http.js';

const NBA_HEADERS = { Referer: 'https://www.nba.com/', Origin: 'https://www.nba.com' };
export const URLS = {
  schedule: 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json',
  scoreboard: 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json',
  boxscore: id => `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${id}.json`
};

// "2026-27" → prefixo de ID da temporada regular "00226"
export const seasonPrefix = startYear => '002' + String(startYear).slice(-2);
export const seasonLabel = startYear => `${startYear}-${String(startYear + 1).slice(-2)}`;
export const gameId = (startYear, n) => seasonPrefix(startYear) + String(n).padStart(5, '0');

export function parseMinutes(s) {
  if (typeof s === 'number') return s;
  const m = /PT(\d+)M([\d.]+)S/.exec(s || '');
  return m ? +m[1] + +m[2] / 60 : 0;
}
export function posCode(p) {
  p = String(p || '').toUpperCase();
  if (!p) return null;
  if (p === 'C') return 'C';
  if (p.endsWith('G') || p === 'G') return 'G';
  if (p.endsWith('F') || p === 'F') return 'F';
  return null;
}
const etDate = iso => (iso || '').slice(0, 10);

/* Boxscore → formato compacto do histórico.
   linha: [personId, time, posição(G/F/C|null), titular(1/0), min, pts, reb, oreb, ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta] */
export function parseBoxscore(json) {
  const g = json?.game; if (!g || !g.homeTeam || !g.awayTeam) return null;
  if (g.gameStatus !== 3) return { gid: g.gameId, notFinal: true };
  const rows = [], names = {};
  const team = (T, side) => {
    const st = T.statistics || {};
    const poss = (st.fieldGoalsAttempted || 0) + 0.44 * (st.freeThrowsAttempted || 0) - (st.reboundsOffensive || 0) + (st.turnoversTotal ?? st.turnovers ?? 0);
    for (const pl of T.players || []) {
      const s = pl.statistics || {}; const min = parseMinutes(s.minutes);
      if (!(pl.played === '1' || min > 0)) continue;
      names[pl.personId] = pl.name || `${pl.firstName} ${pl.familyName}`;
      rows.push([pl.personId, T.teamTricode, posCode(pl.position), pl.starter === '1' ? 1 : 0, Math.round(min * 10) / 10,
        s.points || 0, s.reboundsTotal || 0, s.reboundsOffensive || 0, s.assists || 0, s.steals || 0, s.blocks || 0, s.turnovers || 0, s.foulsPersonal || 0,
        s.fieldGoalsMade || 0, s.fieldGoalsAttempted || 0, s.threePointersMade || 0, s.threePointersAttempted || 0, s.freeThrowsMade || 0, s.freeThrowsAttempted || 0]);
    }
    return { poss, min: parseMinutes(st.minutes) };
  };
  const h = team(g.homeTeam), a = team(g.awayTeam);
  const gmin = (h.min || 240) / 5;
  return { gid: g.gameId, d: etDate(g.gameEt || g.gameTimeLocal || g.gameTimeUTC), h: g.homeTeam.teamTricode, a: g.awayTeam.teamTricode,
    hs: g.homeTeam.score, as: g.awayTeam.score, gm: Math.round(gmin * 10) / 10, ph: Math.round(h.poss * 10) / 10, pa: Math.round(a.poss * 10) / 10, r: rows, names };
}

export async function fetchBoxscore(id) {
  const j = await getJSON(URLS.boxscore(id), { headers: NBA_HEADERS, quiet404: true });
  if (!j) return { gid: id, missing: true };
  return parseBoxscore(j) || { gid: id, missing: true };
}

/* Calendário da temporada: [{gid, date(ET), utc, home, away, status}] */
export function parseSchedule(json) {
  const out = [];
  for (const d of json?.leagueSchedule?.gameDates || []) {
    for (const g of d.games || []) {
      if (!String(g.gameId).startsWith('002')) continue; // só temporada regular
      out.push({ gid: g.gameId, date: etDate(g.gameDateEst || g.gameDateTimeEst || d.gameDate), utc: g.gameDateTimeUTC || g.gameDateUTC, home: g.homeTeam?.teamTricode, away: g.awayTeam?.teamTricode, status: g.gameStatus });
    }
  }
  return out.filter(g => g.home && g.away);
}
export async function fetchSchedule() { return parseSchedule(await getJSON(URLS.schedule, { headers: NBA_HEADERS })); }

export function parseScoreboard(json) {
  const sb = json?.scoreboard; if (!sb) return [];
  return (sb.games || []).map(g => ({ gid: g.gameId, date: sb.gameDate, utc: g.gameTimeUTC, home: g.homeTeam?.teamTricode, away: g.awayTeam?.teamTricode, status: g.gameStatus }));
}
export async function fetchScoreboard() { return parseScoreboard(await getJSON(URLS.scoreboard, { headers: NBA_HEADERS })); }

/* Quinteto do dia (stats.nba.com): titulares previstos/confirmados e inativos.
   Formato não documentado: o leitor procura objetos com personId + position/lineupStatus.
   Só confia no papel (titular/reserva) de times com exatamente 5 titulares. */
export const lineupsURL = dateISO => `https://stats.nba.com/js/data/leaders/00_daily_lineups_${dateISO.replace(/-/g, '')}.json`;
export function parseLineups(json) {
  const out = {};
  const walk = (o, team) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(x => walk(x, team)); return; }
    const t = o.teamAbbreviation || o.teamTricode || team;
    if (o.personId != null && ('lineupStatus' in o || 'position' in o || 'rosterStatus' in o)) {
      const pos = String(o.position ?? '').trim();
      const st = String(o.lineupStatus ?? '').toLowerCase();
      const inactive = /inactive|out/.test(String(o.rosterStatus ?? '').toLowerCase());
      const nm = o.playerName || [o.firstName, o.lastName].filter(Boolean).join(' ') || null;
      out[String(o.personId)] = { role: pos ? 'starter' : 'bench', confirmed: st.includes('confirm'), team: t || null, ...(nm ? { name: nm } : {}), ...(inactive ? { inactive: true } : {}) };
    }
    for (const k in o) walk(o[k], t);
  };
  walk(json);
  const starters = {};
  for (const id in out) if (out[id].role === 'starter' && !out[id].inactive) starters[out[id].team] = (starters[out[id].team] || 0) + 1;
  for (const id in out) if (starters[out[id].team] !== 5) out[id].role = null;
  return out;
}
export async function fetchLineups(dateISO) {
  const j = await getJSON(lineupsURL(dateISO), { headers: { ...NBA_HEADERS, 'x-nba-stats-origin': 'stats', 'x-nba-stats-token': 'true' }, retries: 1, timeout: 15000, quiet404: true });
  return j ? parseLineups(j) : {};
}
