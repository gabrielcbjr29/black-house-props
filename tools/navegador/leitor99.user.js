// ==UserScript==
// @name         Black House · leitor 99play
// @namespace    blackhouse
// @version      1.0
// @description  Enquanto uma aba da 99play estiver aberta no seu navegador, lê as linhas de jogador da NBA de hora em hora (aos :35) e manda para o Black House.
// @match        https://99play.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
// Roda dentro da página da 99play, no seu navegador, exatamente como o próprio site busca as linhas
// (a 99play recusa pedidos que não venham do site). Instale com o Tampermonkey e deixe uma aba fixada.
(() => {
  const TOKEN = '__C99_TOKEN__';
  const KEY = 'bh_leitor99_ultimo', LOCK = 'bh_leitor99_lock';
  const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget/';
  const TYPES = new Set([768, 772, 770, 774, 773, 771, 25050, 2312, 2313, 2314, 2315, 2317, 2318, 2322, 30070, 30071, 30072, 30073, 30078]);
  const qs = x => new URLSearchParams({ culture: 'pt-BR', timezoneOffset: '180', integration: '24games1', deviceType: '1', numFormat: 'en-GB', countryCode: 'BR', ...x });
  const get = async p => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status); return r.json(); };
  const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  // selo discreto no canto da tela com o status da última leitura
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;background:#111;color:#9f9;padding:4px 8px;border-radius:6px;opacity:.85;pointer-events:none';
  const show = (txt, ok = true) => { badge.textContent = 'BH ' + txt; badge.style.color = ok ? '#9f9' : '#f99'; if (!badge.isConnected) document.body.appendChild(badge); };
  async function ler() {
    const lock = +localStorage.getItem(LOCK) || 0;
    if (Date.now() - lock < 5 * 60e3) return; // outra aba já está lendo
    localStorage.setItem(LOCK, String(Date.now()));
    show('lendo as linhas…');
    try {
      const ev = await get('GetEvents?' + qs({ eventCount: '0', sportId: '0', champIds: '2980' }));
      const now = Date.now();
      const events = (ev.events || []).filter(e => e.champId === 2980 && Date.parse(e.startDate) > now && Date.parse(e.startDate) < now + 36 * 3600e3)
        .map(e => ({ id: e.id, champId: e.champId, startDate: e.startDate, competitorIds: e.competitorIds }));
      if (!events.length) { localStorage.setItem(KEY, String(now)); show(`${hhmm(now)} · sem jogos abertos`); return; }
      const details = {}, erros = [];
      for (const e of events) {
        try {
          const d = await get('GetEventDetails?' + qs({ eventId: String(e.id) }));
          const cm = (d.childMarkets || []).filter(m => TYPES.has(m.typeId)).map(m => ({ typeId: m.typeId, childName: m.childName, sv: m.sv, desktopOddIds: m.desktopOddIds }));
          const ids = new Set(cm.flatMap(m => (m.desktopOddIds || []).flat()));
          details[e.id] = { childMarkets: cm, odds: (d.odds || []).filter(o => ids.has(o.id)).map(o => ({ id: o.id, typeId: o.typeId, price: o.price, oddStatus: o.oddStatus })) };
        } catch (err) { erros.push(e.id + ': ' + err.message); }
        await new Promise(r => setTimeout(r, 400)); // sem pressa: um jogo de cada vez
      }
      const body = { at: new Date(now).toISOString(), fonte: 'navegador', events, competitors: (ev.competitors || []).map(c => ({ id: c.id, name: c.name, abbreviation: c.abbreviation })), details, erros };
      const r = await fetch('https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest?token=' + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('envio ' + r.status);
      localStorage.setItem(KEY, String(now));
      show(`${hhmm(now)} · ${j.jogos} jogos, ${j.mercados} mercados ✓`);
    } catch (err) {
      show(`${hhmm(Date.now())} · erro: ${err.message} (tento de novo em 10 min)`, false);
      localStorage.setItem(KEY, String(Date.now() - 50 * 60e3)); // nova tentativa em ~10 min
    } finally { localStorage.removeItem(LOCK); }
  }
  // lê uma vez por hora, a partir dos :35 (e logo ao abrir, se a última leitura tiver mais de 50 min)
  const due = () => Date.now() - (+localStorage.getItem(KEY) || 0) > 60 * 60e3 || (new Date().getMinutes() >= 35 && Date.now() - (+localStorage.getItem(KEY) || 0) > 50 * 60e3);
  setTimeout(() => { const last = +localStorage.getItem(KEY) || 0; if (Date.now() - last > 50 * 60e3) ler(); else show(`última leitura ${hhmm(last)} ✓`); }, 8000);
  setInterval(() => { if (due()) ler(); }, 60e3);
})();
