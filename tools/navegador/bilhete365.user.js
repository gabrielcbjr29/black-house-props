// ==UserScript==
// @name         Black House · bilhete BR365
// @namespace    blackhouse
// @version      1.1
// @description  Monta na BR365 o cupom das entradas do canal que ainda estão sem bilhete pronto. VOCÊ confere e clica em "Fazer Aposta"; depois o script pega o código de compartilhar e manda para o bot trocar o link do post.
// @match        https://br365.io/*
// @match        https://*.br365.io/*
// @updateURL    __C99_SELF__
// @downloadURL  __C99_SELF__
// @grant        none
// @run-at       document-start
// ==/UserScript==
// Regra (CLAUDE.md, 24/11): o script monta o cupom e gera o share code, mas NUNCA clica em "Fazer Aposta",
// "Apostar" ou qualquer confirmação. Quem aposta é o usuário. Toda ação passa por clique(), que recusa esses botões.
(() => {
  const TOKEN = '__C99_TOKEN__';
  const API = 'https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest';
  const JOB = 'bh_bilhete_job', CFG = 'bh_bilhete_cfg';
  const PROIBIDO = /fazer\s*aposta|^apostar|confirmar|depositar|sacar|cash\s*out|encerrar/i;

  // ---------- escuta passiva da rede (antes do sportsbook carregar) ----------
  // 1) Storage/SaveValue: é onde o site cria o código quando se clica em "Compartilhar" numa aposta feita.
  // 2) POST no servidor do cupom com "place" no caminho: a aposta que VOCÊ confirmou.
  const ouvintes = new Set();
  const avisa = (tipo, dado) => ouvintes.forEach(f => { try { f(tipo, dado); } catch { } });
  const olha = (url, metodo, texto) => {
    try {
      if (/\/Storage\/SaveValue/i.test(url)) { const j = JSON.parse(texto); if (j && typeof j.Result === 'string' && /^[A-Za-z0-9]{6,20}$/.test(j.Result)) avisa('codigo', j.Result); }
      else if (/betslip/i.test(url) && /place/i.test(url) && /post/i.test(metodo || '')) { let j = null; try { j = JSON.parse(texto); } catch { } avisa('aposta', { ok: !(j && j.Error && (j.Error.Code || j.Error.Message)), j }); }
    } catch { }
  };
  const of = window.fetch;
  window.fetch = async function (input, init) {
    const r = await of.apply(this, arguments);
    try { const u = typeof input === 'string' ? input : input?.url || ''; if (/biahosted/i.test(u)) r.clone().text().then(t => olha(u, init?.method || input?.method || 'GET', t)).catch(() => { }); } catch { }
    return r;
  };
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__bhM = m; this.__bhU = String(u || ''); return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    if (/biahosted/i.test(this.__bhU || '')) this.addEventListener('load', () => { try { olha(this.__bhU, this.__bhM, typeof this.response === 'string' ? this.response : JSON.stringify(this.response)); } catch { } });
    return xs.apply(this, arguments);
  };
  if (window.top !== window) return;

  // ---------- utilidades ----------
  const dorme = ms => new Promise(r => setTimeout(r, ms));
  const nrm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const chaveNome = s => nrm(s).replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const raizes = () => [document, ...[...document.querySelectorAll('*')].filter(e => e.shadowRoot).map(e => e.shadowRoot)];
  const todos = sel => raizes().flatMap(r => [...r.querySelectorAll(sel)]);
  const txt = e => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  const espera = async (fn, ms = 15000, passo = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await dorme(passo); } return null; };
  const clique = el => {
    if (!el) throw new Error('não achei o botão');
    if (PROIBIDO.test(txt(el))) throw new Error('trava: o script não clica em "' + txt(el).slice(0, 30) + '"');
    el.scrollIntoView({ block: 'center' }); el.click();
  };
  const lerJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') ?? d; } catch { return d; } };
  const gravaJ = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const num = s => parseFloat(String(s).replace(',', '.'));

  // mercado do bot → título do bloco "Mais de/Menos de" na BR365 (mesma leitura do gabarito.js)
  const MKTS = [
    [/pontos?\s*[-+]\s*rebotes?\s*[-+]\s*assist/, 'PRA'], [/pontos?\s*[-+]\s*rebotes?/, 'PR'], [/pontos?\s*[-+]\s*assist/, 'PA'], [/rebotes?\s*[-+]\s*assist/, 'RA'],
    [/faltas?\s*(pessoais|cometidas)/, 'PF'], [/(bloqueios?|tocos?)\s*[-+]\s*roubos?|roubos?\s*[-+]\s*(tocos?|bloq)/, 'SB'],
    [/tentativas?\s*de\s*arremessos?\s*de\s*2|arremessos?\s*de\s*2[^\n]*tentad/, '2PA'], [/arremessos?\s*de\s*2\s*pontos?\s*convertid/, '2PM'],
    [/tentativas?\s*de\s*arremessos?\s*de\s*3|arremessos?\s*de\s*3[^\n]*tentad/, '3PA'],
    [/tentativas?\s*de\s*arremessos?\s*de\s*campo|arremessos?\s*de\s*campo\s*tentad/, 'FGA'], [/arremessos?\s*de\s*campo\s*convertid/, 'FGM'],
    [/(cestas?|arremessos?)\s*de\s*3|3\s*pt|3\s*pontos|tres\s*pontos/, '3PM'],
    [/lances?\s*livres?\s*convertid/, 'FTM'], [/(tentativas?\s*de\s*)?lances?\s*livres?/, 'FTA'],
    [/assist/, 'AST'], [/rebot/, 'REB'], [/roubos?\b/, 'STL'], [/tocos?\b|bloqueios?/, 'BLK'], [/perdas?\s*de\s*bola|turnovers?|erros?\b/, 'TOV'], [/pontos?\b/, 'PTS'],
  ];
  const mkDe = titulo => { const t = nrm(titulo); for (const [rx, mk] of MKTS) if (rx.test(t)) return mk; return null; };
  const MKN = { PTS: 'pontos', REB: 'rebotes', AST: 'assistências', '3PM': 'bolas de 3', PRA: 'pts+reb+ast', PR: 'pts+reb', PA: 'pts+ast', RA: 'reb+ast', FGM: 'arremessos convertidos', FGA: 'arremessos tentados', '2PM': 'arremessos de 2', '2PA': 'tentativas de 2', '3PA': 'tentativas de 3', FTM: 'lances livres convertidos', FTA: 'lances livres tentados', STL: 'roubos', BLK: 'tocos', SB: 'roubos+tocos', TOV: 'erros', PF: 'faltas' };
  const rotulo = l => `${l.name} ${l.side === 'o' ? 'mais' : 'menos'} ${String(l.line).replace('.', ',')} ${MKN[l.mk] ?? l.mk}`;

  // ---------- painel ----------
  let painel, lista, status;
  const css = `#bhB{position:fixed;right:12px;bottom:12px;z-index:2147483647;width:340px;max-height:70vh;display:flex;flex-direction:column;font:13px/1.35 system-ui,sans-serif;background:#111;color:#eee;border:1px solid #2a2;border-radius:10px;box-shadow:0 6px 24px #000a}
#bhB header{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#173;border-radius:10px 10px 0 0;font-weight:600}
#bhB header span{flex:1}#bhB button{font:inherit;cursor:pointer;border:0;border-radius:6px;padding:5px 9px;background:#2a2;color:#fff}
#bhB button.sec{background:#333}#bhB .lst{overflow:auto;padding:6px 10px}#bhB .it{padding:6px 0;border-bottom:1px solid #222}
#bhB .it b{color:#9f9}#bhB .st{padding:8px 10px;border-top:1px solid #222;white-space:pre-wrap}#bhB .st.err{color:#f99}
#bhB .alerta{background:#fd0;color:#111;font-weight:700;padding:8px;border-radius:6px;margin:6px 0}#bhB.min .lst,#bhB.min .st{display:none}`;
  function montaPainel() {
    if (painel?.isConnected) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    painel = document.createElement('div'); painel.id = 'bhB';
    painel.innerHTML = '<header><span>🎟️ BH · bilhetes</span><button class="sec" data-a="cfg" title="Valor da unidade">⚙️</button><button class="sec" data-a="atual">↻</button><button class="sec" data-a="min">–</button></header><div class="lst"></div><div class="st">Carregando as entradas…</div>';
    document.body.appendChild(painel);
    lista = painel.querySelector('.lst'); status = painel.querySelector('.st');
    painel.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'min') painel.classList.toggle('min');
      else if (a === 'atual') carrega();
      else if (a === 'cfg') { const c = lerJ(CFG, {}); const v = prompt('Valor de 1 unidade em R$ (vazio = não preencher a aposta):', c.unidade ?? ''); if (v !== null) { gravaJ(CFG, { ...c, unidade: v.trim() ? num(v) : null }); diz('Unidade: ' + (v.trim() ? 'R$ ' + v.trim() : 'não preencher')); } }
      else if (a === 'montar') montar(+e.target.dataset.id).catch(err => falha(err));
      else if (a === 'apostei') depoisDaAposta().catch(err => falha(err));
      else if (a === 'cancelar') { gravaJ(JOB, null); diz('Cancelado.'); carrega(); }
    });
  }
  const diz = (m, erro = false) => { if (!status) return; status.textContent = m; status.classList.toggle('err', erro); };
  const falha = err => { diz('⚠️ ' + (err?.message || err), true); console.warn('[BH bilhete]', err); };
  let entradas = [];
  async function carrega() {
    diz('Carregando as entradas…');
    try {
      const r = await of(API + '?bilhetes=1&token=' + TOKEN); if (!r.ok) throw new Error('bot respondeu ' + r.status);
      entradas = await r.json();
      const job = lerJ(JOB, null);
      lista.innerHTML = entradas.length ? entradas.map(p => `<div class="it"><b>#${p.id}</b> · ${p.canal} · ${p.kind === 'multipla' ? 'múltipla' : 'simples'} @${p.odd.toFixed(2)} · ${p.stake}u<br>${p.legs.map(rotulo).join('<br>')}<br><button data-a="montar" data-id="${p.id}">Montar cupom</button></div>`).join('') : '<div class="it">Nenhuma entrada sem bilhete agora.</div>';
      if (job) mostraEtapa(job); else diz(`${entradas.length} entrada(s) sem bilhete pronto.`);
    } catch (e) { falha(e); }
  }

  // ---------- montar o cupom ----------
  async function abreJogo(ev) {
    if (!new RegExp('event/' + ev + '\\b').test(location.hash)) location.hash = '#/sport/67/event/' + ev;
    // a BR365 às vezes mostra "Não foi possível carregar agora · Tentar de novo": clica sozinho até 3 vezes
    let tentativas = 0;
    const aba = await espera(() => {
      const ok = todos('button').find(b => txt(b) === 'Especiais de Jogadores'); if (ok) return ok;
      const denovo = todos('button,a').find(b => /^tentar de novo$/i.test(txt(b)));
      if (denovo && tentativas < 3 && Date.now() - (abreJogo.ultimo || 0) > 3000) { tentativas++; abreJogo.ultimo = Date.now(); diz(`A BR365 não carregou o jogo. Tentando de novo (${tentativas}/3)…`); denovo.click(); }
      return null;
    }, 30000);
    if (!aba) throw new Error('o jogo não abriu (evento ' + ev + ')' + (tentativas ? `, mesmo tentando ${tentativas}x` : '') + '. Ele ainda está na casa?');
    clique(aba); await dorme(1200);
  }
  // A BR365 tem dois desenhos da página do jogo (o do site, com <section>/<h2>, e o do sportsbook embutido, com
  // classes EventDetails*). Tudo aqui se guia pelo texto: título do mercado, nome do jogador, colunas Mais/Menos.
  function blocoDoMercado(mk) {
    const nomes = todos('h2, h3, [class*="EventDetailsMarketName"]').filter(n => /mais de\s*\/\s*menos de/i.test(txt(n)) && !/quarto|tempo|multi/i.test(txt(n)));
    const n = nomes.find(x => mkDe(txt(x).replace(/mais de\s*\/\s*menos de.*$/i, '')) === mk);
    return n ? { nome: n, caixa: n.closest('section') || n.closest('[class*="MarketBoxRoot"]') || n.parentElement?.parentElement?.parentElement } : null;
  }
  const folhas = e => [...e.querySelectorAll('*')].filter(x => !x.children.length).map(txt).filter(Boolean);
  const valorOdd = bt => { const f = folhas(bt).filter(t => /^\d+[.,]\d{2}$/.test(t)); return f.length ? num(f[f.length - 1]) : NaN; };
  const linhaOdd = bt => { const f = folhas(bt).find(t => /^\d+[.,](5|0)$/.test(t)); return f ? num(f) : NaN; };
  const botoesOdd = caixa => [...caixa.querySelectorAll('button')].filter(b => !isNaN(valorOdd(b)));
  // linha do jogador = o menor ancestral do botão de odd que tem texto com letras fora dos botões (o nome)
  function linhasDoBloco(caixa) {
    const rs = new Set();
    for (const b of botoesOdd(caixa)) {
      let e = b.parentElement;
      while (e && e !== caixa && !nomeDaLinha(e)) e = e.parentElement;
      if (e && e !== caixa) rs.add(e);
    }
    return [...rs];
  }
  function nomeDaLinha(r) {
    const fora = [...r.querySelectorAll('*')].filter(x => !x.children.length && !x.closest('button') && /[a-zà-ú]{2}/i.test(txt(x))).map(txt);
    return fora.filter(t => !/^[A-Z]{2,4}$/.test(t) && !/^(linha|mais|menos)( de)?$/i.test(t)).join(' ').trim();
  }
  function achaJogador(caixa, nome) {
    const k = chaveNome(nome), sob = k.split(' ').pop();
    const rs = linhasDoBloco(caixa);
    return rs.find(r => chaveNome(nomeDaLinha(r)) === k) || rs.find(r => { const c = chaveNome(nomeDaLinha(r)); return c.endsWith(' ' + sob) && c[0] === k[0]; });
  }
  async function procuraNoBloco(caixa, nome) {
    const tentar = async () => {
      for (let i = 0; i < 6; i++) {
        const r = achaJogador(caixa, nome); if (r) return r;
        const mais = [...caixa.querySelectorAll('button')].find(b => /mostrar (mais|todos)/i.test(txt(b))); if (!mais) break;
        clique(mais); await dorme(700);
      }
      return achaJogador(caixa, nome);
    };
    let r = await tentar(); if (r) return r;
    for (const aba of [...caixa.querySelectorAll('[class*="MarketBoxTab"]')]) { clique(aba); await dorme(700); r = await tentar(); if (r) return r; }
    return null;
  }
  async function poeNoCupom(l) {
    diz(`Abrindo o jogo de ${l.name}…`);
    await abreJogo(l.ev);
    const b = await espera(() => blocoDoMercado(l.mk), 10000);
    if (!b) throw new Error(`não achei o mercado de ${MKN[l.mk] ?? l.mk} (Mais de/Menos de) neste jogo`);
    if (!botoesOdd(b.caixa).length) { clique(b.nome.closest('button') || b.nome.closest('[class*="MarketHeader"]') || b.nome); await espera(() => botoesOdd(b.caixa).length, 5000); }
    const row = await procuraNoBloco(b.caixa, l.name);
    if (!row) throw new Error(`${l.name} não aparece em ${MKN[l.mk] ?? l.mk} na BR365 agora`);
    const odds = [...row.querySelectorAll('button')].filter(x => !isNaN(valorOdd(x)) || /OddBox/.test(x.className));
    // linha: dentro do botão (desenho do site) ou numa coluna própria (desenho do sportsbook)
    let linha = linhaOdd(odds[0] ?? row);
    if (isNaN(linha)) { const f = [...row.querySelectorAll('*')].filter(x => !x.children.length && !x.closest('button')).map(txt).find(t => /^\d+[.,](5|0)$/.test(t)); linha = f ? num(f) : NaN; }
    if (!(Math.abs(linha - l.line) < 0.01)) throw new Error(`a linha de ${l.name} mudou: na BR365 está ${isNaN(linha) ? '?' : String(linha).replace('.', ',')}, a entrada é ${String(l.line).replace('.', ',')}. Monte à mão se ainda quiser.`);
    const bt = odds[l.side === 'o' ? 0 : 1]; if (!bt || isNaN(valorOdd(bt))) throw new Error(`sem odd de ${l.side === 'o' ? 'mais' : 'menos'} para ${l.name}`);
    const odd = valorOdd(bt);
    // já está no cupom? o botão fica com aria-pressed="true" (clicar de novo tiraria a seleção)
    const marcado = () => bt.getAttribute('aria-pressed') === 'true';
    if (marcado()) return odd;
    const antes = cupomQtd();
    clique(bt);
    if (!await espera(() => marcado() || cupomQtd() > antes, 5000)) throw new Error(`cliquei na odd de ${l.name}, mas a seleção não entrou no cupom`);
    return odd;
  }
  // quantas seleções o cupom tem: a barra "1 Bilhete 1.66" no rodapé (0 quando não aparece)
  const cupomQtd = () => { const s = todos('span').find(e => txt(e) === 'Bilhete'); const m = /^(\d+)\s*Bilhete/.exec(txt(s?.closest('button'))); return m ? +m[1] : 0; };
  function preencheValor(valor) {
    const campos = todos('input').filter(i => i.offsetParent && /aposta|valor|stake/i.test(txt(i.closest('div')?.parentElement) + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '')));
    const c = campos[campos.length - 1]; if (!c) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(c, String(valor).replace('.', ',')); c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  async function montar(id) {
    const p = entradas.find(x => x.id === id); if (!p) throw new Error('entrada não encontrada; atualize a lista');
    // cupom com seleção de antes viraria múltipla sem querer: para aqui
    const ja = cupomQtd(); if (ja) throw new Error(`o cupom já tem ${ja} seleção(ões). Limpe o cupom (lixeira/X no Bilhete) e clique em Montar de novo.`);
    const odds = [];
    for (const l of p.legs) odds.push(await poeNoCupom(l));
    const qtd = cupomQtd(); if (qtd && qtd !== p.legs.length) throw new Error(`o cupom ficou com ${qtd} seleções, a entrada tem ${p.legs.length}. Confira antes de apostar.`);
    const un = lerJ(CFG, {}).unidade;
    const valor = un ? Math.round(un * p.stake * 100) / 100 : null;
    const preencheu = valor ? preencheValor(valor) : false;
    const job = { id: p.id, legs: p.legs, odd: p.odd, oddCasa: odds.reduce((a, b) => a * (b || 1), 1), valor: preencheu ? valor : null, em: Date.now(), etapa: 'conferir' };
    gravaJ(JOB, job); mostraEtapa(job);
  }
  function mostraEtapa(job) {
    if (job.etapa !== 'conferir') return;
    const cai = job.oddCasa && job.oddCasa < job.odd * 0.97 ? `\n⚠️ A odd caiu: a entrada era @${job.odd.toFixed(2)}, na casa está @${job.oddCasa.toFixed(2)}.` : '';
    lista.innerHTML = `<div class="it"><b>#${job.id}</b><br>${job.legs.map(rotulo).join('<br>')}<div class="alerta">Confira o cupom${job.valor ? ` (R$ ${String(job.valor).replace('.', ',')})` : ' e digite o valor'} e clique VOCÊ em "Fazer Aposta".</div><button data-a="apostei">Já apostei: pegar o código</button> <button class="sec" data-a="cancelar">Cancelar</button></div>`;
    diz('Esperando você confirmar a aposta na BR365.' + cai);
  }

  // ---------- depois que VOCÊ apostou: pegar o código pelo "Compartilhar" de Minhas Apostas ----------
  let pegando = false;
  async function depoisDaAposta() {
    const job = lerJ(JOB, null); if (!job || pegando) return;
    pegando = true;
    try {
      diz('Aposta feita. Abrindo Minhas Apostas para pegar o código…');
      await dorme(1500);
      location.hash = '#/betHistory';
      const sob = chaveNome(job.legs[0].name).split(' ').pop();
      // cartão de cada aposta = o maior ancestral do botão "Compartilhar" que ainda só tem esse botão;
      // a lista vem da mais nova para a mais antiga, então a primeira com o jogador da entrada é a que você acabou de fazer
      const cartao = b => { let c = b, p = b.parentElement; while (p && p.querySelectorAll('button').length && [...p.querySelectorAll('button')].filter(x => /^compartilhar$/i.test(txt(x))).length === 1) { c = p; p = p.parentElement; } return c; };
      const l0 = job.legs[0], marca = new RegExp(sob + '[^|]{0,40}' + (l0.side === 'o' ? 'mais' : 'menos') + '\\s*(de\\s*)?' + String(l0.line).replace('.', '[.,]'), 'i');
      const card = await espera(() => todos('button').filter(b => /^compartilhar$/i.test(txt(b))).map(b => ({ b, c: cartao(b) })).find(x => marca.test(nrm(txt(x.c)))), 20000);
      if (!card) throw new Error('não achei a aposta em Minhas Apostas. Clique em Compartilhar nela à mão: o script pega o código do mesmo jeito.');
      const codigo = new Promise((ok, nao) => { const f = (t, c) => { if (t === 'codigo') { ouvintes.delete(f); ok(c); } }; ouvintes.add(f); setTimeout(() => { ouvintes.delete(f); nao(new Error('o código não veio. Clique em Compartilhar na aposta à mão.')); }, 20000); });
      clique(card.b);
      await entrega(await codigo);
    } finally { pegando = false; }
  }
  async function entrega(code) {
    const job = lerJ(JOB, null); if (!job) return;
    diz('Código ' + code + '. Mandando para o bot…');
    const r = await of(`${API}?bilhete=${job.id}&code=${encodeURIComponent(code)}&token=${TOKEN}`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    const link = `${location.origin}/sports?shareCode=${code}`;
    try { await navigator.clipboard.writeText(link); } catch { }
    if (!r.ok || j.ok === false) throw new Error(`o bot não trocou o link (${j.erro || r.status}). O link está copiado: ${link}`);
    gravaJ(JOB, null);
    diz(`✅ Post #${job.id} atualizado com o bilhete pronto.\n${link} (copiado)\nPode fechar a janela de compartilhar.`);
    setTimeout(carrega, 2500);
  }
  // aposta confirmada pelo usuário (POST de place no cupom) → segue sozinho; código criado à mão → entrega
  ouvintes.add((tipo, dado) => {
    const job = lerJ(JOB, null); if (!job) return;
    if (tipo === 'aposta' && dado.ok && job.etapa === 'conferir') depoisDaAposta().catch(falha);
    if (tipo === 'codigo' && !pegando) entrega(dado).catch(falha);
  });

  // para testar um passo no console: bhBilhete.poeNoCupom({ ev, name, mk, side, line })
  window.bhBilhete = { poeNoCupom, carrega };
  const inicia = () => { montaPainel(); carrega(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia); else inicia();
})();
