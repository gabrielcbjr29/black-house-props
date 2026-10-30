// Garrafão Props — interface. Lê data/slate.json e calcula tudo no navegador com engine.js.
import { buildProps, evaluate, MARKETS, GROUPS, POSLB, TEAM_INFO, L, dvpRank, GRADE_ORDER, parlayProb, overProb, bestPrice, makeDist, quantile, ladder, divergence } from './engine.js';
import { newTip, settleTip, summarize, toCSV, clvOf, profitOf } from './tips.js';
import { postText, drawCard, legText, WARNINGS, resultsText, drawResults } from './share.js';
import { parseImport } from './importer.js';

/* ---------------- utilidades ---------------- */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = (n, d = 1) => n == null || isNaN(n) ? '—' : Number(n).toFixed(d).replace('.', ',');
const pct = (x, d = 0) => x == null ? '—' : fmt(x * 100, d) + '%';
const sgnPct = x => x == null ? '—' : (x >= 0 ? '+' : '−') + fmt(Math.abs(x) * 100, 1) + '%';
const sgnU = x => x == null ? '—' : (x >= 0 ? '+' : '−') + fmt(Math.abs(x), 2) + 'u';
const uFmt = u => fmt(u, Number.isInteger(u * 2) ? (Number.isInteger(u) ? 0 : 1) : 2) + 'u';
const money = v => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const store = {
  get(k, d) { try { const v = localStorage.getItem('garrafao:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('garrafao:' + k, JSON.stringify(v)); } catch { } }
};
const brTime = utc => { try { return new Date(utc).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const brDate = iso => { const [y, m, d] = iso.split('-'); const dt = new Date(+y, m - 1, +d); return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }); };
const shortDate = iso => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };
const mkShort = mk => MARKETS[mk].short || mk;
const STATLB = { pts: 'Pontos', reb: 'Rebotes', ast: 'Assistências', tpm: 'Bolas de 3', tpa: '3 tentadas', twom: '2 convertidos', twoa: '2 tentados', fgm: 'Quadra conv.', fga: 'Quadra tent.', ftm: 'LL conv.', fta: 'LL tent.', stl: 'Roubos', blk: 'Tocos', tov: 'Erros', pf: 'Faltas' };
const lastName = n => String(n).split(' ').slice(-1)[0];
const dlPromise = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
// dentro do Claude (artefato) o arquivo passa pela confirmação do app; fora dele, link normal
async function download(name, data, type) {
  const dl = await dlPromise;
  if (dl) { try { await dl.save({ filename: name, data: data instanceof Blob ? data : new Blob([data], { type }) }); } catch (e) { if (e?.code !== 'declined') toast('Não deu para salvar o arquivo aqui'); } return; }
  saveLink(name, data, type);
}
function saveLink(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---------------- configurações do tipster ---------------- */
const CFG_DEF = { bank: 1000, unit: 10, kf: .25, maxU: 3, dayMaxU: 10, dayGoalU: 0, dayStopU: 0, w: .55, calib: true, brand: 'Black House', handle: '', warn: 'dependencia', books: 'Betano, Bet365, Superbet, KTO, Betfair, Novibet, Sportingbet, EstrelaBet', defBook: 'Betano', showStats: true };
let CFG = Object.assign({}, CFG_DEF, store.get('cfg', {}));
const booksList = () => CFG.books.split(',').map(s => s.trim()).filter(Boolean);
/* stake sugerida: Kelly fracionado sobre a banca, em unidades, arredondado a 0,25u e com teto */
function stakeU(s) {
  if (!s?.odd || !s.kelly) return 0;
  const u = CFG.kf * s.kelly * CFG.bank / Math.max(CFG.unit, 1e-9);
  if (u < .2) return 0;
  return Math.min(CFG.maxU, Math.max(.25, Math.round(u * 4) / 4));
}

/* ---------------- estado ---------------- */
let SLATE = null, PROPS = [], BYID = {}, EVAL = {}, OVR = {}, RESULTS = null, BT = null;
const DEF = { q: '', games: [], groups: [], markets: [], pos: [], side: 'best', src: 'all', minGrade: 'C', sample: 'L10', minHit: 0, minProb: 0, minEV: -20, oddMin: 1.01, oddMax: 10, oddOnly: false, mktOnly: false, dvp: false, noB2B: false, noDoubt: false, noBlow: false, projGap: false, woOnly: false, steam: false, roleUp: false, sort: 'score', view: 'cards', preset: 'all' };
let F = Object.assign({}, DEF, store.get('f2', {}));
let SLIP = store.get('slip2', []);
let TIPS = store.get('tips', []);
let LIMIT = 60, autoN = 3, dvpStat = 'pts', D = null, bancaFrom = '30', bancaKind = 'all';
const state = { view: 'props' };
const samplePromise = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
const ev = (pr, ov) => evaluate(pr, ov, { w: CFG.w });
const saveTips = () => { store.set('tips', TIPS); if (typeof queueSync === 'function') queueSync(); };

/* ---------------- carga ---------------- */
async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }
async function load() {
  try {
    const r = await fetch('data/slate.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    SLATE = await r.json();
  } catch (e) {
    $('#dataPill').className = 'data-pill err'; $('#dataPill').textContent = 'Sem dados';
    $('#results').innerHTML = `<div class="panel empty"><h2>Não encontrei os dados do dia</h2><p>Rode <code>npm run update</code> para coletar os dados reais, ou <code>npm run demo</code> para gerar a demonstração. Detalhe: ${esc(e.message)}</p></div>`;
    return;
  }
  [RESULTS, BT] = await Promise.all([getJSON('data/results.json'), getJSON('data/backtest.json')]);
  OVR = store.get('ovr:' + SLATE.meta.date, {});
  rebuild();
  SLIP = SLIP.filter(x => BYID[x.id]);
  updateTips();
  header();
  if (CFG.ghToken && CFG.gistId) syncNow(true);
  initFilters();
  route();
}
function rebuild() {
  PROPS = buildProps(SLATE, { calib: CFG.calib });
  BYID = Object.fromEntries(PROPS.map(p => [p.id, p]));
  EVAL = {}; for (const p of PROPS) EVAL[p.id] = ev(p, OVR[p.id]);
  LADC = {}; RANGEC = {};
}
/* v7: escada de linhas, faixa provável e amostra da temporada (com cache por reconstrução) */
let LADC = {}, RANGEC = {};
const ladOf = (pr, max = 8) => LADC[pr.id + '|' + max] ||= ladder(pr, { w: CFG.w, max });
function rangeOf(pr) { const e = EVAL[pr.id]; const k = pr.id + '|' + e.muF.toFixed(3); if (!RANGEC[k]) { const d = makeDist(e.muF, pr.d); RANGEC[k] = [quantile(d, .2), quantile(d, .8)]; } return RANGEC[k]; }
const curGames = pr => pr.ctx.logs.filter(g => g[L.cur] === 1).length;
/* alerta amarelo: pouca amostra, ou papel novo no começo da temporada (minutos ±20% vs temporada passada) */
function sampleFlag(pr) {
  const lg = pr.ctx.logs; if (lg.length < 10) return { lb: `Só ${lg.length} jogos no histórico` };
  const cur = lg.filter(g => g[L.cur] === 1), prev = lg.filter(g => g[L.cur] === 0).slice(0, 20);
  if (cur.length >= 10 || cur.length < 2 || prev.length < 5) return null;
  const mc = mean(cur.map(g => g[L.min])), mp = mean(prev.map(g => g[L.min]));
  return mp > 0 && Math.abs(mc - mp) / mp >= .2 ? { lb: `Papel novo: ${fmt(mc, 0)} min (era ${fmt(mp, 0)})` } : null;
}
const LAYUP_MK = ['PTS', 'REB', 'AST', '3PM', 'PRA', 'PR', 'PA', 'RA'];
/* Escada segura: o degrau mais alto que ainda tem chance alta E histórico firme (L10 ≥ 8/10, L20 ≥ 75%) */
function layups(n = 20) {
  const out = [];
  for (const pr of PROPS) {
    if (!LAYUP_MK.includes(pr.mk) || pr.p.status !== 'ok' || sampleFlag(pr)) continue;
    const ok = ladOf(pr, 40).filter(r => r.p >= .8 && r.p <= .93 && r.L10[1] >= 8 && r.L10[0] / r.L10[1] >= .8 && r.L20[1] >= 12 && r.L20[0] / r.L20[1] >= .75 && (r.t >= 2 || pr.mk === '3PM'));
    if (ok.length) out.push({ pr, r: ok[ok.length - 1] });
  }
  // um degrau por jogador e no máximo 5 por mercado, para a lista não virar só “1+ bola de 3”
  const seen = new Set(), perMk = {};
  return out.sort((a, b) => b.r.p - a.r.p || b.r.t - a.r.t).filter(x => { if (seen.has(x.pr.p.id) || (perMk[x.pr.mk] || 0) >= 5) return false; seen.add(x.pr.p.id); perMk[x.pr.mk] = (perMk[x.pr.mk] || 0) + 1; return true; }).slice(0, n);
}
function radar(n = 10, min = .02) {
  return PROPS.filter(pr => pr.book && OVR[pr.id]?.line == null).map(pr => ({ pr, d: divergence(pr.book.books) })).filter(x => x.d && x.d.edge >= min).sort((a, b) => b.d.edge - a.d.edge).slice(0, n);
}
/* liquida as tips com os resultados e guarda o preço de fechamento (para o CLV) */
function updateTips() {
  const snapAt = SLATE.meta.generatedAt;
  for (const t of TIPS) {
    if (t.status === 'pending') settleTip(t, RESULTS);
    if (t.kind !== 'single' || t.date !== SLATE.meta.date) continue;
    const l = t.legs[0], pr = BYID[l.pid + '-' + l.mk]; if (!pr || !pr.mkt) continue;
    if (!(Date.parse(snapAt) < Date.parse(pr.game.timeUTC))) continue; // só fotografias de antes do jogo
    const po = overProb(pr.mkt.dist, l.line), p = l.side === 'over' ? po : 1 - po;
    const bp = pr.book.line === l.line ? bestPrice(pr.book.books, l.side) : null;
    t.close = { p, odd: bp?.odd ?? null, line: pr.book.line, at: snapAt };
  }
  saveTips();
}
function header() {
  const m = SLATE.meta;
  $('#hdrDate').textContent = brDate(m.date);
  { const ts = [...new Set(SLATE.games.flatMap(g => [g.away, g.home]))]; $('#hdrGames').innerHTML = ts.length ? `<span class="hg-stack">${ts.slice(0, 5).map(t => badge(t, 1)).join('')}</span><span><b>${SLATE.games.length}</b> ${SLATE.games.length === 1 ? 'jogo' : 'jogos'} hoje</span>` : ''; }
  $('#brandName').textContent = CFG.brand || 'Black House';
  const pill = $('#dataPill');
  if (m.demo) { pill.className = 'data-pill demo'; pill.textContent = 'Demonstração'; }
  else { pill.className = 'data-pill live'; pill.textContent = 'Dados reais, ' + new Date(m.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  { const d0 = new Date(m.date + 'T12:00:00Z'), wd = d0.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' }), dl = d0.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' }); $('#h-props').textContent = 'Rodada de ' + wd; const first = SLATE.games.map(g => g.timeUTC).sort()[0]; $('#propsEyebrow').textContent = `${dl}: ${SLATE.games.length} ${SLATE.games.length === 1 ? 'jogo' : 'jogos'} e ${PROPS.length} linhas analisadas.${first ? ' Bola ao alto às ' + brTime(first) + '.' : ''}`; }
  const n = $('#dataNotice');
  if (m.demo) n.innerHTML = `<div class="notice"><span class="dot" aria-hidden="true"></span><div><b>Demonstração.</b> Jogadores e times são reais, mas os números são simulados (inclusive os resultados de hoje, para você ver a liquidação das tips). Para dados reais, siga o passo a passo do Guia.</div></div>`;
  else if (!SLATE.games.length) n.innerHTML = `<div class="notice info"><span class="dot" aria-hidden="true"></span><div><b>Sem jogos em ${brDate(m.date)}.</b> O coletor rodou, mas não há partidas da NBA nessa data.</div></div>`;
  else if (!SLATE.lines.length) n.innerHTML = `<div class="notice info"><span class="dot" aria-hidden="true"></span><div><b>Sem odds das casas.</b> As linhas mostradas são de referência (mediana dos últimos 15 jogos). Importe as linhas da sua casa ou digite em “Minha linha”.</div></div>`;
  else n.innerHTML = '';
}

/* ---------------- linhas da tabela ---------------- */
function srcOf(pr) { return OVR[pr.id]?.line != null || OVR[pr.id]?.oOver || OVR[pr.id]?.oUnder ? 'mine' : pr.lineSource; }
function rowsAll() { const out = []; for (const pr of PROPS) { const e = EVAL[pr.id]; out.push({ pr, e, s: e.over }, { pr, e, s: e.under }); } return out; }
const hitRate = h => h?.[1] ? h[0] / h[1] : 0;
/* pontuação do dia pensada para tipster: valor primeiro (EV e nota), depois chance e histórico.
   Odd muito baixa (< 1,40) perde pontos: rende pouco por unidade arriscada. */
const GB = { 'A+': 18, A: 11, B: 4, C: 0 };
function score(r) {
  const s = r.s;
  // Kelly (vantagem ÷ (odd − 1)) ordena valor sem premiar zebra: EV alto em odd alta pesa menos
  return (s.odd ? Math.min(s.kelly, .25) * 450 + (s.ev ?? 0) * 40 : 0) + s.p * 55 + GB[s.grade] + hitRate(s.hits.L10) * 10 + Math.min(s.streak, 10) * .4 + (s.fav ? 3 : 0)
    + (steamOf(r.pr, s.side) > 0 ? 4 : steamOf(r.pr, s.side) < 0 ? -4 : 0) - (s.odd && s.odd < 1.4 ? 12 : 0) - (s.p < .4 ? 15 : 0);
}
/* movimento do mercado desde a abertura, a favor do lado (+) ou contra (−), em fração da média */
function steamOf(pr, side) {
  if (!pr.mkt?.openMu) return 0;
  const d = (pr.mkt.mu - pr.mkt.openMu) / Math.max(pr.mkt.mu, 1);
  const s = side === 'over' ? d : -d;
  return Math.abs(d) >= .025 ? Math.sign(s) : 0;
}

function filtered() {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(F.q.trim());
  const rows = rowsAll().filter(({ pr, e, s }) => {
    if (F.side === 'best' && s.side !== e.best) return false;
    if (F.side !== 'best' && s.side !== F.side) return false;
    if (q && !norm(pr.p.name).includes(q)) return false;
    if (F.games.length && !F.games.includes(pr.game.id)) return false;
    if (F.groups.length && !F.groups.includes(MARKETS[pr.mk].g)) return false;
    if (F.markets.length && !F.markets.includes(pr.mk)) return false;
    if (F.pos.length && !F.pos.includes(pr.p.pos)) return false;
    if (F.src !== 'all' && srcOf(pr) !== F.src) return false;
    if (GRADE_ORDER[s.grade] < GRADE_ORDER[F.minGrade]) return false;
    const h = s.hits[F.sample] || [0, 0]; if (F.minHit > 0 && (!h[1] || h[0] / h[1] * 100 < F.minHit - 1e-9)) return false;
    if (s.p * 100 < F.minProb) return false;
    if (F.oddOnly && !s.odd) return false;
    if (F.mktOnly && !pr.mkt) return false;
    if (s.ev != null && s.ev * 100 < F.minEV) return false;
    if (F.minEV > -20 && s.ev == null) return false;
    if (s.odd && (s.odd < F.oddMin || s.odd > F.oddMax)) return false;
    if (F.dvp && !s.fav) return false;
    if (F.noB2B && (pr.game.b2b || []).includes(pr.p.team)) return false;
    if (F.noDoubt && pr.p.status !== 'ok') return false;
    if (F.noBlow && Math.abs(pr.game.spread ?? 0) >= 10) return false;
    if (F.projGap && s.gap / Math.max(e.line, 1) < .1) return false;
    if (F.woOnly && !pr.ctx.wo?.active) return false;
    if (F.steam && steamOf(pr, s.side) <= 0) return false;
    if (F.roleUp && pr.ctx.role !== 'up') return false;
    return true;
  });
  const srt = {
    score: (a, b) => score(b) - score(a), prob: (a, b) => b.s.p - a.s.p, ev: (a, b) => (b.s.ev ?? -9) - (a.s.ev ?? -9) || b.s.p - a.s.p,
    stake: (a, b) => stakeU(b.s) - stakeU(a.s) || (b.s.ev ?? -9) - (a.s.ev ?? -9),
    hit: (a, b) => hitRate(b.s.hits[F.sample]) - hitRate(a.s.hits[F.sample]) || b.s.p - a.s.p,
    gap: (a, b) => b.s.gap / Math.max(b.e.line, 1) - a.s.gap / Math.max(a.e.line, 1), streak: (a, b) => b.s.streak - a.s.streak || b.s.p - a.s.p,
    time: (a, b) => String(a.pr.game.timeUTC).localeCompare(String(b.pr.game.timeUTC)) || score(b) - score(a)
  }[F.sort] || ((a, b) => score(b) - score(a));
  return rows.sort(srt);
}
function activeCount() { let n = 0; for (const k in DEF) { if (['sort', 'view', 'preset'].includes(k)) continue; if (JSON.stringify(F[k]) !== JSON.stringify(DEF[k])) n++; } return n; }

/* ---------------- ajuda (?) ---------------- */
// textos curtos e com exemplo: aparecem no "?" e no glossário do Guia
const HELP = {
  prevx: ['Previsto x acerto', 'Compara a chance média que o modelo deu com o acerto real de cada faixa. Se o acerto fica perto do previsto, as chances são confiáveis.', 'Faixa 60–64%: previsto 62%, acerto 61% = calibrado. Acerto 48% = o modelo está otimista nessa faixa.'],
  faixa: ['Faixa provável', 'Entre esses dois números cai o resultado em 6 de cada 10 jogos parecidos (do 20º ao 80º percentil da projeção).', 'Faixa 18–29 com linha 24,5: a linha está no meio, sem folga para nenhum lado.'],
  escada: ['Escada segura', 'Para cada jogador, o degrau “X ou mais” mais alto que ainda tem chance de 80% a 93%, bateu em 8+ dos últimos 10 e em 75%+ dos últimos 20. Fica de fora quem tem pouca amostra, mudou de papel no começo da temporada ou está em dúvida.', 'Serve para montar duplas e triplas de odd baixa. Confira a odd da linha alternativa na casa: só vale se pagar acima da odd justa.'],
  radar: ['Radar de divergência', 'Compara a melhor odd de cada linha com o consenso sem margem das outras casas. Uma casa pagando acima desse consenso costuma estar atrasada e corrige a linha logo depois.', '+4% = a odd paga 4% acima do preço justo das outras casas. Some rápido: confira na casa antes de entrar.'],
  chance: ['Chance', 'Probabilidade estimada de a linha bater, juntando a projeção do app com o preço do mercado.', 'Chance 58% = em 100 jogos parecidos, bate em uns 58.'],
  odd: ['Odd e preço', 'A odd embute uma chance: 1 ÷ odd. Odd 1,90 “pede” 52,6%. Para ter valor, a sua chance precisa passar disso.', 'Na régua, o traço marca esse preço.'],
  regua: ['Régua de valor', 'A barra verde é a chance. O traço é a chance que a odd cobra. Verde passando do traço = aposta com valor; verde antes do traço = a casa está cobrando caro.', 'O círculo (na ficha) é a chance do mercado sem a margem das casas.'],
  ev: ['EV (valor esperado)', 'Quanto você ganha ou perde, em média, a cada R$ 1 apostado nessa odd se a chance estiver certa. Positivo = valor.', 'EV +5% = em média R$ 0,05 de lucro por R$ 1.'],
  stake: ['Stake sugerida', 'Quanto apostar, em unidades, pelo critério de Kelly fracionado: cresce com o valor e cai com a odd alta. Tem teto por tip.', '0u = sem valor nessa odd. Ajuste banca e unidade em Banca.'],
  unidade: ['Unidade (u)', 'Tamanho padrão de aposta, em reais. Falar em unidades deixa o resultado comparável entre tipsters com bancas diferentes.', 'Banca R$ 1.000 e 1u = R$ 10: 2u = R$ 20.'],
  mercado: ['Chance do mercado', 'As odds das casas sem a margem delas, numa média que pesa mais as casas afiadas. É a melhor referência do “preço justo”.', 'Se o app vê 60% e o mercado 52%, confira a notícia antes de entrar.'],
  proj: ['Projeção', 'Quanto o jogador deve fazer hoje: ritmo por minuto × minutos esperados, ajustado por defesa, ritmo do jogo, desfalques e mercado.', 'Projeção 27,1 contra linha 25,5 favorece o “mais de”.'],
  nota: ['Nota', 'Resumo da linha. Com odd: A+ exige EV ≥ 6%, chance ≥ 56% e histórico de apoio; A exige EV ≥ 3%. Sem odd, o máximo é A.', 'C não quer dizer que vai perder: quer dizer que não há valor.'],
  acerto: ['L5, L10, L20, H2H', 'Quantas vezes a linha de hoje teria batido nos últimos 5, 10 e 20 jogos, e contra o adversário de hoje (H2H).', '8/10 = bateu em 8 dos últimos 10.'],
  def: ['Defesa (DEF)', 'Ranking do adversário contra a posição do jogador naquela estatística. 30º é quem mais cede; 1º, quem menos cede.', 'DEF 28º para um armador em pontos = defesa fraca contra armadores.'],
  clv: ['CLV', 'Compara a odd que você pegou com o preço justo na última coleta antes do jogo. CLV positivo de forma constante é o sinal mais confiável de vantagem, mesmo numa fase de reds.', 'Pegou 2,00 e fechou valendo 1,85 = CLV positivo.'],
  roi: ['ROI (yield)', 'Lucro dividido pelo total apostado, em unidades. É a medida de eficiência do tipster.', '+5u de lucro em 100u apostadas = ROI +5%.'],
  steam: ['Movimento de mercado', 'Quanto a linha e as odds andaram desde a primeira coleta do dia. Mercado andando para o seu lado costuma ser dinheiro informado.', 'Linha de 24,5 para 25,5 = mercado foi no “mais de”.'],
  wo: ['Sem o colega', 'Jogos reais em que o colega que está fora hoje não jogou: mostra quanto o jogador produz sem ele, em vez de chutar.', '“Sem Williams 3/3” = bateu nos 3 jogos sem ele.'],
  calib: ['Calibração', 'O app refaz o modelo nos últimos 30 dias e compara a chance prevista com o que aconteceu. Se estava confiante demais num mercado, ele abre a projeção desse mercado.', 'Previsto 65%, real 60% = ajuste para baixo.'],
  ref: ['Linha de referência', 'Sem odd da casa, o app usa a linha que dividiu os últimos 15 jogos mais perto de 50/50, que é o que as casas fazem.', 'Importe as linhas da sua casa para trocar pela linha real.'],
  push: ['Devolução', 'Linha inteira (ex. 25) e o jogador faz exatamente 25: a aposta volta. Jogador que não entra em quadra também é devolvido.', ''],
  corr: ['Correlação', 'Pernas do mesmo jogo andam juntas (ex. pontos do armador e assistências). O app mede isso nos jogos em que os dois estiveram em quadra.', '+12% = juntas batem mais do que se fossem independentes.']
};
const help = k => HELP[k] ? `<button type="button" class="help" data-help="${k}" aria-label="O que é ${esc(HELP[k][0])}?">?</button>` : '';
function showHelp(btn) {
  const pop = $('#pop'), h = HELP[btn.dataset.help]; if (!h) return;
  if (!pop.hidden && pop.dataset.k === btn.dataset.help && pop._btn === btn) { pop.hidden = true; return; }
  pop.innerHTML = `<b>${esc(h[0])}</b><p>${esc(h[1])}</p>${h[2] ? `<p class="ex">${esc(h[2])}</p>` : ''}`;
  pop.dataset.k = btn.dataset.help; pop._btn = btn; pop.hidden = false;
  const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), innerWidth - pw - 12);
  let y = r.bottom + 8; if (y + ph > innerHeight - 12) y = Math.max(12, r.top - ph - 8);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
/* régua de valor: verde = chance; traço = chance que a odd cobra (1 ÷ odd); círculo = mercado */
function valbar(s, mkt) {
  const p = s.p, be = s.odd ? 1 / s.odd : null, value = be != null && p > be;
  const W = x => (Math.max(0, Math.min(1, x)) * 100).toFixed(1) + '%';
  const lab = `Chance ${pct(p)}${be ? `, a odd ${fmt(s.odd, 2)} cobra ${pct(be)}` : ''}`;
  return `<div class="valbar ${s.side}${value ? ' value' : ''}" role="img" aria-label="${lab}">
    <div class="vb-track"><i class="vb-fill" style="width:${W(p)}"></i>${mkt != null ? `<i class="vb-mkt" style="left:${W(mkt)}"></i>` : ''}${be ? `<b class="vb-mark" style="left:${W(be)}"></b>` : ''}</div>
    <div class="vb-legend"><span>Chance <b>${pct(p)}</b></span>${be ? `<span class="${value ? 'edge' : ''}">odd ${fmt(s.odd, 2)} cobra ${pct(be)}</span>` : `<span>sem odd, justa <b>${fmt(s.fair, 2)}</b></span>`}</div>
  </div>`;
}

/* ---------------- peças ---------------- */
// texto do escudo em preto ou branco, o que tiver mais contraste com a cor do time (WCAG 4,5:1)
const lum = hex => { const c = String(hex).replace('#', ''); return [0, 2, 4].map(i => { const v = parseInt(c.substr(i, 2), 16) / 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0); };
const onColor = hex => 1.05 / (lum(hex) + .05) >= 4.5 ? '#fff' : '#000';
const badge = (t, sm) => { const bg = (TEAM_INFO[t] || ['', '#444'])[1]; return `<span class="badge${sm ? ' sm' : ''}" style="background:${bg};color:${onColor(bg)}" title="${esc((TEAM_INFO[t] || [t])[0])}">${esc(t)}</span>`; };
const gradeChip = g => `<span class="grade g${g === 'A+' ? 'Ap' : g}" title="Nota ${g}">${g}</span>`;
const matchLabel = pr => pr.ctx.isHome ? `vs ${pr.opp}` : `@ ${pr.opp}`;
const sideLb = s => s === 'over' ? 'Mais de' : 'Menos de';
const inSlip = (id, side) => SLIP.some(x => x.id === id && x.side === side);
const srcTag = pr => { const s = srcOf(pr); return `<span class="srctag ${s}" title="${s === 'book' ? 'Linha das casas (The Odds API)' : s === 'mine' ? 'Linha/odd da sua casa' : 'Linha de referência: mediana dos últimos 15 jogos'}">${s === 'book' ? 'Casa' : s === 'mine' ? esc(OVR[pr.id]?.book || 'Sua linha') : 'Referência'}</span>`; };
function hitCell(lb, h, sel) {
  if (!h?.[1]) return `<div class="hit${sel ? ' sel' : ''}">${lb}<b>—</b><div class="bar"></div></div>`;
  const r = h[0] / h[1]; const cls = r >= .7 ? '' : r >= .5 ? ' mid' : ' lo';
  return `<div class="hit${cls}${sel ? ' sel' : ''}">${lb}<b>${h[0]}/${h[1]}</b><div class="bar"><i style="width:${r * 100}%"></i></div></div>`;
}
function dots(pr, side, line, n = 10) {
  const v = pr.vals.slice(0, n).reverse(); const mx = Math.max(...v, line) || 1;
  return `<div class="dots" aria-label="Últimos ${n} jogos">${v.map(x => { const h = side === 'over' ? x > line : x < line; return `<i class="${h ? 'h' : 'm'}" style="height:${Math.max(18, x / mx * 100)}%" title="${x}"></i>`; }).join('')}</div>`;
}
function dvpTag(pr, s) { const r = pr.rank?.rank; if (!r) return ''; const cls = s.fav ? 'good' : ((s.side === 'over' && r <= 10) || (s.side === 'under' && r >= 21)) ? 'bad' : ''; return `<span class="tag ${cls}" title="Defesa do ${pr.opp} contra ${POSLB[pr.p.pos].toLowerCase()}s em ${STATLB[pr.rank.k] || pr.rank.k}: ${r}º de ${pr.rank.of}">DEF ${r}º</span>`; }
function alerts(pr, side) {
  const a = [], c = pr.ctx;
  if ((pr.game.b2b || []).includes(pr.p.team)) a.push(['Back-to-back', 'warn']);
  else if (c.in4 >= 2) a.push(['3 jogos em 4 noites', 'warn']);
  if (pr.p.status === 'questionable') a.push(['Dúvida' + (pr.p.note ? ': ' + pr.p.note : ''), 'bad']);
  if (pr.p.status === 'doubtful') a.push(['Provável desfalque', 'bad']);
  if (Math.abs(pr.game.spread ?? 0) >= 10) a.push(['Risco de lavada', 'warn']);
  { const sf = sampleFlag(pr); if (sf) a.push([sf.lb, 'warn']); }
  if (c.role === 'up') a.push([pr.p.lineup?.confirmed ? 'Titular confirmado' : 'Previsto titular', 'good']);
  if (c.role === 'down') a.push([pr.p.lineup?.confirmed ? 'Vai para o banco' : 'Previsto no banco', 'bad']);
  if (c.wo?.active) a.push([`Sem ${lastName(c.wo.q.name)}: ${c.wo.n} jogos no histórico`, 'good']);
  else if (c.out.length) a.push([c.out.map(q => lastName(q.name)).join(', ') + ' fora: +espaço', 'good']);
  if (c.m5 - c.m20 >= 4) a.push(['Minutos em alta', 'acc']);
  if (pr.book?.open && OVR[pr.id]?.line == null && pr.book.open.line !== pr.book.line) a.push([`Linha ${fmt(pr.book.open.line)} → ${fmt(pr.book.line)}`, '']);
  if (side) { const st = steamOf(pr, side); if (st > 0) a.push(['Mercado a favor', 'good']); else if (st < 0) a.push(['Mercado contra', 'bad']); }
  return a;
}
function oddCell(s) { return s.odd ? `<b>${fmt(s.odd, 2)}</b><span class="book">${esc(s.book)}</span>` : `<b class="muted">—</b><span class="book">justa ${fmt(s.fair, 2)}</span>`; }
function stakeCell(s) { const u = stakeU(s); return s.odd ? (u ? `<b>${uFmt(u)}</b><span class="book">${money(u * CFG.unit)}</span>` : `<b class="muted">0u</b><span class="book">sem valor</span>`) : `<b class="muted">—</b><span class="book">falta odd</span>`; }

function card({ pr, e, s }) {
  const p = pr.p, on = inSlip(pr.id, s.side), u = stakeU(s);
  const tags = [dvpTag(pr, s), ...alerts(pr, s.side).map(([t, c]) => `<span class="tag ${c}">${esc(t)}</span>`)].filter(Boolean);
  return `<article class="pcard${s.ev > 0 ? ' value' : ''} ${s.side}" style="--tc:${teamCol(p.team)}">
  <div class="pc-head">${badge(p.team)}<div class="pc-name"><button class="link" data-open="${pr.id}" data-side="${s.side}">${esc(p.name)}</button><span class="sub">${POSLB[p.pos]} ${matchLabel(pr)}, ${brTime(pr.game.timeUTC)}</span></div>${gradeChip(s.grade)}</div>
  <div class="pc-line"><span class="side ${s.side}">${sideLb(s.side)}</span><span class="lnum">${fmt(e.line)}</span><span class="mk">${MARKETS[pr.mk].lb}</span>${srcTag(pr)}</div>
  ${valbar(s)}
  <div class="pc-kpis">
    <div><small>Odd</small>${s.odd ? `<b>${fmt(s.odd, 2)}</b><span class="book">${esc(s.book)}</span>` : `<b class="muted">—</b><span class="book">informe a sua</span>`}</div>
    <div><small>EV${help('ev')}</small><b class="${s.ev == null ? 'muted' : s.ev >= 0 ? 'pos' : 'neg'}">${sgnPct(s.ev)}</b></div>
    <div><small>Stake${help('stake')}</small>${s.odd ? (u ? `<b>${uFmt(u)}</b><span class="book">${money(u * CFG.unit)}</span>` : `<b class="muted">0u</b><span class="book">sem valor</span>`) : `<b class="muted">—</b>`}</div>
    <div><small>Projeção${help('faixa')}</small><b>${fmt(e.muF)}</b><span class="book">${rangeOf(pr).join('–')}</span></div>
  </div>
  <div class="hits">${hitCell('L5', s.hits.L5, F.sample === 'L5')}${hitCell('L10', s.hits.L10, F.sample === 'L10')}${hitCell('L20', s.hits.L20, F.sample === 'L20')}${hitCell('H2H', s.hits.H2H, F.sample === 'H2H')}${s.hits.WO ? hitCell('sem ' + lastName(pr.ctx.wo.q.name), s.hits.WO, false) : hitCell('Temp.', s.hits.CUR, F.sample === 'CUR')}</div>
  <div class="dotsrow"><span>últ. 10</span>${dots(pr, s.side, e.line)}<span>${s.streak >= 3 ? s.streak + ' seguidos' : 'hoje'}</span></div>
  ${tags.length ? `<div class="pc-tags">${tags.join('')}</div>` : ''}
  <div class="pc-foot"><button class="editbtn" data-edit="${pr.id}" data-side="${s.side}">Minha linha</button><button class="editbtn" data-tip="${pr.id}" data-side="${s.side}">Registrar</button><span class="grow"></span><button class="addbtn" data-add="${pr.id}" data-side="${s.side}" aria-pressed="${on}">${on ? 'No bilhete' : '+ Múltipla'}</button></div>
</article>`;
}
function hc(h) { if (!h?.[1]) return '<span class="hcell">—</span>'; const r = h[0] / h[1]; return `<span class="hcell ${r >= .7 ? 'hi' : r < .5 ? 'lo' : ''}">${h[0]}/${h[1]}</span>`; }
function table(rows) {
  return `<div class="tablewrap"><table><thead><tr><th>Jogador</th><th>Jogo</th><th>Mercado</th><th>Linha</th><th class="r">Proj.</th><th class="r">Chance</th><th class="r">Mercado</th><th class="r">Odd</th><th class="r">EV</th><th class="r">Stake</th><th>L5</th><th>L10</th><th>L20</th><th>H2H</th><th class="r">Seq.</th><th>Def.</th><th>Nota</th><th></th></tr></thead><tbody>
  ${rows.map(({ pr, e, s }) => { const p = pr.p, on = inSlip(pr.id, s.side), u = stakeU(s); return `<tr>
    <td><div class="tplayer">${badge(p.team, 1)}<button class="link" data-open="${pr.id}" data-side="${s.side}">${esc(p.name)}</button><span class="muted">${p.pos}</span>${p.status !== 'ok' ? '<span class="tag bad" title="' + esc(p.note) + '">!</span>' : ''}</div></td>
    <td class="muted">${matchLabel(pr)}, ${brTime(pr.game.timeUTC)}</td><td>${MARKETS[pr.mk].lb}</td>
    <td><span class="side ${s.side}" style="font-size:12px">${s.side === 'over' ? '+' : '−'} ${fmt(e.line)}</span> ${srcTag(pr)}</td>
    <td class="r num">${fmt(e.muF)}</td><td class="r num">${pct(s.p)}</td><td class="r num muted">${pct(s.pMkt)}</td><td class="r num">${s.odd ? fmt(s.odd, 2) + ' <span class="muted">' + esc(s.book) + '</span>' : '<span class="muted">—</span>'}</td>
    <td class="r num ${s.ev == null ? 'muted' : s.ev >= 0 ? 'pos' : 'neg'}">${sgnPct(s.ev)}</td><td class="r num">${u ? uFmt(u) : '<span class="muted">—</span>'}</td>
    <td>${hc(s.hits.L5)}</td><td>${hc(s.hits.L10)}</td><td>${hc(s.hits.L20)}</td><td>${hc(s.hits.H2H)}</td><td class="r num">${s.streak}</td>
    <td>${dvpTag(pr, s)}</td><td>${gradeChip(s.grade)}</td>
    <td class="nowrap"><button class="editbtn" data-tip="${pr.id}" data-side="${s.side}">Registrar</button> <button class="addbtn" data-add="${pr.id}" data-side="${s.side}" aria-pressed="${on}">${on ? '✓' : '+'}</button></td></tr>`; }).join('')}
  </tbody></table></div>`;
}

/* ---------------- PROPS ---------------- */
const PRESETS = [
  { id: 'all', lb: 'Todas', d: '', f: {} },
  { id: 'top', lb: 'Top do dia', d: 'nota A ou A+', f: { minGrade: 'A', sort: 'score' } },
  { id: 'value', lb: 'Valor', d: 'EV ≥ +5% com odd', f: { minEV: 5, oddOnly: true, sort: 'ev' } },
  { id: 'mkt', lb: 'Valor vs mercado', d: 'consenso das casas + EV ≥ 3%', f: { mktOnly: true, minEV: 3, oddOnly: true, sort: 'stake' } },
  { id: 'steam', lb: 'Mercado a favor', d: 'linha andou para o seu lado', f: { steam: true, minGrade: 'B', sort: 'score' } },
  { id: 'wo', lb: 'Sem o colega', d: 'histórico real sem o desfalque', f: { woOnly: true, minGrade: 'B', sample: 'L10', sort: 'score' } },
  { id: 'role', lb: 'Vira titular', d: 'reserva no quinteto', f: { roleUp: true, side: 'over', sort: 'score' } },
  { id: 'safe', lb: 'Seguras p/ múltipla', d: 'A, L10 ≥ 8, sem dúvidas', f: { minGrade: 'A', minHit: 80, sample: 'L10', noDoubt: true, oddMin: 1.4, oddMax: 1.95, sort: 'prob' } },
  { id: 'shots', lb: 'Arremessos', d: 'tentativas e convertidos', f: { groups: ['shot'], minGrade: 'B', sort: 'score' } },
  { id: 'hot', lb: 'Sequência quente', d: '5/5 nos últimos 5', f: { sample: 'L5', minHit: 100, minGrade: 'B', sort: 'streak' } },
  { id: 'matchup', lb: 'Matchup favorável', d: 'defesa a favor', f: { dvp: true, minGrade: 'B', sort: 'score' } },
  { id: 'unders', lb: 'Unders', d: 'só “menos de”', f: { side: 'under', minGrade: 'B', sort: 'score' } },
  { id: 'mine', lb: 'Minhas linhas', d: 'da sua casa', f: { src: 'mine', side: 'best', sort: 'ev' } }
];
function initFilters() {
  $('#fGames').innerHTML = SLATE.games.map(g => `<button class="chip" data-v="${g.id}">${g.away} @ ${g.home}</button>`).join('');
  $('#fMarkets').innerHTML = Object.entries(GROUPS).map(([g, lb]) => `<div class="grp"><div class="chips"><button class="chip" data-grp="${g}">${lb}</button></div><div class="chips">${Object.keys(MARKETS).filter(k => MARKETS[k].g === g).map(k => `<button class="chip" data-v="${k}" title="${esc(MARKETS[k].lb)}">${mkShort(k)}</button>`).join('')}</div></div>`).join('');
  $('#presets').innerHTML = PRESETS.map(p => `<button class="chip" data-preset="${p.id}">${p.lb}${p.d ? ` <small>${p.d}</small>` : ''}</button>`).join('');
}
const CHECKS = [['#fOddOnly', 'oddOnly'], ['#fMktOnly', 'mktOnly'], ['#fDvp', 'dvp'], ['#fNoB2B', 'noB2B'], ['#fNoDoubt', 'noDoubt'], ['#fNoBlow', 'noBlow'], ['#fProjGap', 'projGap'], ['#fWo', 'woOnly'], ['#fSteam', 'steam']];
function syncFilterUI() {
  $('#fq').value = F.q;
  $$('#fGames .chip').forEach(b => b.setAttribute('aria-pressed', F.games.includes(b.dataset.v)));
  $$('#fMarkets [data-v]').forEach(b => b.setAttribute('aria-pressed', F.markets.includes(b.dataset.v)));
  $$('#fMarkets [data-grp]').forEach(b => b.setAttribute('aria-pressed', F.groups.includes(b.dataset.grp)));
  $$('#fPos .chip').forEach(b => b.setAttribute('aria-pressed', F.pos.includes(b.dataset.v)));
  for (const [sel, key] of [['#fSide', 'side'], ['#fGrade', 'minGrade'], ['#fSample', 'sample'], ['#fView', 'view'], ['#fSrc', 'src']]) $$(sel + ' button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === F[key]));
  $('#fHit').value = F.minHit; $('#fHitV').textContent = F.minHit + '%';
  $('#fProb').value = F.minProb; $('#fProbV').textContent = F.minProb + '%';
  $('#fEV').value = F.minEV; $('#fEVV').textContent = F.minEV <= -20 ? 'qualquer' : (F.minEV > 0 ? '+' : '') + F.minEV + '%';
  $('#fOddMin').value = F.oddMin; $('#fOddMax').value = F.oddMax;
  for (const [id, k] of CHECKS) $(id).checked = F[k];
  $('#fSort').value = F.sort;
  $$('#presets .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.preset === F.preset));
  const n = activeCount(); $('#fCount').textContent = n || ''; $('#fCount').hidden = !n;
}
function renderProps() {
  if (!SLATE) return;
  syncFilterUI();
  const rows = filtered();
  $('#rCount').textContent = rows.length + (rows.length === 1 ? ' linha' : ' linhas');
  const view = matchMedia('(max-width:760px)').matches ? 'cards' : F.view;
  const shown = rows.slice(0, LIMIT);
  if (!rows.length) $('#results').innerHTML = `<div class="panel empty"><h2>Nenhuma linha passa nesses filtros</h2><p>Afrouxe o acerto mínimo, a nota ou a faixa de odd. <button class="btn" data-reset>Limpar filtros</button></p></div>`;
  else $('#results').innerHTML = view === 'table' ? table(shown) : `<div class="cards">${shown.map(card).join('')}</div>`;
  $('#moreBtn').hidden = rows.length <= LIMIT; $('#moreBtn').textContent = `Mostrar mais (${rows.length - LIMIT})`;
  store.set('f2', F);
}
function setF(patch, keepPreset) { Object.assign(F, patch); if (!keepPreset) F.preset = ''; LIMIT = 60; renderProps(); }


/* ---------------- RESUMO DO DIA + O QUE MUDOU ---------------- */
// "visto": fotografia do que o tipster viu (linhas, status e quinteto). Mudanças são contra ela;
// sem fotografia no dia, comparamos com a linha de abertura.
let CHG_BASE = 'open';
function snapshotNow() {
  const lines = {}, status = {}, role = {};
  for (const pr of PROPS) if (pr.book) lines[pr.id] = pr.book.line;
  for (const p of SLATE.players) { status[p.id] = p.status; }
  for (const pr of PROPS) if (pr.ctx.role) role[pr.p.id] = pr.ctx.role;
  return { at: new Date().toISOString(), gen: SLATE.meta.generatedAt, lines, status, role };
}
function changesList() {
  const seen = store.get('seen:' + SLATE.meta.date, null);
  CHG_BASE = seen ? 'visit' : 'open';
  const mine = new Set(TIPS.filter(t => t.status === 'pending').flatMap(t => t.legs.map(l => l.pid)));
  const out = [], seenP = new Set();
  for (const pr of PROPS) {
    if (!pr.book) continue;
    const from = seen ? seen.lines[pr.id] : pr.book.open?.line;
    if (from != null && from !== pr.book.line) out.push({ kind: 'line', pr, from, to: pr.book.line, mine: mine.has(pr.p.id), w: Math.abs(pr.book.line - from) / Math.max(1, from) });
  }
  if (seen) for (const p of SLATE.players) {
    if (seen.status[p.id] && seen.status[p.id] !== p.status) { out.push({ kind: 'status', p, from: seen.status[p.id], to: p.status, mine: mine.has(p.id), w: 1 }); seenP.add(p.id); }
  }
  for (const pr of PROPS) if (pr.ctx.role && !(seen?.role?.[pr.p.id] === pr.ctx.role) && !seenP.has(pr.p.id)) { seenP.add(pr.p.id); out.push({ kind: 'role', pr, mine: mine.has(pr.p.id), w: .8 }); }
  return out.sort((a, b) => (b.mine - a.mine) || (b.w - a.w));
}
const ST_LB = { ok: 'liberado', out: 'fora', doubtful: 'provável fora', questionable: 'em dúvida' };
function changeItem(c) {
  if (c.kind === 'line') { const up = c.to > c.from; return `<button data-open="${c.pr.id}" data-side="${up ? 'over' : 'under'}"><span class="ch-ic ${up ? 'up' : 'down'}" aria-hidden="true">${up ? '▲' : '▼'}</span><span class="grow"><b>${esc(c.pr.p.name)}</b> ${MARKETS[c.pr.mk].lb.toLowerCase()} ${fmt(c.from)} para ${fmt(c.to)}</span>${c.mine ? '<span class="tag warn">sua tip</span>' : ''}</button>`; }
  if (c.kind === 'status') { const p = c.p, pr = PROPS.find(x => x.p.id === p.id); return `<button ${pr ? `data-open="${pr.id}" data-side="${EVAL[pr.id].best}"` : ''}><span class="ch-ic st" aria-hidden="true">!</span><span class="grow"><b>${esc(p.name)}</b> passou de ${ST_LB[c.from] || c.from} para <b>${ST_LB[c.to] || c.to}</b></span>${c.mine ? '<span class="tag warn">sua tip</span>' : ''}</button>`; }
  return `<button data-open="${c.pr.id}" data-side="${EVAL[c.pr.id].best}"><span class="ch-ic" aria-hidden="true">↺</span><span class="grow"><b>${esc(c.pr.p.name)}</b> ${c.pr.ctx.role === 'up' ? 'previsto no quinteto titular' : 'previsto no banco'}${c.pr.p.lineup?.confirmed ? ' (confirmado)' : ''}</span>${c.mine ? '<span class="tag warn">sua tip</span>' : ''}</button>`;
}
let CHG_OPEN = false, PL_INTRO = true;
const teamCol = t => (TEAM_INFO[t] || ['', '#5B6577'])[1];
/* curva suave (Catmull-Rom → Bézier) */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
/* gráfico da rodada: chance do modelo (área verde) × chance que a odd cobra (linha dourada),
   nas melhores linhas com odd, na ordem dos jogos. A distância entre as duas é o valor. */
function rodadaChart() {
  const games = SLATE.games.slice().sort((a, b) => String(a.timeUTC).localeCompare(String(b.timeUTC)));
  const sel = new Set(F.games || []);
  const rows = [];
  for (const g of games) {
    if (sel.size && !sel.has(g.id)) continue;
    const r = bestRows().filter(x => x.pr.game.id === g.id && x.s.odd && x.s.p >= .4).sort((a, b) => score(b) - score(a));
    rows.push(...byPlayerBest(r, sel.size ? 24 : 7));
  }
  const n = rows.length;
  if (n < 3) return `<div class="chart-empty">Sem odds das casas nesta rodada ainda. Importe as linhas da sua casa ou rode o coletor com uma chave de odds para ver o gráfico.</div>`;
  const W = 820, H = 250, L = 38, R = 14, T = 26, B = 30;
  const ps = rows.map(x => x.s.p), be = rows.map(x => 1 / x.s.odd);
  let lo = Math.min(...ps, ...be), hi = Math.max(...ps, ...be);
  lo = Math.max(0, Math.floor((lo - .04) * 10) / 10); hi = Math.min(1, Math.ceil((hi + .04) * 10) / 10);
  const X = i => L + i * (W - L - R) / (n - 1), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pP = ps.map((v, i) => [X(i), Y(v)]), pB = be.map((v, i) => [X(i), Y(v)]);
  const line = smoothPath(pP), area = `${line} L${X(n - 1).toFixed(1)},${H - B} L${X(0).toFixed(1)},${H - B} Z`;
  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v += .1) grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  let xl = '', last = null;
  rows.forEach((x, i) => { const t = brTime(x.pr.game.timeUTC); if (x.pr.game.id !== last) { last = x.pr.game.id; xl += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'middle'}">${t} ${x.pr.game.away}×${x.pr.game.home}</text><line class="gsep" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${T}" y2="${H - B}"/>`; } });
  const bi = rows.reduce((b, x, i) => (x.s.ev ?? -9) > (rows[b].s.ev ?? -9) ? i : b, 0), bx = X(bi), by = Y(ps[bi]);
  const lab = `${lastName(rows[bi].pr.p.name)} ${sgnPct(rows[bi].s.ev)}`, lw = lab.length * 7.2 + 20, lx = Math.min(Math.max(bx - lw / 2, L), W - R - lw);
  const step = (W - L - R) / (n - 1);
  const hits = rows.map((x, i) => `<rect class="hit" x="${(X(i) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${H - T - B}" data-open="${x.pr.id}" data-side="${x.s.side}"><title>${esc(x.pr.p.name)}, ${sideLb(x.s.side).toLowerCase()} ${fmt(x.e.line)} ${MARKETS[x.pr.mk].lb.toLowerCase()}: chance ${pct(x.s.p)}, odd ${fmt(x.s.odd, 2)} cobra ${pct(1 / x.s.odd)}</title></rect>`).join('');
  return `<svg class="rchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance do modelo comparada à chance que a odd cobra em ${n} linhas da rodada">
    <defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--green)" stop-opacity=".55"/><stop offset="1" stop-color="var(--green)" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${grid}</g><g class="xl">${xl}</g>
    <path class="area" d="${area}" fill="url(#gArea)"/><path class="pline" d="${line}"/><path class="bline" d="${smoothPath(pB)}"/>
    <line class="peak" x1="${bx.toFixed(1)}" x2="${bx.toFixed(1)}" y1="${T}" y2="${H - B}"/><circle class="pdot" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="6"/>
    <g class="plabel"><rect x="${lx.toFixed(1)}" y="${Math.max(2, by - 34).toFixed(1)}" width="${lw.toFixed(1)}" height="24" rx="12"/><text x="${(lx + lw / 2).toFixed(1)}" y="${(Math.max(2, by - 34) + 16).toFixed(1)}" text-anchor="middle">${esc(lab)}</text></g>
    ${hits}</svg>`;
}
function renderSummary() {
  const el = $('#daySummary'); if (!el || !SLATE) return;
  const games = SLATE.games.slice().sort((a, b) => String(a.timeUTC).localeCompare(String(b.timeUTC)));
  const strong = bestRows().filter(x => GRADE_ORDER[x.s.grade] >= 3), withOdd = strong.filter(x => x.s.odd && x.s.ev > 0).length;
  const tops = topPicks(5);
  const outs = SLATE.players.filter(p => p.status !== 'ok').sort((a, b) => ({ out: 0, doubtful: 1, questionable: 2 }[a.status] ?? 3) - ({ out: 0, doubtful: 1, questionable: 2 }[b.status] ?? 3)).slice(0, 5);
  const ch = changesList(), mine = ch.some(c => c.mine);
  const sel = new Set(F.games || []);
  const tile = (g, i) => `<button class="day" data-game="${g.id}" aria-pressed="${sel.has(g.id)}" style="--i:${i}" aria-label="${g.away} em ${g.home}, ${brTime(g.timeUTC)}. Ver as props deste jogo"><small>${brTime(g.timeUTC)}</small><b>${g.away}</b><span>${g.home}</span></button>`;
  const stLb = { out: 'Fora', doubtful: 'Provável fora', questionable: 'Dúvida' };
  el.innerHTML = `<div class="dash">
    <section class="dpanel stats">
      <div class="dp-head"><div class="grow"><h2>Valor da rodada</h2><p class="muted">Chance do modelo contra a chance que a odd cobra. Onde o verde passa do dourado, a odd paga mais do que deveria.</p></div>
        <button class="chg-pill${mine ? ' alert' : ''}" data-chg aria-expanded="${CHG_OPEN}"><b>${ch.length}</b> ${ch.length === 1 ? 'mudança' : 'mudanças'}</button></div>
      <div class="daystrip${PL_INTRO ? ' intro' : ''}" role="group" aria-label="Jogos de hoje"><button class="day all" data-gameall aria-pressed="${!sel.size}"><small>Hoje</small><b>${games.length}</b><span>jogos</span></button>${games.map(tile).join('')}</div>
      <div class="chartwrap">${rodadaChart()}</div>
      <div class="ch-legend"><span><i class="lg-area"></i>Chance do modelo</span><span><i class="lg-line"></i>Chance que a odd cobra</span><span class="muted">Toque num ponto para abrir a ficha</span></div>
    </section>
    <div class="dside">
      <section class="dpanel"><h3>Melhores da rodada</h3>${tops.length ? `<div class="plist">${tops.map(x => `<button class="prow" data-open="${x.pr.id}" data-side="${x.s.side}">${badge(x.pr.p.team)}<span class="grow"><b>${esc(x.pr.p.name)}</b><small>${sideLb(x.s.side)} ${fmt(x.e.line)} ${MARKETS[x.pr.mk].lb.toLowerCase()}</small></span>${gradeChip(x.s.grade)}</button>`).join('')}</div>` : '<p class="muted">Nenhuma linha com nota A hoje.</p>'}</section>
      <section class="dpanel"><h3>Desfalques <small>${outs.length ? '' : 'nenhum listado'}</small></h3>${outs.length ? `<div class="plist">${outs.map(p => { const pr = PROPS.find(x => x.p.id === p.id); return `<button class="prow"${pr ? ` data-open="${pr.id}" data-side="${EVAL[pr.id].best}"` : ' data-goto="jogos"'}>${badge(p.team)}<span class="grow"><b>${esc(p.name)}</b><small>${esc(p.note || TEAM_INFO[p.team]?.[0] || '')}</small></span><span class="stchip ${p.status}">${stLb[p.status] || p.status}</span></button>`; }).join('')}</div>` : ''}</section>
      <button class="gtile" data-preset-go="top"><span class="gt-stack">${tops.slice(0, 4).map(x => badge(x.pr.p.team)).join('')}</span><b>${strong.length}</b><span>${strong.length === 1 ? 'linha' : 'linhas'} com nota A ou A+${withOdd ? `, ${withOdd} com valor na odd de hoje` : ''}</span></button>
    </div>
  </div>
  ${CHG_OPEN && ch.length ? `<section class="changes dpanel" aria-label="O que mudou"><div class="ch-head"><h2>O que mudou ${CHG_BASE === 'visit' ? 'desde a sua última visita' : 'desde a abertura do mercado'}</h2><button class="btn sm" data-seen>Marcar como visto</button></div><div class="ch-list">${ch.slice(0, 10).map(changeItem).join('')}</div>${ch.length > 10 ? `<p class="muted" style="margin:6px 0 0;font-size:13px">e mais ${ch.length - 10}.</p>` : ''}</section>` : ''}`;
  if (PL_INTRO) { PL_INTRO = false; setTimeout(() => el.querySelector('.daystrip')?.classList.remove('intro'), 1200); }
}

/* ---------------- BUSCA RÁPIDA (Ctrl/⌘ + K) ---------------- */
function openSearch() {
  openModal(`<div class="mhead"><h2>Buscar jogador</h2><button class="dclose" data-mclose aria-label="Fechar">×</button></div>
  <div class="mbody"><input id="qsInput" class="search qs" type="search" placeholder="Nome do jogador ou time (ex. Brunson, NYK)" autocomplete="off" aria-label="Buscar jogador"><div class="qs-list" id="qsList" role="listbox"></div>
  <p class="muted" style="margin:0;font-size:12.5px">Atalho: Ctrl+K (ou ⌘K) ou a tecla /. Enter abre o primeiro resultado.</p></div>`);
  const draw = () => {
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm($('#qsInput').value.trim());
    const byP = new Map(); for (const x of bestRows()) { const k = x.pr.p.id; if (!byP.has(k) || score(x) > score(byP.get(k))) byP.set(k, x); }
    let rows = [...byP.values()]; if (q) rows = rows.filter(x => norm(x.pr.p.name).includes(q) || norm(x.pr.p.team) === q || norm(TEAM_INFO[x.pr.p.team]?.[0] || '').includes(q));
    rows = rows.sort((a, b) => score(b) - score(a)).slice(0, 8);
    $('#qsList').innerHTML = rows.length ? rows.map(x => `<button role="option" data-open="${x.pr.id}" data-side="${x.s.side}">${badge(x.pr.p.team, 1)}<span class="grow"><b>${esc(x.pr.p.name)}</b><span class="muted"> ${matchLabel(x.pr)}, ${brTime(x.pr.game.timeUTC)}</span></span><span class="side ${x.s.side}">${sideLb(x.s.side)} ${fmt(x.e.line)}</span><span class="qs-mk">${mkShort(x.pr.mk)}</span>${gradeChip(x.s.grade)}</button>`).join('') : '<p class="muted" style="margin:6px 0">Nenhum jogador de hoje com esse nome.</p>';
  };
  $('#qsInput').addEventListener('input', draw);
  $('#qsInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#qsList [data-open]')?.click(); } if (e.key === 'ArrowDown') { e.preventDefault(); $('#qsList [data-open]')?.focus(); } });
  $('#qsList').addEventListener('keydown', e => { const b = e.target.closest('[data-open]'); if (!b) return; if (e.key === 'ArrowDown') { e.preventDefault(); (b.nextElementSibling || b).focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); (b.previousElementSibling || $('#qsInput')).focus(); } });
  draw(); setTimeout(() => $('#qsInput')?.focus(), 40);
}

/* ---------------- TENDÊNCIAS ---------------- */
function rankItem(i, pr, s, right, sub) {
  return `<button data-open="${pr.id}" data-side="${s ? s.side : EVAL[pr.id].best}"><span class="n${i < 3 ? ' top' : ''}">${i + 1}</span>${badge(pr.p.team, 1)}<span class="who"><b>${esc(pr.p.name)}</b><span>${sub}</span></span><span class="right">${right}</span></button>`;
}
function bestRows() { return PROPS.map(pr => { const e = EVAL[pr.id]; return { pr, e, s: e[e.best] }; }); }
function byPlayerBest(list, n) { const seen = new Set(), out = []; for (const x of list) { if (seen.has(x.pr.p.id)) continue; seen.add(x.pr.p.id); out.push(x); if (out.length >= n) break; } return out; }
function topPicks(n = 10) { return byPlayerBest(bestRows().filter(x => GRADE_ORDER[x.s.grade] >= 3).sort((a, b) => score(b) - score(a)), n); }
function renderTrends() {
  const best = bestRows();
  const sideTxt = x => `${sideLb(x.s.side).toLowerCase()} ${fmt(x.e.line)} ${MARKETS[x.pr.mk].lb.toLowerCase()}`;
  const top = topPicks(10);
  const streaks = byPlayerBest(best.filter(x => x.s.streak >= 5 && x.s.p >= .5).sort((a, b) => b.s.streak - a.s.streak || b.s.p - a.s.p), 8);
  const mu = byPlayerBest(PROPS.filter(pr => ['PTS', 'REB', 'AST', '3PM', 'FGA', '2PA'].includes(pr.mk) && pr.rank?.rank >= 24).map(pr => ({ pr, e: EVAL[pr.id], s: EVAL[pr.id].over })).sort((a, b) => b.pr.rank.rank - a.pr.rank.rank || b.s.p - a.s.p), 8);
  const players = [...new Map(PROPS.map(pr => [pr.p.id, pr])).values()];
  const mins = players.filter(pr => pr.ctx.m5 - pr.ctx.m20 >= 3).sort((a, b) => (b.ctx.m5 - b.ctx.m20) - (a.ctx.m5 - a.ctx.m20)).slice(0, 8);
  const room = players.filter(pr => pr.ctx.extra >= 1.5 || pr.ctx.usage > 1.01 || pr.ctx.wo?.active).sort((a, b) => b.ctx.extra - a.ctx.extra).slice(0, 8);
  const steam = byPlayerBest(best.filter(x => x.pr.mkt?.openMu != null && steamOf(x.pr, x.s.side) > 0).sort((a, b) => Math.abs(b.pr.mkt.mu - b.pr.mkt.openMu) / b.pr.mkt.mu - Math.abs(a.pr.mkt.mu - a.pr.mkt.openMu) / a.pr.mkt.mu), 8);
  const leaders = Object.keys(MARKETS).map(mk => best.filter(x => x.pr.mk === mk).sort((a, b) => score(b) - score(a))[0]).filter(Boolean);
  const empty = t => `<div class="empty-s">${t}</div>`;
  const lay = layups(20), rad = radar(10);
  $('#trends').innerHTML = `
  <section class="panel half"><h2>Escada segura <small>“X ou mais” com chance 80%+ e histórico firme</small>${help('escada')}</h2><div class="rank">${lay.length ? lay.map((x, i) => rankItem(i, x.pr, x.pr ? EVAL[x.pr.id].over : null, `${pct(x.r.p)}<small>justa ${fmt(x.r.fair, 2)}</small>`, `${x.r.t}+ ${MARKETS[x.pr.mk].lb.toLowerCase()}, L10 ${x.r.L10[0]}/${x.r.L10[1]}, L20 ${x.r.L20[0]}/${x.r.L20[1]}`)).join('') : empty('Nenhum degrau passa no critério hoje.')}</div></section>
  <section class="panel half"><h2>Radar de divergência <small>casa pagando acima do consenso das outras</small>${help('radar')}</h2><div class="rank">${rad.length ? rad.map((x, i) => rankItem(i, x.pr, EVAL[x.pr.id][x.d.side], `${sgnPct(x.d.edge)}<small>${esc(x.d.book)} ${fmt(x.d.odd, 2)}, justa ${fmt(x.d.fairOdd, 2)}</small>`, `${sideLb(x.d.side).toLowerCase()} ${fmt(x.pr.book.line)} ${MARKETS[x.pr.mk].lb.toLowerCase()}, ${x.d.n} casas no consenso`)).join('') : empty('Nenhuma casa fora do consenso agora (precisa de 3+ casas por linha).')}</div></section>
  <section class="panel half"><h2>Top 10 do dia <small>melhor linha de cada jogador, nota A ou A+</small><span class="grow"></span>${top.length ? '<button class="btn sm" data-daycard>Gerar card do dia</button>' : ''}</h2><div class="rank">${top.length ? top.map((x, i) => rankItem(i, x.pr, x.s, `${pct(x.s.p)}<small>${x.s.ev != null ? 'EV ' + sgnPct(x.s.ev) + (stakeU(x.s) ? ', ' + uFmt(stakeU(x.s)) : '') : 'nota ' + x.s.grade}</small>`, sideTxt(x))).join('') : empty('Nenhuma linha com nota A hoje.')}</div></section>
  <section class="panel half"><h2>Mercado se mexendo <small>linha/odd andou desde a abertura</small></h2><div class="rank">${steam.length ? steam.map((x, i) => rankItem(i, x.pr, x.s, `${fmt(x.pr.mkt.openLine)}→${fmt(x.pr.book.line)}<small>${pct(x.pr.mkt.openP)}→${pct(x.pr.mkt.pO)} mais</small>`, sideTxt(x))).join('') : empty('Sem movimento relevante (precisa de odds de pelo menos duas coletas no dia).')}</div></section>
  <section class="panel half"><h2>Em sequência <small>bateram a linha nos últimos jogos seguidos</small></h2><div class="rank">${streaks.length ? streaks.map((x, i) => rankItem(i, x.pr, x.s, `${x.s.streak} seguidos<small>chance ${pct(x.s.p)}</small>`, sideTxt(x))).join('') : empty('Nenhuma sequência de 5+ jogos hoje.')}</div></section>
  <section class="panel half"><h2>Ganham espaço <small>com desfalques do time</small></h2><div class="rank">${room.length ? room.map((pr, i) => rankItem(i, pr, null, `${pr.ctx.extra >= 0 ? '+' : ''}${fmt(pr.ctx.extra)} min<small>${pr.ctx.wo?.active ? pr.ctx.wo.n + ' jogos sem ' + lastName(pr.ctx.wo.q.name) : 'uso ×' + fmt(pr.ctx.usage, 2)}</small>`, pr.ctx.out.map(q => q.name).join(', ') + ' fora')).join('') : empty('Nenhum desfalque relevante hoje.')}</div></section>
  <section class="panel third"><h2>Melhores matchups <small>defesas que mais cedem</small></h2><div class="rank">${mu.length ? mu.map((x, i) => rankItem(i, x.pr, x.s, `DEF ${x.pr.rank.rank}º<small>${STATLB[x.pr.rank.k] || ''}</small>`, `${matchLabel(x.pr)}, ${MARKETS[x.pr.mk].lb.toLowerCase()} proj. ${fmt(x.pr.proj)}`)).join('') : empty('Sem matchups extremos hoje.')}</div></section>
  <section class="panel third"><h2>Minutos em alta <small>últimos 5 × últimos 20</small></h2><div class="rank">${mins.length ? mins.map((pr, i) => rankItem(i, pr, null, `+${fmt(pr.ctx.m5 - pr.ctx.m20)} min<small>${fmt(pr.ctx.m5, 0)} nos últimos 5</small>`, `${POSLB[pr.p.pos]}, ${matchLabel(pr)}`)).join('') : empty('Ninguém com salto de minutos.')}</div></section>
  <section class="panel third"><h2>Quinteto <small>mudanças no time titular</small></h2><div class="rank">${(() => { const ch = players.filter(pr => pr.ctx.role); return ch.length ? ch.map((pr, i) => rankItem(i, pr, null, `${fmt(pr.ctx.exp, 0)} min<small>${pr.ctx.role === 'up' ? 'vira titular' : 'vai ao banco'}</small>`, `${POSLB[pr.p.pos]}, ${pr.p.lineup?.confirmed ? 'confirmado' : 'previsto'}`)).join('') : empty('Sem mudança de quinteto (ou quintetos ainda não divulgados).'); })()}</div></section>
  <section class="panel"><h2>Líder por mercado <small>melhor linha do dia em cada um dos ${Object.keys(MARKETS).length} mercados</small></h2><div class="leaders">${leaders.map(x => `<button data-open="${x.pr.id}" data-side="${x.s.side}"><small>${MARKETS[x.pr.mk].lb}</small><b>${esc(x.pr.p.name)}</b><span>${sideLb(x.s.side).toLowerCase()} ${fmt(x.e.line)}, ${pct(x.s.p)}, ${gradeChip(x.s.grade)}</span></button>`).join('')}</div></section>`;
}

/* ---------------- JOGOS ---------------- */
function renderGames() {
  if (!SLATE.games.length) { $('#gamesGrid').innerHTML = '<div class="panel empty"><h3>Sem jogos nesta data</h3></div>'; return; }
  $('#gamesGrid').innerHTML = SLATE.games.map(g => {
    const inRot = SLATE.players.filter(p => (p.team === g.home || p.team === g.away) && p.status !== 'ok');
    const names = new Set(inRot.map(p => p.name.toLowerCase()));
    const extra = (SLATE.injuries || []).filter(i => (i.team === g.home || i.team === g.away) && i.status === 'out' && !names.has(String(i.name || '').toLowerCase()));
    const top = PROPS.filter(pr => pr.game.id === g.id).map(pr => ({ pr, e: EVAL[pr.id], s: EVAL[pr.id][EVAL[pr.id].best] })).filter(x => GRADE_ORDER[x.s.grade] >= 3).sort((a, b) => score(b) - score(a)).slice(0, 4);
    const fav = g.spread == null ? null : g.spread < 0 ? g.home : g.away;
    const tp = SLATE.teams[g.home]?.pace, ap = SLATE.teams[g.away]?.pace, lp = SLATE.league.pace;
    const pace = tp && ap ? (tp + ap) / 2 : null;
    const paceLb = pace == null ? '—' : pace >= lp + 1.5 ? 'Alto' : pace <= lp - 1.5 ? 'Lento' : 'Médio';
    const mv = (a, b) => a != null && b != null && a !== b ? `<small class="mv">abriu ${fmt(a)}</small>` : '';
    return `<article class="panel gcard" style="--ca:${teamCol(g.away)};--ch:${teamCol(g.home)}">
      <div class="gteams">
        <div class="gteam">${badge(g.away)}<span>${esc(TEAM_INFO[g.away]?.[0] || g.away)}</span><small>Visitante${g.b2b.includes(g.away) ? ', B2B' : ''}</small></div>
        <div class="gmid"><div class="t">${brTime(g.timeUTC)}</div><small>horário de Brasília</small></div>
        <div class="gteam">${badge(g.home)}<span>${esc(TEAM_INFO[g.home]?.[0] || g.home)}</span><small>Mandante${g.b2b.includes(g.home) ? ', B2B' : ''}</small></div>
      </div>
      <div class="gnums"><div><small>Handicap</small><b>${fav ? fav + ' −' + fmt(Math.abs(g.spread)) : '—'}</b>${mv(g.openSpread, g.spread)}</div><div><small>Total</small><b>${fmt(g.total)}</b>${mv(g.openTotal, g.total)}</div><div><small>Ritmo</small><b>${paceLb}${pace ? ' <span class="muted" style="font-size:12px">' + fmt(pace) + '</span>' : ''}</b></div></div>
      <div class="gsec"><h4>Desfalques e alertas</h4><div class="inj">${[...inRot.map(p => `<div>${badge(p.team, 1)}<span>${esc(p.name)}</span><span class="tag ${p.status === 'out' ? 'bad' : 'warn'}">${{ out: 'Fora', doubtful: 'Provável fora', questionable: 'Dúvida' }[p.status] || p.status}${p.note ? ': ' + esc(p.note) : ''}</span>${p.injSrc ? `<span class="muted" style="font-size:11px">${esc(p.injSrc)}</span>` : ''}</div>`), ...extra.map(i => `<div>${badge(i.team, 1)}<span>${esc(i.name)}</span><span class="tag bad">Fora${i.note ? ': ' + esc(i.note) : ''}</span></div>`)].join('') || '<span class="muted">Nenhum desfalque listado</span>'}
        ${g.b2b.length ? `<div><span class="tag warn">Back-to-back</span><span class="muted">${g.b2b.join(', ')} jogou ontem</span></div>` : ''}
        ${Math.abs(g.spread ?? 0) >= 10 ? `<div><span class="tag warn">Risco de lavada</span><span class="muted">titulares podem sair cedo</span></div>` : ''}</div></div>
      <div class="gsec"><h4>Melhores linhas do jogo</h4><div class="toplist">${top.length ? top.map(({ pr, e, s }) => `<button data-open="${pr.id}" data-side="${s.side}">${gradeChip(s.grade)}<span class="grow"><b>${esc(pr.p.name)}</b>, ${sideLb(s.side).toLowerCase()} ${fmt(e.line)} ${MARKETS[pr.mk].lb.toLowerCase()}</span><span class="num">${pct(s.p)}</span></button>`).join('') : '<span class="muted">Nenhuma linha A ou A+ neste jogo</span>'}</div></div>
      <button class="btn" data-game="${g.id}">Ver todas as props deste jogo</button>
    </article>`;
  }).join('');
}

/* ---------------- DEFESA ---------------- */
function allowed(t, pos, k) { const a = SLATE.teams[t]?.allowed?.[pos]; if (!a) return null; if (k === 'twom') return a.fgm - a.tpm; if (k === 'twoa') return a.fga - a.tpa; return a[k]; }
function heatBg(r, n) { const t = (r - (n + 1) / 2) / ((n - 1) / 2); const c = t >= 0 ? 'var(--good)' : 'var(--bad)'; return `background:color-mix(in srgb, ${c} ${Math.round(Math.abs(t) * 55)}%, var(--surface))`; }
function renderDvP() {
  $('#dvpStat').innerHTML = Object.keys(STATLB).map(s => `<button class="chip" data-dvp="${s}" aria-pressed="${s === dvpStat}">${STATLB[s]}</button>`).join('');
  const teams = SLATE.games.flatMap(g => [g.away, g.home]);
  $('#dvpTable').innerHTML = `<thead><tr><th>Defesa</th><th>Joga contra</th>${['G', 'F', 'C'].map(p => `<th style="text-align:center">${POSLB[p]}</th>`).join('')}</tr></thead><tbody>${teams.map(t => {
    const g = SLATE.games.find(x => x.home === t || x.away === t); const opp = g.home === t ? g.away : g.home;
    return `<tr><td><div class="tplayer">${badge(t, 1)}<b>${esc(TEAM_INFO[t]?.[0] || t)}</b></div></td><td class="muted">${opp}</td>${['G', 'F', 'C'].map(pos => { const { rank, of } = dvpRank(SLATE, t, pos, dvpStat); return rank ? `<td class="cell" style="${heatBg(rank, of)}">${rank}º<small>${fmt(allowed(t, pos, dvpStat))} por jogo</small></td>` : '<td class="cell muted">—</td>'; }).join('')}</tr>`;
  }).join('')}</tbody>`;
  const mkFor = { pts: 'PTS', reb: 'REB', ast: 'AST', tpm: '3PM', tpa: '3PA', twom: '2PM', twoa: '2PA', fgm: 'FGM', fga: 'FGA', ftm: 'FTM', fta: 'FTA', stl: 'STL', blk: 'BLK', tov: 'TOV', pf: 'PF' }[dvpStat];
  const seen = new Set();
  const tg = PROPS.filter(pr => pr.mk === mkFor).map(pr => ({ pr, r: dvpRank(SLATE, pr.opp, pr.p.pos, dvpStat) })).filter(x => x.r.rank >= x.r.of - 7).sort((a, b) => b.r.rank - a.r.rank || b.pr.proj - a.pr.proj).filter(x => !seen.has(x.pr.p.id) && seen.add(x.pr.p.id));
  $('#dvpTargets').innerHTML = tg.length ? tg.slice(0, 14).map(({ pr, r }) => { const e = EVAL[pr.id]; return `<button data-open="${pr.id}" data-side="over">${badge(pr.p.team, 1)}<span class="grow"><b>${esc(pr.p.name)}</b> ${matchLabel(pr)}, linha ${fmt(e.line)}</span><span class="tag good">${r.rank}º</span>${gradeChip(e.over.grade)}</button>`; }).join('') : '<span class="muted">Nenhum alvo forte hoje nesta estatística.</span>';
}

/* ---------------- MÚLTIPLA ---------------- */
function slipLegs() { return SLIP.filter(x => BYID[x.id]).map(x => ({ pr: BYID[x.id], e: EVAL[x.id], s: EVAL[x.id][x.side], side: x.side })); }
function slipCalc(legs) {
  const pc = parlayProb(legs.map(l => ({ pr: l.pr, side: l.side, line: l.e.line, p: l.s.p })));
  const allOdds = legs.every(l => l.s.odd);
  const odd = allOdds ? legs.reduce((a, l) => a * l.s.odd, 1) : null;
  return { prob: pc.prob, indep: legs.reduce((a, l) => a * l.s.p, 1), groups: pc.groups, odd, ev: odd ? pc.prob * odd - 1 : null };
}
function renderSlip() {
  const legs = slipLegs();
  $('#fab').hidden = !SLIP.length || state.view === 'multipla'; $('#fabN').textContent = SLIP.length;
  if (state.view !== 'multipla') return;
  const gcount = {}; legs.forEach(l => gcount[l.pr.game.id] = (gcount[l.pr.game.id] || 0) + 1);
  $('#legs').innerHTML = legs.length ? legs.map(({ pr, e, s }) => `<div class="leg">${badge(pr.p.team, 1)}<div class="grow"><b>${esc(pr.p.name)}</b>, <span class="side ${s.side}" style="font-size:11.5px">${sideLb(s.side)} ${fmt(e.line)}</span> ${MARKETS[pr.mk].lb}
      <div class="muted" style="font-size:12.5px">${matchLabel(pr)}, chance ${pct(s.p)}, ${s.odd ? fmt(s.odd, 2) + ' na ' + esc(s.book) : 'sem odd'} ${gcount[pr.game.id] > 1 ? '<span class="tag warn">mesmo jogo</span>' : ''}</div></div>${gradeChip(s.grade)}<button class="x" data-swap="${pr.id}" data-side="${s.side}" aria-label="Trocar perna de ${esc(pr.p.name)}" title="Trocar por outra linha forte">↻</button><button class="x" data-remove="${pr.id}" data-side="${s.side}" aria-label="Remover perna">×</button></div>`).join('')
    : `<div class="empty"><h2>Bilhete vazio</h2><p>Toque em “+ Múltipla” nas props ou use “Montar automaticamente”.</p><a class="btn" href="#props">Ir para as props</a></div>`;
  if (!legs.length) { $('#slipSum').innerHTML = '<h2>Resumo</h2><p class="muted" style="margin:0">A odd, a chance combinada e a melhor casa aparecem aqui.</p>'; return; }
  const c = slipCalc(legs);
  const books = [...new Set(legs.flatMap(l => Object.keys(l.pr.book?.books || {})))];
  const perBook = books.map(b => { let o = 1; for (const l of legs) { const x = l.pr.book?.books?.[b]; const v = x && (l.s.side === 'over' ? x.o : x.u); if (!v || OVR[l.pr.id]?.line != null) return { b, o: null }; o *= v; } return { b, o }; }).sort((a, z) => (z.o || 0) - (a.o || 0));
  const corr = c.groups.filter(g => g.legs > 1);
  $('#slipSum').innerHTML = `<h2>Resumo, ${legs.length} ${legs.length === 1 ? 'perna' : 'pernas'}</h2>
    <div class="sumgrid"><div><small>Odd combinada${help('odd')}</small><b>${c.odd ? fmt(c.odd, 2) : '—'}</b></div><div><small>Chance estimada</small><b>${pct(c.prob, 1)}</b></div><div><small>Odd justa</small><b>${fmt(1 / c.prob, 2)}</b></div><div><small>EV${help('ev')}</small><b class="${c.ev == null ? 'muted' : c.ev >= 0 ? 'pos' : 'neg'}">${sgnPct(c.ev)}</b></div></div>
    ${!c.odd ? '<p class="muted" style="margin:0;font-size:13.5px">Algumas pernas estão sem odd. Digite a odd da sua casa em “✎ Linha” para ver a odd combinada e o EV.</p>' : ''}
    ${corr.length ? `<div class="notice info" style="margin:0"><span class="dot"></span><div><b>Correlação no mesmo jogo${help('corr')}</b> ${corr.map(g => g.n >= 5 ? `Nos ${g.n} jogos em que as ${g.legs} pernas estiveram juntas, a chance conjunta foi ${g.f >= 1 ? '+' : '−'}${fmt(Math.abs(g.f - 1) * 100, 0)}% em relação a pernas independentes.` : 'Poucos jogos juntos para medir a correlação.').join(' ')} Chance sem correlação: ${pct(c.indep, 1)}.</div></div>` : ''}
    ${perBook.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Bilhete inteiro numa casa só</div><div class="booklist">${perBook.map((x, i) => `<div class="${x.o ? (i === 0 ? 'best' : '') : 'na'}"><span>${esc(x.b)}</span><span class="num">${x.o ? fmt(x.o, 2) : 'falta linha'}</span></div>`).join('')}</div></div>` : ''}
    <div class="edbtns" style="margin:0"><button class="btn primary" data-tipslip>Registrar bilhete</button><button class="btn" data-postslip>Gerar post</button><button class="btn" id="clearSlip">Limpar</button></div>`;
}
/* candidatos para múltipla: jogador liberado, odd ≥ 1,30, sem EV negativo; A+/A primeiro, depois B */
function autoCands() {
  const c = PROPS.map(pr => { const e = EVAL[pr.id]; return { pr, e, s: e[e.best] }; }).filter(x => x.pr.p.status === 'ok' && (!x.s.odd || x.s.odd >= 1.3) && (x.s.ev == null || x.s.ev >= 0) && GRADE_ORDER[x.s.grade] >= 2);
  return c.sort((a, b) => (GRADE_ORDER[b.s.grade] >= 3) - (GRADE_ORDER[a.s.grade] >= 3) || !!b.s.odd - !!a.s.odd || score(b) - score(a));
}
const legOdd = x => x.s.odd || x.s.fair || 1;
/* n pernas, ou odd-alvo: soma pernas (uma por jogo) até a odd combinada chegar no alvo, no máximo 8 */
function autoBuild(n, target = null) {
  const pick = [], games = new Set(); let odd = 1;
  for (const x of autoCands()) {
    if (target ? odd >= target || pick.length >= 8 : pick.length >= n) break;
    if (games.has(x.pr.game.id)) continue;
    games.add(x.pr.game.id); pick.push({ id: x.pr.id, side: x.s.side }); odd *= legOdd(x);
  }
  SLIP = pick; store.set('slip2', SLIP); renderSlip();
  if (target) toast(odd >= target ? `Odd ${fmt(odd, 2)} com ${pick.length} pernas (alvo ${fmt(target, 2)})` : `Só deu ${fmt(odd, 2)} com as linhas fortes de hoje`);
  else toast(pick.length < n ? `Só ${pick.length} jogos com linhas fortes hoje` : `Bilhete com ${pick.length} pernas montado`);
}
/* troca uma perna pela melhor alternativa de um jogo que ainda não está no bilhete (ou do mesmo jogo) */
function swapLeg(id, side) {
  const i = SLIP.findIndex(x => x.id === id && x.side === side); if (i < 0) return;
  const cur = BYID[id], used = new Set(SLIP.filter((_, j) => j !== i).map(x => BYID[x.id]?.game.id)), inSlip = new Set(SLIP.map(x => x.id));
  const tried = (swapLeg.tried ||= {}); const key = SLIP.map(x => x.id).join(',');
  const skip = tried[key] ||= new Set([id]);
  const alt = autoCands().find(x => !inSlip.has(x.pr.id) && !skip.has(x.pr.id) && !used.has(x.pr.game.id) && x.pr.p.id !== cur?.p.id);
  if (!alt) return toast('Sem outra linha forte para trocar agora');
  skip.add(alt.pr.id); SLIP[i] = { id: alt.pr.id, side: alt.s.side };
  tried[SLIP.map(x => x.id).join(',')] = skip; store.set('slip2', SLIP); renderSlip();
  toast(`Trocada por ${alt.pr.p.name}, ${sideLb(alt.s.side).toLowerCase()} ${fmt(alt.e.line)} ${MARKETS[alt.pr.mk].lb.toLowerCase()}`);
}

/* ---------------- REGISTRO DE TIPS ---------------- */
function legOf(pr, side, line, odd) {
  const e = EVAL[pr.id], s = e[side];
  return { pid: pr.p.id, name: pr.p.name, team: pr.p.team, opp: pr.opp, home: pr.ctx.isHome, gid: pr.game.id, time: brTime(pr.game.timeUTC), date: SLATE.meta.date, mk: pr.mk, side, line, odd: odd ?? s.odd ?? null,
    p: s.p, pModel: s.pModel, pMkt: s.pMkt, grade: s.grade, ev: s.ev, proj: e.muF, hitsL10: s.hits.L10, hitsH2H: s.hits.H2H };
}
/* meta e stop do dia, em unidades (0 = desligado) */
const todayProfit = () => TIPS.filter(t => t.date === SLATE?.meta.date && t.status !== 'pending').reduce((a, t) => a + (t.profit || 0), 0);
function dayGuard() {
  const p = todayProfit();
  if (CFG.dayStopU > 0 && p <= -CFG.dayStopU) return { kind: 'stop', p, txt: `Stop do dia atingido: ${sgnU(p)} (limite −${uFmt(CFG.dayStopU)}). O plano manda parar por hoje.` };
  if (CFG.dayGoalU > 0 && p >= CFG.dayGoalU) return { kind: 'goal', p, txt: `Meta do dia batida: ${sgnU(p)} (meta ${uFmt(CFG.dayGoalU)}). Proteger o lucro também é estratégia.` };
  return null;
}
const todayUnits = () => TIPS.filter(t => t.date === SLATE?.meta.date && t.status !== 'void').reduce((a, t) => a + t.units, 0);
function openTipModal(id, side) {
  const pr = BYID[id], e = EVAL[id], s = e[side], ov = OVR[id] || {};
  const u = stakeU(s) || 1;
  openModal(`<div class="mhead"><h2>Registrar tip</h2><button class="dclose" data-mclose aria-label="Fechar">×</button></div>
  <div class="mbody">
    <div class="tipsum">${badge(pr.p.team)}<div><b>${esc(pr.p.name)}</b>, ${matchLabel(pr)}<div><span class="side ${side}">${sideLb(side)} ${fmt(e.line)}</span> ${MARKETS[pr.mk].lb}</div></div></div>
    <div class="kvline"><span>Chance ${pct(s.p)}</span><span>Odd justa ${fmt(s.fair, 2)}</span><span>Nota ${s.grade}</span>${s.ev != null ? `<span>EV ${sgnPct(s.ev)}</span>` : ''}</div>
    <div class="edrow"><label>Casa<input id="tBook" list="bookList" value="${esc(ov.book || (s.book && s.book !== 'Sua casa' ? s.book : CFG.defBook))}"></label><label>Linha<input id="tLine" inputmode="decimal" value="${fmt(e.line)}"></label><label>Odd<input id="tOdd" inputmode="decimal" value="${s.odd ? fmt(s.odd, 2) : ''}" placeholder="ex. 1,85"></label></div>
    <div class="edrow" style="margin-top:8px"><label>Stake (u)<input id="tUnits" inputmode="decimal" value="${fmt(u, 2)}"></label><label style="grid-column:span 2">Comentário (opcional)<input id="tNote" maxlength="140" placeholder="ex. matchup + sem o titular"></label></div>
    <p class="muted" style="font-size:12.5px;margin:8px 0 0">Stake sugerida pelo Kelly ${fmt(CFG.kf * 100, 0)}%: <b>${stakeU(s) ? uFmt(stakeU(s)) : 'sem valor na odd atual'}</b>, 1u = ${money(CFG.unit)}, hoje você já registrou ${uFmt(todayUnits())} de ${uFmt(CFG.dayMaxU)} do limite diário.</p>${(() => { const g = dayGuard(); return g ? `<div class="notice ${g.kind === 'stop' ? 'bad' : 'info'}" style="margin:8px 0 0"><span class="dot"></span><div>${g.txt}</div></div>` : ''; })()}
    <div class="edbtns"><button class="btn primary" data-tsave="${id}" data-side="${side}">Salvar tip</button><button class="btn" data-tsave="${id}" data-side="${side}" data-post="1">Salvar e gerar post</button></div>
  </div>`);
  setTimeout(() => $('#tOdd')?.focus(), 50);
}
function saveTipFromModal(id, side, post) {
  const pr = BYID[id]; const line = num($('#tLine').value), odd = num($('#tOdd').value), units = num($('#tUnits').value), book = $('#tBook').value.trim();
  if (line == null) return toast('Linha inválida');
  if (!odd || odd < 1.01) return toast('Informe a odd decimal (ex. 1,85)');
  if (!units || units <= 0) return toast('Informe a stake em unidades');
  // se a linha/odd for diferente, recalcula a chance com ela antes de guardar
  const ovr = { ...(OVR[id] || {}), line, book, [side === 'over' ? 'oOver' : 'oUnder']: odd };
  const e = ev(pr, ovr); const saveEval = EVAL[id]; EVAL[id] = e;
  const leg = legOf(pr, side, line, odd); EVAL[id] = saveEval;
  const t = newTip({ legs: [leg], odd, units, book, note: $('#tNote').value.trim(), date: SLATE.meta.date, unitValue: CFG.unit });
  settleTip(t, RESULTS); TIPS.unshift(t); saveTips(); closeModal();
  const over = todayUnits() > CFG.dayMaxU, g = dayGuard();
  toast(g?.kind === 'stop' ? 'Tip salva, atenção: o stop do dia já foi atingido' : over ? `Tip salva, atenção: ${uFmt(todayUnits())} hoje, acima do seu limite` : 'Tip registrada');
  if (post) openPostModal([t]);
  if (state.view === 'banca') renderBanca();
}
function registerSlip() {
  const legs = slipLegs(); if (!legs.length) return;
  const c = slipCalc(legs);
  const L2 = legs.map(l => legOf(l.pr, l.side, l.e.line, l.s.odd));
  openModal(`<div class="mhead"><h2>Registrar múltipla</h2><button class="dclose" data-mclose aria-label="Fechar">×</button></div><div class="mbody">
    <div class="legs mini">${L2.map(l => `<div class="leg">${badge(l.team, 1)}<div class="grow"><b>${esc(l.name)}</b>, ${legText(l)}</div></div>`).join('')}</div>
    <div class="kvline"><span>Chance ${pct(c.prob, 1)}</span><span>Odd justa ${fmt(1 / c.prob, 2)}</span>${c.ev != null ? `<span>EV ${sgnPct(c.ev)}</span>` : ''}</div>
    <div class="edrow"><label>Casa<input id="tBook" list="bookList" value="${esc(CFG.defBook)}"></label><label>Odd total<input id="tOdd" inputmode="decimal" value="${c.odd ? fmt(c.odd, 2) : ''}"></label><label>Stake (u)<input id="tUnits" inputmode="decimal" value="0,5"></label></div>
    <div class="edrow" style="margin-top:8px;grid-template-columns:1fr"><label>Comentário (opcional)<input id="tNote" maxlength="140"></label></div>
    <div class="edbtns"><button class="btn primary" data-tslip>Salvar</button><button class="btn" data-tslip data-post="1">Salvar e gerar post</button></div></div>`);
  registerSlip.legs = L2; registerSlip.p = c.prob;
}
function saveSlipTip(post) {
  const odd = num($('#tOdd').value), units = num($('#tUnits').value);
  if (!odd || odd < 1.01) return toast('Informe a odd total');
  if (!units || units <= 0) return toast('Informe a stake');
  const t = newTip({ legs: registerSlip.legs, odd, units, book: $('#tBook').value.trim(), note: $('#tNote').value.trim(), date: SLATE.meta.date, unitValue: CFG.unit });
  t.pCombo = registerSlip.p; settleTip(t, RESULTS);
  TIPS.unshift(t); saveTips(); closeModal(); toast('Múltipla registrada');
  if (post) openPostModal([t]);
}

/* ---------------- POSTS (texto + imagem) ---------------- */
let POST = null;
function picksAsTips(rows) {
  return rows.map(x => { const leg = legOf(x.pr, x.s.side, x.e.line, x.s.odd); return { kind: 'single', date: SLATE.meta.date, legs: [leg], odd: x.s.odd || x.s.fair, fairOnly: !x.s.odd, units: stakeU(x.s) || 1, book: x.s.odd ? x.s.book : '' }; });
}
function openPostModal(tips, title, results = null) {
  POST = { results, tips, title: title || (tips.length > 1 && tips.every(t => t.kind === 'single') ? 'Card do dia' : tips[0]?.kind === 'multi' ? 'Múltipla do dia' : 'Tip do dia'), format: store.get('postfmt', 'feed') };
  openModal(`<div class="mhead"><h2>Gerar post</h2><button class="dclose" data-mclose aria-label="Fechar">×</button></div>
  <div class="mbody post">
    <div class="seg" id="pFmt" style="max-width:260px"><button data-v="feed">Feed 4:5</button><button data-v="story">Story 9:16</button></div>
    <div class="postgrid"><div class="cv"><canvas id="pCanvas" aria-label="Prévia do cartão"></canvas></div>
    <div class="ptext"><label class="flabel" for="pText">Texto para Telegram / WhatsApp</label><textarea id="pText" rows="14"></textarea>
      <div class="edbtns"><button class="btn primary" data-pcopy>Copiar texto</button><button class="btn" data-pdown>Baixar imagem</button>${navigator.canShare ? '<button class="btn" data-pshare>Compartilhar</button>' : ''}<button class="btn" data-pai hidden>Legenda com IA</button></div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">O aviso do Ministério da Fazenda ocupa 10% da imagem (Portaria SPA/MF 1.231/2024, alterada pela 1.964/2026). Evite juntar link ou código de casa à análise e nunca prometa ganho. Marca, @ e aviso ficam em Banca → Configurações.</p></div></div>
  </div>`, 'wide');
  $('#pText').value = results ? resultsText(results.S, results.tips, { cfg: CFG, label: results.label.toLowerCase() }) : postText(tips, { cfg: CFG, title: POST.title, date: SLATE.meta.date });
  if (results) { $('#mbox h2').textContent = 'Card de resultados'; $('[data-pai]')?.remove(); }
  $$('#pFmt button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === POST.format));
  samplePromise.then(sm => { const b = $('[data-pai]'); if (b && sm) b.hidden = false; });
  drawPost();
}
async function drawPost() { const c = $('#pCanvas'); if (!c || !POST) return; if (POST.results) await drawResults(c, POST.results.S, POST.results.tips, { cfg: CFG, format: POST.format, label: POST.results.label }); else await drawCard(c, POST.tips, { cfg: CFG, format: POST.format, date: SLATE.meta.date, title: POST.title }); }
function openResultsModal() {
  const from = bancaFrom === 'all' ? null : new Date(Date.parse((SLATE?.meta.date || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z') - (+bancaFrom - 1) * 864e5).toISOString().slice(0, 10);
  const S = summarize(TIPS, { from, kind: bancaKind });
  const tips = TIPS.filter(t => t.status !== 'pending' && (!from || t.date >= from) && (bancaKind === 'all' || t.kind === bancaKind)).sort((a, b) => (b.date + (b.ts || '')).localeCompare(a.date + (a.ts || '')));
  const label = bancaFrom === 'all' ? 'Geral' : `Últimos ${bancaFrom} dias`;
  openPostModal([], 'Resultados', { S, tips, label });
}
function canvasBlob() { return new Promise(r => $('#pCanvas').toBlob(r, 'image/png')); }
async function aiCaption() {
  const sm = await samplePromise; if (!sm || !POST) return;
  const btn = $('[data-pai]'); btn.disabled = true; const ta = $('#pText'); const base = postText(POST.tips, { cfg: CFG, title: POST.title, date: SLATE.meta.date });
  const prompt = `Você escreve legendas para um tipster de NBA no Brasil. Reescreva o post abaixo em português do Brasil, curto e direto, com no máximo 2 emojis por linha, mantendo exatamente jogadores, linhas, odds e stakes. Acrescente UMA frase de justificativa por tip usando só os números fornecidos. Proibido: prometer lucro, "green garantido", tratar aposta como renda ou investimento, incentivar recuperar perdas, pedir para apostar agora. Termine com a linha de aviso exatamente como está.\n\n${base}`;
  ta.value = 'Escrevendo…';
  try { const { text } = await sm(prompt, { onText: ({ text }) => { ta.value = text; } }); ta.value = text; }
  catch (err) { ta.value = base; toast(err?.code === 'rate_limited' ? 'Muitas chamadas seguidas, tente já já' : 'Não deu para gerar agora'); }
  finally { btn.disabled = false; }
}

/* ---------------- IMPORTAR LINHAS ---------------- */
function openImportModal() {
  openModal(`<div class="mhead"><h2>Importar linhas da sua casa</h2><button class="dclose" data-mclose aria-label="Fechar">×</button></div>
  <div class="mbody">
    <p class="muted" style="margin:0 0 8px;font-size:13.5px">Uma prop por linha: <code>Jogador; mercado; linha; odd mais; odd menos</code>. Mercado em código (PTS, REB, AST, 3PM, PRA, PR, PA, RA, STL, BLK, SB, TOV…) ou em português (“pontos”, “rebotes + assistências”). Dica: peça ao Claude com o Claude in Chrome para abrir a página de props da sua casa e devolver neste formato.</p>
    <div class="edrow" style="grid-template-columns:1fr 2fr"><label>Casa<input id="iBook" list="bookList" value="${esc(CFG.defBook)}"></label><label>&nbsp;<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">As linhas valem só para hoje e ficam neste aparelho.</span></label></div>
    <textarea id="iText" rows="10" placeholder="Jalen Brunson; PTS; 26,5; 1,85; 1,95&#10;Karl-Anthony Towns; rebotes; 12,5; 1,90; 1,90&#10;Josh Hart; PRA; 26,5; 1,83; 1,97"></textarea>
    <div id="iOut" class="muted" style="font-size:13px"></div>
    <div class="edbtns"><button class="btn" data-iprev>Conferir</button><button class="btn primary" data-iapply>Importar</button></div>
  </div>`, 'wide');
}
function importPreview() {
  const r = parseImport($('#iText').value, SLATE.players);
  $('#iOut').innerHTML = `<b>${r.rows.length}</b> reconhecidas${r.errors.length ? `, <span class="neg">${r.errors.length} com problema</span><ul>${r.errors.slice(0, 8).map(e => `<li>${esc(e.raw)} — ${esc(e.why)}</li>`).join('')}</ul>` : ''}`;
  return r;
}
function importApply() {
  const r = importPreview(); if (!r.rows.length) return toast('Nada para importar');
  const book = $('#iBook').value.trim() || 'Sua casa'; let n = 0, miss = 0;
  for (const x of r.rows) {
    const id = x.pid + '-' + x.mk;
    if (!BYID[id]) { miss++; continue; }
    OVR[id] = { line: x.line, oOver: x.oOver, oUnder: x.oUnder, book }; EVAL[id] = ev(BYID[id], OVR[id]); n++;
  }
  store.set('ovr:' + SLATE.meta.date, OVR); closeModal();
  F = Object.assign({}, DEF, { view: F.view }, PRESETS.find(p => p.id === 'mine').f, { preset: 'mine' });
  location.hash = 'props'; renderProps();
  toast(`${n} linhas importadas${miss ? `, ${miss} fora da lista do modelo` : ''}`);
}

/* ---------------- BANCA ---------------- */
function curveSVG(curve) {
  if (curve.length < 3) return '<p class="muted" style="margin:0">O gráfico aparece com pelo menos 2 tips liquidadas.</p>';
  const W = 720, H = 220, pl = 44, pr = 14, pt = 14, pb = 26;
  const ys = curve.map(c => c.u); const mn = Math.min(0, ...ys), mx = Math.max(0, ...ys); const span = (mx - mn) || 1;
  const x = i => pl + (W - pl - pr) * i / (curve.length - 1), y = v => pt + (H - pt - pb) * (1 - (v - mn) / span);
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 6 ? 2 : 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução da banca em unidades">`;
  for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pl - 6}" y="${y(t) + 3}" text-anchor="end">${t > 0 ? '+' : ''}${t}u</text>`;
  s += `<line class="zero" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>`;
  const pts = curve.map((c, i) => `${x(i).toFixed(1)},${y(c.u).toFixed(1)}`).join(' ');
  const last = curve.at(-1).u;
  s += `<polygon class="area ${last >= 0 ? 'up' : 'down'}" points="${pl},${y(0)} ${pts} ${x(curve.length - 1)},${y(0)}"/><polyline class="eq ${last >= 0 ? 'up' : 'down'}" points="${pts}"/>`;
  s += `<text class="axis" x="${pl}" y="${H - 6}">${shortDate(curve[0].date)}</text><text class="axis" x="${W - pr}" y="${H - 6}" text-anchor="end">${shortDate(curve.at(-1).date)}</text>`;
  return s + '</svg>';
}
const stTag = s => ({ green: '<span class="tag good">Green</span>', red: '<span class="tag bad">Red</span>', void: '<span class="tag">Devolvida</span>', pending: '<span class="tag warn">Aberta</span>', halfgreen: '<span class="tag good">½ Green</span>', halfred: '<span class="tag bad">½ Red</span>' }[s] || s);
function tipRow(t) {
  const l = t.legs[0]; const clv = clvOf(t);
  const what = t.kind === 'multi' ? `<b>Múltipla ${t.legs.length}x</b><div class="muted">${t.legs.map(x => esc(lastName(x.name)) + ' ' + (x.side === 'over' ? '+' : '−') + fmt(x.line) + ' ' + mkShort(x.mk) + (x.status && x.status !== 'pending' ? (x.status === 'green' ? ' ✓' : x.status === 'red' ? ' ✗' : ' ↺') : '')).join(', ')}</div>`
    : `<b>${esc(l.name)}</b> <span class="muted">${l.team} ${l.home === false ? '@' : 'vs'} ${l.opp}</span><div><span class="side ${l.side}" style="font-size:11px">${sideLb(l.side)} ${fmt(l.line)}</span> ${MARKETS[l.mk]?.lb || l.mk}${l.value != null ? ` <span class="muted">· fez ${l.value}</span>` : ''}</div>`;
  let risk = '';
  if (t.status === 'pending' && SLATE && t.date === SLATE.meta.date) for (const x of t.legs) {
    const cur = SLATE.players.find(p => p.id === x.pid), pr = BYID[x.pid + '-' + x.mk];
    if (cur && cur.status !== 'ok') risk += `<span class="tag bad">${esc(lastName(x.name))} ${ST_LB[cur.status] || cur.status}</span> `;
    if (pr?.book && pr.book.line !== x.line) { const good = x.side === 'over' ? pr.book.line > x.line : pr.book.line < x.line; risk += `<span class="tag ${good ? 'good' : 'warn'}">linha agora ${fmt(pr.book.line)}</span> `; }
  }
  return `<tr><td class="muted">${shortDate(t.date)}</td><td class="wrapcell">${what}${risk ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${risk}</div>` : ''}${t.note ? `<div class="muted" style="font-size:12px">${esc(t.note)}</div>` : ''}</td><td class="r num">${fmt(t.odd, 2)}<div class="muted" style="font-size:11px">${esc(t.book)}</div></td><td class="r num">${uFmt(t.units)}</td>
    <td class="r num ${clv == null ? 'muted' : clv >= 0 ? 'pos' : 'neg'}" title="Odd pega × chance justa no fechamento">${clv == null ? '—' : sgnPct(clv)}</td><td>${stTag(t.status)}</td><td class="r num ${t.profit > 0 ? 'pos' : t.profit < 0 ? 'neg' : ''}">${t.profit == null ? '—' : sgnU(t.profit)}</td>
    <td class="nowrap"><select class="mini" data-tstatus="${t.id}" aria-label="Mudar resultado"><option value="">Resultado…</option><option value="auto">Automático</option><option value="green">Green</option><option value="red">Red</option><option value="void">Devolvida</option><option value="halfgreen">½ Green</option><option value="halfred">½ Red</option></select> <button class="editbtn" data-tpost="${t.id}" title="Gerar post">Post</button> <button class="x" data-tdel="${t.id}" aria-label="Apagar tip">×</button></td></tr>`;
}
/* calib = true: mostra a chance prevista ao lado do acerto real (a nota ou a faixa está calibrada?) */
function breakdown(title, obj, calib = false) {
  const rows = Object.entries(obj || {}); if (!rows.length) return '';
  const pc = a => a.pred == null || a.hit == null ? '' : a.hit >= a.pred - .03 ? 'pos' : a.hit < a.pred - .08 ? 'neg' : '';
  return `<section class="panel third"><h3>${title}${calib ? help('prevx') : ''}</h3><div class="tablewrap" style="border:0"><table class="splits"><thead><tr><th></th><th class="r">Tips</th>${calib ? '<th class="r">Previsto</th>' : ''}<th class="r">Acerto</th><th class="r">Lucro</th><th class="r">ROI</th></tr></thead><tbody>${rows.map(([k, a]) => `<tr><td>${esc(k)}</td><td class="r num">${a.n}</td>${calib ? `<td class="r num">${pct(a.pred)}</td>` : ''}<td class="r num ${calib ? pc(a) : ''}">${pct(a.hit)}</td><td class="r num ${a.profit >= 0 ? 'pos' : 'neg'}">${sgnU(a.profit)}</td><td class="r num ${a.roi >= 0 ? 'pos' : 'neg'}">${sgnPct(a.roi)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function renderBanca() {
  let changed = false;
  for (const t of TIPS) if (t.status === 'pending' && !t.manual) { settleTip(t, RESULTS); if (t.status !== 'pending') changed = true; }
  if (changed) saveTips();
  const from = bancaFrom === 'all' ? null : new Date(Date.parse((SLATE?.meta.date || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z') - (+bancaFrom - 1) * 864e5).toISOString().slice(0, 10);
  const S = summarize(TIPS, { from, kind: bancaKind });
  const allS = summarize(TIPS);
  const bankNow = CFG.bank + (allS.profit || 0) * CFG.unit;
  const open = TIPS.filter(t => t.status === 'pending'), done = TIPS.filter(t => t.status !== 'pending' && (!from || t.date >= from) && (bancaKind === 'all' || t.kind === bancaKind));
  const kpi = (lb, v, sub, cls = '', h = '') => `<div><small>${lb}${h ? help(h) : ''}</small><b class="${cls}">${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const guard = dayGuard(), tp = todayProfit();
  $('#bancaView').innerHTML = `
  ${guard ? `<div class="notice ${guard.kind === 'stop' ? 'bad' : 'info'}" role="status"><span class="dot"></span><div><b>${guard.kind === 'stop' ? 'Stop do dia' : 'Meta do dia'}</b> ${guard.txt.replace(/^[^:]+: /, '')}</div></div>` : (CFG.dayGoalU > 0 || CFG.dayStopU > 0) && SLATE ? `<div class="notice info"><span class="dot"></span><div><b>Hoje ${sgnU(tp)}</b>${CFG.dayGoalU > 0 ? `, meta ${uFmt(CFG.dayGoalU)}` : ''}${CFG.dayStopU > 0 ? `, stop −${uFmt(CFG.dayStopU)}` : ''}</div></div>` : ''}
  <section class="panel"><div class="bhead"><h2>Desempenho</h2><span class="grow"></span>${done.length ? '<button class="btn sm" data-results>Card de resultados</button>' : ''}
    <div class="seg" id="bFrom" style="width:250px"><button data-v="7">7 dias</button><button data-v="30">30 dias</button><button data-v="all">Tudo</button></div>
    <div class="seg" id="bKind" style="width:250px"><button data-v="all">Todas</button><button data-v="single">Simples</button><button data-v="multi">Múltiplas</button></div></div>
    <div class="bkpis">
      ${kpi('Banca atual', money(bankNow), `inicial ${money(CFG.bank)}`)}
      ${kpi('Lucro', sgnU(S.profit), money(S.profit * CFG.unit), S.profit >= 0 ? 'pos' : 'neg')}
      ${kpi('ROI (yield)', sgnPct(S.roi), `${fmt(S.staked, 2)}u apostadas`, S.roi == null ? '' : S.roi >= 0 ? 'pos' : 'neg', 'roi')}
      ${kpi('Acerto', pct(S.hit, 1), `${S.green} green, ${S.red} red${S.void ? ', ' + S.void + ' devolvidas' : ''}${S.pred ? '. Previsto ' + pct(S.pred) : ''}`)}
      ${kpi('CLV médio', sgnPct(S.clv), S.nClv ? `bateu o fechamento em ${pct(S.beatClose)}` : 'precisa de odds das casas', S.clv == null ? '' : S.clv >= 0 ? 'pos' : 'neg', 'clv')}
      ${kpi('Odd média', fmt(S.avgOdd, 2), `maior queda ${sgnU(S.drawdown)}`)}
    </div>
    <div class="chart eqc">${curveSVG(S.curve)}</div>
    <p class="muted" style="font-size:12.5px;margin:6px 0 0">CLV (closing line value): sua odd comparada à chance justa do mercado na última coleta antes do jogo. CLV positivo de forma consistente é o melhor sinal de que a análise tem vantagem, mesmo numa fase de reds.</p>
  </section>
  <section class="panel"><div class="bhead"><h2>Tips em aberto <small>${open.length}, ${uFmt(open.reduce((a, t) => a + t.units, 0))} em jogo</small></h2><span class="grow"></span>${open.length ? '<button class="btn sm" data-postopen>Post das abertas</button>' : ''}</div>
    ${open.length ? `<div class="tablewrap"><table class="tips"><thead><tr><th>Data</th><th>Tip</th><th class="r">Odd</th><th class="r">Stake</th><th class="r">CLV</th><th>Status</th><th class="r">Lucro</th><th></th></tr></thead><tbody>${open.map(tipRow).join('')}</tbody></table></div>` : '<p class="muted">Nenhuma tip em aberto. Toque em “Registrar” num cartão de prop.</p>'}
  </section>
  <section class="panel"><div class="bhead"><h2>Histórico <small>${done.length} liquidadas</small></h2><span class="grow"></span><button class="btn sm" data-csv>Exportar CSV</button></div>
    ${done.length ? `<div class="tablewrap"><table class="tips"><thead><tr><th>Data</th><th>Tip</th><th class="r">Odd</th><th class="r">Stake</th><th class="r">CLV</th><th>Status</th><th class="r">Lucro</th><th></th></tr></thead><tbody>${done.slice(0, 200).map(tipRow).join('')}</tbody></table></div>` : '<p class="muted">As tips são liquidadas sozinhas quando o coletor baixa os resultados (dia seguinte). Também dá para marcar à mão.</p>'}
  </section>
  <div class="trends">${breakdown('Por mercado', S.by.market)}${breakdown('Por nota', S.by.grade)}${breakdown('Por faixa de chance', S.by.pband, true)}${breakdown('Por faixa de odd', S.by.band)}${breakdown('Por lado', S.by.side)}${breakdown('Por casa', S.by.book)}</div>
  <section class="panel"><h2>Configurações</h2>
    <div class="cfg">
      <label>Banca inicial (R$)<input data-cfg="bank" inputmode="decimal" value="${fmt(CFG.bank, 2)}"></label>
      <label>Valor da unidade (R$)<input data-cfg="unit" inputmode="decimal" value="${fmt(CFG.unit, 2)}"></label>
      <label>Kelly fracionado<select data-cfg="kf">${[[.1, '1/10 (conservador)'], [.2, '1/5'], [.25, '1/4 (padrão)'], [.33, '1/3'], [.5, '1/2 (agressivo)']].map(([v, l]) => `<option value="${v}" ${CFG.kf === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Stake máxima por tip (u)<input data-cfg="maxU" inputmode="decimal" value="${fmt(CFG.maxU, 2)}"></label>
      <label>Limite diário (u)<input data-cfg="dayMaxU" inputmode="decimal" value="${fmt(CFG.dayMaxU, 2)}"></label>
      <label>Meta do dia (u, 0 = sem meta)<input data-cfg="dayGoalU" inputmode="decimal" value="${fmt(CFG.dayGoalU, 2)}"></label>
      <label>Stop do dia (u, 0 = sem stop)<input data-cfg="dayStopU" inputmode="decimal" value="${fmt(CFG.dayStopU, 2)}"></label>
      <label>Peso do modelo vs mercado<select data-cfg="w">${[[1, '100% modelo'], [.7, '70% modelo'], [.55, '55% modelo (padrão)'], [.4, '40% modelo'], [.25, '25% modelo']].map(([v, l]) => `<option value="${v}" ${CFG.w === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Calibração automática<select data-cfg="calib"><option value="true" ${CFG.calib ? 'selected' : ''}>Ligada (usa o backtest)</option><option value="false" ${!CFG.calib ? 'selected' : ''}>Desligada</option></select></label>
      <label>Casa padrão<input data-cfg="defBook" list="bookList" value="${esc(CFG.defBook)}"></label>
      <label class="span2">Casas que você usa (separadas por vírgula)<input data-cfg="books" value="${esc(CFG.books)}"></label>
      <label>Marca nos posts<input data-cfg="brand" value="${esc(CFG.brand)}"></label>
      <label>@ / canal<input data-cfg="handle" value="${esc(CFG.handle)}" placeholder="@seucanal"></label>
      <label>Aviso nos posts<select data-cfg="warn">${Object.entries(WARNINGS).map(([k, v]) => `<option value="${k}" ${CFG.warn === k ? 'selected' : ''}>${esc(v.replace('Ministério da Fazenda adverte: ', ''))}</option>`).join('')}</select></label>
      <label>Números nos posts<select data-cfg="showStats"><option value="true" ${CFG.showStats ? 'selected' : ''}>Mostrar L10/H2H/projeção</option><option value="false" ${!CFG.showStats ? 'selected' : ''}>Só a tip</option></select></label>
    </div>
    <p class="muted" style="font-size:12.5px">Stake = fração de Kelly × vantagem ÷ (odd − 1) × banca, em unidades, arredondada a 0,25u. “Peso do modelo” define quanto a projeção própria pesa contra o consenso sem margem das casas; usar o mercado como âncora corta EVs inflados.</p>
    <div class="cfgsec"><h3>Mesmas tips no celular e no computador</h3>
      <p class="muted" style="font-size:13.5px;margin:4px 0 0;max-width:80ch">Crie em github.com/settings/tokens um token (clássico) só com a permissão <b>gist</b>, cole aqui e toque em “Sincronizar agora”: o app cria um gist privado com as suas tips. No outro aparelho, cole o mesmo token e o mesmo código do gist. O token fica salvo só neste aparelho.</p>
      <div class="cfg"><label class="span2">Token do GitHub<input data-cfg="ghToken" type="password" autocomplete="off" value="${esc(CFG.ghToken || '')}" placeholder="ghp_…"></label><label class="span2">Código do gist<input data-cfg="gistId" autocomplete="off" value="${esc(CFG.gistId || '')}" placeholder="criado na primeira sincronização"></label></div>
      <div class="edbtns" style="margin-top:0;align-items:center"><button class="btn primary" data-sync>Sincronizar agora</button><span class="syncstate">${syncInfo ? (syncInfo.ok ? `<b>Sincronizado</b> em ${new Date(syncInfo.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : `Última tentativa falhou: ${esc(syncInfo.err)}`) : 'Ainda não sincronizado'}</span></div>
    </div>
    <div class="edbtns cfgsec"><button class="btn" data-backup>Baixar backup (JSON)</button><label class="btn" style="cursor:pointer">Restaurar backup<input type="file" accept="application/json" data-restore hidden></label></div>
  </section>`;
  $$('#bFrom button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === bancaFrom));
  $$('#bKind button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === bancaKind));
}
function setCfg(k, raw) {
  let v = raw;
  if (['bank', 'unit', 'maxU', 'dayMaxU'].includes(k)) { v = num(raw); if (v == null || v <= 0) return toast('Valor inválido'); }
  if (['dayGoalU', 'dayStopU'].includes(k)) { v = num(raw) ?? 0; if (v < 0) return toast('Valor inválido'); }
  if (['kf', 'w'].includes(k)) v = +raw;
  if (['calib', 'showStats'].includes(k)) v = raw === 'true';
  if (['ghToken', 'gistId', 'brand', 'handle', 'defBook', 'books'].includes(k)) v = String(raw).trim();
  CFG[k] = v; store.set('cfg', CFG);
  if (k === 'calib') rebuild();
  if (k === 'w') { for (const p of PROPS) EVAL[p.id] = ev(p, OVR[p.id]); }
  if (k === 'books') fillBooks();
  if (['dayGoalU', 'dayStopU'].includes(k) && state.view === 'banca') renderBanca();
  if (k === 'brand') $('#brandName').textContent = CFG.brand || 'Black House';
  toast('Configuração salva');
}
function fillBooks() { $('#bookList').innerHTML = booksList().map(b => `<option value="${esc(b)}">`).join(''); }

/* ---------------- GUIA ---------------- */
function renderGuide() {
  const m = SLATE.meta, bt = BT;
  const calTable = bt ? `<div class="tablewrap" style="margin-top:10px"><table class="splits"><thead><tr><th>Mercado</th><th class="r">Linhas</th><th class="r">Previsto</th><th class="r">Real</th><th class="r">Ajuste</th><th class="r">Retorno a ${fmt(bt.price, 2)}</th></tr></thead><tbody>${Object.entries(bt.markets).sort((a, b) => b[1].roi - a[1].roi).map(([mk, a]) => `<tr><td>${MARKETS[mk]?.lb || mk}</td><td class="r">${a.n.toLocaleString('pt-BR')}</td><td class="r">${pct(a.pred, 1)}</td><td class="r ${a.real >= a.pred - .01 ? 'pos' : 'neg'}">${pct(a.real, 1)}</td><td class="r">×${fmt(a.k, 2)}</td><td class="r ${a.roi >= 0 ? 'pos' : 'neg'}">${sgnPct(a.roi)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const buckets = bt ? Object.entries(bt.buckets).map(([b, a]) => `<tr><td>${pct(+b)}${+b >= .7 ? ' ou mais' : ' a ' + pct(+b + .05)}</td><td class="r">${a.n.toLocaleString('pt-BR')}</td><td class="r">${pct(a.pred, 1)}</td><td class="r">${pct(a.real, 1)}</td></tr>`).join('') : '';
  $('#guideView').innerHTML = `
  <section class="panel" id="usar"><h2>Usar no computador e no celular</h2>
    <p>O app é um site que vira aplicativo: você instala uma vez e ele abre como app, em tela cheia, no celular e no computador. Os dados do dia chegam sozinhos pela automação do GitHub.</p>
    <div class="devices">
      <div><h3>Android</h3><ol class="steps"><li>Abra o link do app no Chrome.</li><li>Toque em “Instalar app” no topo, ou no menu ⋮ e depois em “Instalar app”.</li><li>O ícone aparece na tela inicial.</li></ol></div>
      <div><h3>iPhone</h3><ol class="steps"><li>Abra o link no Safari.</li><li>Toque em Compartilhar e depois em “Adicionar à Tela de Início”.</li><li>Abra pelo ícone: fica em tela cheia, sem a barra do navegador.</li></ol></div>
      <div><h3>Computador</h3><ol class="steps"><li>Abra o link no Chrome ou no Edge.</li><li>Clique em “Instalar app” no topo ou no ícone de instalar na barra de endereço.</li><li>O app abre em janela própria e fica no menu Iniciar ou no Dock.</li></ol></div>
    </div>
    <h3 style="margin-top:18px">Mesmas tips nos dois aparelhos</h3>
    <p>Cada aparelho guarda as tips no próprio navegador. Para ver as mesmas tips no celular e no computador, ligue a sincronização em Banca → Configurações: ela usa um gist privado na sua conta do GitHub (grátis). Sem isso, use “Baixar backup” num aparelho e “Restaurar backup” no outro.</p>
    <h3 style="margin-top:18px">Ainda não tem o link do app?</h3>
    <ol class="steps"><li>Crie uma conta grátis em github.com e um repositório novo.</li><li>Envie os arquivos do projeto (botão “Add file” e depois “Upload files”).</li><li>Em Settings → Pages, escolha “GitHub Actions”. Em Settings → Actions → General, marque “Read and write permissions”.</li><li>Em Actions, rode “Atualizar dados e publicar”. O link aparece em Settings → Pages; é ele que você abre no celular e no computador.</li></ol>
  </section>
  <section class="panel"><h2>O que cada número quer dizer</h2>
    <p>Os mesmos textos aparecem quando você toca no “?” ao lado de cada número.</p>
    <dl class="gloss">${Object.values(HELP).map(([t, d, ex]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}${ex ? `<span class="ex">${esc(ex)}</span>` : ''}</dd></div>`).join('')}</dl>
  </section>
  <section class="panel half"><h2>Dados de hoje</h2><dl class="kv">
    <dt>Situação</dt><dd>${m.demo ? '<span class="tag warn">Demonstração</span>' : '<span class="tag good">Dados reais</span>'}</dd>
    <dt>Rodada</dt><dd>${brDate(m.date)}, temporada ${esc(m.season)}</dd>
    <dt>Atualizado</dt><dd>${new Date(m.generatedAt).toLocaleString('pt-BR')}</dd>
    <dt>Jogos</dt><dd>${SLATE.games.length}</dd><dt>Jogadores</dt><dd>${SLATE.players.length}</dd>
    <dt>Linhas</dt><dd>${PROPS.length}, sendo ${SLATE.lines.length} com odd de casa e ${PROPS.filter(p => p.mkt).length} com preço de mercado</dd>
    <dt>Resultados</dt><dd>${RESULTS ? `${RESULTS.dates.length} dias, de ${shortDate(RESULTS.dates[0] || '')} a ${shortDate(RESULTS.dates.at(-1) || '')}` : 'sem resultados baixados'}</dd>
    <dt>Calibração</dt><dd>${SLATE.calib ? (CFG.calib ? 'ligada' : 'desligada nas configurações') : 'sem backtest'}</dd>
    ${m.usage ? `<dt>Gasto desta coleta</dt><dd>${Object.entries(m.usage.requests || {}).map(([h, n]) => `${esc(h.replace(/^(www|api|site\.api|cdn|external-api)\./, ''))}: ${n}`).join(', ') || 'nenhuma requisição'}${m.usage.odds?.oddsapi ? `<br>The Odds API: ${m.usage.odds.oddsapi.credits} créditos agora, restam ${m.usage.odds.oddsapi.remaining ?? '?'} (${esc(m.usage.odds.oddsapi.mode)})` : ''}${m.usage.odds?.sgo ? `<br>SportsGameOdds: ${m.usage.odds.sgo.calls} chamadas hoje, ${m.usage.odds.sgo.objectsMonth} objetos no mês` : ''}</dd>` : ''}
    ${Object.entries(m.sources || {}).map(([k, v]) => `<dt>${esc({ schedule: 'Calendário', boxscores: 'Estatísticas', injuries: 'Lesões', gameLines: 'Handicap e total', odds: 'Odds de props', lineups: 'Quintetos', calib: 'Backtest' }[k] || k)}</dt><dd>${esc(v)}</dd>`).join('')}
  </dl>${(m.warnings || []).length ? `<h3 style="margin-top:14px">Avisos da coleta</h3><ul>${m.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</section>
  <section class="panel half"><h2>Atualizar pelo computador</h2>
    <p>Opcional: a automação do GitHub já faz isso 5 vezes ao dia (10h, 15h, 18h30, 20h30 e 22h). Para rodar na sua máquina, com Node.js 20 ou mais novo, dentro da pasta do projeto:</p>
    <pre class="cmd">npm run update     # coleta os dados reais do dia
npm run backtest   # refaz a calibração
npm run serve      # abre em http://localhost:8080</pre>
    <p>Odds reais de props: crie uma chave na The Odds API e salve como <code>ODDS_API_KEY</code>. Para gastar menos créditos, use <code>ODDS_UTC_HOURS</code> (ex. <code>21,23</code>).</p></section>
  ${bt ? `<section class="panel"><h2>Onde o modelo acerta${help('calib')}</h2>
    <p>${bt.demo ? 'Dados simulados. ' : ''}O modelo foi refeito em cada um dos últimos ${bt.days} dias (${shortDate(bt.from)} a ${shortDate(bt.to)}) usando só o que se sabia antes do jogo, em ${bt.total.toLocaleString('pt-BR')} linhas. “Previsto” é a chance média do lado escolhido; “Real” é quanto bateu. Real abaixo do previsto = confiante demais, e o ajuste corrige. O retorno simula todas as linhas a odd ${fmt(bt.price, 2)}: serve para comparar mercados, não é promessa.</p>
    ${calTable}
    <h3 style="margin-top:16px">Por faixa de chance</h3><div class="tablewrap" style="max-width:560px;margin-top:8px"><table class="splits"><thead><tr><th>Faixa</th><th class="r">Linhas</th><th class="r">Previsto</th><th class="r">Real</th></tr></thead><tbody>${buckets}</tbody></table></div>
  </section>` : ''}
  <section class="panel"><h2>Como o modelo calcula</h2>
    <ul>
      <li><b>Ritmo por minuto</b> de cada estatística (25% últimos 5 jogos, 35% últimos 10, 40% últimos 20) vezes os <b>minutos esperados</b>, com cortes para back-to-back, 3º jogo em 4 noites, risco de lavada e dúvida.</li>
      <li><b>Quinteto do dia</b>: reserva previsto como titular ganha os minutos que costuma ter como titular, e o contrário.</li>
      <li><b>Desfalques</b>: usa os jogos reais em que o colega que está fora não jogou.</li>
      <li><b>Defesa</b> do adversário contra a posição (até ±12%) e <b>ritmo do jogo</b> (posses e total da casa).</li>
      <li><b>Mercado</b>: as odds de cada casa sem a margem, numa média que pesa mais as casas afiadas. A chance final mistura a projeção própria com a do mercado (peso ajustável em Banca).</li>
      <li><b>Stake</b>: Kelly fracionado sobre a banca, em unidades, com teto por tip e limite diário.</li>
    </ul></section>
  <section class="panel"><h2>Claude como assistente</h2>
    <ul>
      <li><b>Análise e legenda com IA</b>: com o app aberto dentro do Claude, a ficha do jogador e a tela de post ganham botões que pedem uma análise ou uma legenda, usando só os números da tela.</li>
      <li><b>Linhas das casas brasileiras</b>: com a extensão Claude in Chrome, peça ao Claude para abrir a página de props da sua casa e devolver no formato <code>Jogador; mercado; linha; odd mais; odd menos</code>. Depois cole em “Importar linhas da casa”.</li>
    </ul></section>`;
}

/* ---------------- primeiros passos ---------------- */
function renderOnboard() {
  const el = $('#onboard'); if (!el) return;
  if (store.get('ob1', false)) { el.innerHTML = ''; return; }
  el.innerHTML = `<section class="onboard" aria-labelledby="obT"><button class="ob-close" data-obclose>Entendi</button>
    <h2 id="obT">Como usar em 4 passos</h2><p>Leva um minuto. Tudo isso fica explicado também no Guia.</p>
    <ol>
      <li><b>Comece pelo topo</b>As props já vêm ordenadas pelas melhores do dia. Os atalhos acima da lista filtram por ângulo: valor contra o mercado, sem o colega, sequência.</li>
      <li><b>Leia a régua</b>Verde é a chance. O traço é o que a odd cobra. Verde passando do traço quer dizer valor.<div class="ob-demo">${valbar({ p: .58, odd: 1.9, fair: 1 / .58 })}</div></li>
      <li><b>Confira na sua casa</b>Toque em “Minha linha” ou importe as linhas da Betano, Bet365 e outras. O app recalcula chance, EV e stake.</li>
      <li><b>Registre e poste</b>“Registrar” guarda a tip com a stake. Em Banca você acompanha o resultado e o ROI e gera o post com a sua marca.</li>
    </ol></section>`;
}

/* ---------------- sincronização das tips entre aparelhos (gist privado do GitHub) ---------------- */
const GIST_FILE = 'black-house-tips.json';
let DELETED = store.get('deleted', []), syncTimer = null, syncInfo = store.get('syncInfo', null);
async function gh(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, { ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + CFG.ghToken, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) throw new Error(r.status === 401 ? 'token inválido ou vencido' : r.status === 404 ? 'gist não encontrado (confira o código)' : r.status === 403 ? 'token sem permissão de gist' : 'GitHub respondeu ' + r.status);
  return r.json();
}
function mergeTips(remote) {
  const del = new Set([...DELETED, ...(remote?.deleted || [])]);
  const map = new Map();
  for (const t of [...(remote?.tips || []), ...TIPS]) { if (del.has(t.id)) continue; const cur = map.get(t.id); if (!cur || (t.upd || t.ts) > (cur.upd || cur.ts)) map.set(t.id, t); }
  TIPS = [...map.values()].sort((a, b) => (b.date + b.ts).localeCompare(a.date + a.ts));
  DELETED = [...del].slice(-1000);
  store.set('tips', TIPS); store.set('deleted', DELETED);
}
async function syncNow(quiet) {
  if (!CFG.ghToken) { if (!quiet) toast('Cole o token do GitHub primeiro'); return; }
  try {
    if (CFG.gistId) {
      const g = await gh('/gists/' + CFG.gistId); const f = g.files?.[GIST_FILE];
      let txt = f?.content; if (f?.truncated && f.raw_url) txt = await (await fetch(f.raw_url)).text();
      if (txt) mergeTips(JSON.parse(txt));
    }
    const files = { [GIST_FILE]: { content: JSON.stringify({ v: 1, upd: new Date().toISOString(), tips: TIPS, deleted: DELETED }) } };
    if (CFG.gistId) await gh('/gists/' + CFG.gistId, { method: 'PATCH', body: JSON.stringify({ files }) });
    else { const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Black House Props: tips sincronizadas', public: false, files }) }); CFG.gistId = g.id; store.set('cfg', CFG); }
    syncInfo = { at: new Date().toISOString(), ok: true };
    if (!quiet) toast('Tips sincronizadas');
  } catch (e) { syncInfo = { at: new Date().toISOString(), ok: false, err: e.message }; if (!quiet) toast('Não sincronizou: ' + e.message); }
  store.set('syncInfo', syncInfo);
  if (state.view === 'banca') renderBanca();
}
const queueSync = () => { if (!CFG.ghToken) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(true), 2500); };

/* ---------------- FICHA DO JOGADOR ---------------- */
function chartSVG(pr, side, line) {
  const logs = pr.ctx.logs.slice(0, 20).reverse(), v = pr.vals.slice(0, 20).reverse();
  const W = 700, H = 250, pl = 30, prr = 66, pt = 22, pb = 44, n = v.length, bw = (W - pl - prr) / Math.max(n, 1);
  const muF = EVAL[pr.id].muF;
  const mx = Math.max(...v, line, muF) * 1.15 || 1;
  const y = x => pt + (H - pt - pb) * (1 - x / mx);
  const step = mx > 60 ? 20 : mx > 30 ? 10 : mx > 15 ? 5 : mx > 6 ? 2 : 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Últimos ${n} jogos contra a linha ${fmt(line)}">`;
  for (let t = 0; t <= mx; t += step) s += `<line class="grid" x1="${pl}" x2="${W - prr + 4}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pl - 5}" y="${y(t) + 3}" text-anchor="end">${t}</text>`;
  const firstCur = logs.findIndex(g => g[L.cur] === 1);
  if (firstCur > 0) { const dx = pl + firstCur * bw; s += `<line class="sdiv" x1="${dx}" x2="${dx}" y1="${pt - 14}" y2="${H - pb}"/><text class="slab" x="${dx - 5}" y="${pt - 8}" text-anchor="end">temp. passada</text><text class="slab" x="${dx + 5}" y="${pt - 8}">atual</text>`; }
  const woSet = pr.ctx.wo?.set;
  v.forEach((x, i) => {
    const g = logs[i]; const h = side === 'over' ? x > line : x < line; const bx = pl + i * bw + bw * .16, w = bw * .68, by = y(x);
    const wo = woSet?.has(String(g[L.gid]));
    s += `<rect class="${h ? 'bh' : 'bm'}${wo ? ' wo' : ''}" x="${bx}" y="${by}" width="${w}" height="${Math.max(1, H - pb - by)}" rx="2"><title>${g[L.date].slice(8, 10)}/${g[L.date].slice(5, 7)} ${g[L.home] ? 'vs' : '@'} ${g[L.opp]}: ${x} (${Math.round(g[L.min])} min)${wo ? ', sem ' + pr.ctx.wo.q.name : ''}</title></rect>`;
    s += `<text class="vlab" x="${bx + w / 2}" y="${by - 4}" text-anchor="middle">${x}</text>`;
    s += `<text class="axis" x="${bx + w / 2}" y="${H - pb + 14}" text-anchor="middle" style="${g[L.opp] === pr.opp ? 'fill:var(--accent);font-weight:600' : ''}">${g[L.opp]}</text>`;
    s += `<text class="axis" x="${bx + w / 2}" y="${H - pb + 27}" text-anchor="middle">${Math.round(g[L.min])}'</text>`;
  });
  const yl = y(line), yp = y(muF); let tl = yl + 4, tp = yp + 4; if (Math.abs(tl - tp) < 13) { if (yl < yp) { tl = (yl + yp) / 2 - 3; tp = tl + 13; } else { tp = (yl + yp) / 2 - 3; tl = tp + 13; } }
  s += `<line class="lline" x1="${pl}" x2="${W - prr + 4}" y1="${yl}" y2="${yl}"/><text class="llab" x="${W - prr + 8}" y="${tl}">Linha ${fmt(line)}</text>`;
  s += `<line class="pline" x1="${pl}" x2="${W - prr + 4}" y1="${yp}" y2="${yp}"/><text class="plab" x="${W - prr + 8}" y="${tp}">Proj. ${fmt(muF)}</text>`;
  s += `<text class="axis" x="${pl}" y="${H - 3}">adversário, minutos</text>`;
  return s + '</svg>';
}
function splitRow(lb, arr, line, side) { if (!arr.length) return `<tr><td>${lb}</td><td class="r num muted">—</td><td class="r num muted">—</td><td class="r num muted">0</td></tr>`; const h = arr.filter(v => side === 'over' ? v > line : v < line).length; return `<tr><td>${lb}</td><td class="r num">${fmt(mean(arr))}</td><td class="r">${hc([h, arr.length])}</td><td class="r num muted">${arr.length}</td></tr>`; }
function valueBox(pr, e, s) {
  const u = stakeU(s); const mk = pr.mkt;
  const mv = mk?.openMu != null ? `<div><span>Movimento desde a abertura<small>linha ${fmt(mk.openLine)} → ${fmt(mk.line)}, “mais de” ${pct(mk.openP)} → ${pct(mk.pO)} sem margem</small></span><b class="num ${steamOf(pr, D.side) > 0 ? 'pos' : steamOf(pr, D.side) < 0 ? 'neg' : ''}">${steamOf(pr, D.side) > 0 ? 'a favor' : steamOf(pr, D.side) < 0 ? 'contra' : 'estável'}</b></div>` : '';
  return `<div class="dbox"><h3>Valor e stake${help('regua')}</h3>${valbar(s, s.pMkt)}
    <div class="vb-keys" style="margin:8px 0 6px"><span><i class="k-fill"></i>chance final</span><span><i class="k-mark"></i>chance que a odd cobra</span>${s.pMkt != null ? '<span><i class="k-mkt"></i>mercado sem margem</span>' : ''}</div>
    <div class="factors">
    <div><span>Chance do modelo<small>projeção própria ${fmt(pr.proj, 2)}</small></span><b class="num">${pct(s.pModel, 1)}</b></div>
    <div><span>Chance do mercado${help('mercado')}<small>${mk ? `consenso sem margem de ${mk.n} ${mk.n === 1 ? 'casa' : 'casas'} (margem média ${pct(mk.margin, 1)}), média implícita ${fmt(mk.mu, 2)}` : s.myFair != null ? 'sua casa sem a margem (só referência)' : 'sem odds das casas para esta linha'}</small></span><b class="num">${pct(s.pMkt ?? s.myFair, 1)}</b></div>
    ${mv}
    <div class="total"><span>Chance final<small>${mk ? `${fmt(e.w * 100, 0)}% modelo + ${fmt((1 - e.w) * 100, 0)}% mercado, projeção ${fmt(e.muF, 2)}` : 'só o modelo'}</small></span><b class="num">${pct(s.p, 1)}</b></div>
    <div><span>Odd justa e EV${help('ev')}<small>${s.odd ? `odd ${fmt(s.odd, 2)} na ${esc(s.book)}` : 'informe a odd da sua casa abaixo'}</small></span><b class="num ${s.ev == null ? '' : s.ev >= 0 ? 'pos' : 'neg'}">${fmt(s.fair, 2)}, ${sgnPct(s.ev)}</b></div>
    <div class="total"><span>Stake sugerida${help('stake')}<small>Kelly ${fmt(CFG.kf * 100, 0)}%, banca ${money(CFG.bank)}, 1u = ${money(CFG.unit)}</small></span><b class="num">${s.odd ? (u ? uFmt(u) + ', ' + money(u * CFG.unit) : 'sem valor') : '—'}</b></div>
  </div></div>`;
}
function ladderBox(pr) {
  if (!LAYUP_MK.includes(pr.mk) && !['STL', 'BLK', 'TOV', 'FGM', 'FGA', 'FTM', '2PM', '2PA', '3PA'].includes(pr.mk)) return '';
  const rows = ladOf(pr, 8); if (rows.length < 2) return '';
  return `<div class="dbox"><h3>Escada de linhas${help('escada')}</h3><div class="tablewrap" style="border:0"><table class="splits ladder"><thead><tr><th>Linha</th><th class="r">Chance</th><th class="r">Odd justa</th><th class="r">L10</th><th class="r">L20</th></tr></thead><tbody>${rows.map(r => `<tr${r.p >= .8 ? ' class="hl"' : ''}><td><b>${r.t}+</b> <span class="muted lad-x">(mais de ${fmt(r.t - .5)})</span></td><td class="r num">${pct(r.p)}</td><td class="r num">${fmt(r.fair, 2)}</td><td class="r">${hc(r.L10)}</td><td class="r">${hc(r.L20)}</td></tr>`).join('')}</tbody></table></div><p class="muted" style="font-size:12.5px;margin:6px 0 0">Linhas alternativas: a casa costuma pagar menos que a odd justa nos degraus baixos. Só entre se a odd dela for maior.</p></div>`;
}
function renderDrawer(focusEditor) {
  const pr = BYID[D.id], p = pr.p, e = EVAL[pr.id], s = e[D.side], o = e.over, u = e.under, line = e.line;
  const mks = PROPS.filter(x => x.p === p);
  const v = pr.vals, Lg = pr.ctx.logs; const pick = f => v.filter((_, i) => f(Lg[i]));
  const on = inSlip(pr.id, D.side); const ov = OVR[pr.id] || {};
  const f = pr.factors, c = pr.ctx;
  $('#drawer').innerHTML = `
  <div class="dhead" style="--tc:${teamCol(p.team)}">${badge(p.team)}<div class="grow"><h2 id="dName">${esc(p.name)}</h2><div class="sub">${POSLB[p.pos]} do ${esc(TEAM_INFO[p.team]?.[0] || p.team)}, ${matchLabel(pr)} às ${brTime(pr.game.timeUTC)}. ${fmt(c.exp, 0)} minutos esperados${c.rest != null ? ', ' + (c.rest <= 0 ? 'jogou ontem' : c.rest + (c.rest === 1 ? ' dia' : ' dias') + ' de descanso') : ''}.</div></div><button class="dclose" data-close aria-label="Fechar">×</button></div>
  <div class="dbody">
    <div class="mktchips">${mks.map(x => `<button class="chip" data-mk="${x.id}" aria-pressed="${x.id === pr.id}">${mkShort(x.mk)}</button>`).join('')}</div>
    <div class="eyebrow">${MARKETS[pr.mk].lb} ${srcTag(pr)}</div>
    <div class="sidepick">
      <button data-dside="over" aria-pressed="${D.side === 'over'}"><b>Mais de ${fmt(line)}</b><span>${pct(o.p)}, ${o.odd ? fmt(o.odd, 2) + ' ' + esc(o.book) + ', EV <span class="' + (o.ev >= 0 ? 'pos' : 'neg') + '">' + sgnPct(o.ev) + '</span>' : 'justa ' + fmt(o.fair, 2)}</span></button>
      <button data-dside="under" aria-pressed="${D.side === 'under'}"><b>Menos de ${fmt(line)}</b><span>${pct(u.p)}, ${u.odd ? fmt(u.odd, 2) + ' ' + esc(u.book) + ', EV <span class="' + (u.ev >= 0 ? 'pos' : 'neg') + '">' + sgnPct(u.ev) + '</span>' : 'justa ' + fmt(u.fair, 2)}</span></button>
    </div>
    <div class="bigkpis"><div><small>Nota${help('nota')}</small><b>${gradeChip(s.grade)}</b></div><div><small>Chance${help('chance')}</small><b>${pct(s.p)}</b></div><div><small>Projeção${help('proj')}</small><b>${fmt(e.muF)}</b><span class="kpisub">faixa ${rangeOf(pr).join('–')}, ${pr.ctx.logs.length} jogos</span></div><div><small>Stake${help('stake')}</small><b>${s.odd ? (stakeU(s) ? uFmt(stakeU(s)) : '0u') : '—'}</b></div></div>
    ${alerts(pr, D.side).length ? `<div class="chips">${alerts(pr, D.side).map(([t, c2]) => `<span class="tag ${c2}">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="edbtns" style="margin:0"><button class="btn primary" data-tip="${pr.id}" data-side="${D.side}">Registrar tip</button><button class="btn" data-postone="${pr.id}" data-side="${D.side}">Gerar post</button><button class="btn" data-add="${pr.id}" data-side="${D.side}" aria-pressed="${on}">${on ? 'No bilhete' : '+ Múltipla'}</button></div>
    <div class="dbox"><h3>Linha da sua casa</h3>
      <div class="edrow"><label>Linha<input id="edLine" inputmode="decimal" value="${ov.line ?? ''}" placeholder="${fmt(pr.line)}"></label><label>Odd mais de<input id="edO" inputmode="decimal" value="${ov.oOver ?? ''}" placeholder="ex. 1,85"></label><label>Odd menos de<input id="edU" inputmode="decimal" value="${ov.oUnder ?? ''}" placeholder="ex. 1,95"></label></div>
      <div class="edrow" style="grid-template-columns:1fr;margin-top:8px"><label>Casa<input id="edBook" list="bookList" value="${esc(ov.book || CFG.defBook)}"></label></div>
      <div class="edbtns"><button class="btn primary" data-edsave>Calcular com minha linha</button>${OVR[pr.id] ? `<button class="btn" data-edreset>Voltar à linha ${pr.lineSource === 'book' ? 'da casa' : 'de referência'}</button>` : ''}</div>
      <p class="muted" style="font-size:12.5px;margin:8px 0 0">${pr.mkt ? 'Com o consenso das casas dos EUA, a chance na sua linha usa a média implícita do mercado: linha atrasada na sua casa aparece como EV positivo.' : 'Vale para mercados que a API não cobre (tentativas de 2 e de 3, faltas etc.).'} Fica salvo neste aparelho até o fim do dia.</p></div>
    ${valueBox(pr, e, s)}
    ${ladderBox(pr)}
    <div class="dbox" id="aiBox" hidden><h3>Analista IA</h3><p class="muted" style="margin:0;font-size:13.5px">O Claude lê os números desta linha e escreve uma análise curta com prós, contras e veredito.</p><div class="edbtns"><button class="btn" data-ai>Pedir análise ao Claude</button></div><div class="ai" id="aiOut"></div></div>
    <div class="dbox chart"><h3>Últimos ${Math.min(20, v.length)} jogos × linha</h3>${chartSVG(pr, D.side, line)}<p class="muted" style="font-size:12.5px;margin:6px 0 0">Verde bateu “${sideLb(D.side).toLowerCase()}”, vermelho não. Adversário de hoje em laranja.${c.wo ? ` Barras com contorno: jogos sem ${esc(c.wo.q.name)}.` : ''}</p></div>
    <div class="dbox"><h3>Recortes</h3><div class="tablewrap" style="border:0"><table class="splits"><thead><tr><th>Recorte</th><th class="r">Média</th><th class="r">Acerto</th><th class="r">Jogos</th></tr></thead><tbody>
      ${splitRow('Últimos 5', v.slice(0, 5), line, D.side)}${splitRow('Últimos 10', v.slice(0, 10), line, D.side)}${splitRow('Últimos 20', v.slice(0, 20), line, D.side)}
      ${c.wo ? splitRow(`<b>Sem ${esc(c.wo.q.name)}</b>`, pick(g => c.wo.set.has(String(g[L.gid]))), line, D.side) + splitRow(`Com ${esc(c.wo.q.name)}`, pick(g => !c.wo.set.has(String(g[L.gid]))).slice(0, 20), line, D.side) : ''}
      ${splitRow('Temporada atual', pick(g => g[L.cur] === 1), line, D.side)}${splitRow('Em casa', pick(g => g[L.home] === 1), line, D.side)}${splitRow('Fora', pick(g => g[L.home] === 0), line, D.side)}
      ${splitRow('Contra ' + pr.opp, pick(g => g[L.opp] === pr.opp), line, D.side)}${splitRow('Como titular', pick(g => g[L.starter] === 1), line, D.side)}${splitRow('Saindo do banco', pick(g => g[L.starter] === 0), line, D.side)}${splitRow('Com 32+ min', pick(g => g[L.min] >= 32), line, D.side)}
    </tbody></table></div></div>
    <div class="dbox"><h3>Por que essa projeção</h3><div class="factors">
      <div><span>Ritmo por minuto × minutos<small>${fmt(f.per36, 1)} por 36 min, ${fmt(c.base, 1)} min de base${c.extra ? ' ' + (c.extra > 0 ? '+ ' : '− ') + fmt(Math.abs(c.extra), 1) + ' por desfalques' : ''}${c.adj.length ? ', ' + c.adj.map(a => a.lb).join(', ') : ''}</small></span><b class="num">${fmt(f.base, 2)}</b></div>
      <div><span>Matchup<small>defesa do ${pr.opp}: ${pr.rank?.rank ? pr.rank.rank + 'º de ' + pr.rank.of + ' contra ' + POSLB[p.pos].toLowerCase() + 's' : 'sem dados'}</small></span><b class="num">×${fmt(f.mf, 3)}</b></div>
      <div><span>Ritmo do jogo<small>${pr.game.total ? 'total ' + fmt(pr.game.total) + ', ' : ''}posses dos dois times vs média da liga</small></span><b class="num">×${fmt(f.pf, 3)}</b></div>
      ${Math.abs(f.uf - 1) > .001 ? `<div><span>Uso sem o colega<small>${c.wo?.active ? `${c.wo.n} jogos reais sem ${esc(c.wo.q.name)} + estimativa por posição` : esc(c.out.map(q => q.name).join(', ')) + ' fora'}</small></span><b class="num">×${fmt(f.uf, 3)}</b></div>` : ''}
      <div class="total"><span>Projeção do modelo</span><b class="num">${fmt(pr.proj, 2)}</b></div>
    </div><p class="muted" style="font-size:12.5px;margin:8px 0 0">Distribuição: ${{ normal: 'normal', poisson: 'Poisson', negbin: 'binomial negativa' }[pr.dist.type]} (dispersão ${fmt(pr.d, 2)}${SLATE.calib?.[pr.mk] && CFG.calib ? ', já com a calibração ×' + fmt(SLATE.calib[pr.mk], 2) : ''}).</p></div>
    ${pr.book ? `<div class="dbox"><h3>Odds por casa, linha ${fmt(pr.book.line)}</h3><div class="tablewrap" style="border:0"><table class="splits"><thead><tr><th>Casa</th><th class="r">Mais de</th><th class="r">Menos de</th><th class="r">Sem margem</th></tr></thead><tbody>
      ${Object.entries(pr.book.books).map(([b, x]) => { const o2 = x.o && x.u ? 1 / x.o / (1 / x.o + 1 / x.u) : null; return `<tr><td>${esc(b)}</td><td class="r num">${fmt(x.o, 2)}</td><td class="r num">${fmt(x.u, 2)}</td><td class="r num muted">${o2 ? pct(o2) + ' mais' : '—'}</td></tr>`; }).join('')}</tbody></table></div></div>` : ''}
  </div>`;
  samplePromise.then(sm => { const b = $('#aiBox'); if (b && sm) b.hidden = false; });
  if (focusEditor) setTimeout(() => $('#edLine')?.focus(), 50);
}
let lastFocus = null;
function openDrawer(id, side, focusEditor) { lastFocus = document.activeElement; D = { id, side }; renderDrawer(focusEditor); $('#drawer').hidden = false; $('#scrim').hidden = false; $('#drawer').scrollTop = 0; if (!focusEditor) $('#drawer .dclose').focus(); }
function closeDrawer() { D = null; $('#drawer').hidden = true; if (!$('#filters').classList.contains('open') && $('#modal').hidden) $('#scrim').hidden = true; if (lastFocus) lastFocus.focus(); }
function saveOverride() {
  const line = num($('#edLine').value), oO = num($('#edO').value), oU = num($('#edU').value), book = $('#edBook').value.trim();
  if (line != null && (line < 0 || line > 200)) { toast('Linha inválida'); return; }
  for (const o of [oO, oU]) if (o != null && (o < 1.01 || o > 50)) { toast('Odd deve ser decimal, por exemplo 1,85'); return; }
  if (line == null && oO == null && oU == null) { delete OVR[D.id]; } else OVR[D.id] = { line: line ?? BYID[D.id].line, oOver: oO, oUnder: oU, book: book || 'Sua casa' };
  store.set('ovr:' + SLATE.meta.date, OVR); EVAL[D.id] = ev(BYID[D.id], OVR[D.id]); renderDrawer(); refreshLists(); toast('Linha calculada');
}
async function askClaude() {
  const sm = await samplePromise; if (!sm) return;
  const pr = BYID[D.id], e = EVAL[pr.id], s = e[D.side], out = $('#aiOut'), btn = document.querySelector('[data-ai]'), c = pr.ctx;
  const last10 = c.logs.slice(0, 10).map((g, i) => `${g[L.date]} ${g[L.home] ? 'vs' : '@'} ${g[L.opp]}: ${pr.vals[i]} em ${Math.round(g[L.min])} min${c.wo?.set.has(String(g[L.gid])) ? ' (sem ' + c.wo.q.name + ')' : ''}`).join('\n');
  const prompt = `Você é um analista de props da NBA que assessora um tipster. Escreva em português do Brasil, em até 180 palavras, uma análise objetiva desta linha. Use só os dados abaixo, sem inventar notícias. Estrutura: 2 a 3 pontos a favor, 1 a 2 pontos contra, e um veredito final em uma frase (entrar com a stake sugerida, entrar com stake reduzida, ou passar). Considere a diferença entre a chance do modelo e a do mercado. Não prometa lucro.

Jogador: ${pr.p.name} (${POSLB[pr.p.pos]}, ${pr.p.team}) ${matchLabel(pr)}
Mercado: ${MARKETS[pr.mk].lb}, ${sideLb(D.side)} ${e.line} (${srcOf(pr) === 'book' ? 'linha das casas' : srcOf(pr) === 'mine' ? 'linha da casa do usuário' : 'linha de referência'})
Projeção: modelo ${pr.proj.toFixed(2)}${pr.mkt ? `, mercado ${pr.mkt.mu.toFixed(2)} (consenso sem margem de ${pr.mkt.n} casas)` : ''}, final ${e.muF.toFixed(2)}
Chance: final ${(s.p * 100).toFixed(1)}%, modelo ${(s.pModel * 100).toFixed(1)}%${s.pMkt != null ? `, mercado ${(s.pMkt * 100).toFixed(1)}%` : ''}, odd ${s.odd ?? 'sem odd'}, EV ${s.ev == null ? 'n/d' : (s.ev * 100).toFixed(1) + '%'}, nota ${s.grade}, stake sugerida ${stakeU(s)}u
${pr.mkt?.openMu != null ? `Movimento: linha ${pr.mkt.openLine} → ${pr.mkt.line}; chance de "mais de" no mercado ${(pr.mkt.openP * 100).toFixed(0)}% → ${(pr.mkt.pO * 100).toFixed(0)}%\n` : ''}Acerto: L5 ${s.hits.L5.join('/')}, L10 ${s.hits.L10.join('/')}, L20 ${s.hits.L20.join('/')}, contra ${pr.opp} ${s.hits.H2H.join('/')}, temporada atual ${s.hits.CUR.join('/')}${s.hits.WO ? `, sem ${c.wo.q.name} ${s.hits.WO.join('/')}` : ''}, sequência atual ${s.streak}
Minutos esperados: ${c.exp.toFixed(1)} (últimos 5: ${c.m5.toFixed(1)}, últimos 20: ${c.m20.toFixed(1)}) ${c.adj.map(a => a.lb).join(', ')}${c.rest != null ? `, descanso ${c.rest} dia(s)` : ''}
Defesa do adversário contra a posição: ${pr.rank?.rank ? pr.rank.rank + 'º de ' + pr.rank.of + ' (30º cede mais)' : 'sem dados'}, fator ${pr.factors.mf.toFixed(3)}, ritmo ×${pr.factors.pf.toFixed(3)}
Desfalques no time: ${c.out.map(q => q.name).join(', ') || 'nenhum'}, status do jogador: ${pr.p.status}${pr.p.note ? ' (' + pr.p.note + ')' : ''}${pr.p.lineup ? ', quinteto: ' + (pr.p.lineup.role === 'starter' ? 'titular' : 'reserva') + (pr.p.lineup.confirmed ? ' (confirmado)' : ' (previsto)') : ''}
Handicap do mandante: ${pr.game.spread ?? 'n/d'}, total: ${pr.game.total ?? 'n/d'}, back-to-back: ${(pr.game.b2b || []).includes(pr.p.team) ? 'sim' : 'não'}
Últimos 10 jogos (${MARKETS[pr.mk].lb}):
${last10}`;
  btn.disabled = true; out.className = 'ai loading'; out.textContent = 'Pensando…';
  try {
    const { text } = await sm(prompt, { onText: ({ text }) => { out.className = 'ai'; out.textContent = text; } });
    out.className = 'ai'; out.textContent = text;
  } catch (err) {
    out.className = 'ai'; out.textContent = { not_granted: 'Análise não autorizada neste aparelho.', rate_limited: 'Muitas análises seguidas. Espere um pouco e tente de novo.' }[err?.code] || (err?.text || 'Não foi possível gerar a análise agora.');
  } finally { btn.disabled = false; }
}

/* ---------------- modal genérico ---------------- */
let modalFocus = null;
function openModal(html, size) { if ($('#modal').hidden) modalFocus = document.activeElement; const m = $('#modal'); $('#mbox').className = 'mbox' + (size ? ' ' + size : ''); $('#mbox').innerHTML = html; m.hidden = false; $('#scrim').hidden = false; setTimeout(() => { if (!$('#mbox').contains(document.activeElement)) $('#mbox').querySelector('input,textarea,button:not([data-mclose]),[data-mclose]')?.focus(); }, 30); }
function closeModal() { $('#modal').hidden = true; POST = null; if (!D && !$('#filters').classList.contains('open')) $('#scrim').hidden = true; if (modalFocus?.isConnected) modalFocus.focus(); modalFocus = null; }

/* ---------------- ações ---------------- */
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2200); }
function toggleSlip(id, side) {
  const i = SLIP.findIndex(x => x.id === id && x.side === side);
  if (i >= 0) { SLIP.splice(i, 1); toast('Perna removida'); } else { SLIP = SLIP.filter(x => x.id !== id); SLIP.push({ id, side }); toast('Adicionada à múltipla'); }
  store.set('slip2', SLIP); refreshLists(); if (D) renderDrawer();
}
function refreshLists() { if (state.view === 'props') renderProps(); if (state.view === 'tendencias') renderTrends(); if (state.view === 'jogos') renderGames(); if (state.view === 'banca') renderBanca(); renderSlip(); }
const VIEWS = ['props', 'tendencias', 'jogos', 'defesa', 'multipla', 'banca', 'guia'];
function route() {
  let h = location.hash.slice(1); if (h === 'sistema' || h === 'usar') h = 'guia'; state.view = VIEWS.includes(h) ? h : 'props';
  if (D) { D = null; $('#drawer').hidden = true; $('#scrim').hidden = true; }
  if (!$('#modal').hidden) closeModal();
  $('#filters').classList.remove('open');
  VIEWS.forEach(v => $('#v-' + v).hidden = v !== state.view);
  $$('.topnav a,.botnav a').forEach(a => a.getAttribute('href') === '#' + state.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  if (!SLATE) return;
  ({ props: () => { renderOnboard(); renderSummary(); renderProps(); }, tendencias: renderTrends, jogos: renderGames, defesa: renderDvP, guia: renderGuide, banca: renderBanca, multipla: () => { } })[state.view]();
  renderSlip(); window.scrollTo(0, 0);
}

function bind() {
  const toggleArr = (key, v) => { const a = F[key].slice(); const i = a.indexOf(v); i >= 0 ? a.splice(i, 1) : a.push(v); setF({ [key]: a }); };
  $('#fGames').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) toggleArr('games', b.dataset.v); });
  $('#fMarkets').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; if (b.dataset.grp) toggleArr('groups', b.dataset.grp); else toggleArr('markets', b.dataset.v); });
  $('#fPos').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) toggleArr('pos', b.dataset.v); });
  const seg = (sel, key) => $(sel).addEventListener('click', e => { const b = e.target.closest('button'); if (b) setF({ [key]: b.dataset.v }, key === 'view'); });
  seg('#fSide', 'side'); seg('#fGrade', 'minGrade'); seg('#fSample', 'sample'); seg('#fView', 'view'); seg('#fSrc', 'src');
  $('#fq').addEventListener('input', e => setF({ q: e.target.value }));
  $('#fHit').addEventListener('input', e => setF({ minHit: +e.target.value }));
  $('#fProb').addEventListener('input', e => setF({ minProb: +e.target.value }));
  $('#fEV').addEventListener('input', e => setF({ minEV: +e.target.value }));
  $('#fOddMin').addEventListener('change', e => setF({ oddMin: num(e.target.value) || 1.01 }));
  $('#fOddMax').addEventListener('change', e => setF({ oddMax: num(e.target.value) || 10 }));
  for (const [s, k] of CHECKS) $(s).addEventListener('change', e => setF({ [k]: e.target.checked }));
  $('#fSort').addEventListener('change', e => setF({ sort: e.target.value }, true));
  $('#resetF').addEventListener('click', () => { F = Object.assign({}, DEF, { view: F.view }); LIMIT = 60; renderProps(); });
  $('#presets').addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (!b) return; const p = PRESETS.find(x => x.id === b.dataset.preset); F = Object.assign({}, DEF, { view: F.view }, p.f, { preset: p.id }); LIMIT = 60; renderProps(); });
  $('#moreBtn').addEventListener('click', () => { LIMIT += 60; renderProps(); });
  const closeF = () => { $('#filters').classList.remove('open'); if (!D && $('#modal').hidden) $('#scrim').hidden = true; };
  $('#openF').addEventListener('click', () => { $('#filters').classList.add('open'); $('#scrim').hidden = false; });
  $('#closeF').addEventListener('click', closeF);
  $('#importBtn').addEventListener('click', () => SLATE && openImportModal());
  $('#scrim').addEventListener('click', () => { if (!$('#modal').hidden) { closeModal(); return; } closeF(); if (D) closeDrawer(); });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#autoN').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; autoN = +b.dataset.v; $$('#autoN button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.v === autoN)); });
  $$('#autoN button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.v === autoN));
  $('#autoBtn').addEventListener('click', () => { const tg = num($('#autoOdd').value); if ($('#autoOdd').value.trim() && !(tg > 1.1)) return toast('Odd-alvo inválida (ex. 3,00)'); autoBuild(autoN, tg > 1.1 ? tg : null); });
  $('#dvpStat').addEventListener('click', e => { const b = e.target.closest('[data-dvp]'); if (b) { dvpStat = b.dataset.dvp; renderDvP(); } });
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-open],[data-edit],[data-add],[data-remove],[data-swap],[data-close],[data-mk],[data-dside],[data-game],[data-reset],[data-edsave],[data-edreset],[data-ai],#clearSlip,[data-tip],[data-tsave],[data-mclose],[data-tslip],[data-tipslip],[data-postslip],[data-postone],[data-daycard],[data-pcopy],[data-pdown],[data-pshare],[data-pai],#pFmt button,[data-iprev],[data-iapply],[data-tdel],[data-tpost],[data-postopen],[data-csv],[data-backup],#bFrom button,#bKind button,[data-help],[data-obclose],[data-sync],[data-goto],[data-preset-go],[data-chg],[data-seen],#searchBtn,#searchPill,[data-gameall],[data-results]'); if (!t) { if (!e.target.closest('#pop')) $('#pop').hidden = true; return; }
    if (t.dataset.help) { e.preventDefault(); e.stopPropagation(); showHelp(t); return; }
    $('#pop').hidden = true;
    if (t.dataset.open) { if (!$('#modal').hidden) closeModal(); openDrawer(t.dataset.open, t.dataset.side); }
    else if (t.dataset.edit) openDrawer(t.dataset.edit, t.dataset.side, true);
    else if (t.dataset.add) toggleSlip(t.dataset.add, t.dataset.side);
    else if (t.dataset.swap) swapLeg(t.dataset.swap, t.dataset.side);
    else if (t.dataset.remove) { SLIP = SLIP.filter(x => !(x.id === t.dataset.remove && x.side === t.dataset.side)); store.set('slip2', SLIP); renderSlip(); }
    else if (t.hasAttribute('data-close')) closeDrawer();
    else if (t.dataset.mk) { D = { id: t.dataset.mk, side: EVAL[t.dataset.mk].best }; renderDrawer(); }
    else if (t.dataset.dside) { D.side = t.dataset.dside; renderDrawer(); }
    else if (t.hasAttribute('data-gameall')) { F = Object.assign({}, DEF, { view: F.view, preset: '' }); LIMIT = 60; renderSummary(); renderProps(); }
    else if (t.dataset.game) { const already = (F.games || []).length === 1 && F.games[0] === t.dataset.game && t.classList.contains('day'); F = Object.assign({}, DEF, { view: F.view, games: already ? [] : [t.dataset.game], preset: '' }); LIMIT = 60; if (state.view === 'props') { renderSummary(); renderProps(); if (!already) $('#presets').scrollIntoView({ behavior: 'smooth', block: 'start' }); } else location.hash = 'props'; }
    else if (t.hasAttribute('data-reset')) { F = Object.assign({}, DEF, { view: F.view }); renderProps(); }
    else if (t.hasAttribute('data-edsave')) saveOverride();
    else if (t.hasAttribute('data-edreset')) { delete OVR[D.id]; store.set('ovr:' + SLATE.meta.date, OVR); EVAL[D.id] = ev(BYID[D.id]); renderDrawer(); refreshLists(); }
    else if (t.hasAttribute('data-ai')) askClaude();
    else if (t.id === 'clearSlip') { SLIP = []; store.set('slip2', SLIP); renderSlip(); }
    else if (t.dataset.tip) openTipModal(t.dataset.tip, t.dataset.side);
    else if (t.dataset.tsave) saveTipFromModal(t.dataset.tsave, t.dataset.side, !!t.dataset.post);
    else if (t.hasAttribute('data-mclose')) closeModal();
    else if (t.hasAttribute('data-tipslip')) registerSlip();
    else if (t.hasAttribute('data-tslip')) saveSlipTip(!!t.dataset.post);
    else if (t.hasAttribute('data-postslip')) { const legs = slipLegs(); const c = slipCalc(legs); openPostModal([{ kind: 'multi', date: SLATE.meta.date, legs: legs.map(l => legOf(l.pr, l.side, l.e.line, l.s.odd)), odd: c.odd || 1 / c.prob, units: .5, book: '' }]); }
    else if (t.dataset.postone) { const pr = BYID[t.dataset.postone], e2 = EVAL[pr.id]; openPostModal(picksAsTips([{ pr, e: e2, s: e2[t.dataset.side] }])); }
    else if (t.hasAttribute('data-daycard')) { const tp = topPicks(20); const withOdd = tp.filter(x => x.s.odd && (x.s.ev ?? 0) >= 0); openPostModal(picksAsTips((withOdd.length >= 3 ? withOdd : tp).slice(0, 5)), 'Card do dia'); }
    else if (t.hasAttribute('data-pcopy')) { try { await navigator.clipboard.writeText($('#pText').value); toast('Texto copiado'); } catch { $('#pText').select(); toast('Selecione e copie o texto'); } }
    else if (t.hasAttribute('data-pdown')) { const b = await canvasBlob(); download(`${POST?.results ? 'resultados' : 'tip'}-${SLATE.meta.date}.png`, b); }
    else if (t.hasAttribute('data-pshare')) { const b = await canvasBlob(); const file = new File([b], `tip-${SLATE.meta.date}.png`, { type: 'image/png' }); try { if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: $('#pText').value }); else await navigator.share({ text: $('#pText').value }); } catch { } }
    else if (t.hasAttribute('data-pai')) aiCaption();
    else if (t.closest('#pFmt')) { POST.format = t.dataset.v; store.set('postfmt', POST.format); $$('#pFmt button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === POST.format)); drawPost(); }
    else if (t.hasAttribute('data-iprev')) importPreview();
    else if (t.hasAttribute('data-iapply')) importApply();
    else if (t.dataset.tdel) { const x = TIPS.find(z => z.id === t.dataset.tdel); if (x && confirmDel(x)) { TIPS = TIPS.filter(z => z.id !== x.id); DELETED.push(x.id); store.set('deleted', DELETED); saveTips(); renderBanca(); toast('Tip apagada'); } }
    else if (t.dataset.tpost) { const x = TIPS.find(z => z.id === t.dataset.tpost); if (x) openPostModal([x]); }
    else if (t.hasAttribute('data-postopen')) openPostModal(TIPS.filter(z => z.status === 'pending' && z.date === SLATE.meta.date).slice(0, 6), 'Tips do dia');
    else if (t.hasAttribute('data-csv')) download(`tips-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(TIPS), 'text/csv;charset=utf-8');
    else if (t.hasAttribute('data-backup')) download(`garrafao-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ v: 1, cfg: { ...CFG, ghToken: undefined }, tips: TIPS }, null, 1), 'application/json');
    else if (t.closest('#bFrom')) { bancaFrom = t.dataset.v; renderBanca(); }
    else if (t.closest('#bKind')) { bancaKind = t.dataset.v; renderBanca(); }
    else if (t.hasAttribute('data-obclose')) { store.set('ob1', true); renderOnboard(); }
    else if (t.hasAttribute('data-sync')) syncNow(false);
    else if (t.dataset.goto) location.hash = t.dataset.goto;
    else if (t.dataset.presetGo) { const p = PRESETS.find(x => x.id === t.dataset.presetGo); F = Object.assign({}, DEF, { view: F.view }, p.f, { preset: p.id }); LIMIT = 60; renderProps(); $('#presets').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (t.hasAttribute('data-chg')) { CHG_OPEN = !CHG_OPEN; renderSummary(); }
    else if (t.hasAttribute('data-seen')) { store.set('seen:' + SLATE.meta.date, snapshotNow()); CHG_OPEN = false; renderSummary(); toast('Pronto: mudanças marcadas como vistas'); }
    else if (t.id === 'searchBtn' || t.id === 'searchPill') openSearch();
    else if (t.hasAttribute('data-results')) openResultsModal();
  });
  // apagar sem diálogo do navegador: segundo toque em até 3 s confirma
  let pendingDel = null;
  function confirmDel(x) { if (pendingDel === x.id) { pendingDel = null; return true; } pendingDel = x.id; toast('Toque de novo no × para apagar'); setTimeout(() => { if (pendingDel === x.id) pendingDel = null; }, 3000); return false; }
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.cfg) setCfg(t.dataset.cfg, t.value);
    else if (t.dataset.tstatus) {
      const x = TIPS.find(z => z.id === t.dataset.tstatus); if (!x || !t.value) return;
      if (t.value === 'auto') { x.manual = false; x.status = 'pending'; x.settledAt = null; settleTip(x, RESULTS); }
      else { x.manual = true; x.status = t.value; x.effOdd = null; x.profit = profitOf(x); x.settledAt = new Date().toISOString(); }
      x.upd = new Date().toISOString(); saveTips(); renderBanca();
    } else if (t.hasAttribute('data-restore') && t.files?.[0]) {
      try {
        const j = JSON.parse(await t.files[0].text());
        if (!Array.isArray(j.tips)) throw new Error('arquivo sem tips');
        const ids = new Set(TIPS.map(z => z.id)); const add = j.tips.filter(z => !ids.has(z.id));
        TIPS = [...add, ...TIPS].sort((a, b) => (b.date + b.ts).localeCompare(a.date + a.ts));
        if (j.cfg) { CFG = Object.assign({}, CFG_DEF, j.cfg, { ghToken: CFG.ghToken, gistId: j.cfg.gistId || CFG.gistId }); store.set('cfg', CFG); }
        saveTips(); if (SLATE) { rebuild(); updateTips(); } renderBanca(); toast(`${add.length} tips restauradas`);
      } catch (err) { toast('Backup inválido: ' + err.message); }
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#pop').hidden) { $('#pop').hidden = true; return; }
    if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (D) closeDrawer(); else if ($('#filters').classList.contains('open')) closeF(); }
    if (e.key === 'Enter' && D && e.target.closest('.dbox .edrow')) saveOverride();
    // Tab fica dentro da janela aberta (modal ou ficha)
    if (e.key === 'Tab') {
      const box = !$('#modal').hidden ? $('#mbox') : D ? $('#drawer') : null; if (!box) return;
      const f = [...box.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
      if (!f.length) return; const first = f[0], last = f.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    // busca rápida: Ctrl/⌘ + K ou "/"
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !e.target.closest('input,textarea,select'))) { if (SLATE) { e.preventDefault(); openSearch(); } }
  });
  const root = document.documentElement;
  const saved = store.get('theme', null); if (saved) root.dataset.theme = saved;
  $('#themeBtn').addEventListener('click', () => { const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; root.dataset.theme = dark ? 'light' : 'dark'; store.set('theme', root.dataset.theme); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.view === 'props') renderProps(); }, 150); });
  addEventListener('hashchange', route);
  addEventListener('scroll', () => { $('#pop').hidden = true; }, { passive: true });
  fillBooks();
  // instalar como app (Chrome/Edge/Android); no iPhone é pelo Compartilhar, explicado no Guia
  let deferredInstall = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch { } deferredInstall = null; $('#installBtn').hidden = true; });
  addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('App instalado'); });
}

bind();
route();
load();
// app instalável (só quando hospedado, por exemplo no GitHub Pages)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claude.ai') && !location.hostname.includes('claudeusercontent')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
