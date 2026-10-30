// Reserva da ESPN para calendário e boxscores, usada quando o CDN da NBA bloqueia o servidor
// (o cdn.nba.com responde 403 para os servidores do GitHub Actions).
// Scoreboard: https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=AAAAMMDD
// Boxscore:   https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=ID
// Os IDs de jogador são os da ESPN (não se misturam com os da NBA: o coletor usa uma fonte ou a outra).
import { getJSON } from './http.js';
import { posCode } from './nba.js';

const B = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const FIX = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' };
export const espnAbbr = t => FIX[t] || t;
const ymd = d => d.replace(/-/g, '');

/* scoreboard de um dia (data do leste dos EUA) → jogos + calendário da temporada */
export function parseESPNDay(j, dateET) {
  const games = (j?.events || []).map(e => {
    const c = e.competitions?.[0]; const h = c?.competitors?.find(x => x.homeAway === 'home'), a = c?.competitors?.find(x => x.homeAway === 'away');
    const st = e.status?.type || c?.status?.type || {};
    return { gid: 'e' + e.id, eid: String(e.id), date: dateET, utc: e.date, home: espnAbbr(h?.team?.abbreviation), away: espnAbbr(a?.team?.abbreviation),
      status: st.completed ? 3 : st.state === 'in' ? 2 : 1, type: e.season?.type ?? null };
  }).filter(g => g.home && g.away);
  const calendar = (j?.leagues?.[0]?.calendar || []).map(x => String(typeof x === 'string' ? x : x?.startDate || '').slice(0, 10)).filter(Boolean);
  return { games, calendar };
}
export async function fetchESPNDay(dateET) {
  return parseESPNDay(await getJSON(`${B}/scoreboard?dates=${ymd(dateET)}&limit=100`, { retries: 2 }), dateET);
}

/* resumo do jogo → mesmo formato compacto do histórico da NBA
   linha: [id, time, posição, titular, min, pts, reb, oreb, ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta] */
export function parseESPNSummary(j, dateET) {
  const box = j?.boxscore, comp = j?.header?.competitions?.[0];
  if (!box || !comp) return null;
  if (!comp.status?.type?.completed) return { notFinal: true };
  const home = comp.competitors?.find(x => x.homeAway === 'home'), away = comp.competitors?.find(x => x.homeAway === 'away');
  if (!home || !away) return null;
  const H = espnAbbr(home.team?.abbreviation), A = espnAbbr(away.team?.abbreviation);
  const rows = [], names = {}, minBy = {};
  for (const P of box.players || []) {
    const T = espnAbbr(P.team?.abbreviation); const st = P.statistics?.[0]; if (!st) continue;
    const k = st.keys || [];
    for (const a of st.athletes || []) {
      if (a.didNotPlay || !a.stats?.length) continue;
      const v = n => { const i = k.indexOf(n); return i < 0 ? null : a.stats[i]; };
      const min = parseFloat(v('minutes')) || 0; if (!(min > 0)) continue;
      const pair = n => { const s = String(v(n) ?? '0-0').split('-'); return [+s[0] || 0, +s[1] || 0]; };
      const n = x => +v(x) || 0;
      const [fgm, fga] = pair('fieldGoalsMade-fieldGoalsAttempted'), [tpm, tpa] = pair('threePointFieldGoalsMade-threePointFieldGoalsAttempted'), [ftm, fta] = pair('freeThrowsMade-freeThrowsAttempted');
      const pid = +a.athlete?.id; if (!pid) continue;
      names[pid] = a.athlete.displayName || a.athlete.fullName || String(pid);
      minBy[T] = (minBy[T] || 0) + min;
      rows.push([pid, T, posCode(a.athlete.position?.abbreviation), a.starter ? 1 : 0, Math.round(min * 10) / 10,
        n('points'), n('rebounds'), n('offensiveRebounds'), n('assists'), n('steals'), n('blocks'), n('turnovers'), n('fouls'), fgm, fga, tpm, tpa, ftm, fta]);
    }
  }
  const poss = abbr => {
    const t = (box.teams || []).find(x => espnAbbr(x.team?.abbreviation) === abbr); if (!t) return 0;
    const s = name => (t.statistics || []).find(x => x.name === name)?.displayValue;
    const pr = name => String(s(name) || '0-0').split('-').map(Number);
    const [, fga] = pr('fieldGoalsMade-fieldGoalsAttempted'), [, fta] = pr('freeThrowsMade-freeThrowsAttempted');
    return (fga || 0) + .44 * (fta || 0) - (+s('offensiveRebounds') || 0) + (+(s('totalTurnovers') ?? s('turnovers')) || 0);
  };
  return { gid: 'e' + comp.id, d: dateET, h: H, a: A, hs: +home.score || 0, as: +away.score || 0, gm: Math.round(((minBy[H] || 240) / 5) * 10) / 10,
    ph: Math.round(poss(H) * 10) / 10, pa: Math.round(poss(A) * 10) / 10, r: rows, names };
}
export async function fetchESPNSummary(eid, dateET) {
  const j = await getJSON(`${B}/summary?event=${eid}`, { retries: 2, quiet404: true });
  if (!j) return { gid: 'e' + eid, missing: true };
  return parseESPNSummary(j, dateET) || { gid: 'e' + eid, missing: true };
}
