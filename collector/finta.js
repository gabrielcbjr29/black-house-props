// Finta (finta.win, pedido do usuário em 19/11) — leitura PÚBLICA das props de NBA, sem login e sem chave.
// O próprio site busca estes JSON abertos: /rs/finta/public/lobby (jogos) e /rs/finta/public/match/<id> (mercados).
// A Finta só oferece "mais de" nas props: a linha principal (alt 0) e uma escada de linhas alternativas (alt 1),
// mais o duplo-duplo. Sem under, não dá para tirar a margem; o uso é comparar a odd do over com a nossa chance.
// Sem pressa: um jogo por vez, só NBA nas próximas 36h.
import { getJSON } from './http.js';

const BASE = 'https://finta.win/rs/finta/public';
export const FINTA_MK = { Points: 'PTS', Rebounds: 'REB', Assists: 'AST', 'Threes Made': '3PM', 'Pts & Rebs & Asts': 'PRA', 'Pts & Rebs': 'PR',
  'Pts & Asts': 'PA', 'Rebs & Asts': 'RA', Steals: 'STL', Blocks: 'BLK', 'Double Double': 'DD',
  'Triple Double': 'TD', 'Triple-Double': 'TD' }; // TD (19/11): quando a Finta oferecer, para o /combo
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

/* JSON de um jogo → [{name, team, mk, line, o, alt}] (só over, odd > 1) */
export function parseFintaMatch(m) {
  const out = [];
  for (const p of m?.props ?? []) {
    const mk = FINTA_MK[p.stat]; const o = Array.isArray(p.o) ? +p.o[1] : null;
    if (!mk || !(o > 1) || p.line == null || (Array.isArray(p.o) && p.o[2])) continue; // o[2] ≠ 0 = suspenso
    out.push({ name: p.player, team: p.team, mk, line: +p.line, o: Math.round(o * 1000) / 1000, alt: p.alt ? 1 : 0 });
  }
  return out;
}

/* liga os nomes da Finta aos jogadores do slate (nome normalizado) → linhas com pid */
export function matchFinta(rows, players) {
  const byName = new Map(); for (const p of players ?? []) byName.set(norm(p.name), p);
  const res = [], miss = new Set();
  for (const r of rows) { const p = byName.get(norm(r.name)); if (!p) { miss.add(r.name); continue; } res.push({ ...r, pid: String(p.id), team: p.team }); }
  return { lines: res, miss: [...miss] };
}

export async function fetchFinta({ players, hours = 36, log = console.log } = {}) {
  const lob = await getJSON(BASE + '/lobby?hours=360', { timeout: 25000, retries: 2 });
  const now = Date.now();
  const games = (lob?.games ?? []).filter(g => /\bNBA\b/.test(g.league ?? '') && /basket/i.test(g.sport ?? '') && !g.locked
    && Date.parse(g.starts_at) > now && Date.parse(g.starts_at) < now + hours * 36e5)
    .map(g => ({ id: g.id, home: g.home, away: g.away, start: g.starts_at }));
  const rows = [], errs = [];
  for (const g of games) {
    try { const m = await getJSON(BASE + '/match/' + encodeURIComponent(g.id), { timeout: 20000, retries: 1 }); for (const r of parseFintaMatch(m)) rows.push({ ...r, game: g.id }); }
    catch (e) { errs.push(g.id + ': ' + e.message); }
    await new Promise(r => setTimeout(r, 700));
  }
  const { lines, miss } = matchFinta(rows, players);
  log(`  Finta: ${games.length} jogos, ${rows.length} linhas over (${lines.filter(l => !l.alt).length} principais), ${miss.length} jogadores sem par${errs.length ? ', erros: ' + errs.join('; ') : ''}`);
  return { gen: new Date().toISOString(), games, lines, miss, errs };
}
