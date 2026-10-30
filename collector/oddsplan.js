// Plano de requisições de odds: decide QUANDO buscar cada jogo para gastar o mínimo.
// Ideia: cada jogo precisa de no máximo 2 fotos por dia — abertura (de manhã) e fechamento
// (perto do jogo, para o CLV). Entre uma e outra, o app reaproveita a última foto guardada.
// O estado fica em data/odds-state.json (vai junto no repositório, então sobrevive entre coletas).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { normName } from './http.js';

/* Modos prontos (ODDS_MODE). Créditos por jogo na The Odds API = mercados × fotos. */
export const MODES = {
  economico: { markets: 'player_points,player_points_rebounds_assists', open: false, close: true, label: 'econômico: só fechamento, 2 mercados' },
  padrao: { markets: 'player_points,player_rebounds,player_assists,player_threes', open: true, close: true, label: 'padrão: abertura e fechamento, 4 mercados' },
  completo: { markets: 'player_points,player_rebounds,player_assists,player_threes,player_points_rebounds_assists,player_points_rebounds,player_points_assists,player_rebounds_assists', open: true, close: true, label: 'completo: abertura e fechamento, 8 mercados' }
};
// casas pedidas por nome: até 10 casas custam o mesmo que 1 região
export const DEFAULT_BOOKS = 'fanduel,draftkings,betmgm,williamhill_us,betrivers,espnbet,fanatics,betonlineag,lowvig,pinnacle';

export async function loadState(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return { v: 1, events: {}, providers: {}, usage: {} }; }
}
export async function saveState(file, st) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(st)); }

/* Decide que foto tirar de um jogo agora: 'open', 'close' ou null.
   closeWindow: minutos antes do jogo em que vale a foto de fechamento. */
export function snapshotKind({ snaps = [], minutesToTip, wantOpen = true, wantClose = true, closeWindow = 150, minGap = 45 }) {
  if (minutesToTip == null || minutesToTip < 5) return null;           // jogo começou ou sem horário
  const has = k => snaps.some(s => s.kind === k);
  const last = snaps.length ? Math.max(...snaps.map(s => Date.parse(s.at))) : 0;
  if (minutesToTip <= closeWindow) {
    if (!wantClose || has('close')) return null;
    if (last && Date.now() - last < minGap * 6e4) return null;            // acabou de buscar
    return 'close';
  }
  if (wantOpen && !snaps.length) return 'open';
  return null;
}

/* Orçamento: créditos que ainda dá para gastar hoje sem estourar o mês. */
export function dailyAllowance({ remaining, now = new Date(), reserve = 10 }) {
  if (remaining == null) return Infinity;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysLeft = Math.max(1, Math.ceil((end - now) / 864e5));
  return Math.max(0, Math.floor((remaining - reserve) / daysLeft));
}

/* Junta as linhas de vários provedores. Para cada jogador+mercado escolhe a linha com mais casas
   e soma as casas de todos os provedores naquela linha. Kalshi (bolsa) dá chance por degrau
   ("25+ pontos"): entra na linha escolhida, ou na mais perto de 50% se nenhuma casa tiver linha. */
export function mergeLines(lists, kalshi = []) {
  const byLine = new Map();
  for (const list of lists) for (const l of list || []) {
    const key = normName(l.name) + '|' + l.mk + '|' + l.line;
    const cur = byLine.get(key) || { name: l.name, mk: l.mk, line: l.line, books: {} };
    Object.assign(cur.books, l.books); byLine.set(key, cur);
  }
  const best = new Map();
  for (const l of byLine.values()) {
    const k = normName(l.name) + '|' + l.mk; const b = best.get(k);
    if (!b || Object.keys(l.books).length > Object.keys(b.books).length) best.set(k, l);
  }
  for (const kx of kalshi) {
    const k = normName(kx.name) + '|' + kx.mk; const b = best.get(k);
    if (b) { const p = kx.lines[b.line]; if (p != null) b.books.Kalshi = toBook(p); }
    else {
      const [line, p] = Object.entries(kx.lines).sort((x, y) => Math.abs(x[1] - .5) - Math.abs(y[1] - .5))[0] || [];
      if (line != null) best.set(k, { name: kx.name, mk: kx.mk, line: +line, books: { Kalshi: toBook(p) } });
    }
  }
  return [...best.values()];
}
// preço de bolsa (meio do spread) vira um par de odds sem margem
const toBook = p => ({ o: +(1 / p).toFixed(3), u: +(1 / (1 - p)).toFixed(3) });
