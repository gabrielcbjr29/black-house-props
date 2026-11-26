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
  // jogo dele ainda não saiu no boxscore: espera; quando sai, liquida (e reabre devolvida errada)
  const E = choose({ date: '2026-11-21', at: 'x', cands: [cand({ team: 'TOR' })] }, []);
  settle(E, { stats: { '2026-11-21': { 9: [30, 10] } }, games: { '2026-11-21': [['e1', 'BOS', 'NYK']] } });
  assert.equal(E[0].status, 'aberta');
  E[0].status = 'devolvida'; E[0].why = 'não jogou';
  settle(E, { stats: { '2026-11-21': { 1: [30, 24] } }, games: { '2026-11-21': [['e2', 'TOR', 'MIA']] } });
  assert.equal(E[0].status, 'green');
});

test('radar: trilha Kalshi só perto do jogo, com chance e EV da Kalshi', async () => {
  const { kalshiCands, chooseAll } = await import('../scripts/radar.mjs');
  const at = '2026-11-22T01:00:00Z';
  const S = { date: '2026-11-21', at, cands: [
    cand({ pid: '1', pk: .56, why: 'EV abaixo da regra', ok: false, tip: '2026-11-22T02:30:00Z' }),   // 90 min, EV_k 12%
    cand({ pid: '2', pk: .56, why: '', tip: '2026-11-22T06:00:00Z' }),                                 // 5h antes: fora da janela
    cand({ pid: '3', pk: .51, why: '', tip: '2026-11-22T02:00:00Z' }),                                 // EV_k 2%: abaixo de 4%
    cand({ pid: '4', pk: .6, why: 'jogador em dúvida', ok: false, tip: '2026-11-22T02:00:00Z' })] };              // trava que não é de EV
  const K = kalshiCands(S);
  assert.deepEqual(K.filter(c => c.ok).map(c => c.pid), ['1']);
  assert.equal(K.find(c => c.pid === '1').p, .56);
  const B = chooseAll(S, []);
  assert.deepEqual(B.map(b => b.tr + b.pid), ['bh2', 'bh3', 'k1']);
  assert.ok(B.find(b => b.tr === 'k').id.startsWith('k|'));
});

test('canal: multis null = padrão (6 múltiplas); [] = sem múltiplas (só simples)', async () => {
  const { specsOf, normCfg } = await import('../scripts/canal.mjs');
  assert.equal(specsOf(normCfg({})).length, 6);
  assert.equal(specsOf(normCfg({ multis: [] })).length, 0);
  assert.equal(specsOf(normCfg({ multis: [{ odd: 10, pernas: 4, lado: 'o' }] })).length, 1);
});
