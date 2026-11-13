import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES, pickStrategies } from '../collector/strategies.js';

const base = { id: 'p1', n: 'A', t: 'DET', o: 'WAS', g: 'g1', mn: 30, st: 'ok', nt: 60, l10: [8, 10], k: 0 };
test('estratégias: ids únicos e regra de cada uma', () => {
  assert.equal(new Set(STRATEGIES.map(s => s.id)).size, STRATEGIES.length);
  const rows = [
    { ...base, m: 'RA', s: 'o', l: 8.5, p: .6, d: 1.9, b: '99play', c9: 1 },            // valor99 (EV 14%) e ra-valor
    { ...base, id: 'p6', m: 'PTS', s: 'o', l: 20.5, p: .6, d: 1.9, b: '99play', c9: 1 }, // pontos: fora dos mercados monitorados
    { ...base, id: 'p2', m: 'FTA', s: 'u', l: 4.5, p: .66, d: 1.8, b: '99play', c9: 1, l10: [7, 10] }, // under-tent
    { ...base, id: 'p4', m: 'FTA', s: 'u', l: 4.5, p: .66, d: null, l10: [7, 10] },     // sem linha da 99play: fora
    { ...base, id: 'p5', m: 'FGA', s: 'u', l: 14.5, p: .66, d: 1.8, b: '99play', c9: 1, l10: [7, 10] }, // FGA: a 99play não abre
    { ...base, id: 'p3', m: 'FTA', s: 'u', l: 4.5, p: .66, d: 1.8, c9: 1, l10: [7, 10], wo: { q: 'X', h: [2, 8], a: 5, x: 1 } }, // travada
  ];
  const r = pickStrategies({ date: '2026-11-13', gen: 'x', rows }, [{ id: 'g1', timeUTC: '2026-11-14T00:00:00Z' }]);
  const by = id => r.picks.filter(p => p.strategy_id === id).map(p => p.pid);
  assert.deepEqual(by('valor99'), ['p2', 'p1']); // ordem: valor esperado (p2 18,8%, p1 14%); p5 (FGA), p4 (sem 99play) e p6 (pontos) fora
  assert.deepEqual(by('ra-valor'), ['p1']);
  assert.deepEqual(by('under-tent'), ['p2']);
  assert.equal(r.picks[0].tip_utc, '2026-11-14T00:00:00Z');
  assert.ok(!('test' in r.strategies[0]));
});
