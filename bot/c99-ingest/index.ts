// Recebe as linhas de jogador da 99play lidas pelo navegador do app Claude no computador do usuário
// (tarefa agendada) e guarda no banco. A coleta do GitHub lê a foto mais recente por GET ?latest=1.
// POST: corpo {events, competitors, details} já filtrado (só NBA e mercados de jogador), com ?token=<C99_TOKEN>.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      if (!url.searchParams.get('latest')) return json({ ok: true });
      const r = await sb('c99_snapshots?select=taken_at,n_events,n_markets,payload&order=taken_at.desc&limit=1');
      return json(r?.[0] ?? { payload: null });
    }
    const tok = (await sb('bot_config?key=eq.C99_TOKEN&select=value'))?.[0]?.value;
    if (!tok || url.searchParams.get('token') !== tok) return json({ ok: false, erro: 'token' }, 403);
    const raw = await req.text();
    if (raw.length > 6_000_000) return json({ ok: false, erro: 'grande demais' }, 413);
    const p = JSON.parse(raw);
    if (!Array.isArray(p?.events) || typeof p?.details !== 'object') return json({ ok: false, erro: 'formato' }, 400);
    const nm = Object.values(p.details as Record<string, any>).reduce((a: number, d: any) => a + (d?.childMarkets?.length || 0), 0);
    await sb('c99_snapshots', { method: 'POST', body: JSON.stringify({ n_events: p.events.length, n_markets: nm, payload: p }) });
    // guarda todas as fotos: são o histórico de linhas reais da 99play para testar estratégias (backtest e CLV)
    return json({ ok: true, jogos: p.events.length, mercados: nm });
  } catch (e) { return json({ ok: false, erro: String((e as Error).message) }, 500); }
});
