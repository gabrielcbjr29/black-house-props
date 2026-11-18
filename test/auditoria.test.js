import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observe, settle, rowsOf, resumo, statOf, COLS } from '../scripts/auditoria.mjs';

const slate = JSON.parse(readFileSync(new URL('./fixtures/slate-nop-gsw.json', import.meta.url), 'utf8')); // GSW @ NOP, 16/11
const tip = Date.parse(slate.games[0].timeUTC);

test('Placar: valor do mercado no boxscore', () => {
  const a = [30, 25, 8, 6, 2, 1, 3, 4, 9, 18, 3, 8, 4, 5];
  assert.equal(statOf(a, 'PTS'), 25); assert.equal(statOf(a, 'PRA'), 39); assert.equal(statOf(a, 'SB'), 3);
  assert.equal(statOf(a, '2PM'), 6); assert.equal(statOf(a, 'XYZ'), null);
});

test('Placar: abertura fica, fechamento é a última leitura antes do jogo, depois do jogo não muda', () => {
  const st = {};
  const n = observe(st, slate, null, tip - 5 * 36e5);
  assert.equal(n, slate.lines.length, 'lê todas as linhas da 99play');
  const [key, r] = Object.entries(st)[0];
  assert.equal(r.f.at, r.at, 'primeira leitura = abertura');
  observe(st, slate, null, tip - 36e5);
  assert.notEqual(st[key].at, st[key].f.at, 'fechamento atualizado, abertura preservada');
  const close = st[key].at;
  assert.equal(observe(st, slate, null, tip + 6e4), 0, 'com o jogo rolando não lê nada');
  assert.equal(st[key].at, close);
  assert.ok(r.pO > 0 && r.pO < 1 && r.q > 0 && r.q < 1);
});

test('Placar: liquida com o boxscore, anula quem não jogou e não duplica', () => {
  const st = {};
  observe(st, slate, null, tip - 36e5);
  const ids = [...new Set(Object.values(st).map(r => r.pid))];
  const S = Object.fromEntries(ids.slice(1).map(id => [id, [32, 20, 7, 5, 1, 1, 2, 3, 8, 16, 2, 6, 2, 3]]));
  S[ids[1]] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];           // não entrou
  const res = { upTo: '2026-11-17', stats: { '2026-11-16': S } };
  const out = settle(st, res);
  assert.equal(Object.keys(st).length, 0, 'tudo saiu das abertas');
  assert.ok(out.voids > 0, 'quem não jogou (ou ficou sem boxscore) é anulado');
  const rows = out.days['2026-11-16'];
  assert.ok(rows.length > 0 && rows.every(a => a.length === COLS.length));
  const mt = rows[0][COLS.indexOf('mt')]; assert.equal(mt, 60, 'minutos antes do jogo da leitura de fechamento');
  const R = rowsOf(out.days);
  assert.ok(R.every(r => r.over === 0 || r.over === 1));
  const s = resumo(R);
  assert.equal(s.n, R.length);
  for (const k of ['chance', 'porEV', 'porNota', 'cegas', 'porMercado', 'clv', 'hipoteses', 'porDia']) assert.ok(s[k], k);
  assert.ok(s.cegas.margem > 0 && s.cegas.margem < .2);
});

test('Placar: linha sem resultado vence depois de alguns dias', () => {
  const st = { 'x': { d: '2026-11-10', pid: '1', mk: 'PTS', L: 10.5 } };
  assert.equal(settle(st, { upTo: '2026-11-12', stats: {} }).voids, 0, 'ainda espera');
  assert.equal(settle(st, { upTo: '2026-11-15', stats: {} }).voids, 1, 'desiste');
  assert.deepEqual(st, {});
});

test('Placar: resumo da rodada em markdown para o GitHub Actions', async () => {
  const { summaryMd } = await import('../scripts/auditoria.mjs');
  const md = summaryMd({ liquidadas: 3, anuladas: 1, total: { n: 0 } }, { a: { k: .5 }, b: { k: null } }, 10);
  assert.match(md, /Placar da verdade/); assert.match(md, /abertas: \*\*2\*\* \(1 com Kalshi\)/);
});

test('bot.json: chance da Kalshi no lado da linha (kp), só com a escada do mesmo dia', async () => {
  const { buildBotData } = await import('../collector/botdata.js');
  const base = buildBotData(slate, { w: .4 });
  const r = base.rows.find(x => x.m === 'PTS'); assert.ok(r, 'tem linha de pontos no fixture');
  const kalshi = { date: slate.meta.date, gen: slate.meta.generatedAt, list: [{ name: r.n, mk: 'PTS', lines: { [r.l]: .6 } }] };
  const k = buildBotData(slate, { w: .4, kalshi }).rows.find(x => x.id === r.id && x.m === 'PTS');
  assert.equal(k.kp, r.s === 'o' ? .6 : .4);
  const velha = buildBotData(slate, { w: .4, kalshi: { ...kalshi, date: '2026-01-01' } }).rows.find(x => x.id === r.id && x.m === 'PTS');
  assert.equal(velha.kp, undefined);
});
