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

test('v11: Nota BH 0–100 coerente com a letra, motivos e faixa de odd', async () => {
  const { buildProps, evaluate, bhScore, reasons, inOddRange, ODD_RANGE } = await import('../public/engine.js');
  const slate = JSON.parse(readFileSync(new URL('../public/data/slate.json', import.meta.url)));
  const b = buildBotData(slate, { w: .4 });
  assert.ok(b.rows.every(r => Number.isInteger(r.nt) && r.nt >= 0 && r.nt <= 99), 'nota inteira de 0 a 99');
  assert.ok(b.rows.every(r => r.gr !== 'C' || r.nt <= 55), 'C no máximo 55');
  assert.ok(b.rows.every(r => r.gr !== 'B' || r.nt <= 74), 'B no máximo 74');
  const withWhy = b.rows.filter(r => r.wy);
  assert.ok(withWhy.length > 0 && withWhy.every(r => Array.isArray(r.wy) && Array.isArray(r.wn) && r.wy.length <= 3 && r.wn.length <= 3));
  assert.ok(b.rows.filter(r => r.gr === 'A+' || r.gr === 'A').every(r => r.wy), 'toda A/A+ tem motivos');
  // acerto na temporada e contra o adversário no formato [acertos, jogos]
  assert.ok(b.rows.every(r => r.ss == null || (r.ss.length === 2 && r.ss[0] <= r.ss[1])));
  // odd baixa e EV negativo derrubam a nota
  const pr = buildProps(slate, { calib: true }).find(x => x.p.status === 'ok');
  const e = evaluate(pr, null, { w: .4 }), side = e.best, s = e[side];
  const base = bhScore(pr, { ...e, [side]: { ...s, odd: 1.9, ev: .05, grade: 'A' } }, side);
  const low = bhScore(pr, { ...e, [side]: { ...s, odd: 1.15, ev: -.02, grade: 'A' } }, side);
  assert.ok(low < base, `odd baixa ${low} < ${base}`);
  const R = reasons(pr, e, side);
  assert.ok(R.pro.length + R.con.length > 0 && R.pro.every(t => typeof t === 'string'));
  assert.ok(inOddRange(ODD_RANGE[0]) && inOddRange(ODD_RANGE[1]) && !inOddRange(1.3) && !inOddRange(4) && !inOddRange(null));
});
