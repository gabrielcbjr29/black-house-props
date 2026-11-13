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
async function alert(fresh: any[], names: Record<string, string>) {
  const token = await cfg('TELEGRAM_BOT_TOKEN'); if (!token || !fresh.length) return 0;
  const subs: any[] = await sb('bot_subs?select=chat_id&est=eq.true') ?? [];
  if (!subs.length) return 0;
  const regs: { text: string; callback_data: string }[] = [], blocks: string[] = [];
  let i = 0;
  for (const sid of [...new Set(fresh.map(x => x.strategy_id))]) {
    blocks.push(`<b>🧪 ${esc(names[sid] ?? sid)}</b>\n` + fresh.filter(x => x.strategy_id === sid).map(x => {
      i++; regs.push({ text: `📝${i}`, callback_data: `bet:${x.pid}-${x.mk}-${x.side}:e.${sid}`.slice(0, 64) });
      return `${i}. <b>${esc(x.name)}</b> ${x.side === 'o' ? '⬆️ Mais' : '⬇️ Menos'} de ${n1(+x.line)} ${MKS[x.mk] ?? x.mk} · @${n2(+x.odd)} · ${Math.round(+x.p * 100)}%${x.edge != null ? ` · EV ${x.edge >= 0 ? '+' : ''}${(x.edge * 100).toFixed(1).replace('.', ',')}%` : ''}\n    <i>${esc(x.team)} x ${esc(x.opp)}${x.tip_utc ? ' · ' + hourBR(x.tip_utc) : ''}</i>`;
    }).join('\n'));
  }
  let text = `🚨 <b>NOVA${i > 1 ? 'S' : ''} ENTRADA${i > 1 ? 'S' : ''} · MODELO POR MERCADO</b>\n<i>Linha e odd da 99play agora. Quanto antes você pegar, melhor: a linha costuma andar até o jogo.</i>\n\n${blocks.join('\n\n')}\n\n<i>📝 registra a sua entrada com a odd que você pegou. O placar conta 1u na linha e odd deste alerta.</i>\n<i>🔞 18+ · Aposte com responsabilidade.</i>`;
  if (text.length > 4090) text = text.replace(/\n    <i>[^\n]*<\/i>/g, '').slice(0, 4090);
  const kb = { inline_keyboard: [...Array.from({ length: Math.ceil(regs.length / 5) }, (_, k) => regs.slice(k * 5, k * 5 + 5)), [{ text: '🧪 Placar', callback_data: '/estrategias' }, { text: '💼 Banca', callback_data: '/banca' }]] };
  let sent = 0;
  for (const s of subs) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: s.chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb }) }).then(r => r.json()).catch(() => null);
    if (r?.ok) sent++;
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
  const have: any[] = await sb(`strategy_picks?date=eq.${st.date}&select=strategy_id,pid,mk`) ?? [];
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
    count[p.strategy_id] = (count[p.strategy_id] || 0) + 1; rows.push(row); fresh.push(row);
  }
  if (rows.length) await sb('strategy_picks?on_conflict=date,strategy_id,pid,mk', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
  const names = Object.fromEntries(st.strategies.map((s: any) => [s.id, s.name]));
  const alertas = silent ? 0 : await alert(fresh, names).catch(e => { console.error('alerta', e); return 0; });
  return { ok: true, date: st.date, gravadas: rows.length, novas: fresh.length, alertas };
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
