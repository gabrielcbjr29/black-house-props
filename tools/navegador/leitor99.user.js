// ==UserScript==
// @name         Black House · leitor 99play
// @namespace    blackhouse
// @version      1.4
// @description  Enquanto uma aba da 99play estiver aberta, lê as linhas de jogador da NBA (com a escada de marcos e o duplo/triplo-duplo) e manda para o Black House: de hora em hora, a cada 15 min nas 3h antes dos jogos e na hora em que você pedir no bot. Desde a 1.4 também lê, de 30 em 30 min, as linhas de futebol (chutes, chutes ao gol e defesas; time e jogo) e manda para o Black House Futebol. Também lê, sem clicar em nada, a odd total do Criar Aposta que a 99play mostra quando você monta o bilhete.
// @match        https://99play.io/*
// @match        https://99play.im/*
// @match        https://*.99play.im/*
// @match        https://*.biahosted.com/*
// @updateURL    __C99_SELF__
// @downloadURL  __C99_SELF__
// @grant        none
// @run-at       document-start
// ==/UserScript==
// Roda dentro da página da 99play, no seu navegador, exatamente como o próprio site busca as linhas
// (a 99play recusa pedidos que não venham do site). Instale com o Tampermonkey e deixe uma aba fixada.
// O script nunca clica, monta bilhete ou aposta: só lê o que a página já recebe.
(() => {
  const TOKEN = '__C99_TOKEN__';
  const API = 'https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest';
  const KEY = 'bh_leitor99_ultimo', LOCK = 'bh_leitor99_lock', PROX = 'bh_leitor99_prox';
  const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget/';
  const TYPES = new Set([768, 772, 770, 774, 773, 771, 25050, 2312, 2313, 2314, 2315, 2317, 2318, 2322, 30070, 30071, 30072, 30073, 30078]);
  const qs = x => new URLSearchParams({ culture: 'pt-BR', timezoneOffset: '180', integration: '24games1', deviceType: '1', numFormat: 'en-GB', countryCode: 'BR', ...x });
  const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const isTop = /(^|\.)99play\.(io|im)$/.test(location.hostname) && window.top === window;

  // ---------- captura passiva do Criar Aposta (1.3): lê a resposta que a própria página recebe ----------
  // Só respostas com cara de preço de bilhete/criar aposta. Tira qualquer campo pessoal antes de mandar.
  const RX = /bet\s*builder|betbuilder|builder|calculat|betslip|bet-slip|quote|combin|placewidget|getodds/i;
  const PRIV = /token|session|user|balance|saldo|email|cpf|phone|telefone|account|conta|wallet|cookie|auth|password|senha/i;
  const clean = (x, d = 0) => {
    if (d > 8 || x == null) return x;
    if (Array.isArray(x)) return x.slice(0, 60).map(v => clean(v, d + 1));
    if (typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) if (!PRIV.test(k)) o[k] = clean(v, d + 1); return o; }
    return typeof x === 'string' ? x.slice(0, 300) : x;
  };
  let lastCap = '', lastCapAt = 0;
  const capture = (url, reqBody, resText) => {
    try {
      if (!RX.test(url) || !resText || resText.length > 400000) return;
      const res = JSON.parse(resText); const sig = url.split('?')[0] + resText.length + resText.slice(0, 200);
      if (sig === lastCap && Date.now() - lastCapAt < 15000) return; lastCap = sig; lastCapAt = Date.now();
      let req = null; try { req = typeof reqBody === 'string' ? JSON.parse(reqBody) : null; } catch { req = typeof reqBody === 'string' ? reqBody.slice(0, 2000) : null; }
      const body = JSON.stringify({ casa: '99play', fonte: url.split('?')[0].slice(0, 200), bruto: clean({ req, res }) }).slice(0, 300000);
      of(API + '?captura=1&token=' + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => {});
    } catch { /* resposta que não é JSON: ignora */ }
  };
  const of = window.fetch;
  window.fetch = async function (input, init) {
    const r = await of.apply(this, arguments);
    try { const url = typeof input === 'string' ? input : input?.url || ''; if (RX.test(url)) r.clone().text().then(t => capture(url, init?.body, t)).catch(() => {}); } catch {}
    return r;
  };
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this.__bhUrl = String(url || ''); return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    if (RX.test(this.__bhUrl || '')) this.addEventListener('load', () => { try { capture(this.__bhUrl, b, typeof this.response === 'string' ? this.response : JSON.stringify(this.response)); } catch {} });
    return xs.apply(this, arguments);
  };
  // segunda fonte: o painel do Criar Aposta na tela (caso o preço não venha por fetch/XHR). Manda o trecho do painel
  // quando ele muda; o Black House separa pernas e odd total.
  let lastTela = '';
  const tela = () => {
    try {
      const txt = document.body?.innerText || ''; const i = txt.search(/criar aposta/i); if (i < 0) return;
      const bloco = txt.slice(i, i + 1500), m = /(odds?|cota[çc][aã]o)\s*(total)?\s*:?\s*([\d]+[.,][\d]+)/i.exec(bloco); if (!m) return;
      const sig = bloco.replace(/\s+/g, ' '); if (sig === lastTela) return; lastTela = sig;
      of(API + '?captura=1&token=' + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ casa: '99play', fonte: 'tela', odd: parseFloat(m[3].replace(',', '.')), bruto: { tela: sig } }) }).catch(() => {});
    } catch { /* tela sem o painel */ }
  };
  const obs = () => { if (!document.body) return; new MutationObserver(() => { clearTimeout(window.__bhT); window.__bhT = setTimeout(tela, 800); }).observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', obs); else obs();
  if (!isTop) return; // no quadro do sportsbook só captura; a leitura roda na aba principal

  // ---------- leitura das linhas ----------
  const get = async p => { const r = await of(BASE + p); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status); return r.json(); };
  let badge = null;
  const show = (txt, ok = true) => {
    if (!document.body) return;
    if (!badge) { badge = document.createElement('div'); badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;background:#111;color:#9f9;padding:4px 8px;border-radius:6px;opacity:.85;pointer-events:none'; }
    badge.textContent = 'BH ' + txt + futTxt; badge.style.color = ok ? '#9f9' : '#f99'; if (!badge.isConnected) document.body.appendChild(badge);
  };
  async function ler(motivo = '') {
    const lock = +localStorage.getItem(LOCK) || 0;
    if (Date.now() - lock < 5 * 60e3) return; // outra aba já está lendo
    localStorage.setItem(LOCK, String(Date.now()));
    show('lendo as linhas…' + (motivo ? ` (${motivo})` : ''));
    try {
      const ev = await get('GetEvents?' + qs({ eventCount: '0', sportId: '0', champIds: '2980' }));
      const now = Date.now();
      const events = (ev.events || []).filter(e => e.champId === 2980 && Date.parse(e.startDate) > now && Date.parse(e.startDate) < now + 36 * 3600e3)
        .map(e => ({ id: e.id, champId: e.champId, startDate: e.startDate, competitorIds: e.competitorIds }));
      localStorage.setItem(PROX, JSON.stringify(events.map(e => Date.parse(e.startDate))));
      if (!events.length) { localStorage.setItem(KEY, String(now)); show(`${hhmm(now)} · sem jogos abertos`); return; }
      const details = {}, erros = [];
      for (const e of events) {
        try {
          const d = await get('GetEventDetails?' + qs({ eventId: String(e.id) }));
          const cm = (d.childMarkets || []).filter(m => TYPES.has(m.typeId)).map(m => ({ typeId: m.typeId, childName: m.childName, sv: m.sv, desktopOddIds: m.desktopOddIds }));
          const ids = new Set(cm.flatMap(m => (m.desktopOddIds || []).flat()));
          // marcos (5+/7+/10+…), duplo e triplo-duplo e outros mercados de jogador, à parte, com o nome do mercado e de cada odd
          const xm = [...(d.childMarkets || []), ...(d.markets || [])].filter(m => !TYPES.has(m.typeId) && (m.childName || /\+|marco|milestone|duplo|double|triplo|triple/i.test(m.name || '')))
            .map(m => ({ id: m.id, typeId: m.typeId, name: m.name, childName: m.childName, sv: m.sv, desktopOddIds: m.desktopOddIds }));
          const xids = new Set(xm.flatMap(m => (m.desktopOddIds || []).flat()));
          details[e.id] = { childMarkets: cm, odds: (d.odds || []).filter(o => ids.has(o.id)).map(o => ({ id: o.id, typeId: o.typeId, price: o.price, oddStatus: o.oddStatus })),
            extra: { markets: xm, odds: (d.odds || []).filter(o => xids.has(o.id)).map(o => ({ id: o.id, typeId: o.typeId, name: o.name, sv: o.sv, price: o.price, oddStatus: o.oddStatus })) } };
        } catch (err) { erros.push(e.id + ': ' + err.message); }
        await new Promise(r => setTimeout(r, 400)); // sem pressa: um jogo de cada vez
      }
      const body = { at: new Date(now).toISOString(), fonte: 'navegador', versao: '1.3', motivo, events, competitors: (ev.competitors || []).map(c => ({ id: c.id, name: c.name, abbreviation: c.abbreviation })), details, erros };
      const r = await of(API + '?token=' + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('envio ' + r.status);
      localStorage.setItem(KEY, String(now));
      show(`${hhmm(now)} · ${j.jogos} jogos, ${j.mercados} mercados ✓`);
    } catch (err) {
      show(`${hhmm(Date.now())} · erro: ${err.message} (tento de novo em 10 min)`, false);
      localStorage.setItem(KEY, String(Date.now() - 50 * 60e3)); // nova tentativa em ~10 min
    } finally { localStorage.removeItem(LOCK); }
  }

  // ---------- futebol (1.4, 28/11): as mesmas chamadas, para o projeto Black House Futebol ----------
  // Ligas do projeto de futebol (champIds da Altenar) e mercados: jogador (só MAIS), time e jogo (MAIS e MENOS).
  // Vai para a função "linhas" do futebol com o mesmo token deste script (o futebol confere o token com a função da NBA).
  const FUT = 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/linhas?token=';
  const FKEY = 'bh_leitor99_fut_ultimo', FLOCK = 'bh_leitor99_fut_lock';
  const CHAMPS = { 2936: 'Premier League', 2941: 'La Liga', 2942: 'Serie A', 2950: 'Bundesliga', 2943: 'Ligue 1', 11318: 'Brasileirão', 16808: 'Champions League', 16809: 'Europa League', 31608: 'Conference League' };
  const FPLAYER = { 15735: 'SH', 15734: 'SOT', 17938: 'SV' };
  const FTEAM = { 15728: ['TSH', 0], 15729: ['TSH', 1], 15726: ['TSOT', 0], 15727: ['TSOT', 1] };
  const FMATCH = { 15738: 'JSH', 15737: 'JSOT' };
  const lineOf = o => +(String(o.name).match(/(\d+(?:[.,]\d+)?)/)?.[1] ?? '').replace(',', '.');
  let futTxt = '';
  async function lerFut() {
    if (Date.now() - (+localStorage.getItem(FLOCK) || 0) < 5 * 60e3 || Date.now() - (+localStorage.getItem(LOCK) || 0) < 5 * 60e3) return; // uma leitura de cada vez
    localStorage.setItem(FLOCK, String(Date.now()));
    try {
      const ev = await get('GetEvents?' + qs({ eventCount: '0', sportId: '66', champIds: Object.keys(CHAMPS).join(',') }));
      const now = Date.now(), comp = Object.fromEntries((ev.competitors || []).map(c => [c.id, c.name]));
      const events = (ev.events || []).filter(e => CHAMPS[e.champId] && Date.parse(e.startDate) > now && Date.parse(e.startDate) < now + 36 * 3600e3);
      const lines = [];
      for (const e of events) {
        try {
          const d = await get('GetEventDetails?' + qs({ eventId: String(e.id) }));
          const names = (d.competitors || []).map(c => c.name), [home, away] = names.length === 2 ? names : (e.competitorIds || []).map(i => comp[i]);
          const base = { home, away, utc: e.startDate, league: CHAMPS[e.champId] };
          const odds = Object.fromEntries((d.odds || []).map(o => [o.id, o]));
          const pick = (m, t) => (m.desktopOddIds || []).flat().map(i => odds[i]).filter(o => o && o.typeId === t && !o.oddStatus && o.price > 1);
          const team = Object.fromEntries((d.competitors || []).map(c => [c.id, c.name]));
          for (const m of d.childMarkets || []) {
            const mk = FPLAYER[m.typeId]; if (!mk || !m.childName) continue;
            for (const o of pick(m, 12)) lines.push({ ...base, type: 'player', player: m.childName, team: team[m.competitorId], mk, line: lineOf(o), odd: o.price });
          }
          const seen = new Set();
          for (const m of d.markets || []) {
            if (seen.has(m.id)) continue; seen.add(m.id);
            if (FTEAM[m.typeId]) {
              const [mk, side] = FTEAM[m.typeId], tn = names.find(n => String(m.name).includes(n)) ?? (side ? away : home);
              for (const o of pick(m, 12)) lines.push({ ...base, type: 'team', team: tn, mk, line: lineOf(o), odd: o.price });
              for (const o of pick(m, 13)) lines.push({ ...base, type: 'team', team: tn, mk, line: lineOf(o), odd: o.price, side: 'u' });
            } else if (FMATCH[m.typeId]) {
              for (const o of pick(m, 12)) lines.push({ ...base, type: 'match', mk: FMATCH[m.typeId], line: lineOf(o), odd: o.price });
              for (const o of pick(m, 13)) lines.push({ ...base, type: 'match', mk: FMATCH[m.typeId], line: lineOf(o), odd: o.price, side: 'u' });
            }
          }
        } catch { /* um jogo com erro não para os outros */ }
        await new Promise(r => setTimeout(r, 400));
      }
      const key = x => [x.home, x.away, x.type, x.player ?? x.team ?? '', x.mk, x.line, x.side ?? 'o'].join('|'), u = new Map();
      for (const x of lines) if (x.line >= 0) u.set(key(x), x);
      if (u.size) {
        const r = await of(FUT + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ house: '99play', lines: [...u.values()] }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error('envio ' + r.status);
        futTxt = ` · ⚽ ${hhmm(now)} ${j.linhas} linhas`;
      } else futTxt = ` · ⚽ ${hhmm(now)} sem linhas`;
      localStorage.setItem(FKEY, String(now));
    } catch (err) {
      futTxt = ` · ⚽ erro ${err.message}`;
      localStorage.setItem(FKEY, String(Date.now() - 20 * 60e3)); // tenta de novo em ~10 min
    } finally { localStorage.removeItem(FLOCK); if (badge?.isConnected) badge.textContent = badge.textContent.replace(/ · ⚽.*$/, '') + futTxt; }
  }
  const dueFut = () => Date.now() - (+localStorage.getItem(FKEY) || 0) > 30 * 60e3;

  // ritmo: a cada 15 min se algum jogo começa nas próximas 3h; senão de hora em hora (a partir dos :35)
  const last = () => +localStorage.getItem(KEY) || 0;
  const perto = () => { try { const n = Date.now(); return JSON.parse(localStorage.getItem(PROX) || '[]').some(t => t > n && t - n < 3 * 3600e3); } catch { return false; } };
  const due = () => { const a = Date.now() - last(); return perto() ? a > 15 * 60e3 : a > 60 * 60e3 || (new Date().getMinutes() >= 35 && a > 50 * 60e3); };
  // "Ler 99play agora" no bot: o leitor confere o pedido a cada minuto
  async function pedido() {
    try { const j = await of(API + '?pedido=1').then(r => r.json()); const t = Date.parse(j?.pedido || ''); if (t && t > last() && Date.now() - t < 15 * 60e3) await ler('pedido no bot'); } catch { /* sem rede: tenta no próximo minuto */ }
  }
  const start = () => {
    setTimeout(() => { if (Date.now() - last() > 50 * 60e3) ler(); else show(`última leitura ${hhmm(last())} ✓`); }, 8000);
    setInterval(() => { if (due()) ler(perto() ? 'perto do jogo' : ''); else if (dueFut()) lerFut(); else pedido(); }, 60e3);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
