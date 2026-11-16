// Canal do Telegram (pedido do usuário em 15/11): posta sozinho a pauta do dia (public/data/canal.json, gerada no
// pipeline por scripts/canal.mjs) no padrão dele: card + "🏀 NBA 🏀 / 💰 1 unidade / Sequência / link".
//   ?run=<WEBHOOK_SECRET>     (pg_cron, a cada 15 min) posta as próximas entradas e confere as já postadas
//   ?relink=<WEBHOOK_SECRET>&msg=<id da mensagem de aviso>&code=<shareCode>[&photo=<file_id>]
//                             troca o link do post pelo bilhete pronto (e a imagem pelo print, se vier); o
//                             telegram-bot chama quando o dono responde o aviso com o link da 99play
//   ?casa=<WEBHOOK_SECRET>&id=<post>&c=99|365  troca a casa do post (link e card); ?abertos= lista posts sem bilhete
//   ?preview=<WEBHOOK_SECRET> manda a próxima simples e a próxima múltipla só para o dono, como prévia
// Postagem: a partir de CANAL_INICIO (padrão 10h de Brasília), espaçada até 40 min antes de cada jogo; até
// CANAL_MAX simples (padrão 20; uma por jogador no dia); múltiplas 10 / 15 / 25 a partir de 12h / 15h / 17h (ou
// antes, se o primeiro jogo dela estiver perto). Odd velha (leitor da 99play parado há 2h+) não vai para o canal.
// bot_config: CANAL_ID (preenchido sozinho quando o canal é conectado), CANAL_ON (0 pausa), CANAL_MAX, CANAL_INICIO,
// CANAL_UN (padrão "1 unidade"), CANAL_UN_MULTI, CANAL_RESULTADO (0 = não responder green/red no canal),
// CANAL_RODAPE (texto final; "0" tira), CANAL_DONO (padrão: o primeiro de ALLOWED_CHATS), AFF_REF (99play),
// AFF_REF_365 (BR365, padrão nac6j), CANAL_BOTOES (0 tira os botões 99play/BR365 dos posts), CANAL_AVISO_DM (1 volta os
// avisos "Postado no canal" no privado), CANAL_CASA (99 ou 365: casa padrão dos posts novos; cada post pode trocar no aviso).
const APP = 'https://gabrielcbjr29.github.io/black-house-props/data/';
const MK2STAT: Record<string, string> = { PTS: 'pts', REB: 'reb', AST: 'ast', '3PM': 'tpm', PRA: 'pts+reb+ast', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'fgm', FGA: 'fga', '2PM': 'twom', '2PA': 'twoa', '3PA': 'tpa', FTM: 'ftm', FTA: 'fta', STL: 'stl', BLK: 'blk', SB: 'stl+blk', TOV: 'tov', PF: 'pf' };
const IDX: Record<string, (a: number[]) => number> = { pf: a => a[7], pts: a => a[1], reb: a => a[2], ast: a => a[3], stl: a => a[4], blk: a => a[5], tov: a => a[6], fgm: a => a[8], fga: a => a[9], tpm: a => a[10], tpa: a => a[11], ftm: a => a[12], fta: a => a[13], twoa: a => a[9] - a[11], twom: a => a[8] - a[10] };
const MKS: Record<string, string> = { PTS: 'pontos', REB: 'rebotes', AST: 'assist.', '3PM': 'de 3 conv.', PRA: 'PRA', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'arr. conv.', FGA: 'arr. tentados', '2PM': 'de 2 conv.', '2PA': 'de 2 tentados', '3PA': 'de 3 tentadas', FTM: 'LL conv.', FTA: 'LL tentados', STL: 'roubos', BLK: 'tocos', SB: 'roub+tocos', TOV: 'erros', PF: 'faltas' };
const SLOT: Record<string, number> = { '10': 12, '15': 15, '25': 17 };
const LEAD = 40 * 6e4, STEP = 15 * 6e4, STALE = 2 * 36e5;

const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 160));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
let CFG: Record<string, string> | null = null;
async function cfg(k: string, def = ''): Promise<string> {
  if (!CFG) { CFG = {}; for (const x of (await sb('bot_config?select=key,value')) ?? []) CFG[x.key] = x.value; }
  const v = CFG[k]; return v == null || v === '' ? def : v;
}
const setCfg = (key: string, value: string) => sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) });
const getJ = (f: string) => fetch(APP + f + '?t=' + Math.floor(Date.now() / 60_000), { headers: { 'Cache-Control': 'no-cache' } }).then(r => r.ok ? r.json() : null);
const etDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const hourBRnow = () => +new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
const hourBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const esc = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = (x: number) => String(x).replace('.', ',');
const n2 = (x: number) => (+x).toFixed(2).replace('.', ',');
async function TG(method: string, body: unknown) {
  const token = await cfg('TELEGRAM_BOT_TOKEN');
  return fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, description: String(e) }));
}
const owner = async () => await cfg('CANAL_DONO', (await cfg('ALLOWED_CHATS')).split(',')[0]?.trim() ?? '');

// ---------- legenda ----------
// duas casas com o mesmo shareCode e o mesmo id de evento (plataforma Altenar); só muda o domínio e o ref de afiliado
const CASAS: Record<string, { nome: string; base: string; refKey: string; ref: string }> = {
  '99': { nome: '99play', base: 'https://99play.io/sports', refKey: 'AFF_REF', ref: 'rca5p' },
  '365': { nome: 'BR365', base: 'https://br365.io/sports', refKey: 'AFF_REF_365', ref: 'nac6j' },
};
const casaOf = (c?: string | null) => CASAS[c ?? ''] ? c! : '99';
const refOf = async (c: string) => encodeURIComponent(await cfg(CASAS[c].refKey, CASAS[c].ref));
const legsOf = (x: any) => x.legs ?? [x];
// link do jogo SEM o ref (com o ref o evento não abre, avisou o usuário em 16/11); o ref vai só no link do bilhete pronto
const evLink = async (ev: number | null, c = '99') => `${CASAS[c].base}${ev ? `#/event/${ev}` : ''}`;
const shareLink = async (code: string, c = '99') => `${CASAS[c].base}?ref=${await refOf(c)}&shareCode=${encodeURIComponent(code)}`;
const gamesOf = (x: any) => { const g = new Map<string, any>(); for (const l of legsOf(x)) if (!g.has(l.game)) g.set(l.game, l); return [...g.values()]; };
async function linkHTML(x: any, code?: string | null, c = '99') {
  if (code) return `🎟️ <a href="${await shareLink(code, c)}">Clique aqui para pegar o bilhete pronto.</a>`;
  const games = gamesOf(x);
  if (games.length <= 1) return `🎟️ <a href="${await evLink(legsOf(x)[0].ev, c)}">Clique aqui para abrir o jogo na ${CASAS[c].nome}.</a>`;
  const parts = await Promise.all(games.map(async l => `<a href="${await evLink(l.ev, c)}">${l.home} x ${l.away}</a>`));
  return `🎟️ Abrir os jogos na ${CASAS[c].nome}: ${parts.join(' · ')}`;
}
async function fill(cap: string, kind: string, link: string) {
  const un = kind === 'multipla' ? await cfg('CANAL_UN_MULTI', await cfg('CANAL_UN', '1 unidade')) : await cfg('CANAL_UN', '1 unidade');
  const rod = await cfg('CANAL_RODAPE', '🔞 18+ · Aposte com responsabilidade');
  return cap.replace('{UN}', esc(un)).replace('{LINK}', link) + (rod === '0' ? '' : `\n\n<i>${esc(rod)}</i>`);
}
const resumo = (x: any) => legsOf(x).map((l: any) => `${esc(l.name)} · ${MKS[l.mk] ?? l.mk} ${l.side === 'o' ? 'mais' : 'menos'} ${n1(l.line)} @${n2(l.odd)}`).join('\n');
const minLegs = (x: any) => legsOf(x).map((l: any) => ({ pid: l.pid, name: l.name, team: l.team, opp: l.opp, home: l.home, away: l.away, game: l.game, ev: l.ev,
  mk: l.mk, stat: MK2STAT[l.mk], side: l.side, line: l.line, odd: l.odd, tip: l.tip }));
const img365 = (img: string) => img.replace(/^canal\//, 'canal/365/');
// aviso no privado do dono: botão do jogo (na casa escolhida) + escolha da casa do post
// botões embaixo do post no canal (pedido de 16/11: controles no canal, não no privado do bot). Só o dono consegue usar;
// CANAL_BOTOES=0 tira (ex.: num canal público).
async function chKb(id: number, c: string) {
  if ((await cfg('CANAL_BOTOES', '1')) === '0') return undefined;
  return { inline_keyboard: [Object.keys(CASAS).map(k => ({ text: `${k === c ? '✅ ' : ''}${CASAS[k].nome}`, callback_data: `/cs ${id} ${k}` }))] };
}
async function noticeKb(id: number, x: any, c: string, code?: string | null) {
  const go = code ? [{ text: `🎟️ Bilhete na ${CASAS[c].nome}`, url: await shareLink(code, c) }]
    : await Promise.all(gamesOf(x).slice(0, 3).map(async (l, i, a) => ({ text: a.length > 1 ? `🎟️ ${l.home} x ${l.away}` : `🎟️ Abrir o jogo na ${CASAS[c].nome}`, url: await evLink(l.ev, c) })));
  return { inline_keyboard: [go, Object.keys(CASAS).map(k => ({ text: `${k === c ? '✅ ' : ''}${CASAS[k].nome}`, callback_data: `/cs ${id} ${k}` }))] };
}

// ---------- postar ----------
async function post(x: any, kind: 'simples' | 'multipla', date: string, gen: string, to?: string) {
  const chat = to ?? await cfg('CANAL_ID'), c = casaOf(await cfg('CANAL_CASA', '99'));
  const caption = await fill(x.cap, kind, await linkHTML(x, null, c));
  const photo = APP + (c === '365' ? (x.img365 ?? img365(x.img)) : x.img) + '?v=' + encodeURIComponent(gen ?? Date.now());
  const r = await TG('sendPhoto', { chat_id: chat, photo, caption: to ? '[PRÉVIA] ' + caption : caption, parse_mode: 'HTML' });
  if (!r.ok || to) return r;
  const fid = r.result?.photo?.at?.(-1)?.file_id;
  const [row] = await sb('channel_posts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    date, kind, legs: minLegs(x), odd: x.odd, band: x.band ?? null, status: 'postada', link: await linkHTML(x, null, c), channel_msg_id: r.result.message_id,
    owner_chat: +(await owner()) || null, pkey: x.key, cap: x.cap, img: x.img, casa: c, fids: fid ? { [c]: fid } : {}, posted_at: new Date().toISOString() }) });
  const kb = await chKb(row.id, c);
  if (kb) await TG('editMessageReplyMarkup', { chat_id: chat, message_id: r.result.message_id, reply_markup: kb });
  const own = (await cfg('CANAL_AVISO_DM', '0')) === '1' ? await owner() : '';
  if (own) {
    const m = await TG('sendMessage', { chat_id: own, parse_mode: 'HTML', disable_notification: true, disable_web_page_preview: true, reply_markup: await noticeKb(row.id, x, c),
      text: `📢 <b>Postado no canal</b> · ${kind === 'multipla' ? `múltipla ${x.band} @${n2(x.odd)}` : 'simples'}\n<blockquote>${resumo(x)}</blockquote>\n<i>Fez o bilhete? Compartilhe da 99play ou da BR365 para o bot (ou responda esta mensagem com o link; o print pode ir junto) e o post vira bilhete pronto. Os botões de baixo trocam a casa do post.</i>` });
    if (m.ok) await sb(`channel_posts?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ owner_msg_id: m.result.message_id }) }).catch(() => null);
  }
  return r;
}
// troca a imagem e a legenda de um post já publicado (casa nova, bilhete pronto ou print do dono)
async function repaint(row: any, c: string, code: string | null, photo: string | null) {
  const chat = await cfg('CANAL_ID'), caption = await fill(row.cap, row.kind, await linkHTML({ legs: row.legs }, code, c));
  const fids = { ...(row.fids ?? {}) };
  const media = photo ?? fids.print ?? fids[c] ?? (APP + (c === '365' ? img365(row.img) : row.img) + '?v=' + Date.now());
  const kb = await chKb(row.id, c);
  let r = await TG('editMessageMedia', { chat_id: chat, message_id: row.channel_msg_id, media: { type: 'photo', media, caption, parse_mode: 'HTML' }, ...(kb ? { reply_markup: kb } : {}) });
  if (!r.ok && /not modified/i.test(r.description ?? '')) r = { ok: true };
  if (!r.ok) { // imagem antiga já saiu da pauta: troca só a legenda
    r = await TG('editMessageCaption', { chat_id: chat, message_id: row.channel_msg_id, caption, parse_mode: 'HTML', ...(kb ? { reply_markup: kb } : {}) });
    if (!r.ok && /not modified/i.test(r.description ?? '')) r = { ok: true };
  } else if (r.result?.photo) { const f = r.result.photo.at(-1).file_id; if (photo) fids.print = f; else if (!fids.print) fids[c] = f; }
  if (!r.ok) return { ok: false, erro: r.description };
  await sb(`channel_posts?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ casa: c, fids, ...(code ? { share_code: code, link: await shareLink(code, c) } : {}) }) });
  const own = await owner();
  if (own && row.owner_msg_id) await TG('editMessageReplyMarkup', { chat_id: own, message_id: row.owner_msg_id, reply_markup: await noticeKb(row.id, { legs: row.legs }, c, code) });
  return { ok: true, id: row.id, casa: CASAS[c].nome, imagem: !!photo };
}
const fresh = (x: any, now: number) => legsOf(x).every((l: any) => Date.parse(l.tip) > now + LEAD && (!l.t9 || now - Date.parse(l.t9) < STALE));

async function run() {
  const out: Record<string, unknown> = {};
  out.conferidas = await settle().catch(e => ({ erro: String(e) }));
  if ((await cfg('CANAL_ON', '1')) === '0') return { ...out, skip: 'canal pausado (CANAL_ON=0)' };
  if (!(await cfg('CANAL_ID'))) return { ...out, skip: 'canal não conectado (CANAL_ID vazio)' };
  const P = await getJ('canal.json'), date = etDate();
  if (!P || P.date !== date) return { ...out, skip: `pauta de ${P?.date ?? '—'}, hoje é ${date}` };
  const h = hourBRnow(), now = Date.now();
  if (h < +(await cfg('CANAL_INICIO', '10'))) return { ...out, skip: `antes de ${await cfg('CANAL_INICIO', '10')}h` };
  if (!P.singles?.length && !P.multis?.length) {
    // pauta vazia: quase sempre é o leitor da 99play parado (sem linha da 99play não sai entrada). Avisa o dono uma vez por dia.
    if (!(await cfg('CANAL_AVISO_' + date))) {
      const [snap] = await sb('c99_snapshots?select=taken_at&order=taken_at.desc&limit=1').catch(() => []) ?? [];
      const age = snap ? (Date.now() - Date.parse(snap.taken_at)) / 36e5 : Infinity;
      const quando = snap ? new Date(snap.taken_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
      const own = await owner();
      if (own) await TG('sendMessage', { chat_id: own, parse_mode: 'HTML', text: age >= 2
        ? `📢 <b>Canal parado</b>: a pauta de hoje está vazia porque o leitor da 99play não lê desde <b>${quando}</b>.\nAbra a 99play no PC (com o Tampermonkey ligado) e deixe a aba aberta: na próxima atualização as entradas entram e o canal volta a postar sozinho.`
        : `📢 <b>Canal</b>: a pauta de hoje ainda está vazia (nenhuma entrada passou nos filtros). Assim que aparecer, o canal posta sozinho.` });
      await setCfg('CANAL_AVISO_' + date, '1');
    }
    return { ...out, skip: 'pauta vazia' };
  }
  const done: any[] = await sb(`channel_posts?date=eq.${date}&select=pkey,kind,band,legs`) ?? [];
  const keys = new Set(done.map(d => d.pkey)), bands = new Set(done.filter(d => d.kind === 'multipla').map(d => d.band));
  const pids = new Set(done.filter(d => d.kind === 'simples').flatMap(d => (d.legs ?? []).map((l: any) => l.pid)));
  const posted: string[] = [];
  // simples: espalha as que faltam pelas rodadas até o último jogo; a que está perto do jogo vai primeiro
  const max = +(await cfg('CANAL_MAX', '20')), nS = done.filter(d => d.kind === 'simples').length;
  const rest = (P.singles ?? []).filter((x: any) => !keys.has(x.key) && !pids.has(x.pid) && fresh(x, now));
  const need = Math.min(max - nS, rest.length);
  if (need > 0) {
    const deadline = Math.max(...rest.map((x: any) => Date.parse(x.tip) - LEAD));
    const runs = Math.max(1, Math.floor((deadline - now) / STEP));
    const urgent = rest.filter((x: any) => Date.parse(x.tip) - LEAD < now + STEP + 5 * 6e4);
    const k = Math.min(need, 4, Math.max(Math.ceil(need / runs), urgent.length));
    const order = [...urgent, ...rest.filter((x: any) => !urgent.includes(x))];
    for (const x of order.slice(0, k)) {
      const r = await post(x, 'simples', date, P.gen);
      posted.push(r.ok ? `simples ${x.name}` : `erro ${x.name}: ${r.description}`);
      await new Promise(ok => setTimeout(ok, 1500));
    }
  }
  // múltiplas: uma por faixa no dia, a partir do horário da faixa (ou antes, se o primeiro jogo estiver perto)
  for (const m of P.multis ?? []) {
    if (bands.has(m.band) || !fresh(m, now)) continue;
    const first = Math.min(...m.legs.map((l: any) => Date.parse(l.tip)));
    if (h < (SLOT[m.band] ?? 15) && first - now > 90 * 6e4) continue;
    const r = await post(m, 'multipla', date, P.gen);
    posted.push(r.ok ? `múltipla ${m.band} @${m.odd}` : `erro múltipla ${m.band}: ${r.description}`);
    await new Promise(ok => setTimeout(ok, 1500));
  }
  return { ...out, date, simples_postadas_hoje: nS + posted.filter(p => p.startsWith('simples')).length, faltam: Math.max(0, need - posted.length), posted };
}

// ---------- trocar o link (e a imagem) pelo bilhete pronto; trocar a casa do post ----------
async function rowBy(msg: string | null, id: string | null, ch: string | null = null) {
  const q = id ? `id=eq.${encodeURIComponent(id)}` : ch ? `channel_msg_id=eq.${encodeURIComponent(ch)}` : `owner_msg_id=eq.${encodeURIComponent(msg ?? '')}`;
  return ((await sb(`channel_posts?${q}&select=*`)) ?? [])[0];
}
async function relink(msg: string | null, id: string | null, code: string, photo: string | null, ch: string | null = null) {
  const row = await rowBy(msg, id, ch); if (!row) return { ok: false, erro: 'post não encontrado' };
  return repaint(row, casaOf(row.casa), code, photo);
}
async function setCasa(id: string, c: string) {
  const row = await rowBy(null, id); if (!row) return { ok: false, erro: 'post não encontrado' };
  return repaint(row, casaOf(c), row.share_code ?? null, null);
}

// ---------- conferir: green/red respondendo o próprio post; resumo do dia só para o dono ----------
async function settle() {
  const open: any[] = await sb('channel_posts?status=eq.postada&select=id,date,kind,legs,odd,band,channel_msg_id') ?? [];
  if (!open.length) return 0;
  const res = await getJ('results.json'); if (!res?.stats) return 0;
  const done = (date: string, team: string) => !!res.games?.[date]?.some((g: any[]) => g[1] === team || g[2] === team);
  const chat = await cfg('CANAL_ID'), say = (await cfg('CANAL_RESULTADO', '1')) !== '0';
  let n = 0; const dates = new Set<string>();
  for (const p of open) {
    const legs = p.legs ?? [];
    if (!res.dates?.includes(p.date) || legs.some((l: any) => !done(p.date, l.team))) continue;
    const st = legs.map((l: any) => {
      const a = res.stats[p.date]?.[l.pid]; if (!a || !(a[0] > 0)) return 'void';
      const v = String(l.stat).split('+').reduce((s: number, k: string) => s + (IDX[k]?.(a) ?? 0), 0);
      return v === +l.line ? 'void' : (l.side === 'o' ? v > +l.line : v < +l.line) ? 'green' : 'red';
    });
    const live = legs.filter((_: any, i: number) => st[i] !== 'void');
    const status = st.includes('red') ? 'red' : !live.length ? 'void' : 'green';
    const odd = live.reduce((o: number, l: any) => o * +l.odd, 1);
    const profit = status === 'green' ? Math.round((odd - 1) * 100) / 100 : status === 'red' ? -1 : 0;
    await sb(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ status, profit, settled_at: new Date().toISOString() }) });
    if (say && chat && p.channel_msg_id) {
      const text = status === 'green' ? `✅ <b>GREEN</b>${live.length < legs.length ? ` <i>(perna anulada; odd ${n2(odd)})</i>` : ''}` : status === 'red' ? '❌ <b>RED</b>' : '↩️ <b>Anulada</b> <i>(jogador não entrou)</i>';
      await TG('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', reply_parameters: { message_id: p.channel_msg_id, allow_sending_without_reply: true }, disable_notification: true });
    }
    dates.add(p.date); n++;
  }
  for (const d of dates) await dayReport(d).catch(e => console.error('resumo', e));
  return n;
}
async function dayReport(date: string) {
  const all: any[] = await sb(`channel_posts?date=eq.${date}&select=kind,status,profit,odd,band`) ?? [];
  if (!all.length || all.some(p => p.status === 'postada') || (await cfg('CANAL_RESUMO_' + date))) return;
  const own = await owner(); if (!own) return;
  const part = (k: string) => { const xs = all.filter(p => p.kind === k), g = xs.filter(p => p.status === 'green').length, r = xs.filter(p => p.status === 'red').length;
    const u = xs.reduce((s, p) => s + (+p.profit || 0), 0); return { n: xs.length, g, r, u }; };
  const S = part('simples'), M = part('multipla'), U = S.u + M.u;
  const u = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',') + 'u';
  const [, mm, dd] = date.split('-');
  await TG('sendMessage', { chat_id: own, parse_mode: 'HTML', text: `📊 <b>Canal · ${dd}/${mm}</b>\n<blockquote>Simples: ${S.g} ✅ · ${S.r} ❌ de ${S.n} · <b>${u(S.u)}</b>\nMúltiplas: ${M.g} ✅ · ${M.r} ❌ de ${M.n} · <b>${u(M.u)}</b>\nDia: <b>${u(U)}</b> (1u por entrada)</blockquote>` });
  await setCfg('CANAL_RESUMO_' + date, '1');
}

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  try {
    const secret = await cfg('WEBHOOK_SECRET');
    const ok = (k: string) => !!secret && u.searchParams.get(k) === secret;
    if (ok('run')) return json(await run());
    if (ok('relink')) return json(await relink(u.searchParams.get('msg'), u.searchParams.get('id'), u.searchParams.get('code') ?? '', u.searchParams.get('photo'), u.searchParams.get('ch')));
    if (ok('casa')) return json(await setCasa(u.searchParams.get('id') ?? '', u.searchParams.get('c') ?? '99'));
    if (ok('abertos')) { // posts de hoje (e de ontem à noite) ainda sem bilhete pronto, para o bot perguntar de qual é o link
      const d = etDate(), y = new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
      return json(await sb(`channel_posts?date=in.(${d},${y})&share_code=is.null&status=eq.postada&select=id,kind,band,odd,legs,casa&order=id.desc&limit=8`) ?? []);
    }
    if (ok('preview')) {
      const P = await getJ('canal.json'); const own = await owner();
      if (!P || !own) return json({ ok: false, erro: 'sem pauta ou sem dono' });
      const s = P.singles?.[0], m = P.multis?.[0]; const pc = u.searchParams.get('c'); if (pc && CASAS[pc]) { await cfg('x'); CFG!['CANAL_CASA'] = pc; }
      return json({ ok: true, simples: s ? (await post(s, 'simples', P.date, P.gen, own)).ok : null, multipla: m ? (await post(m, 'multipla', P.date, P.gen, own)).ok : null, pauta: { date: P.date, simples: P.singles?.length, multiplas: P.multis?.map((x: any) => x.band + '@' + x.odd) } });
    }
    return json({ ok: true });
  } catch (e) { return json({ ok: false, erro: String((e as Error).message) }, 500); }
});
