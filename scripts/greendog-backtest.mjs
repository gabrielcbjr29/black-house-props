// Revisão 24/11 · GREENDOG: o filtro mais solto em dia de rodada curta compensa?
// Refaz o canal com o histórico do bot.json no git (linhas da 99play de cada coleta) e corrige pelo box score guardado.
//   node scripts/greendog-backtest.mjs
// Variantes: base (chance ≥ 55%, 24+ min) · solto sempre (≥ 52%, 20+ min) · solto só em dia curto (≤ 5 jogos).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MK = ['FTA', 'FTM', 'RA'], CAP = 15, CURTO = 5;
const sh = c => execSync(c, { maxBuffer: 1 << 30, encoding: 'utf8' });
const nn = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');

// box score: data → nome → [min, reb, ast, ftm, fta]
const RI = { pid: 0, min: 4, reb: 6, ast: 8, ftm: 17, fta: 18 };
const box = {};
for (const f of ['data/history/2026-27.json', 'data/history/espn-2026-27.json']) {
  let h; try { h = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  for (const g of Object.values(h.games ?? {})) for (const r of g.r ?? []) {
    const n = nn(h.names?.[r[RI.pid]]); if (!n) continue;
    ((box[g.d] ||= {})[n] ||= [r[RI.min], r[RI.reb], r[RI.ast], r[RI.ftm], r[RI.fta]]);
  }
}
const val = (b, m) => m === 'FTA' ? b[4] : m === 'FTM' ? b[3] : b[1] + b[2];

// fotos do bot.json ao longo do dia (a partir das 10h de Brasília, antes do jogo)
const commits = sh(`git log --reverse --since=2026-11-08 --format='%h %cI' -- public/data/bot.json`).trim().split('\n').map(l => l.split(' '));
const VAR = {
  base: (r) => r.p >= .55 && (r.mn ?? 0) >= 24,
  solto: (r) => r.p >= .52 && (r.mn ?? 0) >= 20,
};
const cand = {}; // data → variante → chave → candidato (primeira vez que passou)
const jogos = {};
for (const [h, at] of commits) {
  let b; try { b = JSON.parse(sh(`git show ${h}:public/data/bot.json`)); } catch { continue; }
  const date = b.date; if (!date) continue;
  const t = Date.parse(at);
  if (new Date(t - 3 * 36e5).getUTCHours() < 10 && new Date(t - 3 * 36e5).toISOString().slice(0, 10) === date) continue; // antes das 10h BRT
  (jogos[date] ||= new Set()); for (const r of b.rows ?? []) jogos[date].add(r.g);
  for (const r of b.rows ?? []) {
    if (!r.c9 || !MK.includes(r.m)) continue;
    const tip = Date.parse(`${date}T${r.h ?? '23:59'}:00-03:00`) + (+(r.h ?? '23').slice(0, 2) < 10 ? 864e5 : 0);
    if (!(t < tip)) continue;
    const d = +r.d, e = r.e ?? -1;
    const comum = d >= 1.4 && d <= 3.5 && e >= .03 && e <= .25 && (!r.st || r.st === 'ok') && /^[AB]/.test(r.gr ?? '') && (!r.t9 || (t - Date.parse(r.t9)) / 36e5 < 2);
    if (!comum) continue;
    for (const [v, f] of Object.entries(VAR)) {
      if (!f(r)) continue;
      const k = `${r.id}|${r.m}`; const C = ((cand[date] ||= {})[v] ||= {});
      if (!C[k]) C[k] = { date, n: r.n, m: r.m, s: r.s, l: +r.l, d, e, p: r.p, mn: r.mn };
    }
  }
}

function corrige(x) {
  const b = box[x.date]?.[nn(x.n)]; if (!b) return null; if (!(b[0] > 0)) return 'void';
  const v = val(b, x.m); if (v === x.l) return 'void';
  return (x.s === 'o' ? v > x.l : v < x.l) ? 'green' : 'red';
}
const dias = Object.keys(cand).filter(d => box[d]).sort();
const curto = d => (jogos[d]?.size ?? 99) <= CURTO;
function roda(nome, escolhe) {
  const out = { nome, dias: 0, n: 0, g: 0, r: 0, u: 0, porDia: [] };
  for (const d of dias) {
    const lista = escolhe(d).sort((a, b) => b.e - a.e).slice(0, CAP);
    let n = 0;
    for (const x of lista) { const s = corrige(x); if (!s || s === 'void') continue; n++; out.n++; if (s === 'green') { out.g++; out.u += x.d - 1; } else { out.r++; out.u -= 1; } }
    out.dias++; out.porDia.push(n);
  }
  return out;
}
const base = d => Object.values(cand[d]?.base ?? {});
const solto = d => Object.values(cand[d]?.solto ?? {});
const res = [
  roda('Atual (≥55%, 24+ min)', base),
  roda('Solto sempre (≥52%, 20+ min)', solto),
  roda('Solto só em dia curto (≤5 jogos)', d => curto(d) ? solto(d) : base(d)),
  // só as entradas que o filtro solto acrescenta (o que se ganha ou perde a mais)
  roda('Só as extras do filtro solto', d => { const b = new Set(base(d).map(x => x.n + x.m)); return solto(d).filter(x => !b.has(x.n + x.m)); }),
  roda('Só as extras, em dia curto', d => { if (!curto(d)) return []; const b = new Set(base(d).map(x => x.n + x.m)); return solto(d).filter(x => !b.has(x.n + x.m)); }),
];
const pc = x => (x * 100).toFixed(1).replace('.', ',') + '%';
console.log(`GREENDOG · ${dias.length} dias (${dias[0]} a ${dias.at(-1)}), ${dias.filter(curto).length} dias curtos (≤${CURTO} jogos); 1u por entrada, até ${CAP}/dia`);
for (const r of res) console.log(`${r.nome.padEnd(36)} ${String(r.n).padStart(4)} entradas · ${(r.n / r.dias).toFixed(1).replace('.', ',')}/dia · acerto ${r.n ? pc(r.g / r.n) : '—'} · ${r.u >= 0 ? '+' : ''}${r.u.toFixed(2).replace('.', ',')}u · ROI ${r.n ? pc(r.u / r.n) : '—'}`);
console.log('dias curtos:', dias.filter(curto).map(d => `${d} (${jogos[d].size} jogos)`).join(', '));
