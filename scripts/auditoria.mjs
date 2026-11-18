// Placar da verdade (auditoria contínua). Só mede: não muda nenhum método, odd ou pauta.
//
// Cada coleta grava a leitura da 99play de cada linha ANTES do jogo. A primeira leitura é a abertura e a última é o
// fechamento. Junto vão a chance do Modelo BH (evaluate com o mesmo w do bot), a chance sem margem da 99play e o preço
// da Kalshi na mesma linha, quando ela tem a escada. Quando sai o boxscore, a linha é liquidada.
// O resumo vai para public/data/auditoria.json. É o material da revisão de 24/11:
//   • Brier e log-loss: 99play sem margem × BH final × modelo puro × Kalshi (onde houver);
//   • calibração, ROI por faixa de EV, por nota e por mercado, e over × under às cegas;
//   • CLV contra a 99play (abertura → fechamento) × CLV contra a Kalshi (preço afiado no fechamento);
//   • valor contra a Kalshi (a base do Método Alavanca) e as hipóteses de under em aberto.
//
// Uso:
//   node scripts/auditoria.mjs [public]                  → coleta de agora + liquida + resumo (roda no pipeline)
//   node scripts/auditoria.mjs [public] --backfill 2026-11-12 → refaz tudo pelo histórico do git desde a data
//
// Estado (fora do site): data/auditoria/abertas.json (linhas à espera do resultado) e data/auditoria/AAAA-MM-DD.json
// (linhas liquidadas do dia, em colunas).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildProps, evaluate, devig } from '../public/engine.js';
import { kalshiAt, norm, ALV } from './alavanca.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = +(process.env.BOT_W || .4);
const r4 = x => x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4;

/* colunas das linhas liquidadas: fechamento (última leitura antes do jogo) e abertura (primeira) */
/* mt e fmt = minutos antes do jogo da leitura de fechamento e da de abertura */
export const COLS = ['pid', 'mk', 'L', 'o', 'u', 'pO', 'pM', 'q', 'gO', 'gU', 'k', 'exp', 'st', 'mt', 'tip',
  'fL', 'fo', 'fu', 'fpO', 'fq', 'fk', 'kf', 'fmt', 'y'];
const IDX = { pts: 1, reb: 2, ast: 3, stl: 4, blk: 5, tov: 6, pf: 7, fgm: 8, fga: 9, tpm: 10, tpa: 11, ftm: 12, fta: 13 };
const MKS = { PTS: ['pts'], REB: ['reb'], AST: ['ast'], '3PM': ['tpm'], PRA: ['pts', 'reb', 'ast'], PR: ['pts', 'reb'], PA: ['pts', 'ast'],
  RA: ['reb', 'ast'], FGM: ['fgm'], FGA: ['fga'], '3PA': ['tpa'], FTM: ['ftm'], FTA: ['fta'], STL: ['stl'], BLK: ['blk'],
  SB: ['stl', 'blk'], TOV: ['tov'], PF: ['pf'] };
/* valor do mercado no boxscore [min,pts,reb,ast,stl,blk,tov,pf,fgm,fga,tpm,tpa,ftm,fta] */
export function statOf(a, mk) {
  if (mk === '2PM') return a[8] - a[10];
  if (mk === '2PA') return a[9] - a[11];
  return MKS[mk] ? MKS[mk].reduce((s, k) => s + a[IDX[k]], 0) : null;
}

/* uma leitura (coleta): atualiza as linhas abertas com o que a 99play e a Kalshi mostram agora */
export function observe(state, slate, kalshi, now = Date.now(), { w = W } = {}) {
  const d = slate?.meta?.date; if (!d) return 0;
  const kOk = kalshi?.list?.length && kalshi.date === d && !(kalshi.gen && Math.abs(now - Date.parse(kalshi.gen)) / 36e5 >= ALV.staleH);
  const K = kOk ? new Map(kalshi.list.map(k => [norm(k.name) + '|' + k.mk, k])) : null;
  const at = new Date(now).toISOString();
  let props; try { props = buildProps(slate); } catch { return 0; }
  let n = 0;
  for (const pr of props) {
    const b = pr.book?.books?.['99play']; if (!(b?.o > 1) || !(b?.u > 1)) continue;
    const tip = Date.parse(pr.game?.timeUTC); if (!(tip > now)) continue;
    const L = pr.book.line;
    let e; try { e = evaluate(pr, { line: L, oOver: b.o, oUnder: b.u, book: '99play' }, { w }); } catch { continue; }
    const dv = devig(b.o, b.u); if (!dv) continue;
    const key = `${d}|${pr.p.id}|${pr.mk}`, old = state[key];
    const kk = K?.get(norm(pr.p.name) + '|' + pr.mk);
    const kAt = line => kk && ALV.mk.includes(pr.mk) ? r4(kalshiAt(kk, line, pr.mk)?.p) : null;
    const f = old?.f ?? { L, o: b.o, u: b.u, pO: r4(e.over.p), q: r4(dv.pO), k: kAt(L), at };
    if (f.k == null && f.L === L) f.k = kAt(L);           // primeira leitura da Kalshi na linha de abertura
    state[key] = { d, pid: String(pr.p.id), mk: pr.mk, L, o: b.o, u: b.u, pO: r4(e.over.p), pM: r4(e.over.pModel), q: r4(dv.pO),
      // Kalshi no fechamento = última leitura válida antes do jogo (na linha de fechamento e na linha de abertura)
      gO: e.over.grade ?? null, gU: e.under.grade ?? null, k: kAt(L) ?? (old?.L === L ? old.k : null), kf: kAt(f.L) ?? old?.kf ?? null,
      exp: pr.ctx?.exp == null ? null : Math.round(pr.ctx.exp * 10) / 10, st: pr.p.status ?? null, at, tip: pr.game.timeUTC, f };
    n++;
  }
  return n;
}

/* liquida as linhas abertas com o boxscore; devolve { dia: [linhas em colunas] } e quantas foram anuladas */
export function settle(state, results, { keepDays = 3 } = {}) {
  const out = {}; let voids = 0, pushes = 0;
  const upTo = results?.upTo ? Date.parse(results.upTo) : 0;
  for (const [key, r] of Object.entries(state)) {
    const S = results?.stats?.[r.d];
    if (!S) { if (upTo && (upTo - Date.parse(r.d)) / 864e5 > keepDays) { delete state[key]; voids++; } continue; }
    const a = S[r.pid];
    delete state[key];
    if (!a || !(a[0] > 0)) { voids++; continue; }                 // não jogou: anulada
    const y = statOf(a, r.mk); if (y == null) { voids++; continue; }
    if (y === r.L) pushes++;
    const f = r.f ?? {}, tip = Date.parse(r.tip), mt = t => t ? Math.round((tip - Date.parse(t)) / 6e4) : null;
    (out[r.d] ||= []).push([r.pid, r.mk, r.L, r.o, r.u, r.pO, r.pM, r.q, r.gO, r.gU, r.k, r.exp, r.st, mt(r.at), r.tip,
      f.L ?? null, f.o ?? null, f.u ?? null, f.pO ?? null, f.q ?? null, f.k ?? null, r.kf ?? null, mt(f.at), y]);
  }
  return { days: out, voids, pushes };
}

/* ---------- contas ---------- */
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const brier = (R, f) => { const v = R.filter(r => f(r) != null); return v.length ? r4(mean(v.map(r => (f(r) - r.over) ** 2))) : null; };
const logloss = (R, f) => {
  const v = R.filter(r => f(r) != null); if (!v.length) return null;
  return r4(-mean(v.map(r => { const p = Math.min(.999, Math.max(.001, f(r))); return r.over ? Math.log(p) : Math.log(1 - p); })));
};
/* apostas de 1u: { n, prev (chance prevista média), real (acerto), roi } */
function bets(list) {
  if (!list.length) return { n: 0 };
  const pl = list.reduce((s, b) => s + (b.hit ? b.odd - 1 : -1), 0);
  return { n: list.length, prev: r4(mean(list.map(b => b.p).filter(x => x != null))), real: r4(mean(list.map(b => b.hit))), roi: r4(pl / list.length) };
}
const side = (r, s) => ({ odd: s === 'o' ? r.o : r.u, hit: s === 'o' ? r.over : 1 - r.over, p: s === 'o' ? r.pO : 1 - r.pO });
/* lado de maior EV pelo BH, na odd de fechamento */
const best = r => { const eo = r.pO * r.o - 1, eu = (1 - r.pO) * r.u - 1; return eo >= eu ? { s: 'o', ev: eo, g: r.gO } : { s: 'u', ev: eu, g: r.gU }; };

export function rowsOf(dayFiles) {
  const R = [];
  for (const [d, rows] of Object.entries(dayFiles)) for (const a of rows) {
    const r = { d }; COLS.forEach((c, i) => { r[c] = a[i]; });
    if (r.y === r.L || r.pO == null || r.q == null) continue;        // push fica fora
    r.over = r.y > r.L ? 1 : 0;
    R.push(r);
  }
  return R;
}

export function resumo(R) {
  if (!R.length) return { n: 0 };
  const dias = [...new Set(R.map(r => r.d))].sort();
  const out = { n: R.length, dias: dias.length, de: dias[0], ate: dias.at(-1) };

  out.chance = {
    '99play sem margem': { brier: brier(R, r => r.q), logloss: logloss(R, r => r.q) },
    [`BH final (w=${W})`]: { brier: brier(R, r => r.pO), logloss: logloss(R, r => r.pO) },
    'Modelo BH puro': { brier: brier(R, r => r.pM), logloss: logloss(R, r => r.pM) },
    'Moeda (50%)': { brier: .25, logloss: r4(Math.log(2)) },
  };
  const M = R.filter(r => r.pM != null);
  out.pesoModelo = [0, .1, .2, .3, .4, .5, .6, 1].map(w => ({ w, brier: brier(M, r => r.q + w * (r.pM - r.q)) }));
  out.melhorPeso = out.pesoModelo.reduce((a, b) => (b.brier < a.brier ? b : a));

  const KS = R.filter(r => r.k != null);
  out.kalshi = { n: KS.length };
  if (KS.length) {
    out.kalshi.chance = { '99play sem margem': brier(KS, r => r.q), BH: brier(KS, r => r.pO), Kalshi: brier(KS, r => r.k) };
    // valor contra a Kalshi no fechamento (base do Método Alavanca), odd 1,50–3,50
    for (const [nm, lo, hi] of [['EV_k 2–4%', .02, .04], ['EV_k 4%+', .04, 9]]) {
      const L = [];
      for (const r of KS) for (const s of ['o', 'u']) {
        const b = side(r, s), pk = s === 'o' ? r.k : 1 - r.k, evk = pk * b.odd - 1;
        if (b.odd >= ALV.oddMin && b.odd <= ALV.oddMax && evk >= lo && evk < hi) L.push({ ...b, p: pk });
      }
      out.kalshi[nm] = bets(L);
    }
  }

  // calibração: chance do over prevista × acerto real
  const bins = [0, .3, .4, .45, .5, .55, .6, .7, 1.01];
  out.calibracao = bins.slice(0, -1).map((lo, i) => {
    const hi = bins[i + 1], f = k => R.filter(r => r[k] >= lo && r[k] < hi);
    const b = f('pO'), q = f('q');
    return { faixa: `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`,
      bh: { n: b.length, real: r4(mean(b.map(r => r.over))) }, '99play': { n: q.length, real: r4(mean(q.map(r => r.over))) } };
  });

  // ROI por faixa de EV do BH (lado de maior EV, odd de fechamento)
  const evB = [[-9, 0, '< 0'], [0, .03, '0–3%'], [.03, .05, '3–5%'], [.05, .08, '5–8%'], [.08, .12, '8–12%'], [.12, 9, '12%+']];
  const B = R.map(r => ({ r, ...best(r) }));
  out.porEV = evB.map(([lo, hi, nm]) => ({ faixa: nm, ...bets(B.filter(x => x.ev >= lo && x.ev < hi).map(x => side(x.r, x.s))) }));
  out.canal = { 'EV 5%+ (simples do canal)': bets(B.filter(x => x.ev >= .05).map(x => side(x.r, x.s))),
    'EV 3–12%': bets(B.filter(x => x.ev >= .03 && x.ev < .12).map(x => side(x.r, x.s))) };
  out.porNota = ['A+', 'A', 'B', 'C'].map(g => ({ nota: g, ...bets(B.filter(x => x.g === g).map(x => side(x.r, x.s))) }));

  // às cegas e por mercado
  out.cegas = { over: bets(R.map(r => side(r, 'o'))), under: bets(R.map(r => side(r, 'u'))),
    margem: r4(mean(R.map(r => 1 / r.o + 1 / r.u - 1))) };
  out.porMercado = [...new Set(R.map(r => r.mk))].sort().map(mk => {
    const X = R.filter(r => r.mk === mk);
    return { mk, n: X.length, brier99: brier(X, r => r.q), brierBH: brier(X, r => r.pO),
      over: bets(X.map(r => side(r, 'o'))).roi, under: bets(X.map(r => side(r, 'u'))).roi };
  });

  // CLV: entradas EV 5%+ pelo BH na ABERTURA, acompanhadas até o fechamento
  const O = [];
  for (const r of R) {
    if (r.fo == null || r.fmt === r.mt) continue;
    const eo = r.fpO * r.fo - 1, eu = (1 - r.fpO) * r.fu - 1, s = eo >= eu ? 'o' : 'u';
    if (Math.max(eo, eu) < .05 || r.y === r.fL) continue;
    const same = r.fL === r.L, dq = s === 'o' ? r.q - r.fq : r.fq - r.q;
    const fav = same ? dq > .01 : (s === 'o' ? r.L > r.fL : r.L < r.fL), con = same ? dq < -.01 : !fav;
    const odd = s === 'o' ? r.fo : r.fu, hit = s === 'o' ? +(r.y > r.fL) : +(r.y < r.fL);
    const pkf = r.kf == null ? null : s === 'o' ? r.kf : 1 - r.kf;
    O.push({ fav, con, odd, hit, p: s === 'o' ? r.fpO : 1 - r.fpO, clvK: pkf == null ? null : pkf * odd - 1 });
  }
  const OK = O.filter(x => x.clvK != null);
  out.clv = { n: O.length, '99play a favor': r4(mean(O.map(x => +x.fav))), '99play contra': r4(mean(O.map(x => +x.con))),
    roiAbertura: bets(O).roi,
    kalshi: { n: OK.length, clvMedio: r4(mean(OK.map(x => x.clvK))), positivo: r4(mean(OK.map(x => +(x.clvK > 0)))), roi: bets(OK).roi } };

  // hipóteses em aberto (registrar e medir, sem dinheiro)
  out.hipoteses = {
    'Under Roubos+Tocos': bets(R.filter(r => r.mk === 'SB').map(r => side(r, 'u'))),
    'Under Faltas': bets(R.filter(r => r.mk === 'PF').map(r => side(r, 'u'))),
    'Under quando a 99play dá < 35% ao over': bets(R.filter(r => r.q < .35).map(r => side(r, 'u'))),
  };

  out.porDia = dias.map(d => {
    const X = R.filter(r => r.d === d), Y = B.filter(x => x.r.d === d && x.ev >= .05);
    return { d, n: X.length, brier99: brier(X, r => r.q), brierBH: brier(X, r => r.pO), kalshi: X.filter(r => r.k != null).length,
      ev5: bets(Y.map(x => side(x.r, x.s))) };
  });
  return out;
}

/* resumo em markdown para o GitHub Actions ($GITHUB_STEP_SUMMARY) */
export function summaryMd(rep, state = {}, lidas = null) {
  const T = rep.total ?? {}, pc = x => x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + '%', b4 = x => x == null ? '—' : x.toFixed(4).replace('.', ',');
  const ab = Object.values(state), kab = ab.filter(r => r.k != null).length;
  const L = ['## 🧾 Placar da verdade', '',
    `Leitura de agora: **${lidas ?? '—'}** linhas da 99play antes do jogo · abertas: **${ab.length}** (${kab} com Kalshi) · liquidadas agora: **${rep.liquidadas}** · anuladas: ${rep.anuladas}`, ''];
  if (T.n) {
    const ch = T.chance, bh = Object.keys(ch).find(k => k.startsWith('BH')), c = T.canal['EV 5%+ (simples do canal)'];
    L.push(`Amostra: **${T.n}** linhas de ${T.de} a ${T.ate}`, '', '| Brier (menor = melhor) | 99play sem margem | BH | Modelo puro | Kalshi |', '|---|---|---|---|---|',
      `| Tudo | ${b4(ch['99play sem margem'].brier)} | ${b4(ch[bh].brier)} | ${b4(ch['Modelo BH puro'].brier)} | — |`,
      ...(T.kalshi?.n ? [`| Onde a Kalshi tem preço (${T.kalshi.n}) | ${b4(T.kalshi.chance['99play sem margem'])} | ${b4(T.kalshi.chance.BH)} | — | ${b4(T.kalshi.chance.Kalshi)} |`] : []), '',
      '| Entradas | n | Previu | Acertou | ROI |', '|---|---|---|---|---|',
      `| EV 5%+ do BH | ${c.n ?? 0} | ${pc(c.prev)} | ${pc(c.real)} | ${pc(c.roi)} |`,
      ...['EV_k 2–4%', 'EV_k 4%+'].filter(k => T.kalshi?.[k]?.n).map(k => `| Valor contra a Kalshi ${k} | ${T.kalshi[k].n} | ${pc(T.kalshi[k].prev)} | ${pc(T.kalshi[k].real)} | ${pc(T.kalshi[k].roi)} |`),
      ...(T.clv?.kalshi?.n ? [`| CLV contra a Kalshi (EV 5%+ na abertura) | ${T.clv.kalshi.n} | — | — | CLV médio ${pc(T.clv.kalshi.clvMedio)} |`] : []));
  }
  return L.join('\n') + '\n';
}

/* ---------- arquivos ---------- */
const readJ = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
function loadDays(dir) {
  const days = {};
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) days[f.slice(0, 10)] = readJ(join(dir, f), {}).rows ?? [];
  return days;
}
function saveDays(dir, newDays, days) {
  for (const [d, rows] of Object.entries(newDays)) {
    const seen = new Set((days[d] ||= []).map(a => a[0] + '|' + a[1]));
    for (const a of rows) if (!seen.has(a[0] + '|' + a[1])) days[d].push(a);
    writeFileSync(join(dir, d + '.json'), JSON.stringify({ cols: COLS, rows: days[d] }));
  }
}

async function main() {
  const args = process.argv.slice(2), pub = resolve(ROOT, args.find(a => !a.startsWith('--') && !/^\d{4}-/.test(a)) || 'public');
  const dir = join(ROOT, 'data', 'auditoria'); mkdirSync(dir, { recursive: true });
  const fOpen = join(dir, 'abertas.json');
  const results = readJ(join(pub, 'data', 'results.json'), null);
  let state, days, lidas = null;
  const bi = args.indexOf('--backfill');
  if (bi >= 0) {
    const since = args[bi + 1] && /^\d{4}-\d{2}-\d{2}$/.test(args[bi + 1]) ? args[bi + 1] : '2026-11-12';
    const sh = c => execSync(c, { cwd: ROOT, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const commits = sh(`git log --reverse --format=%H.%cI --since=${since} -- public/data/slate.json`).trim().split('\n').filter(Boolean)
      .map(l => [l.slice(0, 40), l.slice(41)]);
    state = {}; days = {};
    let n = 0;
    for (const [h, t] of commits) {
      let s; try { s = JSON.parse(sh(`git show ${h}:public/data/slate.json`)); } catch { continue; }
      let k = null; try { k = JSON.parse(sh(`git show ${h}:public/data/kalshi.json`)); } catch { }
      observe(state, s, k, Date.parse(t)); n++;
      if (n % 25 === 0) console.log(`  ${n}/${commits.length} coletas`);
    }
    // a coleta de agora também conta (pode ser mais nova que o último commit)
    observe(state, readJ(join(pub, 'data', 'slate.json'), null), readJ(join(pub, 'data', 'kalshi.json'), null));
    for (const f of readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) >= since) writeFileSync(join(dir, f), JSON.stringify({ cols: COLS, rows: [] }));
    days = Object.fromEntries(Object.entries(loadDays(dir)).filter(([d]) => d < since));
    console.log(`backfill: ${n} coletas desde ${since}`);
  } else {
    state = readJ(fOpen, {}); days = loadDays(dir);
    lidas = observe(state, readJ(join(pub, 'data', 'slate.json'), null), readJ(join(pub, 'data', 'kalshi.json'), null));
    console.log(`leitura de agora: ${lidas} linhas da 99play antes do jogo`);
  }
  const st = settle(state, results);
  saveDays(dir, st.days, days);
  writeFileSync(fOpen, JSON.stringify(state));
  const R = rowsOf(days), last = [...new Set(R.map(r => r.d))].sort().slice(-7);
  const rep = { gen: new Date().toISOString(), w: W, abertas: Object.keys(state).length,
    liquidadas: Object.values(st.days).reduce((s, a) => s + a.length, 0), anuladas: st.voids,
    total: resumo(R), ult7: resumo(R.filter(r => last.includes(r.d))) };
  writeFileSync(join(pub, 'data', 'auditoria.json'), JSON.stringify(rep));
  const T = rep.total, pc = x => x == null ? '—' : (x * 100).toFixed(1) + '%';
  console.log(`placar: ${T.n ?? 0} linhas (${T.de ?? '—'} a ${T.ate ?? '—'}), ${rep.abertas} abertas, +${rep.liquidadas} liquidadas agora`);
  if (T.n) {
    console.log(`  Brier 99play ${T.chance['99play sem margem'].brier} · BH ${T.chance[`BH final (w=${W})`].brier} · modelo ${T.chance['Modelo BH puro'].brier} · melhor w ${T.melhorPeso.w}`);
    const c = T.canal['EV 5%+ (simples do canal)'];
    console.log(`  EV 5%+: ${c.n} · previu ${pc(c.prev)} · acertou ${pc(c.real)} · ROI ${pc(c.roi)} | Kalshi: ${T.kalshi.n} linhas`);
  }
  // resumo da rodada na página do GitHub Actions (aparece também no app do GitHub)
  if (process.env.GITHUB_STEP_SUMMARY) try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd(rep, state, lidas)); } catch { }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
