import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lines99, updateClosing, legVerdict, postClv } from '../public/clv.js';

const slate = { meta: { date: '2026-11-16' }, lines: [
  { pid: '1', mk: 'AST', line: 6.5, books: { '99play': { o: 1.83, u: 1.9, at: '2026-11-16T23:35:00Z' } } },
  { pid: '2', mk: 'PA', line: 13.5, books: { '99play': { o: 1.8, u: 1.95, at: '2026-11-16T23:35:00Z' } } },
  { pid: '3', mk: 'PTS', line: 20.5, books: { fanduel: { o: 1.9, u: 1.9 } } },
] };

test('linhas da 99play em arquivo leve (só a 99play)', () => {
  const L = lines99(slate, 'G');
  assert.deepEqual(L.l['1|AST'], [6.5, 1.83, 1.9, '2026-11-16T23:35:00Z']);
  assert.equal(L.l['3|PTS'], undefined); assert.equal(L.date, '2026-11-16');
});

test('fechamento: grava a leitura feita antes do jogo e para quando o jogo começa', () => {
  const L = lines99(slate).l, tip = '2026-11-17T00:00:00Z';
  const legs = [{ pid: '1', mk: 'AST', side: 'o', line: 6.5, odd: 1.83, tip }, { pid: '2', mk: 'PA', side: 'o', line: 15.5, odd: 1.77, tip }];
  const r = updateClosing(legs, L, { now: Date.parse('2026-11-16T23:50:00Z') });
  assert.ok(r.changed); assert.equal(r.legs[0].close, 1.83); assert.equal(r.legs[1].cline, 13.5);
  assert.equal(updateClosing(r.legs, L, { now: Date.parse('2026-11-16T23:55:00Z') }).changed, false, 'mesma leitura: não regrava');
  assert.equal(updateClosing(legs, L, { now: Date.parse('2026-11-17T00:05:00Z') }).changed, false, 'jogo começou: não mexe');
  const late = { '1|AST': [6.5, 1.7, 2.1, '2026-11-17T00:10:00Z'] };
  assert.equal(updateClosing(legs, late, { now: Date.parse('2026-11-16T23:50:00Z') }).changed, false, 'leitura depois do início não vale');
});

test('CLV: odd melhor que a de fechamento, linha que andou a favor ou contra', () => {
  assert.equal(legVerdict({ side: 'o', line: 6.5, odd: 2.0, cline: 6.5, close: 1.91 }).v, 'f');
  assert.equal(legVerdict({ side: 'o', line: 6.5, odd: 1.8, cline: 6.5, close: 1.87 }).v, 'c');
  assert.equal(legVerdict({ side: 'o', line: 6.5, odd: 1.83, cline: 6.5, close: 1.83 }).v, 'n');
  assert.equal(legVerdict({ side: 'u', line: 14.5, odd: 1.87, cline: 13.5, close: 1.8 }).v, 'f', 'under: linha caiu = a favor');
  assert.deepEqual(legVerdict({ side: 'o', line: 15.5, odd: 1.77, cline: 13.5, close: 1.8 }), { v: 'c', pts: -2 }, 'over: linha caiu = contra');
  assert.equal(legVerdict({ side: 'o', line: 6.5, odd: 1.8 }).v, 's');
  const s = postClv({ odd: 2, legs: [{ side: 'o', line: 3.5, odd: 2, cline: 3.5, close: 1.91 }] });
  assert.equal(s.bateu, true); assert.equal(s.closeOdd, 1.91); assert.equal(s.clv, 0.047);
  const m = postClv({ odd: 7, legs: [{ side: 'u', line: 5.5, odd: 1.6, cline: 4.5, close: 1.7 }, { side: 'o', line: 1.5, odd: 1.8, cline: 1.5, close: 1.7 }, { side: 'o', line: 15.5, odd: 1.8, cline: 13.5, close: 1.8 }] });
  assert.equal(m.f, 2); assert.equal(m.c, 1); assert.equal(m.bateu, true); assert.equal(m.closeOdd, null, 'linha mudou: sem odd de fechamento da múltipla');
  assert.equal(postClv({ odd: 2, legs: [{ side: 'o', line: 1, odd: 2 }] }).bateu, null);
});
