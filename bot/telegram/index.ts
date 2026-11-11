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
const TG = async (m: string, body: unknown) => { const c = await cfg(); return fetch(`https://api.telegram.org/bot${c.token}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()); };

type Row = { id: string; n: string; t: string; o: string; home: boolean; g: string; h: string; m: string; s: 'o' | 'u'; l: number; p: number; q: number | null; d: number | null; b: string | null; k: number; e: number | null; gr: string; l10: [number, number] | null; l20: [number, number] | null; ss?: [number, number] | null; hh?: [number, number] | null; dv?: { r: number; of: number; ps: string; k: string } | null; pj: number; st: string; rl: string | null; nt?: number; sc: number; wy?: string[]; wn?: string[] };
type Data = { date: string; gen: string; demo: boolean; w: number; games: { id: string; a: string; h: string; t: string; utc?: string; sp: number | null; to: number | null }[]; injuries: { n: string; t: string; st: string; no: string }[]; rows: Row[] };

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
  tentativas: { mk: ['FGA', '2PA', '3PA', 'FTA'], title: 'Tentativas de arremesso' },
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
  const hits = `📊 L10 ${hitTxt(r.l10)} · Temp. ${hitTxt(r.ss)} · vs ${r.o} ${hitTxt(r.hh)}  <i>proj. ${n1(Math.round(r.pj * 10) / 10)}</i>`;
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
  return { text: header(d, title, note + (pages > 1 ? ` · página ${pg}/${pages}` : '')) + '\n' + body + '\n' + FOOT, kb: { inline_keyboard: [...(nav.length ? [nav] : []), home(cmd, pg)] } };
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
/tentativas · arremessos tentados
/convertidos · arremessos convertidos
/defesa · roubos, tocos e erros

<b>Filtros</b>
/mais pontos · /menos rebotes
/jogo LAL · /jogador brunson

<b>Rodada</b>
/jogos · /desfalques · /resumo
/multipla 3 · /multipla 4,5
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
  if (cmd === 'app') return { text: `📱 <b>App completo</b>\n${APP_URL}`, kb: { inline_keyboard: [[{ text: 'Abrir o app', url: APP_URL }], HOME] } };
  const d = await data();
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
    if (url.searchParams.get('setup') !== SECRET) return new Response('ok');
    // dentro do Supabase a função vê só /telegram-bot; o endereço público tem /functions/v1 na frente
    const base = Deno.env.get('SUPABASE_URL');
    const self = base ? `${base}/functions/v1/telegram-bot` : `https://${url.host}${url.pathname}`;
    const hook = await TG('setWebhook', { url: self, secret_token: SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    const cmds = await TG('setMyCommands', { commands: [
      ['top', 'Melhores do dia (ex.: /top 20)'], ['valor', 'Valor com odd de casa'], ['seguras', 'Chance de 65% ou mais'], ['pontos', 'Melhores em pontos'], ['rebotes', 'Melhores em rebotes'],
      ['assist', 'Melhores em assistências'], ['tres', 'Bolas de 3'], ['pra', 'Pts+Reb+Ast'], ['combinados', 'PR, PA, RA e PRA'], ['tentativas', 'Arremessos tentados'], ['convertidos', 'Arremessos convertidos'],
      ['defesa', 'Roubos, tocos e erros'], ['mais', 'Só "mais de" (ex.: /mais pontos)'], ['menos', 'Só "menos de"'], ['jogo', 'Linhas de um jogo (ex.: /jogo LAL)'], ['jogador', 'Linhas de um jogador'],
      ['multipla', 'Múltipla (ex.: /multipla 3 ou 4,5)'], ['jogos', 'Jogos de hoje'], ['desfalques', 'Lesões'], ['resumo', 'Resumo da rodada'], ['ajuda', 'Todos os comandos'], ['app', 'Abrir o app']].map(([command, description]) => ({ command, description })) });
    const me = await TG('getMe', {});
    const info = await TG('getWebhookInfo', {});
    return new Response(JSON.stringify({ ok: !!hook.ok, webhook: hook, endereco: info.result?.url, erro_recente: info.result?.last_error_message ?? null, comandos: cmds.ok, bot: me.result?.username ? '@' + me.result.username : null }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => null);
  if (update) await handle(update).catch(e => console.error(e));
  return new Response('ok');
});
