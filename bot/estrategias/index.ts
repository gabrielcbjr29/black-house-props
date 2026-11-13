// Fábrica de estratégias: registra em papel as entradas do dia de cada estratégia (public/data/strategies.json),
// confere com os resultados (results.json) e entrega o relatório (CSV para a planilha, JSON para o bot/painel).
//   ?record=<WEBHOOK_SECRET>  grava/atualiza as entradas dos jogos que ainda não começaram (pg_cron, a cada 30 min)
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

async function record() {
  const st = await getJ('strategies.json');
  if (!st?.picks) return { ok: false, erro: 'strategies.json indisponível' };
  if (st.date !== etDate()) return { ok: true, skip: `dados de ${st.date}` };
  // estratégias: cria as novas, atualiza nome/descrição (o histórico fica pela id)
  await sb('strategies?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(st.strategies.map((s: any) => ({ id: s.id, name: s.name, descr: s.descr, markets: s.markets, updated_at: new Date().toISOString() }))) });
  const now = Date.now();
  const rows = st.picks.filter((p: any) => !p.tip_utc || Date.parse(p.tip_utc) > now + 5 * 6e4) // jogo começado: fica a última gravada
    .map((p: any) => ({ date: st.date, ...p, stat: MK2STAT[p.mk], odd: p.odd ?? ODD_EST, odd_src: p.odd ? p.odd_src : 'estimada', updated_at: new Date().toISOString() }));
  if (rows.length) await sb('strategy_picks?on_conflict=date,strategy_id,pid,mk', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
  return { ok: true, date: st.date, gravadas: rows.length };
}
async function settle() {
  const res = await getJ('results.json'); if (!res?.stats) return { ok: false, erro: 'results.json indisponível' };
  const open: any[] = await sb('strategy_picks?status=eq.aberta&select=id,date,pid,stat,side,line,odd') ?? [];
  let n = 0;
  for (const r of open) {
    if (!res.dates?.includes(r.date)) continue;
    const a = res.stats[r.date]?.[r.pid];
    let status = 'void', result: number | null = null;
    if (a && a[0] > 0) { result = String(r.stat).split('+').reduce((s, k) => s + (IDX[k]?.(a) ?? 0), 0); status = result === +r.line ? 'void' : (r.side === 'o' ? result > +r.line : result < +r.line) ? 'green' : 'red'; }
    const profit = status === 'green' ? Math.round(((+r.odd || ODD_EST) - 1) * 100) / 100 : status === 'red' ? -1 : 0;
    await sb(`strategy_picks?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ status, result, profit, settled_at: new Date().toISOString() }) }).catch(() => null);
    n++;
  }
  return { ok: true, conferidas: n };
}
Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  try {
    const secret = await cfg('WEBHOOK_SECRET');
    if (u.searchParams.get('record') && u.searchParams.get('record') === secret) return json(await record());
    if (u.searchParams.get('settle') && u.searchParams.get('settle') === secret) return json(await settle());
    if (u.searchParams.get('stats')) return json(await sb('strategy_stats?select=*&order=lucro.desc.nullslast'));
    const rep = await cfg('REPORT_TOKEN');
    if (rep && u.searchParams.get('csv') === rep) {
      const rows: any[] = await sb('strategy_picks?select=*,strategies(name)&order=date.asc,strategy_id.asc,id.asc&limit=20000') ?? [];
      const head = ['data', 'estrategia', 'jogador', 'time', 'adversario', 'mercado', 'lado', 'linha', 'odd', 'fonte_odd', 'chance_modelo', 'valor_esperado', 'nota', 'resultado', 'status', 'lucro_u', 'linha_abertura', 'clv_linha'];
      const q = (x: unknown) => { const t = x == null ? '' : String(x); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const ST: Record<string, string> = { aberta: 'Aberta', green: 'Green', red: 'Red', void: 'Anulada' };
      const body = rows.map(r => [r.date, r.strategies?.name ?? r.strategy_id, r.name, r.team, r.opp, r.mk, r.side === 'o' ? 'Mais' : 'Menos', r.line, r.odd, r.odd_src, r.p, r.edge, r.nota, r.result, ST[r.status] ?? r.status, r.status === 'aberta' ? '' : r.profit, r.open_line, r.clv_line]);
      return new Response([head, ...body].map(l => l.map(q).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }
    return json({ ok: true });
  } catch (e) { return json({ ok: false, erro: String((e as Error).message) }, 500); }
});
