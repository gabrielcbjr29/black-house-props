// Leitor das linhas de jogador da 99play. Roda na aba da 99play no navegador do app Claude, no computador
// do usuário (tarefa agendada), e manda a foto para a função c99-ingest do Supabase.
// Uso: abrir https://99play.io/ e executar este código com TOKEN = valor de C99_TOKEN (tabela bot_config).
(async (TOKEN) => {
  const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget/';
  const TYPES = new Set([768, 772, 770, 774, 773, 771, 25050, 2312, 2313, 2314, 2315, 2317, 2318, 2322, 30070, 30071, 30072, 30073, 30078]);
  const qs = x => new URLSearchParams({ culture: 'pt-BR', timezoneOffset: '180', integration: '24games1', deviceType: '1', numFormat: 'en-GB', countryCode: 'BR', ...x });
  const get = async p => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status); return r.json(); };
  const ev = await get('GetEvents?' + qs({ eventCount: '0', sportId: '0', champIds: '2980' }));
  const now = Date.now();
  const events = (ev.events || []).filter(e => e.champId === 2980 && Date.parse(e.startDate) > now && Date.parse(e.startDate) < now + 36 * 3600e3)
    .map(e => ({ id: e.id, champId: e.champId, startDate: e.startDate, competitorIds: e.competitorIds }));
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
  const body = { at: new Date(now).toISOString(), events, competitors: (ev.competitors || []).map(c => ({ id: c.id, name: c.name, abbreviation: c.abbreviation })), details, erros };
  const r = await fetch('https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest?token=' + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { envio: r.status, resposta: await r.json(), jogos: events.length, erros };
})(TOKEN);
