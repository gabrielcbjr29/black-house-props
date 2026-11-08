import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBotData } from '../collector/botdata.js';

test('bot.json: linhas ordenadas, sem jogador fora, com campos que o bot usa', () => {
  const slate = JSON.parse(readFileSync(new URL('../public/data/slate.json', import.meta.url)));
  const b = buildBotData(slate, { w: .4 });
  assert.ok(b.rows.length > 0);
  assert.equal(b.games.length, slate.games.length);
  for (let i = 1; i < b.rows.length; i++) assert.ok(b.rows[i - 1].sc >= b.rows[i].sc, 'ordem por pontuação');
  const out = new Set(slate.players.filter(p => p.status === 'out' || p.status === 'doubtful').map(p => p.id));
  assert.ok(b.rows.every(r => !out.has(r.id)), 'sem jogador fora');
  const r = b.rows[0];
  for (const k of ['n', 't', 'o', 'g', 'h', 'm', 's', 'l', 'p', 'gr', 'pj']) assert.ok(r[k] != null, 'campo ' + k);
  assert.ok(['o', 'u'].includes(r.s));
  assert.ok(b.rows.every(x => x.d == null || x.e != null), 'EV sempre que houver odd');
});
