#!/usr/bin/env node
// Coletor do Garrafão Props.
// Uso: node collector/build.js [--date AAAA-MM-DD] [--no-prev] [--no-backtest]
// Variáveis: ODDS_API_KEY, ODDS_MARKETS, ODDS_REGIONS, CONCURRENCY
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './http.js';
import { fetchBoxscore, fetchSchedule, fetchScoreboard, fetchLineups, gameId, seasonLabel } from './nba.js';
import { fetchOfficialInjuries } from './injuryreport.js';
import { fetchInjuries, fetchGameOdds } from './espn.js';
import { fetchLines } from './oddsapi.js';
import { fetchSGO } from './sgo.js';
import { fetchKalshi, DEFAULT_SERIES } from './kalshi.js';
import { MODES, DEFAULT_BOOKS, loadState, saveState, mergeLines } from './oddsplan.js';
import { USAGE } from './http.js';
import { dailySummary, sendTelegram, radarAlerts } from './notify.js';
import { buildSlate, buildResults } from './slate.js';
import { runBacktest } from './backtest.js';
import { fetchBDLGames } from './bdl.js';
import { fetchESPNDay, fetchESPNSummary } from './espnbox.js';
import { normName } from './http.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// lê o arquivo .env (se existir) sem dependências
try { for (const ln of (await readFile(join(ROOT, '.env'), 'utf8')).split(/\r?\n/)) { const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(ln); if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch { }
const HIST = join(ROOT, 'data', 'history');
const OUT = join(ROOT, 'public', 'data', 'slate.json');
const RESULTS = join(ROOT, 'public', 'data', 'results.json');
const STATE = join(ROOT, 'data', 'odds-state.json');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = k => args.includes(k);
const log = (...a) => console.log(...a);
const CONC = +(process.env.CONCURRENCY || 6);

const todayET = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function loadHist(label) {
  const f = join(HIST, label + '.json');
  if (!existsSync(f)) return { season: label, games: {}, names: {}, missing: [] };
  const h = JSON.parse(await readFile(f, 'utf8'));
  // um bloqueio (403) marcava todos os jogos como inexistentes; sem nenhum jogo salvo, tenta tudo de novo
  if (!Object.keys(h.games || {}).length) h.missing = [];
  return h;
}
async function saveHist(h) { await mkdir(HIST, { recursive: true }); await writeFile(join(HIST, h.season + '.json'), JSON.stringify(h)); }

async function fill(h, ids, what) {
  const todo = ids.filter(id => !h.games[id] && !h.missing.includes(id));
  if (!todo.length) { log(`  ${what}: nada novo`); return 0; }
  log(`  ${what}: baixando ${todo.length} boxscores…`);
  let last = 0, got = 0;
  const res = await pool(todo, CONC, fetchBoxscore, (d, n) => { if (d - last >= 100 || d === n) { last = d; log(`    ${d}/${n}`); } });
  for (const r of res) {
    if (!r || r.__error) continue;
    if (r.missing) { h.missing.push(r.gid); continue; }
    if (r.notFinal) continue;
    const { names, ...g } = r; h.games[g.gid] = g; Object.assign(h.names, names); got++;
  }
  const errs = res.filter(r => r?.__error).length;
  if (errs) log(`    aviso: ${errs} boxscores falharam (tentaremos de novo na próxima execução)`);
  return got;
}

/* Histórico pela ESPN: calendário da temporada → dias → jogos encerrados da temporada regular → boxscores.
   Dias já completos ficam guardados em h.days para não serem pedidos de novo. */
async function espnSeason(label, anchor, from, before) {
  const h = await loadHist('espn-' + label); h.days ||= {}; h.missing ||= [];
  const first = await fetchESPNDay(anchor);
  const cal = [...new Set(first.calendar)].filter(d => d >= from && d < before).sort();
  const need = cal.filter(d => !h.days[d]);
  if (need.length) log(`  ESPN ${label}: lendo ${need.length} dias do calendário…`);
  const days = await pool(need, CONC, d => fetchESPNDay(d).then(x => ({ d, x })));
  for (const r of days) {
    if (!r || r.__error || !r.x) continue;
    const reg = r.x.games.filter(g => g.type === 2 || g.type == null);
    if (reg.every(g => g.status === 3)) h.days[r.d] = reg.map(g => g.eid);
  }
  const todo = [];
  for (const d of cal) for (const eid of h.days[d] || []) if (!h.games['e' + eid] && !h.missing.includes('e' + eid)) todo.push({ eid, d });
  if (todo.length) {
    log(`  ESPN ${label}: baixando ${todo.length} boxscores…`);
    let last = 0;
    const res = await pool(todo, CONC, t => fetchESPNSummary(t.eid, t.d), (d, n) => { if (d - last >= 100 || d === n) { last = d; log(`    ${d}/${n}`); } });
    let errs = 0;
    for (const r of res) {
      if (!r || r.__error) { errs++; continue; }
      if (r.missing) { h.missing.push(r.gid); continue; }
      if (r.notFinal) continue;
      const { names, ...g } = r; h.games[g.gid] = g; Object.assign(h.names, names);
    }
    if (errs) log(`    aviso: ${errs} boxscores da ESPN falharam (tentaremos de novo na próxima execução)`);
  }
  h.season = 'espn-' + label;
  await saveHist(h);
  return h;
}

async function main() {
  const date = arg('--date', todayET());
  const startYear = +date.slice(0, 4) - (+date.slice(5, 7) < 8 ? 1 : 0);
  const curL = seasonLabel(startYear), prevL = seasonLabel(startYear - 1);
  const sources = {}, warnings = [];
  log(`Garrafão Props · coleta para ${date} (temporada ${curL})`);

  // 1. calendário
  let schedule = [];
  try { schedule = await fetchSchedule(); sources.schedule = 'cdn.nba.com'; log(`  calendário: ${schedule.length} jogos`); }
  catch (e) { warnings.push('Calendário da NBA indisponível: ' + e.message); log('  aviso: calendário indisponível'); }

  // 2. histórico (NBA; se o calendário da NBA estiver bloqueado, tudo vem da ESPN)
  const useESPN = !schedule.length;
  let prev = await loadHist(prevL), cur = await loadHist(curL);
  let espnToday = null;
  if (useESPN) {
    log('  NBA indisponível: usando a ESPN para calendário e boxscores');
    try {
      cur = await espnSeason(curL, date, `${startYear}-08-01`, date);
      prev = flag('--no-prev') ? { games: {}, names: {} } : await espnSeason(prevL, `${startYear}-02-01`, process.env.PREV_FROM || `${startYear}-01-20`, `${startYear}-07-01`);
      espnToday = await fetchESPNDay(date);
      sources.schedule = 'ESPN (reserva)';
      sources.boxscores = `ESPN · ${Object.keys(cur.games).length} jogos ${curL} + ${Object.keys(prev.games).length} jogos ${prevL}`;
    } catch (e) { warnings.push('ESPN (reserva) falhou: ' + e.message); }
  }
  if (!useESPN && !flag('--no-prev')) {
    const n = +(process.env.PREV_GAMES || 1230);
    await fill(prev, Array.from({ length: n }, (_, i) => gameId(startYear - 1, i + 1)), `temporada ${prevL}`);
    await saveHist(prev);
  }
  let curIds = schedule.filter(g => g.gid.startsWith('002' + String(startYear).slice(-2)) && g.date < date && g.status === 3).map(g => g.gid);
  if (!schedule.length && !useESPN) {
    // sem calendário: testa IDs em sequência até achar vários seguidos inexistentes
    curIds = []; let miss = 0;
    for (let i = 1; i <= 1230 && miss < 12; i++) { const id = gameId(startYear, i); if (cur.games[id]) { curIds.push(id); miss = 0; continue; } const r = await fetchBoxscore(id).catch(() => null); if (r && !r.missing && !r.notFinal) { const { names, ...g } = r; cur.games[id] = g; Object.assign(cur.names, names); curIds.push(id); miss = 0; } else miss++; }
  }
  if (!useESPN) {
    await fill(cur, curIds, `temporada ${curL}`);
    await saveHist(cur);
    sources.boxscores = `cdn.nba.com · ${Object.keys(cur.games).length} jogos ${curL} + ${Object.keys(prev.games).length} jogos ${prevL}`;
  }

  // 3. jogos de hoje e back-to-back
  let today = schedule.filter(g => g.date === date);
  if (!today.length && espnToday) today = espnToday.games.filter(g => g.type === 2 || g.type == null).map(({ eid, type, ...g }) => g);
  if (!today.length && !useESPN) {
    try { const sb = await fetchScoreboard(); if (sb.length && sb[0].date === date) today = sb; } catch (e) { warnings.push('Placar do dia indisponível: ' + e.message); }
  }
  const y = addDays(date, -1);
  // reserva: BALLDONTLIE (chave grátis) quando a NBA não entregou o calendário do dia
  let bdlY = [];
  if (!today.length && process.env.BDL_API_KEY) {
    try { const g = await fetchBDLGames({ key: process.env.BDL_API_KEY, dates: [y, date], log }); today = g.filter(x => x.date === date); bdlY = g.filter(x => x.date === y); if (today.length) sources.schedule = 'BALLDONTLIE (reserva)'; }
    catch (e) { warnings.push('BALLDONTLIE falhou: ' + e.message); }
  }
  log(`  jogos em ${date}: ${today.length}`);
  const yTeams = new Set([...schedule.filter(g => g.date === y), ...bdlY, ...Object.values(cur.games).filter(g => g.d === y).map(g => ({ home: g.h, away: g.a }))].flatMap(g => [g.home, g.away]));

  // 4. lesões e linhas do jogo (ESPN)
  let injuries = {}, gameOdds = {};
  try { injuries = await fetchInjuries(); sources.injuries = 'ESPN'; log(`  lesões: ${Object.keys(injuries).length} jogadores listados`); }
  catch (e) { warnings.push('Lesões indisponíveis (ESPN): ' + e.message); }
  try { gameOdds = await fetchGameOdds(date); sources.gameLines = 'ESPN'; log(`  handicap/total: ${Object.keys(gameOdds).length} jogos`); }
  catch (e) { warnings.push('Handicap/total indisponíveis (ESPN): ' + e.message); }
  // relatório oficial da NBA (PDF) — sobrepõe a ESPN quando existe
  const state = await loadState(STATE);
  if (process.env.OFFICIAL_INJURIES !== '0') {
    // só procura relatórios MAIS NOVOS que o último lido; se não houver, reaproveita o guardado
    const IS = state.injury?.date === date ? state.injury : null;
    try {
      const r = await fetchOfficialInjuries({ log, after: IS?.report || null });
      if (r) state.injury = { date, report: r.report, injuries: r.injuries };
    } catch (e) { if (!IS) warnings.push('Relatório oficial de lesões indisponível (segue ESPN): ' + e.message); }
    const use = state.injury?.date === date ? state.injury : null;
    if (use) {
      let n = 0; for (const [k, v] of Object.entries(use.injuries)) { injuries[k] = { ...injuries[k], ...v }; n++; }
      sources.injuries = (sources.injuries ? sources.injuries + ' + ' : '') + `NBA oficial (${use.report.replace('_', ' ')}, ${n} jogadores)`;
    }
  }
  // quinteto previsto/confirmado e inativos (stats.nba.com)
  let lineups = {};
  try { lineups = await fetchLineups(date); const n = Object.values(lineups).filter(x => x.role === 'starter').length; if (n) { sources.lineups = `stats.nba.com (${n} titulares, ${Object.values(lineups).filter(x => x.confirmed).length} confirmados)`; log(`  quintetos: ${n} titulares`); } }
  catch (e) { warnings.push('Quintetos do dia indisponíveis (stats.nba.com): ' + e.message); }

  // 5. odds de props: vários provedores, cada um só quando vale a pena (ver oddsplan.js)
  const env = process.env, teams = new Set(today.flatMap(g => [g.home, g.away]));
  const mode = MODES[env.ODDS_MODE] || MODES.padrao, closeWindow = +(env.ODDS_CLOSE_WINDOW || 150);
  const tips = today.map(g => Date.parse(g.utc)).filter(Boolean), now = Date.now();
  const nearTip = tips.some(t => t - now > 5 * 6e4 && t - now <= closeWindow * 6e4);
  const lists = [], used = {}; let kalshi = [];
  if (today.length && env.ODDS_API_KEY) {
    try {
      const r = await fetchLines({ key: env.ODDS_API_KEY, date, teams, markets: env.ODDS_MARKETS || mode.markets, regions: env.ODDS_REGIONS || 'us',
        bookmakers: env.ODDS_BOOKMAKERS === 'none' ? null : (env.ODDS_BOOKMAKERS || DEFAULT_BOOKS), state, wantOpen: mode.open, wantClose: mode.close, closeWindow,
        monthlyBudget: env.ODDS_MONTHLY_BUDGET ? +env.ODDS_MONTHLY_BUDGET : null, log });
      lists.push(r.lines); used.oddsapi = { credits: r.credits, remaining: r.remaining, fetched: r.fetched, skipped: r.skipped, mode: mode.label };
    } catch (e) { warnings.push('The Odds API falhou: ' + e.message); }
  }
  if (today.length && env.SGO_API_KEY) {
    // 1 chamada traz o dia inteiro; no máximo SGO_MAX_DAILY por dia e dentro do limite mensal de objetos
    const S = state.providers.sgo ||= {};
    if (S.day !== date) Object.assign(S, { day: date, calls: 0, lines: [], lastAt: null });
    if (S.month !== date.slice(0, 7)) Object.assign(S, { month: date.slice(0, 7), objects: 0 });
    const due = !S.calls || (nearTip && Date.now() - Date.parse(S.lastAt || 0) > 50 * 6e4);
    const room = (S.objects || 0) + today.length <= +(env.SGO_MONTHLY_OBJECTS || 2500);
    if (due && room && S.calls < +(env.SGO_MAX_DAILY || 4)) {
      try { const r = await fetchSGO({ key: env.SGO_API_KEY, date, log }); S.lines = r.lines; S.calls++; S.objects += r.objects; S.lastAt = new Date().toISOString(); }
      catch (e) { warnings.push('SportsGameOdds falhou: ' + e.message); }
    }
    lists.push(S.lines || []); used.sgo = { calls: S.calls, objectsMonth: S.objects };
  }
  if (useESPN && Object.keys(lineups).length) {
    const byName = {}; for (const v of Object.values(lineups)) if (v.name) byName[normName(v.name)] = v;
    const all = { ...prev.names, ...cur.names }, re = {};
    for (const [pid, nm] of Object.entries(all)) { const v = byName[normName(nm)]; if (v) re[pid] = v; }
    lineups = re;
  }
  if (today.length && env.KALSHI !== '0') {
    try { kalshi = await fetchKalshi({ series: env.KALSHI_SERIES || DEFAULT_SERIES, log }); } catch (e) { warnings.push('Kalshi falhou: ' + e.message); }
  }
  const oddsLines = mergeLines(lists, kalshi);
  const srcs = [env.ODDS_API_KEY && 'The Odds API', env.SGO_API_KEY && 'SportsGameOdds', kalshi.length && 'Kalshi'].filter(Boolean);
  sources.odds = oddsLines.length ? `${srcs.join(' + ')} (${oddsLines.length} linhas)` : srcs.length ? `${srcs.join(' + ')}: nenhuma linha ainda` : 'sem fonte de odds: linhas de referência e linha digitada por você';
  await saveState(STATE, state);

  // 6. slate (a coleta anterior do mesmo dia guarda a linha de abertura)
  let prevSlate = null; try { prevSlate = JSON.parse(await readFile(OUT, 'utf8')); } catch { }
  const slate = buildSlate({ date, season: curL, cur: Object.values(cur.games), prev: Object.values(prev.games), today, b2b: yTeams, injuries, gameOdds, oddsLines, lineups, prevSlate,
    names: { ...prev.names, ...cur.names }, sources, warnings });
  // backtest 1x por dia → calibração automática das chances por mercado
  const BT = join(ROOT, 'public', 'data', 'backtest.json');
  let bt = null; try { bt = JSON.parse(await readFile(BT, 'utf8')); } catch { }
  if ((!bt || bt.demo || Date.now() - Date.parse(bt.generatedAt) > 20 * 36e5) && !flag('--no-backtest')) {
    try {
      log('  backtest de calibração…');
      bt = runBacktest({ cur: Object.values(cur.games), prev: Object.values(prev.games), names: { ...prev.names, ...cur.names }, days: +(process.env.BACKTEST_DAYS || 30) });
      await mkdir(dirname(BT), { recursive: true }); await writeFile(BT, JSON.stringify(bt));
      log(`  backtest: ${bt.total} linhas, acerto ${(bt.all?.real * 100).toFixed(1)}% vs previsto ${(bt.all?.pred * 100).toFixed(1)}%`);
    } catch (e) { warnings.push('Backtest falhou: ' + e.message); }
  }
  slate.meta.usage = { requests: { ...USAGE }, odds: used };
  if (bt && !bt.demo && bt.calib) { slate.calib = bt.calib; slate.meta.sources.calib = `backtest ${bt.from} → ${bt.to} (${bt.total} linhas)`; }
  if (!today.length && !sources.schedule) {
    log('Sem calendário de nenhuma fonte: mantendo os dados anteriores do site.');
    for (const w of warnings) log('  aviso: ' + w);
    await saveState(STATE, state);
    return;
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(slate));
  // 7. resultados dos últimos dias: o app usa para liquidar as tips registradas (green/red/devolvida)
  await writeFile(RESULTS, JSON.stringify(buildResults([...Object.values(cur.games), ...Object.values(prev.games)], { ...prev.names, ...cur.names }, date)));
  // resumo no Telegram, 1x por dia, no horário de NOTIFY_UTC_HOURS (padrão 21 UTC = 18h de Brasília)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && state.notify?.day !== date && (env.NOTIFY_UTC_HOURS || '21').split(',').map(Number).includes(new Date().getUTCHours())) {
    try { const text = dailySummary(slate, { appUrl: env.APP_URL || '' }); if (text) { await sendTelegram({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, text }); state.notify = { day: date }; await saveState(STATE, state); log('  resumo enviado no Telegram'); } }
    catch (e) { warnings.push('Telegram falhou: ' + e.message); }
  }
  // radar de divergência no Telegram a cada coleta (RADAR_MIN = 0.04 por padrão; RADAR_MIN=off desliga), sem repetir alerta no dia
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && env.RADAR_MIN !== 'off') {
    try {
      if (state.radar?.day !== date) state.radar = { day: date, sent: [] };
      const r = radarAlerts(slate, { min: +(env.RADAR_MIN || .04), sent: state.radar.sent });
      if (r) { await sendTelegram({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, text: r.text }); state.radar.sent.push(...r.keys); await saveState(STATE, state); log(`  radar: ${r.keys.length} alertas no Telegram`); }
    } catch (e) { warnings.push('Radar no Telegram falhou: ' + e.message); }
  }
  log(`Pronto: ${slate.games.length} jogos, ${slate.players.length} jogadores, ${slate.lines.length} linhas de casas → public/data/slate.json`);
  if (warnings.length) log('Avisos:\n - ' + warnings.join('\n - '));
}
main().catch(e => { console.error('Falhou:', e); process.exit(1); });
