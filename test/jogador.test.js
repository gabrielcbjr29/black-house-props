import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJogo, montaTime, ajuste, calibra, rotacao, ganhos, porJogador } from '../public/jogador-core.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/espn-pbp-chi-tor.json', import.meta.url)));

test('jogador: lê o jogada a jogada da ESPN', () => {
  const g = parseJogo(fx, '2026-10-21');
  assert.equal(g.h, 'TOR'); assert.equal(g.a, 'CHI'); assert.equal(g.id, '401909837');
  assert.deepEqual(g.box.CHI[0], [4397189, 19, 15, 5, 10, 0, 3, 5, 6, 8, 1, 4, 4]);
  assert.equal(g.box.CHI.length, 2, 'quem não jogou fica de fora');
  assert.equal(g.nm[4871145], 'Josh Giddey');
  // arremessos: lance livre fora; assistência só em cesta; toco não vira assistência
  assert.equal(g.sh.length, 5);
  assert.deepEqual(g.sh.find(s => s[1] === 4397189), ['CHI', 4397189, 4871145, 1, 2, 25, 1]);
  assert.deepEqual(g.sh.find(s => s[1] === 4433134 && s[5] === 27), ['TOR', 4433134, 0, 0, 2, 27, 2]);
  assert.deepEqual(g.sh.find(s => s[1] === 4871145), ['CHI', 4871145, 0, 0, 3, 28, 26]);
  // rebotes: lugar do arremesso que errou; depois de lance livre não entra
  assert.deepEqual(g.rb, [['TOR', 6450, 0, 28, 26, 3], ['TOR', 4433134, 1, 26, 9, 2], ['CHI', 4871145, 0, 27, 2, 2]]);
  assert.equal(parseJogo({ ...fx, header: { competitions: [{ ...fx.header.competitions[0], status: { type: { completed: false } } }] } }), null);
});

// time sintético: A, B, C, D jogam sempre; E joga os 6 primeiros e fica fora dos jogos 6 e 7, volta no 8.
function sintetico(repasse) {
  const jogos = [];
  for (let g = 0; g < 10; g++) {
    const foraE = g === 6 || g === 7;
    const box = [];
    const base = { 1: 20, 2: 16, 3: 12, 4: 8, 5: 14 };
    for (const p of [1, 2, 3, 4, 5]) {
      if (p === 5 && foraE) continue;
      // fga = pontos/1 (eficiência 1 ponto por tentativa), sem lance livre
      let pts = base[p];
      if (foraE) pts += repasse * 14 * base[p] / 56;
      box.push([p, 30, pts, Math.round(pts / 2), pts, 0, 0, 0, 0, 5, 3, 1, 4]);
    }
    jogos.push({ id: String(g), d: `2026-11-${String(10 + g).padStart(2, '0')}`, h: 'AAA', a: 'BBB', nm: { 1: 'Um', 2: 'Dois', 3: 'Três', 4: 'Quatro', 5: 'Cinco' }, box: { AAA: box, BBB: [] }, sh: [], rb: [] });
  }
  return montaTime('AAA', jogos);
}

test('jogador: quem está fora redistribui na proporção do volume', () => {
  const t = sintetico(0);
  assert.deepEqual(rotacao(t).sort(), [1, 2, 3, 4, 5]);
  const o = ajuste(t, 'pts', new Set([5]), 1);
  assert.equal(o[5].a, null);
  // E tem média de 14 pontos em 8 jogos; com repasse de 100% os 4 dividem 14 pontos na proporção 20:16:12:8
  const ganho = [1, 2, 3, 4].reduce((s, i) => s + (o[i].a - o[i].n), 0);
  assert.ok(Math.abs(ganho - 14) < 1e-9);
  assert.ok(Math.abs((o[1].a - o[1].n) - 14 * 20 / 56) < 1e-9);
  const meio = ajuste(t, 'pts', new Set([5]), 0.5);
  assert.ok(Math.abs((meio[1].a - meio[1].n) - 7 * 20 / 56) < 1e-9);
});

test('jogador: calibração mede o repasse real', () => {
  const k1 = calibra([sintetico(1)]).pts, k0 = calibra([sintetico(0)]).pts, kM = calibra([sintetico(0.6)]).pts;
  assert.equal(k1.n, 2); assert.ok(k1.bruto > 0.95, `k1 ${k1.bruto}`); assert.ok(k0.bruto < 0.05, `k0 ${k0.bruto}`); assert.ok(kM.bruto > 0.5 && kM.bruto < 0.7, `kM ${kM.bruto}`);
  // poucos jogos: puxa para 60%
  assert.ok(k1.k < k1.bruto && k1.k > 0.6 && k0.k > k0.bruto && k0.k < 0.6);
});

test('jogador: ganhos dos desfalques do dia', () => {
  const t = sintetico(0.6), K = calibra([t]);
  const g = ganhos(t, [5], K);
  assert.equal(g[0].pid, 1); assert.equal(g[0].nome, 'Um'); assert.ok(g[0].pts > 2);
  assert.deepEqual(ganhos(t, [99], K), [], 'quem não é da rotação não mexe');
  assert.equal(Object.keys(porJogador(t)).length, 5);
});
