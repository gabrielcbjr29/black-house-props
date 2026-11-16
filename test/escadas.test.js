import test from 'node:test';
import assert from 'node:assert/strict';
import { combos } from '../scripts/escadas.mjs';

test('escadas: duplas e triplas só com jogos diferentes, sem repetir jogador, a de maior chance primeiro', () => {
  const list = [
    { pid: 'a', game: 'g1', pj: .4, sep: 4 }, { pid: 'b', game: 'g1', pj: .38, sep: 4 }, { pid: 'c', game: 'g2', pj: .3, sep: 5 },
    { pid: 'd', game: 'g3', pj: .28, sep: 5 }, { pid: 'e', game: 'g4', pj: .2, sep: 6 }, { pid: 'f', game: 'g5', pj: .1, sep: 7 }];
  const D = combos(list, 2);
  assert.deepEqual(D[0].pids, ['a', 'c']);
  assert.ok(Math.abs(D[0].p - .12) < 1e-9 && Math.abs(D[0].fair - 8.333) < .01);
  for (const d of D) assert.notEqual(list.find(x => x.pid === d.pids[0]).game, list.find(x => x.pid === d.pids[1]).game);
  assert.equal(new Set(D.flatMap(d => d.pids)).size, D.length * 2);
  const T = combos(list, 3, 2);
  assert.ok(T.every(t => new Set(t.pids.map(id => list.find(x => x.pid === id).game)).size === 3));
});
