import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSlateLines, mergeTopLines } from '../collector/topodds.js';

test('odds dos tops: linha principal = a com mais casas, odd = mediana, casa por nome', () => {
  const players = [{ id: '1', name: 'Jaren Jackson Jr.' }, { id: '2', name: 'Luka Dončić' }];
  const stored = [
    { name: 'Jaren Jackson Jr', mk: 'RA', line: 6.5, books: { A: { o: 1.9, u: 1.9 }, B: { o: 1.87, u: 1.95 }, C: { o: 2.0, u: 1.8 } } },
    { name: 'Jaren Jackson Jr', mk: 'RA', line: 7.5, books: { A: { o: 2.4, u: 1.55 } } },
    { name: 'Luka Doncic', mk: 'FGM', line: 10.5, books: { A: { o: 1.83, u: 1.95 }, B: { o: 1.87 } } },
    { name: 'Ninguem', mk: 'RA', line: 3.5, books: { A: { o: 1.9, u: 1.9 } } },
  ];
  const out = toSlateLines(stored, players);
  assert.equal(out.length, 2);
  const ra = out.find(l => l.pid === '1');
  assert.equal(ra.line, 6.5);
  assert.deepEqual(ra.books, { 'Casas EUA (3)': { o: 1.9, u: 1.9 } });
  const fg = out.find(l => l.pid === '2');
  assert.deepEqual(fg.books, { 'Casas EUA (1)': { o: 1.83, u: 1.95 } }, 'casa sem os dois lados fica de fora');
  const slate = { lines: [{ pid: '2', mk: 'FGM', line: 9.5, books: { K: { o: 2, u: 1.8 } } }] };
  assert.equal(mergeTopLines(slate, out), 1, 'não passa por cima de linha que já existe');
  assert.equal(slate.lines.length, 2);
});
