import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES, pickStrategies } from '../collector/strategies.js';

const base = { id: 'p1', n: 'A', t: 'DET', o: 'WAS', g: 'g1', mn: 30, st: 'ok', nt: 60, l10: [8, 10], k: 0 };
test('estratégias: ids únicos e regra de cada uma', () => {
  assert.equal(new Set(STRATEGIES.map(s => s.id)).size, STRATEGIES.length);
  const rows = [
    { ...base, m: 'PTS', s: 'o', l: 20.5, p: .6, d: 1.9, b: '99play', c9: 1 },          // valor99 (EV 14%) e pts-valor
    { ...base, id: 'p2', m: 'FTA', s: 'u', l: 4.5, p: .66, d: null, l10: [7, 10] },     // under-tent
    { ...base, id: 'p3', m: 'FTA', s: 'u', l: 4.5, p: .66, l10: [7, 10], wo: { q: 'X', h: [2, 8], a: 5, x: 1 } }, // travada
  ];
  const r = pickStrategies({ date: '2026-11-13', gen: 'x', rows }, [{ id: 'g1', timeUTC: '2026-11-14T00:00:00Z' }]);
  const by = id => r.picks.filter(p => p.strategy_id === id).map(p => p.pid);
  assert.deepEqual(by('valor99'), ['p1']);
  assert.deepEqual(by('pts-valor'), ['p1']);
  assert.deepEqual(by('under-tent'), ['p2']);
  assert.equal(r.picks[0].tip_utc, '2026-11-14T00:00:00Z');
  assert.ok(!('test' in r.strategies[0]));
});
