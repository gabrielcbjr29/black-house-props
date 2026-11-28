// ==UserScript==
// @name         Black House · Finta (Criador de Aposta)
// @namespace    blackhouse
// @version      1.1
// @description  Na Finta, lê sem clicar em nada a odd total que o Criador de Aposta mostra quando você monta o bilhete e manda para o Black House (para comparar com a 99play e calibrar o /combo). Desde a 1.1 também lê, de 30 em 30 min, as linhas de futebol (chutes, no gol, faltas, desarmes e defesas do jogador; time e jogo) para o Black House Futebol.
// @match        https://finta.win/*
// @match        https://*.finta.win/*
// @updateURL    __C99_SELF__
// @downloadURL  __C99_SELF__
// @grant        none
// @run-at       document-start
// ==/UserScript==
// As linhas da Finta já são lidas pela coleta (JSON público). Este script serve só para o preço do combo, que a Finta
// calcula na hora em que você junta as seleções. Ele nunca clica, monta bilhete ou aposta: só lê o que a página recebe.
(() => {
  const TOKEN = '__C99_TOKEN__';
  const API = 'https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest';
  // rotas com cara de preço do bilhete / criador de aposta (o resto da página é ignorado)
  const RX = /\/bb\b|bet\s*builder|betbuilder|builder|criador|quote|cotac|price|pricing|slip|cupom|bilhete|combo|calcul/i;
  const SKIP = /\/public\/(lobby|match)\b/i; // as linhas públicas a coleta já lê
  const PRIV = /token|session|user|balance|saldo|email|cpf|phone|telefone|account|conta|wallet|cookie|auth|password|senha|pix/i;
  const clean = (x, d = 0) => {
    if (d > 8 || x == null) return x;
    if (Array.isArray(x)) return x.slice(0, 60).map(v => clean(v, d + 1));
    if (typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) if (!PRIV.test(k)) o[k] = clean(v, d + 1); return o; }
    return typeof x === 'string' ? x.slice(0, 300) : x;
  };
  let lastCap = '', lastCapAt = 0;
  const capture = (url, reqBody, resText) => {
    try {
      if (!RX.test(url) || SKIP.test(url) || !resText || resText.length > 400000) return;
      const res = JSON.parse(resText); const sig = url.split('?')[0] + resText.length + resText.slice(0, 200);
      if (sig === lastCap && Date.now() - lastCapAt < 15000) return; lastCap = sig; lastCapAt = Date.now();
      let req = null; try { req = typeof reqBody === 'string' ? JSON.parse(reqBody) : null; } catch { req = typeof reqBody === 'string' ? reqBody.slice(0, 2000) : null; }
      const body = JSON.stringify({ casa: 'finta', fonte: url.split('?')[0].slice(0, 200), bruto: clean({ req, res }) }).slice(0, 300000);
      of(API + '?captura=1&token=' + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => {});
    } catch { /* não é JSON: ignora */ }
  };
  const of = window.fetch;
  window.fetch = async function (input, init) {
    const r = await of.apply(this, arguments);
    try { const url = typeof input === 'string' ? input : input?.url || ''; if (RX.test(url) && !SKIP.test(url)) r.clone().text().then(t => capture(url, init?.body, t)).catch(() => {}); } catch {}
    return r;
  };
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this.__bhUrl = String(url || ''); return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    if (RX.test(this.__bhUrl || '') && !SKIP.test(this.__bhUrl || '')) this.addEventListener('load', () => { try { capture(this.__bhUrl, b, typeof this.response === 'string' ? this.response : JSON.stringify(this.response)); } catch {} });
    return xs.apply(this, arguments);
  };
  // a Finta também mostra a odd total na tela (ex.: "Odds total 38.91"): lê o painel do Criador quando ele muda,
  // junto com as seleções, como segunda fonte (caso o preço venha por WebSocket e não por fetch)
  let lastTela = '';
  const tela = () => {
    try {
      const txt = document.body?.innerText || ''; if (!/criador de aposta/i.test(txt)) return;
      const m = /odds?\s*total\s*([\d.,]+)/i.exec(txt); if (!m) return;
      const odd = parseFloat(m[1].replace(',', '.')); if (!(odd > 1)) return;
      const bloco = txt.slice(Math.max(0, txt.search(/criador de aposta/i)), m.index + m[0].length).slice(0, 1500);
      const sig = bloco.replace(/\s+/g, ' '); if (sig === lastTela) return; lastTela = sig;
      of(API + '?captura=1&token=' + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ casa: 'finta', fonte: 'tela', odd, bruto: { tela: sig } }) }).catch(() => {});
    } catch { /* tela sem o painel */ }
  };
  const start = () => { new MutationObserver(() => { clearTimeout(window.__bhT); window.__bhT = setTimeout(tela, 800); }).observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // ---------- futebol (1.1, 28/11): linhas para o Black House Futebol ----------
  // Lê o mesmo JSON público que a própria página da Finta usa (lobby e jogo), um jogo por segundo, de 30 em 30 min.
  // Manda para a função "linhas" do futebol com o token deste script (o futebol confere o token com a função da NBA).
  if (window.top !== window) return;
  const FUT = 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/linhas?token=';
  const FKEY = 'bh_fut_finta_ultimo', FLOCK = 'bh_fut_finta_lock';
  const LIGAS = { 'England. Premier League': 'Premier League', 'Spain. Primera': 'La Liga', 'Italy. Serie A': 'Serie A', 'Germany. Bundesliga': 'Bundesliga', 'France. Ligue 1': 'Ligue 1', 'Brazil. Serie A': 'Brasileirão' };
  const UEFA = /^(UEFA|Europe)\.\s*(Champions League|Europa League|Conference League)$/i;
  const ligaDe = l => LIGAS[l] ?? (UEFA.test(l) ? l.replace(/^.*?\.\s*/, '').replace(/^Conference League$/i, 'Conference League') : null);
  const PL = { 'Stats: Shots - Player': 'SH', 'Stats: Shots on goal - Player': 'SOT', 'Stats: Fouls - Player': 'FC', 'Stats: Tackles - Player': 'TK', 'Stats: Saves - Player': 'SV' };
  const TM = { 'Stats: Shots (all) - Home': ['TSH', 0], 'Stats: Shots (all) - Away': ['TSH', 1], 'Stats: Shots on goal - Home': ['TSOT', 0], 'Stats: Shots on goal - Away': ['TSOT', 1], 'Stats: Fouls - Home': ['TFC', 0], 'Stats: Fouls - Away': ['TFC', 1] };
  const JG = { 'Stats: Shots (all)': 'JSH', 'Stats: Shots on goal': 'JSOT', 'Stats: Fouls': 'JFC' };
  const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  let badge = null;
  const show = (txt, ok = true) => {
    if (!document.body) return;
    if (!badge) { badge = document.createElement('div'); badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;background:#111;color:#9f9;padding:4px 8px;border-radius:6px;opacity:.85;pointer-events:none'; }
    badge.textContent = 'BH ⚽ finta · ' + txt; badge.style.color = ok ? '#9f9' : '#f99'; if (!badge.isConnected) document.body.appendChild(badge);
  };
  const getJ = async p => { const r = await of(p); if (!r.ok) throw new Error(p.split('/').slice(-2).join('/') + ' ' + r.status); return r.json(); };
  async function lerFut() {
    if (Date.now() - (+localStorage.getItem(FLOCK) || 0) < 10 * 60e3) return; // outra aba já está lendo
    localStorage.setItem(FLOCK, String(Date.now()));
    show('lendo as linhas de futebol…');
    try {
      const lob = await getJ('/rs/finta/public/lobby'), now = Date.now();
      const games = (Array.isArray(lob.games) ? lob.games : Object.values(lob.games || {}))
        .filter(x => x.sport === 'Football' && ligaDe(x.league) && Date.parse(x.starts_at) > now && Date.parse(x.starts_at) < now + 36 * 3600e3);
      const lines = []; let erros = 0;
      for (const g of games) {
        try {
          const m = await getJ('/rs/finta/public/match/' + g.id);
          const base = { home: m.home, away: m.away, utc: m.starts_at, league: ligaDe(g.league) };
          for (const k of m.markets || []) {
            const sel = (k.selections || []).filter(x => !x.locked && x.odd > 1 && x.line != null);
            if (PL[k.market]) for (const x of sel) { const mm = /^(.*) over$/.exec(x.selection); if (mm) lines.push({ ...base, type: 'player', player: mm[1], mk: PL[k.market], line: +x.line, odd: x.odd }); }
            else if (TM[k.market]) { const [mk, side] = TM[k.market]; for (const x of sel) if (/^(over|under)$/.test(x.selection)) lines.push({ ...base, type: 'team', team: side ? m.away : m.home, mk, line: +x.line, odd: x.odd, ...(x.selection === 'under' ? { side: 'u' } : {}) }); }
            else if (JG[k.market]) for (const x of sel) if (/^(over|under)$/.test(x.selection)) lines.push({ ...base, type: 'match', mk: JG[k.market], line: +x.line, odd: x.odd, ...(x.selection === 'under' ? { side: 'u' } : {}) });
          }
        } catch { erros++; }
        await new Promise(r => setTimeout(r, 1000)); // sem pressa: um jogo por segundo
      }
      if (!lines.length) { localStorage.setItem(FKEY, String(now)); show(`${hhmm(now)} · ${games.length} jogos, nenhuma linha aberta`); return; }
      const r = await of(FUT + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ house: 'finta', lines }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('envio ' + r.status);
      localStorage.setItem(FKEY, String(now));
      show(`${hhmm(now)} · ${games.length} jogos, ${j.linhas} linhas ✓` + (erros ? ` (${erros} com erro)` : ''));
    } catch (err) {
      show(`${hhmm(Date.now())} · erro: ${err.message} (tento de novo em 10 min)`, false);
      localStorage.setItem(FKEY, String(Date.now() - 20 * 60e3));
    } finally { localStorage.removeItem(FLOCK); }
  }
  const fLast = () => +localStorage.getItem(FKEY) || 0;
  const fStart = () => {
    setTimeout(() => { if (Date.now() - fLast() > 25 * 60e3) lerFut(); else show(`última leitura ${hhmm(fLast())} ✓`); }, 15000);
    setInterval(() => { if (Date.now() - fLast() > 30 * 60e3) lerFut(); }, 60e3);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fStart); else fStart();
})();
