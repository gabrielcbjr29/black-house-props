import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotKind, dailyAllowance, mergeLines } from '../collector/oddsplan.js';
import { parseSGOEvents, americanToDecimal, nameFromID } from '../collector/sgo.js';
import { parseKalshiMarkets } from '../collector/kalshi.js';

test('plano de fotos: abertura de manhã, fechamento perto do jogo, nada depois', () => {
  assert.equal(snapshotKind({ snaps: [], minutesToTip: 600 }), 'open');
  assert.equal(snapshotKind({ snaps: [], minutesToTip: 600, wantOpen: false }), null);
  assert.equal(snapshotKind({ snaps: [{ kind: 'open', at: '2026-10-28T13:00:00Z' }], minutesToTip: 400 }), null);
  assert.equal(snapshotKind({ snaps: [{ kind: 'open', at: '2026-10-28T13:00:00Z' }], minutesToTip: 90 }), 'close');
  assert.equal(snapshotKind({ snaps: [{ kind: 'close', at: '2026-10-28T13:00:00Z' }], minutesToTip: 30 }), null);
  assert.equal(snapshotKind({ snaps: [], minutesToTip: 2 }), null);
  assert.equal(snapshotKind({ snaps: [{ kind: 'open', at: new Date().toISOString() }], minutesToTip: 60 }), null, 'acabou de buscar');
});
test('orçamento diário divide o que sobra pelos dias do mês', () => {
  assert.equal(dailyAllowance({ remaining: null }), Infinity);
  assert.equal(dailyAllowance({ remaining: 310, now: new Date('2026-11-01T12:00:00Z'), reserve: 10 }), 10);
  assert.equal(dailyAllowance({ remaining: 5, now: new Date('2026-11-29T12:00:00Z') }), 0);
});
test('SportsGameOdds: props por jogador, odds americanas viram decimais', () => {
  assert.equal(americanToDecimal('-110'), 1.909); assert.equal(americanToDecimal('+150'), 2.5);
  assert.equal(nameFromID('JALEN_DUREN_1_NBA'), 'Jalen Duren');
  const ev = [{ players: { JALEN_BRUNSON_1_NBA: { name: 'Jalen Brunson' } }, odds: {
    'points-JALEN_BRUNSON_1_NBA-game-ou-over': { bookOverUnder: '26.5', byBookmaker: { draftkings: { odds: '-115', overUnder: '26.5', available: true }, fanduel: { odds: '-110', overUnder: '26.5' }, betmgm: { odds: '+100', overUnder: '27.5', available: false } } },
    'points-JALEN_BRUNSON_1_NBA-game-ou-under': { bookOverUnder: '26.5', byBookmaker: { draftkings: { odds: '-105', overUnder: '26.5' }, fanduel: { odds: '-110', overUnder: '26.5' } } },
    'points-all-game-ou-over': { byBookmaker: { draftkings: { odds: '-110', overUnder: '224.5' } } },
    'assists-JOSH_HART_1_NBA-game-ou-over': { byBookmaker: { fanduel: { odds: '-120', overUnder: '5.5' } } } } }];
  const r = parseSGOEvents(ev);
  assert.equal(r.length, 1, 'perna sem o outro lado fica de fora');
  assert.equal(r[0].name, 'Jalen Brunson'); assert.equal(r[0].mk, 'PTS'); assert.equal(r[0].line, 26.5);
  assert.deepEqual(Object.keys(r[0].books).sort(), ['DraftKings', 'FanDuel']);
});
test('Kalshi: degraus viram linhas e entram na linha das casas', () => {
  const k = parseKalshiMarkets([
    { title: 'Jalen Brunson: 25+ points', yes_bid_dollars: '0.5800', yes_ask_dollars: '0.6200', status: 'active' },
    { title: 'Jalen Brunson: 27+ points', yes_bid_dollars: '0.4400', yes_ask_dollars: '0.4800', status: 'active' },
    { title: 'Jalen Brunson: 30+ points', yes_bid: 20, yes_ask: 40, status: 'active' }], 'PTS');
  assert.deepEqual(k[0].lines, { 24.5: .6, 26.5: .46 });
  const m = mergeLines([[{ name: 'Jalen Brunson', mk: 'PTS', line: 26.5, books: { FanDuel: { o: 1.9, u: 1.9 } } }]], k);
  assert.ok(m[0].books.Kalshi && Math.abs(1 / m[0].books.Kalshi.o - .46) < .002);
  const solo = mergeLines([], k); assert.equal(solo[0].line, 26.5, 'sem casa: degrau mais perto de 50%');
});
