// Fábrica de estratégias: registra em papel as entradas do dia de cada estratégia (public/data/strategies.json),
// confere com os resultados (results.json) e entrega o relatório (CSV para a planilha, JSON para o bot/painel).
//   ?record=<WEBHOOK_SECRET>  grava as entradas novas (com alerta no Telegram) e atualiza o fechamento das já gravadas
//                             dos jogos que ainda não começaram (pg_cron, a cada 15 min); &silent=1 grava sem alertar
//   ?settle=<WEBHOOK_SECRET>  confere as entradas abertas dos dias com box score (pg_cron, de manhã)
//   ?csv=<REPORT_TOKEN>       todas as entradas em CSV (aba Estratégias da planilha)
//   ?stats=1                  resumo por estratégia (view strategy_stats)
const APP = 'https://gabrielcbjr29.github.io/black-house-props/data/';
const ODD_EST = 1.87;
const MK2STAT: Record<string, string> = { PTS: 'pts', REB: 'reb', AST: 'ast', '3PM': 'tpm', PRA: 'pts+reb+ast', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'fgm', FGA: 'fga', '2PM': 'twom', '2PA': 'twoa', '3PA': 'tpa', FTM: 'ftm', FTA: 'fta', STL: 'stl', BLK: 'blk', SB: 'stl+blk', TOV: 'tov', PF: 'pf' };
const IDX: Record<string, (a: number[]) => number> = { pf: a => a[7], pts: a => a[1], reb: a => a[2], ast: a => a[3], stl: a => a[4], blk: a => a[5], tov: a => a[6], fgm: a => a[8], fga: a => a[9], tpm: a => a[10], tpa: a => a[11], ftm: a => a[12], fta: a => a[13], twoa: a => a[9] - a[11], twom: a => a[8] - a[10] };
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 160));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const cfg = async (k: string) => (await sb(`bot_config?key=eq.${k}&select=value`))?.[0]?.value as string | undefined;
const getJ = (f: string) => fetch(APP + f + '?t=' + Math.floor(Date.now() / 120_000), { headers: { 'Cache-Control': 'no-cache' } }).then(r => r.ok ? r.json() : null);
const etDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

// alerta no Telegram (quem recebe "Modelo por mercado" em /receber): entradas novas assim que o modelo aponta
const esc = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace('.', ',');
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const MKS: Record<string, string> = { PTS: 'pontos', REB: 'rebotes', AST: 'assist.', '3PM': 'de 3 conv.', PRA: 'PRA', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'arr. conv.', FGA: 'arr. tentados', '2PM': 'de 2 conv.', '2PA': 'de 2 tentados', '3PA': 'de 3 tentadas', FTM: 'LL conv.', FTA: 'LL tentados', STL: 'roubos', BLK: 'tocos', SB: 'roub+tocos', TOV: 'erros', PF: 'faltas' };
const hourBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
// nomes completos dos mercados para as mensagens
const MKN: Record<string, string> = { '2PA': 'Tentativas de 2', '2PM': 'De 2 convertidos', '3PA': 'Tentativas de 3', '3PM': 'De 3 convertidos', FGM: 'Arremessos convertidos', FTA: 'Lances livres tentados', FTM: 'Lances livres convertidos', RA: 'Reb + Ast' };
const pct = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
// últimos 10 em cores, do mais recente para o mais antigo: 🟩 bateu o lado, 🟥 não bateu, ⬜ empatou na linha
function sqLine(vals: any, line: number, side: string) {
  const v = (Array.isArray(vals) ? vals : []).slice(0, 10).map(Number); if (!v.length) return '';
  let hit = 0; const dots = v.map(x => { const ok = side === 'o' ? x > line : x < line; if (ok) hit++; return x === line ? '⬜' : ok ? '🟩' : '🟥'; }).join('');
  return `${dots} <b>${hit}/${v.length}</b>`;
}
// lista de entradas agrupada por jogo (é como você navega na 99play): jogo → jogador · mercado → lado, linha, odd, chance e EV
export function fmtEntries(list: any[]) {
  const games = new Map<string, any[]>();
  for (const x of list) { const k = [x.team, x.opp].sort().join(' x '); (games.get(k) ?? games.set(k, []).get(k)!).push(x); }
  const order = [...games.entries()].sort((a, b) => String(a[1][0].tip_utc ?? '').localeCompare(String(b[1][0].tip_utc ?? '')));
  const regs: { text: string; callback_data: string }[] = []; let i = 0;
  const blocks = order.map(([k, xs]) => `🏀 <b>${esc(k)}</b>${xs[0].tip_utc ? ' · ' + hourBR(xs[0].tip_utc) : ''}\n<blockquote>` + xs.map(x => {
    i++; regs.push({ text: `📝 ${i}`, callback_data: `bet:${x.pid}-${x.mk}-${x.side}:e.${x.strategy_id}`.slice(0, 64) });
    const ev = x.edge == null ? '' : ` · EV <b>${pct(+x.edge)}</b>${+x.edge >= .1 ? ' 🔥' : ''}`;
    return `<b>${i}. ${esc(x.name)}</b> · ${MKN[x.mk] ?? x.mk}${x.strategy_id === 'reserva-under' ? ' <i>(reserva)</i>' : ''}\n${x.side === 'o' ? '⬆️ Mais' : '⬇️ Menos'} de <b>${n1(+x.line)}</b> · @${n2(+x.odd)} · ${Math.round(+x.p * 100)}%${ev}${x.sq?.length ? '\n' + sqLine(x.sq, +x.line, x.side) : ''}`;
  }).join('\n') + '</blockquote>');
  return { blocks, regs, n: i };
}
// ---------- alerta completo: uma mensagem por entrada, com o card em imagem no topo e a análise toda ----------
const MKF: Record<string, string> = { PTS: 'pontos', REB: 'rebotes', AST: 'assistências', '3PM': 'bolas de 3', PRA: 'pts+reb+ast', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'arremessos convertidos', FGA: 'arremessos tentados', '2PM': 'de 2 convertidos', '2PA': 'de 2 tentados', '3PA': 'bolas de 3 tentadas', FTM: 'lances livres convertidos', FTA: 'lances livres tentados', STL: 'roubos', BLK: 'tocos', SB: 'roubos+tocos', TOV: 'erros', PF: 'faltas' };
const GRADE: Record<string, string> = { 'A+': '🔥 A+', A: '✅ A', B: '➖ B', C: '⚪ C' };
const pc = (x: number | null | undefined) => x == null ? '–' : Math.round(x * 100) + '%';
const bar = (p: number, n = 10) => { const k = Math.max(0, Math.min(n, Math.round(p * n))); return '▰'.repeat(k) + '▱'.repeat(n - k); };
const hitTxt = (h?: number[] | null) => h?.[1] ? `<b>${h[0]}/${h[1]}</b>` : '–';
function fullAlert(x: any, r: any) {
  const over = x.side === 'o', line = +x.line, odd = +x.odd, edge = x.edge == null ? null : +x.edge;
  const sw = over ? 'acima' : 'abaixo';
  const title = x.strategy_id === 'oport-forte' ? `OPORTUNIDADE FORTE · ${MKF[x.mk] ?? x.mk}` : `NOVA ENTRADA · ${MKN[x.mk] ?? MKF[x.mk] ?? x.mk}${x.strategy_id === 'reserva-under' ? ' (reserva)' : ''}`;
  const vs = r ? (r.home ? `${r.t} x ${r.o}` : `${r.t} @ ${r.o}`) : `${x.team} x ${x.opp}`;
  const L = [`🚨 <b>${esc(title)}</b>`, `<b>${esc(x.name)}</b>  <i>${esc(vs)} · ${x.tip_utc ? hourBR(x.tip_utc) : r?.h ?? ''}</i>`, ''];
  L.push(`${over ? '⬆️ <b>Mais de ' : '⬇️ <b>Menos de '}${n1(line)}</b> ${MKF[x.mk] ?? x.mk}`);
  L.push(`💵 <code>@${n2(odd)}</code> 99play${edge == null ? '' : ` · EV <b>${pct(edge)}</b>${edge >= .1 ? ' 🔥' : ''}`}`);
  if (r) {
    L.push(`${GRADE[r.gr] ?? r.gr ?? ''}${r.nt != null ? ` · Nota <b>${r.nt}</b>` : ''}  ${bar(+x.p)} <b>${pc(+x.p)}</b>${r.q != null ? ` <i>(mercado ${pc(r.q)})</i>` : ''}`);
    L.push('', `📊 L5 ${hitTxt(r.l5)} · L10 ${hitTxt(r.l10)} · L20 ${hitTxt(r.l20)}`, `📅 Temp. ${hitTxt(r.ss)} · Temp. passada ${hitTxt(r.tp)} · vs ${esc(r.o)} ${hitTxt(r.hh)}`);
  } else L.push(`Chance do modelo <b>${pc(+x.p)}</b>`);
  const sq = x.sq?.length ? x.sq : r?.sq;
  if (sq?.length) L.push(sqLine(sq, line, x.side), `🔢 <code>${sq.slice(0, 10).join('-')}</code>`);
  if (r) {
    L.push(`${r.sk && r.sk >= 2 ? `🔥 <b>${r.sk} seguidos</b> ${sw} · ` : ''}🧠 ${r.mb ? 'Modelo BH' : 'Projeção'} <b>${n1(Math.round(r.pj * 10) / 10)}</b>${r.ed == null ? '' : ` · vantagem <b>${r.ed >= 0 ? '+' : '−'}${n1(Math.abs(r.ed))}</b>`}`);
    if (r.wo) L.push(`🚑 ${r.wo.x ? 'Sem' : 'Se faltar,'} ${esc(r.wo.q)}${r.wo.x ? '' : ' (em dúvida)'}: <b>${r.wo.h[0]}/${r.wo.h[1]}</b> ${sw} · média ${n1(r.wo.a)}`);
    if (r.dv?.r) {
      const good = over ? r.dv.r >= r.dv.of - 5 : r.dv.r <= 6, bad = over ? r.dv.r <= 6 : r.dv.r >= r.dv.of - 5;
      L.push(`🛡️ Defesa ${esc(r.o)}: ${r.dv.r}ª/${r.dv.of} contra ${esc(r.dv.ps)} em ${esc(r.dv.k)}${good ? ' · <b>favorável</b>' : bad ? ' · <i>difícil</i>' : ''}`);
    }
  }
  const body = `<blockquote>${L.slice(3).join('\n')}</blockquote>`;
  const dup = /^(Bateu em|Defesa do|Contra o |Sem |Temporada passada|\d+ jogos seguidos)/;
  const wy = (r?.wy ?? []).filter((t: string) => !dup.test(t)).slice(0, 3).map((t: string) => `✅ ${esc(t)}`);
  const wn = (r?.wn ?? []).filter((t: string) => !dup.test(t)).slice(0, 2).map((t: string) => `⚠️ ${esc(t)}`);
  if (edge != null && edge > .15) wn.push('⚠️ <i>Muito acima do mercado: confira notícias antes</i>');
  if (r?.st === 'questionable') wn.push('🟡 <i>Jogador em dúvida</i>');
  const why = [...wy, ...wn];
  let text = `${L.slice(0, 3).join('\n')}${body}${why.length ? `\n<blockquote expandable><b>Por que sim / por que não</b>\n${why.join('\n')}</blockquote>` : ''}\n<i>No papel: 1u a @${n2(odd)} · 🔞 18+ · Aposte com responsabilidade</i>`;
  if (text.length > 4090) text = text.slice(0, 4000).replace(/<[^>]*$/, '') + '…';
  const share = [`🏀 ${x.name} (${vs})`, `${over ? '⬆️ Mais' : '⬇️ Menos'} de ${n1(line)} ${MKF[x.mk] ?? x.mk} · @${n2(odd)}`,
    ...(sq?.length ? [`📊 Últimos 10: ${sqLine(sq, line, x.side).replace(/<\/?b>/g, '')}`, `🔢 ${sq.slice(0, 10).join('-')}`] : [])].join('\n').slice(0, 256);
  const kb = { inline_keyboard: [[{ text: '📝 Registrar minha aposta', callback_data: `bet:${x.pid}-${x.mk}-${x.side}:e.${x.strategy_id}`.slice(0, 64) }, { text: '📋 Copiar', copy_text: { text: share } }], [{ text: '🧪 Placar', callback_data: '/estrategias' }, { text: '💼 Banca', callback_data: '/banca' }]] };
  return { text, kb };
}
async function alert(fresh: any[], evMin: number, bot: any) {
  const token = await cfg('TELEGRAM_BOT_TOKEN'); if (!token || !fresh.length) return 0;
  const subs: any[] = await sb('bot_subs?select=chat_id&est=eq.true') ?? [];
  if (!subs.length) return 0;
  const rowOf = new Map<string, any>((bot?.rows ?? []).map((r: any) => [`${r.id}-${r.m}-${r.s}`, r]));
  // ordem: jogo mais cedo primeiro, e dentro do jogo o maior EV
  const list = [...fresh].sort((a, b) => String(a.tip_utc ?? '').localeCompare(String(b.tip_utc ?? '')) || (+b.edge || 0) - (+a.edge || 0));
  let sent = 0;
  for (const x of list) {
    const r = rowOf.get(`${x.pid}-${x.mk}-${x.side}`);
    const { text, kb } = fullAlert(x, r);
    const img = r?.cd ? `${APP}cards/${r.id}-${r.m}-${r.s}.jpg?v=${encodeURIComponent(bot.gen)}` : null;
    for (const s of subs) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: s.chat_id, text, parse_mode: 'HTML', reply_markup: kb,
          link_preview_options: img ? { url: img, prefer_large_media: true, show_above_text: true } : { is_disabled: true } }) }).then(r => r.json()).catch(() => null);
      if (res?.ok) sent++;
      await new Promise(ok => setTimeout(ok, 350)); // o Telegram limita mensagens seguidas no mesmo chat
    }
  }
  return sent;
}

// grava as entradas do dia. A ENTRADA vale na linha e odd do momento em que o modelo apontou (open_line/open_odd,
// guardadas pelo gatilho na primeira gravação); line/odd seguem sendo atualizadas até o jogo e viram o fechamento (CLV).
// Cada estratégia tem um teto de entradas por dia (max): as primeiras que o modelo apontar.
async function record(silent = false) {
  const st = await getJ('strategies.json');
  if (!st?.picks) return { ok: false, erro: 'strategies.json indisponível' };
  if (st.date !== etDate()) return { ok: true, skip: `dados de ${st.date}` };
  await sb('strategies?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(st.strategies.map((s: any) => ({ id: s.id, name: s.name, descr: s.descr, markets: s.markets, updated_at: new Date().toISOString() }))) });
  const now = Date.now();
  const have: any[] = await sb(`strategy_picks?date=eq.${st.date}&select=strategy_id,pid,mk,alerted`) ?? [];
  const key = (x: any) => `${x.strategy_id}|${x.pid}|${x.mk}`, had = new Set(have.map(key));
  const count: Record<string, number> = {}; for (const h of have) count[h.strategy_id] = (count[h.strategy_id] || 0) + 1;
  const maxOf = Object.fromEntries(st.strategies.map((s: any) => [s.id, s.max ?? 5]));
  const rows: any[] = [], fresh: any[] = [];
  for (const p of st.picks) {
    if (p.tip_utc && Date.parse(p.tip_utc) <= now + 5 * 6e4) continue; // jogo começado: fica a última gravada
    if (!p.odd) continue; // sem odd da 99play: não entra
    const row = { date: st.date, ...p, stat: MK2STAT[p.mk], odd_src: p.odd_src || '99play', updated_at: new Date(now).toISOString() };
    if (had.has(key(p))) { rows.push(row); continue; }
    if ((count[p.strategy_id] || 0) >= (maxOf[p.strategy_id] ?? 5)) continue; // teto do dia já preenchido
    count[p.strategy_id] = (count[p.strategy_id] || 0) + 1; fresh.push(row);
  }
  // o papel grava TODAS as entradas (para medir cada faixa de EV); o alerta só manda as de EV mínimo (bot_config
  // ALERT_EV, padrão 5%) e uma por jogador no dia: a de maior EV (mercados do mesmo jogador andam juntos)
  const evMin = +((await cfg('ALERT_EV')) ?? .05) || .05;
  const alertedPid = new Set(have.filter(h => h.alerted).map(h => h.pid)), best = new Map<string, any>();
  for (const x of fresh) if ((x.edge ?? -1) >= evMin && !alertedPid.has(x.pid) && (!best.has(x.pid) || x.edge > best.get(x.pid).edge)) best.set(x.pid, x);
  for (const x of fresh) x.alerted = best.get(x.pid) === x;
  if (rows.length) await sb('strategy_picks?on_conflict=date,strategy_id,pid,mk', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
  if (fresh.length) await sb('strategy_picks?on_conflict=date,strategy_id,pid,mk', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(fresh) });
  const toAlert = fresh.filter(x => x.alerted).sort((a, b) => b.edge - a.edge);
  const bot = await getJ('bot.json').catch(() => null);
  const alertas = silent ? 0 : await alert(toAlert, evMin, bot?.date === st.date ? bot : null).catch(e => { console.error('alerta', e); return 0; });
  const risk = bot?.date === st.date ? await risco(bot).catch(e => ({ erro: String(e) })) : { skip: 'bot.json de outro dia' };
  return { ok: true, date: st.date, atualizadas: rows.length, novas: fresh.length, alertadas: toAlert.length, alertas, risco: risk };
}
// ---------- Monitor de risco: vigia as entradas já enviadas até o jogo começar (roda junto com a gravação) ----------
// Sinais (com os dados que a coleta de hora em hora já traz, sem depender da 99play):
//   jogador ficou em dúvida ou fora · colega importante passou a estar fora (muda minutos e volume) ·
//   a chance do modelo na linha da entrada virou para o outro lado ou caiu 10+ pontos.
// Cada entrada guarda os sinais já vistos (risk); só sinal novo vira alerta. Na primeira passada, só registra.
function nbOver(mu: number, k: number, line: number) {
  mu = Math.max(mu, .01); const thr = Math.floor(line);
  if (k > 400) { let p = Math.exp(-mu), c = 0; for (let x = 0; x <= thr; x++) { c += p; p *= mu / (x + 1); } return Math.max(0, Math.min(1, 1 - c)); }
  let p = Math.pow(k / (k + mu), k), c = 0; const q = mu / (k + mu);
  for (let x = 0; x <= thr; x++) { c += p; p *= (x + k) / (x + 1) * q; }
  return Math.max(0, Math.min(1, 1 - c));
}
function pSide(m: any, stat: string, line: number, side: string) {
  const parts = String(stat).split('+').map(k => m?.s?.[k]); if (!parts.length || parts.some(x => !x)) return null;
  const mu = parts.reduce((a: number, x: any) => a + x[0], 0);
  let k = parts[0][1];
  if (parts.length > 1) { const v = parts.reduce((a: number, x: any) => a + x[0] + x[0] * x[0] / x[1], 0) * 1.1; k = v > mu ? mu * mu / (v - mu) : 500; }
  const po = nbOver(mu, k, line); return side === 'o' ? po : 1 - po;
}
const STLB: Record<string, string> = { questionable: 'em dúvida', doubtful: 'provável fora', out: 'FORA' };
async function risco(bot: any) {
  const now = Date.now();
  const open: any[] = (await sb(`strategy_picks?date=eq.${bot.date}&status=eq.aberta&alerted=eq.true&select=id,strategy_id,pid,name,team,opp,mk,stat,side,line,odd,open_line,open_odd,p,risk,tip_utc`) ?? [])
    .filter(x => !x.tip_utc || Date.parse(x.tip_utc) > now);
  if (!open.length) return { vigiadas: 0, alertas: 0 };
  const inj = new Map<string, any>((bot.injuries ?? []).map((i: any) => [`${i.t}|${i.n}`, i]));
  const items: { x: any; why: string[] }[] = [];
  for (const x of open) {
    const L = +(x.open_line ?? x.line), conds: Record<string, string> = {};
    const own = inj.get(`${x.team}|${x.name}`)?.st;
    if (own && STLB[own]) conds['st:' + own] = own === 'out' ? `${esc(x.name)} está <b>FORA</b> hoje (se não jogar, a aposta costuma ser anulada; confira a regra da casa)` : `${esc(x.name)} está <b>${STLB[own]}</b> para o jogo`;
    for (const r of (bot.rows ?? []).filter((r: any) => r.id === x.pid && r.wo?.x)) {
      conds['wo:' + r.wo.q] = `<b>${esc(r.wo.q)}</b> está fora hoje: sem ele, ${esc(x.name)} teve média de ${n1(+r.wo.a)} em ${r.wo.h?.[1] ?? '?'} jogos (linha da entrada ${n1(L)})`;
    }
    const pn = pSide(bot.mdl?.[x.pid], x.stat, L, x.side);
    if (pn != null) {
      if (pn < .5) conds['p:virou'] = `O modelo agora dá <b>${Math.round(pn * 100)}%</b> para o nosso lado na linha ${n1(L)} (era ${Math.round(+x.p * 100)}%): virou para o outro lado`;
      else if (+x.p - pn >= .1) conds['p:caiu'] = `O modelo caiu para <b>${Math.round(pn * 100)}%</b> na linha ${n1(L)} (era ${Math.round(+x.p * 100)}%)`;
    }
    const keys = Object.keys(conds), seen = x.risk == null ? null : new Set(String(x.risk).split('|').filter(Boolean));
    const fresh = seen ? keys.filter(k => !seen.has(k) && !(k === 'p:caiu' && seen.has('p:virou'))) : [];
    const patch: Record<string, unknown> = { p_now: pn == null ? null : Math.round(pn * 1000) / 1000 };
    if (seen == null || fresh.length) patch.risk = [...new Set([...(seen ?? []), ...keys])].join('|');
    if (fresh.length) { patch.risk_at = new Date(now).toISOString(); items.push({ x, why: fresh.map(k => conds[k]) }); }
    await sb(`strategy_picks?id=eq.${x.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
  }
  let alertas = 0;
  if (items.length) {
    const token = await cfg('TELEGRAM_BOT_TOKEN'); const subs: any[] = await sb('bot_subs?select=chat_id&est=eq.true') ?? [];
    const names = Object.fromEntries(((await sb('strategies?select=id,name')) ?? []).map((s: any) => [s.id, s.name]));
    let text = `⚠️ <b>ALERTA DE RISCO · ENTRADA${items.length > 1 ? 'S' : ''} JÁ ENVIADA${items.length > 1 ? 'S' : ''}</b>\n<i>O cenário mudou depois do alerta.</i>\n\n` + items.map(({ x, why }) =>
      `🏀 <b>${esc(x.team)} x ${esc(x.opp)}</b>${x.tip_utc ? ' · ' + hourBR(x.tip_utc) : ''}\n<blockquote><b>${esc(x.name)}</b> · ${MKN[x.mk] ?? x.mk}\n${x.side === 'o' ? '⬆️ Mais' : '⬇️ Menos'} de <b>${n1(+(x.open_line ?? x.line))}</b> · @${n2(+(x.open_odd ?? x.odd))}\n${why.map(w => '• ' + w).join('\n')}</blockquote>`).join('\n\n')
      + `\n\n<i>Se ainda não entrou, reavalie antes. Se já entrou, veja se vale proteger. O placar segue contando a entrada como foi enviada.</i>`;
    if (text.length > 4090) text = text.slice(0, 4000).replace(/<[^>]*$/, '') + '…';
    for (const s of token ? subs : []) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: s.chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: '🧪 Placar', callback_data: '/estrategias' }, { text: '💼 Banca', callback_data: '/banca' }]] } }) }).then(r => r.json()).catch(() => null);
      if (r?.ok) alertas++;
    }
  }
  return { vigiadas: open.length, novos_riscos: items.length, alertas };
}
async function settle() {
  const res = await getJ('results.json'); if (!res?.stats) return { ok: false, erro: 'results.json indisponível' };
  const open: any[] = await sb('strategy_picks?status=eq.aberta&select=id,date,pid,stat,side,line,odd,open_line,open_odd') ?? [];
  let n = 0;
  for (const r of open) {
    if (!res.dates?.includes(r.date)) continue;
    const a = res.stats[r.date]?.[r.pid];
    const L = +(r.open_line ?? r.line), O = +(r.open_odd ?? r.odd) || ODD_EST; // entrada: linha e odd do alerta
    let status = 'void', result: number | null = null;
    if (a && a[0] > 0) { result = String(r.stat).split('+').reduce((s, k) => s + (IDX[k]?.(a) ?? 0), 0); status = result === L ? 'void' : (r.side === 'o' ? result > L : result < L) ? 'green' : 'red'; }
    const profit = status === 'green' ? Math.round((O - 1) * 100) / 100 : status === 'red' ? -1 : 0;
    await sb(`strategy_picks?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ status, result, profit, settled_at: new Date().toISOString() }) }).catch(() => null);
    n++;
  }
  return { ok: true, conferidas: n };
}
Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  try {
    const secret = await cfg('WEBHOOK_SECRET');
    if (u.searchParams.get('record') && u.searchParams.get('record') === secret) return json(await record(u.searchParams.get('silent') === '1'));
    if (u.searchParams.get('settle') && u.searchParams.get('settle') === secret) return json(await settle());
    // prévia: manda o alerta completo de uma entrada de hoje (a de maior EV, ou &k=<pid>-<mk>-<lado>) marcado como TESTE
    if (u.searchParams.get('preview') && u.searchParams.get('preview') === secret) {
      const bot = await getJ('bot.json'), k = u.searchParams.get('k');
      const ps: any[] = await sb(`strategy_picks?date=eq.${bot.date}&select=*&order=edge.desc.nullslast&limit=200`) ?? [];
      const x = ps.find(p => !k || `${p.pid}-${p.mk}-${p.side}` === k); if (!x) return json({ ok: false, erro: 'sem entrada' });
      const live = (await getJ('strategies.json'))?.picks?.find((p: any) => p.pid === x.pid && p.mk === x.mk && p.strategy_id === x.strategy_id);
      return json({ ok: true, enviadas: await alert([{ ...x, ...(live ?? {}), name: '[TESTE] ' + x.name }], 0, bot) });
    }
    if (u.searchParams.get('stats')) return json(await sb('strategy_stats?select=*&order=lucro.desc.nullslast'));
    const rep = await cfg('REPORT_TOKEN');
    if (rep && u.searchParams.get('csv') === rep) {
      const rows: any[] = await sb('strategy_picks?select=*,strategies(name)&order=date.asc,strategy_id.asc,id.asc&limit=20000') ?? [];
      const head = ['data', 'estrategia', 'jogador', 'time', 'adversario', 'mercado', 'lado', 'linha', 'odd', 'fonte_odd', 'chance_modelo', 'valor_esperado', 'nota', 'resultado', 'status', 'lucro_u', 'linha_fechamento', 'clv_linha'];
      const q = (x: unknown) => { const t = x == null ? '' : String(x); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const ST: Record<string, string> = { aberta: 'Aberta', green: 'Green', red: 'Red', void: 'Anulada' };
      const body = rows.map(r => [r.date, r.strategies?.name ?? r.strategy_id, r.name, r.team, r.opp, r.mk, r.side === 'o' ? 'Mais' : 'Menos', r.open_line ?? r.line, r.open_odd ?? r.odd, r.odd_src, r.p, r.edge, r.nota, r.result, ST[r.status] ?? r.status, r.status === 'aberta' ? '' : r.profit, r.line, r.clv_line]);
      return new Response([head, ...body].map(l => l.map(q).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }
    return json({ ok: true });
  } catch (e) { return json({ ok: false, erro: String((e as Error).message) }, 500); }
});
