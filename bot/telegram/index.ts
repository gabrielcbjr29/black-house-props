// Bot do Telegram do Black House (Supabase Edge Function, Deno).
// Lê a lista pronta que a coleta publica (bot.json) e responde aos comandos.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN  token do @BotFather (obrigatório)
//   WEBHOOK_SECRET      senha qualquer; protege o webhook e o link de instalação (obrigatório)
//   ALLOWED_CHATS       IDs liberados, separados por vírgula (opcional; vazio = qualquer pessoa)
//   DATA_URL            opcional; padrão = bot.json do GitHub Pages
//
// Instalação (uma vez): abra  <url-da-função>?setup=<WEBHOOK_SECRET>  no navegador.

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const ALLOWED = (Deno.env.get('ALLOWED_CHATS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const DATA_URL = Deno.env.get('DATA_URL') ?? 'https://gabrielcbjr29.github.io/black-house-props/data/bot.json';
const APP_URL = 'https://gabrielcbjr29.github.io/black-house-props/';
const TG = (m: string, body: unknown) => fetch(`https://api.telegram.org/bot${TOKEN}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

type Row = { id: string; n: string; t: string; o: string; home: boolean; g: string; h: string; m: string; s: 'o' | 'u'; l: number; p: number; q: number | null; d: number | null; b: string | null; k: number; e: number | null; gr: string; l10: [number, number] | null; l20: [number, number] | null; pj: number; st: string; rl: string | null; sc: number };
type Data = { date: string; gen: string; demo: boolean; w: number; games: { id: string; a: string; h: string; t: string; sp: number | null; to: number | null }[]; injuries: { n: string; t: string; st: string; no: string }[]; rows: Row[] };

let CACHE: { at: number; data: Data } | null = null;
async function data(): Promise<Data> {
  if (CACHE && Date.now() - CACHE.at < 120_000) return CACHE.data;
  const r = await fetch(DATA_URL + '?t=' + Math.floor(Date.now() / 120_000), { headers: { 'Cache-Control': 'no-cache' } });
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
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
const dateBR = (d: string) => { const [y, m, dd] = d.split('-'); const wd = new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''); return `${wd}, ${dd}/${m}`; };
const genBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const FOOT = '\n<i>18+. Confira lesões, quinteto e a odd da sua casa antes de entrar. O Ministério da Fazenda adverte: apostas podem causar dependência.</i>';

function line(r: Row, i: number) {
  const side = r.s === 'o' ? 'Mais de' : 'Menos de';
  const vs = r.home ? `x ${r.o}` : `@ ${r.o}`;
  const odd = r.d ? `@${n2(r.d)} ${esc(r.b ?? '')}${r.k ? ' (bolsa)' : ''}` : `linha de referência, odd justa @${n2(1 / r.p)}`;
  const ev = r.e == null ? '' : ` · EV ${r.e >= 0 ? '+' : ''}${(r.e * 100).toFixed(1).replace('.', ',')}%`;
  const warn = r.e != null && r.e > .15 ? ' ⚠️ diverge muito do mercado' : '';
  const st = r.st === 'questionable' ? ' · em dúvida' : '';
  const hits = r.l10 ? `últimos 10: ${r.l10[0]}/${r.l10[1]}` : '';
  return `${i}. <b>${r.gr}</b> ${esc(r.n)} <i>(${r.t} ${vs}, ${r.h})</i>\n   <b>${side} ${n1(r.l)}</b> ${MK[r.m] ?? r.m}\n   chance ${pc(r.p)}${r.q != null ? ` (mercado ${pc(r.q)})` : ''} · ${odd}${ev}${warn}\n   ${hits}${hits ? ' · ' : ''}projeção ${n1(Math.round(r.pj * 10) / 10)}${st}`;
}
function list(d: Data, rows: Row[], title: string, n: number, onePerPlayer = true, empty = '') {
  const seen = new Set<string>(), out: Row[] = [];
  for (const r of rows) { if (onePerPlayer && seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (out.length >= n) break; }
  const head = `<b>🏀 ${esc(title)}</b>\n<i>${dateBR(d.date)}, ${d.games.length} jogos, atualizado ${genBR(d.gen)}${d.demo ? ' (demonstração)' : ''}</i>\n`;
  if (!out.length) return head + '\nNenhuma linha boa nesse filtro agora.' + (empty ? '\n' + empty : '') + FOOT;
  return head + '\n' + out.map((r, i) => line(r, i + 1)).join('\n\n') + '\n' + FOOT;
}
const clampN = (s: string | undefined, def = 10) => { const x = parseInt(s ?? '', 10); return Number.isFinite(x) ? Math.max(1, Math.min(20, x)) : def; };

function multipla(d: Data, arg: string | undefined) {
  const v = arg ? parseFloat(arg.replace(',', '.')) : NaN;
  const target = Number.isFinite(v) && v >= 1.3 && !(Number.isInteger(v) && v <= 8) ? v : null;
  const legs = target ? 8 : Math.max(2, Math.min(6, Number.isFinite(v) ? v : 3));
  const cand = d.rows.filter(r => (r.gr === 'A+' || r.gr === 'A') && r.d && r.d >= 1.3 && (r.e ?? 0) >= 0 && (r.e ?? 0) <= .15 && r.st === 'ok')
    .sort((a, b) => (a.k - b.k) || (b.sc - a.sc));
  const pick: Row[] = [], games = new Set<string>(); let odd = 1, p = 1;
  for (const r of cand) { if (target ? odd >= target : pick.length >= legs) break; if (pick.length >= 8) break; if (games.has(r.g)) continue; games.add(r.g); pick.push(r); odd *= r.d!; p *= r.p; }
  const kal = pick.some(r => r.k);
  if (pick.length < 2) return 'Não há linhas fortes suficientes em jogos diferentes hoje para uma múltipla.' + FOOT;
  const head = `<b>🎟️ Múltipla de ${pick.length} pernas</b>${target ? ` <i>(alvo ${n2(target)})</i>` : ''}\nUma perna por jogo, nota A ou A+.\n\n`;
  return head + pick.map((r, i) => `${i + 1}. ${esc(r.n)}: <b>${r.s === 'o' ? 'mais de' : 'menos de'} ${n1(r.l)}</b> ${MK[r.m]} @${n2(r.d!)} <i>(${r.h})</i>`).join('\n') +
    `\n\nOdd combinada <b>${n2(odd)}</b> · chance estimada ${pc(p)} · EV ${((p * odd - 1) * 100).toFixed(1).replace('.', ',')}%\n<i>Pernas tratadas como independentes; use stake menor que a de uma simples.${kal ? ' Algumas odds são da bolsa (Kalshi): confira a da sua casa.' : ''}</i>` + FOOT;
}

const HELP = `<b>Black House · comandos</b>

<b>Melhores do dia</b>
/top · /top 20 · as melhores em todos os mercados
/valor · só com odd de casa e EV entre 3% e 15%
/seguras · chance de 65% ou mais

<b>Por mercado</b> (some um número: /rebotes 15)
/pontos /rebotes /assist /tres
/pra /pr /pa /ra /combinados
/tentativas · arremessos tentados (quadra, 2, 3, lance livre)
/convertidos · arremessos convertidos
/defesa · roubos, tocos e erros

<b>Filtros</b>
/mais pontos · /menos rebotes · só um lado
/jogo LAL · tudo de um jogo
/jogador brunson · linhas de um jogador

<b>Rodada</b>
/jogos · /desfalques · /resumo
/multipla 3 · /multipla 4,5 (odd-alvo)
/app · abrir o app completo`;
const MENU = { inline_keyboard: [
  [{ text: '⭐ Top 10', callback_data: '/top' }, { text: '💰 Valor', callback_data: '/valor' }, { text: '🛡️ Seguras', callback_data: '/seguras' }],
  [{ text: 'Pontos', callback_data: '/pontos' }, { text: 'Rebotes', callback_data: '/rebotes' }, { text: 'Assist.', callback_data: '/assist' }, { text: 'Bolas de 3', callback_data: '/tres' }],
  [{ text: 'PRA', callback_data: '/pra' }, { text: 'Combinados', callback_data: '/combinados' }, { text: 'Tentativas', callback_data: '/tentativas' }],
  [{ text: 'Defesa', callback_data: '/defesa' }, { text: '🎟️ Múltipla', callback_data: '/multipla 3' }, { text: 'Jogos', callback_data: '/jogos' }],
  [{ text: 'Desfalques', callback_data: '/desfalques' }, { text: 'Resumo', callback_data: '/resumo' }, { text: '📱 App', url: APP_URL }],
] };

async function answer(text: string, chatId: number): Promise<{ text: string; menu?: boolean }> {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = norm(rawCmd.replace(/^\//, '').replace(/@.*$/, ''));
  const arg = rest.join(' ');
  if (cmd === 'start' || cmd === 'menu') return { text: `Fala! Aqui ficam as melhores entradas de props da NBA de hoje, atualizadas a cada coleta.\n\nToque num botão ou digite /ajuda.\n<i>Seu ID: ${chatId}</i>`, menu: true };
  if (cmd === 'ajuda' || cmd === 'help' || cmd === 'comandos') return { text: HELP, menu: true };
  if (cmd === 'app') return { text: `📱 App completo: ${APP_URL}` };
  const d = await data();
  if (cmd === 'top') return { text: list(d, d.rows, `Top ${clampN(rest[0])} do dia`, clampN(rest[0])) };
  if (cmd === 'valor') return { text: list(d, d.rows.filter(r => r.d && !r.k && r.e != null && r.e >= .03 && r.e <= .15).sort((a, b) => (b.e! - a.e!)), 'Valor com odd de casa', clampN(rest[0]), true, 'As odds das casas entram perto de cada jogo (até 2h30 antes). Tente de novo mais perto do primeiro jogo ou veja /top.') };
  if (cmd === 'seguras') return { text: list(d, d.rows.filter(r => r.p >= .65 && r.p <= .92 && r.st === 'ok' && (!r.d || r.d >= 1.25) && (r.gr === 'A+' || r.gr === 'A') && r.m !== 'PF').sort((a, b) => (+!!b.d - +!!a.d) || b.p - a.p), 'Mais seguras (chance ≥ 65%)', clampN(rest[0])) };
  if (GROUPS[cmd]) { const g = GROUPS[cmd]; return { text: list(d, d.rows.filter(r => g.mk.includes(r.m)), g.title, clampN(rest[0]), g.mk.length === 1) }; }
  if (cmd === 'mais' || cmd === 'menos') {
    const s = cmd === 'mais' ? 'o' : 'u'; const gk = WORD2GROUP[norm(rest[0] ?? '')];
    const rows = d.rows.filter(r => r.s === s && (!gk || GROUPS[gk].mk.includes(r.m)));
    return { text: list(d, rows, `${cmd === 'mais' ? 'Mais de' : 'Menos de'}${gk ? ': ' + GROUPS[gk].title : ''}`, clampN(gk ? rest[1] : rest[0])) };
  }
  if (cmd === 'jogo') {
    const q = norm(arg).toUpperCase(); if (!q) return { text: 'Use assim: /jogo LAL (sigla de um dos times).' };
    const g = d.games.find(x => x.a === q || x.h === q); if (!g) return { text: `Não achei jogo hoje com ${esc(q)}. Veja /jogos.` };
    return { text: list(d, d.rows.filter(r => r.g === g.id), `${g.a} @ ${g.h}, ${g.t}`, 15) };
  }
  if (cmd === 'jogador') {
    const q = norm(arg); if (q.length < 3) return { text: 'Use assim: /jogador brunson' };
    const rows = d.rows.filter(r => norm(r.n).includes(q)); if (!rows.length) return { text: `Nenhuma linha boa hoje para "${esc(arg)}".` };
    return { text: list(d, rows, rows[0].n, 12, false) };
  }
  if (cmd === 'multipla') return { text: multipla(d, rest[0]) };
  if (cmd === 'jogos') return { text: `<b>🗓️ Jogos de ${dateBR(d.date)}</b>\n\n` + d.games.map(g => `${g.t}  <b>${g.a} @ ${g.h}</b>${g.sp != null ? `  · ${g.sp < 0 ? g.h : g.a} −${n1(Math.abs(g.sp))}` : ''}${g.to ? ` · total ${n1(g.to)}` : ''}`).join('\n') + '\n\n<i>Use /jogo SIGLA para ver as linhas de um jogo.</i>' };
  if (cmd === 'desfalques') {
    const lb: Record<string, string> = { out: 'fora', doubtful: 'provável fora', questionable: 'dúvida' };
    const by = new Map<string, string[]>(); for (const p of d.injuries) { if (!by.has(p.t)) by.set(p.t, []); by.get(p.t)!.push(`${esc(p.n)} (${lb[p.st] ?? p.st})`); }
    const teams = new Set(d.games.flatMap(g => [g.a, g.h]));
    return { text: `<b>🚑 Desfalques de hoje</b>\n\n` + ([...by].filter(([t]) => teams.has(t)).map(([t, l]) => `<b>${t}</b>: ${l.join(', ')}`).join('\n') || 'Nenhum desfalque listado.') };
  }
  if (cmd === 'resumo') {
    const a = d.rows.filter(r => r.gr === 'A+' || r.gr === 'A'), val = d.rows.filter(r => r.d && !r.k && (r.e ?? 0) >= .03);
    const out = d.injuries.filter(p => p.st === 'out' || p.st === 'doubtful').length;
    return { text: `<b>📋 Resumo de ${dateBR(d.date)}</b>\n\n${d.games.length} jogos, o primeiro às ${d.games.map(g => g.t).sort()[0] ?? '–'}\n${a.length} linhas com nota A ou A+\n${val.length} com valor na odd de casa\n${out} desfalques confirmados ou prováveis\n\nAtualizado ${genBR(d.gen)}.\n/top para ver as melhores.` + FOOT, menu: true };
  }
  return { text: 'Não conheci esse comando. Digite /ajuda para ver a lista.', menu: true };
}

async function handle(update: any) {
  const msg = update.message ?? update.callback_query?.message;
  const text: string | undefined = update.message?.text ?? update.callback_query?.data;
  if (!msg || !text) return;
  const chatId: number = msg.chat.id;
  if (update.callback_query) await TG('answerCallbackQuery', { callback_query_id: update.callback_query.id });
  if (ALLOWED.length && !ALLOWED.includes(String(chatId))) {
    await TG('sendMessage', { chat_id: chatId, text: `Este bot é privado. Peça acesso ao dono e informe o seu ID: ${chatId}` });
    return;
  }
  if (!text.startsWith('/')) { await TG('sendMessage', { chat_id: chatId, text: 'Digite /ajuda para ver os comandos.', reply_markup: MENU }); return; }
  let res: { text: string; menu?: boolean };
  try { res = await answer(text, chatId); } catch (e) { res = { text: 'Não consegui ler os dados agora (' + esc(String((e as Error).message)) + '). Tente de novo em instantes.' }; }
  await TG('sendMessage', { chat_id: chatId, text: res.text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...(res.menu ? { reply_markup: MENU } : {}) });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (!TOKEN || !SECRET) return new Response('Faltam os segredos TELEGRAM_BOT_TOKEN e WEBHOOK_SECRET.', { status: 500 });
  if (req.method === 'GET') {
    if (url.searchParams.get('setup') !== SECRET) return new Response('ok');
    const self = `https://${url.host}${url.pathname}`;
    const hook = await TG('setWebhook', { url: self, secret_token: SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    const cmds = await TG('setMyCommands', { commands: [
      ['top', 'Melhores do dia (ex.: /top 20)'], ['valor', 'Valor com odd de casa'], ['seguras', 'Chance de 65% ou mais'], ['pontos', 'Melhores em pontos'], ['rebotes', 'Melhores em rebotes'],
      ['assist', 'Melhores em assistências'], ['tres', 'Bolas de 3'], ['pra', 'Pts+Reb+Ast'], ['combinados', 'PR, PA, RA e PRA'], ['tentativas', 'Arremessos tentados'], ['convertidos', 'Arremessos convertidos'],
      ['defesa', 'Roubos, tocos e erros'], ['mais', 'Só "mais de" (ex.: /mais pontos)'], ['menos', 'Só "menos de"'], ['jogo', 'Linhas de um jogo (ex.: /jogo LAL)'], ['jogador', 'Linhas de um jogador'],
      ['multipla', 'Múltipla (ex.: /multipla 3 ou 4,5)'], ['jogos', 'Jogos de hoje'], ['desfalques', 'Lesões'], ['resumo', 'Resumo da rodada'], ['ajuda', 'Todos os comandos'], ['app', 'Abrir o app']].map(([command, description]) => ({ command, description })) });
    const me = await TG('getMe', {});
    return new Response(JSON.stringify({ webhook: hook, comandos: cmds.ok, bot: me.result?.username ? '@' + me.result.username : null }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => null);
  if (update) await handle(update).catch(e => console.error(e));
  return new Response('ok');
});
