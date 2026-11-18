// Fábrica de estratégias: cada estratégia é um filtro claro sobre as linhas do dia (bot.json) que gera entradas
// próprias, registradas em papel (tabela strategy_picks) e acompanhadas por ROI e CLV, uma a uma.
// Regras para criar/mudar: uma hipótese por estratégia, com motivo; nunca mudar a regra de uma estratégia que já
// tem histórico (crie uma versão nova, ex. "valor99-v2"), senão o histórico dela deixa de valer.
import { woLock, topEligible, c99Games, trendOK } from './botdata.js';
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
// mercados do Método Minutos, na ordem de preferência (uma entrada por jogador)
export const MIN_MK = ['PRA', 'PTS', 'PR', 'PA', 'REB', 'RA', 'AST'];
const edgeOf = r => r.d ? r.p * r.d - 1 : null; // valor esperado na odd real
const rot = r => (r.mn ?? 0) >= 24 && r.st !== 'questionable';
// só entra com linha e odd da 99play (a casa onde o usuário aposta; o resultado vale nessa odd)
const c99 = r => !!(r.c9 && r.d) && !OFF_MK.has(r.m) && MK_EST.includes(r.m);

export const STRATEGIES = MKT.map(([mk, name, lb]) => ({
  id: 'm-' + mk.toLowerCase(), name, markets: [mk], max: 5,
  descr: `As 5 melhores entradas do Modelo BH em ${lb}, com linha e odd da 99play: jogador de rotação (24+ min), chance do modelo entre 55% e 85%, sem trava de desfalque, ordem pela Nota BH.`,
  test: r => c99(r) && r.m === mk && rot(r) && r.p >= .55 && r.p <= .85 && !woLock(r),
}));
// cenário separado (pedido do usuário em 13/11): under de jogador de reserva (12 a 24 min), que fica fora dos
// mercados acima. Sem colega importante fora hoje: com um titular fora, o reserva ganha minutos e o under perde o sentido.
STRATEGIES.push({
  id: 'reserva-under', name: 'Under de reserva', markets: MK_EST, max: 8, off: true,
  descr: 'Menos de nos 8 mercados para jogadores de reserva (12 a 24 min por jogo), com linha e odd da 99play: chance do modelo entre 55% e 85%, sem colega importante fora hoje, ordem pela Nota BH.',
  test: r => c99(r) && r.s === 'u' && (r.mn ?? 0) >= 12 && (r.mn ?? 0) < 24 && r.st !== 'questionable' && r.p >= .55 && r.p <= .85 && !r.wo?.x,
});
// oportunidade forte fora dos 8 mercados (pedido do usuário em 13/11): qualquer outro mercado da 99play quando o
// Modelo BH vê muito valor. Também entra no papel, para medir se esse corte dá lucro.
const GOOD = r => r.gr === 'A+' || r.gr === 'A';
STRATEGIES.push({
  id: 'oport-forte', name: 'Oportunidade forte', markets: ['PTS', 'REB', 'AST', 'PRA', 'PR', 'PA', 'STL', 'BLK', 'SB', 'TOV', 'PF'], max: 6, off: true,
  descr: 'Fora dos 8 mercados monitorados: entradas com linha e odd da 99play, EV de 10% ou mais, nota A ou A+, jogador de rotação (24+ min), chance do modelo entre 55% e 85%, sem trava de desfalque, ordem pela Nota BH.',
  test: r => !!(r.c9 && r.d) && !OFF_MK.has(r.m) && !MK_EST.includes(r.m) && GOOD(r) && edgeOf(r) >= .10 && rot(r) && r.p >= .55 && r.p <= .85 && !woLock(r),
});
// top 10 forte (pedido do usuário em 13/11): entrada que está no Top 10 tentativas ou no Top 10 reb+ast do bot, com
// linha e odd da 99play, EV de 8% ou mais e nota A/A+. Pega as boas que surgem depois que o teto de 5 do mercado já
// encheu. O ranking é o mesmo das listas do bot (topEligible, ordem pela Nota BH, um mercado por jogador).
export const TOP_GROUPS = [['3PA', 'FTA', '2PA', '2PM', 'FGM'], ['RA']];
export function strategyCtx(rows) {
  const cov = c99Games(rows), top = new Set();
  for (const g of TOP_GROUPS) {
    const seen = new Set(); let k = 0;
    for (const r of rows.filter(r => topEligible(r, g, cov)).sort((a, b) => (b.sc ?? 0) - (a.sc ?? 0))) {
      if (seen.has(r.id)) continue; seen.add(r.id); top.add(`${r.id}|${r.m}|${r.s}`); if (++k >= 10) break;
    }
  }
  return { top };
}
STRATEGIES.push({
  id: 'top10-forte', name: 'Top 10 forte', markets: TOP_GROUPS.flat(), max: 6, off: true,
  descr: 'Entradas do Top 10 tentativas ou do Top 10 reb+ast do bot com linha e odd da 99play, EV de 8% ou mais e nota A ou A+ (as boas que surgem depois que o teto do mercado encheu), ordem pela Nota BH.',
  test: (r, ctx) => !!(r.c9 && r.d) && !!ctx?.top?.has(`${r.id}|${r.m}|${r.s}`) && GOOD(r) && edgeOf(r) >= .08,
});
// tendência (pedido do usuário em 14/11): sequência + matchup + defesa + odd da 99play, sem a chance do modelo.
// Os dois lados valem; uma entrada por jogador (a de melhor sequência). Teste no papel lado a lado com o Modelo BH.
const rt = h => h?.[1] ? h[0] / h[1] : 0;
STRATEGIES.push({
  id: 'tendencia', name: 'Tendência', markets: ['PTS', 'REB', 'AST', '3PM', 'PRA', 'PR', 'PA', 'RA', 'FGM', '2PM', '2PA', '3PA', 'FTM', 'FTA', 'STL', 'BLK', 'SB', 'TOV', 'PF'], max: 10, one: true,
  descr: 'Sem o modelo: 7+ acertos nos últimos 10 e 4+ nos últimos 5, 50%+ contra o adversário (ou sem jogo contra ele), defesa adversária entre as 12 que mais cedem (over) ou menos cedem (under), odd da 99play entre 1,60 e 2,30, jogador de rotação (24+ min). Uma por jogador, ordem pela sequência.',
  test: r => !OFF_MK.has(r.m) && trendOK(r),
  sort: (a, b) => (rt(b.l10) - rt(a.l10)) || (rt(b.l5) - rt(a.l5)) || (rt(b.l20) - rt(a.l20)) || ((b.d ?? 0) - (a.d ?? 0)),
});

// Método Minutos (pedido do usuário em 18/11, para acompanhar de perto): minutos previstos hoje 4+ acima da média dos
// últimos 10 (titular fora) → over; 4+ abaixo → under. Uma por jogador (PRA, senão PTS, PR, PA, REB, RA, AST), odd da
// 99play entre 1,50 e 3,50, sem teto por dia. Não usa a chance do modelo (o sinal é a notícia de minutos).
STRATEGIES.push({
  id: 'minutos', name: 'Método Minutos', markets: MIN_MK, max: 40, one: true,
  descr: 'Minutos previstos hoje 4+ acima da média dos últimos 10 jogos (titular do time fora) → mais de; 4+ abaixo (ele mesmo em dúvida ou voltando) → menos de. Uma por jogador em pts+reb+ast (ou pontos, pts+reb, pts+ast, rebotes, reb+ast, assistências), linha e odd da 99play entre 1,50 e 3,50, sem limite por dia.',
  test: r => !!(r.mi && r.c9 && r.d >= 1.5 && r.d <= 3.5 && MIN_MK.includes(r.m)),
  sort: (a, b) => (MIN_MK.indexOf(a.m) - MIN_MK.indexOf(b.m)) || (Math.abs(b.mi) - Math.abs(a.mi)),
});

// Modelo v2, todos os mercados (pedido do usuário em 18/11): monitorar no papel TODOS os mercados do bot com a regra
// nova, ao lado das 8 do Modelo por mercado (que ficam como estão, para comparar). Regra: EV de 3%+ na odd da 99play,
// SEM piso de chance (o piso de 55% escolhia o lado de odd baixa: backtest 13–17/11, ROI −13,7% contra −9,1%),
// odd 1,50–3,50, jogador de rotação (24+ min, sem dúvida), 5 por mercado por dia, ordem pelo EV. Só papel, sem alerta
// (quiet) e sem card. Uma semana (~35 por mercado) mostra tendência, não decide: mercado só vira aposta com 150+
// entradas, ROI > 0 e CLV > 0.
const V2 = [['PTS', 'Pontos'], ['REB', 'Rebotes'], ['AST', 'Assistências'], ['3PM', 'Bolas de 3'], ['PRA', 'Pts+Reb+Ast'], ['PR', 'Pts+Reb'],
  ['PA', 'Pts+Ast'], ['RA', 'Reb+Ast'], ['FGM', 'Arr. convertidos'], ['2PM', 'De 2 convertidos'], ['2PA', 'Tentativas de 2'], ['3PA', 'Tentativas de 3'],
  ['FTM', 'LL convertidos'], ['FTA', 'LL tentados'], ['STL', 'Roubos'], ['BLK', 'Tocos'], ['SB', 'Roubos+Tocos'], ['TOV', 'Erros'], ['PF', 'Faltas']];
for (const [mk, nm] of V2) STRATEGIES.push({
  id: 'v2-' + mk.toLowerCase(), name: 'v2 · ' + nm, markets: [mk], max: 5, quiet: true,
  descr: `Modelo v2 em ${nm.toLowerCase()}: as 5 entradas de maior valor do dia (EV de 3% ou mais na odd da 99play, sem piso de chance), odd entre 1,50 e 3,50, jogador de rotação (24+ min, sem dúvida). Só papel, sem alerta.`,
  test: r => !!(r.c9 && r.d >= 1.5 && r.d <= 3.5) && r.m === mk && !OFF_MK.has(r.m) && rot(r) && edgeOf(r) >= .03,
  sort: (a, b) => (edgeOf(b) ?? -1) - (edgeOf(a) ?? -1),
});

// 17/11: o usuário parou de acompanhar Under de reserva, Oportunidade forte e Top 10 forte (off: true). A regra fica
// aqui (e o histórico no banco, com status 'arquivada') para poder voltar; não geram mais entradas nem alertas.
/* entradas do dia por estratégia (uma por jogador e mercado; ordem: Nota BH, depois valor esperado) */
export function pickStrategies(bot, games = []) {
  const tip = Object.fromEntries((games || []).map(g => [g.id, g.timeUTC || g.utc || null]));
  const out = [], ctx = strategyCtx(bot.rows);
  for (const S of STRATEGIES.filter(S => !S.off)) {
    const rows = (S.id === 'tendencia' ? [...bot.rows, ...(bot.trend || [])] : S.id === 'minutos' ? [...bot.rows, ...(bot.trend || []), ...(bot.mins || [])] : bot.rows).filter(r => { try { return S.test(r, ctx); } catch { return false; } })
      .sort(S.sort || ((a, b) => ((b.sc ?? b.nt ?? 0) - (a.sc ?? a.nt ?? 0)) || ((edgeOf(b) ?? -1) - (edgeOf(a) ?? -1))));
    const seen = new Set(); let k = 0;
    for (const r of rows) {
      const key = S.one ? r.id : r.id + '|' + r.m; if (seen.has(key)) continue; seen.add(key);
      out.push({ strategy_id: S.id, pid: r.id, name: r.n, team: r.t, opp: r.o, mk: r.m, side: r.s, line: r.l, odd: r.d ?? null,
        odd_src: r.d ? (r.k ? 'Kalshi' : (r.b || 'casa')) : 'estimada', p: r.p, edge: edgeOf(r) == null ? null : Math.round(edgeOf(r) * 1e4) / 1e4,
        nota: r.nt ?? null, tip_utc: tip[r.g] || null, sq: r.sq?.length ? r.sq.slice(0, 10) : null, ...(r.t9 ? { t9: r.t9 } : {}) });
      if (++k >= S.max) break;
    }
  }
  return { date: bot.date, gen: bot.gen, strategies: STRATEGIES.filter(S => !S.off).map(({ test, ...s }) => s), picks: out };
}
