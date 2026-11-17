import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarPool, criarPlan, CRIAR } from '../scripts/criar.mjs';
import { applyAlavanca, cardHTML } from '../scripts/canal.mjs';

const slate = JSON.parse(readFileSync(new URL('./fixtures/slate-nop-gsw.json', import.meta.url), 'utf8')); // GSW @ NOP, 16/11 (leitura das 22:50 UTC)
const now = Date.parse(slate.games[0].timeUTC) - 3 * 36e5;

test('Criar Aposta: só over, um jogador por entrada, valor 10%+ na odd estimada (0,90× o produto)', () => {
  const P = criarPool({ slate, now });
  assert.ok(P.length >= 1, 'acha entrada no jogo');
  for (const x of P) {
    assert.equal(new Set(x.legs.map(l => l.pid)).size, 1, 'um jogador');
    assert.ok(x.legs.length >= 2 && x.legs.length <= 3);
    assert.ok(x.legs.every(l => l.side === 'o' && CRIAR.mk.includes(l.mk) && l.met === 'criar'));
    const sep = x.legs.reduce((a, l) => a * l.odd, 1);
    assert.ok(Math.abs(x.odd - sep * CRIAR.K) < .02, 'odd estimada');
    assert.ok(x.evc >= CRIAR.evMin && Math.abs(x.prob * x.odd - 1 - x.evc) < .01);
    assert.ok(x.min > x.fair && x.odd >= x.min, 'odd mínima = justa + 5%');
    assert.equal(x.un, x.odd >= CRIAR.altaOdd ? CRIAR.unAlta : CRIAR.un);
    assert.equal(x.band, `ca-${x.legs[0].pid}`);
  }
  assert.equal(new Set(P.map(x => x.band)).size, P.length, 'uma por jogador');
  for (let i = 1; i < P.length; i++) assert.ok(P[i - 1].evc >= P[i].evc, 'ordem por valor');
});

test('Criar Aposta: jogo começado, jogador já postado hoje e sem leitura da 99play ficam de fora', () => {
  assert.deepEqual(criarPool({ slate, now: Date.parse(slate.games[0].timeUTC) + 1 }), []);
  const P = criarPool({ slate, now });
  assert.equal(criarPlan({ slate, now, posted: { bands: new Set([P[0].band]) } }).length, P.length - 1);
  const sem99 = { ...slate, lines: slate.lines.map(l => ({ ...l, books: Object.fromEntries(Object.entries(l.books).filter(([b]) => b !== '99play')) })) };
  assert.deepEqual(criarPool({ slate: sem99, now }), []);
});

test('Canal teste (Método Alavanca) ganha as Criar Aposta como múltiplas; o card mostra odd estimada, justa e mínima', () => {
  const hub = { canais: [{ id: 'teste', cfg: { metodo: 'alavanca' } }, { id: 'oficial', cfg: {} }], postados: [] };
  const P = applyAlavanca({ v: 2, date: slate.meta.date, canais: { teste: { singles: [], multis: [] }, oficial: { singles: [], multis: [] } } }, { hub, slate, kalshi: null, now });
  const ca = P.canais.teste.multis.filter(m => m.ca);
  assert.equal(ca.length, criarPool({ slate, now }).length);
  assert.equal(P.canais.teste.criar, ca.length);
  assert.ok(ca.every(m => m.img === `canal/m-teste-${m.band}.jpg` && m.cap));
  assert.equal(P.canais.oficial.multis.length, 0, 'só no canal do método');
  const h = cardHTML(ca[0]);
  assert.match(h, /Criar Aposta/); assert.match(h, /Odd estimada/); assert.match(h, /Entre a partir de/);
});
