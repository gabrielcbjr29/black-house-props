import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade } from '../public/engine.js';
import { summarize } from '../public/tips.js';

test('trava de consistência: A+ precisa de 7/10 e 60% em 20; pouca amostra limita a A', () => {
  assert.equal(grade(.6, { L10: [7, 10], L20: [13, 20] }, .07), 'A+');
  assert.equal(grade(.6, { L10: [6, 10], L20: [13, 20] }, .07), 'A', '6/10 não chega a A+');
  assert.equal(grade(.6, { L10: [7, 10], L20: [11, 20] }, .07), 'A', '55% em 20 não chega a A+');
  assert.equal(grade(.6, { L10: [7, 10], L20: [13, 20] }, .07, 8), 'A', 'menos de 10 jogos');
  assert.equal(grade(.55, { L10: [5, 10], L20: [10, 20] }, .035), 'B', 'A exige 6/10');
});

test('desempenho por faixa de chance com previsto x acerto', () => {
  const t = (p, status, profit) => ({ date: '2026-10-28', ts: '1', kind: 'single', odd: 1.9, units: 1, status, profit, legs: [{ mk: 'PTS', side: 'over', p, grade: 'A' }] });
  const S = summarize([t(.62, 'green', .9), t(.61, 'red', -1), t(.72, 'green', .9)]);
  assert.equal(S.by.pband['60–64%'].n, 2);
  assert.equal(S.by.pband['60–64%'].hit, .5);
  assert.ok(Math.abs(S.by.pband['60–64%'].pred - .615) < 1e-9);
  assert.equal(S.by.pband['70%+'].n, 1);
});
