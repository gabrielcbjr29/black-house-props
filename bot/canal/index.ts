// Hub de canais do Telegram (15–16/11): posta sozinho a pauta do dia (public/data/canal.json, gerada no pipeline por
// scripts/canal.mjs) em cada canal conectado, no padrão do usuário: card + "🏀 NBA 🏀 / 💰 1 unidade / Sequência / link".
// Cada canal tem dono e configuração próprios (tabela canais, editada pelo /canais no bot): simples por dia, odd mín/máx,
// EV mínimo, mercados, lado, múltiplas (odd alvo, pernas, lado), casa (99play/BR365), links de afiliado do dono, horário.
// A divisão das entradas entre os canais (rodízio sem prioridade, no máximo 30% de repetidas) é feita no pipeline; aqui
// há uma trava a mais na hora de postar.
//   ?run=<WEBHOOK_SECRET>      (pg_cron, a cada 15 min) posta as próximas entradas de cada canal e confere as já postadas
//   ?relink=<WEBHOOK_SECRET>&(cid=<chat do canal>&ch=<msg no canal> | id=<post> | msg=<aviso>)&code=<shareCode>[&photo=]
//                              troca o link do post pelo bilhete pronto (e a imagem pelo print, se vier)
//   ?casa=<WEBHOOK_SECRET>&id=<post>&c=99|365   troca a casa do post (link e card)
//   ?abertos=<WEBHOOK_SECRET>&canal=<id>        posts recentes sem bilhete pronto daquele canal
//   ?preview=<WEBHOOK_SECRET>[&canal=<id>&c=]   manda a próxima simples e múltipla do canal só para o dono, como prévia
//   ?hub=1                     (público, sem dados sensíveis) configurações de divisão e o que já saiu hoje, para o pipeline
// Postagem: a partir do horário do canal (padrão 10h de Brasília), espaçada até 40 min antes de cada jogo; múltiplas a
// partir do horário de cada uma (ou antes, se o primeiro jogo estiver perto). Odd velha (leitor parado há 2h+) não sai.
// bot_config: CANAL_ON (0 pausa todos os canais), DOM_99 / DOM_365 (domínio das casas), AFF_REF / AFF_REF_365 (refs do
// administrador, usados no canal dele quando o canal não tem ref próprio).
//   ?resultados=<canal>&t=<token>[&fmt=csv][&dias=N]  (painel e planilha do canal) entradas com resultado e fechamento/CLV;
//                              token por canal (o dono vê os links em /canais → canal → 📊 Resultados)
import { updateClosing, postClv, legVerdict } from '../../public/clv.js';
const APP = 'https://gabrielcbjr29.github.io/black-house-props/data/';
const MK2STAT: Record<string, string> = { PTS: 'pts', REB: 'reb', AST: 'ast', '3PM': 'tpm', PRA: 'pts+reb+ast', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'fgm', FGA: 'fga', '2PM': 'twom', '2PA': 'twoa', '3PA': 'tpa', FTM: 'ftm', FTA: 'fta', STL: 'stl', BLK: 'blk', SB: 'stl+blk', TOV: 'tov', PF: 'pf' };
const IDX: Record<string, (a: number[]) => number> = { pf: a => a[7], pts: a => a[1], reb: a => a[2], ast: a => a[3], stl: a => a[4], blk: a => a[5], tov: a => a[6], fgm: a => a[8], fga: a => a[9], tpm: a => a[10], tpa: a => a[11], ftm: a => a[12], fta: a => a[13], twoa: a => a[9] - a[11], twom: a => a[8] - a[10] };
const MKS: Record<string, string> = { PTS: 'pontos', REB: 'rebotes', AST: 'assist.', '3PM': 'de 3 conv.', PRA: 'PRA', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'arr. conv.', FGA: 'arr. tentados', '2PM': 'de 2 conv.', '2PA': 'de 2 tentados', '3PA': 'de 3 tentadas', FTM: 'LL conv.', FTA: 'LL tentados', STL: 'roubos', BLK: 'tocos', SB: 'roub+tocos', TOV: 'erros', PF: 'faltas' };
// horário (Brasília) a partir do qual cada múltipla sai: under 12h/15h/17h, over uma hora depois
const SLOT: Record<string, number> = { '10': 12, '15': 15, '25': 17 };
const slotOf = (m: any) => +m.slot || (SLOT[parseInt(m.band)] ?? 15) + (/over/.test(m.band) ? 1 : 0);
const bandKey = (b: string) => /-/.test(b) ? b : `${b}-under`; // posts antigos (antes de 16/11 15h) eram só under
const LEAD = 40 * 6e4, STEP = 15 * 6e4, STALE = 2 * 36e5;

const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 160));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
// configuração em cache por 30 s; a promessa é compartilhada para chamadas simultâneas não lerem um cache vazio
let CFGP: Promise<Record<string, string>> | null = null, CFG_AT = 0;
async function cfg(k: string, def = ''): Promise<string> {
  if (!CFGP || Date.now() - CFG_AT > 30_000) {
    CFG_AT = Date.now();
    CFGP = sb('bot_config?select=key,value').then((rows: any[]) => Object.fromEntries((rows ?? []).map(x => [x.key, x.value]))).catch(e => { CFGP = null; throw e; });
  }
  const v = (await CFGP)[k]; return v == null || v === '' ? def : v;
}
const setCfg = (key: string, value: string) => (CFGP = null, sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) }));
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
const admin = async () => (await cfg('ALLOWED_CHATS')).split(',')[0]?.trim() ?? '';
// ---------- canais ----------
const DEF = { max: 20, inicio: 10, casa: '99', botoes: true, resultado: true, un: '1 unidade', unMulti: '', rodape: '🔞 18+ · Aposte com responsabilidade', on: true };
type Canal = { id: number; chat_id: number; title: string; owner: number; ativo: boolean; cfg: any };
let CANP: Promise<Canal[]> | null = null, CAN_AT = 0;
const canais = async (): Promise<Canal[]> => {
  if (!CANP || Date.now() - CAN_AT > 30_000) { CAN_AT = Date.now(); CANP = sb('canais?ativo=eq.true&select=*&order=id').then((r: any[]) => (r ?? []).map(c => ({ ...c, cfg: { ...DEF, ...(c.cfg ?? {}) } }))).catch(e => { CANP = null; throw e; }); }
  return CANP;
};
const canalById = async (id: number | string | null) => (await canais()).find(c => String(c.id) === String(id)) ?? (await canais())[0];
const owner = async (k?: Canal) => String(k?.owner ?? '') || await admin();

// ---------- legenda ----------
// duas casas com o mesmo shareCode e o mesmo id de evento (plataforma Altenar); só muda o domínio e o ref de afiliado
const CASAS: Record<string, { nome: string; base: string; refKey: string; ref: string }> = {
  '99': { nome: '99play', base: 'https://99play.im', refKey: 'AFF_REF', ref: 'rca5p' },
  '365': { nome: 'BR365', base: 'https://br365.io', refKey: 'AFF_REF_365', ref: 'nac6j' },
};
// domínio de cada casa em bot_config (DOM_99 / DOM_365): quando a casa trocar de domínio, muda lá sem mexer no código
const baseOf = async (c: string) => (await cfg(c === '365' ? 'DOM_365' : 'DOM_99', CASAS[c].base)).replace(/\/+$/, '') + '/sports';
const casaOf = (c?: string | null) => CASAS[c ?? ''] ? c! : '99';
// ref de afiliado do dono do canal; o canal do administrador usa AFF_REF / AFF_REF_365 se não tiver um próprio
const refOf = async (c: string, k?: Canal) => {
  const own = k?.cfg?.[c === '365' ? 'ref365' : 'ref99'];
  if (own) return encodeURIComponent(own);
  return !k || String(k.owner) === await admin() ? encodeURIComponent(await cfg(CASAS[c].refKey, CASAS[c].ref)) : '';
};
const legsOf = (x: any) => x.legs ?? [x];
// link do jogo SEM o ref (com o ref o evento não abre, avisou o usuário em 16/11); o ref vai só no link do bilhete pronto
const evLink = async (ev: number | null, c = '99') => `${await baseOf(c)}${ev ? `#/event/${ev}` : ''}`;
const shareLink = async (code: string, c = '99', k?: Canal) => { const r = await refOf(c, k); return `${await baseOf(c)}?${r ? `ref=${r}&` : ''}shareCode=${encodeURIComponent(code)}`; };
const gamesOf = (x: any) => { const g = new Map<string, any>(); for (const l of legsOf(x)) if (!g.has(l.game)) g.set(l.game, l); return [...g.values()]; };
async function linkHTML(x: any, code?: string | null, c = '99', k?: Canal) {
  if (code) return `🎟️ <a href="${await shareLink(code, c, k)}">Clique aqui para pegar o bilhete pronto.</a>`;
  const games = gamesOf(x);
  if (games.length <= 1) return `🎟️ <a href="${await evLink(legsOf(x)[0].ev, c)}">Clique aqui para abrir o jogo na ${CASAS[c].nome}.</a>`;
  const parts = await Promise.all(games.map(async l => `<a href="${await evLink(l.ev, c)}">${l.home} x ${l.away}</a>`));
  return `🎟️ Abrir os jogos na ${CASAS[c].nome}: ${parts.join(' · ')}`;
}
// ---------- unidade (fixa ou variável pela força da entrada) ----------
// variável (só simples): EV 10%+ com chance 60%+ → 2x a base; EV 6%+ → 1,5x; o resto → 1x. Múltiplas: sempre a base.
const varUn = (k: Canal) => !!k.cfg.unVar || (+k.cfg.unBase || 1) !== 1;
function stakeOf(x: any, kind: string, k: Canal) {
  const base = +k.cfg.unBase || 1;
  if (+x.un > 0) return base * +x.un; // Método Alavanca: a pauta já diz a unidade (1, 1,5 ou 0,5 nas combinadas)
  if (kind !== 'simples' || !k.cfg.unVar) return base;
  const e = +x.edge || 0, p = +x.p || 0;
  return base * (e >= .10 && p >= .60 ? 2 : e >= .06 ? 1.5 : 1);
}
const unText = (st: number) => st === 1 ? '1 unidade' : `${String(Math.round(st * 100) / 100).replace('.', ',')} unidades`;
function fill(cap: string, kind: string, link: string, k: Canal, st = 1) {
  const un = varUn(k) ? unText(st) : (kind === 'multipla' && k.cfg.unMulti) || k.cfg.un || '1 unidade', rod = k.cfg.rodape ?? '';
  return cap.replace('{UN}', esc(un)).replace('{LINK}', link) + (!rod || rod === '0' ? '' : `\n\n<i>${esc(rod)}</i>`);
}
const resumo = (x: any) => legsOf(x).map((l: any) => `${esc(l.name)} · ${MKS[l.mk] ?? l.mk} ${l.side === 'o' ? 'mais' : 'menos'} ${n1(l.line)} @${n2(l.odd)}`).join('\n');
// ---------- padrão de mensagem do canal (pedido de 16/11) ----------
// O dono manda ao bot um post no padrão do canal (texto ou legenda, com os emojis personalizados). Guardamos o texto e as
// "entities" do Telegram (negrito, citação, link, emoji personalizado...). Na hora de postar: a sequência do post de
// exemplo (ou {SEQUENCIA}) vira a sequência da entrada, todo link vira o link da entrada, {LINK} vira o texto do link,
// {ODD} e {JOGADOR} viram a odd e o(s) jogador(es). Offsets em UTF-16, como o Telegram (e o JavaScript) contam.
type Ent = { type: string; offset: number; length: number; url?: string; custom_emoji_id?: string; language?: string };
const SEQ_RE = /\d{1,2}(?:\s*-\s*\d{1,2}){4,}/;
function tplApply(tpl: { text: string; entities?: Ent[] }, v: { seq: string; url: string; linkText: string; odd: string; names: string; un?: string }) {
  let text = tpl.text ?? '', ents: Ent[] = (tpl.entities ?? []).map(e => ({ ...e }));
  const repl = (start: number, end: number, str: string, add?: Ent) => {
    const d = str.length - (end - start);
    text = text.slice(0, start) + str + text.slice(end);
    ents = ents.flatMap(e => {
      const eEnd = e.offset + e.length;
      if (eEnd <= start) return [e];                                   // antes
      if (e.offset >= end) return [{ ...e, offset: e.offset + d }];     // depois
      if (e.offset <= start && eEnd >= end) return [{ ...e, length: e.length + d }]; // contém (ex.: citação com a sequência)
      if (e.offset >= start && eEnd <= end) return e.type === 'custom_emoji' ? [] : [{ ...e, offset: start, length: str.length }]; // dentro
      return [{ ...e, offset: Math.min(e.offset, start), length: Math.max(1, eEnd + d - Math.min(e.offset, start)) }];
    });
    if (add) ents.push({ ...add, offset: start, length: str.length });
  };
  const sub = (re: RegExp, str: string, add?: Ent) => { const m = re.exec(text); if (!m) return false; repl(m.index, m.index + m[0].length, str, add); return true; };
  if (!sub(/\{SEQU[EÊ]NCIA\}|\{SEQ\}/i, v.seq || '—')) sub(SEQ_RE, v.seq || '—'); // nunca deixa a sequência do post de exemplo
  while (sub(/\{ODD\}/i, v.odd)); while (sub(/\{JOGADORE?S?\}/i, v.names));
  if (v.un && !sub(/\{UNIDADES?\}/i, v.un)) sub(/\d+(?:[.,]\d+)?\s*unidades?/i, v.un); // unidade variável
  let linked = false;
  for (const e of ents) if (e.type === 'text_link') { e.url = v.url; linked = true; }
  if (sub(/\{LINK\}/i, v.linkText, { type: 'text_link', offset: 0, length: 0, url: v.url })) linked = true;
  if (!linked) { const start = text.length + 2; text += '\n\n' + v.linkText; ents.push({ type: 'text_link', offset: start, length: v.linkText.length, url: v.url }); }
  return { text, entities: ents.filter(e => e.length > 0 && e.offset >= 0 && e.offset + e.length <= text.length) };
}
async function tplCaption(x: any, kind: string, code: string | null, c: string, k: Canal, st = 1) {
  const legs = legsOf(x), seqs = legs.filter((l: any) => l.sq?.length);
  const seq = legs.length === 1 ? (seqs[0]?.sq ?? []).slice(0, 10).join('-') : seqs.map((l: any) => `${l.name}: ${l.sq.slice(0, 10).join('-')}`).join('\n');
  const url = code ? await shareLink(code, c, k) : await evLink(legs[0].ev, c);
  return tplApply(k.cfg.tpl, { seq, url, linkText: code ? 'Clique aqui para pegar o bilhete pronto.' : `Clique aqui para abrir o jogo na ${CASAS[c].nome}.`,
    odd: n2(+x.odd), names: legs.map((l: any) => l.name).join(', '), un: varUn(k) ? unText(st) : undefined });
}
// manda com as entities; se o Telegram recusar os emojis personalizados (bot sem permissão no canal), manda sem eles
async function tgCaption(method: string, body: any, capKey: 'caption' | 'media' = 'caption') {
  let r = await TG(method, body);
  if (!r.ok && /emoji/i.test(r.description ?? '')) {
    const strip = (o: any) => ({ ...o, caption_entities: (o.caption_entities ?? []).filter((e: Ent) => e.type !== 'custom_emoji') });
    r = await TG(method, capKey === 'media' ? { ...body, media: strip(body.media) } : strip(body));
    if (r.ok) r.semEmoji = true;
  }
  return r;
}
const minLegs = (x: any) => legsOf(x).map((l: any) => ({ pid: l.pid, name: l.name, team: l.team, opp: l.opp, home: l.home, away: l.away, game: l.game, ev: l.ev,
  mk: l.mk, stat: MK2STAT[l.mk], side: l.side, line: l.line, odd: l.odd, tip: l.tip, sq: l.sq ?? null,
  ...(l.met ? { met: l.met, pk: l.pk, evk: l.evk, pm: l.p, evm: l.edge } : {}) })); // Método Alavanca: chance da Kalshi e do modelo na hora do post
const img365 = (img: string) => img.replace(/^canal\//, 'canal/365/');
// botões embaixo do post no canal (controles no canal, não no privado do bot). Só o dono do canal consegue usar;
// botoes=false na configuração do canal tira (ex.: num canal público).
function chKb(id: number, c: string, k: Canal) {
  if (k.cfg.botoes === false) return undefined;
  return { inline_keyboard: [Object.keys(CASAS).map(h => ({ text: `${h === c ? '✅ ' : ''}${CASAS[h].nome}`, callback_data: `/cs ${id} ${h}` }))] };
}

// ---------- postar ----------
async function post(x: any, kind: 'simples' | 'multipla', date: string, gen: string, k: Canal, to?: string, casa?: string) {
  const chat = to ?? String(k.chat_id), c = casaOf(casa ?? k.cfg.casa), st = stakeOf(x, kind, k);
  const photo = APP + (c === '365' ? (x.img365 ?? img365(x.img)) : x.img) + '?v=' + encodeURIComponent(gen ?? Date.now());
  let r: any;
  if (k.cfg.tpl?.text) { // padrão de mensagem do canal (com emojis personalizados)
    const t = await tplCaption(x, kind, null, c, k, st), pre = to ? `[PRÉVIA · ${k.title ?? ''}]\n` : '';
    r = await tgCaption('sendPhoto', { chat_id: chat, photo, caption: pre + t.text, caption_entities: t.entities.map(e => ({ ...e, offset: e.offset + pre.length })) });
  } else {
    const caption = fill(x.cap, kind, await linkHTML(x, null, c, k), k, st);
    r = await TG('sendPhoto', { chat_id: chat, photo, caption: to ? `[PRÉVIA · ${esc(k.title ?? '')}] ` + caption : caption, parse_mode: 'HTML' });
  }
  if (!r.ok || to) return r;
  const fid = r.result?.photo?.at?.(-1)?.file_id;
  const [row] = await sb('channel_posts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    canal_id: k.id, date, kind, legs: minLegs(x), odd: x.odd, band: x.band ?? null, status: 'postada', link: await linkHTML(x, null, c, k), channel_msg_id: r.result.message_id,
    owner_chat: k.owner ?? null, pkey: x.key, cap: x.cap, img: x.img, casa: c, fids: fid ? { [c]: fid } : {}, stake: st, posted_at: new Date().toISOString() }) });
  const kb = chKb(row.id, c, k);
  if (kb) await TG('editMessageReplyMarkup', { chat_id: chat, message_id: r.result.message_id, reply_markup: kb });
  if (k.cfg.espelho && k.cfg.espelhoModo === 'na_hora') await mirror(row, k);
  return r;
}
// troca a imagem e a legenda de um post já publicado (casa nova, bilhete pronto ou print do dono)
async function repaint(row: any, c: string, code: string | null, photo: string | null) {
  const k = await canalById(row.canal_id), chat = String(k.chat_id);
  const st = +row.stake || 1;
  const T = k.cfg.tpl?.text ? await tplCaption({ legs: row.legs, odd: row.odd }, row.kind, code, c, k, st) : null;
  const capFields = T ? { caption: T.text, caption_entities: T.entities } : { caption: fill(row.cap, row.kind, await linkHTML({ legs: row.legs }, code, c, k), k, st), parse_mode: 'HTML' };
  const fids = { ...(row.fids ?? {}) };
  const media = photo ?? fids.print ?? fids[c] ?? (APP + (c === '365' ? img365(row.img) : row.img) + '?v=' + Date.now());
  const kb = chKb(row.id, c, k);
  let r = await tgCaption('editMessageMedia', { chat_id: chat, message_id: row.channel_msg_id, media: { type: 'photo', media, ...capFields }, ...(kb ? { reply_markup: kb } : {}) }, 'media');
  if (!r.ok && /not modified/i.test(r.description ?? '')) r = { ok: true };
  if (!r.ok) { // imagem antiga já saiu da pauta: troca só a legenda
    r = await tgCaption('editMessageCaption', { chat_id: chat, message_id: row.channel_msg_id, ...capFields, ...(kb ? { reply_markup: kb } : {}) });
    if (!r.ok && /not modified/i.test(r.description ?? '')) r = { ok: true };
  } else if (r.result?.photo) { const f = r.result.photo.at(-1).file_id; if (photo) fids.print = f; else if (!fids.print) fids[c] = f; }
  if (!r.ok) return { ok: false, erro: r.description };
  await sb(`channel_posts?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ casa: c, fids, ...(code ? { share_code: code, link: await shareLink(code, c, k) } : {}) }) });
  // canal oficial (espelho): copia quando o bilhete pronto é ligado; se já tinha copiado, atualiza a cópia
  let espelho = false;
  if (k.cfg.espelho) {
    if (row.espelho_msg) {
      const m2 = await tgCaption('editMessageMedia', { chat_id: row.espelho_chat, message_id: row.espelho_msg, media: { type: 'photo', media: photo ?? fids.print ?? fids[c] ?? media, ...capFields } }, 'media');
      if (!m2.ok && !/not modified/i.test(m2.description ?? '')) await tgCaption('editMessageCaption', { chat_id: row.espelho_chat, message_id: row.espelho_msg, ...capFields });
      espelho = true;
    } else if (code || k.cfg.espelhoModo === 'na_hora') espelho = await mirror({ ...row, share_code: code ?? row.share_code }, k);
  }
  return { ok: true, id: row.id, casa: CASAS[c].nome, imagem: !!photo, espelho };
}
// copia o post (sem os botões de controle) para o canal oficial ligado a este canal
async function mirror(row: any, k: Canal) {
  const t = (await canais()).find(x => String(x.id) === String(k.cfg.espelho)); if (!t) return false;
  const r = await TG('copyMessage', { chat_id: t.chat_id, from_chat_id: k.chat_id, message_id: row.channel_msg_id, reply_markup: { inline_keyboard: [] } });
  if (!r.ok) { await postFail(t, etDate(), r.description); return false; }
  await sb(`channel_posts?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ espelho_chat: t.chat_id, espelho_msg: r.result.message_id }) });
  return true;
}
const fresh = (x: any, now: number) => legsOf(x).every((l: any) => Date.parse(l.tip) > now + LEAD && (!l.t9 || now - Date.parse(l.t9) < STALE));

const identOf = (l: any) => `${l.pid}-${l.mk}`;
async function run() {
  const out: Record<string, unknown> = {};
  out.conferidas = await settle().catch(e => ({ erro: String(e) }));
  out.fechamento = await closing().catch(e => ({ erro: String(e) }));
  if ((await cfg('CANAL_ON', '1')) === '0') return { ...out, skip: 'canais pausados (CANAL_ON=0)' };
  const ks = (await canais()).filter(k => k.cfg.on !== false && k.cfg.modo !== 'espelho');
  out.semanal = await weekly(ks).catch(e => ({ erro: String(e) }));
  if (!ks.length) return { ...out, skip: 'nenhum canal conectado' };
  const P = await getJ('canal.json'), date = etDate();
  if (!P || P.date !== date) return { ...out, skip: `pauta de ${P?.date ?? '—'}, hoje é ${date}` };
  const h = hourBRnow(), now = Date.now();
  const doneAll: any[] = await sb(`channel_posts?date=eq.${date}&select=canal_id,pkey,kind,band,legs`) ?? [];
  const turn = Math.floor(now / STEP); // a ordem dos canais gira a cada rodada: nenhum canal posta sempre primeiro
  const order = ks.map((_, i) => ks[(i + turn) % ks.length]);
  const res: Record<string, unknown> = {};
  for (const k of order) {
    const pauta = P.v === 2 ? P.canais?.[k.id] : (k.id === ks[0].id ? P : null); // pauta antiga (um canal só)
    if (h < +(k.cfg.inicio ?? 10)) { res[k.title ?? k.id] = `antes de ${k.cfg.inicio}h`; continue; }
    if (!pauta?.singles?.length && !pauta?.multis?.length) { await emptyWarn(k, date); res[k.title ?? k.id] = 'pauta vazia'; continue; }
    const done = doneAll.filter(d => d.canal_id === k.id);
    const keys = new Set(done.map(d => d.pkey)), bands = new Set(done.filter(d => d.kind === 'multipla').map(d => bandKey(d.band)));
    const pids = new Set(done.filter(d => d.kind === 'simples').flatMap(d => (d.legs ?? []).map((l: any) => l.pid)));
    // trava dos 30%: simples "repetidas" (jogador + mercado já postado em outro canal hoje)
    const others = new Set(doneAll.filter(d => d.canal_id !== k.id && d.kind === 'simples').flatMap(d => (d.legs ?? []).map(identOf)));
    const max = +k.cfg.max || 20, cap = Math.floor(max * .3);
    let shared = done.filter(d => d.kind === 'simples' && (d.legs ?? []).some((l: any) => others.has(identOf(l)))).length;
    const posted: string[] = [];
    const nS = done.filter(d => d.kind === 'simples').length;
    const rest = (pauta.singles ?? []).filter((x: any) => !keys.has(x.key) && !pids.has(x.pid) && fresh(x, now) && (!others.has(identOf(x)) || shared < cap));
    const need = Math.min(max - nS, rest.length);
    if (need > 0) {
      const deadline = Math.max(...rest.map((x: any) => Date.parse(x.tip) - LEAD));
      const runs = Math.max(1, Math.floor((deadline - now) / STEP));
      const urgent = rest.filter((x: any) => Date.parse(x.tip) - LEAD < now + STEP + 5 * 6e4);
      const n = Math.min(need, 4, Math.max(Math.ceil(need / runs), urgent.length));
      const queue = [...urgent, ...rest.filter((x: any) => !urgent.includes(x))];
      for (const x of queue) {
        if (posted.length >= n) break;
        const rep = others.has(identOf(x)); if (rep && shared >= cap) continue;
        const r = await post(x, 'simples', date, P.gen, k);
        posted.push(r.ok ? `simples ${x.name}` : `erro ${x.name}: ${r.description}`);
        if (!r.ok && await postFail(k, date, r.description)) break;
        if (r.ok) { if (rep) shared++; doneAll.push({ canal_id: k.id, kind: 'simples', pkey: x.key, legs: [{ pid: x.pid, mk: x.mk, side: x.side }] }); }
        await new Promise(ok => setTimeout(ok, 1200));
      }
    }
    for (const m of pauta.multis ?? []) {
      if (bands.has(bandKey(m.band)) || !fresh(m, now)) continue;
      const first = Math.min(...m.legs.map((l: any) => Date.parse(l.tip)));
      if (h < slotOf(m) && first - now > 90 * 6e4) continue;
      const r = await post(m, 'multipla', date, P.gen, k);
      posted.push(r.ok ? `múltipla ${m.band} @${m.odd}` : `erro múltipla ${m.band}: ${r.description}`);
      if (!r.ok && await postFail(k, date, r.description)) break;
      await new Promise(ok => setTimeout(ok, 1200));
    }
    res[k.title ?? k.id] = { simples_hoje: nS + posted.filter(p => p.startsWith('simples')).length, repetidas: shared, posted };
  }
  return { ...out, date, canais: res };
}
// ---------- fechamento (CLV): a odd/linha da 99play em cada perna, regravada a cada rodada até o jogo começar ----------
async function closing() {
  const open: any[] = await sb('channel_posts?status=eq.postada&select=id,legs') ?? [];
  const now = Date.now(), live = open.filter(p => (p.legs ?? []).some((l: any) => Date.parse(l.tip) > now));
  if (!live.length) return 0;
  const L = await getJ('linhas99.json'); if (!L?.l) return 0;
  let n = 0;
  for (const p of live) {
    const r = updateClosing(p.legs, L.l, { now, gen: L.gen });
    if (r.changed) { await sb(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ legs: r.legs }) }); n++; }
  }
  return n;
}
// ---------- resultados do canal para o painel e a planilha (token próprio de cada canal) ----------
async function tokOf(id: number | string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${await cfg('WEBHOOK_SECRET')}:resultados:${id}`));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function resultados(cid: string, dias: number) {
  const k = (await canais()).find(c => String(c.id) === String(cid)); if (!k) return null;
  const from = new Date(Date.parse(etDate() + 'T12:00:00Z') - (dias - 1) * 864e5).toISOString().slice(0, 10);
  const rows: any[] = await sb(`channel_posts?canal_id=eq.${k.id}&date=gte.${from}&select=id,date,created_at,kind,band,odd,stake,status,profit,legs&order=id.asc`) ?? [];
  const res = await getJ('results.json').catch(() => null);
  const real = (date: string, l: any) => { const a = res?.stats?.[date]?.[l.pid]; if (!a || !(a[0] > 0)) return null; return String(l.stat).split('+').reduce((s: number, x: string) => s + (IDX[x]?.(a) ?? 0), 0); };
  return { canal: k.title, de: from, ate: etDate(), gen: new Date().toISOString(), posts: rows.map(p => ({
    id: p.id, date: p.date, hora: hourBR(p.created_at), kind: p.kind, band: p.band, odd: +p.odd, stake: +p.stake || 1, status: p.status, profit: +p.profit || 0,
    clv: (({ vs, ...c }) => c)(postClv({ odd: +p.odd, legs: p.legs })),
    legs: (p.legs ?? []).map((l: any) => ({ name: l.name, team: l.team, opp: l.opp, mk: l.mk, side: l.side, line: +l.line, odd: +l.odd, tip: l.tip, cline: l.cline ?? null, close: l.close ?? null, real: real(p.date, l), v: legVerdict(l).v })),
  })) };
}
const MKL: Record<string, string> = { PTS: 'Pontos', REB: 'Rebotes', AST: 'Assistências', '3PM': 'Bolas de 3 convertidas', PRA: 'Pts+Reb+Ast', PR: 'Pts+Reb', PA: 'Pts+Ast', RA: 'Reb+Ast', FGM: 'Arremessos convertidos', FGA: 'Arremessos tentados', '2PM': 'Arremessos de 2 convertidos', '2PA': 'Arremessos de 2 tentados', '3PA': 'Bolas de 3 tentadas', FTM: 'Lances livres convertidos', FTA: 'Lances livres tentados', STL: 'Roubos', BLK: 'Tocos', SB: 'Roubos+Tocos', TOV: 'Erros', PF: 'Faltas' };
function toCSV(R: any) {
  const q = (x: unknown) => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['Data', 'Hora', 'Tipo', 'Faixa', 'Entrada', 'Mercado', 'Lado', 'Linha', 'Odd', 'Linha fechamento', 'Odd fechamento', 'CLV %', 'Bateu o fechamento', 'Resultado real', 'Resultado', 'Stake', 'Lucro (un)'];
  const out = [head.join(',')];
  for (const p of R.posts) {
    const s = p.kind === 'simples', l = p.legs[0] ?? {};
    const entrada = p.legs.map((x: any) => `${x.name} ${MKL[x.mk] ?? x.mk} ${x.side === 'o' ? 'mais' : 'menos'} ${x.line} @${x.odd}`).join(' | ');
    out.push([p.date, p.hora, s ? 'Simples' : 'Múltipla', p.band ?? '', entrada, s ? (MKL[l.mk] ?? l.mk) : `${p.legs.length} pernas`, s ? (l.side === 'o' ? 'Mais' : 'Menos') : '', s ? l.line : '', p.odd,
      s ? (l.cline ?? '') : '', p.clv.closeOdd ?? (s ? '' : `${p.clv.f} a favor / ${p.clv.c} contra`), p.clv.clv == null ? '' : Math.round(p.clv.clv * 1000) / 10,
      p.clv.bateu == null ? '' : p.clv.bateu ? 'Sim' : 'Não', s ? (l.real ?? '') : p.legs.map((x: any) => x.real ?? '-').join(' | '),
      { green: 'Green', red: 'Red', void: 'Anulada', postada: 'Aberta' }[p.status as string] ?? p.status, p.stake, p.status === 'postada' ? '' : p.profit].map(q).join(','));
  }
  return out.join('\n') + '\n';
}

// o Telegram recusou o post por permissão (bot tirado do canal, sem "postar mensagens"...): avisa o dono 1x por dia
async function postFail(k: Canal, date: string, desc = '') {
  if (!/rights|forbidden|not found|kicked|not a member|administrator|CHAT_WRITE|have no/i.test(desc)) return false;
  const key = `CANAL_ERRO_${k.id}_${date}`;
  if (!(await cfg(key))) {
    const own = await owner(k);
    if (own) await TG('sendMessage', { chat_id: own, parse_mode: 'HTML', text: `⚠️ <b>Não consegui postar em ${esc(k.title ?? 'um canal')}</b>: ${esc(desc)}\nConfira se o bot ainda é administrador com permissão de postar (/canais → canal → 🔐 Permissões).` });
    await setCfg(key, '1');
  }
  return true;
}
// pauta vazia: quase sempre é o leitor da 99play parado (sem linha da 99play não sai entrada). Avisa o dono uma vez por dia.
async function emptyWarn(k: Canal, date: string) {
  const key = `CANAL_AVISO_${k.id}_${date}`;
  if (await cfg(key)) return;
  const [snap] = await sb('c99_snapshots?select=taken_at&order=taken_at.desc&limit=1').catch(() => []) ?? [];
  const age = snap ? (Date.now() - Date.parse(snap.taken_at)) / 36e5 : Infinity;
  const quando = snap ? new Date(snap.taken_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const own = await owner(k);
  if (own) await TG('sendMessage', { chat_id: own, parse_mode: 'HTML', text: age >= 2
    ? `📢 <b>${esc(k.title ?? 'Canal')} parado</b>: a pauta de hoje está vazia porque o leitor da 99play não lê desde <b>${quando}</b>.\nAbra a 99play no PC (com o Tampermonkey ligado) e deixe a aba aberta: na próxima atualização as entradas entram e o canal volta a postar sozinho.`
    : `📢 <b>${esc(k.title ?? 'Canal')}</b>: a pauta de hoje ainda está vazia para os filtros deste canal. Se continuar assim, afrouxe a odd mínima, o EV ou os mercados no /canais.` });
  await setCfg(key, '1');
}

// ---------- trocar o link (e a imagem) pelo bilhete pronto; trocar a casa do post ----------
async function rowBy(msg: string | null, id: string | null, ch: string | null = null, cid: string | null = null) {
  let q = id ? `id=eq.${encodeURIComponent(id)}` : `owner_msg_id=eq.${encodeURIComponent(msg ?? '')}`;
  if (!id && ch) { const k = (await canais()).find(x => String(x.chat_id) === String(cid)); q = `channel_msg_id=eq.${encodeURIComponent(ch)}${k ? `&canal_id=eq.${k.id}` : ''}`; }
  return ((await sb(`channel_posts?${q}&select=*`)) ?? [])[0];
}
async function relink(msg: string | null, id: string | null, code: string, photo: string | null, ch: string | null = null, cid: string | null = null) {
  const row = await rowBy(msg, id, ch, cid); if (!row) return { ok: false, erro: 'post não encontrado' };
  return repaint(row, casaOf(row.casa), code, photo);
}
async function setCasa(id: string, c: string) {
  const row = await rowBy(null, id); if (!row) return { ok: false, erro: 'post não encontrado' };
  return repaint(row, casaOf(c), row.share_code ?? null, null);
}

// ---------- conferir: green/red respondendo o próprio post; resumo do dia só para o dono ----------
async function settle() {
  const open: any[] = await sb('channel_posts?status=eq.postada&select=id,canal_id,date,kind,legs,odd,band,channel_msg_id,stake,espelho_chat,espelho_msg') ?? [];
  if (!open.length) return 0;
  const res = await getJ('results.json'); if (!res?.stats) return 0;
  const done = (date: string, team: string) => !!res.games?.[date]?.some((g: any[]) => g[1] === team || g[2] === team);
  let n = 0; const days = new Set<string>();
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
    // todas as pernas valendo: a odd do post (no Criar Aposta é a odd estimada da casa, não o produto das pernas)
    const odd = live.length === legs.length && +p.odd > 1 ? +p.odd : live.reduce((o: number, l: any) => o * +l.odd, 1);
    const stk = +p.stake || 1, profit = status === 'green' ? Math.round(stk * (odd - 1) * 100) / 100 : status === 'red' ? -stk : 0;
    await sb(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ status, profit, settled_at: new Date().toISOString() }) });
    const k = await canalById(p.canal_id), chat = k?.chat_id;
    if (k?.cfg.resultado !== false && chat && p.channel_msg_id) {
      const text = status === 'green' ? `✅ <b>GREEN</b>${live.length < legs.length ? ` <i>(perna anulada; odd ${n2(odd)})</i>` : ''}` : status === 'red' ? '❌ <b>RED</b>' : '↩️ <b>Anulada</b> <i>(jogador não entrou)</i>';
      await TG('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', reply_parameters: { message_id: p.channel_msg_id, allow_sending_without_reply: true }, disable_notification: true });
      if (p.espelho_msg) await TG('sendMessage', { chat_id: p.espelho_chat, text, parse_mode: 'HTML', reply_parameters: { message_id: p.espelho_msg, allow_sending_without_reply: true }, disable_notification: true });
    }
    days.add(`${p.date}|${p.canal_id}`); n++;
  }
  for (const d of days) { const [date, cid] = d.split('|'); await dayReport(date, cid).catch(e => console.error('resumo', e)); }
  return n;
}
// linha do fechamento no resumo do dono: quantas simples pegaram odd/linha melhor que a de fechamento e como foram
function fech(all: any[]) {
  const S = all.filter(p => p.kind === 'simples' && p.status !== 'void').map(p => ({ p, c: postClv({ odd: +p.odd, legs: p.legs }) })).map(x => ({ ...x, b: x.c.bateu }));
  const lidas = S.filter(x => x.c.s < x.c.n); if (!lidas.length) return '';
  const fav = lidas.filter(x => x.b), g = fav.filter(x => x.p.status === 'green').length;
  return `\nFechamento: ${fav.length} de ${lidas.length} simples bateram o fechamento${fav.length ? ` (${g} green)` : ''}`;
}
async function dayReport(date: string, cid: string) {
  const all: any[] = await sb(`channel_posts?date=eq.${date}&canal_id=eq.${cid}&select=kind,status,profit,odd,band,legs`) ?? [];
  const key = `CANAL_RESUMO_${cid}_${date}`;
  if (!all.length || all.some(p => p.status === 'postada') || (await cfg(key))) return;
  const k = await canalById(cid), own = await owner(k); if (!own) return;
  const part = (k: string) => { const xs = all.filter(p => p.kind === k), g = xs.filter(p => p.status === 'green').length, r = xs.filter(p => p.status === 'red').length;
    const u = xs.reduce((s, p) => s + (+p.profit || 0), 0); return { n: xs.length, g, r, u }; };
  const S = part('simples'), M = part('multipla'), CA = (() => { const xs = all.filter(p => /^ca-/.test(p.band ?? '')); // Método Criar Aposta (dentro das múltiplas)
    return { n: xs.length, g: xs.filter(p => p.status === 'green').length, r: xs.filter(p => p.status === 'red').length, u: xs.reduce((s, p) => s + (+p.profit || 0), 0) }; })(), U = S.u + M.u;
  const u = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',') + 'u';
  const [, mm, dd] = date.split('-');
  await TG('sendMessage', { chat_id: own, parse_mode: 'HTML', text: `📊 <b>${esc(k.title ?? 'Canal')} · ${dd}/${mm}</b>\n<blockquote>Simples: ${S.g} ✅ · ${S.r} ❌ de ${S.n} · <b>${u(S.u)}</b>\nMúltiplas: ${M.g} ✅ · ${M.r} ❌ de ${M.n} · <b>${u(M.u)}</b>\n${CA.n ? `  ↳ Criar Aposta: ${CA.g} ✅ · ${CA.r} ❌ de ${CA.n} · <b>${u(CA.u)}</b>\n` : ''}Dia: <b>${u(U)}</b> (em unidades)${fech(all)}</blockquote>` });
  await setCfg(key, '1');
}

// ---------- resumo semanal no canal (segunda, a partir das 10h): placar completo da semana + os melhores greens ----------
// Mostra greens e reds (placar honesto); os destaques são os greens de maior odd. Com canal oficial ligado, vai para o
// oficial e conta só o que foi copiado para lá.
async function weekly(ks: Canal[]) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date());
  if (wd !== 'Mon' || hourBRnow() < 10) return 0;
  const today = etDate(), day = (n: number) => new Date(Date.parse(today + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
  const from = day(7), to = day(1); let n = 0;
  for (const k of ks.filter(k => k.cfg.semanal)) {
    const key = `CANAL_SEMANA_${k.id}_${today}`; if (await cfg(key)) continue;
    const t = k.cfg.espelho ? (await canais()).find(x => String(x.id) === String(k.cfg.espelho)) : null;
    let rows: any[] = await sb(`channel_posts?canal_id=eq.${k.id}&date=gte.${from}&date=lte.${to}&status=in.(green,red)&select=kind,status,profit,odd,legs,espelho_msg`) ?? [];
    if (t) rows = rows.filter(r => r.espelho_msg);
    await setCfg(key, '1');
    if (!rows.length) continue;
    const g = rows.filter(r => r.status === 'green'), u = rows.reduce((a, r) => a + (+r.profit || 0), 0);
    const top = g.sort((a, b) => +b.odd - +a.odd).slice(0, 8).map(r => r.kind === 'multipla' ? `✅ Múltipla @${n2(+r.odd)} (${(r.legs ?? []).length} pernas)`
      : `✅ ${esc(r.legs?.[0]?.name ?? '')} ${r.legs?.[0]?.side === 'o' ? 'mais' : 'menos'} ${n1(+r.legs?.[0]?.line)} ${MKS[r.legs?.[0]?.mk] ?? ''} @${n2(+r.odd)}`);
    const dm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
    const text = `📊 <b>RESUMO DA SEMANA</b> · ${dm(from)} a ${dm(to)}\n<blockquote>✅ ${g.length} greens · ❌ ${rows.length - g.length} reds · ${Math.round(100 * g.length / rows.length)}% de acerto\n💰 Resultado: <b>${u >= 0 ? '+' : ''}${n2(u)} unidades</b></blockquote>\n🔥 <b>Destaques</b>\n${top.join('\n')}`;
    const r = await TG('sendMessage', { chat_id: (t ?? k).chat_id, text, parse_mode: 'HTML' });
    if (r.ok) n++;
  }
  return n;
}

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  try {
    const secret = await cfg('WEBHOOK_SECRET');
    const ok = (k: string) => !!secret && u.searchParams.get(k) === secret;
    if (ok('run')) return json(await run());
    if (ok('relink')) return json(await relink(u.searchParams.get('msg'), u.searchParams.get('id'), u.searchParams.get('code') ?? '', u.searchParams.get('photo'), u.searchParams.get('ch'), u.searchParams.get('cid')));
    if (ok('casa')) return json(await setCasa(u.searchParams.get('id') ?? '', u.searchParams.get('c') ?? '99'));
    if (ok('abertos')) { // posts recentes do canal ainda sem bilhete pronto, para o bot perguntar de qual é o link
      const d = etDate(), y = new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10), cid = u.searchParams.get('canal');
      return json(await sb(`channel_posts?date=in.(${d},${y})&share_code=is.null&status=eq.postada${cid ? `&canal_id=eq.${encodeURIComponent(cid)}` : ''}&select=id,kind,band,odd,legs,casa&order=id.desc&limit=8`) ?? []);
    }
    if (ok('preview')) {
      const P = await getJ('canal.json'), k = await canalById(u.searchParams.get('canal')), own = await owner(k);
      const pauta = P?.v === 2 ? P.canais?.[k?.id] : P;
      if (!pauta || !own) return json({ ok: false, erro: 'sem pauta ou sem dono' });
      const s = pauta.singles?.[0], m = pauta.multis?.[0], pc = u.searchParams.get('c') ?? undefined;
      return json({ ok: true, canal: k.title, simples: s ? (await post(s, 'simples', P.date, P.gen, k, own, pc)).ok : null, multipla: m ? (await post(m, 'multipla', P.date, P.gen, k, own, pc)).ok : null,
        pauta: { date: P.date, simples: pauta.singles?.length, multiplas: pauta.multis?.map((x: any) => x.band + '@' + x.odd) } });
    }
    if (u.searchParams.has('resultados')) { // painel e planilha do canal: público só com o token daquele canal
      const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
      const cid = u.searchParams.get('resultados') ?? '';
      if (!secret || u.searchParams.get('t') !== await tokOf(cid)) return new Response(JSON.stringify({ ok: false, erro: 'link inválido' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
      const R = await resultados(cid, Math.min(400, Math.max(1, +(u.searchParams.get('dias') ?? 120) || 120)));
      if (!R) return new Response(JSON.stringify({ ok: false, erro: 'canal não encontrado' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
      if (u.searchParams.get('fmt') === 'csv') return new Response(toCSV(R), { headers: { ...cors, 'Content-Type': 'text/csv; charset=utf-8' } });
      return new Response(JSON.stringify(R), { headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    }
    if (ok('tok')) return json({ canal: u.searchParams.get('canal'), t: await tokOf(u.searchParams.get('canal') ?? '') });
    if (u.searchParams.has('hub')) { // público: só o necessário para a divisão (sem chat, dono ou links)
      const ks = (await canais()).filter(k => k.cfg.on !== false && k.cfg.modo !== 'espelho'), d = etDate();
      const pick = (c: any) => ({ max: c.max, oddMin: c.oddMin, oddMax: c.oddMax, evMin: c.evMin, mercados: c.mercados, lado: c.lado, multis: c.multis, metodo: c.metodo ?? null });
      const postados = (await sb(`channel_posts?date=eq.${d}&select=canal_id,kind,pkey,band,legs`) ?? []).map((p: any) => ({ ...p, legs: (p.legs ?? []).map((l: any) => ({ pid: l.pid, mk: l.mk, side: l.side })) }));
      return json({ date: d, canais: ks.map(k => ({ id: k.id, cfg: pick(k.cfg) })), postados });
    }
    return json({ ok: true });
  } catch (e) { return json({ ok: false, erro: String((e as Error).message) }, 500); }
});
