// Cards vivos da aba Jogador (aprovados 24/11): Linha viva e Prancheta.
// Dados: data/jogador/<TIME>.json (jogada a jogada da ESPN) e, para a linha da casa, data/slate.json.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const dm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Linha viva ----------------
   jogos: [{ v, d, opp }] do mais antigo ao mais recente. Arraste a linha, toque na escada ou use as setas. */
export function linhaViva(box, { jogos, linha, casa = null, nome, onLinha }) {
  let N = Math.min(10, jogos.length), L = linha, shown = { hit: 0, pct: 0 }, arrastando = false;
  const maxV = Math.max(...jogos.map(j => j.v), 1);
  const TOP = Math.max(maxV, (casa ?? linha) + 2) * 1.12;
  const media = jogos.reduce((s, j) => s + j.v, 0) / (jogos.length || 1), passo = media >= 15 ? 2 : 1;
  const base = casa ?? linha, escada = [-2, -1, 0, 1, 2].map(k => base + k * passo).filter(x => x > 0);
  const periodos = [[5, 'Últ. 5'], [10, 'Últ. 10'], [20, 'Últ. 20'], [jogos.length, 'Temporada']].filter(([n], i, a) => n <= jogos.length && (i === a.length - 1 || n < jogos.length));
  box.innerHTML = `<div class="lv-top"><div class="lv-seg" role="group" aria-label="Período">${periodos.map(([n, t]) => `<button data-n="${n}" aria-pressed="${n === N}">${t}</button>`).join('')}</div>
    ${casa != null ? `<span class="lv-casa">Linha da casa hoje: <b>${br(casa)}</b></span>` : ''}</div>
    <div class="lv-area"><div class="lv-bars"></div><div class="lv-handle"><button role="slider" aria-label="Linha de ${esc(nome)}" aria-valuemin="0.5" aria-valuemax="${Math.ceil(TOP)}"></button></div></div>
    <div class="lv-dates"></div>
    <div class="lv-kpis"><div><b class="lv-hit"></b><span class="lv-hitl"></span></div><div><b class="lv-pct"></b><span>passou da linha</span></div><div><b class="lv-avg"></b><span>média no período</span></div></div>
    <div class="lv-esc"><span>Escada</span>${escada.map(x => `<button data-x="${x}" class="${x === casa ? 'casa' : ''}">${br(x)}</button>`).join('')}</div>
    <p class="lv-nota" aria-live="polite"></p>`;
  const area = box.querySelector('.lv-area'), handle = box.querySelector('.lv-handle'), hb = handle.querySelector('button'), bars = box.querySelector('.lv-bars');
  const tween = (el, de, para, fmt) => {
    if (calmo() || de === para) { el.textContent = fmt(para); return; }
    const t0 = performance.now(), f = t => { const u = Math.min(1, (t - t0) / 350); el.textContent = fmt(Math.round(de + (para - de) * u)); if (u < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
  function desenha(rebuild) {
    const J = jogos.slice(-N);
    if (rebuild) {
      bars.innerHTML = J.map((j, k) => `<div class="lv-b in" style="--h:${(j.v / TOP * 100).toFixed(1)};--k:${k}" title="${esc(dm(j.d))} contra ${esc(j.opp)}: ${br(j.v, 0)}"><em>${br(j.v, 0)}</em><i></i></div>`).join('');
      requestAnimationFrame(() => requestAnimationFrame(() => bars.querySelectorAll('.lv-b').forEach(b => b.classList.remove('in'))));
      box.querySelector('.lv-dates').innerHTML = J.map(j => `<span>${N > 12 ? esc(j.opp) : `${esc(j.d.slice(8, 10))}<i class="lv-mm">/${esc(j.d.slice(5, 7))}</i><br>${esc(j.opp)}`}</span>`).join('');
      box.querySelector('.lv-dates').classList.toggle('dense', N > 12);
      bars.classList.toggle('dense', N > 12);
    }
    [...bars.children].forEach((b, i) => b.classList.toggle('lo', !(J[i].v > L)));
    handle.style.bottom = (L / TOP * 100) + '%';
    hb.textContent = br(L); hb.setAttribute('aria-valuenow', L); hb.setAttribute('aria-valuetext', br(L));
    const hit = J.filter(j => j.v > L).length, pct = Math.round(hit / (J.length || 1) * 100);
    tween(box.querySelector('.lv-hit'), shown.hit, hit, x => `${x}/${J.length}`);
    tween(box.querySelector('.lv-pct'), shown.pct, pct, x => x + '%');
    shown = { hit, pct };
    box.querySelector('.lv-hitl').textContent = 'jogos acima de ' + br(L);
    box.querySelector('.lv-avg').textContent = br(J.reduce((s, j) => s + j.v, 0) / (J.length || 1));
    box.querySelectorAll('.lv-esc button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.x === L));
    const nota = box.querySelector('.lv-nota');
    nota.classList.toggle('alt', casa != null && L !== casa);
    nota.textContent = casa == null ? 'Sem linha da casa para este mercado hoje: aqui vale só o histórico.'
      : L === casa ? `Esta é a linha da casa hoje. A chance do modelo e a odd estão na ficha, na aba Props.`
        : `Linha alternativa, ${L > casa ? 'acima' : 'abaixo'} da casa (${br(casa)}). Aqui vale só o histórico: passou em ${hit} de ${J.length}.`;
  }
  const muda = (x, avisa) => { L = Math.max(.5, Math.min(Math.ceil(TOP) - .5, Math.floor(x) + .5)); desenha(false); if (avisa) onLinha?.(L); };
  const doY = e => { const r = area.getBoundingClientRect(); muda((1 - (e.clientY - r.top) / r.height) * TOP, false); };
  area.addEventListener('pointerdown', e => { arrastando = true; area.classList.add('drag'); area.setPointerCapture(e.pointerId); doY(e); });
  area.addEventListener('pointermove', e => { if (arrastando) doY(e); });
  const solta = () => { if (!arrastando) return; arrastando = false; area.classList.remove('drag'); onLinha?.(L); };
  area.addEventListener('pointerup', solta); area.addEventListener('pointercancel', solta);
  hb.addEventListener('keydown', e => { const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); muda(L + d, true); } });
  box.querySelector('.lv-esc').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { L = +b.dataset.x; desenha(false); onLinha?.(L); } });
  box.querySelector('.lv-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; N = +b.dataset.n; box.querySelectorAll('.lv-seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); desenha(true); });
  desenha(true);
  return { linha: () => L };
}

/* ---------------- Prancheta ----------------
   Meia quadra com rebotes, assistências e arremessos do jogador; zonas que acendem pelo volume,
   último jogo pulsando, replay lance a lance e filtro por companheiro. */
const LINHAS = '<g class="pv-lines"><path d="M0 32V-5.25h50V32M17 -5.25V13.75h16V-5.25M3 -5.25V8.95A23.75 23.75 0 0 0 47 8.95V-5.25M21 0a4 4 0 0 0 8 0M22 -1.25h6"/><circle cx="25" cy="13.75" r="6"/><circle cx="25" cy="0" r=".75" stroke="var(--gold)"/></g>';
const ZONAS = [
  ['garrafao', 'Garrafão', 'M17 -5.25H33V13.75H17Z'],
  ['meia', 'Meia distância', 'M3 -5.25V8.95A23.75 23.75 0 0 0 47 8.95V-5.25ZM17 -5.25V13.75H33V-5.25Z'],
  ['tres', 'Três de frente', 'M-2 8.95H3A23.75 23.75 0 0 0 47 8.95H52V33H-2Z'],
  ['cantoE', 'Zona morta esquerda', 'M-2 -7H3V8.95H-2Z'],
  ['cantoD', 'Zona morta direita', 'M47 -7H52V8.95H47Z'],
];
const zonaDe = (x, y) => y < 8.95 && x <= 3 ? 'cantoE' : y < 8.95 && x >= 47 ? 'cantoD' : Math.hypot(x - 25, y) >= 23.75 ? 'tres' : x >= 17 && x <= 33 && y <= 13.75 ? 'garrafao' : 'meia';
const ok = (x, y) => x != null && y != null && x >= -2 && x <= 52 && y >= -7 && y <= 33;

export function prancheta(box, { T, P, nome, jogos, linha, camada = 'reb', nomeMercado = 'mercado' }) {
  const DADOS = {
    reb: { pts: T.rb.filter(r => r[1] === P && ok(r[3], r[4])).map(r => [r[0], r[3], r[4], r[2]]), nome: 'rebotes', leg: [['var(--green)', 'defensivo'], ['var(--gold)', 'ofensivo']], dot: p => p[3] ? 'fill="var(--gold)"' : 'fill="var(--green)"' },
    ast: { pts: T.sh.filter(r => r[2] === P && r[3] && ok(r[5], r[6])).map(r => [r[0], r[5], r[6], r[4], r[1]]), nome: 'assistências', leg: [['var(--green)', 'cesta de 2'], ['var(--gold)', 'cesta de 3']], dot: p => p[3] === 3 ? 'fill="var(--gold)"' : 'fill="var(--green)"' },
    shots: { pts: T.sh.filter(r => r[1] === P && ok(r[5], r[6])).map(r => [r[0], r[5], r[6], r[3], r[4]]), nome: 'arremessos', leg: [['var(--green)', 'cesta'], ['var(--gold)', 'erro', 1]], dot: p => p[3] ? 'fill="var(--green)"' : 'fill="none" stroke="var(--gold)" stroke-width=".22"' },
  };
  DADOS.tres = { ...DADOS.shots, pts: DADOS.shots.pts.filter(p => p[4] === 3), nome: 'bolas de 3' };
  const ABAS = [['reb', 'Rebotes'], ['ast', 'Assistências'], ['shots', 'Arremessos'], ['tres', 'Bolas de 3']];
  let layer = DADOS[camada] ? camada : 'reb', sel = null, mate = null, zonasOn = true, zSel = null, timer = null, L = linha;
  const gs = jogos.slice(-10), ult = jogos[jogos.length - 1], porG = new Map(jogos.map(j => [j.g, j]));
  box.innerHTML = `<div class="pv-top"><div class="lv-seg" role="group" aria-label="Camada">${ABAS.map(([k, t]) => `<button data-l="${k}" aria-pressed="${k === layer}">${t}</button>`).join('')}</div></div>
   <div class="pv-grid"><div>
     <div class="pv-live" aria-live="polite"><b class="pv-cnt">0</b><span class="pv-cntl"></span></div>
     <div class="pv-court"><svg viewBox="-2 -7 54 40" role="img" aria-label="Meia quadra"></svg><div class="pv-prog"><i></i></div></div>
     <div class="pv-acts"><button class="pv-act pv-play"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor"/></svg><span></span></button><button class="pv-act pv-zon" aria-pressed="true">Zonas</button><div class="jg-leg pv-leg"></div></div>
     <div class="pv-zinfo" aria-live="polite"></div>
   </div><div>
     <div class="pv-sel"></div><div class="pv-games"></div><div class="pv-who"></div>
   </div></div>`;
  const court = box.querySelector('svg'), $ = s => box.querySelector(s);
  const match = p => (sel === null || p[0] === sel) && (mate === null || layer !== 'ast' || p[4] === mate);
  const conta = () => { const c = {}; const P2 = DADOS[layer].pts.filter(match); P2.forEach(p => { const z = zonaDe(p[1], p[2]); c[z] = (c[z] || 0) + 1; }); return { c, n: P2.length }; };
  const setN = (n, lb, pula) => { $('.pv-cnt').textContent = n; $('.pv-cntl').textContent = lb; if (pula) { const w = $('.pv-live'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); } };
  const rotulo = () => sel === null ? `${DADOS[layer].nome}${layer === 'ast' && mate !== null ? ' para ' + nome(mate) : ' na temporada'}` : `${DADOS[layer].nome} em ${dm(porG.get(sel).d)}`;
  function zTxt() {
    if (zSel === null) return 'Toque numa zona da quadra.';
    const { c, n } = conta(), k = c[zSel] || 0, z = ZONAS.find(q => q[0] === zSel);
    const extra = layer === 'shots' || layer === 'tres' ? (() => { const a = DADOS[layer].pts.filter(p => match(p) && zonaDe(p[1], p[2]) === zSel); return a.length ? `, ${a.filter(p => p[3]).length} cestas` : ''; })() : '';
    return `${z[1]}: ${k} de ${n} ${DADOS[layer].nome} (${n ? Math.round(k / n * 100) : 0}%)${extra}.`;
  }
  function jogosHTML() {
    $('.pv-games').innerHTML = gs.slice().reverse().map(j => `<button data-g="${j.g}" aria-pressed="${sel === j.g}"><span>${esc(dm(j.d))}</span><span>${esc(j.opp)}</span><span class="pv-mb${j.v > L ? '' : ' lo'}" style="width:${Math.min(100, j.v / (Math.max(...gs.map(x => x.v), L) * 1.05) * 100).toFixed(0)}%"></span><span>${br(j.v, 0)}</span></button>`).join('');
    const g = sel === null ? null : porG.get(sel);
    $('.pv-sel').textContent = g ? `${dm(g.d)} contra ${g.opp}: ${br(g.v, 0)} em ${nomeMercado} (${g.reb} reb, ${g.ast} ast, ${g.pts} pts).` : `Últimos ${gs.length} jogos (${nomeMercado}). Toque para filtrar.`;
  }
  function parar() { if (timer) { clearInterval(timer); timer = null; } $('.pv-play').classList.remove('run'); }
  function desenha() {
    parar();
    const D = DADOS[layer], { c, n } = conta(), mx = Math.max(1, ...Object.values(c));
    const zonas = zonasOn ? `<g class="pv-zonas">${ZONAS.map(([id, , d]) => `<path class="pv-zona${zSel === id ? ' on' : ''}" data-z="${id}" d="${d}" fill-rule="evenodd" fill-opacity="${(.03 + .24 * (c[id] || 0) / mx).toFixed(3)}"/>`).join('')}</g>` : '';
    court.innerHTML = zonas + LINHAS + D.pts.map((p, k) => `<circle class="pv-dot${!match(p) ? ' dim' : sel === null && ult && p[0] === ult.g ? ' pulse' : ''}" data-g="${p[0]}" cx="${p[1]}" cy="${p[2]}" r=".6" ${D.dot(p)} style="--k:${k % 120}"/>`).join('');
    $('.pv-leg').innerHTML = D.leg.map(([cc, t, anel]) => `<span><i style="${anel ? 'border:1.5px solid ' + cc : 'background:' + cc}"></i>${t}</span>`).join('') + (ult ? `<span><i style="background:var(--ink-2)"></i>pulsando: ${esc(dm(ult.d))} ${esc(ult.opp)}</span>` : '');
    setN(n, rotulo()); $('.pv-prog i').style.width = '0';
    $('.pv-zinfo').textContent = D.pts.length ? zTxt() : `Sem ${D.nome} com local na temporada.`;
    const quem = $('.pv-who');
    if (layer === 'ast') {
      const cont = {}; D.pts.filter(p => sel === null || p[0] === sel).forEach(p => cont[p[4]] = (cont[p[4]] || 0) + 1);
      const top = Object.entries(cont).map(([i, k]) => [+i, k]).sort((a, b) => b[1] - a[1]).slice(0, 6), m = Math.max(1, ...top.map(t => t[1]));
      quem.innerHTML = top.length ? '<span class="pv-whot">Para quem ele passa (toque para filtrar)</span>' + top.map(([i, k]) => `<button data-m="${i}" aria-pressed="${mate === i}"><span>${esc(nome(i))}</span><i data-w="${(k / m * 100).toFixed(0)}"></i><span>${k}</span></button>`).join('') : '';
      requestAnimationFrame(() => quem.querySelectorAll('i').forEach(i => i.style.width = i.dataset.w + '%'));
    } else quem.innerHTML = '';
    const g = sel === null ? ult : porG.get(sel);
    $('.pv-play span').textContent = g ? `Rever ${dm(g.d)}` : 'Rever';
  }
  function replay() {
    if (timer) { parar(); desenha(); return; }
    if (sel === null && ult) { sel = ult.g; jogosHTML(); desenha(); }
    const D = DADOS[layer], dots = [...court.querySelectorAll('.pv-dot')].filter(d => +d.dataset.g === sel && !d.classList.contains('dim')), tot = dots.length;
    if (calmo() || !tot) { setN(tot, rotulo()); return; }
    dots.forEach(d => d.classList.add('wait')); let k = 0; setN(0, rotulo()); $('.pv-play').classList.add('run');
    timer = setInterval(() => {
      const d = dots[k]; d.classList.remove('wait');
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      r.setAttribute('class', 'pv-rip'); r.setAttribute('cx', d.getAttribute('cx')); r.setAttribute('cy', d.getAttribute('cy')); r.setAttribute('r', '.6');
      court.appendChild(r); setTimeout(() => r.remove(), 950);
      k++; setN(k, rotulo(), true); $('.pv-prog i').style.width = (k / tot * 100) + '%';
      if (k >= tot) parar();
    }, 420);
    void D;
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('button'), z = e.target.closest('.pv-zona');
    if (z) { zSel = zSel === z.dataset.z ? null : z.dataset.z; desenha(); return; }
    if (!b) return;
    if (b.dataset.l) { layer = b.dataset.l; mate = null; box.querySelectorAll('.pv-top button').forEach(x => x.setAttribute('aria-pressed', x === b)); desenha(); }
    else if (b.dataset.g) { const g = +b.dataset.g; sel = sel === g ? null : g; jogosHTML(); desenha(); }
    else if (b.dataset.m) { const m = +b.dataset.m; mate = mate === m ? null : m; desenha(); }
    else if (b.classList.contains('pv-play')) replay();
    else if (b.classList.contains('pv-zon')) { zonasOn = !zonasOn; b.setAttribute('aria-pressed', zonasOn); desenha(); }
  });
  court.addEventListener('pointerover', e => { const z = e.target.closest('.pv-zona'); if (z && zSel === null) { zSel = z.dataset.z; $('.pv-zinfo').textContent = zTxt(); zSel = null; } });
  jogosHTML(); desenha();
  return { setLinha(l) { L = l; jogosHTML(); }, parar };
}
