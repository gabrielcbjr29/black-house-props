// Gabarito do canal principal (21/11): lê as entradas que o usuário posta no canal (imagem do bilhete + legenda) e
// devolve o que precisa para corrigir. Sem dependências: usado pelo bot (Deno) e pelo pipeline (Node, depois do OCR).
//
// Formato do canal (exemplo real): imagem com "Jaden McDaniels (MIN) mais 4,5 rebotes (incluindo Prorrogação)
// · Minnesota Timberwolves x Memphis Grizzlies" e legenda "🏀 NBA 🏀 · 💰 1 unidade (ou SUPER ODD!) · Clique aqui para
// pegar o bilhete pronto" (link da 99play, Finta ou BR365). SUPER ODD = 1 unidade.

export const nrm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nameKey = s => nrm(s).replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/* legenda: esporte, unidades, casa (pelo link do bilhete) */
export function readCaption(text = '', urls = []) {
  const t = nrm(text);
  const esporte = /\bnba\b/.test(t) ? 'NBA' : /futebol|soccer/.test(t) ? 'Futebol' : /\bnfl\b/.test(t) ? 'NFL' : /\bnhl\b/.test(t) ? 'NHL' : /tenis|tennis/.test(t) ? 'Tênis' : null;
  const m = /(\d+(?:[.,]\d+)?)\s*(unidades?|u\b)/.exec(t);
  const stake = m ? parseFloat(m[1].replace(',', '.')) : /super\s*odd/.test(t) ? 1 : 1;
  const all = [...urls, text].join(' ').toLowerCase();
  const casa = /finta\./.test(all) ? 'finta' : /br365\./.test(all) ? 'br365' : /99play\./.test(all) ? '99play' : null;
  return { esporte, stake, superOdd: /super\s*odd/.test(t), casa };
}

// mercados (do mais específico para o mais simples)
const MKTS = [
  [/pontos?\s*\+\s*rebotes?\s*\+\s*assist|pts\s*\+\s*reb\s*\+\s*ast|\bpra\b/, 'PRA', 'pts+reb+ast'],
  [/pontos?\s*\+\s*rebotes?|pts\s*\+\s*reb\b/, 'PR', 'pts+reb'],
  [/pontos?\s*\+\s*assist|pts\s*\+\s*ast\b/, 'PA', 'pts+ast'],
  [/rebotes?\s*\+\s*assist|reb\s*\+\s*ast\b/, 'RA', 'reb+ast'],
  [/roubos?\s*\+\s*(tocos?|bloq)/, 'SB', 'stl+blk'],
  [/triplo[\s-]*duplo|triple[\s-]*double/, 'TD', 'td'],
  [/duplo[\s-]*duplo|double[\s-]*double/, 'DD', 'dd'],
  // arremessos de 2 / de 3 / de quadra (antes de "3 pontos" e de "pontos", que pegariam esses textos)
  [/(arremessos?|cestas?)\s*de\s*(2|dois)\b[^\n]*?(tentad|tentativ)|tentativas?\s*de\s*(2|dois)\b/, '2PA', 'twoa'],
  [/(arremessos?|cestas?)\s*de\s*(2|dois)\b|de\s*2\s*pontos?\s*convertid/, '2PM', 'twom'],
  [/(arremessos?|cestas?)\s*de\s*(3|tres)\b[^\n]*?(tentad|tentativ)|tentativas?\s*de\s*(3|tres)\b/, '3PA', 'tpa'],
  [/arremessos?\s*(de\s*quadra\s*)?tentad|field\s*goals?\s*attempt/, 'FGA', 'fga'],
  [/arremessos?\s*(de\s*quadra\s*)?(convertid|certos|marcad)|field\s*goals?\s*made/, 'FGM', 'fgm'],
  [/cestas?\s*de\s*(3|tres)|bolas?\s*de\s*3|3\s*pontos|tres\s*pontos|triplos?\b|three/, '3PM', 'tpm'],
  [/lances?\s*livres?\s*(convertid|marcad)/, 'FTM', 'ftm'],
  [/lances?\s*livres?/, 'FTA', 'fta'],
  [/assist|\bast\b/, 'AST', 'ast'],
  [/rebot|\breb\b/, 'REB', 'reb'],
  [/roubos?\b|roubadas?/, 'STL', 'stl'],
  [/tocos?\b|bloqueios?|bloks?/, 'BLK', 'blk'],
  [/perdas?\s*de\s*bola|erros?\b|turnovers?/, 'TOV', 'tov'],
  [/pontos?\b|\bpts\b|points/, 'PTS', 'pts'],
];
export function marketOf(s) { const t = nrm(s); for (const [rx, mk, stat] of MKTS) if (rx.test(t)) return { mk, stat }; return null; }

/* lado e linha: "mais 4,5" / "mais de 4.5" / "acima de" / "over" / "+9.5" / "10+" (marco = mais de 9,5) / "menos de" */
export function sideLine(s) {
  const t = nrm(s).replace(/(\d),(\d)/g, '$1.$2');
  let m = /(mais|acima|over|maior)\s*(de|que)?\s*(\d+(?:\.\d+)?)/.exec(t); if (m) return { side: 'o', line: +m[3] };
  m = /(menos|abaixo|under|menor)\s*(de|que)?\s*(\d+(?:\.\d+)?)/.exec(t); if (m) return { side: 'u', line: +m[3] };
  m = /\+\s*(\d+\.5)\b/.exec(t); if (m) return { side: 'o', line: +m[1] };
  m = /\b(\d{1,2})\s*\+(?!\s*\d)/.exec(t); if (m) return { side: 'o', line: +m[1] - .5 };
  m = /\b(\d{1,2})\s*ou\s*mais/.exec(t); if (m) return { side: 'o', line: +m[1] - .5 };
  return null;
}

/* odds no texto: "@2,10", "odd 2.10", "odds total 38.91" (múltipla) */
export function oddsOf(s) {
  const t = nrm(s).replace(/(\d),(\d)/g, '$1.$2');
  const tot = /odds?\s*total\s*:?\s*(\d+\.\d{1,2})/.exec(t);
  const at = [...t.matchAll(/(?:@|odds?\s*(?:turbinada)?\s*:?)\s*(\d+\.\d{2})\b/g)].map(m => +m[1]).filter(x => x > 1 && x < 1000);
  // odd solta no fim da linha do bilhete: "Cam Spencer (MEM) 1.66", "Arsenal 456 > 1,70" (2 casas; linha de prop tem 1)
  const solta = t.split('\n').filter(l => !/(mais|menos|acima|abaixo|over|under)\s*(de|que)?\s*\d+\.\d{2}\s*$/.test(l))
    .map(l => /(?:^|[\s>)])(\d{1,2}\.\d{2})\s*$/.exec(l)?.[1]).filter(Boolean).map(Number).filter(x => x > 1 && x < 50);
  return { total: tot ? +tot[1] : null, list: [...at, ...solta.filter(x => !at.includes(x))] };
}

/* acha os jogadores do dia no texto (nome completo; sobrenome só quando é único no dia) */
export function findPlayers(text, players) {
  const t = ' ' + nameKey(text) + ' ';
  const out = [];
  const last = new Map(); for (const p of players) { const k = nameKey(p.name).split(' ').at(-1); last.set(k, (last.get(k) ?? 0) + 1); }
  for (const p of players) {
    const full = nameKey(p.name), parts = full.split(' '), ln = parts.at(-1);
    let i = t.indexOf(' ' + full + ' ');
    // OCR come letra do começo ("len McDaniels"): aceita o fim do primeiro nome + sobrenome
    if (i < 0 && parts.length > 1) { const rx = new RegExp(`[a-z]*${parts[0].slice(-2)} ${parts.slice(1).join(' ')} `); const m = rx.exec(t); if (m) i = m.index; }
    if (i < 0 && ln.length >= 5 && last.get(ln) === 1) { const j = t.indexOf(' ' + ln + ' '); if (j >= 0) i = j; }
    if (i >= 0) out.push({ p, i });
  }
  // o mesmo trecho não vale para dois jogadores: fica o de nome mais longo
  out.sort((a, b) => a.i - b.i || nameKey(b.p.name).length - nameKey(a.p.name).length);
  const seen = new Set(); return out.filter(x => { if (seen.has(x.p.id)) return false; seen.add(x.p.id); return true; });
}

/* texto da imagem (OCR) + legenda → entrada.
   players: [{ id, name, team, opp, game, tip }] do dia (bot.json). Devolve { kind, legs, odd, faltando[] }.
   Lê linha a linha: cada linha com um jogador abre uma perna; mercado, lado e linha vêm dela ou das 2 linhas seguintes
   (até aparecer outro jogador). O mesmo jogador pode ter duas pernas (Criar Aposta). */
export function parseEntry(ocr, caption, players) {
  const text = `${ocr ?? ''}\n${caption ?? ''}`;
  const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const who = lines.map(l => findPlayers(l, players)[0]?.p ?? null);
  const legs = [];
  for (let i = 0; i < lines.length; i++) {
    const p = who[i]; if (!p) continue;
    let ctx = lines[i];
    for (let j = i + 1; j < Math.min(lines.length, i + 3) && !who[j]; j++) ctx += '\n' + lines[j];
    const mk = marketOf(lines[i]) ?? marketOf(ctx);
    const sl = mk && (mk.mk === 'DD' || mk.mk === 'TD') ? { side: 'o', line: .5 } : sideLine(lines[i]) ?? sideLine(ctx);
    if (!mk || !sl) continue;
    const leg = { pid: String(p.id), name: p.name, team: p.team, opp: p.opp, game: p.game, tip: p.tip, mk: mk.mk, stat: mk.stat, side: sl.side, line: sl.line, odd: oddsOf(ctx).list[0] ?? null };
    if (!legs.some(l => l.pid === leg.pid && l.mk === leg.mk && l.side === leg.side && l.line === leg.line)) legs.push(leg);
  }
  const O = oddsOf(text);
  const odd = legs.length > 1 ? O.total ?? null : legs[0]?.odd ?? O.total ?? O.list[0] ?? null;
  if (legs.length === 1 && odd && !legs[0].odd) legs[0].odd = odd;
  const faltando = [!legs.length && 'jogador/mercado', legs.length && !odd && 'odd'].filter(Boolean);
  return { kind: legs.length > 1 ? 'multipla' : 'simples', legs, odd, faltando };
}
