import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCaption, parseEntry, sideLine, marketOf } from '../public/gabarito.js';

const P = [
  { id: '1630183', name: 'Jaden McDaniels', team: 'MIN', opp: 'MEM', game: 'g1', tip: '2026-11-21T01:00:00Z' },
  { id: '1629636', name: 'Darius Garland', team: 'LAC', opp: 'SAS', game: 'g2', tip: '2026-11-21T01:30:00Z' },
  { id: '1', name: 'Jalen Williams', team: 'OKC', opp: 'DAL', game: 'g3', tip: 'x' },
  { id: '2', name: 'Jaylin Williams', team: 'OKC', opp: 'DAL', game: 'g3', tip: 'x' },
];

test('legenda do canal: esporte, unidades (SUPER ODD = 1u) e casa pelo link', () => {
  assert.deepEqual(readCaption('🏀 NBA 🏀\n\n💰 SUPER ODD!\n\nClique aqui para pegar o bilhete pronto.', ['https://br365.io/sports?shareCode=X']), { esporte: 'NBA', stake: 1, superOdd: true, casa: 'br365' });
  assert.equal(readCaption('⚽ FUTEBOL ⚽\n💰 1 unidade', ['https://finta.win/x']).esporte, 'Futebol');
  assert.equal(readCaption('NBA · 0,5 unidade').stake, .5);
  assert.equal(readCaption('NBA 2 unidades', ['https://99play.io/?shareCode=A']).casa, '99play');
});

test('texto da imagem: McDaniels mais 4,5 rebotes (imagem inteira) e o recorte cortado vai para conferir', () => {
  const full = 'Jaden McDaniels — Jaden McDaniels (MIN) mais 4,5\nRebotes (incluindo Prorrogação) ODD TURBINADA @2,30\nMinnesota Timberwolves x Memphis Grizzlies';
  const E = parseEntry(full, '🏀 NBA 🏀 SUPER ODD!', P);
  assert.equal(E.kind, 'simples'); assert.equal(E.legs.length, 1);
  const l = E.legs[0];
  assert.equal(l.pid, '1630183'); assert.equal(l.side, 'o'); assert.equal(l.line, 4.5); assert.equal(l.mk, 'REB'); assert.equal(E.odd, 2.3);
  // OCR real do recorte do print (sem a palavra rebotes): não chuta o mercado
  const crop = 'len McDaniels — Jaden\nDaniels (MIN) mais 4,5\n\notes (incluindo Prorrogacgao) | ODD TURBI\nnesota Timberwolves x Memphis Grizzlies';
  assert.deepEqual(parseEntry(crop, 'NBA', P).faltando, ['jogador/mercado']);
});

test('Criador de Aposta da Finta: duas pernas e odd total', () => {
  const ocr = 'Criador de Aposta · 2 seleções\nDarius Garland · Assistências · +9.5\nProps · Assistências · Spurs x LA Clippers\nDarius Garland · Duplo-duplo\nProps · Duplo-duplo · Spurs x LA Clippers\nOdds total 38.91';
  const E = parseEntry(ocr, '', P);
  assert.equal(E.kind, 'multipla'); assert.equal(E.odd, 38.91);
  assert.deepEqual(E.legs.map(l => [l.mk, l.side, l.line]), [['AST', 'o', 9.5], ['DD', 'o', .5]]);
});

test('peças: marco 10+, menos de, odd com @, sobrenome repetido não confunde', () => {
  assert.deepEqual(sideLine('Assistências 10+'), { side: 'o', line: 9.5 });
  assert.deepEqual(sideLine('menos de 22,5 pontos'), { side: 'u', line: 22.5 });
  assert.equal(marketOf('Pontos + Rebotes + Assistências').mk, 'PRA');
  assert.equal(marketOf('cestas de 3 pontos').mk, '3PM');
  const E = parseEntry('Jalen Williams mais de 19,5 pontos @1,85', 'NBA 1 unidade', P);
  assert.equal(E.legs[0].pid, '1'); assert.equal(E.odd, 1.85);
  assert.equal(parseEntry('Williams mais de 5,5 rebotes', '', P).legs.length, 0, 'só o sobrenome repetido: não chuta');
});

// casos reais do canal (21/11): mercado "de 2 pontos convertidos" e odd solta no fim da linha
test('gabarito: arremessos de 2 convertidos + odd solta', async () => {
  const { parseEntry, oddsOf, marketOf } = await import('../public/gabarito.js');
  const P = [{ id: '1642285', name: 'Cam Spencer', team: 'MEM', opp: 'MIN', game: 'g', tip: null }];
  const E = parseEntry('Cam Spencer — Cam Spencer (MEM) 1.66\nmais 1,5\nArremessos de 2 pontos convertidos Mais de/Menos\nMinnesota Timberwolves x Memphis Grizzlies', 'NBA 1 unidade', P);
  assert.equal(E.legs[0].mk, '2PM'); assert.equal(E.legs[0].line, 1.5); assert.equal(E.odd, 1.66);
  assert.deepEqual(oddsOf('Defesas - Jogador - Real Madrid x Celta Vigo 1.88\nMais de 1.5').list, [1.88]);
  assert.deepEqual(oddsOf('Newcastle x Arsenal 456 > 1,70\nMais de 1,5').list, [1.7]);
  assert.equal(marketOf('Arremessos de 3 pontos tentados').mk, '3PA');
  assert.equal(marketOf('Bolas de 3').mk, '3PM');
});

// 24/11: bilhetes reais que ficavam sem correção
test('gabarito: mercado antes do jogador (BR365 e Criar Aposta), Reb.-Ast, faltas e odd colada no lado', () => {
  const P = [{ id: 1, name: 'Naz Reid', team: 'CHA' }, { id: 2, name: 'Trae Young', team: 'WAS' }, { id: 3, name: 'Jalen Smith', team: 'CHI' }, { id: 4, name: 'VJ Edgecombe', team: 'PHI' }, { id: 5, name: 'Tari Eason', team: 'HOU' }];
  let r = parseEntry("Simples\n\n‘¥ Charlotte Hornets 1,74\n& Memphis Grizzlies\n\nReb.-Ast Mais de/Menos de (incluindo\nProrrogação)\n\nNaz Reid (CHA) mais 10,5\n23/11 « 21:00\n", '', P);
  assert.deepEqual(r.legs.map(l => [l.name, l.mk, l.side, l.line]), [['Naz Reid', 'RA', 'o', 10.5]]); assert.equal(r.odd, 1.74);
  r = parseEntry("x Trae Young — Trae Young (WAS) menos 1.71\n2,5\nFaltas Pessoais Cometidas Mais de/Menos de\n", '', P);
  assert.deepEqual(r.legs.map(l => [l.mk, l.side, l.line]), [['PF', 'u', 2.5]]); assert.equal(r.odd, 1.71);
  r = parseEntry("Múltipla @\n\n@ Pontos Mais de/Menos de (incluindo\nProrrogação)\n\nJalen Smith (CHI) mais 14,5\n\nAssistências Mais de/Menos de (incluindo\nProrrogação)\n\nJalen Smith (CHI) mais 1,5\n\nRebotes Mais de/Menos de (incluindo\nProrrogação)\nJalen Smith (CHI) mais 7,5\n", '💰 0.10 unidade | ODD 27.31', P);
  assert.deepEqual(r.legs.map(l => [l.mk, l.line]), [['PTS', 14.5], ['AST', 1.5], ['REB', 7.5]]); assert.equal(r.odd, 27.31);
  r = parseEntry("Múltipla @\n\nReb.-Ast (incluindo Prorrogação)\n\ngecombe (PHI) mais 11,5\n23/11 e 21:00\n\nReb.-Ast (incluindo Ai ae in\n\nTari Eason (HOU) mais 9,5\n\nCotações totais 16,43\n", '', P);
  assert.deepEqual(r.legs.map(l => l.name), ['VJ Edgecombe', 'Tari Eason']); assert.equal(r.odd, 16.43);
  r = parseEntry("Múltipla @\n\nReb.-Ast (incluindo Prorrogação)\n\nXyz Abcdef (PHI) mais 11,5\n\nReb.-Ast (incluindo\n\nTari Eason (HOU) mais 9,5\n\nCotações totais 16,43\n", '', P);
  assert.equal(r.legs.length, 0, 'múltipla lida pela metade não corrige'); assert.ok(r.faltando.includes('perna da múltipla'));
});
