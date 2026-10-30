import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { devig, consensus, impliedMu, makeDist, overProb, kelly, buildProps, evaluate, grade } from '../public/engine.js';
import { newTip, settleTip, summarize, toCSV, statValue } from '../public/tips.js';
import { parseImport, marketOf } from '../public/importer.js';
import { postText } from '../public/share.js';
import { parseLineups } from '../collector/nba.js';
import { parseInjuryText } from '../collector/injuryreport.js';

test('devig: chances justas somam 1 e o favorito fica com mais', () => {
  const d = devig(1.70, 2.20);
  assert.ok(Math.abs(d.pO + d.pU - 1) < 1e-9);
  assert.ok(d.pO > .55 && d.pO < .6);
  assert.ok(d.margin > .03);
  const m = devig(1.91, 1.91); assert.ok(Math.abs(m.pO - .5) < 1e-9);
  assert.equal(devig(null, 1.9), null);
});
test('consenso pesa casas afiadas e média implícita reproduz a chance', () => {
  const c = consensus({ Pinnacle: { o: 1.80, u: 2.05 }, BetMGM: { o: 1.95, u: 1.87 } });
  assert.ok(c.pO > .5 && c.n === 2);
  const mu = impliedMu(.6, 24.5, 2.2);
  assert.ok(Math.abs(overProb(makeDist(mu, 2.2), 24.5) - .6) < .005);
});
test('Kelly', () => { assert.equal(kelly(.5, 1.9), 0); assert.ok(Math.abs(kelly(.55, 2) - .1) < 1e-9); });
test('nota com e sem odd', () => {
  const hits = { L10: [7, 10], L20: [13, 20] };
  assert.equal(grade(.6, hits, .07), 'A+');
  assert.equal(grade(.55, hits, .035), 'A');
  assert.equal(grade(.7, hits, null), 'A');
});

const R = { dates: ['2026-10-28'], games: { '2026-10-28': [['g1', 'NYK', 'BOS']] }, stats: { '2026-10-28': { 1: [35, 28, 4, 7, 1, 0, 2, 3, 10, 20, 3, 8, 5, 6] } } };
const leg = (o) => ({ pid: '1', name: 'Jalen Brunson', team: 'NYK', opp: 'BOS', mk: 'PTS', side: 'over', line: 26.5, odd: 1.9, p: .55, grade: 'A', ...o });
test('liquidação: green, red, devolução e DNP', () => {
  assert.equal(statValue('PRA', R.stats['2026-10-28'][1]), 39);
  const g = settleTip(newTip({ legs: [leg()], odd: 1.9, units: 2, date: '2026-10-28' }), R);
  assert.equal(g.status, 'green'); assert.ok(Math.abs(g.profit - 1.8) < 1e-9);
  assert.equal(settleTip(newTip({ legs: [leg({ side: 'under' })], odd: 1.9, units: 1, date: '2026-10-28' }), R).status, 'red');
  assert.equal(settleTip(newTip({ legs: [leg({ line: 28 })], odd: 1.9, units: 1, date: '2026-10-28' }), R).status, 'void');
  assert.equal(settleTip(newTip({ legs: [leg({ pid: '9' })], odd: 1.9, units: 1, date: '2026-10-28' }), R).status, 'void');
  assert.equal(settleTip(newTip({ legs: [leg()], odd: 1.9, units: 1, date: '2026-10-29' }), R).status, 'pending');
  // múltipla com perna devolvida: odd recalculada só com as válidas
  const m = settleTip(newTip({ legs: [leg({ odd: 1.8 }), leg({ pid: '9', odd: 2 })], odd: 3.6, units: 1, date: '2026-10-28' }), R);
  assert.equal(m.status, 'green'); assert.ok(Math.abs(m.profit - .8) < 1e-9);
});
test('resumo: ROI, acerto e CSV', () => {
  const ts = [settleTip(newTip({ legs: [leg()], odd: 1.9, units: 2, date: '2026-10-28' }), R), settleTip(newTip({ legs: [leg({ side: 'under' })], odd: 2, units: 1, date: '2026-10-28' }), R)];
  const s = summarize(ts);
  assert.equal(s.green, 1); assert.equal(s.red, 1); assert.ok(Math.abs(s.profit - .8) < 1e-9); assert.ok(Math.abs(s.roi - .8 / 3) < 1e-9);
  assert.equal(s.curve.length, 3);
  assert.ok(toCSV(ts).split('\n').length === 3);
  assert.match(postText(ts, { cfg: { brand: 'Teste' } }), /Ministério da Fazenda adverte/);
});
test('importação de linhas da casa', () => {
  const players = [{ id: '1', name: 'Jalen Brunson' }, { id: '2', name: 'Karl-Anthony Towns' }, { id: '3', name: 'Josh Hart' }];
  const r = parseImport('Jalen Brunson; PTS; 26,5; 1,85; 1,95\nK. Towns | rebotes | 12.5 | 1.9 | 1.9\nJosh Hart; pontos + rebotes + assistências; 24,5\nNinguém; PTS; 10; 1,9; 1,9\nJosh Hart; xyz; 3', players);
  assert.equal(r.rows.length, 3); assert.equal(r.errors.length, 2);
  assert.deepEqual(r.rows.map(x => x.mk), ['PTS', 'REB', 'PRA']);
  assert.equal(r.rows[1].pid, '2'); assert.equal(r.rows[0].oUnder, 1.95);
  assert.equal(marketOf('Cestas de 3 pontos'), '3PM'); assert.equal(marketOf('roubos + tocos'), 'SB');
});
test('quintetos: titulares só valem com 5 por time', () => {
  const pl = (id, pos, st = 'Confirmed') => ({ personId: id, position: pos, lineupStatus: st, rosterStatus: 'Active' });
  const j = { games: [{ homeTeam: { teamAbbreviation: 'BOS', players: [pl(1, 'PG'), pl(2, 'SG'), pl(3, 'SF'), pl(4, 'PF'), pl(5, 'C'), pl(6, ''), { personId: 7, position: '', rosterStatus: 'Inactive' }] }, awayTeam: { teamAbbreviation: 'NYK', players: [pl(8, 'PG', 'Expected'), pl(9, '')] } }] };
  const r = parseLineups(j);
  assert.equal(r['1'].role, 'starter'); assert.equal(r['1'].confirmed, true); assert.equal(r['6'].role, 'bench');
  assert.equal(r['7'].inactive, true); assert.equal(r['8'].role, null);
});
test('relatório oficial de lesões: uma linha por linha e uma célula por linha', () => {
  const a = 'Injury Report: 10/28/26 05:30 PM\nGame Date Game Time Matchup Team Player Name Current Status Reason\n10/28/2026 07:30 (ET) NYK@BOS Boston Celtics Tatum, Jayson Out Injury/Illness - Right Achilles; Repair\nBrown, Jaylen Questionable Injury/Illness - Left Knee; Soreness\nNew York Knicks Robinson, Mitchell Doubtful Injury/Illness - Left Ankle\nJackson Jr., Jaren Available Injury/Illness - Toe\nPage 1 of 3';
  const r = parseInjuryText(a);
  assert.equal(r['jayson tatum'].status, 'out'); assert.equal(r['jayson tatum'].team, 'BOS');
  assert.equal(r['jaylen brown'].status, 'questionable');
  assert.equal(r['mitchell robinson'].team, 'NYK');
  assert.equal(r['jaren jackson'], undefined);
  const b = parseInjuryText('10/28/2026\n07:30 (ET)\nNYK@BOS\nBoston Celtics\nTatum, Jayson\nOut\nInjury/Illness - Right Achilles; Repair\nGilgeous-Alexander, Shai\nProbable\nRest');
  assert.equal(b['jayson tatum'].status, 'out'); assert.equal(b['shai gilgeousalexander'].status, 'probable');
});
test('demo: mercado, sem-o-colega, abertura e calibração no slate', () => {
  const s = JSON.parse(readFileSync('public/data/slate.json', 'utf8'));
  const P = buildProps(s);
  assert.ok(P.some(p => p.mkt && p.mkt.openMu != null), 'linha de abertura');
  assert.ok(P.some(p => p.ctx.wo?.active), 'histórico sem o colega');
  assert.ok(s.calib && Object.keys(s.calib).length > 10, 'calibração');
  const pr = P.find(p => p.mkt);
  const e1 = evaluate(pr, null, { w: 1 }), e0 = evaluate(pr, null, { w: 0 });
  assert.ok(Math.abs(e1.muF - pr.proj) < 1e-9 && Math.abs(e0.muF - pr.mkt.mu) < 1e-9);
  const r = JSON.parse(readFileSync('public/data/results.json', 'utf8')); assert.ok(r.dates.length > 5);
});
