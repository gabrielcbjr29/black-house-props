import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gradeFut, findEvents } from '../public/futebol.js';

const FX = JSON.parse(readFileSync(new URL('./fixtures/futebol-21-11.json', import.meta.url)));
const G = t => gradeFut(t, FX.events, FX.summaries);

test('futebol: as duas entradas reais do canal (21/11) dão green', () => {
  const a = G('Thibaut Courtois - Mais de 1.5\nDefesas - Jogador - Real Madrid x Celta Vigo 1.88\n© Hoje - 17:00');
  assert.equal(a.status, 'green'); assert.equal(a.legs[0].valor, 3); assert.equal(a.legs[0].quem, 'Thibaut Courtois');
  const b = G('É\n\nSimples\n\nsig Newcastle x @ Arsenal 456 > 1,70\nArsenal total\n\nMais de 1,5\n21/11 * 14:30');
  assert.equal(b.status, 'green'); assert.equal(b.legs[0].quem, 'Arsenal'); assert.equal(b.legs[0].valor, 2);
});
test('futebol: Newcastle não confunde com Newcastle Jets', () => {
  const f = findEvents('Newcastle x Arsenal', FX.events);
  assert.equal(f.length, 1); assert.equal(f[0].ev.id, '401879232');
});
test('futebol: gols do jogo, ambas, resultado, escanteios, cartões', () => {
  assert.equal(G('Mais de 2.5\nTotal de gols - Newcastle x Arsenal 1.80').status, 'green');   // 4 gols
  assert.equal(G('Menos de 3.5\nTotal de gols - Real Madrid x Celta Vigo').status, 'green');    // 3 gols
  assert.equal(G('Sim\nAmbas marcam - Real Madrid x Celta Vigo').status, 'green');
  assert.equal(G('Não\nAmbas as equipes marcam - Newcastle x Arsenal').status, 'red');
  assert.equal(G('Real Madrid\nResultado final - Real Madrid x Celta Vigo 1.40').status, 'green');
  assert.equal(G('Celta Vigo ou empate\nDupla chance - Real Madrid x Celta Vigo').status, 'red');
  assert.equal(G('Empate\nResultado final - Newcastle x Arsenal').status, 'green');
  assert.equal(G('Mais de 9.5\nTotal de escanteios - Newcastle x Arsenal').status, 'red'); // 9 escanteios
  assert.equal(G('Real Madrid - Mais de 6.5\nEscanteios - Real Madrid x Celta Vigo').status, 'green'); // 8 do Real
  assert.equal(G('Mais de 5.5\nCartões - Newcastle x Arsenal').status, 'green'); // 6 cartões
  assert.equal(G('Mais de 4.0\nCartões - Newcastle x Arsenal').legs[0].status, 'green');
  assert.equal(G('Mais de 6\nCartões - Newcastle x Arsenal').status, 'void'); // linha cheia = devolvida
});
test('futebol: jogador para marcar, chutes, assistência, quem não entrou', () => {
  assert.equal(G('Noni Madueke\nPara marcar a qualquer momento - Newcastle x Arsenal 2.60').status, 'green');
  assert.equal(G('Madueke - Mais de 3.5\nChutes - Jogador - Newcastle x Arsenal').status, 'green');
  assert.equal(G('Kylian Mbappé\nAssistência - Real Madrid x Celta Vigo').status, 'green');
  assert.equal(G('William Saliba - Mais de 0.5\nChutes - Jogador - Newcastle x Arsenal').status, 'void');
});
test('futebol: jogo adiado devolve, jogo rolando espera, jogo fora do placar espera', () => {
  assert.equal(G('Newcastle Jets x Adelaide United\nMais de 2.5 gols').status, 'void');
  assert.equal(G('Sporting Jax x Carolina Ascent\nMais de 1.5 gols').status, null);
  assert.equal(G('Flamengo x Palmeiras\nMais de 1.5 gols').why, 'jogo não encontrado');
});
test('futebol: múltipla com dois jogos', () => {
  const m = G('Thibaut Courtois - Mais de 1.5\nDefesas - Jogador - Real Madrid x Celta Vigo 1.88\nArsenal - Mais de 1.5\nTotal de gols - Newcastle x Arsenal 1.70');
  assert.equal(m.legs.length, 2); assert.equal(m.status, 'green');
  const r = G('Mais de 3.5\nTotal de gols - Real Madrid x Celta Vigo\nArsenal - Mais de 1.5\nTotal de gols - Newcastle x Arsenal');
  assert.equal(r.status, 'red');
});
