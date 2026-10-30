import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseESPNSummary, parseESPNDay } from '../collector/espnbox.js';
const fx = f => JSON.parse(readFileSync(new URL('./fixtures/' + f, import.meta.url)));

test('ESPN: boxscore no formato do histórico', () => {
  const g = parseESPNSummary(fx('espn-summary.json'), '2025-12-01');
  assert.equal(g.gid, 'e401810164'); assert.equal(g.h, 'DET'); assert.equal(g.a, 'ATL'); assert.equal(g.d, '2025-12-01');
  assert.equal(g.hs, 99); assert.equal(g.as, 98);
  const ok = g.r.find(r => r[0] === 4431680);
  assert.deepEqual(ok.slice(1, 9), ['ATL', 'F', 1, 36, 20, 6, 3, 4], 'Okongwu: time, posição, titular, min, pts, reb, oreb, ast');
  assert.deepEqual(ok.slice(13), [9, 18, 2, 9, 0, 0], 'arremessos');
  const pts = t => g.r.filter(r => r[1] === t).reduce((a, r) => a + r[5], 0);
  assert.equal(pts('DET'), 99); assert.equal(pts('ATL'), 98);
  assert.ok(g.gm >= 48 && g.gm <= 54, 'minutos do jogo');
  assert.ok(g.ph > 80 && g.ph < 130, 'posses');
});
test('ESPN: scoreboard do dia com calendário e siglas da NBA', () => {
  const d = parseESPNDay(fx('espn-scoreboard.json'), '2025-12-01');
  assert.equal(d.games.length, 9);
  assert.equal(d.games[0].home, 'DET'); assert.equal(d.games[0].status, 3); assert.equal(d.games[0].type, 2);
  assert.ok(d.calendar[0].match(/^\d{4}-\d{2}-\d{2}$/));
  assert.ok(d.games.every(g => !['GS', 'NY', 'SA', 'NO', 'UTAH', 'WSH'].includes(g.home)));
});
