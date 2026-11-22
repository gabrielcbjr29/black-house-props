// Backtest do Radar +EV (21/11): reprisa o radar leitura a leitura pelo histórico do git (slate, Finta e Kalshi de cada
// coleta), com o motor de hoje (scripts/radar.mjs): mesma regra, travas, Kelly, fechamento e liquidação pelo boxscore.
// Para comparar regras sem refazer tudo, cada leitura é varrida uma vez com a regra aberta e as variações são filtradas
// depois (EV mínimo, segunda opinião).
// Uso: node scripts/radar-backtest.mjs [desde=2026-11-13] [--json saida.json]
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, choose, updateClose, settle, stats, clvOf, CFG } from './radar.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const since = process.argv.find(a => /^\d{4}-\d\d-\d\d$/.test(a)) ?? '2026-11-13';
const outJ = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const git = cmd => execSync(`git ${cmd}`, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();
const show = (c, f) => { try { return JSON.parse(execSync(`git show ${c}:public/data/${f}`, { cwd: ROOT, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { return null; } };
const results = JSON.parse(readFileSync(join(ROOT, 'public/data/results.json'), 'utf8'));

// 1) varre cada leitura uma vez, com a regra aberta (sem corte de EV nem segunda opinião)
const OPEN = { ...CFG, min: -9, max: 99, nvMin: -99, kMin: -99 };
const commits = git(`log --reverse --since=${since} --format='%H|%cI' -- public/data/slate.json`).trim().split('\n').map(l => l.split('|'));
// peso do modelo na mistura com o mercado: 0,4 (o do bot) e os mais leves que o Placar da verdade aponta
const WS = [.4, .2];
const SC = Object.fromEntries(WS.map(w => [w, []])); let t0 = Date.now();
const has = (c, f) => { try { execSync(`git cat-file -e ${c}:public/data/${f}`, { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };
for (const [c, iso] of commits) {
  const slate = show(c, 'slate.json'); if (!slate?.meta?.date) continue;
  const now = Date.parse(iso), finta = show(c, 'finta.json'), kalshi = show(c, 'kalshi.json'), novig = has(c, 'novig.json') ? show(c, 'novig.json') : null;
  for (const w of WS) {
    let S; try { S = scan({ slate, finta, kalshi, novig, now, cfg: OPEN, w }); } catch (e) { continue; }
    // guarda só o necessário (as que passam nas travas que não dependem do EV)
    S.cands = S.cands.filter(x => !x.why && (x.ev > 0 || x.pk != null));
    SC[w].push(S);
  }
}
let scans = SC[.4];
console.error(`${scans.length} leituras varridas (${WS.length} pesos) em ${Math.round((Date.now() - t0) / 1000)}s`);

// 2) simula uma regra em cima das leituras
function sim(rule) {
  const cfg = { ...CFG, ...rule }, car = [];
  for (const S of SC[rule.w ?? .4]) {
    // rule.sharp = 'k': o preço justo passa a ser a Kalshi (EV e Kelly pela chance da Kalshi); 'k+bh': Kalshi e modelo concordam
    const nowS = Date.parse(S.at);
    const base = rule.sharp ? S.cands.filter(x => x.pk != null && (!rule.near || (Date.parse(x.tip) - nowS) / 6e4 <= rule.near)).map(x => ({ ...x, pBH: x.p, evBH: x.ev, p: x.pk, ev: Math.round((x.pk * x.odd - 1) * 1e3) / 1e3 })) : S.cands;
    const cands = base.map(x => ({ ...x, ok: x.ev >= cfg.min && x.ev <= cfg.max && (rule.sharp !== 'k+bh' || x.evBH >= 0)
      && (rule.casa ? x.casa === rule.casa : true) && (rule.side ? x.side === rule.side : true)
      && !(rule.maxHold != null && x.mg != null && (x.mg > rule.maxHold || x.mg < (rule.minHold ?? -1))) && !(rule.no05 && x.line === .5) && !(rule.minN && (x.ng ?? 99) < rule.minN)
      && !(x.pNv != null && x.pNv * x.odd - 1 < cfg.nvMin) && !(x.pk != null && x.pk * x.odd - 1 < cfg.kMin) }));
    const T = { ...S, cands }, now = Date.parse(S.at);
    updateClose(car, T, now);
    car.push(...choose(T, car, cfg));
  }
  settle(car, results);
  return car.filter(x => x.status !== 'aberta');
}
const pct = x => x == null ? '—' : (x * 100).toFixed(1) + '%';
const u = x => (x >= 0 ? '+' : '') + x.toFixed(2) + 'u';
const line = (nm, L) => { const s = stats(L); const V = L.filter(x => x.status !== 'devolvida');
  const prev = V.length ? V.reduce((a, x) => a + x.p, 0) / V.length : null, real = V.length ? s.green / V.length : null;
  const Q = V.filter(x => x.q != null), mkt = Q.length ? Q.reduce((a, x) => a + x.q, 0) / Q.length : null;
  return { nm, n: V.length, green: s.green, red: s.red, prev, real, mkt, stake: s.stake, kelly: s.lucro, roi: s.roi, flat: s.lucro1, roi1: s.roi1, clv: s.clv, bate: s.bate, nClv: s.nClv, ev: s.ev }; };
const fmt = r => `${r.nm.padEnd(30)} ${String(r.n).padStart(4)}  ${String(r.green).padStart(3)}G ${String(r.red).padStart(3)}R  prev ${pct(r.prev).padStart(6)} 99 ${pct(r.mkt).padStart(6)} real ${pct(r.real).padStart(6)}  Kelly ${u(r.kelly).padStart(8)} (ROI ${pct(r.roi).padStart(6)})  1u ${u(r.flat).padStart(8)} (ROI ${pct(r.roi1).padStart(6)})  CLV ${r.clv == null ? '   —' : ((r.clv * 100).toFixed(1) + 'pp').padStart(6)} bate ${pct(r.bate)} (${r.nClv})`;

const RULES = [['Antes: peso 0,4 · EV 6%+', {}], ['Novo: peso 0,2 · EV 6%+', { w: .2 }], ['Peso 0,2 · EV 10%+', { w: .2, min: .10 }], ['Peso 0,2 · só over', { w: .2, side: 'o' }],
  ['Peso 0,2 · hold 2–10% (Edge Engine)', { w: .2, maxHold: .10, minHold: .02 }], ['Peso 0,2 · hold até 8%', { w: .2, maxHold: .08 }], ['Peso 0,2 · sem linha 0,5', { w: .2, no05: true }], ['Peso 0,2 · amostra 10+ jogos', { w: .2, minN: 10 }],
  ['Peso 0,2 · hold 2–10% + sem 0,5', { w: .2, maxHold: .10, minHold: .02, no05: true }],
  ['Novo: Kalshi ≤150 min · EV 4%+', { sharp: 'k', near: 150, min: .04 }], ['Kalshi ≤90 min · EV 4%+', { sharp: 'k', near: 90, min: .04 }], ['Kalshi como preço justo · EV 4%+', { sharp: 'k', min: .04 }], ['Kalshi · EV 2%+', { sharp: 'k', min: .02 }], ['Kalshi 4%+ e modelo a favor', { sharp: 'k+bh', min: .04 }], ['EV 3%+', { min: .03 }], ['EV 10%+', { min: .10 }], ['EV 15%+', { min: .15 }], ['Sem 2ª opinião', { nvMin: -99, kMin: -99 }],
  ['Só 99play', { casa: '99play' }], ['Só Finta', { casa: 'Finta' }], ['Só over', { side: 'o' }], ['Só under', { side: 'u' }]];
const out = { since, leituras: scans.length, dias: [...new Set(scans.map(s => s.date))], regras: [], quebras: {} };
console.log(`\nBACKTEST DO RADAR · leituras de ${since} em diante · liquidadas até ${results.upTo ?? results.dates.at(-1)}\n`);
for (const [nm, r] of RULES) { const L = sim(r); const R = line(nm, L); out.regras.push(R); console.log(fmt(R)); }

// 3) quebras da regra nova (peso 0,2)
const A = sim({ w: .2 });
const group = (nm, f) => { const m = new Map(); for (const x of A) { const k = f(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); }
  out.quebras[nm] = [...m].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, L]) => line(String(k), L)); console.log(`\n· ${nm}`); out.quebras[nm].forEach(r => console.log(fmt(r))); };
group('Faixa de EV', x => x.ev < .10 ? '6–10%' : x.ev < .15 ? '10–15%' : x.ev < .20 ? '15–20%' : '20–30%');
group('Faixa de odd', x => x.odd < 1.8 ? '1,40–1,79' : x.odd < 2.2 ? '1,80–2,19' : x.odd < 3 ? '2,20–2,99' : '3,00–4,50');
group('Casa', x => x.casa); group('Lado', x => x.side === 'o' ? 'over' : 'under');
group('Mercado', x => x.mk); group('Dia', x => x.date);
group('Segunda opinião', x => x.pk != null || x.pNv != null ? 'com Kalshi/Novig' : 'sem referência');
if (outJ) writeFileSync(outJ, JSON.stringify({ ...out, entradas: A.map(x => ({ ...x, clv: clvOf(x) })) }));
