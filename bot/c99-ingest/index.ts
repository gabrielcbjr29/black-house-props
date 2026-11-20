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
// 20/11: cada leitura nova da 99play dispara o pipeline na hora (sem esperar o horário fixo), com o token do GitHub
// guardado em bot_config.GH_DISPATCH (só permissão de Actions neste repositório). No máximo 1 disparo a cada 8 min.
async function cfgVal(k: string) { return (await sb(`bot_config?key=eq.${k}&select=value`).catch(() => null))?.[0]?.value ?? null; }
export async function ghDispatch(minGapMin = 8): Promise<string> {
  const tok = await cfgVal('GH_DISPATCH'); if (!tok) return 'sem token';
  const last = Date.parse(await cfgVal('GH_LAST') ?? ''); if (last && Date.now() - last < minGapMin * 6e4) return 'já disparado há pouco';
  const r = await fetch('https://api.github.com/repos/gabrielcbjr29/black-house-props/actions/workflows/atualizar.yml/dispatches', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'User-Agent': 'blackhouse-bot', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
  if (r.status !== 204) return 'erro ' + r.status;
  await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'GH_LAST', value: new Date().toISOString() }) }).catch(() => null);
  return 'ok';
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      // instalação e atualização automática do leitor (19/11): .../c99-ingest/leitor99.user.js?token=<C99_TOKEN>
      // devolve o script do repositório com o token e o próprio endereço (para o Tampermonkey buscar as versões novas)
      // o mesmo para o script da Finta (.../c99-ingest/finta.user.js?token=...)
      const script = /\/(leitor99|finta)\.user\.js$/.exec(url.pathname)?.[1];
      if (script) {
        const tok = (await sb('bot_config?key=eq.C99_TOKEN&select=value'))?.[0]?.value;
        if (!tok || url.searchParams.get('token') !== tok) return new Response('token inválido', { status: 403 });
        const src = await fetch(`https://raw.githubusercontent.com/gabrielcbjr29/black-house-props/main/tools/navegador/${script}.user.js?t=` + Date.now()).then(r => r.text());
        const self = `https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest/${script}.user.js?token=${encodeURIComponent(tok)}`;
        return new Response(src.replaceAll('__C99_TOKEN__', tok).replaceAll('__C99_SELF__', self), { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      // "Ler 99play agora" (bot /combo): o leitor confere a cada minuto se há pedido mais novo que a última leitura
      if (url.searchParams.get('pedido')) return json({ pedido: (await sb('bot_config?key=eq.C99_PEDIDO&select=value'))?.[0]?.value ?? null });
      // hora da última leitura (leve, para o bot explicar a pauta vazia)
      if (url.searchParams.get('ultima')) { const r = await sb('c99_snapshots?select=taken_at,n_events,versao:payload->>versao&order=taken_at.desc&limit=1'); return json(r?.[0] ?? null); }
      if (!url.searchParams.get('latest')) return json({ ok: true });
      const r = await sb('c99_snapshots?select=taken_at,n_events,n_markets,payload&order=taken_at.desc&limit=1');
      return json(r?.[0] ?? { payload: null });
    }
    const tok = (await sb('bot_config?key=eq.C99_TOKEN&select=value'))?.[0]?.value;
    if (!tok || url.searchParams.get('token') !== tok) return json({ ok: false, erro: 'token' }, 403);
    const raw = await req.text();
    // captura do Criar Aposta (99play) / Criador de Aposta (Finta), lida passivamente pelos scripts do navegador
    if (url.searchParams.get('captura')) {
      if (raw.length > 400_000) return json({ ok: false, erro: 'grande demais' }, 413);
      const c = JSON.parse(raw);
      if (!['99play', 'finta'].includes(c?.casa)) return json({ ok: false, erro: 'casa' }, 400);
      await sb('capturas', { method: 'POST', body: JSON.stringify({ casa: c.casa, fonte: String(c.fonte ?? '').slice(0, 200), odd: +c.odd > 1 ? +c.odd : null, pernas: c.pernas ?? null, bruto: c.bruto ?? null }) });
      return json({ ok: true });
    }
    if (raw.length > 6_000_000) return json({ ok: false, erro: 'grande demais' }, 413);
    const p = JSON.parse(raw);
    if (!Array.isArray(p?.events) || typeof p?.details !== 'object') return json({ ok: false, erro: 'formato' }, 400);
    const nm = Object.values(p.details as Record<string, any>).reduce((a: number, d: any) => a + (d?.childMarkets?.length || 0), 0);
    await sb('c99_snapshots', { method: 'POST', body: JSON.stringify({ n_events: p.events.length, n_markets: nm, payload: p }) });
    const rodada = await Promise.race([ghDispatch().catch(e => 'erro ' + e.message), new Promise<string>(r => setTimeout(() => r('sem resposta'), 6000))]);
    // guarda todas as fotos: são o histórico de linhas reais da 99play para testar estratégias (backtest e CLV)
    return json({ ok: true, jogos: p.events.length, mercados: nm, rodada });
  } catch (e) { return json({ ok: false, erro: String((e as Error).message) }, 500); }
});
