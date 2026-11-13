// Fábrica de estratégias: cada estratégia é um filtro claro sobre as linhas do dia (bot.json) que gera entradas
// próprias, registradas em papel (tabela strategy_picks) e acompanhadas por ROI e CLV, uma a uma.
// Regras para criar/mudar: uma hipótese por estratégia, com motivo; nunca mudar a regra de uma estratégia que já
// tem histórico (crie uma versão nova, ex. "valor99-v2"), senão o histórico dela deixa de valer.
import { woLock } from './botdata.js';
import { OFF_MK } from '../public/engine.js';

const TENT = ['3PA', 'FTA', '2PA', '2PM', 'FGM']; // arremessos tentados (FGA) fora: a 99play não abre
const edgeOf = r => r.d ? r.p * r.d - 1 : null; // valor esperado na odd real
const hit = h => h?.[1] ? h[0] / h[1] : null;
const rot = r => (r.mn ?? 0) >= 24 && r.st !== 'questionable';
// toda estratégia só entra com linha e odd da 99play (a casa onde o usuário aposta; o resultado vale nessa odd).
// Regra fixada em 13/11/2026, antes da primeira entrada gravada.
const c99 = r => !!(r.c9 && r.d) && !OFF_MK.has(r.m);

export const STRATEGIES = [
  { id: 'valor99', name: 'Valor na 99play', markets: null, max: 6,
    descr: 'Qualquer mercado com linha e odd da 99play em que a chance do modelo dá 5%+ de valor esperado (chance 55%+, nota 55+).',
    test: r => c99(r) && rot(r) && r.p >= .55 && r.p <= .85 && (r.nt ?? 0) >= 55 && edgeOf(r) >= .05 && !woLock(r) },
  { id: 'under-tent', name: 'Under de tentativas sólido', markets: TENT, max: 5,
    descr: 'Menos em tentados de 3, de 2, lances livres e convertidos (linha da 99play) com chance 62%+, 7/10 ou mais nos últimos 10 e sem trava de desfalque.',
    test: r => c99(r) && TENT.includes(r.m) && r.s === 'u' && rot(r) && r.p >= .62 && r.p <= .85 && (hit(r.l10) ?? 0) >= .7 && !woLock(r) },
  { id: 'ra-valor', name: 'Reb+Ast com valor', markets: ['RA'], max: 4,
    descr: 'Reb+ast na 99play com 4%+ de valor esperado, chance 55%+.',
    test: r => c99(r) && r.m === 'RA' && rot(r) && r.p >= .55 && r.p <= .85 && edgeOf(r) >= .04 && !woLock(r) },
  { id: 'pts-valor', name: 'Pontos com valor', markets: ['PTS'], max: 4,
    descr: 'Pontos na 99play com 5%+ de valor esperado, chance 55%+.',
    test: r => c99(r) && r.m === 'PTS' && rot(r) && r.p >= .55 && r.p <= .85 && edgeOf(r) >= .05 && !woLock(r) },
  { id: 'desfalque-over', name: 'Over do substituto (desfalque)', markets: null, max: 4,
    descr: 'Mais de na 99play, com um colega de rotação fora hoje e o jogador acima da linha em 60%+ dos jogos reais sem ele (5+ jogos).',
    test: r => c99(r) && r.s === 'o' && r.wo?.x && r.wo.h?.[1] >= 5 && r.wo.h[0] / r.wo.h[1] >= .6 && r.p >= .55 && r.p <= .85 && (r.mn ?? 0) >= 20 && r.st !== 'questionable' },
  { id: 'defesa-over', name: 'Over contra defesa fraca', markets: null, max: 4,
    descr: 'Mais de na 99play contra um adversário entre as 5 piores defesas na posição e estatística, chance 58%+.',
    test: r => c99(r) && r.s === 'o' && r.dv?.r && r.dv.r >= r.dv.of - 4 && rot(r) && r.p >= .58 && r.p <= .85 && !woLock(r) },
];

/* entradas do dia por estratégia (uma por jogador e mercado; ordem: valor esperado, depois nota) */
export function pickStrategies(bot, games = []) {
  const tip = Object.fromEntries((games || []).map(g => [g.id, g.timeUTC || g.utc || null]));
  const out = [];
  for (const S of STRATEGIES) {
    const rows = bot.rows.filter(r => { try { return S.test(r); } catch { return false; } })
      .sort((a, b) => ((edgeOf(b) ?? -1) - (edgeOf(a) ?? -1)) || ((b.nt ?? 0) - (a.nt ?? 0)));
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
