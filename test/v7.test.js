import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDist, quantile, ladder, divergence, buildProps } from '../public/engine.js';
import { resultsText } from '../public/share.js';
import { radarAlerts } from '../collector/notify.js';

test('quantil fica dentro da distribuição e cresce com q', () => {
  const d = makeDist(24, 2);
  const a = quantile(d, .2), b = quantile(d, .5), c = quantile(d, .8);
  assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
  assert.ok(Math.abs(b - 24) <= 1);
});

test('escada: chance cai a cada degrau e respeita o máximo', () => {
  const slate = JSON.parse(readFileSync(new URL('../public/data/slate.json', import.meta.url)));
  const pr = buildProps(slate).find(x => x.mk === 'PTS');
  const rows = ladder(pr, { w: .55, max: 6 });
  assert.ok(rows.length >= 2 && rows.length <= 6);
  for (let i = 1; i < rows.length; i++) { assert.ok(rows[i].t > rows[i - 1].t); assert.ok(rows[i].p <= rows[i - 1].p + 1e-9); }
  assert.ok(Math.abs(rows[0].fair - 1 / rows[0].p) < .05);
});

test('divergência acha a casa fora do consenso', () => {
  const books = { A: { o: 1.91, u: 1.91 }, B: { o: 1.9, u: 1.92 }, C: { o: 1.92, u: 1.9 }, D: { o: 2.1, u: 1.75 } };
  const d = divergence(books);
  assert.equal(d.book, 'D'); assert.equal(d.side, 'over'); assert.ok(d.edge > .05 && d.edge < .15);
  assert.equal(divergence({ A: books.A, B: books.B }), null, 'precisa de 3+ casas');
});

test('radar no Telegram não repete alerta já enviado', () => {
  const slate = JSON.parse(readFileSync(new URL('../public/data/slate.json', import.meta.url)));
  const r1 = radarAlerts(slate, { min: .02, n: 3 });
  if (!r1) return; // demo sem divergência
  const r2 = radarAlerts(slate, { min: .02, n: 3, sent: r1.keys });
  assert.ok(!r2 || r2.keys.every(k => !r1.keys.includes(k)));
});

test('texto de resultados mostra reds e o aviso', () => {
  const S = { green: 2, red: 1, void: 0, profit: .8, roi: .1, avgOdd: 1.9, clv: null, n: 3, by: { grade: {} } };
  const tips = [{ kind: 'single', date: '2026-10-28', status: 'red', odd: 1.9, profit: -1, legs: [{ name: 'Fulano', side: 'over', line: 20.5, mk: 'PTS' }] }];
  const t = resultsText(S, tips, { cfg: { warn: 'perder' }, label: 'últimos 7 dias' });
  assert.match(t, /1 red/); assert.match(t, /❌/); assert.match(t, /perder dinheiro/);
});
