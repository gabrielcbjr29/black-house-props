import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoxscore, parseSchedule, parseMinutes, posCode, gameId } from '../collector/nba.js';
import { parseScoreboardOdds, parseInjuries } from '../collector/espn.js';
import { parseEventOdds } from '../collector/oddsapi.js';
import { mergeLines } from '../collector/oddsplan.js';

const pl = (id, name, pos, starter, min, s) => ({ status: 'ACTIVE', personId: id, name, position: pos, starter, played: '1', statistics: { minutes: min, points: s[0], reboundsTotal: s[1], reboundsOffensive: 1, assists: s[2], steals: 1, blocks: 0, turnovers: 2, foulsPersonal: 3, fieldGoalsMade: s[3], fieldGoalsAttempted: s[4], threePointersMade: s[5], threePointersAttempted: s[6], freeThrowsMade: s[7], freeThrowsAttempted: s[8] } });
const BOX = { game: { gameId: '0022600001', gameEt: '2026-10-21T19:30:00-04:00', gameStatus: 3,
  homeTeam: { teamTricode: 'BOS', score: 110, statistics: { fieldGoalsAttempted: 88, freeThrowsAttempted: 20, reboundsOffensive: 10, turnoversTotal: 12, minutes: 'PT240M00.00S' }, players: [pl(1, 'Jaylen Brown', 'SF', '1', 'PT35M30.00S', [28, 6, 4, 10, 20, 3, 8, 5, 6]), { personId: 9, name: 'DNP', played: '0', statistics: { minutes: 'PT00M00.00S' } }] },
  awayTeam: { teamTricode: 'NYK', score: 104, statistics: { fieldGoalsAttempted: 90, freeThrowsAttempted: 18, reboundsOffensive: 12, turnoversTotal: 14, minutes: 'PT240M00.00S' }, players: [pl(2, 'Jalen Brunson', 'PG', '1', 'PT36M00.00S', [30, 3, 8, 11, 22, 2, 6, 6, 7]), pl(3, 'Bench Guy', '', '0', 'PT12M06.00S', [4, 2, 1, 2, 5, 0, 2, 0, 0])] } } };

test('boxscore da NBA vira linhas compactas', () => {
  const g = parseBoxscore(BOX);
  assert.equal(g.d, '2026-10-21'); assert.equal(g.h, 'BOS'); assert.equal(g.a, 'NYK');
  assert.equal(g.r.length, 3, 'quem não jogou fica de fora');
  const jb = g.r.find(r => r[0] === 1);
  assert.deepEqual(jb.slice(0, 5), [1, 'BOS', 'F', 1, 35.5]);
  assert.equal(jb[13], 10); assert.equal(jb[14], 20); assert.equal(jb[15], 3); assert.equal(jb[16], 8); assert.equal(jb[12], 3, 'faltas');
  assert.equal(g.r.find(r => r[0] === 3)[2], null, 'reserva sem posição');
  assert.ok(Math.abs(g.ph - (88 + .44 * 20 - 10 + 12)) < .11);
  assert.equal(parseBoxscore({ game: { ...BOX.game, gameStatus: 2 } }).notFinal, true);
});
test('auxiliares', () => {
  assert.equal(parseMinutes('PT25M30.00S'), 25.5); assert.equal(posCode('PG'), 'G'); assert.equal(posCode('C'), 'C'); assert.equal(posCode('SF'), 'F');
  assert.equal(gameId(2026, 7), '0022600007');
});
test('calendário', () => {
  const s = parseSchedule({ leagueSchedule: { gameDates: [{ gameDate: '10/28/2026 00:00:00', games: [{ gameId: '0022600050', gameStatus: 1, gameDateEst: '2026-10-28T00:00:00Z', gameDateTimeUTC: '2026-10-28T23:30:00Z', homeTeam: { teamTricode: 'BOS' }, awayTeam: { teamTricode: 'NYK' } }, { gameId: '0012600001', homeTeam: { teamTricode: 'A' }, awayTeam: { teamTricode: 'B' } }] }] } });
  assert.equal(s.length, 1); assert.equal(s[0].date, '2026-10-28'); assert.equal(s[0].home, 'BOS');
});
test('ESPN: handicap, total e lesões', () => {
  const o = parseScoreboardOdds({ events: [{ competitions: [{ competitors: [{ homeAway: 'home', team: { abbreviation: 'GS' } }, { homeAway: 'away', team: { abbreviation: 'LAL' } }], odds: [{ details: 'LAL -2.5', overUnder: 231 }] }] }] });
  assert.deepEqual(o['LAL@GSW'], { spread: 2.5, total: 231, provider: null });
  const inj = parseInjuries({ injuries: [{ displayName: 'Denver Nuggets', injuries: [{ athlete: { displayName: 'Aaron Gordon', team: { abbreviation: 'DEN' } }, status: 'Day-To-Day', shortComment: 'calf' }, { athlete: { displayName: 'Jalen Williams' }, status: 'Out' }] }] });
  assert.equal(inj['aaron gordon'].status, 'questionable'); assert.equal(inj['aaron gordon'].team, 'DEN'); assert.equal(inj['jalen williams'].status, 'out');
});
test('The Odds API: linha com mais casas', () => {
  const r = parseEventOdds({ bookmakers: [
    { title: 'DraftKings', markets: [{ key: 'player_points', outcomes: [{ name: 'Over', description: 'Jalen Brunson', point: 26.5, price: 1.87 }, { name: 'Under', description: 'Jalen Brunson', point: 26.5, price: 1.95 }] }] },
    { title: 'FanDuel', markets: [{ key: 'player_points', outcomes: [{ name: 'Over', description: 'Jalen Brunson', point: 26.5, price: 1.9 }, { name: 'Under', description: 'Jalen Brunson', point: 26.5, price: 1.91 }] }] },
    { title: 'BetMGM', markets: [{ key: 'player_points', outcomes: [{ name: 'Over', description: 'Jalen Brunson', point: 27.5, price: 2.1 }] }] }] });
  const m = mergeLines([r]);
  assert.equal(m.length, 1); assert.equal(m[0].mk, 'PTS'); assert.equal(m[0].line, 26.5); assert.deepEqual(Object.keys(m[0].books), ['DraftKings', 'FanDuel']);
});
