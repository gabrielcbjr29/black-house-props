import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDist, evaluate, grade, median } from '../public/engine.js';

test('distribuições somam 1 e têm a média certa', () => {
  for (const [mu, d] of [[0.8, 1], [2.3, 1.6], [6, 2.2], [24, 2.1]]) {
    const D = makeDist(mu, d);
    assert.ok(Math.abs(D.cdf(400) - 1) < 1e-6, 'cdf termina em 1');
    let m = 0; for (let k = 0; k < 300; k++) m += k * (D.cdf(k) - D.cdf(k - 1));
    assert.ok(Math.abs(m - mu) / mu < .03, `média ${m} ≈ ${mu}`);
  }
});

test('linha inteira tem devolução (push)', () => {
  const pr = { line: 5, dist: makeDist(5, 1.4), vals: [5, 6, 4, 5, 7, 3, 5, 5, 6, 4], ctx: { logs: Array(10).fill(['2026-10-01', 'BOS', 1, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, '1']) }, opp: 'NYK', proj: 5, book: null, rank: null };
  const e = evaluate(pr);
  assert.ok(e.over.pPush > .1);
  assert.ok(Math.abs(e.over.p + e.under.p + e.over.pPush - 1) < 1e-9);
  assert.deepEqual(e.over.hits.L10, [3, 10]);
  assert.deepEqual(e.under.hits.L10, [3, 10]);
});

test('A+ só com odd', () => {
  const hits = { L10: [9, 10], L20: [16, 20] };
  assert.equal(grade(.8, hits, null), 'A');
  assert.equal(grade(.8, hits, .08), 'A+');
  assert.equal(grade(.56, hits, -.02), 'C');
});

test('mediana', () => { assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 2, 3]), 2.5); });
