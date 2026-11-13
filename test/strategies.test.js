import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES, MK_EST, pickStrategies } from '../collector/strategies.js';

const base = { id: 'p1', n: 'A', t: 'DET', o: 'WAS', g: 'g1', mn: 30, st: 'ok', nt: 60, sc: 60, l10: [8, 10], k: 0, b: '99play', c9: 1, d: 1.85 };
test('modelo por mercado: uma estratégia por mercado monitorado', () => {
  assert.deepEqual(MK_EST, ['2PA', '2PM', '3PA', '3PM', 'FGM', 'FTA', 'FTM', 'RA']);
  assert.equal(new Set(STRATEGIES.map(s => s.id)).size, 8);
  const rows = [
    { ...base, m: 'RA', s: 'o', l: 8.5, p: .6, sc: 61 },                              // reb+ast
    { ...base, id: 'p2', m: 'FTA', s: 'u', l: 4.5, p: .66, sc: 70 },                  // lances tentados (nota maior)
    { ...base, id: 'p7', m: 'FTA', s: 'o', l: 3.5, p: .58, sc: 55 },                  // lances tentados (segunda)
    { ...base, id: 'p4', m: 'FTA', s: 'u', l: 4.5, p: .66, d: null, c9: 0 },          // sem linha da 99play: fora
    { ...base, id: 'p5', m: 'FGA', s: 'u', l: 14.5, p: .66 },                         // FGA: a 99play não abre
    { ...base, id: 'p6', m: 'PTS', s: 'o', l: 20.5, p: .6 },                          // pontos: fora dos mercados monitorados
    { ...base, id: 'p8', m: '3PA', s: 'u', l: 6.5, p: .52 },                          // chance abaixo de 55%: fora
    { ...base, id: 'p3', m: 'FTA', s: 'u', l: 4.5, p: .66, wo: { q: 'X', h: [2, 8], a: 5, x: 1 } }, // travada (desfalque)
  ];
  const r = pickStrategies({ date: '2026-11-13', gen: 'x', rows }, [{ id: 'g1', timeUTC: '2026-11-14T00:00:00Z' }]);
  const by = id => r.picks.filter(p => p.strategy_id === id).map(p => p.pid);
  assert.deepEqual(by('m-ra'), ['p1']);
  assert.deepEqual(by('m-fta'), ['p2', 'p7']);
  assert.deepEqual(by('m-3pa'), []);
  assert.equal(r.picks.length, 3);
  assert.equal(r.picks[0].tip_utc, '2026-11-14T00:00:00Z');
  assert.ok(!('test' in r.strategies[0]));
});
