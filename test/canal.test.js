import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates, singles, multiples, caption, plan, cardHTML, BANDS } from '../scripts/canal.mjs';

const NOW = Date.parse('2026-11-15T15:00:00Z');
const games = [
  { id: 'g1', home: 'MIL', away: 'ATL', timeUTC: '2026-11-16T01:00:00Z' }, { id: 'g2', home: 'TOR', away: 'NYK', timeUTC: '2026-11-15T23:00:00Z' },
  { id: 'g3', home: 'BOS', away: 'DAL', timeUTC: '2026-11-15T23:00:00Z' }, { id: 'g4', home: 'LAC', away: 'CHA', timeUTC: '2026-11-15T21:30:00Z' },
  { id: 'g5', home: 'WAS', away: 'HOU', timeUTC: '2026-11-16T00:00:00Z' }, { id: 'g6', home: 'SAC', away: 'OKC', timeUTC: '2026-11-16T02:00:00Z' },
  { id: 'g0', home: 'PHI', away: 'IND', timeUTC: '2026-11-15T14:00:00Z' }];
const slate = { meta: { date: '2026-11-15' }, games };
const opp = { MIL: 'ATL', ATL: 'MIL', TOR: 'NYK', NYK: 'TOR', BOS: 'DAL', DAL: 'BOS', LAC: 'CHA', CHA: 'LAC', WAS: 'HOU', HOU: 'WAS', SAC: 'OKC', OKC: 'SAC', PHI: 'IND', IND: 'PHI' };
let n = 0;
const pk = (team, o = {}) => ({ strategy_id: 'm-ra', pid: 'p' + (++n), name: 'Jogador ' + n, team, opp: opp[team], mk: 'RA', side: 'u', line: 4.5, odd: 1.9, p: .6, edge: .14,
  tip_utc: games.find(g => g.home === team || g.away === team).timeUTC, sq: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0], t9: '2026-11-15T14:30:00Z', ...o });

test('canal: candidatas tiram jogo começado, odd velha, odd fora da faixa e repetem uma por jogador', () => {
  const a = pk('MIL'), dup = { ...pk('MIL'), pid: a.pid, mk: 'FTA', edge: .2 };
  const picks = [a, dup, pk('PHI'), pk('TOR', { t9: '2026-11-15T12:00:00Z' }), pk('BOS', { odd: 4.2 }), pk('LAC', { edge: .4 }), pk('WAS')];
  const c = candidates({ strat: { picks }, slate, events: { g1: 111 }, now: NOW });
  assert.deepEqual(c.map(x => x.team), ['MIL', 'WAS']);
  assert.equal(c[0].mk, 'FTA'); // a de maior EV do jogador
  assert.equal(c[0].ev, 111);
  assert.equal(c[0].home, 'MIL');
});

test('canal: simples com EV 5%+, completando com 3%+ quando faltam', () => {
  const few = [{ edge: .09 }, { edge: .04 }, { edge: .01 }];
  assert.equal(singles(few).length, 2);
  const many = Array.from({ length: 18 }, (_, i) => ({ edge: .2 - i * .005 })).concat([{ edge: .04 }]);
  assert.ok(singles(many).every(x => x.edge >= .05));
});

test('canal: múltiplas nas faixas 7–10, 12–17 e 20–25, uma perna por jogo', () => {
  const teams = ['MIL', 'TOR', 'BOS', 'LAC', 'WAS', 'SAC', 'ATL', 'NYK', 'DAL', 'CHA', 'HOU', 'OKC'];
  const picks = teams.map((t, i) => pk(t, { odd: 1.6 + (i % 4) * .1, p: .62 - i * .003, edge: .03 }));
  const M = multiples(candidates({ strat: { picks }, slate, now: NOW }));
  assert.equal(M.length, 3);
  for (const m of M) {
    const [, lo, hi] = BANDS.find(b => b[0] === m.band.split('-')[0]);
    assert.ok(m.band.endsWith('-under') && m.legs.every(l => l.side === 'u'));
    assert.ok(m.odd >= lo && m.odd <= hi, `${m.band} @${m.odd}`);
    assert.equal(new Set(m.legs.map(l => l.game)).size, m.legs.length);
    assert.ok(m.legs.every((l, i, a) => !i || Date.parse(a[i - 1].tip) <= Date.parse(l.tip)));
  }
});

test('canal: legenda no padrão (NBA, unidade, sequência, link) e card com a casa primeiro', () => {
  const x = { ...pk('MIL'), tip: '2026-11-16T01:00:00Z', home: 'MIL', away: 'ATL', game: 'g1' };
  const c = caption(x);
  assert.match(c, /^🏀 NBA 🏀\n\n💰 \{UN\}\n\n<blockquote>Sequência: 1-2-3-4-5-6-7-8-9-0<\/blockquote>\n\n\{LINK\}$/);
  const h = cardHTML(x);
  assert.ok(h.indexOf('Milwaukee Bucks') < h.indexOf('Atlanta Hawks'));
  assert.match(h, /Rebotes \+ Assistências Mais de\/Menos de/);
  assert.match(h, /Jogador \d+ \(MIL\) menos 4,5/);
  assert.match(h, /15\/11 • 22:00/);
  const P = plan({ strat: { picks: [pk('TOR'), pk('BOS')] }, slate, now: NOW });
  assert.equal(P.date, '2026-11-15');
  assert.ok(P.singles.every(s => s.img.startsWith('canal/s-') && s.cap.includes('{LINK}')));
});

test('canal: card no estilo BR365 (só a seleção, odd com ponto) e caminho da imagem 365', async () => {
  const { card365HTML } = await import('../scripts/canal.mjs');
  const s = { name: 'Devin Booker', team: 'PHX', side: 'o', line: 5.5, odd: 1.74, mk: 'AST', home: 'PHX', away: 'LAL' };
  const h = card365HTML(s);
  assert.match(h, /Devin Booker — Devin Booker \(PHX\) mais 5,5/);
  assert.match(h, />1\.74</);
  assert.match(h, /Assistências Mais de\/Menos de \(incluindo Prorrogação\)/);
  assert.match(h, /Phoenix Suns x LA Lakers/);
  assert.doesNotMatch(h, /BLACK|Odd total/);
  const m = card365HTML({ odd: 7.25, legs: [s, { ...s, name: 'Kevin Durant' }] });
  assert.match(m, /Odd total<\/b><b>7\.25/);
  const P = plan({ strat: { picks: [pk('TOR')] }, slate, now: NOW });
  assert.ok(P.singles[0].img365.startsWith('canal/365/s-'));
});

test('canal: múltiplas de over e de under a partir das linhas da 99play do bot', async () => {
  const { legPool } = await import('../scripts/canal.mjs');
  const teams = ['MIL', 'TOR', 'BOS', 'LAC', 'WAS', 'SAC', 'ATL', 'NYK', 'DAL', 'CHA', 'HOU', 'OKC'];
  const rows = teams.flatMap((t, i) => ['o', 'u'].map(sd => ({ id: 'r' + i, n: 'J' + i, t, o: opp[t], m: 'PTS', s: sd, l: 10.5, d: 1.6 + (i % 4) * .1, p: .63 - i * .002, e: .02,
    gr: 'A', mn: 30, st: 'ok', c9: 1, t9: '2026-11-15T14:30:00Z', sq: [1, 2] })));
  rows.push({ ...rows[0], id: 'x', s: 'o', mn: 12 }, { ...rows[0], id: 'y', s: 'o', c9: 0 }, { ...rows[0], id: 'z', s: 'o', gr: 'C' });
  const pool = legPool({ bot: { rows }, slate, now: NOW });
  assert.ok(!pool.some(x => ['x', 'y', 'z'].includes(x.pid)));
  const M = multiples(pool);
  assert.deepEqual(M.map(m => m.band).sort(), ['10-over', '10-under', '15-over', '15-under', '25-over', '25-under']);
  for (const m of M) assert.ok(m.legs.every(l => l.side === (m.band.endsWith('over') ? 'o' : 'u')));
});

// ---------------- hub de canais ----------------
const hubRows = () => {
  const teams = ['MIL', 'TOR', 'BOS', 'LAC', 'WAS', 'SAC', 'ATL', 'NYK', 'DAL', 'CHA', 'HOU', 'OKC'], mks = ['PTS', 'REB', 'AST', 'PRA', 'FTA', '2PA'];
  const rows = [];
  teams.forEach((t, i) => mks.forEach((m, j) => ['o', 'u'].forEach(sd => rows.push({ id: `p${i}x${j % 3}`, n: `J${i}-${j % 3}`, t, o: opp[t], m, s: sd, l: 8.5,
    d: 1.5 + ((i + j) % 5) * .12, p: .6 + ((i * 7 + j * 3) % 10) / 100, e: .03 + ((i + 2 * j) % 8) / 100, gr: 'A', mn: 30, st: 'ok', c9: 1, t9: '2026-11-15T14:30:00Z', sq: [1, 2, 3] }))));
  return rows;
};
test('hub: cada canal tem no máximo 30% de simples repetidas (contando para os dois lados) e uma por jogador', async () => {
  const { planHub } = await import('../scripts/canal.mjs');
  const hub = { canais: [1, 2, 3, 4].map(id => ({ id, cfg: { max: 10 } })), postados: [] };
  const P = planHub({ bot: { rows: hubRows() }, slate, hub, now: NOW });
  const holders = new Map();
  for (const [id, c] of Object.entries(P.canais)) for (const x of c.singles) (holders.get(x.pid + x.mk) ?? holders.set(x.pid + x.mk, new Set()).get(x.pid + x.mk)).add(id);
  for (const [id, c] of Object.entries(P.canais)) {
    assert.ok(c.singles.length > 0);
    const rep = c.singles.filter(x => holders.get(x.pid + x.mk).size > 1).length;
    assert.ok(rep <= 3, `canal ${id}: ${rep} repetidas de ${c.singles.length}`);
    assert.equal(new Set(c.singles.map(x => x.pid)).size, c.singles.length);
  }
});
test('hub: sem prioridade fixa (a ordem gira por dia) e o filtro de cada canal vale', async () => {
  const { planHub } = await import('../scripts/canal.mjs');
  const firstPick = date => {
    const P = planHub({ bot: { rows: hubRows() }, slate: { ...slate, meta: { date } }, hub: { canais: [{ id: 1, cfg: { max: 3 } }, { id: 2, cfg: { max: 3 } }], postados: [] }, now: NOW });
    return [P.canais[1].singles[0].key, P.canais[2].singles[0].key];
  };
  const d1 = firstPick('2026-11-15'), d2 = firstPick('2026-11-16');
  assert.equal(d1[0], d2[1]); // a melhor entrada vai para um canal num dia e para o outro no dia seguinte
  const P = planHub({ bot: { rows: hubRows() }, slate, hub: { canais: [{ id: 7, cfg: { oddMin: 1.7, mercados: ['PTS', 'REB'], lado: 'o' } }], postados: [] }, now: NOW });
  assert.ok(P.canais[7].singles.every(x => x.odd >= 1.7 && ['PTS', 'REB'].includes(x.mk) && x.side === 'o'));
});
test('hub: múltiplas personalizadas (odd alvo + pernas + lado), nenhuma igual entre canais, e o que já saiu é respeitado', async () => {
  const { planHub } = await import('../scripts/canal.mjs');
  const spec = [{ odd: 5, pernas: 3, lado: 'o' }, { odd: 10, pernas: 4, lado: 'm' }];
  const hub = { canais: [{ id: 1, cfg: { multis: spec } }, { id: 2, cfg: { multis: spec } }], postados: [] };
  const P = planHub({ bot: { rows: hubRows() }, slate, hub, now: NOW });
  const sigs = [];
  for (const c of Object.values(P.canais)) for (const m of c.multis) {
    const sp = m.band.startsWith('5x3') ? spec[0] : spec[1];
    assert.equal(m.legs.length, sp.pernas);
    assert.ok(m.odd >= sp.odd * .85 && m.odd <= sp.odd * 1.15, `${m.band} @${m.odd}`);
    if (sp.lado === 'o') assert.ok(m.legs.every(l => l.side === 'o'));
    sigs.push(m.legs.map(l => l.pid + l.mk).sort().join('|'));
  }
  assert.equal(new Set(sigs).size, sigs.length);
  // canal 1 já postou a 5x3-over: ela não volta para a pauta dele
  const P2 = planHub({ bot: { rows: hubRows() }, slate, hub: { ...hub, postados: [{ canal_id: 1, kind: 'multipla', band: '5x3-over', legs: [] }] }, now: NOW });
  assert.ok(!P2.canais[1].multis.some(m => m.band === '5x3-over'));
  assert.ok(P2.canais[2].multis.some(m => m.band === '5x3-over'));
});
