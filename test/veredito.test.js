import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickClv, clvStats, veredito, vereditoCanal, edgeBand, ppOf } from '../public/clv.js';
import { buildProps, lavada } from '../public/engine.js';

test('CLV de uma entrada: pontos de chance na mesma linha; linha que andou só conta a favor/contra', () => {
  assert.deepEqual(pickClv({ side: 'o', open_line: 5.5, open_odd: 1.9, line: 5.5, odd: 1.8 }), { v: 'f', pp: 2.92 });
  assert.equal(pickClv({ side: 'u', open_line: 5.5, open_odd: 1.8, line: 5.5, odd: 1.9 }).v, 'c');
  assert.deepEqual(pickClv({ side: 'u', open_line: 5.5, open_odd: 1.9, line: 4.5, odd: 1.85 }), { v: 'f', pp: null });
  assert.deepEqual(pickClv({ side: 'o', open_line: 5.5, open_odd: 1.9, line: 4.5, odd: 1.85 }), { v: 'c', pp: null });
  assert.equal(pickClv({ side: 'o', open_line: null, open_odd: 1.9, line: 5.5, odd: 1.9 }).v, 's');
  assert.equal(ppOf(2, 1.8), 5.56);
});

test('veredito: menos de 30 leituras = cedo demais; t ≥ 2 bate; t ≤ −2 atrás; ROI com faixa de sorte', () => {
  const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ v: 'f', pp: f(i), status: i % 2 ? 'green' : 'red', profit: i % 2 ? .9 : -1 }));
  assert.equal(clvStats(mk(20, i => 1 + i % 3)).ver.k, 'cedo');
  const bom = clvStats(mk(40, i => 1 + (i % 3) - 1)); assert.equal(bom.ver.k, 'bate'); assert.ok(bom.t >= 2);
  assert.equal(clvStats(mk(40, i => -1 - (i % 3) + 1)).ver.k, 'atras');
  assert.equal(clvStats(mk(40, i => (i % 2 ? 1 : -1))).ver.k, 'semprova');
  const s = clvStats(mk(40, () => 0)); assert.equal(s.g, 20); assert.equal(s.r, 20); assert.equal(s.lucro, -2); assert.ok(s.faixa > .25 && s.faixa < .35);
});

test('veredito do papel agrupa por método, lado e faixa de valor (Tendência fora das faixas)', () => {
  const rows = [
    { strategy_id: 'minutos', side: 'o', open_line: 10.5, open_odd: 1.9, line: 10.5, odd: 1.8, edge: .06, status: 'green', profit: .9 },
    { strategy_id: 'v2-pts', side: 'u', open_line: 20.5, open_odd: 1.85, line: 20.5, odd: 1.9, edge: .12, status: 'red', profit: -1 },
    { strategy_id: 'm-ra', side: 'u', open_line: 8.5, open_odd: 1.9, line: 8.5, odd: 1.9, edge: .02, status: 'aberta', profit: 0 },
    { strategy_id: 'tendencia', side: 'o', open_line: 3.5, open_odd: 2, line: 4.5, odd: 1.9, edge: null, status: 'green', profit: 1 },
  ];
  const V = veredito(rows, { nomes: { 'm-ra': 'Reb+Ast' } });
  assert.equal(V.total.n, 4);
  assert.deepEqual(V.metodo.map(x => x.k), ['Método Minutos', 'Modelo v2 (todos os mercados)', 'Modelo por mercado', 'Tendência']);
  assert.deepEqual(V.lado.map(x => [x.k, x.n]), [['Over', 2], ['Under', 2]]);
  assert.deepEqual(V.faixa.map(x => x.k), ['0–3%', '5–10%', '10–15%']);
  assert.equal(V.estrategia.find(x => x.k === 'm-ra').nome, 'Reb+Ast');
  assert.equal(edgeBand(-.01), 'EV negativo'); assert.equal(edgeBand(.15), '15%+'); assert.equal(edgeBand(null), 'Sem EV');
});

test('veredito do canal: Criar Aposta mede o CLV pelo produto das pernas, não pela odd estimada', () => {
  const legs = [{ odd: 2, close: 1.9, cline: 10.5, line: 10.5 }, { odd: 2, close: 1.9, cline: 5.5, line: 5.5 }];
  const posts = [
    { kind: 'simples', band: 'x', odd: 1.9, status: 'green', profit: .9, clv: { bateu: true, closeOdd: 1.8 }, legs: [{ odd: 1.9, close: 1.8, cline: 4.5, line: 4.5 }] },
    { kind: 'multipla', band: 'ca-123', odd: 3.6, status: 'red', profit: -.5, clv: { bateu: true, closeOdd: 3.61 }, legs },
  ];
  const V = vereditoCanal(posts);
  assert.deepEqual(V.tipos.map(x => x.k), ['Simples', 'Criar Aposta']);
  assert.equal(V.tipos[1].clv, ppOf(4, 3.61)); // 2 × 2 = 4 na entrada, não a odd estimada 3,6
});

test('lavada: chance de 20+ cresce com o handicap; curva nova só entra com lav v2', () => {
  const a = lavada(0), b = lavada(10), c = lavada(15);
  assert.ok(a.p20 < b.p20 && b.p20 < c.p20);
  assert.ok(a.fSt > 1 && c.fSt < 1 && c.fSt > .95, 'efeito medido é pequeno');
  const slate = JSON.parse(readFileSync(new URL('./fixtures/slate-nop-gsw.json', import.meta.url), 'utf8'));
  const big = { ...slate, games: slate.games.map(g => ({ ...g, spread: -14 })) };
  const v1 = buildProps(big), v2 = buildProps(big, { lav: 'v2' });
  assert.ok(v1.some(p => p.ctx.adj.some(x => x.lb.startsWith('Risco de lavada') && x.f === .94)), 'padrão segue a regra antiga');
  const st2 = v2.filter(p => p.ctx.adj.some(x => x.lb.startsWith('Risco de lavada')));
  assert.ok(st2.length && st2.every(p => p.ctx.adj.find(x => x.lb.startsWith('Risco de lavada')).f > .94));
});
