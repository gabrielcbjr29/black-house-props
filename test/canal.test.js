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
    const [, lo, hi] = BANDS.find(b => b[0] === m.band);
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
