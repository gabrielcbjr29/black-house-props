import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFintaMatch, matchFinta, FINTA_MK } from '../collector/finta.js';

const m = { id: 'x', props: [
  { player: 'Jalen Brunson', team: 'NY', side: 'away', stat: 'Points', line: 26.5, o: [1, 2.06, 0], u: null, alt: 0 },
  { player: 'Jalen Brunson', team: 'NY', side: 'away', stat: 'Points', line: 29.5, o: [2, 2.87, 0], u: null, alt: 1 },
  { player: 'Jalen Brunson', team: 'NY', side: 'away', stat: 'Pts & Rebs & Asts', line: 38.5, o: [3, 1.9, 1], u: null, alt: 0 }, // suspensa
  { player: 'Jalen Brunson', team: 'NY', side: 'away', stat: 'Double Double', line: .5, o: [4, 11.23, 0], u: null, alt: 0 },
  { player: 'Ninguém Silva', team: 'NY', side: 'away', stat: 'Rebounds', line: 3.5, o: [5, 1.8, 0], u: null, alt: 0 },
  { player: 'Jalen Brunson', team: 'NY', side: 'away', stat: 'Free Throws', line: 3.5, o: [6, 1.8, 0], u: null, alt: 0 }, // mercado que não lemos
] };

test('Finta: só over, principal e escada, suspensa e mercado desconhecido fora, nomes ligados ao slate', () => {
  const r = parseFintaMatch(m);
  assert.deepEqual(r.map(x => `${x.mk} ${x.line} ${x.o} ${x.alt}`), ['PTS 26.5 2.06 0', 'PTS 29.5 2.87 1', 'DD 0.5 11.23 0', 'REB 3.5 1.8 0']);
  const { lines, miss } = matchFinta(r, [{ id: 1628973, name: 'Jalen Brunson', team: 'NYK' }]);
  assert.equal(lines.length, 3); assert.ok(lines.every(l => l.pid === '1628973' && l.team === 'NYK'));
  assert.deepEqual(miss, ['Ninguém Silva']);
  assert.equal(FINTA_MK['Pts & Rebs'], 'PR');
});
