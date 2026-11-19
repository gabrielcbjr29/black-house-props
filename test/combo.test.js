import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statOf, lineOf, parseLadder99, combosOf } from '../public/ladder99.js';

test('marcos da 99play: estatística pelo nome do mercado e linha pelo nome da odd', () => {
  assert.equal(statOf('Assistências do jogador (marcos)'), 'AST');
  assert.equal(statOf('Rebotes - Marcos'), 'REB');
  assert.equal(statOf('Triplo-duplo'), 'TD'); assert.equal(statOf('Duplo-Duplo'), 'DD');
  assert.equal(statOf('Cestas de 3 pontos'), '3PM'); assert.equal(statOf('Pontos'), 'PTS');
  assert.equal(statOf('Pontos + Rebotes'), null, 'combinado fica de fora');
  assert.equal(lineOf('10+'), 9.5); assert.equal(lineOf('Mais de 9.5'), 9.5); assert.equal(lineOf('Acima de 6,5'), 6.5);
  assert.equal(lineOf('7 ou mais'), 6.5); assert.equal(lineOf('Sim'), 'sim'); assert.equal(lineOf('Não'), null);
});

test('parseLadder99: escada por jogador, duplo-duplo pelo "Sim", odd suspensa fora', () => {
  const payload = { details: { 1: { extra: {
    markets: [
      { id: 1, typeId: 9001, name: 'Assistências (marcos)', childName: 'Josh Hart', desktopOddIds: [[11, 12, 13]] },
      { id: 2, typeId: 9002, name: 'Rebotes (marcos)', childName: 'Josh Hart', desktopOddIds: [[21, 22]] },
      { id: 3, typeId: 9003, name: 'Duplo-duplo', childName: 'Josh Hart', desktopOddIds: [[31, 32]] },
    ],
    odds: [
      { id: 11, name: '5+', price: 4.2, oddStatus: 0 }, { id: 12, name: '7+', price: 12.5, oddStatus: 0 }, { id: 13, name: '10+', price: 40, oddStatus: 1 },
      { id: 21, name: '6+', price: 1.6, oddStatus: 0 }, { id: 22, name: '9+', price: 4.1, oddStatus: 0 },
      { id: 31, name: 'Sim', price: 12, oddStatus: 0 }, { id: 32, name: 'Não', price: 1.05, oddStatus: 0 },
    ] } } } };
  const L = parseLadder99(payload)['josh hart'];
  assert.deepEqual(L.AST, { 4.5: 4.2, 6.5: 12.5 }); assert.deepEqual(L.REB, { 5.5: 1.6, 8.5: 4.1 }); assert.equal(L.DD, 12);
  // /combo: Ast 6,5+ e Reb 5,5+ — Finta 14,93 × 1,59 × 0,874 contra 99play 12,5 × 1,6 × 0,90
  const P = { legs: { REB: [[5.5, 1.59, null], [8.5, 4.6, null]], AST: [[6.5, 14.93, null]], DD: 14.65 }, last: [[6, 7, 0, 0], [3, 2, 0, 0], [9, 4, 1, 0]] };
  const C = combosOf(P, 'ar', L);
  const x = C.find(c => c.legs.map(l => l.mk + l.line).join() === 'AST6.5,REB5.5');
  assert.equal(x.fin, Math.round(14.93 * 1.59 * .874 * 100) / 100); assert.equal(x.n99, Math.round(12.5 * 1.6 * .9 * 100) / 100);
  assert.ok(x.dif > 0, 'Finta paga mais'); assert.equal(x.h10, 1);
  assert.ok(C.every(c => c.fin >= 15), 'só 15+ na Finta');
  const D = combosOf(P, 'dd', L); assert.ok(D.length && D.every(c => c.legs[1].mk === 'DD'));
  assert.equal(D.find(c => c.legs[0].mk === 'REB' && c.legs[0].line === 8.5).h20, 1);
  assert.deepEqual(combosOf(P, 'td', L), [], 'sem triplo-duplo na Finta, aba vazia');
});
