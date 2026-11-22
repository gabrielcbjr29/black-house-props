import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stakeOf, sharpAt, choose, updateClose, settle, stats, clvOf, CFG } from '../scripts/radar.mjs';

const cand = (o = {}) => ({ pid: '1', name: 'A', team: 'BOS', opp: 'SAC', game: 'g1', tip: '2026-11-22T03:00:00Z', mk: 'PTS', casa: '99play', side: 'o', line: 20.5, odd: 2, p: .56, ev: .12, ok: true, ...o });

test('radar: stake de Kelly fracionado com tetos', () => {
  assert.equal(stakeOf(.5, 2), 0);                       // EV zero: não compra
  assert.equal(stakeOf(.56, 2), 2);                      // f = 12% × 1/4 × 100 = 3u → teto 2u
  assert.equal(stakeOf(.53, 2), 1.5);                    // f = 6% × 25 = 1,5u
  assert.equal(stakeOf(.35, 3.5), 1);                    // odd alta: teto 1u
  assert.equal(stakeOf(.505, 2), .25);
});
test('radar: segunda opinião da bolsa na mesma linha e em outra linha', () => {
  const L = [{ line: 20.5, o: 1.9, u: 1.9 }];
  assert.ok(Math.abs(sharpAt(L, 20.5, 'o') - .5) < 1e-9);
  assert.equal(sharpAt([], 20.5, 'o'), null);
  assert.equal(sharpAt(L, 25.5, 'o', null), null);       // sem dispersão não converte linha
});
test('radar: travas (1 por jogador, 3 por jogo, sem repetir)', () => {
  const S = { date: '2026-11-21', at: 'x', cands: [cand({ ev: .2, line: 22.5 }), cand({ ev: .15 }), cand({ pid: '2', ev: .1 }), cand({ pid: '3', ev: .09 }), cand({ pid: '4', ev: .08 }), cand({ pid: '5', ok: false, ev: .3 })] };
  const b = choose(S, []);
  assert.deepEqual(b.map(x => x.pid), ['1', '2', '3']);  // jogador 1 uma vez só (a de maior EV), teto de 3 no jogo
  assert.equal(b[0].line, 22.5);
  assert.equal(choose(S, b).length, 0);                   // já comprado: não repete
});
test('radar: fechamento, liquidação e CLV', () => {
  const C = choose({ date: '2026-11-21', at: 'x', cands: [cand()] }, []);
  updateClose(C, { at: 'y', cands: [cand({ odd: 1.8 })] }, Date.parse('2026-11-22T01:00:00Z'));
  assert.equal(C[0].fc, 1.8); assert.ok(clvOf(C[0]) > 0);   // pegou 2,00 e fechou 1,80: bateu o fechamento
  settle(C, { stats: { '2026-11-21': { 1: [30, 24] } } });
  assert.equal(C[0].status, 'green'); assert.equal(C[0].lucro, 2); assert.equal(C[0].lucro1, 1);
  const S = stats(C); assert.equal(S.green, 1); assert.equal(S.roi, 1); assert.equal(S.bate, 1);
  const D = choose({ date: '2026-11-21', at: 'x', cands: [cand()] }, []);
  settle(D, { stats: { '2026-11-21': { 1: [0, 0] } } }); assert.equal(D[0].status, 'devolvida');
});
