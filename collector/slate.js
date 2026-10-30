// Monta o "slate" do dia a partir do histórico de boxscores. Função pura (testável).
import { normName } from './http.js';
import { TEAM_INFO } from '../public/engine.js';

const STAT_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta'];
// índice das estatísticas dentro da linha compacta do boxscore
const RI = { pid: 0, team: 1, pos: 2, starter: 3, min: 4, pts: 5, reb: 6, oreb: 7, ast: 8, stl: 9, blk: 10, tov: 11, pf: 12, fgm: 13, fga: 14, tpm: 15, tpa: 16, ftm: 17, fta: 18 };

function inferPos(rows) {
  const starts = {};
  for (const r of rows) if (r[RI.pos]) starts[r[RI.pos]] = (starts[r[RI.pos]] || 0) + 1;
  const best = Object.entries(starts).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  const min = rows.reduce((a, r) => a + r[RI.min], 0) || 1;
  const per36 = k => rows.reduce((a, r) => a + r[RI[k]], 0) / min * 36;
  if (per36('ast') >= 5 && per36('reb') < 7.5) return 'G';
  if (per36('reb') >= 10 && per36('tpa') < 3) return 'C';
  if (per36('ast') >= 4 && per36('reb') < 5.5) return 'G';
  return 'F';
}

/**
 * @param {object} o
 * @param {object[]} o.cur   jogos da temporada atual (formato de parseBoxscore), qualquer ordem
 * @param {object[]} o.prev  jogos da temporada anterior
 * @param {object[]} o.today jogos de hoje [{gid, utc, home, away}]
 * @param {Set<string>} o.b2b times que jogaram ontem
 * @param {object} o.injuries nomeNormalizado → {status, note}
 * @param {object} o.gameOdds "AWY@HOM" → {spread, total}
 * @param {object[]} o.oddsLines [{name, mk, line, books}]
 */
export function buildSlate({ date, season, cur = [], prev = [], today = [], b2b = new Set(), injuries = {}, gameOdds = {}, oddsLines = [], names = {}, lineups = {}, prevSlate = null, sources = {}, warnings = [] }) {
  const games = [...cur.map(g => ({ ...g, cur: 1 })), ...prev.map(g => ({ ...g, cur: 0 }))].filter(g => g && g.r && g.d < date).sort((a, b) => b.d < a.d ? -1 : b.d > a.d ? 1 : 0);
  const todayTeams = new Set(today.flatMap(g => [g.home, g.away]));

  // --- registros por jogador (mais recente primeiro)
  const byPlayer = new Map();
  for (const g of games) for (const r of g.r) {
    const opp = r[RI.team] === g.h ? g.a : g.h;
    if (!byPlayer.has(r[RI.pid])) byPlayer.set(r[RI.pid], { rows: [], logs: [] });
    const P = byPlayer.get(r[RI.pid]);
    P.rows.push(r);
    if (P.logs.length < 30) P.logs.push([g.d, opp, r[RI.team] === g.h ? 1 : 0, r[RI.min], r[RI.pts], r[RI.reb], r[RI.oreb], r[RI.ast], r[RI.stl], r[RI.blk], r[RI.tov], r[RI.pf], r[RI.fgm], r[RI.fga], r[RI.tpm], r[RI.tpa], r[RI.ftm], r[RI.fta], g.cur, r[RI.starter], g.gid]);
  }
  const teamHasCur = new Set(cur.flatMap(g => g?.r ? [g.h, g.a] : []));

  const players = [];
  const usedInj = new Set();
  for (const [pid, P] of byPlayer) {
    const team = P.rows[0][RI.team];
    if (!todayTeams.has(team)) continue;
    const lastLog = P.logs[0];
    if (teamHasCur.has(team) && lastLog[18] !== 1) continue; // não jogou nesta temporada por este time
    const recentMin = P.logs.slice(0, 10).reduce((a, l) => a + l[3], 0) / Math.min(10, P.logs.length);
    if (P.logs.length < 3 || recentMin < 10) continue;
    const name = names[pid] || String(pid);
    const inj = injuries[normName(name)];
    if (inj) usedInj.add(normName(name));
    const lu = lineups[String(pid)];
    let status = inj?.status && inj.status !== 'probable' ? inj.status : 'ok', note = inj?.note || '';
    if (lu?.inactive) { status = 'out'; note = note || 'inativo no quinteto da NBA'; }
    players.push({ id: String(pid), name, team, pos: inferPos(P.rows.slice(0, 40)), status, note, ...(inj?.source ? { injSrc: inj.source } : {}), logs: P.logs, ...(lu && lu.role ? { lineup: { role: lu.role, confirmed: lu.confirmed } } : {}) });
  }

  // --- "sem o colega": para cada jogador fora/dúvida, os jogos recentes dos colegas em que ele
  //     estava no elenco (jogou pelo time naquela temporada) mas não entrou em quadra
  const playedIn = new Map(), onTeam = new Map();
  for (const g of games) for (const r of g.r) {
    const pid = String(r[RI.pid]);
    (playedIn.get(pid) || playedIn.set(pid, new Set()).get(pid)).add(String(g.gid));
    (onTeam.get(pid) || onTeam.set(pid, new Set()).get(pid)).add(r[RI.team] + '|' + g.cur);
  }
  const gameById = new Map(games.map(g => [String(g.gid), g]));
  for (const q of players) {
    if (!['out', 'doubtful', 'questionable'].includes(q.status)) continue;
    const qm = q.logs.slice(0, 5).reduce((a, l) => a + l[3], 0) / Math.min(5, q.logs.length);
    if (qm < 15) continue;
    for (const p of players) {
      if (p.team !== q.team || p.id === q.id) continue;
      const gids = [];
      for (const l of p.logs) {
        const g = gameById.get(String(l[20])); if (!g) continue;
        const pTeam = l[2] ? g.h : g.a;
        if (pTeam !== q.team) continue;
        if (!onTeam.get(q.id)?.has(pTeam + '|' + g.cur)) continue;
        if (!playedIn.get(q.id)?.has(String(g.gid))) gids.push(String(g.gid));
      }
      if (gids.length) (p.wo ||= {})[q.id] = gids;
    }
  }

  // --- ritmo e defesa por posição de cada time (temporada atual pesa mais)
  const teams = {};
  for (const t of Object.keys(TEAM_INFO)) teams[t] = { name: TEAM_INFO[t][0], color: TEAM_INFO[t][1], _pace: [], _allow: { G: [], F: [], C: [] }, gp: 0 };
  const posOf = new Map(); for (const [pid, P] of byPlayer) posOf.set(pid, inferPos(P.rows.slice(0, 40)));
  const perTeamGames = {};
  for (const g of games) for (const side of ['h', 'a']) (perTeamGames[g[side]] ||= []).push({ g, side });
  for (const t in teams) {
    const list = (perTeamGames[t] || []);
    const nCur = list.filter(x => x.g.cur).length;
    const wPrev = Math.max(.15, Math.min(1, (20 - nCur) / 20));
    const use = [...list.filter(x => x.g.cur), ...list.filter(x => !x.g.cur).slice(0, 30)];
    for (const { g, side } of use) {
      const w = g.cur ? 1 : wPrev;
      const pace = ((g.ph + g.pa) / 2) * 48 / (g.gm || 48);
      teams[t]._pace.push([pace, w]);
      const oppTeam = side === 'h' ? g.a : g.h;
      const agg = { G: {}, F: {}, C: {} };
      for (const r of g.r) if (r[RI.team] === oppTeam) { const pos = posOf.get(r[RI.pid]) || 'F'; for (const k of STAT_KEYS) agg[pos][k] = (agg[pos][k] || 0) + r[RI[k]]; }
      for (const pos of ['G', 'F', 'C']) teams[t]._allow[pos].push([agg[pos], w]);
    }
    teams[t].gp = nCur;
  }
  const wavg = arr => { const W = arr.reduce((a, [, w]) => a + w, 0); return W ? arr.reduce((a, [v, w]) => a + v * w, 0) / W : null; };
  const league = { allowed: { G: {}, F: {}, C: {} } };
  const paces = [];
  for (const t in teams) {
    const T = teams[t];
    T.pace = T._pace.length ? Math.round(wavg(T._pace) * 10) / 10 : null; if (T.pace) paces.push(T.pace);
    T.allowed = {};
    for (const pos of ['G', 'F', 'C']) {
      T.allowed[pos] = {};
      for (const k of STAT_KEYS) { const v = wavg(T._allow[pos].map(([o, w]) => [o[k] || 0, w])); T.allowed[pos][k] = v == null ? null : Math.round(v * 100) / 100; }
    }
    delete T._pace; delete T._allow;
  }
  for (const pos of ['G', 'F', 'C']) for (const k of STAT_KEYS) {
    const vals = Object.values(teams).map(T => T.allowed[pos][k]).filter(v => v != null);
    league.allowed[pos][k] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100 : null;
  }
  league.pace = paces.length ? Math.round(paces.reduce((a, b) => a + b, 0) / paces.length * 10) / 10 : 100;
  const curTotals = cur.filter(g => g?.r).map(g => g.hs + g.as), prevTotals = prev.filter(g => g?.r).map(g => g.hs + g.as);
  const tot = curTotals.length >= 30 ? curTotals : [...curTotals, ...prevTotals];
  league.avgTotal = tot.length ? Math.round(tot.reduce((a, b) => a + b, 0) / tot.length * 10) / 10 : null;

  // --- jogos de hoje
  const gamesOut = today.map(g => {
    const o = gameOdds[g.away + '@' + g.home] || {};
    const pg = prevSlate?.meta?.date === date ? (prevSlate.games || []).find(x => x.id === g.gid) : null;
    const openSpread = pg ? (pg.openSpread ?? pg.spread) : o.spread ?? null, openTotal = pg ? (pg.openTotal ?? pg.total) : o.total ?? null;
    return { id: g.gid, date, timeUTC: g.utc, home: g.home, away: g.away, spread: o.spread ?? null, total: o.total ?? null, openSpread, openTotal, b2b: [g.home, g.away].filter(t => b2b.has(t)) };
  });

  // --- linhas das casas → id do jogador
  const idByName = new Map(players.map(p => [normName(p.name), p.id]));
  const lines = [];
  let unmatched = 0;
  // linha de abertura: a primeira coleta do dia fica guardada para medir movimento e CLV
  const openOf = {};
  if (prevSlate?.meta?.date === date) for (const l of prevSlate.lines || []) openOf[l.pid + '|' + l.mk] = l.open || { line: l.line, books: l.books, at: prevSlate.meta.generatedAt };
  for (const l of oddsLines) {
    const pid = idByName.get(normName(l.name));
    if (!pid) { unmatched++; continue; }
    const open = openOf[pid + '|' + l.mk];
    lines.push({ pid, mk: l.mk, line: l.line, books: l.books, ...(open ? { open } : {}) });
  }
  // sem odds novas nesta coleta: mantém as da coleta anterior do mesmo dia
  if (!oddsLines.length && prevSlate?.meta?.date === date) { const ids = new Set(players.map(p => p.id)); for (const l of prevSlate.lines || []) if (ids.has(l.pid)) lines.push(l); }
  if (unmatched) warnings.push(`${unmatched} linhas de odds sem jogador correspondente (nome diferente ou fora da rotação)`);

  // lesionados de hoje que não estão na rotação (para mostrar na aba Jogos)
  const injuryList = Object.entries(injuries).filter(([, v]) => v.team && todayTeams.has(v.team)).map(([k, v]) => ({ key: k, ...v }));

  return {
    meta: { version: 2, generatedAt: new Date().toISOString(), date, season, sources, warnings, demo: false },
    league, teams, games: gamesOut, players, lines, injuries: injuryList
  };
}

/* Resultados dos últimos `days` dias com jogo antes de `date`:
   { dates: [...], games: {data: [[gid, casa, fora]]}, stats: {data: {pid: [min, pts, reb, ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta]}} } */
export function buildResults(allGames, names = {}, date, days = 14) {
  const ds = [...new Set(allGames.filter(g => g?.r && g.d < date).map(g => g.d))].sort().slice(-days);
  const keep = new Set(ds), stats = {}, games = {}, nm = {};
  for (const g of allGames) {
    if (!g?.r || !keep.has(g.d)) continue;
    (games[g.d] ||= []).push([g.gid, g.h, g.a]);
    const S = stats[g.d] ||= {};
    for (const r of g.r) { S[r[RI.pid]] = [r[RI.min], r[RI.pts], r[RI.reb], r[RI.ast], r[RI.stl], r[RI.blk], r[RI.tov], r[RI.pf], r[RI.fgm], r[RI.fga], r[RI.tpm], r[RI.tpa], r[RI.ftm], r[RI.fta]]; if (names[r[RI.pid]]) nm[r[RI.pid]] = names[r[RI.pid]]; }
  }
  return { generatedAt: new Date().toISOString(), upTo: date, dates: ds, games, stats, names: nm };
}
