// Bot do Telegram do Black House (Supabase Edge Function, Deno).
// Lê a lista pronta que a coleta publica (bot.json) e responde aos comandos.
//
// Configuração: segredos da função (Edge Functions → Secrets) OU a tabela privada public.bot_config
// (key, value), lida com a chave de serviço que o Supabase já entrega à função:
//   TELEGRAM_BOT_TOKEN  token do @BotFather (obrigatório)
//   WEBHOOK_SECRET      senha qualquer; protege o webhook e o link de instalação (obrigatório)
//   ALLOWED_CHATS       IDs liberados, separados por vírgula (opcional; vazio = qualquer pessoa)
//   DATA_URL            opcional; padrão = bot.json do GitHub Pages
//
// Instalação (uma vez): abra  <url-da-função>?setup=<WEBHOOK_SECRET>  no navegador.

const APP_URL = 'https://gabrielcbjr29.github.io/black-house-props/';
type Cfg = { token: string; secret: string; allowed: string[]; dataUrl: string; at: number };
let CFG: Cfg | null = null;
async function cfg(): Promise<Cfg> {
  if (CFG && Date.now() - CFG.at < 60_000) return CFG;
  const v: Record<string, string> = {};
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url && key) {
    try {
      const r = await fetch(`${url}/rest/v1/bot_config?select=key,value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (r.ok) for (const x of await r.json()) v[x.key] = x.value;
    } catch (e) { console.error('bot_config', e); }
  }
  const get = (k: string) => Deno.env.get(k) || v[k] || '';
  CFG = { token: get('TELEGRAM_BOT_TOKEN'), secret: get('WEBHOOK_SECRET'), allowed: get('ALLOWED_CHATS').split(',').map(s => s.trim()).filter(Boolean),
    dataUrl: get('DATA_URL') || 'https://gabrielcbjr29.github.io/black-house-props/data/bot.json', at: Date.now() };
  return CFG;
}
// banco (REST do próprio Supabase, com a chave de serviço): testes do Modelo BH
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('banco indisponível');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const TG = async (m: string, body: unknown) => { const c = await cfg(); return fetch(`https://api.telegram.org/bot${c.token}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()); };

type Row = { id: string; n: string; t: string; o: string; home: boolean; g: string; h: string; m: string; s: 'o' | 'u'; l: number; p: number; q: number | null; d: number | null; b: string | null; k: number; e: number | null; gr: string; l10: [number, number] | null; l20: [number, number] | null; ss?: [number, number] | null; hh?: [number, number] | null; dv?: { r: number; of: number; ps: string; k: string } | null; pj: number; st: string; rl: string | null; nt?: number; sc: number; wy?: string[]; wn?: string[]; cd?: number; mb?: number; mn?: number };
type MStat = [number, number, number[], number | null];
type MPlayer = { n: string; t: string; o: string; home: boolean; h: string; g: string; st: string; gp: number; s: Record<string, MStat>; h2h: Record<string, number>[] };
type Data = { date: string; gen: string; demo: boolean; w: number; mdl?: Record<string, MPlayer>; games: { id: string; a: string; h: string; t: string; utc?: string; sp: number | null; to: number | null }[]; injuries: { n: string; t: string; st: string; no: string }[]; rows: Row[] };

let CACHE: { at: number; data: Data } | null = null;
async function data(): Promise<Data> {
  if (CACHE && Date.now() - CACHE.at < 120_000) return CACHE.data;
  const r = await fetch((await cfg()).dataUrl + '?t=' + Math.floor(Date.now() / 120_000), { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('dados indisponíveis (' + r.status + ')');
  CACHE = { at: Date.now(), data: await r.json() };
  return CACHE.data;
}

const MK: Record<string, string> = { PTS: 'pontos', REB: 'rebotes', AST: 'assistências', '3PM': 'bolas de 3', PRA: 'pts+reb+ast', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'arremessos convertidos', FGA: 'arremessos tentados', '2PM': 'de 2 convertidos', '2PA': 'de 2 tentados', '3PA': 'bolas de 3 tentadas', FTM: 'lances livres convertidos', FTA: 'lances livres tentados', STL: 'roubos', BLK: 'tocos', SB: 'roubos+tocos', TOV: 'erros', PF: 'faltas' };
// comando → mercados
const GROUPS: Record<string, { mk: string[]; title: string }> = {
  pontos: { mk: ['PTS'], title: 'Pontos' }, rebotes: { mk: ['REB'], title: 'Rebotes' }, assist: { mk: ['AST'], title: 'Assistências' }, assistencias: { mk: ['AST'], title: 'Assistências' },
  tres: { mk: ['3PM'], title: 'Bolas de 3' }, triplos: { mk: ['3PM'], title: 'Bolas de 3' },
  pra: { mk: ['PRA'], title: 'Pts+Reb+Ast' }, pr: { mk: ['PR'], title: 'Pts+Reb' }, pa: { mk: ['PA'], title: 'Pts+Ast' }, ra: { mk: ['RA'], title: 'Reb+Ast' },
  combinados: { mk: ['PRA', 'PR', 'PA', 'RA'], title: 'Combinados' },
  tentativas: { mk: ['FGA', '3PA', 'FTA', '2PA', '2PM', 'FGM'], title: 'Tentativas e convertidos' },
  convertidos: { mk: ['FGM', '2PM', 'FTM'], title: 'Arremessos convertidos' },
  defesa: { mk: ['STL', 'BLK', 'SB', 'TOV'], title: 'Roubos, tocos e erros' },
  roubos: { mk: ['STL'], title: 'Roubos' }, tocos: { mk: ['BLK'], title: 'Tocos' }, erros: { mk: ['TOV'], title: 'Erros' },
};
const WORD2GROUP: Record<string, string> = { pontos: 'pontos', pts: 'pontos', rebotes: 'rebotes', reb: 'rebotes', assist: 'assist', ast: 'assist', assistencias: 'assist', tres: 'tres', '3': 'tres', triplos: 'tres', pra: 'pra', pr: 'pr', pa: 'pa', ra: 'ra', tentativas: 'tentativas', convertidos: 'convertidos', defesa: 'defesa', roubos: 'roubos', tocos: 'tocos', erros: 'erros', combinados: 'combinados' };

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace('.', ',');
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const pc = (x: number | null) => x == null ? '–' : Math.round(x * 100) + '%';
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
const dateBR = (d: string) => { const [, m, dd] = d.split('-'); const wd = new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''); return `${wd} ${dd}/${m}`; };
const hourBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const FOOT = '\n<i>🔞 18+ · Confira lesões, quinteto e a odd da sua casa. O Ministério da Fazenda adverte: apostas podem causar dependência.</i>';
const GRADE: Record<string, string> = { 'A+': '🔥 A+', A: '✅ A', B: '➖ B', C: '⚪ C' };
const bar = (p: number, n = 10) => { const k = Math.max(0, Math.min(n, Math.round(p * n))); return '▰'.repeat(k) + '▱'.repeat(n - k); };
const dots = (h: [number, number] | null) => h ? '●'.repeat(h[0]) + '○'.repeat(Math.max(0, h[1] - h[0])) + ` ${h[0]}/${h[1]}` : '';
const PAGE = 5;
// faixa de odd das listas (odd da casa ou, sem casa, a odd justa): mesmo critério do PropFinder (-250 a +250)
const ODD_MIN = 1.4, ODD_MAX = 3.5;
const oddOf = (r: Row) => r.d ?? (r.p > 0 ? 1 / r.p : 99);
const inRange = (r: Row) => { const o = oddOf(r); return o >= ODD_MIN - 1e-9 && o <= ODD_MAX + 1e-9; };
const RANGE_TXT = ' · odds 1,40–3,50';
// cards em imagem (gerados no publicar do GitHub Pages)
const keyOf = (r: Row) => `${r.id}-${r.m}-${r.s}`;
const cardUrl = (d: Data, r: Row) => `${APP_URL}data/cards/${keyOf(r)}.jpg?v=${encodeURIComponent(d.gen)}`;
function caption(r: Row) {
  const vs = r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`;
  const odd = r.d ? `odd <b>${n2(r.d)}</b> ${esc(r.b ?? '')}${r.k ? ' (bolsa)' : ''}` : `odd justa <b>${n2(1 / r.p)}</b>`;
  return `<b>${esc(r.gr)}${r.nt != null ? ' · Nota ' + r.nt : ''} · ${esc(r.n)}</b>\n${r.s === 'o' ? 'Mais de' : 'Menos de'} ${n1(r.l)} ${MK[r.m] ?? r.m} · ${odd}\n<i>${vs} · ${r.h}</i>\n<i>🔞 18+ · Aposte com responsabilidade</i>`;
}
// ---------- Modelo BH: chance de qualquer linha pelo modelo (binomial negativa) ----------
const STATW: Record<string, { k: string[]; lb: string }> = {
  pontos: { k: ['pts'], lb: 'pontos' }, pts: { k: ['pts'], lb: 'pontos' }, rebotes: { k: ['reb'], lb: 'rebotes' }, reb: { k: ['reb'], lb: 'rebotes' },
  assist: { k: ['ast'], lb: 'assistências' }, assistencias: { k: ['ast'], lb: 'assistências' }, ast: { k: ['ast'], lb: 'assistências' },
  tres: { k: ['tpm'], lb: 'bolas de 3' }, '3': { k: ['tpm'], lb: 'bolas de 3' }, triplos: { k: ['tpm'], lb: 'bolas de 3' }, '3pm': { k: ['tpm'], lb: 'bolas de 3' },
  tentativas: { k: ['fga'], lb: 'arremessos tentados' }, arremessos: { k: ['fga'], lb: 'arremessos tentados' }, fga: { k: ['fga'], lb: 'arremessos tentados' },
  '3t': { k: ['tpa'], lb: 'bolas de 3 tentadas' }, '3pa': { k: ['tpa'], lb: 'bolas de 3 tentadas' }, 'tres tentadas': { k: ['tpa'], lb: 'bolas de 3 tentadas' }, '3 tentadas': { k: ['tpa'], lb: 'bolas de 3 tentadas' }, 'tentativas 3': { k: ['tpa'], lb: 'bolas de 3 tentadas' },
  lances: { k: ['fta'], lb: 'lances livres tentados' }, lt: { k: ['fta'], lb: 'lances livres tentados' }, fta: { k: ['fta'], lb: 'lances livres tentados' }, 'lances tentados': { k: ['fta'], lb: 'lances livres tentados' },
  ltc: { k: ['ftm'], lb: 'lances livres convertidos' }, ftm: { k: ['ftm'], lb: 'lances livres convertidos' }, 'lances convertidos': { k: ['ftm'], lb: 'lances livres convertidos' },
  '2t': { k: ['twoa'], lb: 'arremessos de 2 tentados' }, '2pa': { k: ['twoa'], lb: 'arremessos de 2 tentados' }, '2 tentadas': { k: ['twoa'], lb: 'arremessos de 2 tentados' },
  '2pm': { k: ['twom'], lb: 'arremessos de 2 convertidos' }, convertidos: { k: ['fgm'], lb: 'arremessos convertidos' }, fgm: { k: ['fgm'], lb: 'arremessos convertidos' }, cestas: { k: ['fgm'], lb: 'arremessos convertidos' },
  roubos: { k: ['stl'], lb: 'roubos' }, tocos: { k: ['blk'], lb: 'tocos' }, erros: { k: ['tov'], lb: 'erros' },
  pra: { k: ['pts', 'reb', 'ast'], lb: 'pts+reb+ast' }, pr: { k: ['pts', 'reb'], lb: 'pts+reb' }, pa: { k: ['pts', 'ast'], lb: 'pts+ast' }, ra: { k: ['reb', 'ast'], lb: 'reb+ast' },
};
const STAT_KEY = (k: string[]) => k.join('+');
const statByKey = (key: string) => Object.values(STATW).find(x => STAT_KEY(x.k) === key);
// P(X > linha) com X ~ binomial negativa de média mu e dispersão k (var = mu + mu²/k)
function nbOver(mu: number, k: number, line: number) {
  mu = Math.max(mu, .01); const thr = Math.floor(line);
  if (k > 400) { let p = Math.exp(-mu), c = 0; for (let x = 0; x <= thr; x++) { c += p; p *= mu / (x + 1); } return Math.max(0, Math.min(1, 1 - c)); }
  let p = Math.pow(k / (k + mu), k), c = 0; const q = mu / (k + mu);
  for (let x = 0; x <= thr; x++) { c += p; p *= (x + k) / (x + 1) * q; }
  return Math.max(0, Math.min(1, 1 - c));
}
function modelDist(m: MPlayer, keys: string[]) {
  const parts = keys.map(k => m.s[k]).filter(Boolean); if (parts.length !== keys.length) return null;
  const mu = parts.reduce((a, x) => a + x[0], 0);
  if (parts.length === 1) return { mu, k: parts[0][1] };
  // combinados: soma das variâncias com 10% a mais pela correlação positiva entre as estatísticas
  const v = parts.reduce((a, x) => a + x[0] + x[0] * x[0] / x[1], 0) * 1.1;
  return { mu, k: v > mu ? mu * mu / (v - mu) : 500 };
}
const sumK = (vals: Record<string, number>, keys: string[]) => keys.reduce((a, k) => a + (vals[k] ?? 0), 0);
const conf = (p: number) => p >= .62 ? 'alta' : p >= .56 ? 'média' : 'baixa (perto de 50/50)';

async function modeloCmd(d: Data, rest: string[], chatId: number): Promise<Out> {
  const back = { inline_keyboard: [[BTN('📒 Meus testes', '/testes'), BTN('🧠 Como usar', '/modelo')], [BTN('🏠 Menu', '/menu')]] };
  if (!d.mdl || !Object.keys(d.mdl).length) return { text: 'O Modelo BH ainda não rodou para os jogos de hoje. Tente depois da próxima atualização.', kb: { inline_keyboard: [HOME] } };
  if (!rest.length) return { text: `<b>🧠 MODELO BH</b>
Projeção e chance de qualquer linha pelo modelo treinado para cada mercado: forma, minutos, defesa contra a posição, ritmo, mando, descanso, confronto direto e desfalques.

<b>Como usar</b>
<code>/modelo brunson tentativas 17,5</code>
<code>/modelo curry 3 tentadas 9,5</code>
<code>/modelo sengun lances 4,5</code>
<code>/modelo jokic pra 48,5</code>
Sem a linha, mostra a projeção e as linhas mais comuns.

<b>Mercados</b>: pontos, rebotes, assist, tres, <b>tentativas</b>, <b>3 tentadas</b>, <b>lances</b> (tentados), ltc (lances convertidos), 2t, convertidos, roubos, tocos, erros, pra, pr, pa, ra.

📒 Toda linha que você manda vira um <b>teste</b>: no dia seguinte eu confiro o resultado sozinho. Veja em /testes.`, kb: back };
  // linha (último número), mercado (1 ou 2 palavras antes) e jogador (o resto)
  const toks = rest.map(t => t.toLowerCase());
  let line: number | null = null;
  if (/^\d+([.,]\d+)?$/.test(toks[toks.length - 1] ?? '')) { line = parseFloat(toks.pop()!.replace(',', '.')); if (!Number.isInteger(line - .5)) line = Math.floor(line) + .5; }
  let st: { k: string[]; lb: string } | undefined;
  for (const n of [2, 1]) { if (toks.length > n - 1) { const w = norm(toks.slice(-n).join(' ')); if (STATW[w]) { st = STATW[w]; toks.splice(-n); break; } } }
  if (!st) { const w = toks.find(t => statByKey(t)); if (w) { st = statByKey(w); toks.splice(toks.indexOf(w), 1); } }
  if (!st) return { text: 'Não entendi o mercado. Exemplo: <code>/modelo brunson tentativas 17,5</code>', kb: back };
  const q = toks.join(' ');
  let pid: string | undefined;
  if (q.startsWith('#')) pid = q.slice(1);
  else {
    const nq = norm(q); if (nq.length < 3) return { text: 'Digite pelo menos 3 letras do nome do jogador.', kb: back };
    const hits = Object.entries(d.mdl).filter(([, m]) => norm(m.n).includes(nq));
    if (!hits.length) return { text: `Não achei <b>${esc(q)}</b> nos jogos de hoje (ou ele está fora).`, kb: back };
    if (hits.length > 1) return { text: `Achei ${hits.length} jogadores. Qual deles?`, kb: { inline_keyboard: [...chunk(hits.slice(0, 8).map(([id, m]) => BTN(`${m.n} (${m.t})`, `/modelo #${id} ${STAT_KEY(st!.k)}${line != null ? ' ' + line : ''}`)), 2), [BTN('🏠 Menu', '/menu')]] } };
    pid = hits[0][0];
  }
  const m = d.mdl[pid!]; if (!m) return { text: 'Jogador não encontrado nos jogos de hoje.', kb: back };
  const dist = modelDist(m, st.k); if (!dist) return { text: 'Sem modelo para esse mercado.', kb: back };
  const vs = m.home ? `${m.t} x ${m.o}` : `${m.t} @ ${m.o}`;
  const v10 = st.k.length === 1 ? m.s[st.k[0]][2] : (m.s[st.k[0]][2] || []).map((_, i) => st!.k.reduce((a, k) => a + (m.s[k][2][i] ?? 0), 0));
  const szn = st.k.every(k => m.s[k][3] != null) ? st.k.reduce((a, k) => a + (m.s[k][3] as number), 0) : null;
  const h2h = (m.h2h || []).map(x => sumK(x, st!.k));
  const head = `<b>🧠 MODELO BH · ${esc(m.n)}</b>\n<i>${vs} · ${m.h}${m.st === 'questionable' ? ' · 🟡 em dúvida' : ''}</i>\n`;
  if (line == null) {
    const base = Math.floor(dist.mu);
    const ls = [base - 1.5, base - .5, base + .5, base + 1.5].filter(x => x > 0);
    const rows = ls.map(l => { const po = nbOver(dist.mu, dist.k, l); return `${n1(l).padStart(5)}  mais ${String(Math.round(po * 100)).padStart(2)}%  menos ${String(Math.round((1 - po) * 100)).padStart(2)}%`; }).join('\n');
    return { text: head + `\n<b>${st.lb}</b>\nProjeção <b>${n1(Math.round(dist.mu * 10) / 10)}</b>${szn != null ? ` · média na temporada ${n1(Math.round(szn * 10) / 10)}` : ''}\n<pre>LINHA  CHANCE PELO MODELO\n${rows}</pre>\nÚltimos ${v10.length}: ${v10.join(' · ')}\n\nToque numa linha para registrar o teste:`,
      kb: { inline_keyboard: [ls.map(l => BTN(n1(l), `/modelo #${pid} ${STAT_KEY(st!.k)} ${l}`)), ...back.inline_keyboard] } };
  }
  const po = nbOver(dist.mu, dist.k, line), side = po >= .5 ? 'o' : 'u', ps = Math.max(po, 1 - po);
  const hitsL10 = v10.filter(v => side === 'o' ? v > line! : v < line!).length;
  const hitsH = h2h.filter(v => side === 'o' ? v > line! : v < line!).length;
  const dots10 = v10.slice().reverse().map(v => (side === 'o' ? v > line! : v < line!) ? '●' : '○').join('');
  // registra o teste (um por jogador/mercado/linha/dia)
  let reg = '';
  try {
    const r = await sb('model_tests?on_conflict=chat_id,date,pid,stat,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ chat_id: chatId, date: d.date, pid, name: m.n, team: m.t, opp: m.o, stat: STAT_KEY(st.k), line, side, p: Math.round(ps * 1000) / 1000, mu: Math.round(dist.mu * 100) / 100 }) });
    reg = `📒 Teste <b>#${r?.[0]?.id ?? ''}</b> registrado: confiro amanhã com o resultado (/testes).`;
  } catch (e) { reg = '<i>(não consegui registrar o teste agora)</i>'; }
  return { text: head + `
<b>${st.lb} · linha ${n1(line)}</b>
<blockquote>Projeção <b>${n1(Math.round(dist.mu * 10) / 10)}</b>${szn != null ? `  ·  temporada ${n1(Math.round(szn * 10) / 10)}` : ''}
⬆️ Mais de ${n1(line)}: <b>${Math.round(po * 100)}%</b>  ${bar(po)}
⬇️ Menos de ${n1(line)}: <b>${Math.round((1 - po) * 100)}%</b>
📊 Últimos ${v10.length}: ${dots10} <b>${hitsL10}/${v10.length}</b> ${side === 'o' ? 'acima' : 'abaixo'}
<i>${v10.slice().reverse().join(' · ')}</i>${h2h.length ? `\n🆚 Contra o ${m.o}: <b>${hitsH}/${h2h.length}</b> (${h2h.join(' · ')})` : ''}</blockquote>
👉 Lado do modelo: <b>${side === 'o' ? 'MAIS' : 'MENOS'} de ${n1(line)}</b> · ${Math.round(ps * 100)}% · confiança ${conf(ps)}
${reg}
<i>Modelo testado nesta temporada: erra 8% a 10% menos que a média dos últimos 10. Contra as linhas da Kalshi ainda não mostrou vantagem; em tentativas, o teste é este.</i>`, kb: back };
}

// ---------- testes: confere sozinho com os resultados publicados ----------
const RES_IDX: Record<string, (a: number[]) => number> = { pts: a => a[1], reb: a => a[2], ast: a => a[3], stl: a => a[4], blk: a => a[5], tov: a => a[6], fgm: a => a[8], fga: a => a[9], tpm: a => a[10], tpa: a => a[11], ftm: a => a[12], fta: a => a[13], twoa: a => a[9] - a[11], twom: a => a[8] - a[10] };
async function settle(rows: any[]) {
  const open = rows.filter(r => !r.settled_at);
  if (!open.length) return;
  const res = await fetch(APP_URL + 'data/results.json?t=' + Math.floor(Date.now() / 300_000)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!res?.stats) return;
  for (const r of open) {
    if (!res.dates?.includes(r.date)) continue; // dia ainda sem box score
    const a = res.stats[r.date]?.[r.pid];
    const keys = String(r.stat).split('+');
    let patch: Record<string, unknown>;
    if (!a || !(a[0] > 0)) patch = { settled_at: new Date().toISOString(), hit: null, result: null }; // não jogou: anulado
    else { const v = keys.reduce((s, k) => s + (RES_IDX[k]?.(a) ?? 0), 0); patch = { settled_at: new Date().toISOString(), result: v, hit: v === +r.line ? null : (r.side === 'o' ? v > +r.line : v < +r.line) }; }
    Object.assign(r, patch);
    try { await sb(`model_tests?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); } catch { /* tenta de novo na próxima */ }
  }
}
function resumo(rows: any[], titulo: string) {
  const done = rows.filter(r => r.settled_at && r.hit != null);
  const pct1 = (a: any[]) => a.length ? Math.round(a.filter(r => r.hit).length / a.length * 1000) / 10 : 0;
  const roi = (a: any[]) => a.length ? Math.round((a.filter(r => r.hit).length * 1.87 - a.length) / a.length * 1000) / 10 : 0;
  const band = (lo: number, hi: number) => done.filter(r => +r.p >= lo && +r.p < hi);
  const by: Record<string, any[]> = {}; for (const r of done) (by[r.stat] ||= []).push(r);
  const lines = Object.entries(by).sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([k, a]) => `${(statByKey(k)?.lb ?? k).padEnd(24).slice(0, 24)} ${String(a.length).padStart(3)}  ${String(pct1(a)).padStart(5)}%`).join('\n');
  return `<b>${titulo}</b>
<blockquote>✅ <b>${done.filter(r => r.hit).length}</b> · ❌ <b>${done.filter(r => !r.hit).length}</b> · ⏳ ${rows.filter(r => !r.settled_at).length} aguardando
Acerto: <b>${pct1(done)}%</b>${done.length ? ` · se fosse odd 1,87: ${roi(done) >= 0 ? '+' : ''}${String(roi(done)).replace('.', ',')}%` : ''}
Confiança alta (62%+): ${band(.62, 1.01).length} testes, ${pct1(band(.62, 1.01))}%
Confiança média (56–62%): ${band(.56, .62).length} testes, ${pct1(band(.56, .62))}%
Confiança baixa: ${band(0, .56).length} testes, ${pct1(band(0, .56))}%</blockquote>${lines ? `\n<pre>MERCADO                    N  ACERTO\n${lines}</pre>` : ''}
<i>Para lucrar com odd ~1,87 é preciso acertar 53,5% ou mais. Amostra pequena engana: o número começa a valer com 100+ testes.</i>`;
}
async function testesCmd(chatId: number, rest: string[]): Promise<Out> {
  const all = norm(rest[0] ?? '') === 'todos';
  let rows: any[] = [];
  try { rows = await sb(`model_tests?select=*${all ? '' : `&chat_id=eq.${chatId}`}&order=created_at.desc&limit=${all ? 1000 : 300}`) ?? []; } catch (e) { return { text: 'Não consegui ler os testes agora.', kb: { inline_keyboard: [HOME] } }; }
  await settle(rows);
  if (!rows.length) return { text: 'Nenhum teste ainda. Mande uma linha da sua casa, por exemplo:\n<code>/modelo brunson tentativas 17,5</code>', kb: { inline_keyboard: [[BTN('🧠 Como usar', '/modelo')], HOME] } };
  const last = rows.slice(0, 12).map(r => {
    const ic = !r.settled_at ? '⏳' : r.hit == null ? '➖' : r.hit ? '✅' : '❌';
    return `${ic} ${esc(r.name)} · ${r.side === 'o' ? 'mais' : 'menos'} ${n1(+r.line)} ${statByKey(r.stat)?.lb ?? r.stat} <i>(${Math.round(+r.p * 100)}%${r.result != null ? ', fez ' + n1(+r.result) : ''})</i>`;
  }).join('\n');
  return { text: resumo(rows, all ? '📒 TESTES DO MODELO BH · TODOS OS USUÁRIOS' : '📒 SEUS TESTES DO MODELO BH') + `\n\n<b>Últimos</b>\n${last}`,
    kb: { inline_keyboard: [[BTN(all ? '👤 Só os meus' : '👥 De todos', all ? '/testes' : '/testes todos'), BTN('🔄 Atualizar', all ? '/testes todos' : '/testes')], [BTN('🧠 Modelo BH', '/modelo'), BTN('🏠 Menu', '/menu')]] } };
}
// ---------- Top 10 do Modelo BH (tentativas/convertidos e reb+ast) ----------
const MT: Record<string, { mk: string[]; title: string; cmd: string; ic: string }> = {
  tent: { mk: ['FGA', '3PA', 'FTA', '2PA', '2PM', 'FGM'], title: 'TENTATIVAS E CONVERTIDOS', cmd: '/toptentativas', ic: '🏹' },
  ra: { mk: ['RA'], title: 'REBOTES + ASSISTÊNCIAS', cmd: '/topra', ic: '🙌' },
};
// ranking: Nota BH (chance do modelo, L10/L20/temporada, confronto, defesa x posição), desempate pelo L10; um por jogador
function modelTop(d: Data, mk: string[], n = 10) {
  // só jogador de rotação (24+ min) e linhas que as casas costumam abrir (mesmo critério dos cards)
  const MIN_LINE: Record<string, number> = { FGA: 7.5, '3PA': 2.5, FTA: 2.5, '2PA': 4.5, '2PM': 2.5, FGM: 3.5, RA: 4.5 };
  const rows = d.rows.filter(r => r.mb && mk.includes(r.m) && r.st !== 'questionable' && r.p <= .85 && (r.mn ?? 0) >= 24 && r.l >= (MIN_LINE[r.m] ?? 0)).sort((a, b) => b.sc - a.sc);
  const seen = new Set<string>(), out: Row[] = [];
  for (const r of rows) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (out.length >= n) break; }
  return out;
}
const MT_NOTE = '\n<i>📏 Só jogadores de rotação (24+ min). Linha de referência = mediana dos últimos 15 jogos (estilo casa). Confira a linha da sua casa: se for diferente, use /modelo para ver a chance nela.</i>';
function compact(r: Row, i: number) {
  const over = r.s === 'o', vs = r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`;
  const good = r.dv?.r ? (over ? r.dv.r >= r.dv.of - 5 : r.dv.r <= 6) : false, bad = r.dv?.r ? (over ? r.dv.r <= 6 : r.dv.r >= r.dv.of - 5) : false;
  return `<b>${i}. ${esc(r.n)}</b> <i>${vs} · ${r.h}</i>
${over ? '⬆️ Mais' : '⬇️ Menos'} de <b>${n1(r.l)}</b> ${MK[r.m] ?? r.m} · <b>${pc(r.p)}</b> · Nota <b>${r.nt ?? '–'}</b>
📊 L10 ${hitTxt(r.l10)} · Temp. ${hitTxt(r.ss)} · vs ${r.o} ${hitTxt(r.hh)} · 🧠 ${n1(Math.round(r.pj * 10) / 10)} · ⏱️ ${r.mn ?? '–'} min${r.dv?.r ? ` · 🛡️ ${r.dv.r}ª/${r.dv.of}${good ? ' favorável' : bad ? ' difícil' : ''}` : ''}`;
}
function topText(d: Data, key: string) {
  const T = MT[key], top = modelTop(d, T.mk);
  if (!top.length) return null;
  return `<b>${T.ic} TOP 10 MODELO BH · ${T.title}</b>\n<i>${dateBR(d.date)} · ${d.games.length} jogos · atualizado ${hourBR(d.gen)}</i>\n\n` + top.map((r, i) => compact(r, i + 1)).join('\n\n') + '\n' + MT_NOTE + FOOT;
}
const subKb = (s: { tent: boolean; ra: boolean } | null) => ({ inline_keyboard: [
  [BTN(`${s?.tent ? '✅' : '⬜'} Top 10 Tentativas`, '/receber tent'), BTN(`${s?.ra ? '✅' : '⬜'} Top 10 Reb+Ast`, '/receber ra')],
  [BTN('🔕 Parar de receber', '/receber parar'), BTN('🏠 Menu', '/menu')]] });
async function receberCmd(chatId: number, rest: string[]): Promise<Out> {
  const a = norm(rest[0] ?? '');
  let s: { tent: boolean; ra: boolean } | null = null;
  try { s = (await sb(`bot_subs?chat_id=eq.${chatId}&select=tent,ra`))?.[0] ?? null; } catch { return { text: 'Não consegui acessar as inscrições agora.', kb: { inline_keyboard: [HOME] } }; }
  let next = s;
  if (!a) next = s ?? { tent: true, ra: true };
  else if (a === 'parar') next = { tent: false, ra: false };
  else if (a === 'tent' || a === 'ra') next = { ...(s ?? { tent: false, ra: false }), [a]: !(s?.[a as 'tent' | 'ra']) };
  if (JSON.stringify(next) !== JSON.stringify(s)) await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chat_id: chatId, ...next, updated_at: new Date().toISOString() }) });
  const on = [next?.tent && '🏹 Top 10 Tentativas e convertidos', next?.ra && '🙌 Top 10 Rebotes + assistências'].filter(Boolean);
  return { text: `<b>📬 ENVIO DIÁRIO DO MODELO BH</b>\n\n${on.length ? `Você recebe todo dia, por volta das 19h (depois da atualização com escalações e lesões):\n${on.map(x => '• ' + x).join('\n')}` : 'Você não está recebendo nada no momento.'}\n\nToque para ligar ou desligar cada lista:`, kb: subKb(next) };
}
// envio do dia para os inscritos (chamado pelo GitHub depois de publicar os dados)
// minHour: só envia se os dados foram gerados depois dessa hora (Brasília) — espera a rodada das 18h30
async function pushDaily(force = false, minHour = 0) {
  CACHE = null;
  const d = await data();
  const flag = `PUSH_${d.date}`;
  if (!force) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (d.date !== today) return { ok: true, skip: `dados de ${d.date}, hoje é ${today}` };
    const h = +new Date(d.gen).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });
    if (minHour && h < minHour) return { ok: true, skip: `dados das ${h}h ainda; espero a rodada das 18h30` };
    const done = await sb(`bot_config?key=eq.${flag}&select=key`).catch(() => []); if (done?.length) return { ok: true, skip: 'já enviado hoje' };
  }
  const subs: { chat_id: number; tent: boolean; ra: boolean }[] = await sb('bot_subs?select=chat_id,tent,ra&or=(tent.eq.true,ra.eq.true)') ?? [];
  const txt = { tent: topText(d, 'tent'), ra: topText(d, 'ra') };
  let sent = 0;
  for (const s of subs) for (const k of ['tent', 'ra'] as const) {
    if (!s[k] || !txt[k]) continue;
    const r = await TG('sendMessage', { chat_id: s.chat_id, text: txt[k]!.slice(0, 4090), parse_mode: 'HTML', disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[BTN('📋 Ver com detalhes', MT[k].cmd), BTN('🖼️ Cards', `/cards`)], [BTN('📬 Envio diário', '/receber'), BTN('🏠 Menu', '/menu')]] } });
    if (r.ok) sent++;
    await new Promise(res => setTimeout(res, 60));
  }
  await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: flag, value: String(sent), updated_at: new Date().toISOString() }) }).catch(() => null);
  return { ok: true, date: d.date, inscritos: subs.length, mensagens: sent };
}
const hitTxt = (h?: [number, number] | null) => h?.[1] ? `<b>${h[0]}/${h[1]}</b>` : '–';

type Out = { text: string; kb?: unknown };
const BTN = (text: string, data: string) => ({ text, callback_data: data.slice(0, 64) });
const HOME = [BTN('🏠 Menu', '/menu'), BTN('🔄 Atualizar', 'r:1:/menu')];
const home = (cmd: string, pg = 1) => [BTN('🏠 Menu', '/menu'), BTN('🔄 Atualizar', `r:${pg}:${cmd}`)];

function card(r: Row, i: number) {
  const over = r.s === 'o';
  const side = over ? '⬆️ <b>Mais de ' + n1(r.l) + '</b>' : '⬇️ <b>Menos de ' + n1(r.l) + '</b>';
  const vs = r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`;
  const odd = r.d ? `💵 <code>@${n2(r.d)}</code> ${esc(r.b ?? '')}${r.k ? ' <i>(bolsa)</i>' : ''}` : `💵 odd justa <code>@${n2(1 / r.p)}</code> <i>(sem casa)</i>`;
  const ev = r.e == null ? '' : ` · EV <b>${r.e >= 0 ? '+' : ''}${(r.e * 100).toFixed(1).replace('.', ',')}%</b>`;
  const nota = r.nt != null ? ` · Nota <b>${r.nt}</b>` : '';
  // três acertos lado a lado: últimos 10 · temporada · contra o adversário
  const hits = `📊 L10 ${hitTxt(r.l10)} · Temp. ${hitTxt(r.ss)} · vs ${r.o} ${hitTxt(r.hh)}\n🧠 ${r.mb ? 'Modelo BH' : 'Projeção'}: <b>${n1(Math.round(r.pj * 10) / 10)}</b>`;
  let def = '';
  if (r.dv?.r) {
    const good = over ? r.dv.r >= r.dv.of - 5 : r.dv.r <= 6, bad = over ? r.dv.r <= 6 : r.dv.r >= r.dv.of - 5;
    def = `\n🛡️ Defesa ${r.o}: ${r.dv.r}ª/${r.dv.of} contra ${r.dv.ps} em ${esc(r.dv.k)}${good ? ' · <b>favorável</b>' : bad ? ' · <i>difícil</i>' : ''}`;
  }
  // por que sim / por que não (sem repetir o que as linhas acima já mostram)
  const dup = /^(Bateu em|Defesa do|Contra o )/;
  const wy = (r.wy ?? []).filter(t => !dup.test(t)).slice(0, 2).map(t => `✅ ${esc(t)}`);
  const wn = (r.wn ?? []).filter(t => !dup.test(t)).slice(0, 1).map(t => `⚠️ ${esc(t)}`);
  if (!r.wn && r.e != null && r.e > .15) wn.push('⚠️ <i>Muito acima do mercado: confira notícias</i>');
  if (r.st === 'questionable' && !wn.some(t => t.includes('dúvida'))) wn.push('🟡 <i>Jogador em dúvida</i>');
  const why = [...wy, ...wn];
  return `<blockquote><b>${i}. ${esc(r.n)}</b>  <i>${vs} · ${r.h}</i>
${side} ${MK[r.m] ?? r.m}
${GRADE[r.gr] ?? r.gr}${nota}  ${bar(r.p)} <b>${pc(r.p)}</b>${r.q != null ? ` <i>(mercado ${pc(r.q)})</i>` : ''}
${odd}${ev}
${hits}${def}${why.length ? '\n' + why.join('\n') : ''}</blockquote>`;
}
function header(d: Data, title: string, extra = '') {
  return `<b>${title}</b>\n<i>${dateBR(d.date)} · ${d.games.length} jogos · atualizado ${hourBR(d.gen)}${d.demo ? ' · demonstração' : ''}${extra}</i>\n`;
}
function list(d: Data, rows: Row[], title: string, n: number, cmd: string, page = 1, onePerPlayer = true, empty = '', note = ''): Out {
  const seen = new Set<string>(), all: Row[] = [];
  for (const r of rows) { if (onePerPlayer && seen.has(r.id)) continue; seen.add(r.id); all.push(r); if (all.length >= n) break; }
  if (!all.length) return { text: header(d, title, note) + '\nNenhuma linha boa nesse filtro agora.' + (empty ? '\n' + empty : '') + '\n' + FOOT, kb: { inline_keyboard: [HOME] } };
  const pages = Math.ceil(all.length / PAGE), pg = Math.max(1, Math.min(pages, page));
  const slice = all.slice((pg - 1) * PAGE, pg * PAGE);
  const body = slice.map((r, i) => card(r, (pg - 1) * PAGE + i + 1)).join('\n');
  const nav = [];
  if (pg > 1) nav.push(BTN('◀ Anteriores', `p:${pg - 1}:${cmd}`));
  if (pages > 1) nav.push(BTN(`${pg}/${pages}`, `p:${pg}:${cmd}`));
  if (pg < pages) nav.push(BTN('Próximas ▶', `p:${pg + 1}:${cmd}`));
  const pics = slice.map((r, i) => r.cd ? BTN(`🖼️ ${(pg - 1) * PAGE + i + 1}`, `i:${keyOf(r)}`) : null).filter(Boolean) as { text: string; callback_data: string }[];
  return { text: header(d, title, note + (pages > 1 ? ` · página ${pg}/${pages}` : '')) + '\n' + body + (pics.length ? '\n<i>🖼️ toque no número para ver o card em imagem</i>' : '') + '\n' + FOOT, kb: { inline_keyboard: [...(pics.length ? [pics] : []), ...(nav.length ? [nav] : []), home(cmd, pg)] } };
}
const clampN = (s: string | undefined, def = 10) => { const x = parseInt(s ?? '', 10); return Number.isFinite(x) ? Math.max(1, Math.min(20, x)) : def; };

function multipla(d: Data, arg: string | undefined): Out {
  const v = arg ? parseFloat(arg.replace(',', '.')) : NaN;
  const target = Number.isFinite(v) && v >= 1.3 && !(Number.isInteger(v) && v <= 8) ? v : null;
  const legs = target ? 8 : Math.max(2, Math.min(6, Number.isFinite(v) ? v : 3));
  const cand = d.rows.filter(r => (r.gr === 'A+' || r.gr === 'A') && r.d && r.d >= ODD_MIN && r.d <= ODD_MAX && (r.e ?? 0) >= 0 && (r.e ?? 0) <= .15 && r.st === 'ok')
    .sort((a, b) => (a.k - b.k) || (b.sc - a.sc));
  const pick: Row[] = [], games = new Set<string>(); let odd = 1, p = 1;
  for (const r of cand) { if (target ? odd >= target : pick.length >= legs) break; if (pick.length >= 8) break; if (games.has(r.g)) continue; games.add(r.g); pick.push(r); odd *= r.d!; p *= r.p; }
  const kb = { inline_keyboard: [[BTN('2 pernas', '/multipla 2'), BTN('3 pernas', '/multipla 3'), BTN('4 pernas', '/multipla 4')], [BTN('Odd 3,00', '/multipla 3,0'), BTN('Odd 5,00', '/multipla 5,0'), BTN('Odd 10,00', '/multipla 10,0')], home('/multipla ' + (arg ?? '3'))] };
  if (pick.length < 2) return { text: header(d, '🎟️ MÚLTIPLA') + '\nNão há linhas fortes suficientes em jogos diferentes agora.\n' + FOOT, kb };
  const kal = pick.some(r => r.k);
  const legsTxt = pick.map((r, i) => `${i + 1}. <b>${esc(r.n)}</b>  <i>${r.h}</i>\n    ${r.s === 'o' ? '⬆️ mais de' : '⬇️ menos de'} ${n1(r.l)} ${MK[r.m]}  <code>@${n2(r.d!)}</code>`).join('\n');
  const evx = (p * odd - 1) * 100;
  return { text: header(d, `🎟️ MÚLTIPLA DE ${pick.length} PERNAS`, target ? ` · alvo ${n2(target)}` : '') + `\n<blockquote>${legsTxt}</blockquote>
<b>Odd combinada  <code>${n2(odd)}</code></b>
${bar(p)} chance ${pc(p)} · EV ${evx >= 0 ? '+' : ''}${evx.toFixed(1).replace('.', ',')}%
<i>Uma perna por jogo, nota A ou A+. Pernas tratadas como independentes: use stake menor que a de uma simples.${kal ? ' Algumas odds são da bolsa (Kalshi): confira a da sua casa.' : ''}</i>
` + FOOT, kb };
}

const HELP = `<b>📖 COMANDOS</b>

<b>Melhores do dia</b>
/top · /top 20 · todos os mercados
/valor · odd de casa com EV de 3% a 15%
/seguras · chance de 65% ou mais

<b>Por mercado</b> <i>(some um número: /rebotes 15)</i>
/pontos /rebotes /assist /tres
/pra /pr /pa /ra /combinados
/tentativas · tentados (total, de 3, de 2, lances) e convertidos
/convertidos · arremessos convertidos
/defesa · roubos, tocos e erros

<b>Filtros</b>
/mais pontos · /menos rebotes
/jogo LAL · /jogador brunson

<b>Rodada</b>
/jogos · /desfalques · /resumo
/multipla 3 · /multipla 4,5
/cards · /cards 10 · melhores do dia em imagem

<b>Modelo BH</b>
/modelo brunson tentativas 17,5 · chance pelo modelo + teste
/testes · seus testes conferidos · /testes todos
/toptentativas · top 10 em tentativas e convertidos
/topra · top 10 em rebotes + assistências
/receber · receber os dois tops todo dia
/app · app completo

<b>Como ler o cartão</b>
<b>Nota</b> 0–100: quanto os dados sustentam a entrada (chance, valor, acertos, confronto, defesa e mercado).
<b>L10 · Temp. · vs</b>: acertos nos últimos 10, na temporada e contra o adversário de hoje.
✅ motivos a favor · ⚠️ ponto de atenção.
As listas mostram só odds entre 1,40 e 3,50.`;
const MENU = { inline_keyboard: [
  [BTN('🔥 Top do dia', '/top'), BTN('💰 Valor', '/valor'), BTN('🛡️ Seguras', '/seguras')],
  [BTN('🏀 Pontos', '/pontos'), BTN('🙌 Rebotes', '/rebotes'), BTN('🎯 Assist.', '/assist')],
  [BTN('👌 Bolas de 3', '/tres'), BTN('➕ PRA', '/pra'), BTN('🧩 Combinados', '/combinados')],
  [BTN('🏹 Tentativas', '/tentativas'), BTN('🧱 Defesa', '/defesa'), BTN('🎟️ Múltipla', '/multipla 3')],
  [BTN('🗓️ Jogos', '/jogos'), BTN('🚑 Desfalques', '/desfalques'), BTN('📋 Resumo', '/resumo')],
  [BTN('🏹 Top 10 Tentativas', '/toptentativas'), BTN('🙌 Top 10 Reb+Ast', '/topra')],
  [BTN('🧠 Modelo BH', '/modelo'), BTN('📒 Testes', '/testes'), BTN('📬 Envio diário', '/receber')],
  [BTN('🖼️ Cards do dia', '/cards')],
  [{ text: '📱 Abrir o app completo', url: APP_URL }],
] };

async function answer(text: string, chatId: number, page = 1): Promise<Out> {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = norm(rawCmd.replace(/^\//, '').replace(/@.*$/, ''));
  const arg = rest.join(' ');
  const raw = '/' + [cmd, ...rest].join(' ');
  if (cmd === 'start' || cmd === 'menu') {
    const d = await data().catch(() => null);
    const a = d ? d.rows.filter(r => r.gr === 'A+' || r.gr === 'A').length : 0;
    return { text: `<b>🏀 BLACK HOUSE · PROPS NBA</b>\n${d ? `<i>${dateBR(d.date)} · ${d.games.length} jogos · ${a} linhas nota A ou A+</i>\n` : ''}\nEscolha abaixo ou digite um comando (/ajuda).\n\n<i>Seu ID: <code>${chatId}</code></i>`, kb: MENU };
  }
  if (cmd === 'ajuda' || cmd === 'help' || cmd === 'comandos') return { text: HELP, kb: MENU };
  if (cmd === 'testes') return testesCmd(chatId, rest);
  if (cmd === 'receber' || cmd === 'envio') return receberCmd(chatId, rest);
  if (cmd === 'app') return { text: `📱 <b>App completo</b>\n${APP_URL}`, kb: { inline_keyboard: [[{ text: 'Abrir o app', url: APP_URL }], HOME] } };
  const d = await data();
  if (cmd === 'modelo') return modeloCmd(d, rest, chatId);
  if (cmd === 'toptentativas' || cmd === 'topra') { const k = cmd === 'topra' ? 'ra' : 'tent'; const T = MT[k]; return list(d, modelTop(d, T.mk), `${T.ic} TOP 10 MODELO BH · ${T.title}`, 10, raw, page, true, 'O Modelo BH ainda não rodou para os jogos de hoje.', ' · linha de referência'); }
  if (cmd === 'top') { const n = clampN(rest[0]); return list(d, d.rows.filter(inRange), `🔥 TOP ${n} DO DIA`, n, raw, page, true, '', RANGE_TXT); }
  if (cmd === 'valor') return list(d, d.rows.filter(r => r.d && !r.k && r.e != null && r.e >= .03 && r.e <= .15 && inRange(r)).sort((a, b) => (b.e! - a.e!)), '💰 VALOR COM ODD DE CASA', clampN(rest[0]), raw, page, true, '⏳ As odds das casas entram perto de cada jogo (até 2h30 antes). Tente mais perto do primeiro jogo ou veja o Top do dia.', RANGE_TXT);
  if (cmd === 'seguras') return list(d, d.rows.filter(r => r.p >= .65 && r.p <= .92 && r.st === 'ok' && inRange(r) && (r.gr === 'A+' || r.gr === 'A') && r.m !== 'PF').sort((a, b) => (+!!b.d - +!!a.d) || b.p - a.p), '🛡️ MAIS SEGURAS (CHANCE ≥ 65%)', clampN(rest[0]), raw, page, true, '', RANGE_TXT);
  if (GROUPS[cmd]) { const g = GROUPS[cmd]; return list(d, d.rows.filter(r => g.mk.includes(r.m) && inRange(r)), '🏀 ' + g.title.toUpperCase(), clampN(rest[0]), raw, page, g.mk.length === 1, '', RANGE_TXT); }
  if (cmd === 'mais' || cmd === 'menos') {
    const s = cmd === 'mais' ? 'o' : 'u'; const gk = WORD2GROUP[norm(rest[0] ?? '')];
    const rows = d.rows.filter(r => r.s === s && (!gk || GROUPS[gk].mk.includes(r.m)) && inRange(r));
    return list(d, rows, `${cmd === 'mais' ? '⬆️ MAIS DE' : '⬇️ MENOS DE'}${gk ? ' · ' + GROUPS[gk].title.toUpperCase() : ''}`, clampN(gk ? rest[1] : rest[0]), raw, page, true, '', RANGE_TXT);
  }
  if (cmd === 'jogo') {
    const q = norm(arg).toUpperCase();
    const pickKb = { inline_keyboard: [...chunk(d.games.map(g => BTN(`${g.t} ${g.a}@${g.h}`, `/jogo ${g.h}`)), 2), HOME] };
    if (!q) return { text: '<b>🏟️ Escolha o jogo</b>', kb: pickKb };
    const g = d.games.find(x => x.a === q || x.h === q); if (!g) return { text: `Não achei jogo hoje com <b>${esc(q)}</b>. Escolha abaixo:`, kb: pickKb };
    return list(d, d.rows.filter(r => r.g === g.id), `🏟️ ${g.a} @ ${g.h} · ${g.t}`, 16, raw, page);
  }
  if (cmd === 'jogador') {
    const q = norm(arg); if (q.length < 3) return { text: 'Digite o nome assim: <code>/jogador brunson</code>', kb: { inline_keyboard: [HOME] } };
    const rows = d.rows.filter(r => norm(r.n).includes(q)); if (!rows.length) return { text: `Nenhuma linha boa hoje para <b>${esc(arg)}</b>.`, kb: { inline_keyboard: [HOME] } };
    return list(d, rows, '👤 ' + rows[0].n.toUpperCase(), 12, raw, page, false);
  }
  if (cmd === 'multipla') return multipla(d, rest[0]);
  if (cmd === 'jogos') {
    const w = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);
    const rowsTxt = d.games.map(g => `${g.t}  ${w(`${g.a} @ ${g.h}`, 11)} ${w(g.sp != null ? `${g.sp < 0 ? g.h : g.a} -${n1(Math.abs(g.sp))}` : '', 10)} ${g.to ? n1(g.to) : ''}`).join('\n');
    return { text: header(d, '🗓️ JOGOS DE HOJE') + `\n<pre>HORA   JOGO        FAVORITO   TOTAL\n${rowsTxt}</pre>\nToque num jogo para ver as linhas:`, kb: { inline_keyboard: [...chunk(d.games.map(g => BTN(`${g.a} @ ${g.h}`, `/jogo ${g.h}`)), 2), home('/jogos')] } };
  }
  if (cmd === 'desfalques') {
    const ic: Record<string, string> = { out: '🔴', doubtful: '🟠', questionable: '🟡' };
    const lb: Record<string, string> = { out: 'fora', doubtful: 'provável fora', questionable: 'dúvida' };
    const by = new Map<string, string[]>(); for (const p of d.injuries) { if (!by.has(p.t)) by.set(p.t, []); by.get(p.t)!.push(`${ic[p.st] ?? '⚪'} ${esc(p.n)} <i>(${lb[p.st] ?? p.st})</i>`); }
    const teams = d.games.flatMap(g => [g.a, g.h]);
    const txt = teams.filter(t => by.has(t)).map(t => `<b>${t}</b>\n${by.get(t)!.join('\n')}`).join('\n\n');
    return { text: header(d, '🚑 DESFALQUES') + '\n' + (txt ? `<blockquote expandable>${txt}</blockquote>` : 'Nenhum desfalque listado.') + '\n<i>🔴 fora · 🟠 provável fora · 🟡 dúvida</i>', kb: { inline_keyboard: [home('/desfalques')] } };
  }
  if (cmd === 'resumo') {
    const a = d.rows.filter(r => r.gr === 'A+' || r.gr === 'A'), ap = d.rows.filter(r => r.gr === 'A+'), val = d.rows.filter(r => r.d && !r.k && (r.e ?? 0) >= .03 && (r.e ?? 0) <= .15);
    const out = d.injuries.filter(p => p.st === 'out' || p.st === 'doubtful').length;
    const top = d.rows.find(inRange) ?? d.rows[0];
    return { text: header(d, '📋 RESUMO DA RODADA') + `
<blockquote>🗓️ <b>${d.games.length}</b> jogos · primeiro às <b>${d.games.slice().sort((x, y) => String(x.utc ?? '').localeCompare(String(y.utc ?? '')))[0]?.t ?? '–'}</b>
🔥 <b>${ap.length}</b> linhas A+ · ✅ <b>${a.length - ap.length}</b> linhas A
💰 <b>${val.length}</b> com valor na odd de casa
🚑 <b>${out}</b> desfalques confirmados ou prováveis</blockquote>
${top ? `⭐ <b>Destaque:</b> ${esc(top.n)}, ${top.s === 'o' ? 'mais de' : 'menos de'} ${n1(top.l)} ${MK[top.m]} (${pc(top.p)}${top.nt != null ? ', nota ' + top.nt : ''})\n` : ''}` + FOOT, kb: MENU };
  }
  return { text: 'Não conheci esse comando. Escolha abaixo ou digite /ajuda.', kb: MENU };
}
function chunk<T>(a: T[], n: number) { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

async function sendCard(chatId: number, key: string) {
  const d = await data().catch(() => null);
  const r = d?.rows.find(x => keyOf(x) === key);
  if (!d || !r) { await TG('sendMessage', { chat_id: chatId, text: 'Essa entrada saiu da lista na última atualização. Abra o menu de novo.', reply_markup: MENU }); return; }
  const res = await TG('sendPhoto', { chat_id: chatId, photo: cardUrl(d, r), caption: caption(r), parse_mode: 'HTML', reply_markup: { inline_keyboard: [HOME] } });
  // sem imagem (ainda não gerada ou o Telegram não conseguiu baixar): manda o cartão em texto
  if (!res.ok) await TG('sendMessage', { chat_id: chatId, text: card(r, 1) + '\n' + FOOT, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [HOME] } });
}
async function sendCards(chatId: number, arg?: string) {
  const d = await data().catch(() => null);
  if (!d) { await TG('sendMessage', { chat_id: chatId, text: 'Não consegui ler os dados agora. Tente de novo em instantes.' }); return; }
  const n = Math.max(1, Math.min(10, parseInt(arg ?? '', 10) || 5));
  const seen = new Set<string>(), pick: Row[] = [];
  for (const r of d.rows) { if (!r.cd || !inRange(r) || seen.has(r.id)) continue; seen.add(r.id); pick.push(r); if (pick.length >= n) break; }
  if (!pick.length) { await TG('sendMessage', { chat_id: chatId, text: 'Os cards do dia ainda estão sendo gerados. Tente em alguns minutos ou veja o /top.', reply_markup: MENU }); return; }
  await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `<b>🖼️ AS ${pick.length} MELHORES DO DIA</b>\n<i>${dateBR(d.date)} · pela Nota BH · odds 1,40–3,50 · atualizado ${hourBR(d.gen)}</i>` });
  const media = pick.map(r => ({ type: 'photo', media: cardUrl(d, r), caption: caption(r), parse_mode: 'HTML' }));
  const res = pick.length === 1 ? await TG('sendPhoto', { chat_id: chatId, photo: media[0].media, caption: media[0].caption, parse_mode: 'HTML' }) : await TG('sendMediaGroup', { chat_id: chatId, media });
  if (!res.ok) { await TG('sendMessage', { chat_id: chatId, text: pick.map((r, i) => card(r, i + 1)).join('\n') + '\n' + FOOT, parse_mode: 'HTML', disable_web_page_preview: true }); }
  await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: '<i>🔞 18+ · Confira lesões, quinteto e a odd da sua casa. O Ministério da Fazenda adverte: apostas podem causar dependência.</i>', reply_markup: { inline_keyboard: [[BTN('🔥 Top do dia em texto', '/top'), BTN('🎟️ Múltipla', '/multipla 3')], [BTN('🏠 Menu', '/menu')]] } });
}

async function handle(update: any) {
  const cq = update.callback_query;
  const msg = update.message ?? cq?.message;
  let text: string | undefined = update.message?.text ?? cq?.data;
  if (!msg || !text) return;
  const chatId: number = msg.chat.id;
  const allowed = (await cfg()).allowed;
  if (allowed.length && !allowed.includes(String(chatId))) {
    if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id });
    await TG('sendMessage', { chat_id: chatId, text: `Este bot é privado. Peça acesso ao dono e informe o seu ID: ${chatId}` });
    return;
  }
  // card em imagem de uma entrada (botão 🖼️ das listas)
  const im = /^i:(.+)$/.exec(text);
  if (im) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id }); await sendCard(chatId, im[1]); return; }
  // /cards: as melhores do dia em imagem (sempre mensagens novas)
  if (/^\/cards(@\S+)?(\s|$)/i.test(text)) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id }); await sendCards(chatId, text.split(/\s+/)[1]); return; }
  // página (p:2:/top 20) e atualizar (repete o comando que gerou a mensagem)
  let page = 1;
  const pm = /^([pr]):(\d+):(.+)$/.exec(text); let refreshed = false;
  if (pm) { page = +pm[2]; text = pm[3]; if (pm[1] === 'r') { CACHE = null; refreshed = true; } }
  if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id, ...(refreshed ? { text: '🔄 Dados atualizados' } : {}) });
  if (!text.startsWith('/')) { await TG('sendMessage', { chat_id: chatId, text: 'Escolha abaixo ou digite /ajuda.', reply_markup: MENU }); return; }
  let res: Out;
  try { res = await answer(text, chatId, page); } catch (e) { res = { text: 'Não consegui ler os dados agora (' + esc(String((e as Error).message)) + '). Tente de novo em instantes.', kb: { inline_keyboard: [HOME] } }; }
  const body = { chat_id: chatId, text: res.text.slice(0, 4090), parse_mode: 'HTML', disable_web_page_preview: true, ...(res.kb ? { reply_markup: res.kb } : {}) };
  // botão: troca o conteúdo da mesma mensagem (navegação fluida); comando digitado: mensagem nova
  if (cq) {
    const r = await TG('editMessageText', { ...body, message_id: msg.message_id });
    if (!r.ok && !/not modified/i.test(r.description ?? '')) await TG('sendMessage', body);
  } else await TG('sendMessage', body);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const { token: TOKEN, secret: SECRET } = await cfg();
  if (!TOKEN || !SECRET) return new Response('Falta configurar TELEGRAM_BOT_TOKEN e WEBHOOK_SECRET (tabela bot_config ou segredos da função).', { status: 500 });
  if (req.method === 'GET') {
    if (url.searchParams.get('push') && url.searchParams.get('push') === SECRET) {
      const r = await pushDaily(url.searchParams.get('force') === '1', +(url.searchParams.get('min') || 0)).catch(e => ({ ok: false, erro: String(e) }));
      return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    if (url.searchParams.get('setup') !== SECRET) return new Response('ok');
    // dentro do Supabase a função vê só /telegram-bot; o endereço público tem /functions/v1 na frente
    const base = Deno.env.get('SUPABASE_URL');
    const self = base ? `${base}/functions/v1/telegram-bot` : `https://${url.host}${url.pathname}`;
    const hook = await TG('setWebhook', { url: self, secret_token: SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    const cmds = await TG('setMyCommands', { commands: [
      ['top', 'Melhores do dia (ex.: /top 20)'], ['valor', 'Valor com odd de casa'], ['seguras', 'Chance de 65% ou mais'], ['pontos', 'Melhores em pontos'], ['rebotes', 'Melhores em rebotes'],
      ['assist', 'Melhores em assistências'], ['tres', 'Bolas de 3'], ['pra', 'Pts+Reb+Ast'], ['combinados', 'PR, PA, RA e PRA'], ['tentativas', 'Arremessos tentados'], ['convertidos', 'Arremessos convertidos'],
      ['defesa', 'Roubos, tocos e erros'], ['mais', 'Só "mais de" (ex.: /mais pontos)'], ['menos', 'Só "menos de"'], ['jogo', 'Linhas de um jogo (ex.: /jogo LAL)'], ['jogador', 'Linhas de um jogador'],
      ['multipla', 'Múltipla (ex.: /multipla 3 ou 4,5)'], ['jogos', 'Jogos de hoje'], ['desfalques', 'Lesões'], ['resumo', 'Resumo da rodada'], ['cards', 'Melhores do dia em imagem'], ['modelo', 'Modelo BH: chance de qualquer linha'], ['testes', 'Testes do Modelo BH'], ['toptentativas', 'Top 10 do modelo em tentativas'], ['topra', 'Top 10 do modelo em reb+ast'], ['receber', 'Receber os tops todo dia'], ['ajuda', 'Todos os comandos'], ['app', 'Abrir o app']].map(([command, description]) => ({ command, description })) });
    const me = await TG('getMe', {});
    const info = await TG('getWebhookInfo', {});
    return new Response(JSON.stringify({ ok: !!hook.ok, webhook: hook, endereco: info.result?.url, erro_recente: info.result?.last_error_message ?? null, comandos: cmds.ok, bot: me.result?.username ? '@' + me.result.username : null }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => null);
  if (update) await handle(update).catch(e => console.error(e));
  return new Response('ok');
});
