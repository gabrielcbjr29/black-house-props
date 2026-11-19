// ==UserScript==
// @name         Black House · Finta (Criador de Aposta)
// @namespace    blackhouse
// @version      1.0
// @description  Na Finta, lê sem clicar em nada a odd total que o Criador de Aposta mostra quando você monta o bilhete e manda para o Black House (para comparar com a 99play e calibrar o /combo).
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
})();
