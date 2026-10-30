/* Importação em lote de linhas da sua casa (Betano, Bet365, Superbet…).
   Uma linha por prop:  Jogador; mercado; linha; odd mais; odd menos
   Separadores aceitos: ; | tab. Mercado em código (PTS, REB, 3PM, PRA…) ou em português.
   É o formato que o Claude (com o Claude in Chrome) devolve ao ler a página de props da casa. */
import { MARKETS } from './engine.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
const ALIAS = [
  ['PRA', ['pra', 'pts reb ast', 'pts+reb+ast', 'pontos rebotes assistencias', 'pontos + rebotes + assistencias', 'p+r+a']],
  ['PR', ['pr', 'pts+reb', 'pts reb', 'pontos rebotes', 'pontos + rebotes', 'p+r']],
  ['PA', ['pa', 'pts+ast', 'pts ast', 'pontos assistencias', 'pontos + assistencias', 'p+a']],
  ['RA', ['ra', 'reb+ast', 'reb ast', 'rebotes assistencias', 'rebotes + assistencias', 'r+a']],
  ['SB', ['sb', 'stl+blk', 'roubos tocos', 'roubos + tocos', 'roubos de bola + tocos', 'bloqueios + roubos', 'tocos + roubos']],
  ['3PM', ['3pm', '3pt', '3 pontos', 'cestas de 3', 'cestas de 3 pontos', 'bolas de 3', 'triplos', 'threes', '3 pts convertidos', 'arremessos de 3 convertidos']],
  ['3PA', ['3pa', 'bolas de 3 tentadas', 'arremessos de 3 tentados', 'tentativas de 3']],
  ['2PM', ['2pm', 'arremessos de 2 convertidos', 'cestas de 2']],
  ['2PA', ['2pa', 'arremessos de 2 tentados', 'tentativas de 2']],
  ['FGM', ['fgm', 'arremessos convertidos', 'arremessos de quadra convertidos', 'field goals']],
  ['FGA', ['fga', 'arremessos tentados', 'arremessos de quadra tentados']],
  ['FTM', ['ftm', 'lances livres', 'lances livres convertidos']],
  ['FTA', ['fta', 'lances livres tentados']],
  ['PTS', ['pts', 'pontos', 'points', 'total de pontos']],
  ['REB', ['reb', 'rebotes', 'rebounds', 'total de rebotes']],
  ['AST', ['ast', 'assistencias', 'assists', 'total de assistencias']],
  ['STL', ['stl', 'roubos', 'roubos de bola', 'steals']],
  ['BLK', ['blk', 'tocos', 'bloqueios', 'blocks']],
  ['TOV', ['tov', 'erros', 'turnovers', 'perdas de bola', 'desperdicios']],
  ['PF', ['pf', 'faltas', 'faltas pessoais', 'fouls']]
];
export function marketOf(s) {
  const t = norm(s).replace(/\s*\+\s*/g, '+');
  if (MARKETS[String(s).trim().toUpperCase()]) return String(s).trim().toUpperCase();
  for (const [mk, al] of ALIAS) if (al.some(a => a.replace(/\s*\+\s*/g, '+') === t)) return mk;
  for (const [mk, al] of ALIAS) if (al.some(a => a.length > 4 && t.includes(a.replace(/\s*\+\s*/g, '+')))) return mk;
  return null;
}
const num = v => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };

export function matchPlayer(name, players) {
  const n = norm(name); if (!n) return null;
  const exact = players.filter(p => norm(p.name) === n); if (exact.length === 1) return exact[0];
  const parts = n.split(' '), last = parts.at(-1), first = parts[0];
  const byLast = players.filter(p => { const q = norm(p.name).split(' '); return q.at(-1) === last && (parts.length === 1 || q[0][0] === first[0]); });
  if (byLast.length === 1) return byLast[0];
  const inc = players.filter(p => norm(p.name).includes(n) || n.includes(norm(p.name))); if (inc.length === 1) return inc[0];
  return null;
}

/** @returns {{rows: {pid, name, mk, line, oOver, oUnder, raw}[], errors: {raw, why}[]}} */
export function parseImport(text, players) {
  const rows = [], errors = [];
  for (let raw of String(text || '').split(/\r?\n/)) {
    raw = raw.trim(); if (!raw || raw.startsWith('#') || /^jogador\s*[;|\t]/i.test(raw)) continue;
    let f = raw.split(/\s*[;|\t]\s*/);
    if (f.length < 3) { // formato livre: "Nome Sobrenome mercado 26,5 1,85 1,95"
      const m = /^(.+?)\s+([A-Za-zÀ-ú+0-9 ]+?)\s+(\d+(?:[.,]\d+)?)(?:\s+(\d+(?:[.,]\d+)?))?(?:\s+(\d+(?:[.,]\d+)?))?$/.exec(raw);
      if (m) f = [m[1], m[2], m[3], m[4], m[5]];
    }
    const [name, mkRaw, lineRaw, oO, oU] = f;
    const mk = marketOf(mkRaw); if (!mk) { errors.push({ raw, why: 'mercado não reconhecido' }); continue; }
    const line = num(lineRaw); if (line == null || line < 0 || line > 200) { errors.push({ raw, why: 'linha inválida' }); continue; }
    const p = matchPlayer(name, players); if (!p) { errors.push({ raw, why: 'jogador não encontrado hoje' }); continue; }
    const oOver = num(oO), oUnder = num(oU);
    if ([oOver, oUnder].some(o => o != null && (o < 1.01 || o > 50))) { errors.push({ raw, why: 'odd deve ser decimal (ex. 1,85)' }); continue; }
    rows.push({ pid: p.id, name: p.name, mk, line, oOver, oUnder, raw });
  }
  return { rows, errors };
}
