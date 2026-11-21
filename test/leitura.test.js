import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aberturaDoDia, marcaMovimento } from '../collector/leitura.js';
import { correlOf } from '../public/correl.js';

test('movimento de linha: abertura do dia fica guardada; a linha do bot mostra abriu → agora só quando mexeu', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'bh-')), 'ab.json');
  const s1 = { meta: { date: '2026-11-21' }, lines: [{ pid: '1', mk: 'PTS', line: 20.5, books: { '99play': { o: 1.9, u: 1.9, at: 'a' } } }] };
  const f1 = { date: '2026-11-21', gen: 'g1', lines: [{ pid: '1', mk: 'PTS', line: 20.5, o: 2.1 }] };
  aberturaDoDia(path, s1, f1);
  const s2 = { ...s1, lines: [{ pid: '1', mk: 'PTS', line: 21.5, books: { '99play': { o: 1.85, u: 1.95 } } }] };
  const A = aberturaDoDia(path, s2, { ...f1, lines: [{ pid: '1', mk: 'PTS', line: 20.5, o: 1.95 }] });
  assert.deepEqual(A.l99['1|PTS'], [20.5, 1.9, 1.9, 'a'], 'a abertura não é sobrescrita');
  const rows = [{ id: '1', m: 'PTS', s: 'o', l: 21.5, d: 1.85, b: '99play' }, { id: '1', m: 'PTS', s: 'o', l: 20.5, d: 1.9, b: '99play', fo: 1.95 }];
  assert.equal(marcaMovimento(rows, A), 1);
  assert.deepEqual(rows[0].mv, [20.5, 1.9, 'a']); assert.equal(rows[1].mv, undefined, 'mesma linha e odd: sem movimento');
  assert.equal(rows[1].fmv, 2.1);
  assert.deepEqual(aberturaDoDia(path, { ...s2, meta: { date: '2026-11-22' } }, null).l99['1|PTS'][0], 21.5, 'dia novo começa outra abertura');
});

test('correlação: companheiro que sobe quando o foco bate o patamar; acerto encolhido ordena', () => {
  const g = (f, a, b) => ['d', { F: [34, 20, 5, f, 1], A: [30, a, 4, 3, 2], B: [28, b, 6, 2, 1] }];
  const games = [...Array(6).fill(0).map(() => g(10, 25, 8)), ...Array(14).fill(0).map(() => g(4, 12, 15))];
  const T = { games, players: { F: { n: 'Foco', lines: {} }, A: { n: 'Alfa', st: 'ok', lines: { PTS: { l: 18.5, o: 1.9, u: 1.9 } } }, B: { n: 'Beta', st: 'ok', lines: { PTS: { l: 10.5, o: 1.8, u: 2 } } } } };
  const R = correlOf(T, 'F', 'AST', 8);
  assert.equal(R.nG, 20); assert.equal(R.nH, 6);
  const a = R.list.find(x => x.n === 'Alfa'), b = R.list.find(x => x.n === 'Beta');
  assert.equal(a.rH, 1); assert.equal(a.rA, .3); assert.ok(a.ls > 0 && a.ls < a.lift, 'encolhido fica abaixo do bruto');
  assert.ok(b.ls < 0, 'Beta cai quando o foco bate');
  assert.equal(correlOf(T, 'F', 'AST', 20).list.length, 0, 'patamar que nunca bateu: nada');
});
