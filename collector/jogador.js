// Aba Jogador (23/11): baixa o jogada a jogada da ESPN de cada jogo encerrado da temporada regular,
// guarda compacto em data/jogador/jogos/<id>.json (só o que é novo) e monta, por time, public/data/jogador/<TIME>.json.
// Também calibra o "quem está fora" nos jogos reais (k por mercado) e grava os ganhos dos desfalques de hoje
// em public/data/jogador/fora.json (aba Jogos). Roda como passo do job coletar, depois do build.js.
//   node collector/jogador.js [--date AAAA-MM-DD]
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getJSON, pool, normName } from './http.js';
import { fetchESPNDay } from './espnbox.js';
import { parseJogo, montaTime, calibra, ganhos, rotacao, porJogador } from '../public/jogador-core.js';

const B = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const DIR = 'data/jogador', JOGOS = join(DIR, 'jogos'), OUT = 'public/data/jogador';
const CONC = +(process.env.CONCURRENCY || 6);
const log = (...a) => console.log(...a);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const todayET = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const readJ = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };

async function main() {
  const date = arg('--date', todayET());
  const startYear = +date.slice(0, 4) - (+date.slice(5, 7) < 8 ? 1 : 0);
  await mkdir(JOGOS, { recursive: true }); await mkdir(OUT, { recursive: true });
  const dias = await readJ(join(DIR, 'dias.json'), {});
  const tem = new Set((await readdir(JOGOS)).map(f => f.replace('.json', '')));

  // 1. calendário da temporada (dias já completos ficam guardados)
  const cal = [...new Set((await fetchESPNDay(date)).calendar)].filter(d => d >= `${startYear}-10-01` && d <= date).sort();
  const abrir = cal.filter(d => !dias[d]);
  const res = await pool(abrir, CONC, d => fetchESPNDay(d).then(x => ({ d, x })));
  const todo = [];
  for (const r of res) {
    if (!r || r.__error || !r.x) continue;
    const reg = r.x.games.filter(g => g.type === 2 || g.type == null);
    for (const g of reg) if (g.status === 3 && !tem.has(g.eid)) todo.push({ eid: g.eid, d: r.d });
    if (reg.every(g => g.status === 3)) dias[r.d] = reg.map(g => g.eid);
  }
  for (const d of cal) for (const eid of dias[d] || []) if (!tem.has(eid) && !todo.some(t => t.eid === eid)) todo.push({ eid, d });

  // 2. jogada a jogada dos jogos novos
  if (todo.length) {
    log(`  jogador: baixando ${todo.length} jogos da ESPN…`);
    let ok = 0, err = 0;
    await pool(todo, CONC, async t => {
      try {
        const j = await getJSON(`${B}/summary?event=${t.eid}`, { retries: 2, quiet404: true });
        const g = j && parseJogo(j, t.d);
        if (g) { await writeFile(join(JOGOS, t.eid + '.json'), JSON.stringify(g)); ok++; }
        else if (dias[t.d]) delete dias[t.d]; // ainda não fechou: tenta de novo na próxima coleta
      } catch { err++; if (dias[t.d]) delete dias[t.d]; }
    });
    log(`    ${ok} novos${err ? `, ${err} falharam (tenta de novo na próxima)` : ''}`);
  }
  await writeFile(join(DIR, 'dias.json'), JSON.stringify(dias));

  // 3. arquivos por time + calibração
  const jogos = [];
  for (const f of await readdir(JOGOS)) { const g = await readJ(join(JOGOS, f)); if (g?.d?.slice(0, 4) >= String(startYear) && g.d >= `${startYear}-10-01`) jogos.push(g); }
  const siglas = [...new Set(jogos.flatMap(g => [g.h, g.a]))].sort();
  const times = siglas.map(T => montaTime(T, jogos));
  const K = calibra(times);
  log(`  jogador: ${jogos.length} jogos, ${siglas.length} times; repasse calibrado ${Object.entries(K).map(([m, v]) => `${m} ${Math.round(v.k * 100)}% (${v.n})`).join(', ')}`);
  const atual = {};
  for (const t of times) {
    await writeFile(join(OUT, t.t + '.json'), JSON.stringify({ ...t, k: K, at: new Date().toISOString() }));
    const pj = porJogador(t);
    for (const [pid, j] of Object.entries(pj)) {
      const ult = t.jogos[j[j.length - 1].g][1];
      if (atual[pid] && atual[pid].ult >= ult) continue;
      const m = f => Math.round(j.reduce((s, r) => s + f(r), 0) / j.length * 10) / 10;
      atual[pid] = { p: +pid, n: t.nomes[pid], t: t.t, j: j.length, min: m(r => r.min), pts: m(r => r.pts), reb: m(r => r.reb), ast: m(r => r.ast), ult };
    }
  }
  const jogadores = Object.values(atual).filter(x => x.j >= 2).sort((a, b) => b.pts - a.pts).map(({ ult, ...x }) => x);
  await writeFile(join(OUT, 'index.json'), JSON.stringify({ at: new Date().toISOString(), jogos: jogos.length, k: K, jogadores }));

  // 4. desfalques de hoje → quem ganha (aba Jogos)
  const slate = await readJ('public/data/slate.json', null);
  const fora = {};
  if (slate?.games?.length) {
    const hoje = new Set(slate.games.flatMap(g => [g.home, g.away]));
    for (const t of times.filter(t => hoje.has(t.t))) {
      const rot = rotacao(t), byName = {};
      for (const i of rot) byName[normName(t.nomes[i])] = i;
      const out = (slate.injuries || []).filter(i => i.team === t.t && (i.status === 'out' || i.status === 'doubtful')).map(i => byName[normName(i.name)]).filter(Boolean);
      const players = (slate.players || []).filter(p => p.team === t.t && (p.status === 'out' || p.status === 'doubtful'));
      for (const p of players) { const i = byName[normName(p.name)]; if (i && !out.includes(i)) out.push(i); }
      if (!out.length) continue;
      const g = ganhos(t, out, K);
      if (g.length) fora[t.t] = { fora: out.map(i => t.nomes[i]), ganhos: g };
    }
  }
  await writeFile(join(OUT, 'fora.json'), JSON.stringify({ date: slate?.meta?.date || date, at: new Date().toISOString(), times: fora }));
  log(`  jogador: desfalques com impacto hoje em ${Object.keys(fora).length} times`);
}

main().catch(e => { console.error('jogador:', e.message); process.exit(1); });
