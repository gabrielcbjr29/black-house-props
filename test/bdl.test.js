import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBDLGames } from '../collector/bdl.js';

test('BALLDONTLIE: jogos no formato do calendário da NBA', () => {
  const j = { data: [
    { id: 101, date: '2026-10-29', datetime: '2026-10-29T23:30:00.000Z', status: '2026-10-29T23:30:00Z', period: 0, home_team: { abbreviation: 'NYK' }, visitor_team: { abbreviation: 'BOS' } },
    { id: 102, date: '2026-10-28', datetime: '2026-10-28T02:00:00.000Z', status: 'Final', period: 4, home_team: { abbreviation: 'GS' }, visitor_team: { abbreviation: 'PHO' } },
    { id: 103, date: '2026-10-29', status: 'Final', home_team: {}, visitor_team: { abbreviation: 'LAL' } }] };
  const g = parseBDLGames(j);
  assert.equal(g.length, 2, 'ignora jogo sem sigla');
  assert.deepEqual([g[0].gid, g[0].home, g[0].away, g[0].status], ['bdl-101', 'NYK', 'BOS', 1]);
  assert.deepEqual([g[1].home, g[1].away, g[1].status, g[1].date], ['GSW', 'PHX', 3, '2026-10-28']);
});
