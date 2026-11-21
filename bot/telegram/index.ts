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

import { parseLadder99, combosOf, normName as nName } from '../../public/ladder99.js';
import { correlOf } from '../../public/correl.js';
const APP_URL = 'https://gabrielcbjr29.github.io/black-house-props/';
type Cfg = { token: string; secret: string; allowed: string[]; dataUrl: string; report: string; affRef: string; affRef365: string; dom99: string; dom365: string; at: number };
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
    dataUrl: get('DATA_URL') || 'https://gabrielcbjr29.github.io/black-house-props/data/bot.json', report: get('REPORT_TOKEN'), affRef: get('AFF_REF') || 'rca5p', affRef365: get('AFF_REF_365') || 'nac6j', dom99: (get('DOM_99') || 'https://99play.im').replace(/\/+$/, ''), dom365: (get('DOM_365') || 'https://br365.io').replace(/\/+$/, ''), at: Date.now() };
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
const tgRaw = async (m: string, body: unknown) => { const c = await cfg(); return fetch(`https://api.telegram.org/bot${c.token}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()); };
// horário com <tg-time> (cada um vê no próprio fuso); se a API recusar a marcação, reenvia com o horário em texto
const noTime = (s: unknown) => typeof s === 'string' ? s.replace(/<tg-time[^>]*>([\s\S]*?)<\/tg-time>/g, '$1') : s;
// corta um HTML do Telegram no limite de 4096 sem quebrar marcação (18/11: a lista de lances livres tentados passou
// do limite, o corte cego deixava um <i> aberto e o Telegram recusava a mensagem inteira). Corta no fim do último
// cartão completo (</blockquote>) ou da última linha, e fecha as tags que ficaram abertas.
function fitHTML(s: string, max = 4090): string {
  if (!s || s.length <= max) return s;
  const lim = max - 120;
  let cut = s.lastIndexOf('</blockquote>', lim);
  if (cut > lim / 2) cut += '</blockquote>'.length; else { cut = s.lastIndexOf('\n', lim); if (cut < lim / 2) cut = lim; }
  const t = s.slice(0, cut).replace(/<[^>]*$/, '').replace(/&[a-z#0-9]*$/i, '');
  const open: string[] = [];
  for (const m of t.matchAll(/<(\/?)([a-z][a-z0-9-]*)[^>]*>/gi)) {
    const tag = m[2].toLowerCase(); if (m[0].endsWith('/>')) continue;
    if (m[1]) { const i = open.lastIndexOf(tag); if (i >= 0) open.splice(i, 1); } else open.push(tag);
  }
  return t + open.reverse().map(x => `</${x}>`).join('') + '\n<i>… (mensagem cortada pelo limite do Telegram; use 🔎 para ver cada entrada)</i>';
}
const TG = async (m: string, body: any) => {
  const r = await tgRaw(m, body);
  if (!r?.ok && body && (String(body.text ?? '').includes('<tg-time') || String(body.caption ?? '').includes('<tg-time'))) {
    console.error('tg-time recusado:', r?.description);
    return tgRaw(m, { ...body, ...(body.text != null ? { text: noTime(body.text) } : {}), ...(body.caption != null ? { caption: noTime(body.caption) } : {}) });
  }
  return r;
};

type Row = { id: string; n: string; t: string; o: string; home: boolean; g: string; h: string; m: string; s: 'o' | 'u'; l: number; p: number; q: number | null; d: number | null; b: string | null; k: number; e: number | null; gr: string; l10: [number, number] | null; l20: [number, number] | null; ss?: [number, number] | null; hh?: [number, number] | null; dv?: { r: number; of: number; ps: string; k: string } | null; pj: number; st: string; rl: string | null; nt?: number; sc: number; wy?: string[]; wn?: string[]; cd?: number; mb?: number; mn?: number; l5?: [number, number] | null; sk?: number; ed?: number; tp?: [number, number] | null; wo?: { q: string; h: [number, number]; a: number; x: number } | null; c9?: number; rf?: number; sq?: number[]; kp?: number; fo?: number; mv?: [number, number, string]; fmv?: number };
type MStat = [number, number, number[], number | null];
type MPlayer = { n: string; t: string; o: string; home: boolean; h: string; g: string; st: string; gp: number; s: Record<string, MStat>; h2h: Record<string, number>[] };
type Fin = { id: string; n: string; t: string; o: string; g: string; h: string; m: string; l: number; fo: number; alt: number; p: number; fe: number; st: string; mn: number; h10: [number, number] | null; l9?: number; o9?: number | null };
type Data = { date: string; gen: string; demo: boolean; w: number; mdl?: Record<string, MPlayer>; fin?: Fin[]; fg?: string; games: { id: string; a: string; h: string; t: string; utc?: string; sp: number | null; to: number | null; lv?: number | null }[]; injuries: { n: string; t: string; st: string; no: string }[]; rows: Row[] };

let CACHE: { at: number; data: Data } | null = null;
// placar da verdade (scripts/auditoria.mjs → public/data/auditoria.json): só medição, alimenta o selo dos cards e o /placar
let AUD: any = null, AUD_AT = 0;
const GUTC = new Map<string, string>();
async function loadAud() {
  if (AUD && Date.now() - AUD_AT < 600_000) return AUD;
  const url = (await cfg()).dataUrl.replace(/bot\.json.*$/, 'auditoria.json');
  const a = await fetch(url + '?t=' + Math.floor(Date.now() / 600_000)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (a?.total) { AUD = a; AUD_AT = Date.now(); }
  return AUD;
}
async function data(): Promise<Data> {
  if (CACHE && Date.now() - CACHE.at < 120_000) return CACHE.data;
  const [r] = await Promise.all([fetch((await cfg()).dataUrl + '?t=' + Math.floor(Date.now() / 120_000), { headers: { 'Cache-Control': 'no-cache' } }), loadAud()]);
  if (!r.ok) throw new Error('dados indisponíveis (' + r.status + ')');
  CACHE = { at: Date.now(), data: await r.json() };
  for (const g of CACHE.data.games ?? []) if (g.utc) GUTC.set(g.id, g.utc);
  return CACHE.data;
}

const MK: Record<string, string> = { PTS: 'pontos', REB: 'rebotes', AST: 'assistências', '3PM': 'bolas de 3', PRA: 'pts+reb+ast', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'arremessos convertidos', FGA: 'arremessos tentados', '2PM': 'de 2 convertidos', '2PA': 'de 2 tentados', '3PA': 'bolas de 3 tentadas', FTM: 'lances livres convertidos', FTA: 'lances livres tentados', STL: 'roubos', BLK: 'tocos', SB: 'roubos+tocos', TOV: 'erros', PF: 'faltas' };
// rótulos curtos para as listas compactas
const MKS: Record<string, string> = { PTS: 'pontos', REB: 'rebotes', AST: 'assist.', '3PM': 'bolas de 3', PRA: 'PRA', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'arr. conv.', FGA: 'arr. tentados', '2PM': 'de 2 conv.', '2PA': 'de 2 tentados', '3PA': 'de 3 tentadas', FTM: 'LL conv.', FTA: 'LL tentados', STL: 'roubos', BLK: 'tocos', SB: 'roub+tocos', TOV: 'erros', PF: 'faltas' };
// comando → mercados
const GROUPS: Record<string, { mk: string[]; title: string }> = {
  pontos: { mk: ['PTS'], title: 'Pontos' }, rebotes: { mk: ['REB'], title: 'Rebotes' }, assist: { mk: ['AST'], title: 'Assistências' }, assistencias: { mk: ['AST'], title: 'Assistências' },
  tres: { mk: ['3PM'], title: 'Bolas de 3' }, triplos: { mk: ['3PM'], title: 'Bolas de 3' },
  pra: { mk: ['PRA'], title: 'Pts+Reb+Ast' }, pr: { mk: ['PR'], title: 'Pts+Reb' }, pa: { mk: ['PA'], title: 'Pts+Ast' }, ra: { mk: ['RA'], title: 'Reb+Ast' },
  combinados: { mk: ['PRA', 'PR', 'PA', 'RA'], title: 'Combinados' },
  tentativas: { mk: ['3PA', 'FTA', 'FTM', '2PA', '2PM', 'FGM'], title: 'Tentativas e convertidos' },
  convertidos: { mk: ['FGM', '2PM', 'FTM'], title: 'Arremessos convertidos' },
  defesa: { mk: ['STL', 'BLK', 'SB', 'TOV', 'PF'], title: 'Roubos, tocos, erros e faltas' },
  roubos: { mk: ['STL'], title: 'Roubos' }, tocos: { mk: ['BLK'], title: 'Tocos' }, erros: { mk: ['TOV'], title: 'Erros' }, faltas: { mk: ['PF'], title: 'Faltas' },
};
const WORD2GROUP: Record<string, string> = { pontos: 'pontos', pts: 'pontos', rebotes: 'rebotes', reb: 'rebotes', assist: 'assist', ast: 'assist', assistencias: 'assist', tres: 'tres', '3': 'tres', triplos: 'tres', pra: 'pra', pr: 'pr', pa: 'pa', ra: 'ra', tentativas: 'tentativas', convertidos: 'convertidos', defesa: 'defesa', roubos: 'roubos', tocos: 'tocos', erros: 'erros', faltas: 'faltas', pf: 'faltas', combinados: 'combinados' };

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace('.', ',');
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const pc = (x: number | null) => x == null ? '–' : Math.round(x * 100) + '%';
// "precisa X%" (ideia do Upside, 17/11): acerto mínimo para empatar com essa odd (1 ÷ odd). Ao lado da chance do modelo,
// mostra de cara quanto a entrada sobra (ou falta). Só com odd de casa.
const need = (o?: number | null) => o && +o > 1 ? ` · precisa <b>${pc(1 / +o)}</b>` : '';
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
const inRangeBase = (r: Row) => { const o = oddOf(r); return o >= ODD_MIN - 1e-9 && o <= ODD_MAX + 1e-9; };
const inRange = inRangeBase;
const RANGE_TXT = ' · odds 1,40–3,50';
// odd mínima do usuário (pedido de 17/11): vale para todas as listas, os Top 10, o envio diário, os alertas e a pauta.
// Guardada em bot_subs.odd_min; sem escolha = 1,40 (a faixa padrão das listas). 0 = sem corte extra.
const OM_OPTS = [1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];
const OM_CACHE = new Map<number, { at: number; v: number }>();
async function userMin(chatId: number): Promise<number> {
  const c = OM_CACHE.get(chatId); if (c && Date.now() - c.at < 60_000) return c.v;
  const v = +((await sb(`bot_subs?chat_id=eq.${chatId}&select=odd_min`).catch(() => null))?.[0]?.odd_min ?? 0) || 0;
  OM_CACHE.set(chatId, { at: Date.now(), v }); return v;
}
const rangeTxt = (om: number) => ` · odds ${n2(Math.max(om, ODD_MIN))}–3,50`;
const okOdd = (o: number | null | undefined, om: number) => !om || (o != null && +o >= om - 1e-9);
// cards em imagem (gerados no publicar do GitHub Pages)
const keyOf = (r: Row) => `${r.id}-${r.m}-${r.s}`;
// PDF do dia (scripts/relatorio.mjs, gerado em toda coleta)
const pdfUrl = (d: Data) => `${APP_URL}data/relatorio.pdf?v=${encodeURIComponent(d.gen)}`;
async function sendPdf(chatId: number, d?: Data | null) {
  d ??= await data().catch(() => null);
  if (!d) { await TG('sendMessage', { chat_id: chatId, text: 'Não consegui ler os dados agora. Tente de novo em instantes.' }); return false; }
  const hr = new Date(d.gen).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const r = await TG('sendDocument', { chat_id: chatId, document: pdfUrl(d), parse_mode: 'HTML',
    caption: `📄 <b>Melhores entradas do dia</b> · ${d.date.split('-').reverse().slice(0, 2).join('/')}\n<i>Dados das ${hr}. Por mercado, duplo-duplo, triplo-duplo, entradas do método e múltiplas.</i>\n🔞 18+ · Aposte com responsabilidade`,
    reply_markup: { inline_keyboard: [[BTN('🔄 PDF atualizado', '/pdf'), BTN('🧪 Estratégias', '/estrategias')], [HOME[0]]] } });
  if (!r.ok) await TG('sendMessage', { chat_id: chatId, text: 'O PDF de hoje ainda está sendo gerado. Tente de novo em alguns minutos.' });
  return !!r.ok;
}
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

<b>Mercados</b>: pontos, rebotes, assist, tres, <b>tentativas</b>, <b>3 tentadas</b>, <b>lances</b> (tentados), ltc (lances convertidos), 2t, convertidos, roubos, tocos, erros, faltas, pra, pr, pa, ra.

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
  const mkCode = Object.keys(MK2STAT).find(k => MK2STAT[k] === STAT_KEY(st.k));
  if (mkCode) back.inline_keyboard.unshift([BTN(`📝 Registrar ${side === 'o' ? 'mais' : 'menos'} de ${n1(line)} (1u)`, `bm:${pid}:${mkCode}:${line}:${side}`, 'success')]);
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
const RES_IDX: Record<string, (a: number[]) => number> = { pf: a => a[7], pts: a => a[1], reb: a => a[2], ast: a => a[3], stl: a => a[4], blk: a => a[5], tov: a => a[6], fgm: a => a[8], fga: a => a[9], tpm: a => a[10], tpa: a => a[11], ftm: a => a[12], fta: a => a[13], twoa: a => a[9] - a[11], twom: a => a[8] - a[10] };
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
  tent: { mk: ['3PA', 'FTA', '2PA', '2PM', 'FGM'], title: 'TENTATIVAS E CONVERTIDOS', cmd: '/toptentativas', ic: '🏹' },
  ra: { mk: ['RA'], title: 'REBOTES + ASSISTÊNCIAS', cmd: '/topra', ic: '🙌' },
};
// ranking: Nota BH (chance do modelo, L10/L20/temporada, confronto, defesa x posição), desempate pelo L10; um por jogador
function modelTop(d: Data, mk: string[], n = 10, om = 0) {
  // só jogador de rotação (24+ min) e linhas que as casas costumam abrir (mesmo critério dos cards)
  const MIN_LINE: Record<string, number> = { FGA: 7.5, '3PA': 2.5, FTA: 2.5, '2PA': 4.5, '2PM': 2.5, FGM: 3.5, RA: 4.5 };
  // nos jogos em que a 99play já abriu linhas de jogador, só entra linha da 99play (é onde o usuário aposta)
  const cov = new Set(d.rows.filter(r => r.c9).map(r => r.g));
  const rows = d.rows.filter(r => r.mb && okOdd(oddOf(r), om) && mk.includes(r.m) && r.st !== 'questionable' && r.p <= .85 && (r.mn ?? 0) >= 24 && r.l >= (MIN_LINE[r.m] ?? 0) && (r.c9 || !cov.has(r.g))).sort((a, b) => b.sc - a.sc);
  const seen = new Set<string>(), out: Row[] = [];
  for (const r of rows) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (out.length >= n) break; }
  return out;
}
// os dois tops (cada lista independente: o mesmo jogador pode estar em tentativas e em reb+ast; dentro de uma lista, uma vez só)
function tops(d: Data, n = 10, om = 0): Record<string, Row[]> {
  return Object.fromEntries(Object.entries(MT).map(([k, T]) => [k, modelTop(d, T.mk, n, om)]));
}
const MT_NOTE = (d: Data) => d.rows.some(r => r.c9)
  ? '\n<i>🏠 Linha e odd da 99play. 📏 Ref. = linha de referência (mediana dos últimos 15 jogos), só para comparar. Jogo sem linhas da 99play ainda usa a referência. Só jogadores de rotação (24+ min).</i>'
  : '\n<i>📏 Só jogadores de rotação (24+ min). Linha de referência = mediana dos últimos 15 jogos (estilo casa). Confira a linha da sua casa: se for diferente, use /modelo para ver a chance nela.</i>';
// sequência dos últimos 10 (mais recente primeiro) e texto pronto para os inscritos
const seq = (r: Row) => r.sq?.length ? r.sq.join('-') : '';
// últimos 10 em cores, do mais recente para o mais antigo: 🟩 bateu o lado, 🟥 não bateu, ⬜ empatou na linha
function sqDots(vals: number[] | null | undefined, line: number, side: string, n = 10) {
  const v = (vals ?? []).slice(0, n).map(Number); if (!v.length) return { dots: '', hit: 0, n: 0 };
  let hit = 0; const dots = v.map(x => { const ok = side === 'o' ? x > line : x < line; if (ok) hit++; return x === line ? '⬜' : ok ? '🟩' : '🟥'; }).join('');
  return { dots, hit, n: v.length };
}
const sqLine = (vals: number[] | null | undefined, line: number, side: string) => { const q = sqDots(vals, line, side); return q.n ? `${q.dots} <b>${q.hit}/${q.n}</b>` : ''; };
const vsTxt = (r: Row) => r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`;
function shareText(r: Row, i?: number) {
  const head = i != null ? `${i}. ${r.n} (${vsTxt(r)} · ${r.h})` : `🏀 ${r.n} (${vsTxt(r)} · ${r.h})`;
  const q = sqDots(r.sq, r.l, r.s);
  return [head, `${r.s === 'o' ? '⬆️ Mais' : '⬇️ Menos'} de ${n1(r.l)} ${MK[r.m] ?? r.m}`, q.n ? `📊 Últimos ${q.n}: ${q.dots} ${q.hit}/${q.n}` : `📊 Últimos 10: ${r.l10 ? `${r.l10[0]}/${r.l10[1]}` : '–'}`, ...(seq(r) ? [`🔢 Sequência: ${seq(r)}`] : [])].join('\n');
}
// lista inteira para copiar (um bloco: tocar no bloco copia tudo)
function shareList(d: Data, key: string, om = 0) {
  const T = MT[key], top = tops(d, 10, om)[key];
  if (!top.length) return 'Nenhuma entrada no top agora.';
  const body = top.map((r, i) => shareText(r, i + 1)).join('\n\n');
  return `📋 <b>Texto para os inscritos</b> <i>(toque no bloco para copiar)</i>\n<pre>${esc(`${T.ic} TOP 10 MODELO BH · ${T.title}\n${dateBR(d.date)}\n\n${body}\n\n🟩 bateu · 🟥 não bateu · 🔢 sequência dos últimos 10 jogos, do mais recente para o mais antigo.\n🔞 18+ · Aposte com responsabilidade.`)}</pre>`;
}
// de onde vem a linha: 🏠 99play (e a referência embaixo, para comparar) ou 📏 só referência
const lineSrc = (r: Row) => r.c9 ? `🏠 99play @${r.d ? n2(r.d) : '–'}${r.rf != null ? ` · 📏 Ref. ${n1(r.rf)}${r.rf !== r.l ? ` (99play ${r.l > r.rf ? '+' : '−'}${n1(Math.abs(r.l - r.rf))})` : ''}` : ''}` : `📏 Linha de referência${r.d ? ` · @${n2(r.d)} ${esc(r.b ?? '')}` : ' · sem odd de casa'}`;
function compact(r: Row, i: number) {
  const over = r.s === 'o', vs = r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`;
  const good = r.dv?.r ? (over ? r.dv.r >= r.dv.of - 5 : r.dv.r <= 6) : false, bad = r.dv?.r ? (over ? r.dv.r <= 6 : r.dv.r >= r.dv.of - 5) : false;
  return `<b>${i}. ${esc(r.n)}</b> <i>${vs} · ${r.h}</i>
${over ? '⬆️ Mais' : '⬇️ Menos'} de <b>${n1(r.l)}</b> ${MK[r.m] ?? r.m} · <b>${pc(r.p)}</b>${need(r.d)} · Nota <b>${r.nt ?? '–'}</b>
${r.c9 ? lineSrc(r) + '\n' : ''}📊 L10 ${hitTxt(r.l10)} · Temp. ${hitTxt(r.ss)} · vs ${r.o} ${hitTxt(r.hh)} · 🧠 ${n1(Math.round(r.pj * 10) / 10)} · ⏱️ ${r.mn ?? '–'} min${r.dv?.r ? ` · 🛡️ ${r.dv.r}ª/${r.dv.of}${good ? ' favorável' : bad ? ' difícil' : ''}` : ''}${seq(r) ? `\n${sqLine(r.sq, r.l, r.s)}\n🔢 <code>${seq(r)}</code>` : ''}${duvida(r)}`;
}
// colega importante em dúvida: como ele foi nos jogos sem esse colega (se o colega cair, o cenário muda)
const duvida = (r: Row) => r.wo && !r.wo.x ? `\n🟡 ${esc(r.wo.q)} em dúvida · sem ele: ${r.wo.h[0]}/${r.wo.h[1]} ${r.s === 'o' ? 'acima' : 'abaixo'}, média ${n1(r.wo.a)}` : '';
function topText(d: Data, key: string, om = 0) {
  const T = MT[key], top = tops(d, 10, om)[key];
  if (!top.length) return null;
  return `<b>${T.ic} TOP 10 MODELO BH · ${T.title}</b>\n<i>${dateBR(d.date)} · ${d.games.length} jogos · atualizado ${hourBR(d.gen)}</i>\n\n` + top.map((r, i) => compact(r, i + 1)).join('\n\n') + '\n' + MT_NOTE(d) + '\n<i>📝 Toque no número para registrar a entrada (1u) com a sua odd. 🔢 = sequência dos últimos 10 (mais recente primeiro). "Precisa" = acerto mínimo para não perder com aquela odd.</i>' + (om ? `\n<i>🎯 Só odd ${n2(om)} ou mais (sua odd mínima).</i>` : '') + FOOT;
}
type Sub = { tent: boolean; ra: boolean; est: boolean };
const subKb = (s: Sub | null, om = 0) => ({ inline_keyboard: [
  [BTN(`${s?.tent ? '✅' : '⬜'} Top 10 Tentativas`, '/receber tent'), BTN(`${s?.ra ? '✅' : '⬜'} Top 10 Reb+Ast`, '/receber ra')],
  [BTN(`${s?.est ? '✅' : '⬜'} Modelo por mercado`, '/receber est')],
  [BTN(`🎯 Odd mínima: ${om ? n2(om) : 'padrão (1,40)'}`, '/receber odd')],
  [BTN('🔕 Parar de receber', '/receber parar'), BTN('🏠 Menu', '/menu')]] });
async function receberCmd(chatId: number, rest: string[]): Promise<Out> {
  const a = norm(rest[0] ?? '');
  let s: Sub | null = null, om = 0;
  try { const row = (await sb(`bot_subs?chat_id=eq.${chatId}&select=tent,ra,est,odd_min`))?.[0] ?? null; if (row) { om = +(row.odd_min ?? 0) || 0; s = { tent: row.tent, ra: row.ra, est: row.est }; } } catch { return { text: 'Não consegui acessar as inscrições agora.', kb: { inline_keyboard: [HOME] } }; }
  if (a === 'odd') { // odd mínima de tudo que o bot manda para este chat
    const v = (rest[1] ?? '').replace(',', '.');
    if (v) {
      const x = v === 'padrao' ? 0 : +v;
      if (isFinite(x) && x >= 0 && x <= 5) {
        await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chat_id: chatId, ...(s ?? { tent: false, ra: false, est: false }), odd_min: x || null, updated_at: new Date().toISOString() }) });
        om = x; OM_CACHE.delete(chatId);
      }
    }
    return { text: `🎯 <b>ODD MÍNIMA</b>

Agora: <b>${om ? n2(om) + ' ou mais' : 'padrão (1,40 ou mais)'}</b>
<blockquote>Vale para tudo que o bot te mostra e manda: listas de todos os mercados (Top do dia, Valor, Seguras, Pontos, Tentativas...), Top 10 Tentativas e Reb+Ast, cards, múltipla, envio diário, alertas do Modelo por mercado e as simples da Pauta do Tipster.</blockquote>
<i>Usa a odd da 99play (ou da casa); sem odd de casa, a odd justa do modelo. Os canais têm a odd mínima própria em /canais. O placar e os testes seguem contando tudo.</i>`,
      kb: { inline_keyboard: [...chunk(OM_OPTS.map(o => BTN(`${Math.abs(om - o) < 1e-9 || (!om && o === 1.4) ? '✅ ' : ''}${n2(o)}`, `/receber odd ${o === 1.4 ? 'padrao' : o}`)), 4), [BTN('📬 Envio diário', '/receber'), BTN('🏠 Menu', '/menu')]] } };
  }
  let next = s;
  if (!a) next = s ?? { tent: true, ra: true, est: true };
  else if (a === 'parar') next = { tent: false, ra: false, est: false };
  else if (a === 'tent' || a === 'ra' || a === 'est') next = { ...(s ?? { tent: false, ra: false, est: false }), [a]: !(s?.[a as keyof Sub]) };
  if (JSON.stringify(next) !== JSON.stringify(s)) await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chat_id: chatId, ...next, updated_at: new Date().toISOString() }) });
  const on = [next?.tent && '🏹 Top 10 Tentativas e convertidos', next?.ra && '🙌 Top 10 Rebotes + assistências', next?.est && '🧪 Modelo por mercado (entradas do dia)'].filter(Boolean);
  return { text: `<b>📬 ENVIO DIÁRIO DO MODELO BH</b>\n\n${on.length ? `Você recebe todo dia, cerca de 2h30 antes do primeiro jogo (em dia de jogo cedo, mais cedo):\n${on.map(x => '• ' + x).join('\n')}${next?.est ? '\n\n🚨 No modelo por mercado, cada entrada nova também chega na hora, em alerta, desde a abertura das linhas (de madrugada, sem som). O PDF do dia vai junto do resumo.' : ''}` : 'Você não está recebendo nada no momento.'}\n\nToque para ligar ou desligar cada lista:${om ? `\n<i>🎯 Só entradas com odd ${n2(om)} ou mais.</i>` : ''}`, kb: subKb(next, om) };
}
// envio do dia para os inscritos (chamado pelo GitHub depois de publicar os dados)
// minHour: só envia se os dados foram gerados depois dessa hora (Brasília) — espera a rodada das 18h30
// lead: envia só quando faltar até `lead` minutos para o primeiro jogo do dia (fim de semana com jogo cedo
// recebe mais cedo); o pg_cron chama a cada 30 min e a trava PUSH_<data> garante um envio por dia
async function pushDaily(force = false, minHour = 0, lead = 0) {
  CACHE = null;
  const d = await data();
  const flag = `PUSH_${d.date}`;
  if (!force && lead) {
    const first = Math.min(...d.games.map(g => Date.parse(g.utc ?? '') || Infinity));
    if (Number.isFinite(first) && Date.now() < first - lead * 6e4) return { ok: true, skip: `cedo: primeiro jogo às ${hourBR(new Date(first).toISOString())}` };
  }
  if (!force) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (d.date !== today) return { ok: true, skip: `dados de ${d.date}, hoje é ${today}` };
    const h = +new Date(d.gen).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });
    if (minHour && h < minHour) return { ok: true, skip: `dados das ${h}h ainda; espero a rodada das 18h30` };
    const done = await sb(`bot_config?key=eq.${flag}&select=key`).catch(() => []); if (done?.length) return { ok: true, skip: 'já enviado hoje' };
  }
  const gravados = await recordTops(d).catch(e => { console.error('top_picks', e); return 0; });
  const subs: ({ chat_id: number; odd_min?: number | null } & Sub)[] = await sb('bot_subs?select=chat_id,tent,ra,est,odd_min&or=(tent.eq.true,ra.eq.true,est.eq.true)') ?? [];
  const est = await estEntries(d.date), et0 = estText(d, est);
  let sent = 0;
  for (const s of subs) {
    const om = +(s.odd_min ?? 0) || 0, T10 = tops(d, 10, om);
    const txt = { tent: topText(d, 'tent', om), ra: topText(d, 'ra', om) }, et = estText(d, est, om);
    for (const k of ['tent', 'ra'] as const) {
      if (!s[k] || !txt[k]) continue;
      const regs = T10[k].map((r, i) => BTN(`📝${i + 1}`, `bet:${keyOf(r)}:${k}`));
      const r = await TG('sendMessage', { chat_id: s.chat_id, text: fitHTML(txt[k]!), parse_mode: 'HTML', disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [...chunk(regs, 5), [BTN('📋 Ver com detalhes', MT[k].cmd), BTN('📤 Texto p/ inscritos', 'cp:' + k)], [BTN('💼 Banca', '/banca')], [BTN('📬 Envio diário', '/receber'), BTN('🏠 Menu', '/menu')]] } });
      if (r.ok) sent++;
      await new Promise(res => setTimeout(res, 60));
    }
    if (await sendPdf(s.chat_id, d)) sent++;
    if (s.est && et) {
      const r = await TG('sendMessage', { chat_id: s.chat_id, text: et.text, parse_mode: 'HTML', disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [...chunk(et.regs, 5), [BTN('🧪 Placar das estratégias', '/estrategias'), BTN('💼 Banca', '/banca')], [BTN('📬 Envio diário', '/receber'), BTN('🏠 Menu', '/menu')]] } });
      if (r.ok) sent++;
      await new Promise(res => setTimeout(res, 60));
    }
  }
  await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: flag, value: String(sent), updated_at: new Date().toISOString() }) }).catch(() => null);
  return { ok: true, date: d.date, inscritos: subs.length, mensagens: sent, top_gravado: gravados, estrategias: et0?.regs.length ?? 0 };
}
// ---------- Entradas das estratégias (strategies.json gerado na coleta) ----------
// métodos que o usuário parou de acompanhar em 17/11 (histórico no banco, fora das telas)
const ARQ = new Set(['oport-forte', 'top10-forte', 'reserva-under']);
const ESTN: Record<string, string> = { 'm-2pa': 'Tentativas de 2', 'm-2pm': 'De 2 convertidos', 'm-3pa': 'Tentativas de 3', 'm-3pm': 'De 3 convertidos', 'm-fgm': 'Arr. convertidos', 'm-fta': 'LL tentados', 'm-ftm': 'LL convertidos', 'm-ra': 'Reb+Ast', 'reserva-under': 'Under de reserva', 'oport-forte': 'Oportunidade forte', 'top10-forte': 'Top 10 forte', 'tendencia': 'Tendência' };
const evS = (x: any) => x == null ? '–' : (x >= 0 ? '+' : '') + (+x * 100).toFixed(1).replace('.', ',') + '%';
const estKey = (x: any) => `${x.pid}-${x.mk}-${x.side}`;
// entradas já gravadas do dia (linha e odd do alerta), só de jogos que ainda não começaram, no formato do strategies.json
async function estEntries(date: string) {
  const [picks, strategies] = await Promise.all([
    sb(`strategy_picks?date=eq.${date}&status=eq.aberta&alerted=eq.true&select=strategy_id,pid,name,team,opp,mk,side,line,odd,open_line,open_odd,p,edge,tip_utc,sq&order=edge.desc.nullslast`).catch(() => []),
    sb('strategies?select=id,name&order=id').catch(() => [])]);
  if (!picks?.length) return null;
  return { date, strategies, picks: picks.filter((x: any) => !ARQ.has(x.strategy_id)).map((x: any) => ({ ...x, line: x.open_line ?? x.line, odd: x.open_odd ?? x.odd })) };
}
async function estToday(date: string) {
  const st = await fetch(APP_URL + 'data/strategies.json?t=' + Math.floor(Date.now() / 120_000)).then(r => r.ok ? r.json() : null).catch(() => null);
  return st?.date === date ? st : null;
}
// mensagem do envio diário: entradas de hoje de cada estratégia (só jogos que ainda não começaram), numeradas, com 📝
// nomes completos dos mercados para as mensagens do modelo por mercado
const MKN: Record<string, string> = { '2PA': 'Tentativas de 2', '2PM': 'De 2 convertidos', '3PA': 'Tentativas de 3', '3PM': 'De 3 convertidos', FGM: 'Arremessos convertidos', FTA: 'Lances livres tentados', FTM: 'Lances livres convertidos', RA: 'Reb + Ast' };
// resumo do dia: as entradas ALERTADAS ainda em aberto, agrupadas por jogo (como se navega na 99play)
function estText(d: Data, st: any, om = 0): { text: string; regs: { text: string; callback_data: string }[] } | null {
  const now = Date.now();
  const picks = (st?.picks ?? []).filter((p: any) => (!p.tip_utc || Date.parse(p.tip_utc) > now) && okOdd(p.odd, om));
  if (!picks.length) return null;
  const games = new Map<string, any[]>();
  for (const x of picks) { const k = [x.team, x.opp].sort().join(' x '); (games.get(k) ?? games.set(k, []).get(k)!).push(x); }
  const order = [...games.entries()].sort((a, b) => String(a[1][0].tip_utc ?? '').localeCompare(String(b[1][0].tip_utc ?? '')));
  const regs: { text: string; callback_data: string }[] = []; let i = 0;
  const blocks = order.map(([k, xs]) => `🏀 <b>${esc(k)}</b>${xs[0].tip_utc ? ' · ' + hourBR(xs[0].tip_utc) : ''}\n<blockquote>` + xs.map((x: any) => {
    i++; regs.push(BTN(`📝 ${i}`, `bet:${estKey(x)}:e.${x.strategy_id}`));
    return `<b>${i}. ${esc(x.name)}</b> · ${MKN[x.mk] ?? MK[x.mk] ?? x.mk}${x.strategy_id === 'reserva-under' ? ' <i>(reserva)</i>' : ''}\n${x.side === 'o' ? '⬆️ Mais' : '⬇️ Menos'} de <b>${n1(+x.line)}</b> · @${n2(+x.odd)} · ${pc(+x.p)}${need(+x.odd)}${x.edge != null ? ` · EV <b>${evS(+x.edge)}</b>${+x.edge >= .1 ? ' 🔥' : ''}` : ''}${x.sq?.length ? '\n' + sqLine(x.sq, +x.line, x.side) : ''}`;
  }).join('\n') + '</blockquote>');
  let text = `🧪 <b>RESUMO DO DIA · MODELO BH</b>\n<i>${dateBR(d.date)} · ${i} entrada${i > 1 ? 's' : ''} em aberto · linha e odd do alerta</i>\n\n${blocks.join('\n\n')}\n\n📝 <i>Toque no número e mande a odd que você pegou (ex.: <code>1,85</code> ou <code>1,85 0,5u</code>).</i>` + FOOT;
  if (text.length > 4090) text = text.slice(0, 3990).replace(/<[^>]*$/, '') + '</blockquote>…';
  return { text, regs };
}
// ---------- Registro de entradas (1u, odd real) e ROI ----------
const MK2STAT: Record<string, string> = { PTS: 'pts', REB: 'reb', AST: 'ast', '3PM': 'tpm', PRA: 'pts+reb+ast', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'fgm', FGA: 'fga', '2PM': 'twom', '2PA': 'twoa', '3PA': 'tpa', FTM: 'ftm', FTA: 'fta', STL: 'stl', BLK: 'blk', SB: 'stl+blk', TOV: 'tov', PF: 'pf' };
const SRC: Record<string, string> = { tent: 'Top tentativas', ra: 'Top reb+ast', modelo: '/modelo', lista: 'Outras listas' };
// origem "e.<estratégia>": entrada registrada a partir de uma estratégia
const srcName = (s: string) => SRC[s] ?? (s?.startsWith('e.') ? '🧪 ' + (ESTN[s.slice(2)] ?? s.slice(2)) : s);
const srcCmd = (s: string) => SRC_CMD[s] ?? (s?.startsWith('e.') ? '/estrategias ' + s.slice(2) : '');
const u2 = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',') + 'u';
const pctS = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
// chance do modelo numa linha qualquer (se o jogador estiver no Modelo BH de hoje)
function pAt(d: Data, pid: string, stat: string, line: number, side: string) {
  const m = d.mdl?.[pid]; if (!m) return null; const dist = modelDist(m, stat.split('+')); if (!dist) return null;
  const po = nbOver(dist.mu, dist.k, line); return side === 'o' ? po : 1 - po;
}
const ODD_KB = (id: number) => ({ inline_keyboard: [
  ['1.50', '1.60', '1.70', '1.80'].map(o => BTN(o.replace('.', ','), `bo:${id}:${o}`)),
  ['1.85', '1.90', '2.00', '2.20'].map(o => BTN(o.replace('.', ','), `bo:${id}:${o}`)),
  [BTN('❌ Cancelar', `bx:${id}`, 'danger')]] });
async function betStart(chatId: number, d: Data, r: Row, src: string): Promise<Out> {
  const stat = MK2STAT[r.m]; if (!stat) return { text: 'Esse mercado ainda não pode ser registrado.', kb: { inline_keyboard: [HOME] } };
  // cancela outro registro que ficou esperando odd
  await sb(`bets?chat_id=eq.${chatId}&status=eq.aguardando_odd`, { method: 'DELETE' }).catch(() => null);
  const row = (await sb('bets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ chat_id: chatId, date: d.date, pid: r.id, name: r.n, team: r.t, opp: r.o, mk: r.m, stat, line: r.l, ref_line: r.l, side: r.s, p_model: r.p, nota: r.nt ?? null, src, status: 'aguardando_odd' }) }))?.[0];
  return { text: `<b>📝 REGISTRAR ENTRADA · 1u</b>
<blockquote><b>${esc(r.n)}</b> <i>${r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`} · ${r.h}</i>
${r.s === 'o' ? '⬆️ Mais' : '⬇️ Menos'} de <b>${n1(r.l)}</b> ${MK[r.m] ?? r.m} · modelo ${pc(r.p)}${r.nt != null ? ` · nota ${r.nt}` : ''}${r.s === 'o' && r.fo ? `\n🟣 Finta paga <code>@${n2(r.fo)}</code> nesse over${r.d ? ` · 99play <code>@${n2(r.d)}</code>` : ''}` : ''}</blockquote>
<b>Qual odd você pegou?</b> Toque abaixo ou <b>responda com a odd</b>, por exemplo <code>1,83</code>.
Se a linha da sua casa for outra, mande odd e linha: <code>1,83 ${n1(r.l + 1)}</code>
Para outra stake, some as unidades: <code>1,83 2u</code>`, kb: ODD_KB(row.id), force: true };
}
// "1,83", "1,83 3,5", "1,83 3,5 2u"
function parseOdd(text: string) {
  const t = text.trim().toLowerCase().replace(/@/g, '').split(/\s+/);
  let odd: number | null = null, line: number | null = null, stake: number | null = null;
  for (const x of t) {
    const u = /^(\d+([.,]\d+)?)u$/.exec(x); if (u) { stake = parseFloat(u[1].replace(',', '.')); continue; }
    const v = parseFloat(x.replace(',', '.')); if (!Number.isFinite(v)) return null;
    if (odd == null) odd = v; else if (line == null) line = v; else return null;
  }
  if (odd == null || odd < 1.01 || odd > 50) return null;
  if (line != null && !Number.isInteger(line - .5)) line = Math.floor(line) + .5;
  if (stake != null && (stake <= 0 || stake > 20)) stake = null;
  return { odd, line, stake };
}
const CASA_LB: Record<string, string> = { '99play': '99play', finta: '🟣 Finta' };
const casaKB = (id: number, casa: string) => [BTN((casa === '99play' ? '✅ ' : '') + '99play', `bc:${id}:99play`), BTN((casa === 'finta' ? '✅ ' : '') + '🟣 Finta', `bc:${id}:finta`)];
async function betCasa(chatId: number, id: number, casa: string): Promise<Out> {
  if (!CASA_LB[casa]) casa = '99play';
  const b = (await sb(`bets?id=eq.${id}&chat_id=eq.${chatId}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ casa }) }).catch(() => []))?.[0];
  if (!b) return { text: 'Não achei essa entrada na sua banca.', kb: { inline_keyboard: [HOME] } };
  return { text: `✅ <b>Entrada #${b.id}</b> · ${esc(b.name)} · ${b.side === 'o' ? 'mais' : 'menos'} de ${n1(+b.line)} ${MK[b.mk] ?? b.mk} @${n2(+b.odd)}\nCasa: <b>${CASA_LB[casa]}</b>. As próximas entradas já começam nela.`,
    kb: { inline_keyboard: [casaKB(b.id, casa), [BTN('💼 Minha banca', '/banca'), BTN('🏠 Menu', '/menu')]] } };
}
async function betFinish(chatId: number, id: number | null, text: string): Promise<Out | null> {
  const q = id != null ? `bets?id=eq.${id}&chat_id=eq.${chatId}&status=eq.aguardando_odd` : `bets?chat_id=eq.${chatId}&status=eq.aguardando_odd&order=created_at.desc&limit=1`;
  const b = (await sb(q + '&select=*').catch(() => []))?.[0];
  if (!b) return null;
  const v = parseOdd(text);
  if (!v) return { text: 'Não entendi. Mande só a odd, por exemplo <code>1,83</code>, ou odd e linha: <code>1,83 3,5</code>.', kb: ODD_KB(b.id) };
  // casa (19/11): a última que o usuário usou (padrão 99play); troca com um toque na confirmação
  const casa = (await sb(`bets?chat_id=eq.${chatId}&status=neq.aguardando_odd&select=casa&order=id.desc&limit=1`).catch(() => []))?.[0]?.casa ?? '99play';
  const patch: Record<string, unknown> = { odd: v.odd, status: 'aberta', casa };
  if (v.stake) patch.stake = v.stake;
  if (v.line != null && v.line !== +b.line) {
    patch.line = v.line;
    const d = await data().catch(() => null); const p = d ? pAt(d, b.pid, b.stat, v.line, b.side) : null; if (p != null) patch.p_model = Math.round(p * 1000) / 1000;
  }
  await sb(`bets?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const line = (patch.line as number) ?? +b.line, p = (patch.p_model as number) ?? +b.p_model, st = (patch.stake as number) ?? +b.stake;
  const ev = p ? p * v.odd - 1 : null;
  return { text: `✅ <b>Entrada #${b.id} registrada</b>
<blockquote><b>${esc(b.name)}</b> · ${b.side === 'o' ? 'mais' : 'menos'} de ${n1(line)} ${MK[b.mk] ?? b.mk}
Odd <b>${n2(v.odd)}</b> · ${n1(st)}u${p ? ` · modelo ${pc(p)}${need(v.odd)}` : ''}${ev != null ? ` · EV pelo modelo ${pctS(ev)}` : ''}${line !== +b.ref_line ? `\n<i>linha da casa ${n1(line)} (referência era ${n1(+b.ref_line)})</i>` : ''}</blockquote>
Casa: <b>${CASA_LB[casa] ?? casa}</b> <i>(toque abaixo se foi na outra)</i>
Confiro sozinho depois do jogo e te conto de manhã. Acompanhe em /banca.`, kb: { inline_keyboard: [casaKB(b.id, casa), [BTN('💼 Minha banca', '/banca'), ...(srcCmd(b.src) ? [BTN('◀ Voltar', srcCmd(b.src))] : []), BTN('🏠 Menu', '/menu')]] } };
}
// o jogo do time já tem box score final? (results.json só lista jogos encerrados; sem o time na lista, a entrada segue aberta)
const gameDone = (res: any, date: string, team?: string) => { const g = res?.games?.[date]; if (!g) return false; if (!team) return true; return g.some((x: any[]) => x[1] === team || x[2] === team); };
async function settleBets(rows: any[]) {
  const open = rows.filter(r => r.status === 'aberta');
  if (!open.length) return;
  const res = await fetch(APP_URL + 'data/results.json?t=' + Math.floor(Date.now() / 300_000)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!res?.stats) return;
  for (const r of open) {
    if (!res.dates?.includes(r.date) || !gameDone(res, r.date, r.team)) continue;
    const a = res.stats[r.date]?.[r.pid];
    let patch: Record<string, unknown>;
    if (!a || !(a[0] > 0)) patch = { status: 'void', profit: 0, result: null };
    else {
      const v = String(r.stat).split('+').reduce((s, k) => s + (RES_IDX[k]?.(a) ?? 0), 0);
      const st = v === +r.line ? 'void' : (r.side === 'o' ? v > +r.line : v < +r.line) ? 'green' : 'red';
      patch = { status: st, result: v, profit: st === 'green' ? Math.round(+r.stake * (+r.odd - 1) * 100) / 100 : st === 'red' ? -+r.stake : 0 };
    }
    patch.settled_at = new Date().toISOString();
    Object.assign(r, patch);
    try { await sb(`bets?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); } catch { /* próxima vez */ }
  }
}
function bancaResumo(rows: any[]) {
  const done = rows.filter(r => r.status === 'green' || r.status === 'red');
  const agg = (a: any[]) => { const st = a.reduce((s, r) => s + +r.stake, 0), pr = a.reduce((s, r) => s + +r.profit, 0), g = a.filter(r => r.status === 'green').length; return { n: a.length, st, pr, roi: st ? pr / st : 0, hit: a.length ? g / a.length : 0 }; };
  const T = agg(done);
  const avgOdd = done.length ? done.reduce((s, r) => s + +r.odd, 0) / done.length : 0;
  const tab = (title: string, groups: [string, any[]][]) => {
    const rowsT = groups.filter(([, a]) => a.length).map(([k, a]) => { const x = agg(a); return `${k.padEnd(16).slice(0, 16)} ${String(x.n).padStart(3)} ${(Math.round(x.hit * 100) + '%').padStart(4)} ${u2(x.pr).padStart(7)} ${pctS(x.roi).padStart(7)}`; });
    return rowsT.length ? `\n<b>${title}</b>\n<pre>${'GRUPO'.padEnd(16)}   N  ACE   LUCRO     ROI\n${rowsT.join('\n')}</pre>` : '';
  };
  const by = (f: (r: any) => string) => { const m: Record<string, any[]> = {}; for (const r of done) (m[f(r)] ||= []).push(r); return Object.entries(m).sort((a, b) => b[1].length - a[1].length); };
  return `<blockquote>✅ <b>${done.filter(r => r.status === 'green').length}</b> · ❌ <b>${done.filter(r => r.status === 'red').length}</b> · ➖ ${rows.filter(r => r.status === 'void').length} · ⏳ ${rows.filter(r => r.status === 'aberta').length} em aberto
Apostado <b>${n1(Math.round(T.st * 100) / 100)}u</b> · Lucro <b>${u2(T.pr)}</b> · ROI <b>${pctS(T.roi)}</b>
Acerto ${Math.round(T.hit * 1000) / 10}%${avgOdd ? ` · odd média ${n2(avgOdd)} (empata com ${Math.round(100 / avgOdd)}%)` : ''}</blockquote>`
    + tab('Por casa', by(r => r.casa === 'finta' ? 'Finta' : '99play'))
    + tab('Por lista', by(r => srcName(r.src)))
    + tab('Por mercado', by(r => (MK[r.mk] ?? r.mk)))
    + tab('Por lado', by(r => r.side === 'o' ? 'Mais de' : 'Menos de'))
    + tab('Por nota', by(r => r.nota == null ? 'sem nota' : r.nota >= 70 ? 'nota 70+' : r.nota >= 60 ? 'nota 60–69' : 'nota <60'))
    + tab('Por odd', by(r => +r.odd < 1.7 ? 'odd < 1,70' : +r.odd < 1.9 ? 'odd 1,70–1,89' : 'odd 1,90+'));
}
async function bancaCmd(chatId: number, rest: string[]): Promise<Out> {
  const all = norm(rest[0] ?? '') === 'todos';
  let rows: any[] = [];
  try { rows = await sb(`bets?select=*&status=neq.aguardando_odd${all ? '' : `&chat_id=eq.${chatId}`}&order=created_at.desc&limit=2000`) ?? []; } catch { return { text: 'Não consegui ler a banca agora.', kb: { inline_keyboard: [HOME] } }; }
  await settleBets(rows);
  if (!rows.length) return { text: `<b>💼 BANCA DO MODELO BH</b>\nNenhuma entrada registrada ainda.\n\nNos tops (/toptentativas, /topra) e nas listas, toque em <b>📝</b> e informe a odd que você pegou. Cada entrada vale 1u e eu confiro sozinho depois do jogo.`, kb: { inline_keyboard: [[BTN('🏹 Top 10 Tentativas', '/toptentativas'), BTN('🙌 Top 10 Reb+Ast', '/topra')], HOME] } };
  const ic = (r: any) => r.status === 'green' ? '✅' : r.status === 'red' ? '❌' : r.status === 'void' ? '➖' : '⏳';
  const last = rows.slice(0, 10).map(r => `${ic(r)} <code>#${r.id}</code> ${esc(r.name)} · ${r.side === 'o' ? 'mais' : 'menos'} ${n1(+r.line)} ${MK[r.mk] ?? r.mk} @${n2(+r.odd)}${r.casa === 'finta' ? ' 🟣' : ''}${r.result != null ? ` <i>(fez ${n1(+r.result)})</i>` : ''}${r.profit != null && r.status !== 'aberta' ? ` ${u2(+r.profit)}` : ''}`).join('\n');
  const text = `<b>💼 ${all ? 'BANCA DE TODOS' : 'SUA BANCA'} · MODELO BH</b>\n` + bancaResumo(rows) + (await topsResumo()) + `\n\n<b>Últimas</b>\n${last}\n<i>Apagar uma entrada errada: <code>/apagar 12</code>. Amostra pequena engana: o ROI começa a dizer algo com 100+ entradas.</i>`;
  return { text: text.length > 4000 ? text.slice(0, 3990) + '…' : text, kb: { inline_keyboard: [[BTN(all ? '👤 Só a minha' : '👥 De todos', all ? '/banca' : '/banca todos'), BTN('🔄 Atualizar', all ? '/banca todos' : '/banca')], [BTN('🏹 Top Tentativas', '/toptentativas'), BTN('🙌 Top Reb+Ast', '/topra'), BTN('🏠 Menu', '/menu')]] } };
}
async function apagarCmd(chatId: number, rest: string[]): Promise<Out> {
  const id = parseInt((rest[0] ?? '').replace('#', ''), 10);
  if (!Number.isFinite(id)) return { text: 'Diga o número da entrada: <code>/apagar 12</code> (veja os números em /banca).', kb: { inline_keyboard: [HOME] } };
  const del = await sb(`bets?id=eq.${id}&chat_id=eq.${chatId}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }).catch(() => null);
  return { text: del?.length ? `🗑️ Entrada #${id} apagada.` : `Não achei a entrada #${id} entre as suas.`, kb: { inline_keyboard: [[BTN('💼 Minha banca', '/banca'), BTN('🏠 Menu', '/menu')]] } };
}
// ---------- Fábrica de estratégias (teste em papel; função estrategias + tabelas strategies/strategy_picks) ----------
async function estrategiasCmd(rest: string[]): Promise<Out> {
  const id = rest.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let stats: any[] = [], picks: any[] = [];
  try {
    stats = (await sb('strategy_stats?select=*&order=lucro.desc.nullslast') ?? []).filter((x: any) => !ARQ.has(x.id));
    picks = (await sb(`strategy_picks?date=eq.${etDate()}&select=strategy_id,pid,name,mk,side,line,odd,open_line,open_odd,odd_src,p,edge,status&order=first_at.asc`) ?? []).filter((x: any) => !ARQ.has(x.strategy_id));
  } catch { return { text: 'Não consegui ler as estratégias agora.', kb: { inline_keyboard: [HOME] } }; }
  if (!stats.length) return { text: 'Nenhuma estratégia cadastrada ainda.', kb: { inline_keyboard: [HOME] } };
  // antes da primeira gravação do dia, mostra a lista de hoje direto da coleta
  if (!picks.length) { const st = await estToday(etDate()); picks = (st?.picks ?? []).map((p: any) => ({ ...p, status: 'aberta', odd_src: p.odd ? p.odd_src : 'estimada' })); }
  const ev = (x: any) => evS(x);
  const pickLn = (x: any, i: number) => `${x.status === 'green' ? '✅' : x.status === 'red' ? '❌' : x.status === 'void' ? '➖' : '⏳'} <b>${i}.</b> ${esc(x.name)} ${x.side === 'o' ? '⬆️' : '⬇️'} ${n1(+(x.open_line ?? x.line))} ${MKS[x.mk] ?? x.mk} @${n2(+(x.open_odd ?? x.odd) || 1.87)}${x.odd_src === 'estimada' ? '*' : ''}${x.open_line != null && +x.open_line !== +x.line ? ` <i>(agora ${n1(+x.line)})</i>` : ''} · ${pc(+x.p)}${need(+(x.open_odd ?? x.odd))} · EV ${ev(x.edge == null ? null : +x.edge)}`;
  const kb = { inline_keyboard: [...chunk(stats.map(s => BTN(s.name, `/estrategias ${s.id}`)), 2), [BTN('🧪 Placar', '/estrategias'), BTN('⚖️ Veredito (CLV)', '/veredito'), BTN('✅ Gabarito', '/gabarito')], [BTN('🏠 Menu', '/menu')]] };
  const S = id ? stats.find(s => s.id === id) : null;
  if (S) {
    const mine = picks.filter(x => x.strategy_id === S.id);
    const descr = (await sb(`strategies?id=eq.${S.id}&select=descr`).catch(() => []))?.[0]?.descr ?? '';
    const regs = mine.map((x, i) => x.status === 'aberta' && x.pid ? BTN(`📝${i + 1}`, `be:${estKey(x)}:e.${S.id}`) : null).filter(Boolean) as { text: string; callback_data: string }[];
    return { text: `<b>🧪 ${esc(S.name)}</b> <i>(${S.status})</i>\n<i>${esc(descr)}</i>\n<blockquote>Conferidas <b>${S.n}</b> · ✅ ${S.g} · ❌ ${S.r} · ➖ ${S.v}\nLucro <b>${u2(+S.lucro || 0)}</b> · ROI <b>${S.roi == null ? '–' : pctS(+S.roi)}</b> · odd média ${S.odd_media ? n2(+S.odd_media) : '–'}\nCLV médio ${S.clv_linha_media == null ? '–' : (S.clv_linha_media >= 0 ? '+' : '') + n1(+S.clv_linha_media)} · EV médio ${ev(S.edge_medio == null ? null : +S.edge_medio)}</blockquote>\n<b>Hoje</b>\n${mine.length ? mine.map((x, i) => pickLn(x, i + 1)).join('\n') : 'Nenhuma entrada hoje.'}\n<i>* odd estimada (1,87). O placar é teste em papel (1u por entrada).${regs.length ? ' 📝 registra a sua entrada real com a odd que você pegou.' : ''}</i>`,
      kb: { inline_keyboard: [...chunk(regs, 5), ...kb.inline_keyboard] } };
  }
  const tab = stats.map(s => `${String(s.name).padEnd(18).slice(0, 18)} ${String(s.n).padStart(3)} ${(s.n ? Math.round(s.g / s.n * 100) + '%' : '–').padStart(4)} ${u2(+s.lucro || 0).padStart(7)} ${s.clv_linha_media == null ? '   –' : ((s.clv_linha_media >= 0 ? '+' : '') + n1(+s.clv_linha_media)).padStart(4)}`).join('\n');
  const hoje = stats.map(s => `${esc(s.name)}: <b>${picks.filter(x => x.strategy_id === s.id).length}</b>`).join(' · ');
  return { text: `<b>🧪 MODELO POR MERCADO</b>\n<i>As melhores entradas do Modelo BH em cada mercado, na linha e odd da 99play · registro automático, 1u por entrada</i>\n<pre>MERCADO             N  ACE   LUCRO  CLV\n${tab}</pre>\n<b>Entradas hoje</b>\n${hoje}\n\n<i>Um mercado só merece stake de verdade com 50+ entradas, ROI positivo e CLV positivo. CLV = quanto a linha andou a nosso favor até o jogo. Toque num mercado para ver as entradas de hoje.</i>`, kb };
}
// ---------- Veredito pelo fechamento (19/11): o papel julgado pelo CLV (função estrategias ?veredito=1, público e agregado) ----------
async function vereditoCmd(arg = ''): Promise<Out> {
  const V: any = await fetch('https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/estrategias?veredito=1').then(r => r.ok ? r.json() : null).catch(() => null);
  if (!V?.total) return { text: 'Não consegui ler o veredito agora. Tente de novo em alguns minutos.', kb: { inline_keyboard: [HOME] } };
  const ICO: Record<string, string> = { bate: '🟢', atras: '🔴', semprova: '🟡', cedo: '⚪' };
  const pp = (x: number | null) => x == null ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2).replace('.', ',');
  const tt = (x: number | null) => x == null ? '–' : (x < 0 ? '−' : '') + n1(Math.abs(x));
  const roi = (x: any) => x.roi == null ? '' : ` · ROI ${x.roi >= 0 ? '+' : '−'}${Math.round(Math.abs(x.roi) * 100)}% ±${Math.round(x.faixa * 100)}`;
  const ln = (lb: string, x: any) => `${ICO[x.ver.k]} <b>${esc(lb)}</b> · ${x.ver.lb}\n   CLV <b>${pp(x.clv)} pts</b> (t ${tt(x.t)}, ${x.npp} leituras) · bateu ${x.lidas ? Math.round(x.f / x.lidas * 100) : 0}%${roi(x)}`;
  const mode = arg === 'faixa' ? 'faixa' : arg === 'mercado' ? 'mercado' : 'metodo';
  let body = '';
  const pc1 = (x: number | null) => x == null ? '–' : (x >= 0 ? '+' : '−') + (Math.abs(x) * 100).toFixed(1).replace('.', ',') + '%';
  const C = V.comparo;
  const comp = C?.n ? `\n<b>99play × Finta no mesmo over:</b> Finta pagou mais em ${C.fin} de ${C.n} (99play em ${C.p99}); pegar sempre a melhor = <b>${pc1(C.ganho)}</b> na odd${C.conferidas ? `\nConferidas (${C.conferidas}): ROI 99play ${pc1(C.roi99)} · Finta ${pc1(C.roiFin)} · melhor das duas <b>${pc1(C.roiMelhor)}</b>` : ''}` : '';
  if (mode === 'metodo') body = [ln('Tudo no papel', V.total), ...V.metodo.map((x: any) => ln(x.k, x)), '', ...V.lado.map((x: any) => ln(x.k, x)), '', ...(V.casa ?? []).map((x: any) => ln(x.k, x))].join('\n') + comp;
  else if (mode === 'faixa') body = V.faixa.map((x: any) => ln('EV ' + x.k, x)).join('\n');
  else body = V.estrategia.filter((x: any) => x.npp >= 5).sort((a: any, b: any) => (b.t ?? -99) - (a.t ?? -99)).slice(0, 25).map((x: any) => ln(x.nome, x)).join('\n');
  const tit = { metodo: 'POR MÉTODO E LADO', faixa: 'POR FAIXA DE VALOR', mercado: 'POR ESTRATÉGIA' }[mode];
  const text = `<b>⚖️ VEREDITO PELO FECHAMENTO · ${tit}</b>\n<i>O papel julgado pelo CLV: quanto a odd da 99play andou a nosso favor até o jogo, em pontos de chance. Com poucas centenas de entradas o green/red ainda é sorte; o CLV mostra antes se o método pega valor.</i>\n\n${body}\n\n<i>🟢 bate o fechamento (t ≥ 2) · 🟡 sem prova ainda · 🔴 atrás do fechamento (t ≤ −2) · ⚪ cedo demais (menos de 30 leituras). ROI ± = faixa de sorte: se cruza o zero, o lucro ainda não prova nada.</i>`;
  return { text: fitHTML(text), kb: { inline_keyboard: [[BTN(mode === 'metodo' ? '• Métodos' : 'Métodos', '/veredito'), BTN(mode === 'faixa' ? '• Faixa de valor' : 'Faixa de valor', '/veredito faixa'), BTN(mode === 'mercado' ? '• Estratégias' : 'Estratégias', '/veredito mercado')], [BTN('🧪 Placar', '/estrategias'), { text: '📈 No app', url: APP_URL + '#placar' }], [HOME[0]]] } };
}
// ---------- /correl (21/11, ideia do MC Analytics): props correlacionadas entre companheiros ----------
// Escolha um jogador e um patamar (ex.: Wagner 8+ assistências): nos jogos em que ele bateu, como cada companheiro foi na
// linha de HOJE, contra o acerto geral dele. Acerto "encolhido" para a média (peso de 6 jogos) para a sorte de amostra
// pequena não subir na lista. Dados: public/data/correl/<TIME>.json (coleta; histórico 2025-26 e 2026-27, só no time).
const CR_MK: Record<string, string> = { PTS: 'pontos', REB: 'rebotes', AST: 'assistências', '3PM': 'cestas de 3', PRA: 'pts+reb+ast' };
const CR_ALIAS: Record<string, string> = { pts: 'PTS', pontos: 'PTS', ponto: 'PTS', reb: 'REB', rebote: 'REB', rebotes: 'REB', ast: 'AST', assist: 'AST', assistencia: 'AST', assistencias: 'AST', '3pm': '3PM', '3': '3PM', triplos: '3PM', bolas: '3PM' };
async function correlCmd(rest: string[]): Promise<Out> {
  const help = { text: '<b>🔗 PROPS CORRELACIONADAS</b>\nEscolha um jogador e um patamar e veja como os companheiros foram nos jogos em que ele bateu.\n\nEx.: <code>/correl wagner</code> (escolho o patamar com você) ou <code>/correl wagner 8 ast</code>', kb: { inline_keyboard: [HOME] } };
  if (!rest.length) return help;
  const d = await data();
  let a = rest.map(x => x.toLowerCase()), mk: string | null = null, thr: number | null = null;
  const sem = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const x of [...a]) { const k = CR_ALIAS[sem(x)]; if (k && a.length > 1) { mk = k; a = a.filter(y => y !== x); } }
  for (const x of [...a]) if (/^\d+\+?$/.test(x) && a.length > 1) { thr = parseInt(x); a = a.filter(y => y !== x); }
  const q = a.join(' ');
  const pool = new Map<string, { id: string; n: string; t: string; o: string; h: string; home: boolean }>();
  for (const r of d.rows) if (!pool.has(r.id)) pool.set(r.id, { id: r.id, n: r.n, t: r.t, o: r.o, h: r.h, home: r.home });
  const nq = nName(q), found = [...pool.values()].filter(p => p.id === q || nName(p.n).includes(nq));
  if (!found.length) return { text: `Não achei <b>${esc(q)}</b> nos jogos de hoje.`, kb: { inline_keyboard: [HOME] } };
  if (found.length > 1 && !found.some(p => nName(p.n) === nq)) return { text: `Achei ${found.length} jogadores. Qual?`, kb: { inline_keyboard: [...chunk(found.slice(0, 10).map(p => BTN(`${p.n} (${p.t})`, `/correl ${p.id}${mk ? ' ' + mk : ''}${thr ? ' ' + thr : ''}`.slice(0, 60))), 2), HOME] } };
  const P = found.find(p => nName(p.n) === nq) ?? found[0];
  const T: any = await fetch(APP_URL + `data/correl/${P.t}.json?t=` + Math.floor(Date.now() / 3e5)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!T?.games?.length) return { text: `Ainda não tenho o histórico do ${esc(P.t)} para a correlação (entra com a próxima coleta).`, kb: { inline_keyboard: [HOME] } };
  const mine = T.games.filter(([, s]: any) => s[P.id]).map(([, s]: any) => s[P.id]);
  if (mine.length < 8) return { text: `${esc(P.n)} tem poucos jogos no ${esc(P.t)} (${mine.length}) para medir correlação.`, kb: { inline_keyboard: [HOME] } };
  const IDX: Record<string, number> = { PTS: 1, REB: 2, AST: 3, '3PM': 4 };
  const med = (k: string) => { const v = mine.slice(0, 20).map((g: number[]) => g[IDX[k]]).sort((x: number, y: number) => x - y); return v[Math.floor(v.length / 2)]; };
  if (!mk || !thr) {
    // escolher o patamar: mediana dos últimos 20, +2 e +4 (cestas de 3: +1 e +2)
    const rows = ['PTS', 'REB', 'AST', '3PM'].map(k => { const m = Math.max(1, med(k)), st = k === '3PM' ? 1 : k === 'PTS' ? 4 : 2;
      return [0, 1, 2].map(i => m + i * st).map(t => BTN(`${CR_MK[k].replace('assistências', 'ast').replace('cestas de 3', '3pts')} ${t}+`, `/correl ${P.id} ${k} ${t}`)); });
    return { text: `<b>🔗 CORRELAÇÃO · ${esc(P.n)}</b>  <i>${P.t} · ${P.h}</i>\nEscolha o patamar dele. Mostro como os companheiros foram nos jogos em que ele bateu, na linha de hoje.\n<i>Mediana nos últimos 20: ${med('PTS')} pts · ${med('REB')} reb · ${med('AST')} ast · ${med('3PM')} de 3</i>`, kb: { inline_keyboard: [...rows, HOME] } };
  }
  const R = correlOf(T, P.id, mk, thr);
  const ok = R.list.filter((x: any) => x.st !== 'out');
  const up = ok.filter((x: any) => x.ls >= .08).slice(0, 6), down = ok.filter((x: any) => x.ls <= -.08).slice(0, 3);
  const pct0 = (x: number) => Math.round(x * 100) + '%';
  const odds = (x: any, side: 'o' | 'u') => { const o = side === 'o' ? x.o : x.u, parts = [o ? `🔵 99play @${n2(o)}` : '', side === 'o' && x.fo ? `🟣 Finta @${n2(x.fo)}` : ''].filter(Boolean); return parts.length ? `\n   ${parts.join(' · ')}` : ''; };
  const it = (x: any, side: 'o' | 'u') => `${side === 'o' ? '⬆️' : '⬇️'} <b>${esc(x.n)}</b> · ${side === 'o' ? 'mais' : 'menos'} de ${n1(x.line)} ${CR_MK[x.mk]}${x.st === 'questionable' ? ' 🟡' : ''}\n   ${side === 'o' ? `${x.hH}/${x.nH}` : `${x.nH - x.hH}/${x.nH}`} (${pct0(side === 'o' ? x.rH : 1 - x.rH)}) contra ${pct0(side === 'o' ? x.rA : 1 - x.rA)} no geral · média ${n1(x.aH)} vs ${n1(x.aA)}${odds(x, side)}`;
  const small = R.nH < 10 ? `\n⚠️ <i>Amostra pequena (${R.nH} jogos): use como ideia, não como prova.</i>` : '';
  const body = R.nH < 4 ? `\nEle bateu ${thr}+ ${CR_MK[mk]} só ${R.nH} vezes em ${R.nG} jogos: pouco para medir. Tente um patamar menor.`
    : `\n${up.length ? '<b>Sobem quando ele bate</b>\n' + up.map(x => it(x, 'o')).join('\n') : 'Nenhum companheiro sobe de forma clara.'}${down.length ? '\n\n<b>Caem quando ele bate</b> <i>(ideia de under)</i>\n' + down.map(x => it(x, 'u')).join('\n') : ''}`;
  const head = `<b>🔗 CORRELAÇÃO · ${esc(P.n)} com ${thr}+ ${CR_MK[mk]}</b>\n<i>${P.home ? `${P.t} x ${P.o}` : `${P.t} @ ${P.o}`} · ${P.h} · bateu em ${R.nH} de ${R.nG} jogos no ${P.t} (esta temporada e a passada)</i>`;
  const nota = `\n<i>Acerto na linha de hoje de cada companheiro, nos jogos em que ele bateu, contra o acerto geral. A lista ordena pelo acerto encolhido para a média, para a sorte de poucos jogos não pesar. Se a casa monta combo com os dois, essa correlação quase nunca é descontada.</i>`;
  const ths = [thr - (mk === '3PM' ? 1 : 2), thr + (mk === '3PM' ? 1 : 2)].filter(t => t > 0).map(t => BTN(`${t}+`, `/correl ${P.id} ${mk} ${t}`));
  return { text: fitHTML(head + body + small + nota), kb: { inline_keyboard: [[...ths, BTN('Outro patamar', `/correl ${P.id}`)], [BTN('🟣 Combo Finta', `/combo ${P.id}`), BTN('👤 Jogador', `/jogador ${P.id}`)], HOME] } };
}

// ---------- rodar os números na hora (20/11) ----------
// Dispara o pipeline do GitHub com o token guardado em bot_config.GH_DISPATCH (o administrador manda com /github).
async function cfgV(k: string) { return (await sb(`bot_config?key=eq.${k}&select=value`).catch(() => null))?.[0]?.value ?? null; }
async function ghRun(minGapMin = 3): Promise<string> {
  const tok = await cfgV('GH_DISPATCH'); if (!tok) return 'sem token';
  const last = Date.parse(await cfgV('GH_LAST') ?? ''); if (last && Date.now() - last < minGapMin * 6e4) return 'já rodando';
  const r = await fetch('https://api.github.com/repos/gabrielcbjr29/black-house-props/actions/workflows/atualizar.yml/dispatches', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'User-Agent': 'blackhouse-bot', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
  if (r.status !== 204) return 'erro ' + r.status;
  await putCfgKey('GH_LAST', new Date().toISOString()).catch(() => null);
  return 'ok';
}
/* próxima rodada automática: aos :50 de cada hora */
function nextRun(now = Date.now()) { const d = new Date(now); d.setUTCSeconds(0, 0); if (d.getUTCMinutes() >= 50) d.setUTCHours(d.getUTCHours() + 1); d.setUTCMinutes(50); return d.getTime(); }
async function rodarCmd(chatId: number, ler = false): Promise<Out> {
  if (ler) {
    await putCfgKey('C99_PEDIDO', new Date().toISOString()).catch(() => null);
    return { text: '🔵 <b>Leitura pedida.</b> Com a aba da 99play aberta no PC (leitor 1.3), ele lê em até 1 minuto e os números rodam sozinhos logo depois (~6 min no total). Toque em <b>Atualizar a pauta</b> daqui a uns 7 minutos.', kb: { inline_keyboard: [[BTN('🔄 Atualizar a pauta', '/pauta')], HOME] } };
  }
  const r = await ghRun();
  const txt = r === 'ok' ? '▶️ <b>Rodando os números agora.</b> Em ~6 minutos a pauta e o bot atualizam com a última leitura da 99play. Toque em <b>Atualizar a pauta</b> depois.'
    : r === 'já rodando' ? '⏳ Os números já estão rodando (pedido há menos de 3 min). Em alguns minutos toque em <b>Atualizar a pauta</b>.'
    : r === 'sem token' ? `Rodar na hora ainda não está ligado (falta o token do GitHub do administrador: <code>/github SEU_TOKEN</code>). A próxima rodada automática é às ${hourBR(new Date(nextRun()).toISOString())}.`
    : `Não consegui rodar agora (${esc(r)}). A próxima rodada automática é às ${hourBR(new Date(nextRun()).toISOString())}.`;
  return { text: txt, kb: { inline_keyboard: [[BTN('🔄 Atualizar a pauta', '/pauta')], HOME] } };
}

// ---------- /combo (19/11): escada de rebotes e assistências da Finta × marcos da 99play, só odd 15+ na Finta ----------
// Abas: 🎯 Ast + Reb (principal) · ➕ Ast/Reb + duplo-duplo · 🔺 Ast + Reb + triplo-duplo. A escada da Finta vem do
// combo.json (coleta); a da 99play, da última foto do leitor (marcos 5+/7+/10+, desde o leitor 1.2), lida na hora.
// Odd do combo nas duas casas = produto das pernas × K (combo.json K), até as capturas do Criar Aposta calibrarem.
let C99L: { at: number; snap: string | null; by: Record<string, any> } | null = null;
async function lad99() {
  if (C99L && Date.now() - C99L.at < 60_000) return C99L;
  const j: any = await fetch('https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest?latest=1').then(r => r.ok ? r.json() : null).catch(() => null);
  C99L = { at: Date.now(), snap: j?.taken_at ?? null, by: j?.payload ? parseLadder99(j.payload) : {} }; return C99L;
}
const CB_LB: Record<string, string> = { AST: 'Ast', REB: 'Reb', DD: 'Duplo-duplo', TD: 'Triplo-duplo' };
const legTxt = (l: any) => l.line == null ? CB_LB[l.mk] : `${CB_LB[l.mk]} ${n1(l.line)}+`;
const marco = (l: any) => l.line == null ? CB_LB[l.mk] : `${CB_LB[l.mk]} ${Math.round(l.line + .5)}+`;
async function comboCmd(chatId: number, rest: string[]): Promise<Out> {
  const TABS: Record<string, string> = { ar: '🎯 Ast + Reb', dd: '➕ Duplo-duplo', td: '🔺 Triplo-duplo' };
  let tipo = 'ar', a = [...rest];
  if (a[0] === 'ler') {
    if (!(await isAdmin(chatId))) return { text: 'Só o administrador pede leitura da 99play.', kb: { inline_keyboard: [HOME] } };
    await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'C99_PEDIDO', value: new Date().toISOString() }) }).catch(() => null);
    C99L = null;
    const back = a.slice(1).join(' ');
    return { text: '🔵 <b>Pedido enviado.</b> Com a aba da 99play aberta no PC, o leitor lê em até 1 minuto (leva mais ~1 min para ler todos os jogos). Toque em <b>Atualizar</b> daqui a 2 minutos.', kb: { inline_keyboard: [[BTN('🔄 Atualizar', ('/combo ' + back).slice(0, 60))], HOME] } };
  }
  if (TABS[a[0]]) tipo = a.shift()!;
  const q = a.join(' ').trim();
  if (!q) return { text: '<b>🟣 COMBO FINTA × 99PLAY</b>\nDigite o jogador: <code>/combo lebron</code>\nMostra as combinações de assistências e rebotes (e com duplo/triplo-duplo) que pagam <b>15+ na Finta</b>, e a mesma entrada na 99play.', kb: { inline_keyboard: [HOME] } };
  const C: any = await fetch(APP_URL + 'data/combo.json?t=' + Math.floor(Date.now() / 120_000)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!C?.players?.length) return { text: 'A escada da Finta de hoje ainda não foi lida. Ela entra com a coleta (de hora em hora).', kb: { inline_keyboard: [HOME] } };
  const nq = nName(q);
  let found = /^\d+$/.test(q) ? C.players.filter((p: any) => p.id === q) : C.players.filter((p: any) => p.k.includes(nq));
  if (!found.length) return { text: `Não achei <b>${esc(q)}</b> com escada de rebotes/assistências na Finta hoje.`, kb: { inline_keyboard: [HOME] } };
  if (found.length > 1 && !found.some((p: any) => p.k === nq)) return { text: `Achei ${found.length} jogadores. Qual?`, kb: { inline_keyboard: [...chunk(found.slice(0, 10).map((p: any) => BTN(`${p.n} (${p.t})`, `/combo ${tipo} ${p.id}`)), 2), HOME] } };
  const P = found.find((p: any) => p.k === nq) ?? found[0];
  const L9 = await lad99(), lad = L9.by[P.k] ?? null;
  const list = combosOf(P, tipo, lad, C.K, C.min);
  const pc0 = (x: number) => Math.round(Math.abs(x) * 100) + '%';
  const item = (x: any, i: number) => {
    const fin = x.legs.map((l: any) => n2(l.fo)).join(' × ');
    const miss = x.legs.filter((l: any) => !(l.o99 > 1)).map(marco);
    const l99 = x.n99 ? `🔵 99play ${x.legs.map((l: any) => n2(l.o99)).join(' × ')} ≈ <b>@${n2(x.n99)}</b>\n   ➜ ${Math.abs(x.dif) < .005 ? 'mesma odd nas duas' : x.dif > 0 ? `<b>Finta paga ${pc0(x.dif)} a mais</b>` : `<b>99play paga ${pc0(1 / (1 + x.dif) - 1)} a mais</b>`}`
      : `🔵 99play: ${miss.length === x.legs.length ? 'nenhuma perna lida' : `${esc(miss.join(', '))} não lido`}${lad ? '' : ' <i>(sem a escada do leitor 1.2+)</i>'}`;
    return `<b>${i + 1}. ${x.legs.map(legTxt).join(' e ')}</b>\n   🟣 Finta ${fin} ≈ <b>@${n2(x.fin)}</b>\n   ${l99}\n   📊 Bateu ${x.h10}/${x.n10} · ${x.h20}/${x.n20}`;
  };
  const vazio = tipo === 'td' && !P.legs.TD ? `A Finta não oferece triplo-duplo de ${esc(P.n)} hoje.` : tipo === 'dd' && !P.legs.DD ? `A Finta não oferece duplo-duplo de ${esc(P.n)} hoje.` : `Nenhuma combinação dessa aba paga 15+ na Finta.`;
  const hdr = `<b>🟣 COMBO · ${esc(P.n)}</b>  <i>${P.home ? `${P.t} x ${P.o}` : `${P.t} @ ${P.o}`} · ${P.h}</i>${P.st && P.st !== 'ok' ? ' 🟡' : ''}\n${TABS[tipo]} · só odd 15+ na Finta\n<i>Finta ${C.fg ? hourBR(C.fg) : '–'} · 99play ${L9.snap ? hourBR(L9.snap) : '–'}</i>`;
  const body = list.length ? `<blockquote>${list.slice(0, 8).map(item).join('\n\n')}</blockquote>${list.length > 8 ? `\n<i>+${list.length - 8} combinações 15+ (as 8 que mais bateram nos últimos 20)</i>` : ''}` : `\n${vazio}`;
  const nota = `\n<i>Odd do combo estimada: produto das pernas × ${n2(C.K.finta)} na Finta e × ${n2(C.K['99play'])} na 99play (as casas descontam a correlação). Marco 7+ na 99play = mais de 6,5 na Finta.</i>`;
  const tabs = Object.entries(TABS).map(([k, lb]) => BTN((k === tipo ? '• ' : '') + lb, `/combo ${k} ${P.id}`));
  const adm = await isAdmin(chatId);
  return { text: fitHTML(hdr + '\n' + body + nota), kb: { inline_keyboard: [tabs, [...(adm ? [BTN('🔵 Ler 99play agora', `/combo ler ${tipo} ${P.id}`)] : []), BTN('🔄 Atualizar', `/combo ${tipo} ${P.id}`)], [BTN('🏠 Menu', '/menu')]] } };
}
// ---------- Histórico automático do top 10 e resultado da manhã ----------
const etDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
async function getResults() { return fetch(APP_URL + 'data/results.json?t=' + Math.floor(Date.now() / 300_000)).then(r => r.ok ? r.json() : null).catch(() => null); }
const ODD_EST = 1.87;
// grava os tops do dia (cada sugestão uma vez por lista; enquanto o jogo não começa, a sugestão é atualizada
// com a linha e a odd mais novas). Chamado a cada atualização dos dados (pg_cron) e no envio diário.
async function recordTops(d: Data) {
  const tip: Record<string, number> = {}; for (const g of d.games) tip[g.id] = Date.parse(g.utc ?? '') || 0;
  const now = Date.now(), rows: Record<string, unknown>[] = [];
  // odd: a das casas que achamos (mediana das casas dos EUA pela The Odds API); sem odd real, 1,87 (preço típico de abertura de prop)
  const T = tops(d);
  for (const k of ['tent', 'ra']) T[k].forEach((r, i) => {
    if (tip[r.g] && tip[r.g] <= now + 5 * 6e4) return; // jogo já começou: fica a última sugestão gravada
    rows.push({ date: d.date, list: k, rank: i + 1, pid: r.id, name: r.n, team: r.t, opp: r.o, mk: r.m, stat: MK2STAT[r.m], line: r.l, side: r.s, p: r.p, nota: r.nt ?? null, status: 'aberta',
      ref_line: r.rf ?? null, odd: r.d ?? ODD_EST, odd_src: r.d ? (r.k ? 'Kalshi' : (r.b || 'casa')) : 'estimada', tip_utc: tip[r.g] ? new Date(tip[r.g]).toISOString() : null, updated_at: new Date(now).toISOString() });
  });
  // sem entrada repetida na mesma lista no dia: se o jogador já foi registrado nessa lista (ex.: tentados de manhã),
  // não entra de novo com outro mercado da mesma lista (ex.: lances à noite). Em listas diferentes pode.
  const have: any[] = await sb(`top_picks?date=eq.${d.date}&select=pid,list,mk`).catch(() => []) ?? [];
  const fresh = rows.filter(x => !have.some(h => h.pid === x.pid && h.list === x.list && h.mk !== x.mk));
  rows.length = 0; rows.push(...fresh);
  if (!rows.length) return 0;
  await sb('top_picks?on_conflict=date,list,pid,mk', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
  return rows.length;
}
async function settleTops(rows: any[], res: any) {
  for (const r of rows.filter(x => x.status === 'aberta')) {
    if (!res?.dates?.includes(r.date) || !gameDone(res, r.date, r.team)) continue;
    const a = res.stats[r.date]?.[r.pid];
    let patch: Record<string, unknown>;
    if (!a || !(a[0] > 0)) patch = { status: 'void', result: null };
    else { const v = String(r.stat).split('+').reduce((s, k) => s + (RES_IDX[k]?.(a) ?? 0), 0); patch = { result: v, status: v === +r.line ? 'void' : (r.side === 'o' ? v > +r.line : v < +r.line) ? 'green' : 'red' }; }
    patch.profit = patch.status === 'green' ? Math.round(((+r.odd || ODD_EST) - 1) * 100) / 100 : patch.status === 'red' ? -1 : 0;
    patch.settled_at = new Date().toISOString(); Object.assign(r, patch);
    await sb(`top_picks?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
  }
}
const hitOf = (a: any[]) => { const g = a.filter(x => x.status === 'green').length, n = a.filter(x => x.status === 'green' || x.status === 'red').length; const pr = a.reduce((s, x) => s + (x.status === 'green' || x.status === 'red' ? +x.profit || 0 : 0), 0); return { g, n, v: a.filter(x => x.status === 'void').length, pct: n ? Math.round(g / n * 100) : 0, pr, roi: n ? pr / n : 0 }; };
// acumulado do top 10 automático (todas as datas conferidas)
async function topsResumo() {
  const all: any[] = await sb('top_picks?select=date,list,status,profit,odd_src&status=in.(green,red,void)&limit=5000').catch(() => []) ?? [];
  if (!all.length) return '';
  const t = hitOf(all.filter(x => x.list === 'tent')), r = hitOf(all.filter(x => x.list === 'ra')), T = hitOf(all), real = hitOf(all.filter(x => x.odd_src !== 'estimada'));
  const dias = new Set(all.map(x => x.date)).size;
  const ln = (ic: string, lb: string, h: ReturnType<typeof hitOf>) => `${ic} ${lb}: ${h.g}/${h.n} (${h.pct}%) · <b>${u2(h.pr)}</b> · ROI ${pctS(h.roi)}`;
  return `\n<b>📈 Teste do Modelo BH · ${dias} dia${dias > 1 ? 's' : ''} conferido${dias > 1 ? 's' : ''} (1u por entrada)</b>\n${ln('🏹', 'Tentativas', t)}\n${ln('🙌', 'Reb+Ast', r)}\n${ln('📊', 'Total', T)}${real.n ? `\n<i>Só com odd real das casas: ${real.g}/${real.n} · ${u2(real.pr)} · ROI ${pctS(real.roi)}</i>` : ''}`;
}
async function morningText(chatId: number, y: string, picks: any[], res: any) {
  const parts: string[] = [];
  const mine: any[] = await sb(`bets?chat_id=eq.${chatId}&date=eq.${y}&status=neq.aguardando_odd&order=id`).catch(() => []) ?? [];
  await settleBets(mine);
  if (mine.length) {
    const done = mine.filter(r => r.status === 'green' || r.status === 'red'), st = done.reduce((a, r) => a + +r.stake, 0), pr = mine.reduce((a, r) => a + (+r.profit || 0), 0);
    const ic = (r: any) => r.status === 'green' ? '✅' : r.status === 'red' ? '❌' : r.status === 'void' ? '➖' : '⏳';
    const lines = mine.slice(0, 12).map(r => `${ic(r)} ${esc(r.name)} · ${r.side === 'o' ? 'mais' : 'menos'} ${n1(+r.line)} ${MKS[r.mk] ?? r.mk} @${n2(+r.odd)}${r.result != null ? ` <i>(fez ${n1(+r.result)})</i>` : ''}${r.status !== 'aberta' ? ' ' + u2(+r.profit || 0) : ''}`).join('\n');
    const all: any[] = await sb(`bets?chat_id=eq.${chatId}&status=in.(green,red)&select=stake,profit`).catch(() => []) ?? [];
    const ST = all.reduce((a, r) => a + +r.stake, 0), PR = all.reduce((a, r) => a + +r.profit, 0);
    parts.push(`<b>💼 Suas entradas</b>\n<blockquote>✅ ${done.filter(r => r.status === 'green').length} · ❌ ${done.filter(r => r.status === 'red').length} · ➖ ${mine.filter(r => r.status === 'void').length} · <b>${u2(pr)}</b>${st ? ` · ROI ${pctS(pr / st)}` : ''}\n${lines}</blockquote>${all.length ? `\nBanca total: <b>${u2(PR)}</b> em ${all.length} entradas · ROI ${pctS(ST ? PR / ST : 0)}` : ''}`);
  }
  if (picks.length) {
    const L = (k: string) => { const a = picks.filter(x => x.list === k).sort((x, z) => x.rank - z.rank); if (!a.length) return ''; const h = hitOf(a);
      const det = a.map(x => `${x.status === 'green' ? '✅' : x.status === 'red' ? '❌' : x.status === 'void' ? '➖' : '⏳'} ${esc(x.name)} ${x.side === 'o' ? '⬆️' : '⬇️'} ${n1(+x.line)} ${MKS[x.mk] ?? x.mk} @${n2(+x.odd || ODD_EST)}${x.odd_src === 'estimada' ? '*' : ''}${x.result != null ? ` <i>(${n1(+x.result)})</i>` : ''}`).join('\n');
      return `${MT[k].ic} ${k === 'tent' ? 'Tentativas' : 'Reb+Ast'}: <b>${h.g}/${h.n}</b>${h.v ? ` (${h.v} anulada${h.v > 1 ? 's' : ''})` : ''} · <b>${u2(h.pr)}</b> · ROI ${pctS(h.roi)}\n<blockquote expandable>${det}</blockquote>`; };
    parts.push(`<b>📈 Top 10 do Modelo BH</b>\n${[L('tent'), L('ra')].filter(Boolean).join('\n')}` + await topsResumo());
  }
  if (!parts.length) return null;
  const pl = placarCurto(await loadAud());
  if (pl) parts.push(pl);
  return `☀️ <b>RESULTADO DE ONTEM · ${dateBR(y)}</b>\n\n` + parts.join('\n\n') + `\n\n<i>* odd estimada (1,87): mercado sem odd nas nossas fontes. Hoje o resumo sai cerca de 2h30 antes do primeiro jogo.</i>`;
}
// gabarito das estratégias de um dia: confere cada entrada (1u na odd da 99play gravada) e mostra o acumulado de cada estratégia
async function settleStrats(rows: any[], res: any) {
  for (const r of rows.filter(x => x.status === 'aberta')) {
    if (!res?.dates?.includes(r.date)) continue;
    const a = res.stats[r.date]?.[r.pid];
    const L = +(r.open_line ?? r.line), O = +(r.open_odd ?? r.odd) || ODD_EST; // entrada: linha e odd do alerta
    let status = 'void', result: number | null = null;
    if (a && a[0] > 0) { result = String(r.stat).split('+').reduce((s, k) => s + (RES_IDX[k]?.(a) ?? 0), 0); status = result === L ? 'void' : (r.side === 'o' ? result > L : result < L) ? 'green' : 'red'; }
    const patch = { status, result, profit: status === 'green' ? Math.round((O - 1) * 100) / 100 : status === 'red' ? -1 : 0, settled_at: new Date().toISOString() };
    Object.assign(r, patch);
    await sb(`strategy_picks?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
  }
}
async function estGabarito(y: string, res: any) {
  const rows: any[] = await sb(`strategy_picks?date=eq.${y}&select=id,date,strategy_id,pid,name,mk,stat,side,line,odd,open_line,open_odd,odd_src,status,result,profit,clv_line,alerted&order=first_at.asc`).catch(() => []) ?? [];
  if (!rows.length) return null;
  await settleStrats(rows, res);
  const stats: any[] = await sb('strategy_stats?select=*').catch(() => []) ?? [];
  const ic = (x: any) => x.status === 'green' ? '✅' : x.status === 'red' ? '❌' : x.status === 'void' ? '➖' : '⏳';
  const build = (det: boolean) => {
    const blocks: string[] = [];
    for (const S of stats) {
      const a = rows.filter(x => x.strategy_id === S.id); if (!a.length) continue;
      const h = hitOf(a);
      const lines = a.map(x => `${ic(x)} ${x.alerted ? "📬 " : ""}${esc(x.name)} ${x.side === 'o' ? '⬆️' : '⬇️'} ${n1(+(x.open_line ?? x.line))} ${MKS[x.mk] ?? x.mk} @${n2(+(x.open_odd ?? x.odd) || ODD_EST)}${x.result != null ? ` <i>(fez ${n1(+x.result)})</i>` : ''}${x.clv_line != null && +x.clv_line !== 0 ? ` · fechou ${n1(+x.line)} (CLV ${+x.clv_line > 0 ? '+' : ''}${n1(+x.clv_line)})` : ''}`).join('\n');
      blocks.push(`<b>🧪 ${esc(S.name)}</b>: <b>${h.g}/${h.n}</b>${h.v ? ` (${h.v} anulada${h.v > 1 ? 's' : ''})` : ''} · <b>${u2(h.pr)}</b>${det ? `\n<blockquote>${lines}</blockquote>` : ''}\n<i>Acumulado: ${S.n} entradas · ${u2(+S.lucro || 0)} · ROI ${S.roi == null ? '–' : pctS(+S.roi)}</i>`);
    }
    const T = hitOf(rows), A = hitOf(rows.filter(x => x.alerted));
    return `🧪 <b>GABARITO DO MODELO POR MERCADO · ${dateBR(y)}</b>\n<i>1u por entrada, na linha e odd da 99play do alerta</i>\n\n${blocks.join('\n\n')}\n\n📬 <b>Alertadas (EV mínimo): ${A.g}/${A.n} · ${u2(A.pr)} · ROI ${pctS(A.roi)}</b>\n📊 Todas do papel: ${T.g}/${T.n} · ${u2(T.pr)} · ROI ${pctS(T.roi)}\n<i>CLV = quanto a linha andou a nosso favor até o jogo começar.${det ? '' : ' Entrada por entrada: aba Estratégias da planilha.'}</i>`;
  };
  const text = build(true);
  return text.length <= 4090 ? text : build(false);
}
// saúde do sistema: coleta, leitor da 99play, papel de hoje, inscritos
// placar da verdade: linhas de fechamento da 99play × resultado (scripts/auditoria.mjs). Só medição.
const br4 = (x: number | null | undefined) => x == null ? '–' : x.toFixed(4).replace('.', ',');
const betLn = (b: any) => b?.n ? `previu ${pc(b.prev)} · acertou <b>${pc(b.real)}</b> · ROI <b>${pctS(b.roi)}</b> <i>(${b.n})</i>` : '<i>sem amostra</i>';
export function placarText(a: any, ult7 = false): string | null {
  const T = ult7 ? a?.ult7 : a?.total; if (!T?.n) return null;
  const ch = T.chance ?? {}, bh = Object.keys(ch).find(k => k.startsWith('BH')) ?? '';
  const L = [`🧾 <b>PLACAR DA VERDADE</b>${ult7 ? ' · últimos dias' : ''}`,
    `<i>Fechamento da 99play × resultado · ${dm(T.de)} a ${dm(T.ate)} · ${T.n.toLocaleString('pt-BR')} linhas · atualizado ${hourBR(a.gen)}</i>`, '',
    '<b>Quem prevê melhor</b> <i>(Brier: menor é melhor; moeda = 0,2500)</i>',
    `99play sem margem <b>${br4(ch['99play sem margem']?.brier)}</b> · BH <b>${br4(ch[bh]?.brier)}</b> · modelo puro ${br4(ch['Modelo BH puro']?.brier)}`,
    T.kalshi?.n ? `Onde a Kalshi tem preço (${T.kalshi.n}): Kalshi <b>${br4(T.kalshi.chance?.Kalshi)}</b> · 99play ${br4(T.kalshi.chance?.['99play sem margem'])} · BH ${br4(T.kalshi.chance?.BH)}` : '<i>Kalshi: ainda sem linha liquidada</i>',
    T.melhorPeso ? `<i>Melhor peso do modelo na mistura: ${String(T.melhorPeso.w).replace('.', ',')} (o bot usa ${String(a.w).replace('.', ',')})</i>` : '', '',
    '<b>EV do BH × acerto real</b> <i>(lado de maior EV, odd de fechamento)</i>',
    ...(T.porEV ?? []).map((x: any) => `EV ${esc(x.faixa)}: ${betLn(x)}`), '',
    '<b>Nota × acerto</b>', ...(T.porNota ?? []).map((x: any) => `${GRADE[x.nota] ?? x.nota}: ${betLn(x)}`), '',
    `<b>Às cegas</b>: over ${pctS(T.cegas?.over?.roi ?? 0)} · under ${pctS(T.cegas?.under?.roi ?? 0)} · margem média da 99play ${pc(T.cegas?.margem ?? null)}`,
    T.clv?.n ? `<b>CLV</b> (EV 5%+ na abertura, ${T.clv.n}): 99play andou a favor ${pc(T.clv['99play a favor'])} · contra ${pc(T.clv['99play contra'])} · ROI na abertura <b>${pctS(T.clv.roiAbertura)}</b>` : '',
    T.clv?.kalshi?.n ? `<b>CLV contra a Kalshi</b> (${T.clv.kalshi.n}): médio <b>${pctS(T.clv.kalshi.clvMedio)}</b> · positivo em ${pc(T.clv.kalshi.positivo)}` : '<i>CLV contra a Kalshi: amostra ainda sendo juntada</i>',
    ...(T.kalshi?.n ? ['', '<b>Valor contra a Kalshi</b> <i>(base do Alavanca)</i>', ...['EV_k 2–4%', 'EV_k 4%+'].map(k => `${k}: ${betLn(T.kalshi[k])}`)] : []), '',
    '<b>Hipóteses em teste</b>', ...Object.entries(T.hipoteses ?? {}).map(([k, v]) => `${esc(k)}: ${betLn(v)}`), '',
    '<i>Só medição: os métodos ficam como estão até a revisão de 24/11. Amostra curta engana; o que vale é a tendência ao longo das semanas.</i>'];
  return L.filter((x, i, A) => x !== '' || A[i - 1] !== '').join('\n');
}
// resumo curto do placar (envio da manhã)
function placarCurto(a: any): string {
  const T = a?.total; if (!T?.n) return '';
  const ch = T.chance ?? {}, bh = Object.keys(ch).find(k => k.startsWith('BH')) ?? '', c = T.canal?.['EV 5%+ (simples do canal)'];
  return `<b>🧾 Placar da verdade</b> <i>(${T.n.toLocaleString('pt-BR')} linhas, ${dm(T.de)}–${dm(T.ate)})</i>\nBrier 99play ${br4(ch['99play sem margem']?.brier)} · BH ${br4(ch[bh]?.brier)}${T.kalshi?.n ? ` · Kalshi ${br4(T.kalshi.chance?.Kalshi)}` : ''}${c?.n ? `\nEV 5%+: previu ${pc(c.prev)} · acertou <b>${pc(c.real)}</b> · ROI ${pctS(c.roi)}` : ''}`;
}
async function placarCmd(arg?: string): Promise<Out> {
  const a = await loadAud(), ult7 = arg === '7';
  const text = placarText(a, ult7) ?? '🧾 <b>Placar da verdade</b>\nAinda sem linhas liquidadas. O placar enche sozinho a cada coleta.';
  return { text, kb: { inline_keyboard: [[ult7 ? BTN('📚 Tudo', '/placar') : BTN('📅 Últimos 7 dias', '/placar 7'), { text: '📈 No app', url: APP_URL + '#placar' }], HOME] } };
}
async function statusCmd(): Promise<Out> {
  const ago = (iso?: string | null) => { if (!iso) return null; const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
  const [d, snap, picks, subs] = await Promise.all([
    data().catch(() => null),
    sb('c99_snapshots?select=taken_at,n_events,n_markets&order=taken_at.desc&limit=1').then(r => r?.[0]).catch(() => null),
    sb(`strategy_picks?date=eq.${etDate()}&select=status,alerted,strategy_id`).catch(() => [] as any[]),
    sb('bot_subs?select=chat_id&est=eq.true').catch(() => [] as any[]),
  ]);
  const ageH = (iso?: string | null) => iso ? (Date.now() - Date.parse(iso)) / 36e5 : Infinity;
  const ok = (h: number, lim: number) => h < lim ? '✅' : h < lim * 2 ? '🟡' : '🔴';
  const L = ['🩺 <b>SAÚDE DO SISTEMA</b>', ''];
  L.push(`${ok(ageH(d?.gen), 1.5)} <b>Coleta</b>: ${d ? `dados das ${hourBR(d.gen)} (${ago(d.gen)}) · ${d.games.length} jogos · ${d.rows.length} linhas` : 'indisponível'}`);
  L.push(`${ok(ageH(snap?.taken_at), 1.5)} <b>Leitor 99play</b>: ${snap ? `leitura às ${hourBR(snap.taken_at)} (${ago(snap.taken_at)}) · ${snap.n_events} jogos · ${snap.n_markets} mercados` : 'sem leitura'}`);
  const n = picks?.length ?? 0, al = picks?.filter((p: any) => p.alerted).length ?? 0, ab = picks?.filter((p: any) => p.status === 'aberta').length ?? 0;
  L.push(`🧪 <b>Papel de hoje</b>: ${n} entradas · ${al} alertadas · ${ab} em aberto`);
  L.push(`📬 <b>Inscritos nos alertas</b>: ${subs?.length ?? 0}`);
  L.push('', '<i>Coleta: de hora em hora aos :50 · leitura 99play: aos :35 · gravação e alertas: a cada 15 min · gabarito: 11h05.</i>');
  if (ageH(snap?.taken_at) >= 2) L.push('⚠️ <i>Leitor parado há 2h+: o PC está ligado com a aba da 99play aberta e o selo BH?</i>');
  if (ageH(d?.gen) >= 2.5) L.push('⚠️ <i>Coleta parada há 2h30+: confira as execuções no GitHub.</i>');
  return { text: L.join('\n'), kb: { inline_keyboard: [[BTN('🧪 Placar', '/estrategias'), BTN('📄 PDF do dia', '/pdf')], HOME] } };
}
async function gabaritoCmd(): Promise<Out> {
  const y = etDate(Date.now() - 864e5), res = await getResults();
  const kb = { inline_keyboard: [[BTN('🧪 Placar das estratégias', '/estrategias'), BTN('💼 Banca', '/banca')], [BTN('🏠 Menu', '/menu')]] };
  if (!res?.dates?.includes(y)) return { text: `Os resultados de ${dateBR(y)} ainda não saíram (a coleta das 10h traz). Tente mais tarde.`, kb };
  return { text: (await estGabarito(y, res)) ?? `Nenhuma entrada de estratégia gravada em ${dateBR(y)}.`, kb };
}
const MORNING_KB = () => ({ inline_keyboard: [[BTN('💼 Minha banca', '/banca'), BTN('🧪 Gabarito das estratégias', '/gabarito')], [BTN('🧾 Placar da verdade', '/placar'), BTN('🧠 Modelo BH', '/modelobh')], [BTN('🏠 Menu', '/menu')]] });
async function ontemCmd(chatId: number): Promise<Out> {
  const y = etDate(Date.now() - 864e5), res = await getResults();
  if (!res?.dates?.includes(y)) return { text: `Os resultados de ${dateBR(y)} ainda não saíram (a coleta das 10h traz). Tente mais tarde.`, kb: MORNING_KB() };
  const picks: any[] = await sb(`top_picks?date=eq.${y}`).catch(() => []) ?? [];
  await settleTops(picks, res);
  return { text: (await morningText(chatId, y, picks, res)) ?? `Nada registrado em ${dateBR(y)}: nem entradas suas, nem top 10 enviado.`, kb: MORNING_KB() };
}
// envio da manhã (pg_cron): confere ontem e manda para quem recebe os tops ou registrou entrada
async function morningPush(force = false) {
  const y = etDate(Date.now() - 864e5), flag = `MORNING_${y}`;
  if (!force && (await sb(`bot_config?key=eq.${flag}&select=key`).catch(() => []))?.length) return { ok: true, skip: 'já enviado hoje' };
  const res = await getResults();
  if (!res?.dates?.includes(y)) return { ok: true, skip: `resultados de ${y} ainda não saíram` };
  const picks: any[] = await sb(`top_picks?date=eq.${y}`).catch(() => []) ?? [];
  await settleTops(picks, res);
  // rodada terminou? Só manda quando nenhuma entrada do dia (papel, top 10 ou apostas) ficou sem jogo conferido.
  // Antes das 10h30, espera a rodada inteira; depois disso manda mesmo assim (jogo adiado, sem box score etc.).
  const hBR = +new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (!force && hBR < 10) {
    const teams = new Set<string>();
    for (const p of picks) if (p.status === 'aberta') teams.add(p.team);
    for (const p of (await sb(`strategy_picks?date=eq.${y}&status=eq.aberta&select=team`).catch(() => [])) ?? []) teams.add(p.team);
    for (const p of (await sb(`bets?date=eq.${y}&status=eq.aberta&select=team`).catch(() => [])) ?? []) teams.add(p.team);
    const pend = [...teams].filter(t => !gameDone(res, y, t));
    if (pend.length) return { ok: true, skip: `rodada em andamento: ${pend.join(', ')}` };
  }
  const quiet = hBR < 8;
  const subs: any[] = await sb('bot_subs?select=chat_id,tent,ra,est&or=(tent.eq.true,ra.eq.true,est.eq.true)').catch(() => []) ?? [];
  const gab = await estGabarito(y, res).catch(e => { console.error('gabarito', e); return null; });
  const bettors: any[] = await sb(`bets?select=chat_id&date=eq.${y}&status=neq.aguardando_odd`).catch(() => []) ?? [];
  const chats = [...new Set([...subs, ...bettors].map(x => +x.chat_id))];
  let sent = 0;
  for (const c of chats) {
    const text = await morningText(c, y, subs.some(x => +x.chat_id === c && (x.tent || x.ra)) ? picks : [], res);
    if (text) {
      const r = await TG('sendMessage', { chat_id: c, text: fitHTML(text), parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: quiet, reply_markup: MORNING_KB() });
      if (r.ok) sent++;
      await new Promise(ok => setTimeout(ok, 60));
    }
    if (gab && subs.some(x => +x.chat_id === c && x.est)) {
      const r = await TG('sendMessage', { chat_id: c, text: gab, parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: quiet, reply_markup: { inline_keyboard: [[BTN('🧪 Placar das estratégias', '/estrategias'), BTN('💼 Banca', '/banca')], [BTN('🏠 Menu', '/menu')]] } });
      if (r.ok) sent++;
      await new Promise(ok => setTimeout(ok, 60));
    }
  }
  await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: flag, value: String(sent), updated_at: new Date().toISOString() }) }).catch(() => null);
  return { ok: true, date: y, tops: picks.length, estrategias: !!gab, chats: chats.length, mensagens: sent };
}
const hitTxt = (h?: [number, number] | null) => h?.[1] ? `<b>${h[0]}/${h[1]}</b>` : '–';

type Out = { text: string; kb?: unknown; force?: boolean };
const BTN = (text: string, data: string, style?: 'success' | 'danger' | 'primary') => ({ text, callback_data: data.slice(0, 64), ...(style ? { style } : {}) });
const HOME = [BTN('🏠 Menu', '/menu'), BTN('🔄 Atualizar', 'r:1:/menu')];
const home = (cmd: string, pg = 1) => [BTN('🏠 Menu', '/menu'), BTN('🔄 Atualizar', `r:${pg}:${cmd}`)];

const sideW = (r: Row) => r.s === 'o' ? 'acima' : 'abaixo';
// "sem o colega" em uma linha (só quando há 2+ jogos reais sem ele)
const woTxt = (r: Row) => r.wo ? `🚑 ${r.wo.x ? 'Sem' : 'Se faltar,'} ${esc(r.wo.q)}${r.wo.x ? '' : ' (em dúvida)'}: <b>${r.wo.h[0]}/${r.wo.h[1]}</b> ${sideW(r)} · média ${n1(r.wo.a)}` : '';
const edTxt = (r: Row) => r.ed == null ? '' : ` · vantagem <b>${r.ed >= 0 ? '+' : '−'}${n1(Math.abs(r.ed))}</b>`;
// selo de evidência: a chance da Kalshi (preço afiado) e quanto a faixa de EV desta entrada acertou de verdade no placar
const EVB: [number, number, string][] = [[-9, 0, '< 0'], [0, .03, '0–3%'], [.03, .05, '3–5%'], [.05, .08, '5–8%'], [.08, .12, '8–12%'], [.12, 9, '12%+']];
const dm = (d: string) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
export function selo(r: Row, aud: any = AUD, curto = false) {
  const L: string[] = [];
  if (curto) {
    const nm = r.e == null ? null : (EVB.find(([lo, hi]) => r.e! >= lo && r.e! < hi) ?? EVB[0])[2];
    const b = nm ? aud?.total?.porEV?.find((x: any) => x.faixa === nm) : null;
    const t = [r.kp != null && r.kp > 0 ? `🏛️ Kalshi <b>${pc(r.kp)}</b>` : '', b?.n >= 30 ? `🧾 faixa acertou <b>${pc(b.real)}</b> (previu ${pc(b.prev)})` : ''].filter(Boolean);
    return t.length ? '\n' + t.join(' · ') : '';
  }
  if (r.kp != null && r.kp > 0) L.push(`🏛️ Kalshi <b>${pc(r.kp)}</b> · odd justa @${n2(1 / r.kp)}${r.d ? ` · valor vs Kalshi <b>${pctS(r.kp * r.d - 1)}</b>` : ''}`);
  if (aud?.total && r.e != null) {
    const nm = (EVB.find(([lo, hi]) => r.e! >= lo && r.e! < hi) ?? EVB[0])[2];
    const b7 = aud.ult7?.porEV?.find((x: any) => x.faixa === nm), bt = aud.total.porEV?.find((x: any) => x.faixa === nm);
    const [b, j] = b7?.n >= 100 ? [b7, `${aud.ult7.dias} dias`] : bt?.n >= 30 ? [bt, `desde ${dm(aud.total.de)}`] : [null, ''];
    if (b) L.push(`🧾 Placar EV ${esc(nm)}: previu ${pc(b.prev)} · acertou <b>${pc(b.real)}</b> · ROI ${pctS(b.roi)} <i>(${b.n} entradas, ${j})</i>${b.real < b.prev - .04 ? ' ⚠️ <i>otimista</i>' : ''}`);
  }
  return L.length ? '\n' + L.join('\n') : '';
}
const hora = (r: Row) => { const u = GUTC.get(r.g); return u ? `<tg-time unix="${Math.floor(Date.parse(u) / 1000)}" format="t">${r.h}</tg-time>` : r.h; };
function card(r: Row, i: number) {
  const over = r.s === 'o';
  const side = over ? '⬆️ <b>Mais de ' + n1(r.l) + '</b>' : '⬇️ <b>Menos de ' + n1(r.l) + '</b>';
  const vs = r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`;
  const odd = r.d ? `💵 <code>@${n2(r.d)}</code> ${esc(r.b ?? '')}${r.k ? ' <i>(bolsa)</i>' : ''}` : `💵 odd justa <code>@${n2(1 / r.p)}</code> <i>(sem casa)</i>`;
  const ev = r.e == null ? '' : ` · EV <b>${r.e >= 0 ? '+' : ''}${(r.e * 100).toFixed(1).replace('.', ',')}%</b>`;
  const nota = r.nt != null ? ` · Nota <b>${r.nt}</b>` : '';
  // histórico em janelas (estilo hit rate): recente, temporada, temporada passada e confronto
  const hits = `📊 L5 ${hitTxt(r.l5)} · L10 ${hitTxt(r.l10)} · L20 ${hitTxt(r.l20)}
📅 Temp. ${hitTxt(r.ss)} · Temp. passada ${hitTxt(r.tp)} · vs ${r.o} ${hitTxt(r.hh)}
${seq(r) ? `${sqLine(r.sq, r.l, r.s)}\n🔢 <code>${seq(r)}</code>\n` : ''}${r.sk && r.sk >= 2 ? `🔥 <b>${r.sk} seguidos</b> ${sideW(r)} · ` : ''}🧠 ${r.mb ? 'Modelo BH' : 'Projeção'} <b>${n1(Math.round(r.pj * 10) / 10)}</b>${edTxt(r)}`;
  let def = '';
  if (r.dv?.r) {
    const good = over ? r.dv.r >= r.dv.of - 5 : r.dv.r <= 6, bad = over ? r.dv.r <= 6 : r.dv.r >= r.dv.of - 5;
    def = `\n🛡️ Defesa ${r.o}: ${r.dv.r}ª/${r.dv.of} contra ${r.dv.ps} em ${esc(r.dv.k)}${good ? ' · <b>favorável</b>' : bad ? ' · <i>difícil</i>' : ''}`;
  }
  const wo = woTxt(r);
  // por que sim / por que não (sem repetir o que as linhas acima já mostram), num bloco que abre ao tocar
  const dup = /^(Bateu em|Defesa do|Contra o |Sem |Temporada passada|\d+ jogos seguidos)/;
  const wy = (r.wy ?? []).filter(t => !dup.test(t)).slice(0, 3).map(t => `✅ ${esc(t)}`);
  const wn = (r.wn ?? []).filter(t => !dup.test(t)).slice(0, 2).map(t => `⚠️ ${esc(t)}`);
  if (!r.wn && r.e != null && r.e > .15) wn.push('⚠️ <i>Muito acima do mercado: confira notícias</i>');
  if (r.st === 'questionable' && !wn.some(t => t.includes('dúvida'))) wn.push('🟡 <i>Jogador em dúvida</i>');
  const why = [...wy, ...wn];
  return `<blockquote><b>${i}. ${esc(r.n)}</b>  <i>${vs} · ${hora(r)}</i>
${side} ${MK[r.m] ?? r.m}
${GRADE[r.gr] ?? r.gr}${nota}  ${bar(r.p)} <b>${pc(r.p)}</b>${need(r.d)}${r.q != null ? ` <i>(mercado ${pc(r.q)})</i>` : ''}
${odd}${ev}${selo(r)}${mvTxt(r)}${r.rf != null && r.c9 ? `\n📏 Linha de referência <b>${n1(r.rf)}</b> <i>(mediana dos últimos 15)</i>` : ''}
${hits}${wo ? '\n' + wo : ''}${def}</blockquote>${why.length ? `\n<blockquote expandable><b>Por que sim / por que não</b>\n${why.join('\n')}</blockquote>` : ''}`;
}
// movimento de linha (21/11): abertura do dia × agora na 99play (mesmo lado) e na Finta (mesmo over)
function mvTxt(r: Row) {
  const out: string[] = [];
  if (r.mv && r.d) {
    const [l0, o0] = r.mv, dl = r.s === 'o' ? r.l - l0 : l0 - r.l;
    const fav = dl > 0 || (dl === 0 && 1 / r.d > 1 / o0), lnTxt = (x: number) => l0 !== r.l ? `<b>${n1(x)}</b> ` : '';
    out.push(`${fav ? '📈' : '📉'} 99play abriu ${lnTxt(l0)}@${n2(o0)} → agora ${lnTxt(r.l)}@${n2(r.d)} <i>(${fav ? `mercado indo para o ${r.s === 'o' ? 'over' : 'under'}` : 'mercado indo contra'})</i>`);
  }
  if (r.s === 'o' && r.fmv && r.fo) out.push(`🟣 Finta abriu @${n2(r.fmv)} → agora @${n2(r.fo)}`);
  return out.length ? '\n' + out.join('\n') : '';
}
// cartão das listas (visual de antes)
function listCard(r: Row, i: number) {
  const over = r.s === 'o';
  const side = over ? '⬆️ <b>Mais de ' + n1(r.l) + '</b>' : '⬇️ <b>Menos de ' + n1(r.l) + '</b>';
  const vs = r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`;
  const odd = r.d ? `💵 <code>@${n2(r.d)}</code> ${esc(r.b ?? '')}${r.k ? ' <i>(bolsa)</i>' : ''}` : `💵 odd justa <code>@${n2(1 / r.p)}</code> <i>(sem casa)</i>`;
  const ev = r.e == null ? '' : ` · EV <b>${r.e >= 0 ? '+' : ''}${(r.e * 100).toFixed(1).replace('.', ',')}%</b>`;
  const nota = r.nt != null ? ` · Nota <b>${r.nt}</b>` : '';
  // três acertos lado a lado: últimos 10 · temporada · contra o adversário
  const hits = `📊 L10 ${hitTxt(r.l10)} · Temp. ${hitTxt(r.ss)} · vs ${r.o} ${hitTxt(r.hh)}${seq(r) ? `\n${sqLine(r.sq, r.l, r.s)}\n🔢 <code>${seq(r)}</code>` : ''}\n🧠 ${r.mb ? 'Modelo BH' : 'Projeção'}: <b>${n1(Math.round(r.pj * 10) / 10)}</b>`;
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
  return `<blockquote><b>${i}. ${esc(r.n)}</b>  <i>${vs} · ${hora(r)}</i>
${side} ${MK[r.m] ?? r.m}
${GRADE[r.gr] ?? r.gr}${nota}  ${bar(r.p)} <b>${pc(r.p)}</b>${need(r.d)}${r.q != null ? ` <i>(mercado ${pc(r.q)})</i>` : ''}
${odd}${ev}${selo(r, AUD, true)}${r.fo && r.s === 'o' ? `\n🟣 Finta paga <code>@${n2(r.fo)}</code> nesse over` : ''}${mvTxt(r)}${r.rf != null && r.c9 ? `\n📏 Linha de referência <b>${n1(r.rf)}</b> <i>(mediana dos últimos 15)</i>` : ''}
${hits}${def}${duvida(r)}${why.length ? '\n' + why.join('\n') : ''}</blockquote>`;
}
function header(d: Data, title: string, extra = '') {
  return `<b>${title}</b>\n<i>${dateBR(d.date)} · ${d.games.length} jogos · atualizado ${hourBR(d.gen)}${d.demo ? ' · demonstração' : ''}${extra}</i>\n`;
}
const SRC_CMD: Record<string, string> = { tent: '/toptentativas', ra: '/topra' };
// page < 0 = abre a entrada número -page da lista (análise completa, na mesma mensagem)
function list(d: Data, rows: Row[], title: string, n: number, cmd: string, page = 1, onePerPlayer = true, empty = '', note = ''): Out {
  const seen = new Set<string>(), all: Row[] = [];
  for (const r of rows) { if (onePerPlayer && seen.has(r.id)) continue; seen.add(r.id); all.push(r); if (all.length >= n) break; }
  if (!all.length) return { text: header(d, title, note) + '\nNenhuma linha boa nesse filtro agora.' + (empty ? '\n' + empty : '') + '\n' + FOOT, kb: { inline_keyboard: [HOME] } };
  const src = cmd.startsWith('/toptentativas') ? 'tent' : cmd.startsWith('/topra') ? 'ra' : 'lista';
  if (page < 0) {
    const k = Math.min(all.length, -page), r = all[k - 1], pg = Math.ceil(k / PAGE);
    const nav = [k > 1 ? BTN('‹ Anterior', `x:${k - 1}:${cmd}`) : null, BTN('☰ Lista', `p:${pg}:${cmd}`), k < all.length ? BTN('Próxima ›', `x:${k + 1}:${cmd}`) : null].filter(Boolean) as { text: string; callback_data: string }[];
    return { text: header(d, title, note) + '\n' + card(r, k) + '\n' + FOOT,
      kb: { inline_keyboard: [[BTN('📝 Registrar (1u)', `be:${keyOf(r)}:${src}`, 'success'), ...(r.cd ? [BTN('🖼️ Card', `i:${keyOf(r)}`)] : [])], [{ text: '📋 Copiar para inscritos', copy_text: { text: shareText(r).slice(0, 256) } }], nav, [BTN('🏠 Menu', '/menu')]] } };
  }
  const pages = Math.ceil(all.length / PAGE), pg = Math.max(1, Math.min(pages, page));
  const slice = all.slice((pg - 1) * PAGE, pg * PAGE);
  const body = slice.map((r, i) => listCard(r, (pg - 1) * PAGE + i + 1)).join('\n');
  const nav = [];
  if (pg > 1) nav.push(BTN('◀ Anteriores', `p:${pg - 1}:${cmd}`));
  if (pages > 1) nav.push(BTN(`${pg}/${pages}`, `p:${pg}:${cmd}`));
  if (pg < pages) nav.push(BTN('Próximas ▶', `p:${pg + 1}:${cmd}`));
  const pics = slice.map((r, i) => r.cd ? BTN(`🖼️ ${(pg - 1) * PAGE + i + 1}`, `i:${keyOf(r)}`) : null).filter(Boolean) as { text: string; callback_data: string }[];
  const nums = slice.map((_, i) => BTN(`🔎 ${(pg - 1) * PAGE + i + 1}`, `x:${(pg - 1) * PAGE + i + 1}:${cmd}`));
  const share = src === 'tent' || src === 'ra' ? [[BTN('📤 Texto p/ inscritos (lista toda)', 'cp:' + src)]] : [];
  return { text: header(d, title, note + (pages > 1 ? ` · página ${pg}/${pages}` : '')) + '\n' + body + '\n<i>🔎 análise completa, registro e 📋 copiar' + (pics.length ? ' · 🖼️ ver o card em imagem' : '') + '</i>\n' + FOOT, kb: { inline_keyboard: [nums, ...(pics.length ? [pics] : []), ...(nav.length ? [nav] : []), ...share, home(cmd, pg)] } };
}
const clampN = (s: string | undefined, def = 10) => { const x = parseInt(s ?? '', 10); return Number.isFinite(x) ? Math.max(1, Math.min(20, x)) : def; };

function multipla(d: Data, arg: string | undefined, om = 0): Out {
  const v = arg ? parseFloat(arg.replace(',', '.')) : NaN;
  const target = Number.isFinite(v) && v >= 1.3 && !(Number.isInteger(v) && v <= 8) ? v : null;
  const legs = target ? 8 : Math.max(2, Math.min(6, Number.isFinite(v) ? v : 3));
  const cand = d.rows.filter(r => (r.gr === 'A+' || r.gr === 'A') && r.d && r.d >= Math.max(ODD_MIN, om) && r.d <= ODD_MAX && (r.e ?? 0) >= 0 && (r.e ?? 0) <= .15 && r.st === 'ok')
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
${bar(p)} chance ${pc(p)}${need(odd)} · EV ${evx >= 0 ? '+' : ''}${evx.toFixed(1).replace('.', ',')}%
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
/tentativas · tentados (de 3, de 2, lances) e convertidos
/convertidos · arremessos convertidos
/defesa · roubos, tocos, erros e faltas
/faltas · faltas cometidas

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
/receber · receber os tops e as estratégias todo dia
/banca · suas entradas registradas, lucro e ROI · /banca todos
/apagar 12 · apaga uma entrada registrada errada
/ontem · resultado de ontem (chega sozinho de manhã)
/estrategias · modelo por mercado: placar e entradas do dia
/minutos · Método Minutos: titular fora, minutos sobem → over (placar e entradas do dia)
/veredito · Veredito pelo fechamento (CLV) de cada método, lado e faixa de valor
/rodar · Rodar os números agora · /ler · pedir leitura da 99play ao PC
/correl · Props correlacionadas: como os companheiros vão quando um jogador bate um patamar (ex.: /correl wagner 8 ast)
/combo · Combo Finta × 99play de um jogador: ast + reb (e duplo/triplo-duplo) 15+ na Finta (ex.: /combo lebron)
/finta · overs da Finta com valor (linha principal e escada)
/gabarito · resultado de ontem de cada mercado (chega sozinho de manhã)
/placar · placar da verdade: modelo × 99play × Kalshi no fechamento · /placar 7
/status · saúde do sistema: coleta, leitor da 99play, papel de hoje
/app · app completo

<b>Como usar as listas</b>
Toque em 🔎 e o número para abrir a análise completa na mesma mensagem (L5, L20, temporada passada, sequência, sem o colega) e registrar (📝). 🖼️ manda o card em imagem.

<b>Como ler o cartão</b>
<b>Nota</b> 0–100: quanto os dados sustentam a entrada (chance, valor, acertos, confronto, defesa e mercado).
<b>L5 · L10 · L20 · Temp. · Temp. passada · vs</b>: acertos em cada janela e contra o adversário de hoje.
🔥 sequência atual · <b>vantagem</b> = projeção menos a linha, a favor do lado.
🚑 <b>Sem o colega</b>: como ele rendeu (até 2 temporadas) nos jogos sem o colega que está fora hoje.
✅ motivos a favor · ⚠️ ponto de atenção.
As listas mostram só odds entre 1,40 e 3,50.`;
const MENU = { inline_keyboard: [
  [BTN('🔥 Top do dia', '/top'), BTN('💰 Valor', '/valor'), BTN('🛡️ Seguras', '/seguras')],
  [BTN('🏀 Pontos', '/pontos'), BTN('🙌 Rebotes', '/rebotes'), BTN('🎯 Assist.', '/assist')],
  [BTN('👌 Bolas de 3', '/tres'), BTN('➕ PRA', '/pra'), BTN('🧩 Combinados', '/combinados')],
  [BTN('🏹 Tentativas', '/tentativas'), BTN('🧱 Defesa', '/defesa'), BTN('🟨 Faltas', '/faltas')],
  [BTN('🗓️ Jogos', '/jogos'), BTN('🚑 Desfalques', '/desfalques'), BTN('📋 Resumo', '/resumo')],
  [BTN('🏹 Top 10 Tentativas', '/toptentativas'), BTN('🙌 Top 10 Reb+Ast', '/topra')],
  [BTN('🧠 Modelo BH', '/modelo'), BTN('📒 Testes', '/testes'), BTN('📬 Envio diário', '/receber')], [BTN('🎯 Odd mínima', '/odd'), BTN('🎟️ Múltipla', '/multipla 3')],
  [BTN('💼 Banca e ROI', '/banca'), BTN('🧪 Estratégias', '/estrategias'), BTN('🖼️ Cards do dia', '/cards')],
  [BTN('🎯 Pauta do Tipster', '/pauta'), BTN('⏱️ Método Minutos', '/minutos'), BTN('🟣 Finta', '/finta')], [BTN('🪜 Escadas', '/escadas'), BTN('📄 PDF do dia', '/pdf'), BTN('🩺 Saúde', '/status')], [BTN('📢 Canais', '/canais'), BTN('🧾 Placar da verdade', '/placar'), BTN('⚖️ Veredito', '/veredito')], [{ text: '📈 Placar no app', url: APP_URL + '#placar' }],
  [{ text: '📱 Abrir o app completo', url: APP_URL }],
] };

// teclado fixo e menus por assunto
const RKB = { keyboard: [[{ text: '🔥 Hoje' }, { text: '🧠 Modelo BH' }], [{ text: '💼 Banca' }, { text: '☰ Mais' }]], resize_keyboard: true, is_persistent: true };
const KBMAP: Record<string, string> = { '🔥 Hoje': '/hoje', '🧠 Modelo BH': '/modelobh', '💼 Banca': '/banca', '☰ Mais': '/menu' };
const HUB = { inline_keyboard: [[BTN('🔥 Hoje', '/hoje'), BTN('🧠 Modelo BH', '/modelobh')], [BTN('💼 Banca e ROI', '/banca'), BTN('☀️ Resultado de ontem', '/ontem')], [BTN('☰ Todos os mercados', '/menu')], [{ text: '📱 Abrir o app completo', url: APP_URL }]] };
const HOJE = { inline_keyboard: [
  [BTN('🔥 Top do dia', '/top'), BTN('💰 Valor', '/valor'), BTN('🛡️ Seguras', '/seguras')],
  [BTN('🏹 Top 10 Tentativas', '/toptentativas'), BTN('🙌 Top 10 Reb+Ast', '/topra')],
  [BTN('🗓️ Jogos', '/jogos'), BTN('🚑 Desfalques', '/desfalques'), BTN('📋 Resumo', '/resumo')],
  [BTN('🖼️ Cards do dia', '/cards'), BTN('📄 PDF do dia', '/pdf'), BTN('🎟️ Múltipla', '/multipla 3')], [BTN('☰ Todos os mercados', '/menu')]] };
const MODELO_HUB = { inline_keyboard: [
  [BTN('🏹 Top 10 Tentativas', '/toptentativas'), BTN('🙌 Top 10 Reb+Ast', '/topra')],
  [BTN('🧠 Chance de uma linha', '/modelo'), BTN('📒 Meus testes', '/testes')],
  [BTN('☀️ Resultado de ontem', '/ontem'), BTN('📬 Envio diário', '/receber')], [BTN('🧪 Estratégias', '/estrategias'), BTN('💼 Banca e ROI', '/banca')], [BTN('🏠 Menu', '/menu')]] };

async function answer(text: string, chatId: number, page = 1): Promise<Out> {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = norm(rawCmd.replace(/^\//, '').replace(/@.*$/, ''));
  const arg = rest.join(' ');
  const raw = '/' + [cmd, ...rest].join(' ');
  if (cmd === 'start' || cmd === 'inicio' || cmd === 'menu') {
    const d = await data().catch(() => null);
    const a = d ? d.rows.filter(r => r.gr === 'A+' || r.gr === 'A').length : 0;
    const head = `<b>🏀 BLACK HOUSE · PROPS NBA</b>\n${d ? `<i>${dateBR(d.date)} · ${d.games.length} jogos · ${a} linhas nota A ou A+</i>\n` : ''}`;
    if (cmd === 'inicio') return { text: head + '\nO que você quer ver?', kb: HUB };
    return { text: head + `\nEscolha abaixo ou digite um comando (/ajuda).\n\n<i>Seu ID: <code>${chatId}</code></i>`, kb: MENU };
  }
  if (cmd === 'hoje') { const d = await data().catch(() => null); return { text: `<b>🔥 HOJE</b>\n${d ? `<i>${dateBR(d.date)} · ${d.games.length} jogos · atualizado ${hourBR(d.gen)}</i>\n` : ''}\nEscolha a lista:`, kb: HOJE }; }
  if (cmd === 'modelobh') return { text: `<b>🧠 MODELO BH</b>\nModelos treinados por mercado (forma, minutos, defesa × posição, ritmo, mando, descanso, confronto e desfalques).\n\nOs tops usam a linha de referência (mediana dos últimos 15). Na sua casa a linha pode ser outra: confira em "Chance de uma linha".`, kb: MODELO_HUB };
  if (cmd === 'ontem') return ontemCmd(chatId);
  if (cmd === 'ajuda' || cmd === 'help' || cmd === 'comandos') return { text: HELP, kb: MENU };
  if (cmd === 'testes') return testesCmd(chatId, rest);
  if (cmd === 'receber' || cmd === 'envio') return receberCmd(chatId, rest);
  if (cmd === 'odd' || cmd === 'oddminima') return receberCmd(chatId, ['odd', ...rest]);
  if (cmd === 'banca' || cmd === 'roi') return bancaCmd(chatId, rest);
  if (cmd === 'apagar') return apagarCmd(chatId, rest);
  if (cmd === 'estrategias' || cmd === 'estrategia') return estrategiasCmd(rest);
  if (cmd === 'veredito' || cmd === 'clv') return vereditoCmd(rest[0]);
  // Método Minutos (18/11): atalho para o placar e as entradas do dia da estratégia 'minutos'
  if (cmd === 'minutos' || cmd === 'metodominutos') return estrategiasCmd(['minutos']);
  if (cmd === 'finta') {
    // Finta (19/11): a casa só tem "mais de" (linha principal + escada). Lista os overs com valor pela nossa chance.
    const d = await data(), om = await userMin(chatId);
    const so = (rest[0] ?? '').toLowerCase() === 'principal', all = (d.fin ?? []).filter(x => (!so || !x.alt) && (!om || x.fo >= om));
    const kb = { inline_keyboard: [[BTN(so ? '🪜 Com a escada' : '🎯 Só linha principal', so ? '/finta' : '/finta principal'), BTN('🔄 Atualizar', so ? '/finta principal' : '/finta')], HOME] };
    if (!d.fin) return { text: header(d, '🟣 FINTA') + '\nA leitura da Finta ainda não rodou hoje. Ela entra junto com a coleta (a cada ~30 min).', kb };
    if (!all.length) return { text: header(d, '🟣 FINTA · OVERS COM VALOR') + '\nNenhum over da Finta com valor agora' + (om ? ` (odd ${n2(om)}+)` : '') + '.', kb };
    const ln = all.slice(0, 15).map((x, i) => `${i + 1}. <b>${esc(x.n)}</b> <i>(${x.t} x ${x.o} · ${x.h})</i>\n    ⬆️ mais de ${n1(x.l)} ${MK[x.m] ?? x.m} <code>@${n2(x.fo)}</code>${x.alt ? ' <i>(escada)</i>' : ''}\n    chance <b>${pc(x.p)}</b>${need(x.fo)} · EV <b>+${(x.fe * 100).toFixed(1).replace('.', ',')}%</b>${x.h10 ? ` · L10 ${x.h10[0]}/${x.h10[1]}` : ''}${x.l9 != null ? `\n    <i>99play: ${n1(x.l9)}${x.o9 ? ` @${n2(x.o9)}` : ''}</i>` : ''}${x.st === 'questionable' ? '\n    🟡 <i>em dúvida</i>' : ''}`).join('\n');
    return { text: header(d, '🟣 FINTA · OVERS COM VALOR', (d.fg ? ` · Finta ${hourBR(d.fg)}` : '') + (om ? ` · odd ${n2(om)}+` : '')) + `\n<blockquote>${ln}</blockquote>\n<i>A Finta só oferece "mais de". Valor = nossa chance × odd da Finta. A escada (linhas alternativas) é onde o modelo mais erra: confira antes.</i>`, kb };
  }
  if (cmd === 'gabarito') return gabaritoCmd();
  if (cmd === 'status' || cmd === 'saude') return statusCmd();
  // link de instalação/atualização do leitor da 99play (19/11): só o administrador; o link leva o token do leitor
  if (cmd === 'leitor') {
    if (!(await isAdmin(chatId))) return { text: 'Comando só do administrador.', kb: { inline_keyboard: [HOME] } };
    const tok = (await sb('bot_config?key=eq.C99_TOKEN&select=value').catch(() => null))?.[0]?.value;
    if (!tok) return { text: 'Token do leitor não encontrado.', kb: { inline_keyboard: [HOME] } };
    const base = 'https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest/', link = `${base}leitor99.user.js?token=${encodeURIComponent(tok)}`, fin = `${base}finta.user.js?token=${encodeURIComponent(tok)}`;
    return { text: `<b>🔵 SCRIPTS DO NAVEGADOR</b>\nAbra os links no Chrome do PC (onde está o Tampermonkey) e toque em <b>Instalar</b>/<b>Atualizar</b>. Depois disso eles se atualizam sozinhos.\n\n<b>1. Leitor da 99play</b> (linhas, escada de marcos, Criar Aposta)\n${esc(link)}\n\n<b>2. Finta</b> (odd do Criador de Aposta)\n${esc(fin)}\n\n<i>Não compartilhe: os links têm a chave do leitor.</i>`, kb: { inline_keyboard: [[{ text: '📥 Leitor 99play', url: link }, { text: '📥 Finta', url: fin }], HOME] } };
  }
  if (cmd === 'placar' || cmd === 'verdade') return placarCmd(rest[0]);
  if (cmd === 'canal' || cmd === 'canais') return canaisCmd(chatId, arg);
  if (cmd === 'escadas' || cmd === 'escada') return escadasCmd(arg);
  if (cmd === 'cn') return cnCmd(chatId, rest);
  if (cmd === 'cf') return cfCmd(chatId, rest);
  if (cmd === 'cb') return cbCmd(chatId, rest);
  if (cmd === 'app') return { text: `📱 <b>App completo</b>\n${APP_URL}`, kb: { inline_keyboard: [[{ text: 'Abrir o app', url: APP_URL }], HOME] } };
  const d = await data();
  // odd mínima do usuário: as listas daqui para baixo usam este inRange/RANGE_TXT (mesmo nome, por chat)
  const om = await userMin(chatId), inRange = (r: Row) => inRangeBase(r) && okOdd(oddOf(r), om), RANGE_TXT = rangeTxt(om);
  if (cmd === 'modelo') return modeloCmd(d, rest, chatId);
  if (cmd === 'toptentativas' || cmd === 'topra') { const k = cmd === 'topra' ? 'ra' : 'tent'; const T = MT[k]; return list(d, tops(d, 10, om)[k], `${T.ic} TOP 10 MODELO BH · ${T.title}`, 10, raw, page, true, 'O Modelo BH ainda não rodou para os jogos de hoje.', (d.rows.some(r => r.c9) ? ' · linhas da 99play' : ' · linha de referência') + (om ? ` · odd ${n2(om)}+` : '')); }
  if (cmd === 'top') { const n = clampN(rest[0]); return list(d, d.rows.filter(inRange), `🔥 TOP ${n} DO DIA`, n, raw, page, true, '', RANGE_TXT); }
  if (cmd === 'valor') return list(d, d.rows.filter(r => r.d && !r.k && r.e != null && r.e >= .03 && r.e <= .15 && inRange(r)).sort((a, b) => (b.e! - a.e!)), '💰 VALOR COM ODD DE CASA', clampN(rest[0]), raw, page, true, '⏳ As odds das casas entram perto de cada jogo (até 2h30 antes). Tente mais perto do primeiro jogo ou veja o Top do dia.', RANGE_TXT);
  if (cmd === 'seguras') return list(d, d.rows.filter(r => r.p >= .65 && r.p <= .92 && r.st === 'ok' && inRange(r) && (r.gr === 'A+' || r.gr === 'A') && r.m !== 'PF').sort((a, b) => (+!!b.d - +!!a.d) || b.p - a.p), '🛡️ MAIS SEGURAS (CHANCE ≥ 65%)', clampN(rest[0]), raw, page, true, '', RANGE_TXT);
  if (cmd === 'tentativas') {
    // primeiro escolhe o mercado (com a quantidade de entradas de hoje); "Todos" mantém a lista antiga
    const g = GROUPS.tentativas, code = (rest[0] ?? '').toUpperCase();
    const TN: Record<string, string> = { '2PA': '🎯 Tentativas de 2', '2PM': '✅ De 2 convertidos', '3PA': '🏹 Tentativas de 3', FTA: '🆓 Lances livres tentados', FGM: '🏀 Arremessos convertidos' };
    const back = (o: Out) => { const kb = (o.kb as any)?.inline_keyboard; if (kb) kb.splice(Math.max(0, kb.length - 1), 0, [BTN('⬅️ Outros mercados de tentativas', '/tentativas')]); return o; };
    if (g.mk.includes(code)) return back(list(d, d.rows.filter(r => r.m === code && inRange(r)), TN[code].toUpperCase(), clampN(rest[1]), raw, page, true, '', RANGE_TXT));
    if (code === 'TODOS' || /^\d+$/.test(code)) return list(d, d.rows.filter(r => g.mk.includes(r.m) && inRange(r)), '🏀 ' + g.title.toUpperCase(), clampN(code === 'TODOS' ? rest[1] : rest[0]), raw, page, false, '', RANGE_TXT);
    const n = (mk: string) => d.rows.filter(r => r.m === mk && inRange(r)).length;
    const btns = ['2PA', '2PM', '3PA', 'FTA', 'FGM'].map(mk => BTN(`${TN[mk]} (${n(mk)})`, `/tentativas ${mk.toLowerCase()}`));
    return { text: header(d, '🏹 TENTATIVAS E CONVERTIDOS') + '\nEscolha o mercado:', kb: { inline_keyboard: [...chunk(btns, 2), [BTN(`📋 Todos os mercados (${g.mk.reduce((s, mk) => s + n(mk), 0)})`, '/tentativas todos')], HOME] } };
  }
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
  if (cmd === 'combo' || cmd === 'combos') return comboCmd(chatId, rest);
  if (cmd === 'correl' || cmd === 'correlacao' || cmd === 'correlação') return correlCmd(rest);
  if (cmd === 'rodar') return rodarCmd(chatId);
  if (cmd === 'ler') return rodarCmd(chatId, true);
  if (cmd === 'jogador') {
    const q = norm(arg); if (q.length < 3) return { text: 'Digite o nome assim: <code>/jogador brunson</code>', kb: { inline_keyboard: [HOME] } };
    const rows = d.rows.filter(r => norm(r.n).includes(q)); if (!rows.length) return { text: `Nenhuma linha boa hoje para <b>${esc(arg)}</b>.`, kb: { inline_keyboard: [HOME] } };
    const o = list(d, rows, '👤 ' + rows[0].n.toUpperCase(), 12, raw, page, false);
    o.kb.inline_keyboard.unshift([BTN('🟣 Combo Finta 15+', ('/combo ' + rows[0].id).slice(0, 60)), BTN('🔗 Correlação', ('/correl ' + rows[0].id).slice(0, 60))]);
    return o;
  }
  if (cmd === 'multipla') return multipla(d, rest[0], om);
  if (cmd === 'jogos') {
    const w = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);
    const rowsTxt = d.games.map(g => `${g.t}  ${w(`${g.a} @ ${g.h}`, 11)} ${w(g.sp != null ? `${g.sp < 0 ? g.h : g.a} -${n1(Math.abs(g.sp))}` : '', 10)} ${w(g.to ? n1(g.to) : '', 6)}${g.lv != null ? String(Math.round(g.lv * 100)).padStart(3) + '%' : ''}`).join('\n');
    return { text: header(d, '🗓️ JOGOS DE HOJE') + `\n<pre>HORA   JOGO        FAVORITO   TOTAL LAVADA\n${rowsTxt}</pre>\n<i>Lavada = chance de o jogo terminar com 20+ de diferença (titular joga menos). 25%+ pede cuidado com over de titular.</i>\nToque num jogo para ver as linhas:`, kb: { inline_keyboard: [...chunk(d.games.map(g => BTN(`${g.a} @ ${g.h}`, `/jogo ${g.h}`)), 2), home('/jogos')] } };
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
  const n = Math.max(1, Math.min(10, parseInt(arg ?? '', 10) || 5)), om = await userMin(chatId);
  const seen = new Set<string>(), pick: Row[] = [];
  for (const r of d.rows) { if (!r.cd || !inRange(r) || !okOdd(oddOf(r), om) || seen.has(r.id)) continue; seen.add(r.id); pick.push(r); if (pick.length >= n) break; }
  if (!pick.length) { await TG('sendMessage', { chat_id: chatId, text: 'Os cards do dia ainda estão sendo gerados. Tente em alguns minutos ou veja o /top.', reply_markup: MENU }); return; }
  await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `<b>🖼️ AS ${pick.length} MELHORES DO DIA</b>\n<i>${dateBR(d.date)} · pela Nota BH${rangeTxt(om)} · atualizado ${hourBR(d.gen)}</i>` });
  const media = pick.map(r => ({ type: 'photo', media: cardUrl(d, r), caption: caption(r), parse_mode: 'HTML' }));
  const res = pick.length === 1 ? await TG('sendPhoto', { chat_id: chatId, photo: media[0].media, caption: media[0].caption, parse_mode: 'HTML' }) : await TG('sendMediaGroup', { chat_id: chatId, media });
  if (!res.ok) { await TG('sendMessage', { chat_id: chatId, text: pick.map((r, i) => card(r, i + 1)).join('\n') + '\n' + FOOT, parse_mode: 'HTML', disable_web_page_preview: true }); }
  await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: '<i>🔞 18+ · Confira lesões, quinteto e a odd da sua casa. O Ministério da Fazenda adverte: apostas podem causar dependência.</i>', reply_markup: { inline_keyboard: [[BTN('🔥 Top do dia em texto', '/top'), BTN('🎟️ Múltipla', '/multipla 3')], [BTN('🏠 Menu', '/menu')]] } });
}

// ---------- 🎯 Pauta do Tipster (pedido de 16/11): um botão, antes dos jogos, com tudo pronto ----------
// Simples escolhidas por SEQUÊNCIA e MATCHUP (não por EV): L10/L5/temporada, defesa do adversário na estatística e
// confronto direto, com o modelo concordando (chance 55%+). Linhas da 99play, uma por jogador, no máximo 3 por mercado.
// Múltiplas nas faixas 5–10, 10–15 e 15–25 com essas mesmas entradas (uma por jogo, a combinação mais provável) e as
// 3 melhores escadas do dia.
const rate = (h?: [number, number] | null, min = 1) => h && h[1] >= min ? h[0] / h[1] : null;
const matchup = (r: Row) => r.dv?.r && r.dv.of ? (r.s === 'o' ? (r.dv.r - 1) : (r.dv.of - r.dv.r)) / Math.max(1, r.dv.of - 1) : .5;
export function pautaPick(d: Data, now = Date.now(), om = 0) {
  const utc = Object.fromEntries(d.games.map(g => [g.id, g.utc ? Date.parse(g.utc) : NaN]));
  const cand = d.rows.filter(r => {
    return r.c9 && r.d && r.d >= Math.max(1.4, om) && r.d <= 3.2 && r.p >= .55 && r.st === 'ok' && (r.mn ?? 0) >= 24
      && (rate(r.l10, 8) ?? 0) >= .7 && !(utc[r.g] <= now + 10 * 6e4); // 20/11: sem corte pela idade da leitura (o card mostra a hora)
  }).map(r => {
    const h10 = rate(r.l10, 8)!, h5 = rate(r.l5, 4) ?? h10, hs = rate(r.ss, 8) ?? h10, hh = rate(r.hh, 2);
    const sq = .5 * h10 + .25 * h5 + .25 * hs + .01 * Math.min(r.sk ?? 0, 5);
    const sc = .55 * sq + .3 * matchup(r) + .15 * (hh ?? .5);
    return { r, sc, pe: (r.p + h10) / 2 };
  }).sort((a, b) => b.sc - a.sc);
  const seen = new Set<string>(), perMk: Record<string, number> = {}, singles: typeof cand = [];
  for (const c of cand) {
    if (seen.has(c.r.id) || (perMk[c.r.m] ?? 0) >= 3) continue;
    seen.add(c.r.id); perMk[c.r.m] = (perMk[c.r.m] ?? 0) + 1; singles.push(c);
    if (singles.length >= 10) break;
  }
  // múltiplas: pernas = as 20 melhores por sequência/matchup (uma por jogador); maior chance (modelo + L10) na faixa
  const pool: typeof cand = []; const sp = new Set<string>();
  for (const c of cand) { if (sp.has(c.r.id)) continue; sp.add(c.r.id); pool.push(c); if (pool.length >= 20) break; }
  const used = new Set<string>(), multis: { band: string; odd: number; prob: number; legs: typeof cand }[] = [];
  for (const [band, lo, hi] of [['5–10', 5, 10], ['10–15', 10, 15], ['15–25', 15, 25]] as [string, number, number][]) {
    let best: { legs: typeof cand; odd: number; prob: number } | null = null;
    const run = (P: typeof cand) => {
      const rec = (i: number, legs: typeof cand, odd: number, prob: number, games: Set<string>) => {
        if (odd > hi) return;
        if (odd >= lo && legs.length >= 2 && (!best || prob > best.prob)) best = { legs: [...legs], odd, prob };
        if (legs.length >= 6) return;
        for (let j = i; j < P.length; j++) { const c = P[j]; if (games.has(c.r.g)) continue; games.add(c.r.g); legs.push(c); rec(j + 1, legs, odd * c.r.d!, prob * c.pe, games); legs.pop(); games.delete(c.r.g); }
      };
      rec(0, [], 1, 1, new Set());
    };
    run(pool.filter(c => !used.has(c.r.id))); if (!best) run(pool);
    if (best) { (best as any).legs.forEach((c: any) => used.add(c.r.id)); multis.push({ band, ...(best as any) }); }
  }
  return { singles, multis, n: cand.length };
}
const pickLine = (r: Row) => `${r.s === 'o' ? '⬆️ Mais' : '⬇️ Menos'} de <b>${n1(r.l)}</b> ${MK[r.m] ?? r.m} @<b>${r.d ? n2(r.d) : '–'}</b>`;
const dvTxt = (r: Row) => r.dv?.r ? `🛡️ ${r.dv.r}ª/${r.dv.of}${(r.s === 'o' ? r.dv.r >= r.dv.of - 5 : r.dv.r <= 6) ? ' favorável' : (r.s === 'o' ? r.dv.r <= 6 : r.dv.r >= r.dv.of - 5) ? ' difícil' : ''}` : '';
async function sendPauta(chatId: number, demo = false) {
  const d = await data();
  // exemplo: monta como se fosse 2h antes do primeiro jogo do dia (para ver a pauta depois que os jogos começaram)
  const first = Math.min(...d.games.map(g => g.utc ? Date.parse(g.utc) : Infinity));
  const now = demo && isFinite(first) ? first - 2 * 36e5 : Date.now(), P = pautaPick(d, now, await userMin(chatId));
  const E = await fetch(APP_URL + 'data/escadas.json?t=' + Math.floor(now / 6e4)).then(r => r.ok ? r.json() : null).catch(() => null);
  const esc3 = (E?.date === d.date ? E.list : []).filter((x: any) => Date.parse(x.tip) > now + 10 * 6e4).slice(0, 3);
  const next = d.games.map(g => g.utc ? Date.parse(g.utc) : NaN).filter(t => t > now).sort((a, b) => a - b)[0];
  let head = `<b>🎯 PAUTA DO TIPSTER${demo ? ' · EXEMPLO' : ''}</b>${demo ? '\n<i>(montada como se fosse 2h antes do primeiro jogo de hoje)</i>' : ''}\n<i>${dateBR(d.date)} · ${next ? `próximo jogo às ${hourBR(new Date(next).toISOString())}` : 'sem jogo por começar'} · atualizado ${hourBR(d.gen)}</i>`;
  const kb = { inline_keyboard: [[BTN('🔄 Atualizar a pauta', '/pauta'), BTN('🪜 Escadas', '/escadas')], [BTN('▶️ Rodar agora', '/rodar'), BTN('🔵 Pedir leitura', '/ler')], HOME] };
  // 20/11: solta na hora o que já tem; diz de quando é a odd da 99play e, se o PC já leu algo mais novo que os números,
  // roda os números sozinho (com o token) para a próxima pauta
  const t9s = d.rows.map(r => Date.parse((r as any).t9 ?? '')).filter(Boolean), usada = t9s.length ? Math.max(...t9s) : NaN;
  const ult: any = demo ? null : await fetch('https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest?ultima=1').then(r => r.ok ? r.json() : null).catch(() => null);
  const pcAt = Date.parse(ult?.taken_at ?? ''), hb = (t: number) => hourBR(new Date(t).toISOString());
  let aviso = usada ? `\n🔵 Odds da 99play lidas às <b>${hb(usada)}</b>${Date.now() - usada >= 2 * 36e5 ? ' <i>(confira a odd na casa antes de entrar)</i>' : ''}` : '';
  if (!demo && pcAt && (!usada || pcAt - usada > 5 * 6e4)) {
    const r = await ghRun(8);
    aviso += r === 'ok' || r === 'já rodando' ? `\n⏳ Seu PC leu às ${hb(pcAt)}: rodando os números com essa leitura. Em ~6 min toque em <b>Atualizar a pauta</b>.` : `\n⏳ Seu PC leu às ${hb(pcAt)}; essa leitura entra na próxima rodada (${hb(nextRun())}).`;
  }
  head += aviso;
  const send = (text: string, k?: any) => TG('sendMessage', { chat_id: chatId, text: fitHTML(text), parse_mode: 'HTML', disable_web_page_preview: true, ...(k ? { reply_markup: k } : {}) });
  if (!P.singles.length && !esc3.length) {
    const why = !(next > now) ? 'Os jogos de hoje já começaram.'
      : !usada ? 'A 99play ainda não tem linhas lidas para os jogos de hoje: abra a aba da 99play no PC ou toque em 🔵 Pedir leitura.'
      : 'Nenhuma linha passou nos filtros da pauta (odd 1,40–3,20, chance 55%+, 7/10 nos últimos 10, titular).';
    await send(head + '\n\nSem entradas para a pauta agora. ' + why, kb); return;
  }
  // 1) simples
  await send(head + `\n<i>Escolhidas por sequência e matchup (não por EV), com o Modelo BH concordando. Linhas e odds da 99play. "Precisa" = acerto mínimo para não perder com aquela odd.</i>\n\n<b>🔥 ${P.singles.length} SIMPLES</b>\n\n` +
    P.singles.map(({ r }, i) => `<b>${i + 1}. ${esc(r.n)}</b> <i>${r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`} · ${r.h}</i>
${pickLine(r)} · <b>${pc(r.p)}</b>${need(r.d)}
📊 L10 ${hitTxt(r.l10)} · L5 ${hitTxt(r.l5)} · Temp. ${hitTxt(r.ss)} · vs ${r.o} ${hitTxt(r.hh)}${dvTxt(r) ? `\n${dvTxt(r)} · ⏱️ ${r.mn ?? '–'} min` : ` · ⏱️ ${r.mn ?? '–'} min`}${seq(r) ? `\n${sqLine(r.sq, r.l, r.s)}\n🔢 <code>${seq(r)}</code>` : ''}`).join('\n\n'));
  // 2) múltiplas: um bloco por múltipla, pernas numeradas, odd total em destaque
  const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
  if (P.multis.length) await send(`<b>🧩 MÚLTIPLAS DA PAUTA</b>\n<i>Montadas com as entradas de melhor sequência e matchup · uma por jogo</i>\n\n` +
    P.multis.map((m, k) => `<b>🎟️ MÚLTIPLA ${k + 1} · ODD ${m.band}</b>
<blockquote>${m.legs.map(({ r }, i) => `${NUM[i] ?? `${i + 1}.`} <b>${esc(r.n)}</b> · ${r.t} · ${r.h}
${r.s === 'o' ? '⬆️ Mais' : '⬇️ Menos'} de <b>${n1(r.l)}</b> ${MK[r.m] ?? r.m} · @<b>${r.d ? n2(r.d) : '–'}</b> · L10 ${hitTxt(r.l10)}${r.sq?.length ? `\n🔢 <code>${seq(r)}</code>` : ''}`).join('\n\n')}</blockquote>
💰 <b>Odd total @${n2(m.odd)}</b> · ${m.legs.length} pernas · chance estimada <b>${pc(m.prob)}</b>${need(m.odd)}`).join('\n\n━━━━━━━━━━━━━━\n\n'));
  // 3) escadas
  await send((esc3.length ? `<b>🪜 ESCADAS DA PAUTA</b>\n<i>Pontos + rebotes + assistências do mesmo jogador (Criar Aposta)</i>\n\n` + esc3.map((x: any, i: number) => escItem(x, i + 1)).join('\n\n') +
    `\n\n<i>Odd justa = 1 ÷ chance das 3: se o Criar Aposta pagar acima, tem valor.</i>` : '<b>🪜 ESCADAS</b>\nSem escada para os jogos que faltam.') + FOOT, kb);
}

// ---------- 🪜 escadas (pontos + rebotes + assistências "mais de" do mesmo jogador, como no Criar Aposta) ----------
// public/data/escadas.json vem do pipeline (scripts/escadas.mjs): chance das três juntas com a correlação do jogador,
// misturada com a forma recente; odd justa = 1/chance; duplas e triplas de jogos diferentes.
const pc0 = (x: number) => Math.round(x * 100) + '%';
const ESC_IC: Record<string, string> = { PTS: '🏀', REB: '🙌', AST: '🎯' }, ESC_AB: Record<string, string> = { PTS: 'pts', REB: 'reb', AST: 'ast' };
const escVs = (x: any) => x.isHome ? `${x.team} x ${x.opp}` : `${x.team} @ ${x.opp}`;
const escGap = (l: any) => { const d = Math.round((l.proj - l.line) * 10) / 10; return `${d >= 0 ? '+' : ''}${n1(d)}`; };
// defesa do adversário na estatística: 30ª = a que mais cede (bom para o "mais de")
const escDv = (l: any) => l.dv ? ` · 🛡️ ${l.dv[0]}ª/${l.dv[1]}${l.dv[0] >= l.dv[1] - 5 ? ' favorável' : l.dv[0] <= 6 ? ' difícil' : ''}` : '';
function escItem(x: any, i: number) {
  return `<b>${i}. ${esc(x.name)}</b> <i>${escVs(x)} · ${hourBR(x.tip)}</i>
🪜 ${x.legs.map((l: any) => `<b>+${n1(+l.line)}</b> ${ESC_AB[l.mk]}`).join(' · ')} · <b>${pc0(x.pj)}</b> as 3
🧠 Projeção: ${x.legs.map((l: any) => `<b>${n1(l.proj)}</b> ${ESC_AB[l.mk]} <i>(${escGap(l)})</i>`).join(' · ')}
📊 Juntas L10 <b>${x.j10[0]}/${x.j10[1]}</b> · cada: ${x.legs.map((l: any) => hitTxt(l.l10)).join(' · ')} · ⏱️ ${x.min} min
💰 Odd justa <b>${n2(x.fair)}</b>`;
}
async function escadasCmd(arg: string): Promise<Out> {
  const E = await fetch(APP_URL + 'data/escadas.json?t=' + Math.floor(Date.now() / 6e4)).then(r => r.ok ? r.json() : null).catch(() => null);
  const nav = [BTN('🪜 Escadas', '/escadas'), BTN('👥 Duplas', '/escadas d'), BTN('👥 Triplas', '/escadas t')];
  if (!E?.list?.length || E.date !== etDate()) return { text: '<b>🪜 ESCADAS DO DIA</b>\n\nAinda sem escadas hoje: elas saem quando a 99play tem as linhas de pontos, rebotes e assistências e o leitor está lendo.', kb: { inline_keyboard: [HOME] } };
  const by = Object.fromEntries(E.list.map((x: any) => [x.pid, x]));
  const sub0 = `<i>${dateBR(E.date)} · ${E.list.length} jogadores com as 3 linhas na 99play · atualizado ${hourBR(E.gen)}</i>`;
  const [sub, a1] = arg.split(/\s+/);
  if (sub === 'd' || sub === 't') {
    const C = sub === 'd' ? E.duplas : E.triplas;
    const txt = (C ?? []).map((c: any, i: number) => `<b>${sub === 'd' ? 'DUPLA' : 'TRIPLA'} ${i + 1}</b> · as escadas juntas <b>${pc0(c.p)}</b> · odd justa <b>${n2(c.fair)}</b>\n` +
      c.pids.filter((id: string) => by[id]).map((id: string) => { const x = by[id]; return `▫️ <b>${esc(x.name)}</b> <i>${escVs(x)} · ${hourBR(x.tip)}</i>\n   ${x.legs.map((l: any) => `+${n1(+l.line)} ${ESC_AB[l.mk]}`).join(' · ')} · ${pc0(x.pj)}`; }).join('\n')).join('\n\n');
    return { text: `<b>🪜 ${sub === 'd' ? 'DUPLAS' : 'TRIPLAS'} DE ESCADAS · MODELO BH</b>\n${sub0}\n\n${txt || 'Sem combinação hoje.'}\n\n<i>Cada escada vai num Criar Aposta (jogos diferentes) e as escadas juntas formam a múltipla. Se a casa pagar acima da odd justa, tem valor.</i>` + FOOT,
      kb: { inline_keyboard: [nav, HOME] } };
  }
  if (sub === 'v' && by[a1]) { // detalhe: cada linha com projeção, defesa, sequência
    const x = by[a1];
    const legTxt = x.legs.map((l: any) => `${ESC_IC[l.mk]} <b>${MK[l.mk][0].toUpperCase() + MK[l.mk].slice(1)} +${n1(+l.line)}</b> @${n2(l.odd)} · <b>${pc0(l.p)}</b>
🧠 Projeção <b>${n1(l.proj)}</b> <i>(${escGap(l)} da linha)</i>${escDv(l)}
${sqLine(l.sq, l.line, 'o')}
🔢 <code>${(l.sq ?? []).join('-')}</code>`).join('\n\n');
    return { text: `<b>🪜 ${esc(x.name)}</b> <i>${escVs(x)} · ${hourBR(x.tip)} · ⏱️ ${x.min} min</i>
<blockquote>✅ <b>As 3 juntas: ${pc0(x.pj)}</b> · odd justa <b>${n2(x.fair)}</b>
📊 Bateram as 3 juntas em <b>${x.j10[0]}/${x.j10[1]}</b> dos últimos 10
💡 Separadas pagariam ${n2(x.sep)}: no Criar Aposta a casa paga menos, porque as linhas andam juntas</blockquote>

${legTxt}

<i>Pagando acima de ${n2(x.fair)} no Criar Aposta, tem valor. 🔢 = últimos 10 (mais recente primeiro).</i>` + FOOT,
      kb: { inline_keyboard: [nav, HOME] } };
  }
  const top = E.list.slice(0, 8);
  return { text: `<b>🪜 ESCADAS DO DIA · MODELO BH</b>\n${sub0}\n<i>Pontos + rebotes + assistências "mais de" do mesmo jogador (Criar Aposta). % = chance das 3 baterem juntas.</i>\n\n` +
    top.map((x: any, i: number) => escItem(x, i + 1)).join('\n\n') + `\n\n<i>🧠 Projeção do Modelo BH (entre parênteses, a folga sobre a linha). Toque no número para ver sequências e defesa. Odd justa = 1 ÷ chance: se o Criar Aposta pagar acima, tem valor.</i>` + FOOT,
    kb: { inline_keyboard: [...chunk(top.map((x: any, i: number) => BTN(`${i + 1}. ${x.name.split(' ').slice(-1)[0]}`, `/escadas v ${x.pid}`)), 4), nav, HOME] } };
}

// ---------- hub de canais do Telegram (postagem automática na função canal) ----------
// Cada canal tem dono (quem colocou o bot como administrador) e configuração própria na tabela canais, editada pelo
// /canais no privado do bot. Só o dono do canal (ou o administrador do bot) mexe nele.
const FN = (name: string) => `${Deno.env.get('SUPABASE_URL') ?? 'https://brtexfomhlvltdsuezsi.supabase.co'}/functions/v1/${name}`;
const getCfgKey = async (k: string) => (await sb(`bot_config?key=eq.${k}&select=value`).catch(() => null))?.[0]?.value as string | undefined;
const putCfgKey = (k: string, v: string) => sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: k, value: v, updated_at: new Date().toISOString() }) });
const delCfgKey = (k: string) => sb(`bot_config?key=eq.${k}`, { method: 'DELETE' }).catch(() => null);
type Canal = { id: number; chat_id: number; title: string; owner: number; ativo: boolean; cfg: any };
const CDEF = { max: 20, oddMin: 1.4, oddMax: 3.5, evMin: .03, mercados: null as string[] | null, lado: 'ambos', multis: null as any[] | null, casa: '99', inicio: 10,
  on: true, botoes: true, resultado: true, rodape: '🔞 18+ · Aposte com responsabilidade', ref99: '', ref365: '' };
const canalRows = async (q = ''): Promise<Canal[]> => ((await sb(`canais?ativo=eq.true${q}&select=*&order=id`).catch(() => [])) ?? []).map((c: any) => ({ ...c, cfg: { ...CDEF, ...(c.cfg ?? {}) } }));
const canalByChat = async (chat: number | string) => (await canalRows(`&chat_id=eq.${chat}`))[0];
const canalById = async (id: number | string) => (await canalRows(`&id=eq.${encodeURIComponent(String(id))}`))[0];
const isAdmin = async (chatId: number | string) => String(chatId) === (await cfg()).allowed[0];
const canEdit = async (k: Canal | undefined, user: number | string) => !!k && (String(k.owner) === String(user) || await isAdmin(user));
async function saveCfg(k: Canal, patch: Record<string, unknown>) {
  const raw = ((await sb(`canais?id=eq.${k.id}&select=cfg`)) ?? [])[0]?.cfg ?? {};
  await sb(`canais?id=eq.${k.id}`, { method: 'PATCH', body: JSON.stringify({ cfg: { ...raw, ...patch } }) });
}
// o bot virou admin de um canal (my_chat_member) ou alguém postou num canal onde ele está (channel_post)
const GRP = (t?: string) => t === 'group' || t === 'supergroup';
// permissões do bot no canal/grupo: postar, editar e apagar (apagar = limpar o link do bilhete e a pergunta)
let BOT_ID = 0;
async function botRights(chat: number | string) {
  if (!BOT_ID) BOT_ID = (await TG('getMe', {})).result?.id ?? 0;
  const r = await TG('getChatMember', { chat_id: chat, user_id: BOT_ID }), m = r.result ?? {}, adm = m.status === 'administrator';
  const ch = (await TG('getChat', { chat_id: chat })).result?.type === 'channel';
  const items = [['Postar mensagens', ch ? adm && m.can_post_messages : m.status === 'administrator' || m.status === 'member'],
    ['Editar mensagens', ch ? adm && m.can_edit_messages : true], ['Apagar mensagens', adm && m.can_delete_messages]] as [string, boolean][];
  return { ok: r.ok && items.every(x => x[1]), txt: items.map(([n, v]) => `${v ? '✅' : '❌'} ${n}`).join(' · '), erro: r.ok ? '' : r.description };
}
async function canalSeen(cm: any, cp: any) {
  const c = await cfg(), ch = (cm ?? cp).chat, adm = c.allowed[0];
  const known = ((await sb(`canais?chat_id=eq.${ch.id}&select=*`).catch(() => [])) ?? [])[0];
  const st = cm?.new_chat_member?.status;
  if (known) {
    if (cm && (st === 'left' || st === 'kicked')) { // tiraram o bot do canal: para de postar
      await sb(`canais?id=eq.${known.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: false }) });
      await TG('sendMessage', { chat_id: known.owner ?? adm, parse_mode: 'HTML', text: `⏸️ O bot saiu do canal <b>${esc(known.title ?? '')}</b>; as postagens automáticas pararam.` });
    } else if (cm && (st === 'administrator' || (GRP(ch.type) && st === 'member')) && !known.ativo) {
      await sb(`canais?id=eq.${known.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: true, title: ch.title ?? known.title }) });
      await TG('sendMessage', { chat_id: known.owner ?? adm, parse_mode: 'HTML', text: `✅ Canal <b>${esc(ch.title ?? '')}</b> reconectado. Configuração em /canais.` });
    }
    return;
  }
  if (cm && !(st === 'administrator' || (GRP(ch.type) && st === 'member'))) return;
  if (cm && c.allowed.includes(String(cm.from?.id))) await canalAdd(ch.id, ch.title, cm.from.id);
  else if (adm) await TG('sendMessage', { chat_id: adm, parse_mode: 'HTML', text: `📢 Vi o canal <b>${esc(ch.title ?? String(ch.id))}</b>. Conectar ao hub de postagem automática (você como dono)?`,
    reply_markup: { inline_keyboard: [[BTN('✅ Conectar este canal', `/canais add ${ch.id}`)]] } });
}
async function canalAdd(chatId: number | string, title: string | undefined, owner: number | string) {
  await sb('canais?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chat_id: +chatId, title: title ?? null, owner: +owner, ativo: true }) });
  const k = await canalByChat(chatId), own = await isAdmin(owner), perm = await botRights(chatId);
  await TG('sendMessage', { chat_id: owner, parse_mode: 'HTML', text: `✅ <b>Canal conectado:</b> ${esc(title ?? String(chatId))}\nAs postagens automáticas começam na próxima atualização (até 1h), a partir das 10h, com a configuração padrão.\n<blockquote>${perm.txt}</blockquote>${perm.ok ? '' : '\n⚠️ <b>Falta permissão</b>: no canal, Administradores → bot → ligue o que está com ❌.'}${own ? '' : '\n\n⚠️ <b>Cadastre os seus links de afiliado</b>: sem eles, os bilhetes prontos saem sem ref.'}`,
    reply_markup: { inline_keyboard: [[BTN('⚙️ Configurar o canal', `/cn ${k?.id}`)], ...((await canalRows(`&owner=eq.${owner}`)).length > 1 ? [[BTN('🪞 É o canal oficial de outro canal?', `/cn ${k?.id} espde`)]] : []), ...(own ? [] : [[BTN('🔗 Meus links de afiliado', `/cn ${k?.id} refs`)]]), ...(perm.ok ? [] : [[BTN('🔄 Conferir permissões', `/cn ${k?.id} perm`)]])] } });
}
// ---------- controles dentro do canal ----------
const SHARE_RE = /(?:99play|br365)\.[a-z.]+\/[^\s]*?[?&]shareCode=([A-Za-z0-9]+)/gi;
const postLabel = (p: any) => (p.kind === 'multipla' ? `Múltipla @${n2(+p.odd)} · ${(p.legs ?? []).length} pernas`
  : `${p.legs?.[0]?.name ?? '?'} · ${MKS[p.legs?.[0]?.mk] ?? p.legs?.[0]?.mk} ${p.legs?.[0]?.side === 'o' ? 'mais' : 'menos'} ${n1(+p.legs?.[0]?.line)}`).slice(0, 60);
const delMsgs = (chat: number, ids: number[]) => Promise.all(ids.filter(Boolean).map(id => TG('deleteMessage', { chat_id: chat, message_id: id })));
// o dono postou no canal um link de bilhete (respondendo um post, ou compartilhando direto da casa)
async function canalPost(cp: any, k: Canal) {
  const text = cp.text ?? cp.caption ?? '';
  const codes = [...new Set([...text.matchAll(SHARE_RE)].map(m => m[1]))];
  if (!codes.length) return;
  const ch = cp.chat.id, photo = cp.photo?.at?.(-1)?.file_id ?? '', code = codes[0];
  if (cp.reply_to_message) {
    const r = await canalFn('relink', `cid=${ch}&ch=${cp.reply_to_message.message_id}&code=${encodeURIComponent(code)}${photo ? '&photo=' + encodeURIComponent(photo) : ''}`);
    if (r.ok) { await delMsgs(ch, [cp.message_id]); return; }
    if (r.erro !== 'post não encontrado') { await TG('sendMessage', { chat_id: ch, disable_notification: true, reply_parameters: { message_id: cp.message_id }, text: `Não consegui atualizar o post: ${r.erro ?? 'erro'}` }); return; }
  }
  const abertos: any[] = await canalFn('abertos', `canal=${k.id}`).catch(() => []);
  if (!Array.isArray(abertos) || !abertos.length) return;
  const q = await TG('sendMessage', { chat_id: ch, disable_notification: true, reply_parameters: { message_id: cp.message_id }, text: '🎟️ De qual post é este bilhete?',
    reply_markup: { inline_keyboard: [...abertos.map(p => [BTN(postLabel(p), `/cb ${code} ${p.id}`)]), [BTN('✖️ Cancelar', `/cb ${code} x`)]] } });
  await putCfgKey('CANAL_PEND_' + code, JSON.stringify({ photo, del: [cp.message_id, q.result?.message_id] }));
}
// botões dentro do canal: trocar a casa do post (/cs) ou ligar o bilhete ao post (/cb); só o dono do canal
async function canalCb(cq: any) {
  const data: string = cq.data ?? '', ch = cq.message.chat.id, k = await canalByChat(ch);
  if (!(await canEdit(k, cq.from?.id))) { await TG('answerCallbackQuery', { callback_query_id: cq.id, text: 'Só o dono do canal pode usar estes botões.' }); return; }
  if (/^\/cs\s/.test(data)) {
    const r = await csCmd(data.trim().split(/\s+/).slice(1));
    await TG('answerCallbackQuery', { callback_query_id: cq.id, text: r ? r.text.replace(/<[^>]+>/g, '') : '✅ Casa do post trocada' });
    return;
  }
  const m = /^\/cb (\S+) (\S+)$/.exec(data); if (!m) { await TG('answerCallbackQuery', { callback_query_id: cq.id }); return; }
  const [, code, id] = m; let pend: any = {};
  try { pend = JSON.parse((await getCfgKey('CANAL_PEND_' + code)) ?? '{}'); } catch { pend = {}; }
  let ok = id === 'x', txt = 'Cancelado';
  if (id !== 'x') {
    const r = await canalFn('relink', `id=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}${pend.photo ? '&photo=' + encodeURIComponent(pend.photo) : ''}`);
    ok = !!r.ok; txt = r.ok ? `✅ Bilhete pronto na ${r.casa}${r.imagem ? ' (com o print)' : ''}${r.espelho ? ' · copiado no oficial' : ''}` : `Não consegui: ${r.erro ?? 'erro'}`;
  }
  await TG('answerCallbackQuery', { callback_query_id: cq.id, text: txt });
  if (ok) { await delMsgs(ch, [cq.message.message_id, ...(pend.del ?? [])]); await delCfgKey('CANAL_PEND_' + code); }
}
async function canalFn(action: string, qs: string): Promise<any> {
  const secret = (await cfg()).secret;
  return fetch(`${FN('canal')}?${action}=${encodeURIComponent(secret)}${qs ? '&' + qs : ''}`).then(r => r.json()).catch(e => ({ ok: false, erro: String(e) }));
}
// links rastreados para quem mandou o link: refs do canal dele (o administrador usa os refs do bot)
async function shareLinksText(codes: string[], chatId: number) {
  const c = await cfg(), mine = (await canalRows(`&owner=eq.${chatId}`))[0];
  const r99 = mine?.cfg.ref99 || (await isAdmin(chatId) ? c.affRef : ''), r365 = mine?.cfg.ref365 || (await isAdmin(chatId) ? c.affRef365 : '');
  const link = (dom: string, ref: string, code: string) => `${dom}/sports?${ref ? `ref=${encodeURIComponent(ref)}&amp;` : ''}shareCode=${code}`;
  return `🔗 <b>Links rastreados</b> <i>(toque para copiar)</i>\n` + codes.map(code =>
    `<b>99play</b> <i>(${r99 ? 'ref ' + esc(r99) : 'sem ref: cadastre em /canais'})</i>\n<code>${link(c.dom99, r99, code)}</code>\n<b>BR365</b> <i>(${r365 ? 'ref ' + esc(r365) : 'sem ref: cadastre em /canais'})</i>\n<code>${link(c.dom365, r365, code)}</code>`).join('\n\n');
}
const postCanal = async (postId: string) => { const r = ((await sb(`channel_posts?id=eq.${encodeURIComponent(postId)}&select=canal_id`).catch(() => [])) ?? [])[0]; return r ? canalById(r.canal_id) : undefined; };
// /cb <shareCode> <post>: liga o bilhete ao post escolhido (0 = só os links); /cs <post> <99|365>: troca a casa do post
async function cbCmd(chatId: number, rest: string[]): Promise<Out> {
  const [code, id] = rest; if (!code) return { text: 'Bilhete não encontrado.' };
  if (!id || id === '0') return { text: await shareLinksText([code], chatId) };
  if (!(await canEdit(await postCanal(id), chatId))) return { text: 'Só o dono do canal pode fazer isso.' };
  const pendRaw = await getCfgKey('CANAL_PEND_' + code); let photo = pendRaw ?? '';
  try { const j = JSON.parse(pendRaw ?? ''); if (j && typeof j === 'object') photo = j.photo ?? ''; } catch { /* print salvo como texto */ }
  const r = await canalFn('relink', `id=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}${photo ? '&photo=' + encodeURIComponent(photo) : ''}`);
  if (photo) await delCfgKey('CANAL_PEND_' + code);
  return { text: r.ok ? `✅ Post do canal atualizado: bilhete pronto na <b>${esc(r.casa ?? '')}</b>${r.imagem ? ' e o seu print' : ''}.` : `Não consegui atualizar o post: ${esc(r.erro ?? 'erro')}` };
}
async function csCmd(rest: string[]): Promise<Out | null> {
  const [id, c] = rest; const r = await canalFn('casa', `id=${encodeURIComponent(id ?? '')}&c=${encodeURIComponent(c ?? '99')}`);
  return r.ok ? null : { text: `Não consegui trocar a casa do post: ${esc(r.erro ?? 'erro')}` };
}

// ---------- /canais: painel de configuração por canal ----------
const MK_ORDER = ['PTS', 'REB', 'AST', 'PRA', 'PR', 'PA', 'RA', '3PM', '3PA', '2PM', '2PA', 'FGM', 'FGA', 'FTM', 'FTA', 'STL', 'BLK', 'SB', 'TOV', 'PF'];
const MK_BTN: Record<string, string> = { PTS: 'Pontos', REB: 'Rebotes', AST: 'Assist.', PRA: 'PRA', PR: 'Pts+Reb', PA: 'Pts+Ast', RA: 'Reb+Ast', '3PM': '3 conv.', '3PA': '3 tent.',
  '2PM': '2 conv.', '2PA': '2 tent.', FGM: 'Arr. conv.', FGA: 'Arr. tent.', FTM: 'LL conv.', FTA: 'LL tent.', STL: 'Roubos', BLK: 'Tocos', SB: 'Roub+Toc', TOV: 'Erros', PF: 'Faltas' };
const LADO_TXT: Record<string, string> = { u: 'under', o: 'over', m: 'misto', ambos: 'over e under' };
const DEF_SPECS = [{ nome: '10', min: 7, max: 10, lado: 'u' }, { nome: '10', min: 7, max: 10, lado: 'o' }, { nome: '15', min: 12, max: 17, lado: 'u' },
  { nome: '15', min: 12, max: 17, lado: 'o' }, { nome: '25', min: 20, max: 25, lado: 'u' }, { nome: '25', min: 20, max: 25, lado: 'o' }];
// o mesmo nome de faixa que o pipeline (scripts/canal.mjs specsOf) usa, para saber o que já saiu hoje
function specBands(k: Canal) {
  const raw = k.cfg.multis?.length ? k.cfg.multis : DEF_SPECS, seen: Record<string, number> = {};
  return raw.map((sp: any) => {
    const odd = +sp.odd || null, max = +sp.max || (odd ? Math.round(odd * 1.15 * 100) / 100 : 10), pernas = +sp.pernas || null, lado = ['u', 'o', 'm'].includes(sp.lado) ? sp.lado : 'u';
    let band = `${sp.nome ?? (odd ?? max)}${pernas ? 'x' + pernas : ''}-${LADO_TXT[lado]}`;
    seen[band] = (seen[band] ?? 0) + 1; if (seen[band] > 1) band += '-' + seen[band];
    const txt = sp.nome ? `odd ${sp.min}–${sp.max}` : `odd ~${odd}`;
    return { band, label: `${txt} · ${pernas ? pernas + ' pernas' : '2–6 pernas'} · ${LADO_TXT[lado]}` };
  });
}
const pct = (x: number) => Math.round(x * 100) + '%';
async function canaisCmd(chatId: number, arg: string): Promise<Out> {
  const adm = await isAdmin(chatId);
  const [sub, a1] = arg.split(/\s+/);
  if (sub === 'add' && adm && a1) {
    const info = await TG('getChat', { chat_id: a1 });
    if (!info.ok) return { text: `Não consegui acessar o canal (${esc(info.description ?? '')}). Confira se o bot é administrador com permissão de postar.` };
    await canalAdd(a1, info.result?.title, chatId);
    return { text: '✅ Pronto.' };
  }
  const ks = adm ? await canalRows() : await canalRows(`&owner=eq.${chatId}`);
  if (!ks.length) return { text: '📢 <b>Canais</b>\nVocê ainda não tem canal conectado. Coloque o bot como <b>administrador</b> do seu canal (com permissão de postar, editar e apagar mensagens): ele aparece aqui sozinho.' };
  const today = etDate(), rows: any[] = await sb(`channel_posts?date=eq.${today}&select=canal_id,kind,status`).catch(() => []) ?? [];
  const line = (k: Canal) => { const r = rows.filter(x => x.canal_id === k.id);
    return k.cfg.modo === 'espelho' ? `🪞 <b>${esc(k.title ?? String(k.chat_id))}</b> · canal oficial (cópia)` : `${k.cfg.on ? '🟢' : '⏸️'} <b>${esc(k.title ?? String(k.chat_id))}</b> · hoje ${r.filter(x => x.kind === 'simples').length} simples, ${r.filter(x => x.kind === 'multipla').length} múltiplas`; };
  return { text: `📢 <b>Hub de canais</b>\n<blockquote>${ks.map(line).join('\n')}</blockquote>\n<i>Os canais dividem as melhores entradas do dia em rodízio, sem prioridade; cada um repete no máximo 30% com os outros. Toque num canal para configurar.</i>`,
    kb: { inline_keyboard: [...ks.map(k => [BTN(`⚙️ ${k.title ?? k.chat_id}`, `/cn ${k.id}`)]), HOME] } };
}
async function cnCmd(chatId: number, rest: string[]): Promise<Out> {
  const [id, scr, ...xs] = rest, k = await canalById(id ?? '');
  if (!(await canEdit(k, chatId))) return { text: 'Canal não encontrado ou sem permissão.' };
  const c = k.cfg, back = [BTN('⬅️ Voltar', `/cn ${k.id}`)];
  const opts = (field: string, vals: (string | number)[], fmt: (v: any) => string, cur: any) =>
    chunk(vals.map(v => BTN(`${String(cur) === String(v) ? '✅ ' : ''}${fmt(v)}`, `/cf ${k.id} ${field} ${v}`)), 4);
  if (scr === 'met') { // Método Alavanca (17/11): experimental, só o administrador liga (pedido: só no Canal teste)
    if (!(await isAdmin(chatId))) return { text: 'Só o administrador do hub liga o Método Alavanca.', kb: { inline_keyboard: [back] } };
    const on = c.metodo === 'alavanca';
    return { text: `⚡ <b>Método Alavanca</b> · ${esc(k.title)} · ${on ? '🟢 ligado' : '⚪ desligado'}
<blockquote>Entra só quando a odd da 99play paga mais que o preço justo da <b>Kalshi</b> (bolsa dos EUA, sem margem de casa) na mesma linha: pontos, rebotes, assistências e bolas de 3.
• Simples: valor de 4%+ contra a Kalshi, odd 1,50–3,50, até 8 por dia. 1u (1,5u com 8%+ e o modelo concordando).
• Alavanca: 2 duplas (odd ~3–5, valor 6%+) e 1 tripla (odd ~5–12, valor 10%+), só com pernas que têm valor, jogos diferentes. 0,5u cada.
• O Modelo BH é trava: se discordar forte, a entrada fica de fora.</blockquote>
<i>Ligado, a pauta deste canal vem só do método (odd mínima, EV, mercados e múltiplas do painel não valem aqui). Cada post guarda a chance da Kalshi para medir o método no fim da semana.</i>`,
      kb: { inline_keyboard: [[on ? BTN('⚪ Desligar (volta ao padrão)', `/cf ${k.id} metodo padrao`) : BTN('🟢 Ligar o Método Alavanca', `/cf ${k.id} metodo alavanca`)], back] } };
  }
  if (scr === 'omin') return { text: `🎯 <b>Odd mínima das simples</b> · ${esc(k.title)}`, kb: { inline_keyboard: [...opts('oddMin', [1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0], v => n2(+v), c.oddMin), back] } };
  if (scr === 'omax') return { text: `📈 <b>Odd máxima das simples</b> · ${esc(k.title)}`, kb: { inline_keyboard: [...opts('oddMax', [2.0, 2.2, 2.5, 3.0, 3.5, 4.0, 5.0], v => n2(+v), c.oddMax), back] } };
  if (scr === 'max') return { text: `🔢 <b>Simples por dia</b> · ${esc(k.title)}`, kb: { inline_keyboard: [...opts('max', [5, 8, 10, 12, 15, 20, 25, 30], v => String(v), c.max), back] } };
  if (scr === 'ev') return { text: `📊 <b>EV mínimo das simples</b> · ${esc(k.title)}\n<i>Quanto maior, mais seletivo (e menos entradas).</i>`, kb: { inline_keyboard: [...opts('evMin', [0, .02, .03, .05, .08, .1], v => pct(+v), c.evMin), back] } };
  if (scr === 'lado') return { text: `⚖️ <b>Lado das simples</b> · ${esc(k.title)}`, kb: { inline_keyboard: [...opts('lado', ['ambos', 'o', 'u'], v => LADO_TXT[v], c.lado), back] } };
  if (scr === 'ini') return { text: `⏰ <b>Começar a postar às</b> · ${esc(k.title)}`, kb: { inline_keyboard: [...opts('inicio', [8, 9, 10, 11, 12, 14], v => v + 'h', c.inicio), back] } };
  if (scr === 'casa') return { text: `🏠 <b>Casa dos posts novos</b> · ${esc(k.title)}\n<i>Cada post ainda troca pelos botões embaixo dele.</i>`, kb: { inline_keyboard: [...opts('casa', ['99', '365'], v => v === '99' ? '99play' : 'BR365', c.casa), back] } };
  if (scr === 'mk') {
    const on = (m: string) => !c.mercados?.length || c.mercados.includes(m);
    return { text: `🏷️ <b>Mercados</b> · ${esc(k.title)}\n<i>Toque para ligar/desligar. Vale para as simples e para as pernas das múltiplas.</i>`,
      kb: { inline_keyboard: [...chunk(MK_ORDER.map(m => BTN(`${on(m) ? '✅' : '▫️'} ${MK_BTN[m]}`, `/cf ${k.id} mk ${m}`)), 3), [BTN('✅ Todos', `/cf ${k.id} mk all`)], back] } };
  }
  if (scr === 'un') return { text: `💰 <b>Unidade</b> · ${esc(k.title)}\n<blockquote>Base: <b>${String(+c.unBase || 1).replace('.', ',')}u</b> · ${c.unVar ? 'variável pela força da entrada' : 'fixa'}</blockquote>\n<i>Variável (só simples): EV 10%+ com chance 60%+ → 2× a base · EV 6%+ → 1,5× · o resto → 1×. Múltiplas ficam na base. O texto "1 unidade" do post muda sozinho e o desempenho conta o valor certo.</i>`,
    kb: { inline_keyboard: [[BTN(`${c.unVar ? '' : '✅ '}Fixa`, `/cf ${k.id} unVar 0`), BTN(`${c.unVar ? '✅ ' : ''}Variável (1–2×)`, `/cf ${k.id} unVar 1`)], opts('unBase', [0.5, 1, 2], v => String(v).replace('.', ',') + 'u base', +c.unBase || 1)[0], back] } };
  if (scr === 'esp') {
    const mine = (await isAdmin(chatId) ? await canalRows() : await canalRows(`&owner=eq.${chatId}`)).filter(x => x.id !== k.id && x.cfg.modo !== 'espelho' || String(x.id) === String(c.espelho));
    const alvo = mine.find(x => String(x.id) === String(c.espelho));
    return { text: `🪞 <b>Canal oficial (espelho)</b> · ${esc(k.title)}\n<blockquote>${alvo ? `Copiando para <b>${esc(alvo.title ?? '')}</b> · ${c.espelhoModo === 'na_hora' ? 'na hora do post' : 'quando o bilhete pronto é ligado'}` : 'Desligado'}</blockquote>\n<i>Use este canal como sala de controle: os posts saem aqui (com os botões) e a cópia limpa, sem botões, vai para o canal oficial. O canal oficial não entra na divisão do hub. O green/red também é respondido lá.\nPara aparecer na lista, o bot precisa ser administrador do canal oficial (ele conecta sozinho).</i>`,
      kb: { inline_keyboard: [...mine.filter(x => x.id !== k.id).map(x => [BTN(`${String(x.id) === String(c.espelho) ? '✅ ' : ''}${x.title ?? x.chat_id}`, `/cf ${k.id} esp ${x.id}`)]),
        ...(alvo ? [[BTN(`${c.espelhoModo === 'na_hora' ? '' : '✅ '}Ao ligar o bilhete`, `/cf ${k.id} espModo bilhete`), BTN(`${c.espelhoModo === 'na_hora' ? '✅ ' : ''}Na hora`, `/cf ${k.id} espModo na_hora`)], [BTN('❌ Desligar espelho', `/cf ${k.id} esp 0`)]] : []), back] } };
  }
  if (scr === 'espde') { // o canal recém-conectado é o oficial (cópia) de outro canal do mesmo dono
    const srcs = (await isAdmin(chatId) ? await canalRows() : await canalRows(`&owner=eq.${chatId}`)).filter(x => x.id !== k.id && x.cfg.modo !== 'espelho');
    return { text: `🪞 <b>${esc(k.title)}</b> é o canal oficial de qual canal?\n<i>Ele passa a receber a cópia limpa dos posts de lá e sai da divisão do hub.</i>`,
      kb: { inline_keyboard: [...srcs.map(x => [BTN(`${x.title ?? x.chat_id}`, `/cf ${x.id} esp ${k.id}`)]), [BTN('Não, é um canal normal', `/cn ${k.id}`)]] } };
  }
  if (scr === 'perm') {
    const perm = await botRights(k.chat_id);
    return { text: `🔐 <b>Permissões do bot</b> · ${esc(k.title)}\n<blockquote>${perm.txt}</blockquote>${perm.ok ? '✅ Tudo certo.' : `⚠️ No canal: Administradores → @blackhouse_props_bot → ligue o que está com ❌.${perm.erro ? `\n<i>${esc(perm.erro)}</i>` : ''}`}`,
      kb: { inline_keyboard: [[BTN('🔄 Conferir de novo', `/cn ${k.id} perm`)], back] } };
  }
  if (scr === 'perf') {
    const since = (d: number) => etDate(Date.now() - d * 864e5);
    const rows: any[] = await sb(`channel_posts?canal_id=eq.${k.id}&date=gte.${since(30)}&status=in.(green,red,void)&select=date,kind,status,profit,legs,stake`).catch(() => []) ?? [];
    const sum = (xs: any[]) => { const ys = xs.filter(x => x.status !== 'void'), n = ys.length, g = ys.filter(x => x.status === 'green').length, u = ys.reduce((a, x) => a + (+x.profit || 0), 0), st = ys.reduce((a, x) => a + (+x.stake || 1), 0);
      return n ? `${g}/${n} (${Math.round(100 * g / n)}%) · <b>${u >= 0 ? '+' : ''}${n2(u)}u</b> · ROI ${u >= 0 ? '+' : ''}${Math.round(100 * u / st)}%` : '—'; };
    const per = (d: number, kind: string) => sum(rows.filter(r => r.date >= since(d) && r.kind === kind));
    const byMk: Record<string, any[]> = {}; for (const r of rows.filter(r => r.kind === 'simples')) (byMk[r.legs?.[0]?.mk] ??= []).push(r);
    const mk = Object.entries(byMk).map(([m, xs]) => [m, xs.reduce((a, x) => a + (+x.profit || 0), 0), xs.length] as [string, number, number]).filter(x => x[2] >= 3).sort((a, b) => b[1] - a[1]);
    return { text: `📈 <b>Desempenho</b> · ${esc(k.title)} <i>(em unidades, só o que já foi conferido)</i>
<blockquote><b>7 dias</b>\nSimples: ${per(7, 'simples')}\nMúltiplas: ${per(7, 'multipla')}\n\n<b>30 dias</b>\nSimples: ${per(30, 'simples')}\nMúltiplas: ${per(30, 'multipla')}</blockquote>${mk.length ? `\n<b>Mercados (simples, 30 dias, 3+ entradas)</b>\n<blockquote>${mk.slice(0, 8).map(([m, u, n]) => `${MK_BTN[m] ?? m}: ${u >= 0 ? '+' : ''}${n2(u)}u em ${n}`).join('\n')}</blockquote>\n<i>Mercado que só perde? Desligue em 🏷️ Mercados.</i>` : ''}`,
      kb: { inline_keyboard: [[BTN('📊 Painel e planilha', `/cn ${k.id} res`)], back] } };
  }
  if (scr === 'res') { // painel no app + fórmula da Google Sheet (atualiza sozinha); link com token só deste canal
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${(await cfg()).secret}:resultados:${k.id}`));
    const t = [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    const painel = `${APP_URL}resultados.html?c=${k.id}&t=${t}`;
    const csv = `https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/canal?resultados=${k.id}&t=${t}&fmt=csv&dias=400`;
    return { text: `📊 <b>Painel e planilha</b> · ${esc(k.title)}
<blockquote>Painel: resultado por dia, mercado e faixa de odd, e quantas entradas bateram o fechamento (odd ou linha da 99play no início do jogo).
Planilha: numa Google Sheet nova, cole na célula A1:</blockquote>
<code>=IMPORTDATA("${csv}"; ","; "en_US")</code>
<i>A planilha e o painel se atualizam sozinhos. Os links são só deste canal: não divulgue se não quiser que vejam seus números.</i>`,
      kb: { inline_keyboard: [[{ text: '📊 Abrir painel', url: painel }], [BTN('⬅️ Voltar', `/cn ${k.id} perf`)]] } };
  }
  if (scr === 'rm') return { text: `🗑️ <b>Remover ${esc(k.title)} do hub?</b>\nO bot para de postar nesse canal (os posts antigos ficam). Para voltar, é só tirar e colocar o bot de novo como administrador.`,
    kb: { inline_keyboard: [[BTN('🗑️ Sim, remover', `/cf ${k.id} remover`)], back] } };
  if (scr === 'tpl') {
    const t = c.tpl, n = (t?.entities ?? []).filter((e: any) => e.type === 'custom_emoji').length;
    return { text: `📝 <b>Padrão de mensagem</b> · ${esc(k.title)}\n<blockquote>${t?.text ? `Personalizado${n ? ` · ${n} emoji(s) personalizado(s)` : ''}:\n${esc(t.text).slice(0, 600)}` : 'Padrão do bot (🏀 NBA 🏀 / 💰 unidade / sequência / link)'}</blockquote>\n<i>Mande um post no padrão do seu canal (copie ou encaminhe, com os emojis personalizados). A sequência dele vira a sequência de cada entrada e o link vira o link da entrada. Também dá para usar {SEQUENCIA}, {LINK}, {ODD} e {JOGADOR}.</i>\n<i>⚠️ Emoji personalizado em canal: o Telegram só deixa bots que têm um nome de usuário extra do Fragment. Sem isso, o post sai com os emojis comuns no lugar.</i>`,
      kb: { inline_keyboard: [[BTN('📝 Enviar novo padrão', `/cf ${k.id} asktpl`)], ...(t?.text ? [[BTN('👀 Ver prévia', `/cf ${k.id} tplprev`), BTN('↩️ Voltar ao padrão do bot', `/cf ${k.id} tplreset`)]] : []), back] } };
  }
  if (scr === 'mais') return { text: `⚙️ <b>Mais opções</b> · ${esc(k.title)}`, kb: { inline_keyboard: [
    [BTN(`${c.botoes ? '✅' : '▫️'} Botões 99play/BR365 nos posts`, `/cf ${k.id} botoes ${c.botoes ? 0 : 1}`)],
    [BTN(`${c.resultado ? '✅' : '▫️'} Responder ✅ GREEN / ❌ RED no canal`, `/cf ${k.id} resultado ${c.resultado ? 0 : 1}`)],
    [BTN(`${c.rodape ? '✅' : '▫️'} Rodapé 🔞 18+`, `/cf ${k.id} rodape ${c.rodape ? 0 : 1}`)],
    [BTN(`${c.semanal ? '✅' : '▫️'} Resumo semanal no canal (segunda, 10h)`, `/cf ${k.id} semanal ${c.semanal ? 0 : 1}`)], back] } };
  if (scr === 'refs') return { text: `🔗 <b>Links de afiliado</b> · ${esc(k.title)}\n<blockquote>99play: <b>${esc(c.ref99 || (String(k.owner) === (await cfg()).allowed[0] ? (await cfg()).affRef + ' (padrão do bot)' : '— sem ref'))}</b>\nBR365: <b>${esc(c.ref365 || (String(k.owner) === (await cfg()).allowed[0] ? (await cfg()).affRef365 + ' (padrão do bot)' : '— sem ref'))}</b></blockquote>\n<i>O ref vai só no link do bilhete pronto (o link do jogo sai sem ref).</i>`,
    kb: { inline_keyboard: [[BTN('🔗 Definir 99play', `/cf ${k.id} askref 99`), BTN('🔗 Definir BR365', `/cf ${k.id} askref 365`)], back] } };
  if (scr === 'mul') {
    const sp = specBands(k), rows: any[] = await sb(`channel_posts?canal_id=eq.${k.id}&date=eq.${etDate()}&kind=eq.multipla&select=band`).catch(() => []) ?? [];
    const P = await fetch(APP_URL + 'data/canal.json?t=' + Math.floor(Date.now() / 6e4)).then(r => r.ok ? r.json() : null).catch(() => null);
    const plan = new Set((P?.canais?.[k.id]?.multis ?? []).map((m: any) => m.band)), done = new Set(rows.map(r => /-/.test(r.band) ? r.band : r.band + '-under'));
    const st = (b: string) => done.has(b) ? '✅ saiu' : plan.has(b) ? '🕒 na pauta' : '⚠️ não fechou hoje';
    return { text: `🧩 <b>Múltiplas</b> · ${esc(k.title)}${c.multis?.length ? '' : ' <i>(padrão)</i>'}\n<blockquote>${sp.map((x: any, i: number) => `${i + 1}. ${x.label} — ${st(x.band)}`).join('\n')}</blockquote>\n<i>Cada múltipla repete no máximo 30% das pernas com múltiplas de outros canais. "Não fechou" = hoje não há pernas boas que cheguem nessa odd com esse número de jogadores.</i>`,
      kb: { inline_keyboard: [...chunk(sp.map((_: any, i: number) => BTN(`❌ ${i + 1}`, `/cf ${k.id} mdel ${i}`)), 4), [BTN('➕ Adicionar múltipla', `/cn ${k.id} madd`)], [BTN('↩️ Voltar ao padrão', `/cf ${k.id} mreset`)], back] } };
  }
  if (scr === 'madd') {
    const [pernas, odd] = xs;
    if (!pernas) return { text: '➕ <b>Nova múltipla</b>\nQuantos jogadores (pernas)?', kb: { inline_keyboard: [...chunk(['2', '3', '4', '5', '6', '7', '8'].map(p => BTN(p, `/cn ${k.id} madd ${p}`)), 4), [BTN('Livre (2 a 6)', `/cn ${k.id} madd 0`)], [BTN('⬅️ Voltar', `/cn ${k.id} mul`)]] } };
    const sug: Record<string, number[]> = { '0': [5, 10, 15, 25], '2': [3, 4, 5], '3': [4, 5, 7, 10], '4': [5, 7, 10, 15], '5': [7, 10, 15, 20], '6': [10, 15, 20, 25], '7': [15, 20, 30, 40], '8': [20, 30, 40, 50] };
    if (!odd) return { text: `➕ <b>Nova múltipla</b> · ${pernas === '0' ? '2 a 6' : pernas} pernas\nOdd alvo? <i>(faixa de ±15%; opções que costumam fechar com esse número de pernas)</i>`, kb: { inline_keyboard: [chunk((sug[pernas] ?? [10]).map(o => BTN(`~${o}`, `/cn ${k.id} madd ${pernas} ${o}`)), 4)[0], [BTN('⬅️ Voltar', `/cn ${k.id} madd`)]] } };
    return { text: `➕ <b>Nova múltipla</b> · odd ~${odd} · ${pernas === '0' ? '2 a 6' : pernas} pernas\nLado?`, kb: { inline_keyboard: [[BTN('Under', `/cf ${k.id} madd ${pernas} ${odd} u`), BTN('Over', `/cf ${k.id} madd ${pernas} ${odd} o`), BTN('Misto', `/cf ${k.id} madd ${pernas} ${odd} m`)], [BTN('⬅️ Voltar', `/cn ${k.id} madd ${pernas}`)]] } };
  }
  // painel principal
  if (c.modo === 'espelho') {
    const src = (await canalRows()).find(x => String(x.cfg.espelho) === String(k.id));
    return { text: `🪞 <b>${esc(k.title ?? '')}</b> é o canal oficial de <b>${esc(src?.title ?? '—')}</b>.\nRecebe a cópia limpa dos posts de lá e não entra na divisão do hub.`,
      kb: { inline_keyboard: [...(src ? [[BTN(`⚙️ ${src.title}`, `/cn ${src.id}`)]] : []), [BTN('🔐 Permissões', `/cn ${k.id} perm`), BTN('🗑️ Remover', `/cn ${k.id} rm`)], [BTN('⬅️ Canais', '/canais')]] } };
  }
  const rows: any[] = await sb(`channel_posts?canal_id=eq.${k.id}&date=eq.${etDate()}&select=kind,status`).catch(() => []) ?? [];
  const mk = c.mercados?.length ? c.mercados.map((m: string) => MK_BTN[m] ?? m).join(', ') : 'todos';
  const text = `📢 <b>${esc(k.title ?? String(k.chat_id))}</b> · ${c.on ? '🟢 postando' : '⏸️ pausado'}
<blockquote>Simples: até <b>${c.max}</b>/dia · odd <b>${n2(+c.oddMin)}–${n2(+c.oddMax)}</b> · EV ${pct(+c.evMin)}+ · ${LADO_TXT[c.lado] ?? c.lado}
Mercados: ${esc(mk)}
Múltiplas: ${specBands(k).length}${c.multis?.length ? '' : ' (padrão 10/15/25 over e under)'}
Casa: <b>${c.casa === '365' ? 'BR365' : '99play'}</b> · começa às ${c.inicio}h · mensagem: ${c.tpl?.text ? 'padrão do canal' : 'padrão do bot'}
Unidade: ${String(+c.unBase || 1).replace('.', ',')}u ${c.unVar ? 'variável' : 'fixa'}${c.espelho ? ' · 🪞 com canal oficial' : ''}${c.semanal ? ' · resumo semanal' : ''}
Hoje: ${rows.filter(r => r.kind === 'simples').length} simples · ${rows.filter(r => r.kind === 'multipla').length} múltiplas · ${rows.filter(r => r.status === 'green').length} ✅ ${rows.filter(r => r.status === 'red').length} ❌</blockquote>${c.metodo === 'alavanca' ? '\n⚡ <b>Método Alavanca ligado</b>: a pauta vem da comparação com a Kalshi (os filtros acima não valem).' : ''}`;
  return { text, kb: { inline_keyboard: [
    [BTN('🎯 Odd mínima', `/cn ${k.id} omin`), BTN('📈 Odd máxima', `/cn ${k.id} omax`)],
    [BTN('🔢 Simples/dia', `/cn ${k.id} max`), BTN('📊 EV mínimo', `/cn ${k.id} ev`)],
    [BTN('🏷️ Mercados', `/cn ${k.id} mk`), BTN('⚖️ Lado', `/cn ${k.id} lado`)],
    [BTN('🧩 Múltiplas', `/cn ${k.id} mul`), BTN('🏠 Casa', `/cn ${k.id} casa`)],
    [BTN('🔗 Links de afiliado', `/cn ${k.id} refs`), BTN('⏰ Horário', `/cn ${k.id} ini`)],
    [BTN('📝 Padrão de mensagem', `/cn ${k.id} tpl`), BTN('⚙️ Mais opções', `/cn ${k.id} mais`)],
    [BTN('💰 Unidade', `/cn ${k.id} un`), BTN('🪞 Canal oficial', `/cn ${k.id} esp`)],
    [BTN('📈 Desempenho', `/cn ${k.id} perf`), BTN('🔐 Permissões', `/cn ${k.id} perm`)],
    ...(await isAdmin(chatId) ? [[BTN(`⚡ Método: ${c.metodo === 'alavanca' ? 'Alavanca' : 'padrão'}`, `/cn ${k.id} met`)]] : []),
    [c.on ? BTN('⏸️ Pausar', `/cf ${k.id} on 0`) : BTN('▶️ Retomar', `/cf ${k.id} on 1`), BTN('🗑️ Remover', `/cn ${k.id} rm`)],
    [BTN('⬅️ Canais', '/canais')]] } };
}
// /cf <canal> <campo> <valor>: grava e volta para a tela certa
async function cfCmd(chatId: number, rest: string[]): Promise<Out> {
  const [id, field, ...vs] = rest, k = await canalById(id ?? ''), v = vs[0];
  if (!(await canEdit(k, chatId))) return { text: 'Canal não encontrado ou sem permissão.' };
  const num: Record<string, [number, number]> = { oddMin: [1.01, 10], oddMax: [1.1, 20], max: [0, 50], evMin: [0, .5], inicio: [0, 23] };
  if (num[field]) { const x = +v; if (isFinite(x) && x >= num[field][0] && x <= num[field][1]) await saveCfg(k, { [field]: x }); return cnCmd(chatId, [id, field === 'oddMin' ? 'omin' : field === 'oddMax' ? 'omax' : field === 'evMin' ? 'ev' : field === 'inicio' ? 'ini' : 'max']); }
  if (field === 'lado' && ['ambos', 'o', 'u'].includes(v)) { await saveCfg(k, { lado: v }); return cnCmd(chatId, [id, 'lado']); }
  if (field === 'casa' && ['99', '365'].includes(v)) { await saveCfg(k, { casa: v }); return cnCmd(chatId, [id, 'casa']); }
  if (field === 'on') { await saveCfg(k, { on: v === '1' }); return cnCmd(chatId, [id]); }
  if (field === 'botoes' || field === 'resultado') { await saveCfg(k, { [field]: v === '1' }); return cnCmd(chatId, [id, 'mais']); }
  if (field === 'rodape') { await saveCfg(k, { rodape: v === '1' ? CDEF.rodape : '' }); return cnCmd(chatId, [id, 'mais']); }
  if (field === 'mk') {
    let cur: string[] = k.cfg.mercados?.length ? [...k.cfg.mercados] : [...MK_ORDER];
    if (v === 'all') cur = [...MK_ORDER]; else if (MK_ORDER.includes(v)) cur = cur.includes(v) ? cur.filter(m => m !== v) : [...cur, v];
    if (!cur.length) cur = [v]; // nunca fica sem mercado
    await saveCfg(k, { mercados: cur.length === MK_ORDER.length ? null : cur }); return cnCmd(chatId, [id, 'mk']);
  }
  if (field === 'mreset') { await saveCfg(k, { multis: null }); return cnCmd(chatId, [id, 'mul']); }
  if (field === 'mdel') { const cur = [...(k.cfg.multis?.length ? k.cfg.multis : DEF_SPECS)]; cur.splice(+v, 1); await saveCfg(k, { multis: cur.length ? cur : [] }); return cnCmd(chatId, [id, 'mul']); }
  if (field === 'madd') {
    const [pernas, odd, lado] = vs, cur = [...(k.cfg.multis?.length ? k.cfg.multis : DEF_SPECS)];
    if (cur.length >= 8) return { text: 'Máximo de 8 múltiplas por canal. Remova uma antes.', kb: { inline_keyboard: [[BTN('⬅️ Múltiplas', `/cn ${id} mul`)]] } };
    cur.push({ odd: +odd, pernas: +pernas || null, lado: ['u', 'o', 'm'].includes(lado) ? lado : 'u' });
    await saveCfg(k, { multis: cur }); return cnCmd(chatId, [id, 'mul']);
  }
  if (field === 'asktpl') {
    await putCfgKey('PEND_' + chatId, `tpl ${k.id}`);
    return { text: `📝 Mande agora <b>um post no padrão do canal</b>: copie e cole ou encaminhe (pode ser a foto com a legenda). Mantenha os emojis personalizados, a citação da sequência e o link: eu troco a sequência e o link em cada entrada.`, kb: { inline_keyboard: [[BTN('✖️ Cancelar', `/cn ${id} tpl`)]] } };
  }
  if (field === 'unVar') { await saveCfg(k, { unVar: v === '1' }); return cnCmd(chatId, [id, 'un']); }
  if (field === 'unBase') { const x = +v; if ([0.5, 1, 2].includes(x)) await saveCfg(k, { unBase: x }); return cnCmd(chatId, [id, 'un']); }
  if (field === 'semanal') { await saveCfg(k, { semanal: v === '1' }); return cnCmd(chatId, [id, 'mais']); }
  if (field === 'metodo') { if (!(await isAdmin(chatId))) return { text: 'Só o administrador do hub muda o método.' }; await saveCfg(k, { metodo: v === 'alavanca' ? 'alavanca' : null }); return cnCmd(chatId, [id, 'met']); }
  if (field === 'espModo' && ['bilhete', 'na_hora'].includes(v)) { await saveCfg(k, { espelhoModo: v }); return cnCmd(chatId, [id, 'esp']); }
  if (field === 'esp') {
    const old = k.cfg.espelho ? await canalById(k.cfg.espelho) : undefined;
    if (old) await saveCfg(old, { modo: null });
    if (v === '0') { await saveCfg(k, { espelho: null }); return cnCmd(chatId, [id, 'esp']); }
    const t = await canalById(v);
    if (!(await canEdit(t, chatId)) || t.id === k.id) return { text: 'Canal oficial inválido.', kb: { inline_keyboard: [[BTN('⬅️ Voltar', `/cn ${id} esp`)]] } };
    await saveCfg(t, { modo: 'espelho' }); await saveCfg(k, { espelho: t.id, espelhoModo: k.cfg.espelhoModo ?? 'bilhete' });
    return cnCmd(chatId, [id, 'esp']);
  }
  if (field === 'remover') {
    await sb(`canais?id=eq.${k.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: false }) });
    return { text: `🗑️ <b>${esc(k.title ?? '')}</b> saiu do hub. O bot não posta mais lá.`, kb: { inline_keyboard: [[BTN('⬅️ Canais', '/canais')]] } };
  }
  if (field === 'tplreset') { await saveCfg(k, { tpl: null }); return cnCmd(chatId, [id, 'tpl']); }
  if (field === 'tplprev') {
    const r = await canalFn('preview', `canal=${k.id}`);
    return { text: r.ok ? `👀 Mandei aqui a prévia de uma simples e de uma múltipla no padrão do canal ${esc(k.title ?? '')}.` : `Sem prévia agora: ${esc(r.erro ?? 'pauta vazia')}`, kb: { inline_keyboard: [[BTN('⬅️ Padrão de mensagem', `/cn ${id} tpl`)]] } };
  }
  if (field === 'askref' && ['99', '365'].includes(v)) {
    await putCfgKey('PEND_' + chatId, `ref${v} ${k.id}`);
    return { text: `🔗 Mande agora o seu <b>link de indicação da ${v === '99' ? '99play' : 'BR365'}</b> (o do painel de afiliado, ex.: <code>https://${v === '99' ? '99play.im' : 'br365.io'}/?ref=abc12</code>) ou só o código do ref.`, kb: { inline_keyboard: [[BTN('✖️ Cancelar', `/cn ${id} refs`)]] } };
  }
  return cnCmd(chatId, [id]);
}
// resposta ao "mande o seu link de indicação": grava o ref no canal
async function pendingText(chatId: number, text: string, m: any = null): Promise<boolean> {
  const pend = await getCfgKey('PEND_' + chatId); if (!pend || text.startsWith('/')) return false;
  const [what, id] = pend.split(' '), k = await canalById(id);
  await delCfgKey('PEND_' + chatId);
  if (!(await canEdit(k, chatId))) return false;
  if (what === 'tpl') { // padrão de mensagem: texto (ou legenda) + entities, com os emojis personalizados
    const t = m?.text ?? m?.caption ?? text, ents = (m?.entities ?? m?.caption_entities ?? [])
      .filter((e: any) => ['bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'code', 'pre', 'blockquote', 'expandable_blockquote', 'text_link', 'custom_emoji'].includes(e.type))
      .map((e: any) => ({ type: e.type, offset: e.offset, length: e.length, ...(e.url ? { url: e.url } : {}), ...(e.custom_emoji_id ? { custom_emoji_id: e.custom_emoji_id } : {}), ...(e.language ? { language: e.language } : {}) }));
    await saveCfg(k, { tpl: { text: t, entities: ents } });
    const n = ents.filter((e: any) => e.type === 'custom_emoji').length, seq = /\d{1,2}(?:\s*-\s*\d{1,2}){4,}|\{SEQU/i.test(t), link = ents.some((e: any) => e.type === 'text_link') || /\{LINK\}/i.test(t);
    await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `✅ <b>Padrão salvo</b> para ${esc(k.title ?? '')}.\n<blockquote>${n} emoji(s) personalizado(s) · sequência: ${seq ? 'achei ✅' : 'não achei (vai sem)'} · link: ${link ? 'achei ✅' : 'vou pôr no fim'}</blockquote>\nTe mando a prévia agora.` });
    await canalFn('preview', `canal=${k.id}`);
    return true;
  }
  const ref = (/[?&]ref=([A-Za-z0-9_-]+)/.exec(text) ?? /^\s*([A-Za-z0-9_-]{3,32})\s*$/.exec(text))?.[1];
  if (!ref) { await TG('sendMessage', { chat_id: chatId, text: 'Não achei o ref nesse link. Tente de novo pelo /canais.' }); return true; }
  await saveCfg(k, { [what === 'ref365' ? 'ref365' : 'ref99']: ref });
  const o = await cnCmd(chatId, [String(k.id), 'refs']);
  await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `✅ Ref <b>${esc(ref)}</b> salvo.\n\n` + o.text, reply_markup: o.kb });
  return true;
}

async function handle(update: any) {
  const cm = update.my_chat_member, cpost = update.channel_post;
  if (cpost?.chat?.type === 'channel') { const k = await canalByChat(cpost.chat.id); if (k) await canalPost(cpost, k); else await canalSeen(null, cpost); return; }
  if (cm && (cm.chat?.type === 'channel' || GRP(cm.chat?.type))) { await canalSeen(cm, null); return; }
  // grupos do hub: só o dono mexe (link de bilhete); nada de responder "bot privado" dentro de grupo
  const gm = update.message && GRP(update.message.chat?.type) ? update.message : null;
  if (gm) {
    if (gm.migrate_to_chat_id) { await sb(`canais?chat_id=eq.${gm.chat.id}`, { method: 'PATCH', body: JSON.stringify({ chat_id: gm.migrate_to_chat_id }) }).catch(() => null); return; }
    const k = await canalByChat(gm.chat.id); if (k && await canEdit(k, gm.from?.id)) await canalPost(gm, k);
    return;
  }
  const cq = update.callback_query;
  if (cq && (cq.message?.chat?.type === 'channel' || GRP(cq.message?.chat?.type))) { await canalCb(cq); return; }
  const msg = update.message ?? cq?.message;
  let text: string | undefined = update.message?.text ?? update.message?.caption ?? cq?.data;
  if (!msg || !text) return;
  const chatId: number = msg.chat.id;
  const allowed = (await cfg()).allowed;
  if (allowed.length && !allowed.includes(String(chatId))) {
    if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id });
    await TG('sendMessage', { chat_id: chatId, text: `Este bot é privado. Peça acesso ao dono e informe o seu ID: ${chatId}` });
    return;
  }
  // todo usuário novo já entra recebendo tudo (tops, modelo por mercado e alertas); ele desliga em /receber.
  // ignore-duplicates: quem já tem inscrição (inclusive desligada) não muda
  await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ chat_id: chatId, tent: true, ra: true, est: true, updated_at: new Date().toISOString() }) }).catch(() => null);
  // resposta a um pedido do /canais (ex.: "mande o seu link de indicação")
  if (!cq && (update.message?.text || update.message?.caption) && await pendingText(chatId, update.message.text ?? update.message.caption, update.message)) return;
  // link de bilhete da 99play ou da BR365 (mesmo shareCode nas duas) compartilhado no privado do bot
  if (!cq) {
    const codes = [...new Set([...text.matchAll(SHARE_RE)].map(m => m[1]))];
    if (codes.length) {
      const photo = update.message?.photo?.at?.(-1)?.file_id ?? '';
      // posts recentes sem bilhete dos canais desta pessoa (o administrador vê todos)
      const ks = (await isAdmin(chatId)) ? await canalRows() : await canalRows(`&owner=eq.${chatId}`);
      const abertos = (await Promise.all(ks.map(async k => ((await canalFn('abertos', `canal=${k.id}`).catch(() => [])) ?? []).map((p: any) => ({ ...p, canal: k.title }))))).flat().slice(0, 10);
      if (abertos.length) {
        if (photo) await putCfgKey('CANAL_PEND_' + codes[0], JSON.stringify({ photo }));
        const many = ks.length > 1;
        await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', reply_parameters: { message_id: update.message.message_id },
          text: `🎟️ <b>Bilhete recebido.</b> De qual post é?${photo ? '\n<i>O print vai junto.</i>' : ''}`,
          reply_markup: { inline_keyboard: [...abertos.map((p: any) => [BTN(((many ? `[${p.canal ?? ''}] ` : '') + postLabel(p)).slice(0, 60), `/cb ${codes[0]} ${p.id}`)]), [BTN('🔗 Só quero os links', `/cb ${codes[0]} 0`)]] } });
        return;
      }
      await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', disable_web_page_preview: true, text: await shareLinksText(codes, chatId) }); return;
    }
  }
  // /github <token> (20/11): o administrador guarda o token que dispara o pipeline; a mensagem com o token é apagada na hora
  if (!cq && /^\/github(@\S+)?\s+\S+/i.test(text)) {
    const mid = update.message?.message_id;
    if (mid) await TG('deleteMessage', { chat_id: chatId, message_id: mid }).catch(() => null);
    if (!(await isAdmin(chatId))) { await TG('sendMessage', { chat_id: chatId, text: 'Comando só do administrador.' }); return; }
    const tok = text.trim().split(/\s+/)[1];
    await putCfgKey('GH_DISPATCH', tok);
    const r = await ghRun(0);
    await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: r === 'ok' ? '✅ <b>Token guardado</b> (apaguei a sua mensagem). Testei: os números já estão rodando. A partir de agora cada leitura nova da 99play roda os números na hora, e o botão ▶️ Rodar agora funciona.' : `⚠️ Guardei o token, mas o GitHub recusou o teste (${esc(r)}). Confira se ele tem permissão <b>Actions: Read and write</b> no repositório black-house-props.` });
    return;
  }
  // trocar a casa de um post do canal (botões do aviso "Postado no canal"): responde com um aviso rápido, sem nova mensagem
  if (cq && /^\/cs\s/.test(text)) {
    const parts = text.trim().split(/\s+/).slice(1), own = await canEdit(await postCanal(parts[0] ?? ''), chatId);
    const r = own ? await csCmd(parts) : { text: 'Só o dono do canal pode fazer isso.' };
    await TG('answerCallbackQuery', { callback_query_id: cq.id, text: r ? r.text.replace(/<[^>]+>/g, '') : '✅ Casa do post trocada' });
    return;
  }
  // teclado fixo (botões de baixo): vira comando
  if (!cq && KBMAP[text.trim()]) text = KBMAP[text.trim()];
  // /start: liga o teclado fixo (uma mensagem curta) e mostra o início
  if (!cq && /^\/start(@\S+)?(\s|$)/i.test(text)) await TG('sendMessage', { chat_id: chatId, text: '👇 Use os botões aqui embaixo para navegar: <b>Hoje</b>, <b>Modelo BH</b>, <b>Banca</b> e <b>Mais</b>.', parse_mode: 'HTML', reply_markup: RKB });
  // registro de entrada: 📝 (bet:<chave>:<origem>), registrar do /modelo (bm:...), odd por botão (bo:id:odd), cancelar (bx:id)
  const bt = /^(bet|be|bm|bo|bx|bc):(.+)$/.exec(text);
  if (bt) {
    if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id });
    let out: Out | null = null;
    try {
      if (bt[1] === 'bet' || bt[1] === 'be' || bt[1] === 'bm') {
        const d = await data();
        let r: Row | undefined, src = 'modelo';
        if (bt[1] !== 'bm') { const i = bt[2].lastIndexOf(':'); src = bt[2].slice(i + 1); r = d.rows.find(x => keyOf(x) === bt[2].slice(0, i)); }
        else {
          const [pid, mk, line, side] = bt[2].split(':'); const m = d.mdl?.[pid];
          const p = pAt(d, pid, MK2STAT[mk], +line, side);
          if (m) r = { id: pid, n: m.n, t: m.t, o: m.o, home: m.home, h: m.h, m: mk, s: side as 'o' | 'u', l: +line, p: p ?? .5, nt: undefined } as unknown as Row;
        }
        out = r ? await betStart(chatId, d, r, src) : { text: 'Essa entrada saiu da lista na última atualização. Abra a lista de novo.', kb: { inline_keyboard: [HOME] } };
      } else if (bt[1] === 'bc') { const [id, casa] = bt[2].split(':'); out = await betCasa(chatId, +id, casa);
      } else if (bt[1] === 'bo') { const [id, odd] = bt[2].split(':'); out = await betFinish(chatId, +id, odd); out ??= { text: 'Esse registro já foi concluído ou cancelado. Veja em /banca.', kb: { inline_keyboard: [HOME] } }; }
      else { await sb(`bets?id=eq.${+bt[2]}&chat_id=eq.${chatId}&status=eq.aguardando_odd`, { method: 'DELETE' }); out = { text: 'Registro cancelado.', kb: { inline_keyboard: [HOME] } }; }
    } catch (e) { out = { text: 'Não consegui registrar agora (' + esc(String((e as Error).message)) + ').', kb: { inline_keyboard: [HOME] } }; }
    // be/bo/bx: troca a mesma mensagem (registro sem poluir o chat); bet (envio diário) e bm (/modelo): mensagem nova
    const body = { chat_id: chatId, text: out!.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: out!.kb };
    if (cq && bt[1] !== 'bet' && bt[1] !== 'bm') { const r = await TG('editMessageText', { ...body, message_id: msg.message_id }); if (!r.ok && !/not modified/i.test(r.description ?? '')) await TG('sendMessage', body); }
    else await TG('sendMessage', body);
    return;
  }
  // texto sem barra: pode ser a odd de um registro pendente
  if (!text.startsWith('/') && !cq) {
    const out = await betFinish(chatId, null, text).catch(() => null);
    if (out) { await TG('sendMessage', { chat_id: chatId, text: out.text, parse_mode: 'HTML', reply_markup: out.kb }); return; }
  }
  // texto pronto para os inscritos (lista inteira do top num bloco copiável; sempre mensagem nova)
  const cpm = /^cp:(tent|ra)$/.exec(text);
  if (cpm) {
    if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id });
    const d = await data().catch(() => null);
    await TG('sendMessage', { chat_id: chatId, text: d ? fitHTML(shareList(d, cpm[1], await userMin(chatId))) : 'Não consegui ler os dados agora.', parse_mode: 'HTML', disable_web_page_preview: true });
    return;
  }
  // card em imagem de uma entrada (botão 🖼️ das listas)
  const im = /^i:(.+)$/.exec(text);
  if (im) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id }); await sendCard(chatId, im[1]); return; }
  // /cards: as melhores do dia em imagem (sempre mensagens novas)
  if (/^\/(pdf|relatorio)(@\S+)?(\s|$)/i.test(text)) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id, text: 'Enviando o PDF…' }); await sendPdf(chatId); return; }
  if (/^\/(pauta|tipster)(@\S+)?(\s|$)/i.test(text)) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id, text: 'Montando a pauta…' }); await sendPauta(chatId, /exemplo|teste/i.test(text)); return; }
  if (/^\/cards(@\S+)?(\s|$)/i.test(text)) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id }); await sendCards(chatId, text.split(/\s+/)[1]); return; }
  // página (p:2:/top 20) e atualizar (repete o comando que gerou a mensagem)
  let page = 1;
  const pm = /^([prx]):(\d+):(.+)$/.exec(text); let refreshed = false;
  if (pm) { page = pm[1] === 'x' ? -(+pm[2]) : +pm[2]; text = pm[3]; if (pm[1] === 'r') { CACHE = null; refreshed = true; } }
  if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id, ...(refreshed ? { text: '🔄 Dados atualizados' } : {}) });
  if (!text.startsWith('/')) { await TG('sendMessage', { chat_id: chatId, text: 'Escolha abaixo ou digite /ajuda.', reply_markup: MENU }); return; }
  let res: Out;
  try { res = await answer(text, chatId, page); } catch (e) { res = { text: 'Não consegui ler os dados agora (' + esc(String((e as Error).message)) + '). Tente de novo em instantes.', kb: { inline_keyboard: [HOME] } }; }
  const body = { chat_id: chatId, text: fitHTML(res.text), parse_mode: 'HTML', disable_web_page_preview: true, ...(res.kb ? { reply_markup: res.kb } : {}) };
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
      const r = await pushDaily(url.searchParams.get('force') === '1', +(url.searchParams.get('min') || 0), +(url.searchParams.get('lead') || 0)).catch(e => ({ ok: false, erro: String(e) }));
      return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    if (url.searchParams.get('morning') && url.searchParams.get('morning') === SECRET) {
      const r = await morningPush(url.searchParams.get('force') === '1').catch(e => ({ ok: false, erro: String(e) }));
      return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    if (url.searchParams.get('record') && url.searchParams.get('record') === SECRET) {
      CACHE = null;
      const r = await data().then(async d => {
        const today = etDate();
        if (d.date !== today) return { ok: true, skip: `dados de ${d.date}, hoje é ${today}` };
        return { ok: true, date: d.date, gen: d.gen, gravados: await recordTops(d) };
      }).catch(e => ({ ok: false, erro: String(e) }));
      return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    const rep = (await cfg()).report;
    if (rep && url.searchParams.get('csv') === rep) {
      const rows: any[] = await sb('top_picks?select=*&order=date.asc,list.asc,rank.asc&limit=10000').catch(() => []) ?? [];
      const head = ['data', 'lista', 'posicao', 'jogador', 'time', 'adversario', 'mercado', 'lado', 'linha', 'odd', 'fonte_odd', 'chance_modelo', 'nota', 'resultado', 'status', 'lucro_u', 'linha_ref'];
      const q = (x: unknown) => { const t = x == null ? '' : String(x); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const body = rows.map(r => [r.date, r.list === 'tent' ? 'Tentativas' : 'Reb+Ast', r.rank, r.name, r.team, r.opp, MK[r.mk] ?? r.mk, r.side === 'o' ? 'Mais' : 'Menos', r.line, r.odd ?? ODD_EST, r.odd_src ?? 'estimada', r.p, r.nota, r.result,
        ({ aberta: 'Aberta', green: 'Green', red: 'Red', void: 'Anulada' } as Record<string, string>)[r.status] ?? r.status, r.status === 'aberta' ? '' : r.profit ?? '', r.ref_line ?? '']);
      return new Response([head, ...body].map(l => l.map(q).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }
    if (url.searchParams.get('setup') !== SECRET) return new Response('ok');
    // dentro do Supabase a função vê só /telegram-bot; o endereço público tem /functions/v1 na frente
    const base = Deno.env.get('SUPABASE_URL');
    const self = base ? `${base}/functions/v1/telegram-bot` : `https://${url.host}${url.pathname}`;
    const hook = await TG('setWebhook', { url: self, secret_token: SECRET, allowed_updates: ['message', 'callback_query', 'channel_post', 'my_chat_member'], drop_pending_updates: true });
    const cmds = await TG('setMyCommands', { commands: [
      ['top', 'Melhores do dia (ex.: /top 20)'], ['valor', 'Valor com odd de casa'], ['seguras', 'Chance de 65% ou mais'], ['pontos', 'Melhores em pontos'], ['rebotes', 'Melhores em rebotes'],
      ['assist', 'Melhores em assistências'], ['tres', 'Bolas de 3'], ['pra', 'Pts+Reb+Ast'], ['combinados', 'PR, PA, RA e PRA'], ['tentativas', 'Arremessos tentados'], ['convertidos', 'Arremessos convertidos'],
      ['defesa', 'Roubos, tocos, erros e faltas'], ['faltas', 'Faltas cometidas'], ['mais', 'Só "mais de" (ex.: /mais pontos)'], ['menos', 'Só "menos de"'], ['jogo', 'Linhas de um jogo (ex.: /jogo LAL)'], ['jogador', 'Linhas de um jogador'],
      ['multipla', 'Múltipla (ex.: /multipla 3 ou 4,5)'], ['jogos', 'Jogos de hoje'], ['desfalques', 'Lesões'], ['resumo', 'Resumo da rodada'], ['cards', 'Melhores do dia em imagem'], ['pdf', 'PDF com as melhores entradas do dia'], ['modelo', 'Modelo BH: chance de qualquer linha'], ['testes', 'Testes do Modelo BH'], ['toptentativas', 'Top 10 do modelo em tentativas'], ['topra', 'Top 10 do modelo em reb+ast'], ['receber', 'Receber os tops todo dia'], ['banca', 'Entradas registradas, lucro e ROI'], ['ontem', 'Resultado de ontem'], ['estrategias', 'Modelo por mercado: placar e entradas'], ['minutos', 'Método Minutos: placar e entradas do dia'], ['veredito', 'Veredito pelo fechamento (CLV) de cada método'], ['combo', 'Combo Finta × 99play: ast + reb 15+ (ex.: /combo lebron)'], ['correl', 'Props correlacionadas entre companheiros (ex.: /correl wagner 8 ast)'], ['finta', 'Finta: overs com valor'], ['gabarito', 'Gabarito de ontem por mercado'], ['status', 'Saúde do sistema: coleta, leitor e papel'], ['placar', 'Placar da verdade: modelo × 99play × Kalshi'], ['canais', 'Canais: postagem automática e configuração'], ['escadas', 'Escadas: pontos + rebotes + assistências do mesmo jogador'], ['pauta', 'Pauta do Tipster: o melhor do dia num botão'], ['hoje', 'Listas de hoje'], ['ajuda', 'Todos os comandos'], ['app', 'Abrir o app']].map(([command, description]) => ({ command, description })) });
    const me = await TG('getMe', {});
    const info = await TG('getWebhookInfo', {});
    return new Response(JSON.stringify({ ok: !!hook.ok, webhook: hook, endereco: info.result?.url, erro_recente: info.result?.last_error_message ?? null, comandos: cmds.ok, bot: me.result?.username ? '@' + me.result.username : null }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => null);
  if (update) await handle(update).catch(e => console.error(e));
  return new Response('ok');
});
