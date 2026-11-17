import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kalshiAt, alavancaPlan, ALV } from '../scripts/alavanca.mjs';
import { parseKalshiMarkets } from '../collector/kalshi.js';

test('Kalshi: guarda spread e volume de cada degrau', () => {
  const k = parseKalshiMarkets([{ status: 'active', title: 'Jalen Brunson: 25+ points', yes_bid_dollars: '0.40', yes_ask_dollars: '0.44', volume_fp: '120.00' }], 'PTS');
  assert.deepEqual(k[0].lines, { 24.5: .42 }); assert.deepEqual(k[0].q, { 24.5: { s: .04, v: 120 } });
});

test('Alavanca: chance da Kalshi na linha da 99play (exata, interpolada, recusa quando não confia)', () => {
  const k = { lines: { 19.5: .7, 24.5: .4, 29.5: .15 }, q: { 19.5: { s: .02, v: 50 }, 24.5: { s: .03, v: 80 }, 29.5: { s: .09, v: 0 } } };
  assert.deepEqual(kalshiAt(k, 24.5, 'PTS'), { p: .4, how: 'exata' });
  const m = kalshiAt(k, 22.5, 'PTS'); assert.equal(m.how, 'interp'); assert.ok(m.p < .7 && m.p > .4, 'entre os degraus vizinhos');
  assert.equal(kalshiAt(k, 27.5, 'PTS'), null, 'degrau de cima com spread largo (9 centavos)');
  assert.equal(kalshiAt(k, 12.5, 'PTS'), null, 'fora da escada');
  assert.equal(kalshiAt({ lines: { 4.5: .6, 9.5: .2 } }, 6.5, 'REB'), null, 'rebote: degraus longe demais (5) para interpolar');
  assert.equal(kalshiAt({ lines: { 24.5: .4 }, q: { 24.5: { s: .02, v: 0 } } }, 24.5, 'PTS'), null, 'sem nenhum negócio');
});

test('Alavanca: sem Kalshi (ou Kalshi velha) não sai entrada', () => {
  const slate = { meta: { date: '2026-11-17' }, games: [], players: [], lines: [] };
  assert.deepEqual(alavancaPlan({ slate, kalshi: null }).singles, []);
  const velha = { gen: new Date(Date.now() - 3 * 36e5).toISOString(), list: [{ name: 'X', mk: 'PTS', lines: { 9.5: .5 } }] };
  assert.equal(alavancaPlan({ slate, kalshi: velha }).pool, 0);
  assert.ok(ALV.dupla.ev >= .06 && ALV.tripla.ev >= .1 && ALV.evMin >= .04, 'cortes do método');
});
