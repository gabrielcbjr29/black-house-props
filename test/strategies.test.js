import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES, MK_EST, pickStrategies } from '../collector/strategies.js';

const base = { id: 'p1', n: 'A', t: 'DET', o: 'WAS', g: 'g1', mn: 30, st: 'ok', nt: 60, sc: 60, l10: [8, 10], k: 0, b: '99play', c9: 1, d: 1.85 };
test('modelo por mercado: uma estratégia por mercado monitorado', () => {
  assert.deepEqual(MK_EST, ['2PA', '2PM', '3PA', '3PM', 'FGM', 'FTA', 'FTM', 'RA']);
  assert.equal(new Set(STRATEGIES.map(s => s.id)).size, 11);
  const rows = [
    { ...base, m: 'RA', s: 'o', l: 8.5, p: .6, sc: 61 },                              // reb+ast
    { ...base, id: 'p2', m: 'FTA', s: 'u', l: 4.5, p: .66, sc: 70 },                  // lances tentados (nota maior)
    { ...base, id: 'p7', m: 'FTA', s: 'o', l: 3.5, p: .58, sc: 55 },                  // lances tentados (segunda)
    { ...base, id: 'p4', m: 'FTA', s: 'u', l: 4.5, p: .66, d: null, c9: 0 },          // sem linha da 99play: fora
    { ...base, id: 'p5', m: 'FGA', s: 'u', l: 14.5, p: .66 },                         // FGA: a 99play não abre
    { ...base, id: 'p6', m: 'PTS', s: 'o', l: 20.5, p: .6, gr: 'B' },                 // pontos com nota B: fora
    { ...base, id: 'o1', m: 'PTS', s: 'o', l: 20.5, p: .62, gr: 'A+' },               // pontos, A+, EV 14,7%: oportunidade forte
    { ...base, id: 'o2', m: 'PF', s: 'u', l: 3.5, p: .58, gr: 'A' },                  // faltas, A, EV 7,3%: abaixo de 10%, fora
    { ...base, id: 'p8', m: '3PA', s: 'u', l: 6.5, p: .52 },                          // chance abaixo de 55%: fora
    { ...base, id: 'p3', m: 'FTA', s: 'u', l: 4.5, p: .66, wo: { q: 'X', h: [2, 8], a: 5, x: 1 } }, // travada (desfalque)
    { ...base, id: 'r1', m: '3PA', s: 'u', l: 2.5, p: .64, mn: 18 },                  // reserva: under de reserva
    { ...base, id: 'r2', m: '3PA', s: 'o', l: 2.5, p: .64, mn: 18 },                  // reserva no over: fora
    { ...base, id: 'r3', m: 'FTA', s: 'u', l: 1.5, p: .64, mn: 16, wo: { q: 'Y', h: [3, 4], a: 1, x: 1 } }, // titular fora: fora
    { ...base, id: 'r4', m: 'RA', s: 'u', l: 3.5, p: .64, mn: 8 },                    // menos de 12 min: fora
  ];
  const r = pickStrategies({ date: '2026-11-13', gen: 'x', rows }, [{ id: 'g1', timeUTC: '2026-11-14T00:00:00Z' }]);
  const by = id => r.picks.filter(p => p.strategy_id === id).map(p => p.pid);
  assert.deepEqual(by('m-ra'), ['p1']);
  assert.deepEqual(by('m-fta'), ['p2', 'p7']);
  assert.deepEqual(by('m-3pa'), []);
  assert.deepEqual(by('reserva-under'), ['r1']);
  assert.deepEqual(by('oport-forte'), ['o1']);
  assert.equal(r.picks.length, 5);
  assert.equal(r.picks[0].tip_utc, '2026-11-14T00:00:00Z');
  assert.deepEqual(by('top10-forte'), []); // sem Modelo BH (mb) nenhuma entra no top 10
  assert.ok(!('test' in r.strategies[0]));
});

test('top 10 forte: só quem está no Top 10 do bot, com 99play, EV 8%+ e nota A/A+', () => {
  const mk = (id, sc, extra = {}) => ({ ...base, id, m: 'RA', s: 'u', l: 7.5, p: .6, d: 2.0, gr: 'A', mb: 1, sc, ...extra });
  const rows = [mk('t1', 90), mk('t2', 80, { d: 1.75 }), mk('t3', 70, { gr: 'B' }), mk('t4', 60, { c9: 0, d: null }),
    ...Array.from({ length: 8 }, (_, i) => mk('f' + i, 50 - i, { d: 1.5 })), mk('t5', 10)]; // t5 fica fora do top 10
  const r = pickStrategies({ date: '2026-11-13', gen: 'x', rows }, []);
  assert.deepEqual(r.picks.filter(p => p.strategy_id === 'top10-forte').map(p => p.pid), ['t1']);
});
