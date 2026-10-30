// ESPN (API pública não oficial, sem chave): lesões e handicap/total dos jogos.
// Não é documentada: os leitores abaixo são tolerantes e nunca derrubam a coleta.
import { getJSON, normName } from './http.js';

const ESPN_TO_NBA = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', UTH: 'UTA', WSH: 'WAS', PHO: 'PHX', BK: 'BKN', NJ: 'BKN' };
export const nbaAbbr = a => ESPN_TO_NBA[String(a || '').toUpperCase()] || String(a || '').toUpperCase();

const STATUS = s => {
  s = String(s || '').toLowerCase();
  if (s.includes('out') || s.includes('suspen') || s.includes('injured reserve')) return 'out';
  if (s.includes('doubt')) return 'doubtful';
  if (s.includes('question') || s.includes('day-to-day') || s.includes('day to day') || s.includes('game time')) return 'questionable';
  if (s.includes('probable')) return 'probable';
  return null;
};

// Procura em qualquer lugar do JSON itens com {athlete:{displayName}, status}
export function parseInjuries(json) {
  const out = {};
  const walk = (o, team) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(x => walk(x, team)); return; }
    const t = o.athlete?.team?.abbreviation || o.team?.abbreviation || o.abbreviation || team;
    const name = o.athlete?.displayName || o.athlete?.fullName;
    const st = o.status || o.type?.description || o.fantasyStatus?.description;
    if (name && st) {
      const code = STATUS(typeof st === 'string' ? st : st?.description || st?.name);
      if (code) out[normName(name)] = { name, status: code, note: o.shortComment || o.details?.type || (typeof st === 'string' ? st : '') , team: t ? nbaAbbr(t) : null };
    }
    for (const k in o) if (k !== 'athlete') walk(o[k], t);
  };
  walk(json);
  return out;
}
export async function fetchInjuries() {
  return parseInjuries(await getJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries'));
}

// handicap do mandante e total de pontos de cada jogo do dia
export function parseScoreboardOdds(json) {
  const out = {};
  for (const ev of json?.events || []) {
    const c = ev.competitions?.[0]; if (!c) continue;
    const home = nbaAbbr(c.competitors?.find(x => x.homeAway === 'home')?.team?.abbreviation);
    const away = nbaAbbr(c.competitors?.find(x => x.homeAway === 'away')?.team?.abbreviation);
    const o = (c.odds || [])[0]; if (!o || !home) continue;
    let spread = null;
    const m = /^([A-Z]+)\s*([-+]?\d+(\.\d+)?)/.exec(String(o.details || '').toUpperCase());
    if (m) { const fav = nbaAbbr(m[1]); const n = Math.abs(+m[2]); spread = fav === home ? -n : n; }
    else if (/EVEN|PK/.test(String(o.details || '').toUpperCase())) spread = 0;
    else if (typeof o.spread === 'number') spread = o.spread;
    out[away + '@' + home] = { spread, total: typeof o.overUnder === 'number' ? o.overUnder : null, provider: o.provider?.name || null };
  }
  return out;
}
export async function fetchGameOdds(dateISO) {
  const d = dateISO.replace(/-/g, '');
  return parseScoreboardOdds(await getJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}`));
}
