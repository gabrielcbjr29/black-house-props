// Fábrica de estratégias: cada estratégia é um filtro claro sobre as linhas do dia (bot.json) que gera entradas
// próprias, registradas em papel (tabela strategy_picks) e acompanhadas por ROI e CLV, uma a uma.
// Regras para criar/mudar: uma hipótese por estratégia, com motivo; nunca mudar a regra de uma estratégia que já
// tem histórico (crie uma versão nova, ex. "valor99-v2"), senão o histórico dela deixa de valer.
import { woLock } from './botdata.js';
import { OFF_MK } from '../public/engine.js';

// Modelo por mercado (escolha do usuário em 13/11/2026): uma "estratégia" por mercado monitorado, com as melhores
// entradas do Modelo BH naquele mercado, para medir na semana onde o modelo acerta e dá lucro na 99play.
const MKT = [
  ['2PA', 'Tentativas de 2', 'tentativas de arremesso de 2 pontos'],
  ['2PM', 'De 2 convertidos', 'arremessos de 2 pontos convertidos'],
  ['3PA', 'Tentativas de 3', 'tentativas de arremesso de 3 pontos'],
  ['3PM', 'De 3 convertidos', 'arremessos de 3 pontos convertidos'],
  ['FGM', 'Arr. convertidos', 'arremessos convertidos'],
  ['FTA', 'LL tentados', 'tentativas de lance livre'],
  ['FTM', 'LL convertidos', 'lances livres convertidos'],
  ['RA', 'Reb+Ast', 'rebotes + assistências'],
];
export const MK_EST = MKT.map(x => x[0]);
const edgeOf = r => r.d ? r.p * r.d - 1 : null; // valor esperado na odd real
const rot = r => (r.mn ?? 0) >= 24 && r.st !== 'questionable';
// só entra com linha e odd da 99play (a casa onde o usuário aposta; o resultado vale nessa odd)
const c99 = r => !!(r.c9 && r.d) && !OFF_MK.has(r.m) && MK_EST.includes(r.m);

export const STRATEGIES = MKT.map(([mk, name, lb]) => ({
  id: 'm-' + mk.toLowerCase(), name, markets: [mk], max: 5,
  descr: `As 5 melhores entradas do Modelo BH em ${lb}, com linha e odd da 99play: jogador de rotação (24+ min), chance do modelo entre 55% e 85%, sem trava de desfalque, ordem pela Nota BH.`,
  test: r => c99(r) && r.m === mk && rot(r) && r.p >= .55 && r.p <= .85 && !woLock(r),
}));

/* entradas do dia por estratégia (uma por jogador e mercado; ordem: Nota BH, depois valor esperado) */
export function pickStrategies(bot, games = []) {
  const tip = Object.fromEntries((games || []).map(g => [g.id, g.timeUTC || g.utc || null]));
  const out = [];
  for (const S of STRATEGIES) {
    const rows = bot.rows.filter(r => { try { return S.test(r); } catch { return false; } })
      .sort((a, b) => ((b.sc ?? b.nt ?? 0) - (a.sc ?? a.nt ?? 0)) || ((edgeOf(b) ?? -1) - (edgeOf(a) ?? -1)));
    const seen = new Set(); let k = 0;
    for (const r of rows) {
      const key = r.id + '|' + r.m; if (seen.has(key)) continue; seen.add(key);
      out.push({ strategy_id: S.id, pid: r.id, name: r.n, team: r.t, opp: r.o, mk: r.m, side: r.s, line: r.l, odd: r.d ?? null,
        odd_src: r.d ? (r.k ? 'Kalshi' : (r.b || 'casa')) : 'estimada', p: r.p, edge: edgeOf(r) == null ? null : Math.round(edgeOf(r) * 1e4) / 1e4,
        nota: r.nt ?? null, tip_utc: tip[r.g] || null });
      if (++k >= S.max) break;
    }
  }
  return { date: bot.date, gen: bot.gen, strategies: STRATEGIES.map(({ test, ...s }) => s), picks: out };
}
