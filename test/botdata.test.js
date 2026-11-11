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

test('cards: linhas marcadas têm últimos 10 jogos e o HTML do card sai completo', async () => {
  const { cardHTML } = await import('../scripts/cards.mjs');
  const slate = JSON.parse(readFileSync(new URL('../public/data/slate.json', import.meta.url)));
  const b = buildBotData(slate, { w: .4 });
  const cards = b.rows.filter(r => r.cd);
  assert.ok(cards.length > 0 && cards.length <= 220, `quantidade de cards: ${cards.length}`);
  assert.ok(cards.every(r => Array.isArray(r.v10) && r.v10.length > 0 && r.v10.length <= 10 && r.ps != null));
  assert.ok(b.rows.every(r => !r._v && !r._r), 'sem funções no JSON');
  const h = cardHTML(cards[0], b.date);
  assert.ok(h.includes(cards[0].n.replace(/&/g, '&amp;').replace(/'/g, "'")) && !/undefined|NaN/.test(h));
});

test('Modelo BH: com slate.model, a projeção do mercado vem do modelo (e a dispersão da binomial negativa)', async () => {
  const { buildProps } = await import('../public/engine.js');
  const slate = JSON.parse(readFileSync(new URL('../public/data/slate.json', import.meta.url)));
  const p = slate.players.find(x => x.status === 'ok' && x.logs.length > 10);
  const s2 = { ...slate, model: { date: slate.meta.date, players: { [p.id]: { fga: [17.25, 25], pts: [21.5, 7], reb: [5.5, 12], ast: [4, 15] } } } };
  const props = buildProps(s2, { calib: false }).filter(x => x.p.id === p.id);
  const fga = props.find(x => x.mk === 'FGA'), pra = props.find(x => x.mk === 'PRA');
  assert.ok(fga && fga.model && Math.abs(fga.proj - 17.25) < 1e-9, 'FGA usa o modelo');
  assert.ok(Math.abs(fga.d - (1 + 17.25 / 25)) < 1e-9, 'dispersão da binomial negativa');
  assert.ok(pra && pra.model && Math.abs(pra.proj - 31) < 1e-9, 'combinado soma as estatísticas do modelo');
  const old = buildProps({ ...slate, model: { date: '1999-01-01', players: s2.model.players } }, { calib: false }).find(x => x.p.id === p.id && x.mk === 'FGA');
  assert.ok(old && !old.model, 'modelo de outro dia é ignorado');
});

test('top 10 do Modelo BH: só rotação (24+ min) e linhas que as casas abrem', async () => {
  const { topEligible, TOP_MIN_LINE } = await import('../collector/botdata.js');
  const g = ['FGA', '3PA', 'FTA', '2PA', '2PM', 'FGM'];
  const base = { mb: 1, m: 'FGA', st: 'ok', p: .7, mn: 30, l: 12.5 };
  assert.ok(topEligible(base, g));
  assert.ok(!topEligible({ ...base, mn: 18 }, g), 'reserva fica de fora');
  assert.ok(!topEligible({ ...base, l: TOP_MIN_LINE.FGA - 1 }, g), 'linha baixa fica de fora');
  assert.ok(!topEligible({ ...base, st: 'questionable' }, g), 'em dúvida fica de fora');
  assert.ok(!topEligible({ ...base, mb: 0 }, g), 'só linhas com o Modelo BH');
  assert.ok(!topEligible({ ...base, m: 'PTS' }, g), 'só os mercados do grupo');
});
