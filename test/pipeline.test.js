import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildProps, evaluate, MARKETS } from '../public/engine.js';

test('demo passa pelo mesmo caminho do coletor e gera props de todos os mercados', () => {
  execFileSync(process.execPath, ['collector/demo.js']);
  const s = JSON.parse(readFileSync('public/data/slate.json', 'utf8'));
  assert.equal(s.games.length, 5); assert.ok(s.players.length > 30);
  const P = buildProps(s);
  for (const mk of Object.keys(MARKETS)) assert.ok(P.some(p => p.mk === mk), 'mercado ' + mk);
  for (const p of P.slice(0, 200)) { const e = evaluate(p); assert.ok(e.over.p >= 0 && e.over.p <= 1); assert.ok(Number.isFinite(p.proj)); }
  const jw = s.players.find(p => p.name === 'Jalen Williams'); assert.equal(jw.status, 'out');
  assert.ok(P.some(p => p.p.team === 'OKC' && p.ctx.extra > 0), 'colegas ganham minutos com desfalque');
});
