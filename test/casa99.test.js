import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents, parseEventLines, merge99, fetch99 } from '../collector/casa99.js';

const players = [{ id: 'p1', name: 'Cade Cunningham', team: 'DET' }, { id: 'p2', name: 'Trae Young', team: 'WAS' }];
const det = {
  odds: [{ id: 1, typeId: 2501, price: 1.9524, oddStatus: 0 }, { id: 2, typeId: 2502, price: 1.6667, oddStatus: 0 },
    { id: 3, typeId: 2501, price: 1.9, oddStatus: 0 }, { id: 4, typeId: 2502, price: 1.8, oddStatus: 0 },
    { id: 5, typeId: 2501, price: 1.5, oddStatus: 1 }, { id: 6, typeId: 2502, price: 2.5, oddStatus: 0 }],
  childMarkets: [
    { typeId: 2313, childName: 'Cade Cunningham', sv: '6.5|sa:player:nba-1|DET', desktopOddIds: [[1], [2]] },
    { typeId: 30073, childName: 'Trae Young', sv: '13.5|sa:player:nba-2|WAS', desktopOddIds: [[3], [4]] },
    { typeId: 2318, childName: 'Trae Young', sv: '5.5|x|WAS', desktopOddIds: [[5], [6]] }, // odd suspensa: fica fora
    { typeId: 999, childName: 'Trae Young', sv: '1.5|x|WAS', desktopOddIds: [[3], [4]] }, // mercado que não usamos
  ],
};

test('99play: lê linhas de jogador e ignora odd suspensa e mercado desconhecido', () => {
  const L = parseEventLines(det, players);
  assert.equal(L.length, 2);
  assert.deepEqual(L.find(l => l.mk === '3PA'), { pid: 'p1', mk: '3PA', line: 6.5, books: { '99play': { o: 1.9524, u: 1.6667 } }, src: 'c99' });
  assert.equal(L.find(l => l.mk === 'RA').line, 13.5);
});

test('99play: linha da casa passa por cima da linha de outra fonte', () => {
  const slate = { lines: [{ pid: 'p1', mk: '3PA', line: 8.5, books: { X: { o: 1.9, u: 1.9 } } }, { pid: 'p2', mk: 'PTS', line: 25.5, books: {} }] };
  merge99(slate, parseEventLines(det, players));
  assert.equal(slate.lines.filter(l => l.pid === 'p1' && l.mk === '3PA').length, 1);
  assert.equal(slate.lines.find(l => l.pid === 'p1' && l.mk === '3PA').line, 6.5);
  assert.ok(slate.lines.find(l => l.mk === 'PTS'));
});

test('99play: jogo que já começou fica com a última foto', async () => {
  const slate = { meta: { date: '2026-11-12' }, players, games: [{ id: 'g1', home: 'WAS', away: 'DET' }] };
  const evs = { events: [{ id: 7, champId: 2980, competitorIds: [1, 2], startDate: '2026-11-13T00:00:00Z' }], competitors: [{ id: 1, name: 'Washington Wizards' }, { id: 2, name: 'Detroit Pistons' }] };
  assert.equal(parseEvents(evs)[0].teams.join(), 'WAS,DET');
  const state = { providers: {} }, get = async u => (u.includes('GetEvents') ? evs : det);
  assert.equal((await fetch99({ slate, state, get, now: new Date('2026-11-12T20:00:00Z'), log: () => {} })).length, 2);
  let called = 0;
  const after = await fetch99({ slate, state, get: async u => { called++; return u.includes('GetEvents') ? evs : { childMarkets: [] }; }, now: new Date('2026-11-13T01:00:00Z'), log: () => {} });
  assert.equal(after.length, 2); assert.equal(called, 1);
});
