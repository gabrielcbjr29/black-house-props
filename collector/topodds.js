// Odds reais para o teste do Modelo BH (top 10 de tentativas e de reb+ast).
// Depois do Modelo BH rodar, pega os candidatos dos dois tops e busca na The Odds API só os jogos e mercados
// que eles precisam (reb+ast, arremessos convertidos e lances livres tentados: os únicos desses mercados que a
// API tem). Uma busca por jogo por dia, na primeira coleta depois das 17h de Brasília (a que vira o envio
// diário). A linha principal entra no slate com a mediana das casas como odd ("Casas EUA (n)").
// Tentados (total, de 3, de 2) e de 2 convertidos não existem em nenhuma API que usamos.
import { getJSON, normName } from './http.js';
import { MARKETS } from '../public/engine.js';
import { TEAM_BY_NAME, parseEventOdds } from './oddsapi.js';
import { DEFAULT_BOOKS } from './oddsplan.js';
import { buildBotData, topEligible } from './botdata.js';

const BASE = 'https://api.the-odds-api.com/v4/sports/basketball_nba';
export const TOP_LISTS = { tent: ['FGA', '3PA', 'FTA', '2PA', '2PM', 'FGM'], ra: ['RA'] };
const median = a => { const s = a.filter(x => x > 1).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* candidatos dos tops (mesmo filtro do bot), alguns a mais porque a linha real pode mudar a ordem */
export function topCandidates(rows, n = 15) {
  const out = [];
  for (const mk of Object.values(TOP_LISTS)) {
    const seen = new Set(); let k = 0;
    for (const r of rows.filter(r => topEligible(r, mk)).sort((a, b) => b.sc - a.sc)) {
      if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (++k >= n) break;
    }
  }
  return out;
}

/* linhas guardadas da API -> linhas do slate ({pid, mk, line, books}); linha principal = a com mais casas */
export function toSlateLines(stored, players) {
  const byName = new Map(players.map(p => [normName(p.name), p.id]));
  const best = {};
  for (const l of stored) {
    const pid = byName.get(normName(l.name)); if (!pid) continue;
    const books = Object.values(l.books).filter(b => b.o > 1 && b.u > 1);
    if (!books.length) continue;
    const o = median(books.map(b => b.o)), u = median(books.map(b => b.u));
    const cand = { pid, mk: l.mk, line: l.line, n: books.length, o, u, bal: Math.abs(1 / o - 1 / u) };
    const k = pid + '|' + l.mk, cur = best[k];
    if (!cur || cand.n > cur.n || (cand.n === cur.n && cand.bal < cur.bal)) best[k] = cand;
  }
  return Object.values(best).map(c => ({ pid: c.pid, mk: c.mk, line: c.line, books: { [`Casas EUA (${c.n})`]: { o: +c.o.toFixed(3), u: +c.u.toFixed(3) } }, src: 'oddsapi-top' }));
}

/**
 * Busca (se for a hora) e devolve as linhas para os tops. state: data/odds-state.json (providers.tops).
 * Não gasta mais que maxCredits por dia nem deixa a conta abaixo de reserve.
 */
export async function topOdds({ slate, key, state, now = new Date(), minHourBRT = 17, maxCredits = 24, reserve = 15, log = console.log }) {
  const date = slate.meta?.date;
  const T = state.providers.tops ||= {};
  if (T.date !== date) { T.date = date; T.events = {}; T.lines = []; T.credits = 0; }
  const hour = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  if (key && date === today && hour >= minHourBRT) {
    const bot = buildBotData({ ...slate, lines: [...(slate.lines || []), ...toSlateLines(T.lines, slate.players)] }, {});
    const cands = topCandidates(bot.rows).filter(r => MARKETS[r.m]?.odds && ['RA', 'FGM', 'FTA'].includes(r.m));
    const need = {}; // time da casa -> mercados
    for (const r of cands) { const home = r.home ? r.t : r.o; (need[home] ||= new Set()).add(MARKETS[r.m].odds); }
    const pending = Object.keys(need).filter(h => !T.events[h]);
    if (pending.length) {
      const events = await getJSON(`${BASE}/events?apiKey=${key}`); // grátis
      let remaining = events.__remaining ?? state.providers.oddsapi?.remaining ?? null;
      for (const h of pending) {
        const e = (events || []).find(x => TEAM_BY_NAME[String(x.home_team).toLowerCase()] === h && Date.parse(x.commence_time) > now.getTime());
        if (!e) continue; // jogo já começou ou ainda não listado: tenta na próxima coleta
        const markets = [...need[h]].join(','), cost = need[h].size;
        if (T.credits + cost > maxCredits || (remaining != null && remaining - cost < reserve)) { log(`  tops: ${h} adiado pelo orçamento`); continue; }
        try {
          const j = await getJSON(`${BASE}/events/${e.id}/odds?apiKey=${key}&bookmakers=${DEFAULT_BOOKS}&markets=${markets}&oddsFormat=decimal`);
          const used = j.__last ?? cost; T.credits += used; if (j.__remaining != null) remaining = j.__remaining;
          const got = parseEventOdds(j); T.lines.push(...got);
          T.events[h] = { at: now.toISOString(), markets, lines: got.length };
          if (state.providers.oddsapi) { state.providers.oddsapi.remaining = remaining; state.providers.oddsapi.usedMonth = (state.providers.oddsapi.usedMonth || 0) + used; state.providers.oddsapi.usedToday = (state.providers.oddsapi.usedToday || 0) + used; }
        } catch (err) { log(`  tops: odds de ${h} falharam: ${err.message}`); }
      }
      log(`  tops: ${pending.length} jogos pedidos, ${T.credits} créditos hoje, restam ${remaining ?? '?'}`);
    }
  }
  return toSlateLines(T.lines || [], slate.players);
}

/* junta as linhas dos tops no slate sem passar por cima de linha que já existe */
export function mergeTopLines(slate, lines) {
  const have = new Set((slate.lines || []).map(l => l.pid + '|' + l.mk));
  const add = lines.filter(l => !have.has(l.pid + '|' + l.mk));
  slate.lines = [...(slate.lines || []), ...add];
  return add.length;
}
