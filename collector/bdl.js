// BALLDONTLIE (https://www.balldontlie.io) — opcional, precisa de BDL_API_KEY (chave grátis em app.balldontlie.io).
// Plano grátis: times, jogadores e jogos (calendário e placar). Estatísticas por jogo e lesões são pagas.
// Uso aqui: RESERVA do calendário do dia e de ontem quando a NBA (cdn.nba.com) não responde ao GitHub.
// Autenticação: cabeçalho Authorization com a chave pura (sem "Bearer").
import { getJSON } from './http.js';

const BASE = 'https://api.balldontlie.io/v1';
// siglas que algumas fontes escrevem diferente das da NBA
const FIX = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', PHO: 'PHX', UTAH: 'UTA', WSH: 'WAS', BRK: 'BKN', CHO: 'CHA' };
const fix = t => FIX[t] || t;

/* resposta de /games → [{gid, date, utc, home, away, status}] no mesmo formato do calendário da NBA
   status: 1 = não começou, 2 = em andamento, 3 = encerrado */
export function parseBDLGames(json) {
  return (json?.data || []).filter(g => g?.home_team?.abbreviation && g?.visitor_team?.abbreviation).map(g => ({
    gid: 'bdl-' + g.id, date: String(g.date).slice(0, 10), utc: g.datetime || null,
    home: fix(g.home_team.abbreviation), away: fix(g.visitor_team.abbreviation),
    status: /final/i.test(g.status || '') ? 3 : (g.period || 0) > 0 ? 2 : 1, src: 'balldontlie'
  }));
}

export async function fetchBDLGames({ key, dates, log = console.log }) {
  const q = dates.map(d => 'dates[]=' + encodeURIComponent(d)).join('&');
  const j = await getJSON(`${BASE}/games?${q}&per_page=100`, { headers: { Authorization: key }, retries: 1 });
  const games = parseBDLGames(j);
  log(`  BALLDONTLIE: ${games.length} jogos em ${dates.join(', ')}`);
  return games;
}
