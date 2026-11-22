// Radar +EV (21/11) · carteira de TESTE (nenhuma aposta de verdade, nada é enviado a casa nenhuma).
//
// A cada coleta o radar lê todas as linhas do dia que o usuário consegue pegar (99play nos dois lados, Finta nos overs),
// calcula a chance pelo Modelo BH (o mesmo evaluate do bot, w = BOT_W) e o EV = chance × odd − 1. Funil:
//   linhas lidas → no quadro (com preço de casa BR) → pareceram boas (EV na regra) → compradas (passou nas travas).
// Segunda opinião: Novig (bolsa sem margem dos EUA, public/data/novig.json) e Kalshi. Se uma delas tem preço e diz que a
// odd não vale (EV < 0 pela Novig / < −2% pela Kalshi), não compra.
// Stake: Kelly fracionado (1/4) sobre banca de teste de 100u, teto 2u (1u com odd acima de 3,00). Em paralelo conta o resultado como se fosse 1u fixa,
// para comparar Kelly × fixa na revisão.
// Fechamento: a última leitura antes do jogo, na mesma casa e linha → CLV em pontos de chance (1/fech − 1/compra).
// Liquida pelo boxscore (public/data/results.json), como o Placar da verdade.
//
// Estado (fora do site): data/radar/carteira.json e data/radar/varreduras.json. Resumo: public/data/radar.json.
// Uso: node scripts/radar.mjs [public]
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProps, evaluate, devig, impliedMu, makeDist, overProb, kelly } from '../public/engine.js';
import { statOf } from './auditoria.mjs';
import { kalshiAt, norm, ALV } from './alavanca.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CFG = {
  min: .06, max: .30,          // regra: EV de 6% a 30% (acima de 30% quase sempre é linha errada)
  oddMin: 1.40, oddMax: 4.50, pMin: .30, expMin: 18,
  leadMin: 10,                 // não compra a menos de 10 min do jogo
  perGame: 3, perDay: 12,      // travas: 1 por jogador, 3 por jogo, 12 por dia
  banca: 100, frac: .25, maxStake: 2, minStake: .1,
  longOdd: 3, longMax: 1,      // odd acima de 3,00: no máximo 1u (a cauda é onde o modelo mais erra)
  nvMin: 0, kMin: -.02,        // segunda opinião: EV pela Novig ≥ 0, pela Kalshi ≥ −2%
};
const r3 = x => x == null || !Number.isFinite(x) ? null : Math.round(x * 1e3) / 1e3;
const r2 = x => Math.round(x * 100) / 100;
const nn = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/* chance de bolsa sem margem numa linha qualquer: mesma linha → direto; outra linha → média implícita do jogador */
export function sharpAt(list, line, side, d) {
  if (!list?.length) return null;
  const x = list.slice().sort((a, b) => Math.abs(a.line - line) - Math.abs(b.line - line))[0];
  if (Math.abs(x.line - line) > 3) return null;
  const dv = devig(x.o, x.u); if (!dv) return null;
  let pO = dv.pO;
  if (x.line !== line) { if (!d) return null; try { pO = overProb(makeDist(impliedMu(dv.pO, x.line, d), d), line); } catch { return null; } }
  return side === 'o' ? pO : 1 - pO;
}
/* stake de Kelly fracionado em unidades (múltiplos de 0,05u) */
export function stakeOf(p, odd, cfg = CFG) {
  const f = kelly(p, odd) * cfg.frac * cfg.banca;
  if (!(f > 0)) return 0;
  return Math.min(odd > cfg.longOdd ? cfg.longMax : cfg.maxStake, Math.max(cfg.minStake, Math.round(f * 20) / 20));
}

/* uma varredura: todas as linhas com preço de casa BR, com chance, EV e o motivo de entrar ou não */
export function scan({ slate, finta, kalshi, novig, now = Date.now(), cfg = CFG, w = +(process.env.BOT_W || .4) }) {
  const date = slate?.meta?.date;
  let props = []; try { props = buildProps(slate, { calib: true }); } catch { }
  const FIN = new Map();
  if (finta?.date === date) for (const l of finta.lines ?? []) if (+l.o > 1) { const k = l.pid + '|' + l.mk; (FIN.get(k) ?? FIN.set(k, []).get(k)).push(l); }
  const NV = new Map();
  if (novig?.date === date) for (const l of novig.lines ?? []) { const k = nn(l.name) + '|' + l.mk; (NV.get(k) ?? NV.set(k, []).get(k)).push(l); }
  const kOk = kalshi?.list?.length && kalshi.date === date && !(kalshi.gen && Math.abs(now - Date.parse(kalshi.gen)) / 36e5 >= ALV.staleH);
  const K = kOk ? new Map(kalshi.list.map(k => [norm(k.name) + '|' + k.mk, k])) : null;
  const out = []; let lidas = 0;
  for (const pr of props) {
    const tip = Date.parse(pr.game?.timeUTC); if (!(tip > now)) continue;
    lidas++;
    const base = { pid: String(pr.p.id), name: pr.p.name, team: pr.p.team, opp: pr.p.team === pr.game.home ? pr.game.away : pr.game.home, game: pr.game.id, tip: pr.game.timeUTC, mk: pr.mk };
    const cands = [];
    const b9 = pr.book?.books?.['99play'];
    if (b9?.o > 1 && b9?.u > 1) {
      let e; try { e = evaluate(pr, { line: pr.book.line, oOver: b9.o, oUnder: b9.u, book: '99play' }, { w }); } catch { }
      if (e) { cands.push({ casa: '99play', side: 'o', line: pr.book.line, odd: b9.o, p: e.over.p }); cands.push({ casa: '99play', side: 'u', line: pr.book.line, odd: b9.u, p: e.under.p }); }
    }
    const v10 = (pr.vals ?? []).slice(0, 10);
    for (const f of FIN.get(pr.p.id + '|' + pr.mk) ?? []) {
      let p; try { p = evaluate(pr, { line: f.line }, { w }).over.p; } catch { continue; }
      cands.push({ casa: 'Finta', side: 'o', line: +f.line, odd: +f.o, p, alt: !!f.alt, h10: v10.length ? v10.filter(x => x > f.line).length / v10.length : null });
    }
    const nvL = NV.get(nn(pr.p.name) + '|' + pr.mk), kk = K?.get(norm(pr.p.name) + '|' + pr.mk);
    for (const c of cands) {
      const ev = c.p * c.odd - 1;
      const pNv = sharpAt(nvL, c.line, c.side, pr.d);
      let pk = null; if (kk && ALV.mk.includes(pr.mk)) { const a = kalshiAt(kk, c.line, pr.mk); if (a?.p != null) pk = c.side === 'o' ? a.p : 1 - a.p; }
      // por que não entra (a primeira trava que barrou); vazio = passou na regra
      const why = !(c.odd >= cfg.oddMin && c.odd <= cfg.oddMax) ? 'odd fora da faixa'
        : pr.p.status && pr.p.status !== 'ok' ? 'jogador em dúvida'
        : (pr.ctx?.exp ?? 0) < cfg.expMin ? 'poucos minutos previstos'
        : c.p < cfg.pMin ? 'chance baixa'
        : c.alt && (c.h10 ?? 0) < .3 ? 'cauda da escada'
        : ev < cfg.min ? 'EV abaixo da regra' : ev > cfg.max ? 'EV alto demais (linha suspeita)'
        : (tip - now) / 6e4 < cfg.leadMin ? 'jogo começando'
        : '';
      const sharp = why ? '' : pNv != null && pNv * c.odd - 1 < cfg.nvMin ? 'Novig contra' : pk != null && pk * c.odd - 1 < cfg.kMin ? 'Kalshi contra' : '';
      out.push({ ...base, ...c, p: r3(c.p), ev: r3(ev), pNv: r3(pNv), pk: r3(pk), boa: !why, ok: !why && !sharp, why: why || sharp });
    }
  }
  return { at: new Date(now).toISOString(), date, lidas, quadro: out.length, cands: out };
}

const keyOf = c => `${c.pid}|${c.mk}|${c.side}`;
/* escolhe o que comprar nesta varredura (travas) e devolve as compras novas */
export function choose(S, carteira, cfg = CFG) {
  const today = carteira.filter(x => x.date === S.date);
  const have = new Set(today.map(keyOf)), perGame = {}, perPlayer = new Set(today.map(x => x.pid + '|' + x.game));
  for (const x of today) perGame[x.game] = (perGame[x.game] ?? 0) + 1;
  let n = today.length; const buys = [];
  for (const c of S.cands.filter(c => c.ok).sort((a, b) => b.ev - a.ev)) {
    if (n >= cfg.perDay) break;
    if (have.has(keyOf(c)) || perPlayer.has(c.pid + '|' + c.game) || (perGame[c.game] ?? 0) >= cfg.perGame) continue;
    const stake = stakeOf(c.p, c.odd, cfg); if (!stake) continue;
    buys.push({ id: `${S.date}|${keyOf(c)}`, date: S.date, at: S.at, pid: c.pid, name: c.name, team: c.team, opp: c.opp, game: c.game, tip: c.tip,
      mk: c.mk, side: c.side, line: c.line, odd: c.odd, casa: c.casa, p: c.p, ev: c.ev, pNv: c.pNv, pk: c.pk, stake, status: 'aberta' });
    have.add(keyOf(c)); perPlayer.add(c.pid + '|' + c.game); perGame[c.game] = (perGame[c.game] ?? 0) + 1; n++;
  }
  return buys;
}
/* fechamento: a última leitura antes do jogo, na mesma casa, lado e linha */
export function updateClose(carteira, S, now = Date.now()) {
  const m = new Map(S.cands.map(c => [`${c.pid}|${c.mk}|${c.side}|${c.casa}|${c.line}`, c])); let n = 0;
  for (const x of carteira) {
    if (x.status !== 'aberta' || !(Date.parse(x.tip) > now)) continue;
    const c = m.get(`${x.pid}|${x.mk}|${x.side}|${x.casa}|${x.line}`); if (!c) continue;
    if (x.fc !== c.odd) { x.fc = c.odd; n++; } x.fcAt = S.at;
  }
  return n;
}
/* liquida pelo boxscore: green/red/devolvida; lucro com a stake de Kelly e com 1u fixa */
export function settle(carteira, results, { keepDays = 3 } = {}) {
  let n = 0; const upTo = results?.upTo ? Date.parse(results.upTo) : 0;
  for (const x of carteira) {
    if (x.status !== 'aberta') continue;
    const S = results?.stats?.[x.date];
    if (!S) { if (upTo && (upTo - Date.parse(x.date)) / 864e5 > keepDays) { x.status = 'devolvida'; x.why = 'sem resultado'; x.lucro = 0; x.lucro1 = 0; n++; } continue; }
    const a = S[x.pid];
    if (!a || !(a[0] > 0)) { Object.assign(x, { status: 'devolvida', why: 'não jogou', lucro: 0, lucro1: 0 }); n++; continue; }
    const y = statOf(a, x.mk); if (y == null) continue;
    const win = x.side === 'o' ? y > x.line : y < x.line;
    x.y = y; x.status = y === x.line ? 'devolvida' : win ? 'green' : 'red';
    x.lucro = x.status === 'green' ? r2(x.stake * (x.odd - 1)) : x.status === 'red' ? -x.stake : 0;
    x.lucro1 = x.status === 'green' ? r2(x.odd - 1) : x.status === 'red' ? -1 : 0;
    n++;
  }
  return n;
}
export const clvOf = x => x.fc > 1 ? r3(1 / x.fc - 1 / x.odd) : null;
/* números de um período: Kelly × 1u fixa, acerto, EV médio, CLV */
export function stats(list) {
  const L = list.filter(x => ['green', 'red', 'devolvida'].includes(x.status)), V = L.filter(x => x.status !== 'devolvida');
  const stake = list.reduce((s, x) => s + x.stake, 0), stakeL = V.reduce((s, x) => s + x.stake, 0);
  const lucro = L.reduce((s, x) => s + (x.lucro ?? 0), 0), lucro1 = L.reduce((s, x) => s + (x.lucro1 ?? 0), 0);
  const C = list.map(clvOf).filter(v => v != null);
  return { n: list.length, liquidadas: L.length, abertas: list.filter(x => x.status === 'aberta').length,
    green: V.filter(x => x.status === 'green').length, red: V.filter(x => x.status === 'red').length,
    stake: r2(stake), lucro: r2(lucro), roi: stakeL ? r3(lucro / stakeL) : null, lucro1: r2(lucro1), roi1: V.length ? r3(lucro1 / V.length) : null,
    ev: list.length ? r3(list.reduce((s, x) => s + x.ev, 0) / list.length) : null,
    clv: C.length ? r3(C.reduce((s, v) => s + v, 0) / C.length) : null, bate: C.length ? r3(C.filter(v => v > 0).length / C.length) : null, nClv: C.length };
}
const brDay = t => new Date(Date.parse(t) - 3 * 36e5).toISOString().slice(0, 10);
const slim = c => ({ n: c.name, t: c.team, mk: c.mk, s: c.side, l: c.line, o: c.odd, c: c.casa, ev: c.ev, p: c.p, why: c.why, nv: c.pNv, k: c.pk });

/* monta o resumo do site e do bot */
export function report({ S, carteira, scans, cfg = CFG, now = Date.now() }) {
  const today = brDay(new Date(now).toISOString()), d7 = brDay(new Date(now - 6 * 864e5).toISOString());
  const day = x => brDay(x.at ?? x.tip);
  const sc = scans.filter(s => s.date === S.date);
  const boasHoje = new Set(sc.flatMap(s => s.boasK ?? []));
  const CH = carteira.filter(x => x.date === S.date), C7 = carteira.filter(x => day(x) >= d7);
  const casas = {}; for (const x of CH) casas[x.casa] = (casas[x.casa] ?? 0) + 1;
  const boas = S.cands.filter(c => c.ok).sort((a, b) => b.ev - a.ev);
  // mais perto da regra: EV positivo mas abaixo do mínimo, ou barrada pela segunda opinião (Novig/Kalshi)
  const perto = S.cands.filter(c => !c.ok && c.ev > 0 && ['EV abaixo da regra', 'Novig contra', 'Kalshi contra'].includes(c.why)).sort((a, b) => b.ev - a.ev).slice(0, 5);
  return {
    v: 1, gen: new Date(now).toISOString(), date: S.date, cfg,
    agora: { at: S.at, lidas: S.lidas, quadro: S.quadro, boas: boas.length, comprou: scans.at(-1)?.compradas?.length ?? 0,
      titulo: boas.length ? `${boas.length} ${boas.length > 1 ? 'entradas' : 'entrada'} na mira` : 'Nada que valha apostar',
      sub: boas.length ? `EV de ${Math.round(boas.at(-1).ev * 100)}% a ${Math.round(boas[0].ev * 100)}% pelo Modelo BH` : S.quadro ? `Nenhum preço passou da regra (EV ${Math.round(cfg.min * 100)}%+) agora` : 'Sem linhas da 99play ou da Finta para ler agora',
      mira: boas.slice(0, 12).map(slim), perto: perto.map(slim) },
    hoje: { varreduras: sc.length, boas: boasHoje.size, compradas: CH.length, ...stats(CH) },
    periodos: { hoje: stats(CH), d7: stats(C7), tudo: stats(carteira) }, casas,
    varreduras: scans.slice(-80).reverse().map(s => ({ at: s.at, lidas: s.lidas, quadro: s.quadro, boas: s.boas, compradas: s.compradas, stake: s.stake, melhor: s.melhor })),
    carteira: carteira.filter(x => day(x) >= brDay(new Date(now - 30 * 864e5).toISOString())).slice().reverse().map(x => ({ ...x, clv: clvOf(x) })),
  };
}

function main() {
  const pub = join(ROOT, process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'public');
  const J = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
  const slate = J(join(pub, 'data', 'slate.json')); if (!slate?.meta?.date) { console.log('radar: sem slate'); return; }
  const dir = join(ROOT, 'data', 'radar'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const carteira = J(join(dir, 'carteira.json'), []), scans = J(join(dir, 'varreduras.json'), []);
  const now = Date.now();
  const S = scan({ slate, finta: J(join(pub, 'data', 'finta.json')), kalshi: J(join(pub, 'data', 'kalshi.json')), novig: J(join(pub, 'data', 'novig.json')), now });
  const fech = updateClose(carteira, S, now);
  const buys = choose(S, carteira); carteira.push(...buys);
  const liq = settle(carteira, J(join(pub, 'data', 'results.json')));
  const top = S.cands.slice().sort((a, b) => b.ev - a.ev)[0];
  scans.push({ at: S.at, date: S.date, lidas: S.lidas, quadro: S.quadro, boas: S.cands.filter(c => c.ok).length, boasK: S.cands.filter(c => c.ok).map(c => keyOf(c) + '|' + c.casa + '|' + c.line),
    compradas: buys.map(b => ({ n: b.name, mk: b.mk, s: b.side, l: b.line, o: b.odd, c: b.casa, ev: b.ev, st: b.stake })), stake: r2(buys.reduce((s, b) => s + b.stake, 0)),
    melhor: top ? { n: top.name, mk: top.mk, s: top.side, l: top.line, o: top.odd, c: top.casa, ev: top.ev, why: top.why } : null });
  while (scans.length > 400) scans.shift();
  writeFileSync(join(dir, 'carteira.json'), JSON.stringify(carteira));
  writeFileSync(join(dir, 'varreduras.json'), JSON.stringify(scans));
  const R = report({ S, carteira, scans, now });
  writeFileSync(join(pub, 'data', 'radar.json'), JSON.stringify(R));
  const nv = S.cands.filter(c => c.pNv != null).length;
  console.log(`radar: ${S.lidas} linhas lidas · ${S.quadro} no quadro · ${R.agora.boas} boas · ${buys.length} compradas (${r2(buys.reduce((s, b) => s + b.stake, 0))}u) · ${fech} fechamentos · ${liq} liquidadas · Novig em ${nv}`);
  if (process.env.GITHUB_STEP_SUMMARY) try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### 📡 Radar\n${R.agora.titulo} · ${S.quadro} no quadro · ${buys.length} compradas\n`); } catch { }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
