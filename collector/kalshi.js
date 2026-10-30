// Kalshi (bolsa de previsão regulada nos EUA) — leitura PÚBLICA, sem chave e sem custo.
// Tem props de NBA em degraus ("Jalen Brunson: 25+ points"). O preço do contrato (0 a 1) já é a
// chance que o mercado dá, sem margem de casa. Usamos o meio entre a melhor compra e a melhor venda.
// Docs: https://docs.kalshi.com/getting_started/quick_start_market_data
import { getJSON } from './http.js';

const BASE = 'https://external-api.kalshi.com/trade-api/v2';
// série → mercado do app (KALSHI_SERIES muda a lista)
export const DEFAULT_SERIES = 'KXNBAPTS:PTS,KXNBAREB:REB,KXNBAAST:AST,KXNBA3PT:3PM';
const price = (m, side) => { const d = m[side + '_dollars']; if (d != null && d !== '') return parseFloat(d); const c = m[side]; return c == null ? null : c > 1 ? c / 100 : c; };

/* mercados → [{name, mk, lines: {linha: chance}}]; degrau "25+" vira linha 24,5 */
export function parseKalshiMarkets(markets, mk, { maxSpread = .08 } = {}) {
  const acc = {};
  for (const m of markets || []) {
    if (m.status && !/open|active/i.test(m.status)) continue;
    const txt = [m.yes_sub_title, m.title, m.subtitle].filter(Boolean).join(' | ');
    const r = /([A-Z][A-Za-z.'’\- ]+?)\s*:\s*(\d+)\s*\+/.exec(txt); if (!r) continue;
    const name = r[1].trim(), thr = +r[2];
    const bid = price(m, 'yes_bid'), ask = price(m, 'yes_ask');
    if (bid == null || ask == null || bid <= 0 || ask >= 1 || ask - bid > maxSpread) continue;
    const p = (bid + ask) / 2;
    (acc[name + '|' + mk] ||= { name, mk, lines: {} }).lines[thr - .5] = +p.toFixed(4);
  }
  return Object.values(acc);
}

export async function fetchKalshi({ series = DEFAULT_SERIES, log = console.log }) {
  const out = []; let n = 0;
  for (const pair of series.split(',').map(s => s.trim()).filter(Boolean)) {
    const [ticker, mk] = pair.split(':');
    try {
      const j = await getJSON(`${BASE}/markets?series_ticker=${ticker}&status=open&limit=1000`, { retries: 1, quiet404: true });
      const got = parseKalshiMarkets(j?.markets || [], mk); n += got.length; out.push(...got);
    } catch (e) { log(`  aviso: Kalshi ${ticker}: ${e.message}`); }
  }
  log(`  Kalshi: ${n} jogador-mercado com preço`);
  return out;
}
