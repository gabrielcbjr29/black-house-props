// Placar do método: o que o sistema apontou (papel, 1u na odd do alerta) e o que deu. Lê o placar público da função
// estrategias (?placar=1, agregado e sem dados de usuário) e desenha: KPIs, curva de unidades, tabela por estratégia,
// lado e mercado, e o gabarito do último dia conferido. Nada aqui é editável: é a prestação de contas do método.
import { MARKETS, jerseySVG } from './engine.js';

export const PLACAR_URL = 'https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/estrategias?placar=1';
export const VEREDITO_URL = 'https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/estrategias?veredito=1';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = x => (Math.round(x * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = x => (+x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const u = x => (x > 0 ? '+' : x < 0 ? '−' : '') + n1(Math.abs(x)) + 'u';
const pct = (x, d = 0) => x == null ? '–' : (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: d }) + '%';
const spct = x => x == null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.abs(x) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const cls = x => x > 0 ? 'pos' : x < 0 ? 'neg' : '';
const dateBR = d => { const [y, m, dd] = String(d).split('-'); return `${dd}/${m}`; };
const hBR = iso => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const mkLb = mk => MARKETS[mk]?.lb || mk;
const sideLb = s => s === 'o' || s === 'over' ? 'Mais de' : 'Menos de';
const SNAME = { 'm-2pa': 'Tentativas de 2', 'm-2pm': 'De 2 convertidos', 'm-3pa': 'Tentativas de 3', 'm-3pm': 'De 3 convertidos', 'm-fgm': 'Arremessos convertidos', 'm-fta': 'LL tentados', 'm-ftm': 'LL convertidos', 'm-ra': 'Reb+Ast', 'reserva-under': 'Under de reserva', 'oport-forte': 'Oportunidade forte', 'top10-forte': 'Top 10 forte', tendencia: 'Tendência' };
const SKIND = id => id.startsWith('m-') ? 'Modelo por mercado' : id === 'tendencia' ? 'Sem o modelo' : 'Modelo · extra';

let CACHE = null;
export async function loadPlacar(force = false) {
  if (!force && CACHE && Date.now() - CACHE.at < 60_000) return CACHE.data;
  const t = '&t=' + Math.floor(Date.now() / 60_000);
  // o veredito pelo fechamento vem à parte: se falhar, o placar sai sem ele
  const [r, ver] = await Promise.all([fetch(PLACAR_URL + t), fetch(VEREDITO_URL + t).then(x => x.ok ? x.json() : null).catch(() => null)]);
  if (!r.ok) throw new Error('placar indisponível (' + r.status + ')');
  const data = { ...(await r.json()), veredito: ver }; CACHE = { at: Date.now(), data }; return data;
}

/* curva de unidades acumuladas por dia (começa em zero no dia anterior ao primeiro) */
function curveSVG(dias) {
  if (!dias.length) return '';
  const pts = [{ d: 'início', u: 0 }]; let acc = 0;
  for (const d of dias) { acc += +d.lucro || 0; pts.push({ d: dateBR(d.date), u: Math.round(acc * 100) / 100, day: +d.lucro || 0, n: d.n, g: d.g }); }
  const W = 720, H = 200, pl = 44, pr = 14, pt = 16, pb = 28;
  const ys = pts.map(p => p.u); const mn = Math.min(0, ...ys), mx = Math.max(0, ...ys); const span = (mx - mn) || 1;
  const x = i => pl + (W - pl - pr) * (pts.length === 1 ? 0 : i / (pts.length - 1)), y = v => pt + (H - pt - pb) * (1 - (v - mn) / span);
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 6 ? 2 : 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Unidades acumuladas do método por dia">`;
  for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pl - 6}" y="${y(t) + 3}" text-anchor="end">${t > 0 ? '+' : ''}${t}u</text>`;
  s += `<line class="zero" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>`;
  const last = pts.at(-1).u, poly = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.u).toFixed(1)}`).join(' ');
  s += `<polygon class="area ${last >= 0 ? 'up' : 'down'}" points="${pl},${y(0)} ${poly} ${x(pts.length - 1)},${y(0)}"/><polyline class="eq ${last >= 0 ? 'up' : 'down'}" points="${poly}"/>`;
  pts.forEach((p, i) => { if (!i) return; s += `<circle class="pt ${p.day >= 0 ? 'up' : 'down'}" cx="${x(i)}" cy="${y(p.u)}" r="4.5"><title>${p.d}: ${u(p.day)} no dia (${p.g}/${p.n})</title></circle>`; });
  pts.forEach((p, i) => { if (pts.length > 14 && i % Math.ceil(pts.length / 10)) return; s += `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${p.d}</text>`; });
  return s + '</svg>';
}

/* Veredito pelo fechamento (19/11): o método é julgado pelo CLV (o mercado andou para o nosso lado até o jogo?), que tem
   pouco ruído, e não só pelo green/red, que com poucas centenas de entradas ainda é sorte. */
const VCLS = { bate: 'ok', atras: 'bad', semprova: '', cedo: 'mut' };
const pp = x => x == null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' pts';
export function vereditoHTML(V) {
  if (!V?.total) return '';
  const row = (lb, x, sub = '') => `<tr><td><b>${esc(lb)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</td>
    <td class="num"><span class="vchip ${VCLS[x.ver.k]}">${x.ver.lb}</span><small>t ${x.t == null ? '–' : x.t.toLocaleString('pt-BR')}</small></td>
    <td class="num"><b class="${cls(x.clv)}">${pp(x.clv)}</b><small>${x.npp} leituras</small></td>
    <td class="num">${x.lidas ? `<b>${pct(x.f / x.lidas)}</b><small>${x.f} a favor · ${x.c} contra</small>` : '–'}</td>
    <td class="num">${x.roi == null ? '–' : `<b class="${cls(x.roi)}">${spct(x.roi)}</b><small>± ${pct(x.faixa)} de sorte</small>`}</td></tr>`;
  const tbl = (list, lb) => `<div class="tblwrap"><table class="ptbl vtbl"><thead><tr><th>${lb}</th><th class="num">Veredito</th><th class="num">CLV médio</th><th class="num">Bateu o fechamento</th><th class="num">ROI</th></tr></thead><tbody>${list.join('')}</tbody></table></div>`;
  const T = V.total;
  return `<section class="panel pbox"><h3>Veredito pelo fechamento <small>${T.npp} entradas com leitura · CLV médio ${pp(T.clv)}</small></h3>
    ${tbl([row('Tudo no papel', T), ...V.metodo.map(x => row(x.k, x, `${x.n} entradas · ${x.g}G ${x.r}R`)), ...V.lado.map(x => row(x.k, x, `${x.n} entradas`))], 'Método')}
    <p class="muted fn">CLV = chance implícita na odd de fechamento da 99play menos a da entrada, na mesma linha (em pontos). Positivo: o mercado andou para o nosso lado. <b>Bate o fechamento</b> = t de 2 ou mais; <b>cedo demais</b> = menos de 30 leituras. O ROI vem com a faixa de sorte (2 erros-padrão): se ela cruza o zero, o lucro ainda não prova nada.</p>
  </section>
  <section class="panel pbox"><h3>Por faixa de valor <small>EV do modelo na hora da entrada (sem a Tendência)</small></h3>
    ${tbl(V.faixa.map(x => row(x.k, x, `${x.n} entradas · ${x.g}G ${x.r}R`)), 'Faixa de EV')}
    <p class="muted fn">Se as faixas altas não batem o fechamento, o valor grande é o modelo sem saber de algo que o mercado já sabe (lesão, escalação, minutos).</p>
  </section>`;
}

const bar = (v, max) => `<i class="pbar ${cls(v)}" style="--w:${Math.min(100, Math.abs(v) / (max || 1) * 100).toFixed(0)}%"></i>`;

export function placarHTML(P, { fresh } = {}) {
  const E = (P.estrategias || []).filter(e => e.n > 0 || e.abertas > 0);
  const tot = E.reduce((a, e) => ({ n: a.n + e.n, g: a.g + e.g, r: a.r + e.r, v: a.v + e.v, lucro: a.lucro + (+e.lucro || 0), ab: a.ab + e.abertas }), { n: 0, g: 0, r: 0, v: 0, lucro: 0, ab: 0 });
  const dec = tot.g + tot.r, roi = dec ? tot.lucro / dec : null, hit = dec ? tot.g / dec : null;
  const clvs = E.filter(e => e.clv_pos != null && e.n >= 3); const clv = clvs.length ? clvs.reduce((a, e) => a + e.clv_pos * e.n, 0) / clvs.reduce((a, e) => a + e.n, 0) : null;
  const oddM = E.filter(e => e.odd_media).reduce((a, e) => a + e.odd_media * e.n, 0) / (tot.n || 1);
  const kpi = (lb, v, sub, c = '') => `<div><small>${lb}</small><b class="${c}">${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const hoje = P.hoje;
  const stale = x => x && (Date.now() - Date.parse(x)) / 36e5;
  const health = [
    fresh?.gen ? `<span class="${stale(fresh.gen) > 2.5 ? 'hb bad' : 'hb ok'}">Coleta ${hBR(fresh.gen)} <em>${ago(fresh.gen)}</em></span>` : '',
    P.leitor ? `<span class="${stale(P.leitor) > 2 ? 'hb bad' : 'hb ok'}">99play ${hBR(P.leitor)} <em>${ago(P.leitor)}</em></span>` : '',
    hoje ? `<span class="hb">Hoje <em>${hoje.n} no papel · ${hoje.alertadas} alertadas · ${hoje.abertas} em aberto</em></span>` : '',
  ].filter(Boolean).join('');
  const maxE = Math.max(1, ...E.map(e => Math.abs(+e.lucro || 0)));
  const rows = E.map(e => {
    const d = e.g + e.r;
    return `<tr><td><b>${esc(SNAME[e.id] || e.name)}</b><small>${SKIND(e.id)}${e.desde ? ` · desde ${dateBR(e.desde)}` : ''}</small></td>
      <td class="num">${e.n}${e.abertas ? `<small>+${e.abertas} abertas</small>` : ''}</td>
      <td class="num">${d ? `<b>${pct(e.g / d)}</b><small>${e.g}G ${e.r}R${e.v ? ' ' + e.v + 'D' : ''}</small>` : '–'}</td>
      <td class="num"><b class="${cls(+e.lucro)}">${e.n ? u(+e.lucro) : '–'}</b>${bar(+e.lucro || 0, maxE)}</td>
      <td class="num ${cls(e.roi)}">${e.roi == null ? '–' : spct(+e.roi)}</td>
      <td class="num">${e.odd_media ? n2(e.odd_media) : '–'}</td>
      <td class="num">${e.clv_pos == null ? '–' : pct(+e.clv_pos)}</td></tr>`;
  }).join('');
  const lado = (P.lado || []).map(l => ({ ...l, lb: l.side === 'o' ? 'Mais de (over)' : 'Menos de (under)' }));
  const merc = (P.mercado || []).slice();
  const maxL = Math.max(1, ...lado.map(x => Math.abs(+x.lucro || 0))), maxM = Math.max(1, ...merc.map(x => Math.abs(+x.lucro || 0)));
  const brk = (title, list, max, lb) => `<section class="panel pbox"><h3>${title}</h3>${list.length ? `<ul class="plist2">${list.map(x => `<li><span class="lb">${esc(lb(x))}</span><span class="n">${x.g}/${x.n}</span><span class="v ${cls(+x.lucro)}">${u(+x.lucro)}</span>${bar(+x.lucro, max)}</li>`).join('')}</ul>` : '<p class="muted">Ainda sem entradas conferidas.</p>'}</section>`;
  const ont = P.ontem || [];
  const ontDate = ont.length ? (P.dias || []).at(-1)?.date : null;
  const groups = {}; for (const o of ont) (groups[o.strategy_id] ||= []).push(o);
  const gab = Object.entries(groups).map(([id, list]) => {
    const g = list.filter(x => x.status === 'green').length, r = list.filter(x => x.status === 'red').length, l = list.reduce((a, x) => a + (+x.profit || 0), 0);
    return `<details class="gab" ${list.some(x => x.alerted) ? 'open' : ''}><summary><b>${esc(SNAME[id] || list[0].sname)}</b><span class="muted">${g}G ${r}R</span><span class="v ${cls(l)}">${u(l)}</span></summary>
      <ul>${list.map(x => `<li class="${x.status}">${jerseySVG({ team: x.team, name: x.name }, 1)}<span class="who"><b>${esc(x.name)}</b><small>${x.team} x ${x.opp}${x.alerted ? ' · 📬 alertada' : ''}</small></span><span class="what"><b class="gs ${x.side === 'o' ? 'over' : 'under'}">${sideLb(x.side)} ${n1(+x.line)}</b><small>${esc(mkLb(x.mk))} · @${n2(x.odd)}</small></span><span class="res">${x.status === 'green' ? '🟩' : x.status === 'red' ? '🟥' : '⬜'}<small>fez ${x.result ?? '–'}</small></span></li>`).join('')}</ul></details>`;
  }).join('');
  return `
  <div class="health">${health}</div>
  <section class="panel"><div class="bhead"><h2>Resultado do método</h2><span class="grow"></span><span class="muted">papel · 1u na odd do alerta · conferido pelo boxscore</span></div>
    <div class="bkpis">
      ${kpi('Entradas conferidas', tot.n, tot.ab ? `${tot.ab} em aberto hoje` : 'nenhuma em aberto')}
      ${kpi('Lucro', u(tot.lucro), `${tot.g} green · ${tot.r} red${tot.v ? ' · ' + tot.v + ' devolvidas' : ''}`, cls(tot.lucro))}
      ${kpi('ROI', spct(roi), 'lucro ÷ unidades decididas', cls(roi))}
      ${kpi('Acerto', pct(hit, 1), `odd média ${oddM ? n2(oddM) : '–'} · precisa ${oddM ? pct(1 / oddM) : '–'}`)}
      ${kpi('CLV positivo', pct(clv), 'odd da entrada melhor que a final')}
      ${kpi('Dias', (P.dias || []).length, (P.dias || []).length ? `desde ${dateBR(P.dias[0].date)}` : '')}
    </div>
    <div class="chart eqc">${(P.dias || []).length ? curveSVG(P.dias) : '<p class="muted" style="margin:0">A curva aparece quando o primeiro dia for conferido.</p>'}</div>
  </section>
  <section class="panel pbox"><h3>Por estratégia <small>ordem pelo lucro</small></h3>
    <div class="tblwrap"><table class="ptbl"><thead><tr><th>Estratégia</th><th class="num">Entradas</th><th class="num">Acerto</th><th class="num">Lucro</th><th class="num">ROI</th><th class="num">Odd média</th><th class="num">CLV+</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">Ainda sem entradas.</td></tr>'}</tbody></table></div>
    <p class="muted fn">Um mercado só merece stake de verdade com 50+ entradas, ROI e CLV positivos. Com menos que isso, o placar é ruído.</p>
  </section>
  ${vereditoHTML(P.veredito)}
  <div class="pgrid">${brk('Por lado', lado, maxL, x => x.lb)}${brk('Por mercado', merc, maxM, x => mkLb(x.mk))}</div>
  <section class="panel pbox"><h3>Gabarito ${ontDate ? `de ${dateBR(ontDate)}` : ''} <small>${ont.length} entradas conferidas</small></h3>${gab || '<p class="muted">O gabarito do dia anterior aparece de manhã, depois dos boxscores.</p>'}</section>`;
}
