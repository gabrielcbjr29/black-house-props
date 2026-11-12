import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlate, buildPrevSeason } from '../collector/slate.js';
import { buildProps, evaluate } from '../public/engine.js';

// box score compacto: pid, team, pos, starter, min, pts, reb, oreb, ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta
const row = (pid, team, pts) => [pid, team, 'G', 1, 32, pts, 5, 1, 4, 1, 0, 2, 2, Math.round(pts / 2.4), 15, 2, 6, 3, 4];
const day = (base, i) => new Date(Date.parse(base) + i * 864e5).toISOString().slice(0, 10);
function season(prefix, start, n, cur, bOut) {
  return Array.from({ length: n }, (_, i) => {
    const out = bOut(i);
    return { gid: `${prefix}${String(i).padStart(4, '0')}`, d: day(start, i), h: 'BOS', a: 'NYK', hs: 110, as: 100,
      r: [row(1, 'BOS', out ? 30 : 20), ...(out ? [] : [row(2, 'BOS', 18)]), row(3, 'BOS', 12), row(4, 'BOS', 10), row(9, 'NYK', 15)] };
  });
}

test('v12: "sem o colega" usa as duas temporadas (logs extras em px) e a temporada passada vem do prev.json', () => {
  // temporada passada: o colega (2) ficou fora dos 10 primeiros jogos, e o jogador 1 fez 30 nesses jogos
  const prev = season('00225', '2025-11-01', 40, 0, i => i < 10);
  const cur = season('00226', '2026-10-21', 35, 1, () => false);
  const date = day('2026-10-21', 36);
  const slate = buildSlate({ date, season: '2026-27', cur, prev, today: [{ gid: 'hoje', utc: date + 'T23:00:00Z', home: 'BOS', away: 'NYK' }],
    injuries: { [ 'jogador dois' ]: { status: 'out', note: '' } }, names: { 1: 'Jogador Um', 2: 'Jogador Dois', 3: 'Jogador Tres', 4: 'Jogador Quatro', 9: 'Rival' } });
  const p1 = slate.players.find(p => p.id === '1');
  assert.equal(slate.players.find(p => p.id === '2').status, 'out');
  assert.equal(p1.logs.length, 30, 'slate continua com 30 logs');
  assert.equal(p1.wo['2'].length, 10, 'acha os 10 jogos sem o colega na temporada passada');
  assert.equal(p1.px.length, 10, 'manda os logs desses jogos à parte');
  const pv = buildPrevSeason(prev, '2025-26');
  assert.equal(pv.p['1'].length, 40);
  const props = buildProps({ ...slate, prev: pv });
  const pr = props.find(x => x.p.id === '1' && x.mk === 'PTS');
  assert.ok(pr.ctx.wo?.active, 'colega fora hoje');
  assert.deepEqual(pr.woVals, Array(10).fill(30));
  const e = evaluate(pr, { line: 24.5 });
  assert.deepEqual(e.over.hits.WO, [10, 10]);
  assert.deepEqual(e.over.hits.PS, [10, 40], 'temporada passada: só os 10 jogos de 30 pontos passam de 24,5');
  // sem o prev.json, nada de temporada passada (o app carrega depois)
  const e2 = evaluate(buildProps(slate).find(x => x.p.id === '1' && x.mk === 'PTS'), { line: 24.5 });
  assert.equal(e2.over.hits.PS, undefined);
});
