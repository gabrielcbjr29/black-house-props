// Escada da 99play (19/11): os mercados de marcos (5+, 7+, 10+…), o duplo-duplo e o triplo-duplo que o leitor 1.2+ manda à
// parte (details[evento].extra = { markets, odds }). Sem dependências: usado pela coleta (Node) e pelo bot (Deno).
// Os nomes vêm em pt-BR (culture pt-BR). Como a 99play nomeia esses mercados ainda não foi visto ao vivo, o parser é
// tolerante: acha a estatística pelo nome do mercado, o jogador pelo childName (ou pelo nome do mercado/odd) e a linha
// pelo nome da odd ("10+" = mais de 9,5; "Mais de 9.5" = 9,5). Marco N+ é exatamente o over N−0,5 da Finta.

export const normName = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

// ordem importa: triplo-duplo antes de "triplos"/"pontos"; 3 pontos antes de pontos
const STATS = [
  [/triplo[\s-]*duplo|triple[\s-]*double/i, 'TD'],
  [/duplo[\s-]*duplo|double[\s-]*double/i, 'DD'],
  [/assist/i, 'AST'],
  [/rebot|rebound/i, 'REB'],
  [/cestas?\s*de\s*3|3\s*pontos|tr[eê]s\s*pontos|three/i, '3PM'],
  [/pontos|points/i, 'PTS'],
];
/* estatística do mercado; null quando é combinado (ex.: "Pontos + Assistências") ou desconhecido */
export function statOf(name) {
  const s = String(name ?? ''); if (/\+\s*[a-zà-ú]/i.test(s.replace(/\d+\s*\+/g, ''))) return null; // "Pontos + Rebotes"
  for (const [rx, mk] of STATS) if (rx.test(s)) return mk;
  return null;
}
/* linha de uma odd de marco: "10+" → 9,5; "Mais de 9.5" / "Acima de 9,5" / "Over 9.5" → 9,5; "Sim"/"Yes" → 'sim' */
export function lineOf(oddName) {
  const s = String(oddName ?? '').trim();
  if (/^(sim|yes)$/i.test(s)) return 'sim';
  let m = /(\d+)\s*\+/.exec(s); if (m) return +m[1] - .5;
  m = /(mais de|acima de|over|\+)\s*(\d+(?:[.,]\d+)?)/i.exec(s); if (m) { const v = parseFloat(m[2].replace(',', '.')); return Number.isInteger(v) ? v - .5 : v; }
  m = /(\d+)\s*(ou mais|or more)/i.exec(s); if (m) return +m[1] - .5;
  return null;
}
const playerOf = (m, oddName) => m.childName || String(m.name ?? '').split(/\s[-–:|]\s/)[0] || String(oddName ?? '').replace(/\s*\d+\s*\+.*$/, '');

/* foto do leitor → { normName: { name, AST: {9.5: 5.8, …}, REB: {…}, PTS: {…}, '3PM': {…}, DD: 6.0, TD: 40 } } */
export function parseLadder99(payload) {
  const out = {};
  for (const d of Object.values(payload?.details ?? {})) {
    const X = d?.extra; if (!X?.markets?.length) continue;
    const odds = new Map((X.odds ?? []).map(o => [o.id, o]));
    for (const m of X.markets) {
      const mk = statOf(m.name); if (!mk) continue;
      for (const id of (m.desktopOddIds ?? []).flat()) {
        const o = odds.get(id); if (!o || o.oddStatus !== 0 || !(+o.price > 1)) continue;
        const ln = lineOf(o.name); if (ln == null) continue;
        const who = playerOf(m, o.name), k = normName(who); if (!k) continue;
        const P = out[k] ??= { name: who };
        if (mk === 'DD' || mk === 'TD') { if (ln === 'sim') P[mk] = +o.price; continue; }
        if (ln === 'sim') continue;
        (P[mk] ??= {})[ln] = +o.price;
      }
    }
  }
  return out;
}

// ---------- combos do /combo (Finta × 99play), usados pelo bot e pela coleta ----------
// odd do combo ≈ produto das pernas × K (nenhuma das casas publica o preço do Criar Aposta; os bilhetes reais calibram)
export const COMBO_K = { finta: .874, '99play': .90 }; // Finta: Garland Ast 9,5 + DD 38,91 (19/11); 99play: bilhetes de 16/11
export const COMBO_MIN = 15;
/* combos de um jogador (o bot usa a mesma conta; aqui para testes e para o painel futuro).
   P = jogador do combo.json; tipo 'ar' = Ast + Reb · 'dd' = Ast + DD e Reb + DD · 'td' = Ast + Reb + TD. lad99 = escada da 99play do jogador. */
export function combosOf(P, tipo, lad99 = null, K = COMBO_K, min = COMBO_MIN) {
  const leg = (mk, l) => ({ mk, line: l[0], fo: l[1], o99: lad99?.[mk]?.[l[0]] ?? l[2] ?? null, hit: g => (mk === 'REB' ? g[0] : g[1]) > l[0] });
  const R = P.legs.REB.map(l => leg('REB', l)), A = P.legs.AST.map(l => leg('AST', l));
  const DD = P.legs.DD ? { mk: 'DD', line: null, fo: P.legs.DD, o99: lad99?.DD ?? null, hit: g => g[2] === 1 } : null;
  const TD = P.legs.TD ? { mk: 'TD', line: null, fo: P.legs.TD, o99: lad99?.TD ?? null, hit: g => g[3] === 1 } : null;
  const C = [];
  if (tipo === 'ar') for (const a of A) for (const r of R) C.push([a, r]);
  if (tipo === 'dd' && DD) { for (const a of A) C.push([a, DD]); for (const r of R) C.push([r, DD]); }
  if (tipo === 'td' && TD) for (const a of A) for (const r of R) C.push([a, r, TD]);
  return C.map(c => {
    const fin = c.reduce((x, l) => x * l.fo, 1) * K.finta, has99 = c.every(l => l.o99 > 1), n99 = has99 ? c.reduce((x, l) => x * l.o99, 1) * K['99play'] : null;
    const h = n => P.last.slice(0, n).filter(g => c.every(l => l.hit(g))).length;
    return { legs: c.map(({ hit, ...l }) => l), fin: Math.round(fin * 100) / 100, n99: n99 == null ? null : Math.round(n99 * 100) / 100,
      dif: n99 ? Math.round((fin / n99 - 1) * 1000) / 1000 : null, h10: h(10), h20: h(20), n10: Math.min(10, P.last.length), n20: P.last.length };
  }).filter(x => x.fin >= min).sort((a, b) => b.h20 - a.h20 || b.h10 - a.h10 || b.fin - a.fin);
}
