/* Garrafão Props — posts do tipster: texto pronto para Telegram/WhatsApp e cartão em imagem
   (feed 1080×1350 ou story 1080×1920) desenhado em canvas, sem dependências.
   Regras de publicidade de apostas (Portaria SPA/MF 1.231/2024, alterada pela 1.964/2026):
   o aviso do Ministério da Fazenda vai no rodapé ocupando ≥ 10% da peça, e o texto evita
   promessa de ganho. Isto não é orientação jurídica. */
import { MARKETS, TEAM_INFO } from './engine.js';
// texto do escudo: branco ou preto, o que tiver mais contraste com a cor do time
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const onColor = h => /^#[0-9a-f]{6}$/i.test(h) && 1.05 / (lum(h) + .05) < 4.5 ? '#000' : '#fff';

export const WARNINGS = {
  dependencia: 'Ministério da Fazenda adverte: Apostar pode causar dependência',
  perder: 'Ministério da Fazenda adverte: Apostar faz você perder dinheiro',
  investimento: 'Ministério da Fazenda adverte: Aposta não é investimento'
};
const f2 = n => n == null ? '—' : Number(n).toFixed(2).replace('.', ',');
const f1 = n => n == null ? '—' : (Number.isInteger(n) ? String(n) : Number(n).toFixed(1).replace('.', ','));
const pc = p => p == null ? '—' : Math.round(p * 100) + '%';
const brD = iso => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}`; };
export const legText = l => `${l.side === 'over' ? 'Mais de' : 'Menos de'} ${f1(l.line)} ${MARKETS[l.mk]?.lb.toLowerCase() || l.mk}`;
const uTxt = u => (Number.isInteger(u) ? u : String(u).replace('.', ',')) + 'u';

/* tips: lista no formato do registro (ou montada na hora). opts.cfg: marca, @, aviso, mostrar stats */
export function postText(tips, { cfg = {}, title = null, date = null } = {}) {
  const brand = cfg.brand || 'Garrafão Props', at = cfg.handle ? ' ' + cfg.handle : '';
  const out = [`🏀 ${title || 'NBA'} · ${brD(date || tips[0]?.date || '')} — ${brand}${at}`, ''];
  for (const t of tips) {
    if (t.kind === 'multi') {
      out.push(`🎯 MÚLTIPLA ${t.legs.length} pernas`);
      for (const l of t.legs) out.push(`• ${l.name} (${l.team}) — ${legText(l)}`);
      out.push(`💰 Odd ${f2(t.odd)}${t.book ? ' @ ' + t.book : ''} · Stake ${uTxt(t.units)}`);
    } else {
      const l = t.legs[0];
      out.push(`👤 ${l.name} (${l.team}) ${l.home === false ? '@' : 'vs'} ${l.opp}`);
      out.push(`📈 ${legText(l)}`);
      out.push(t.fairOnly ? `💰 Odd justa ${f2(t.odd)} (pegue acima disso) · Stake ${uTxt(t.units)}` : `💰 Odd ${f2(t.odd)}${t.book ? ' @ ' + t.book : ''} · Stake ${uTxt(t.units)}`);
      if (cfg.showStats !== false) {
        const bits = [];
        if (l.hitsL10) bits.push(`L10 ${l.hitsL10[0]}/${l.hitsL10[1]}`);
        if (l.hitsH2H?.[1]) bits.push(`H2H ${l.hitsH2H[0]}/${l.hitsH2H[1]}`);
        if (l.proj != null) bits.push(`proj. ${f1(+l.proj.toFixed(1))}`);
        if (bits.length) out.push('📊 ' + bits.join(' · '));
      }
    }
    if (t.note) out.push('📝 ' + t.note);
    out.push('');
  }
  out.push('🔞 +18 · ' + (WARNINGS[cfg.warn] || WARNINGS.dependencia));
  return out.join('\n');
}

/* ---------- cartão em imagem ---------- */
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fit(ctx, text, max, font, size, weight = 700) { let s = size; do { ctx.font = `${weight} ${s}px ${font}`; s -= 2; } while (ctx.measureText(text).width > max && s > 14); return text; }
function wrap(ctx, text, max) { const w = String(text).split(' '); const lines = []; let cur = ''; for (const x of w) { const t = cur ? cur + ' ' + x : x; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = x; } else cur = t; } if (cur) lines.push(cur); return lines; }


const FONT = 'Archivo, "Arial Narrow", system-ui, sans-serif';
function drawHead(ctx, { W, P, D, B, ACC, INK, MUT, cfg, title, right, rightSub = 'NBA · horário de Brasília' }) {
  ctx.fillStyle = ACC; rr(ctx, P, P, 14, 92, 4); ctx.fill();
  ctx.fillStyle = INK; fit(ctx, (cfg.brand || 'GARRAFÃO PROPS').toUpperCase(), W - P * 2 - 300, D, 72, 800); ctx.textBaseline = 'alphabetic';
  ctx.fillText((cfg.brand || 'GARRAFÃO PROPS').toUpperCase(), P + 34, P + 62);
  ctx.fillStyle = MUT; ctx.font = `600 30px ${B}`; ctx.fillText(title + (cfg.handle ? ' · ' + cfg.handle : ''), P + 34, P + 104);
  ctx.textAlign = 'right'; ctx.fillStyle = INK; fit(ctx, right, 300, D, 54, 800); ctx.fillText(right, W - P, P + 62);
  ctx.fillStyle = MUT; ctx.font = `600 26px ${B}`; ctx.fillText(rightSub, W - P, P + 102); ctx.textAlign = 'left';
}
// aviso obrigatório do Ministério da Fazenda: faixa branca com ≥ 10% da altura
function drawWarn(ctx, { W, H, P, D, warnH, cfg }) {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, H - warnH, W, warnH);
  ctx.font = `800 ${Math.round(warnH * .26)}px ${D}`;
  const warn = (WARNINGS[cfg.warn] || WARNINGS.dependencia).toUpperCase();
  const lines = wrap(ctx, warn, W - 2 * P - 120);
  ctx.fillStyle = '#000000'; rr(ctx, P, H - warnH + (warnH - 92) / 2, 92, 92, 14); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `800 40px ${D}`; ctx.textAlign = 'center'; ctx.fillText('18+', P + 46, H - warnH / 2 + 14); ctx.textAlign = 'left';
  ctx.fillStyle = '#000000'; ctx.font = `800 ${Math.round(warnH * .26)}px ${D}`;
  const lh = Math.round(warnH * .3); const ty = H - warnH / 2 - (lines.length - 1) * lh / 2 + lh * .32;
  lines.forEach((ln, i) => ctx.fillText(ln, P + 120, ty + i * lh));
}

/* ---------- relatório de resultados (transparência: mostra green E red) ---------- */
const sg = (x, d = 2) => x == null ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d).replace('.', ',');
const sgp = x => x == null ? '—' : sg(x * 100, 1) + '%';
const ST = { green: '✅', red: '❌', void: '↩️', halfgreen: '✅½', halfred: '❌½' };
export function resultsText(S, tips, { cfg = {}, label = '' } = {}) {
  const brand = cfg.brand || 'Garrafão Props', at = cfg.handle ? ' ' + cfg.handle : '';
  const out = [`📊 Resultados ${label} — ${brand}${at}`, ''];
  out.push(`${S.green} green · ${S.red} red${S.void ? ' · ' + S.void + ' devolvidas' : ''}`);
  out.push(`Lucro ${sg(S.profit)}u · ROI ${sgp(S.roi)} · odd média ${f2(S.avgOdd)}`);
  if (S.clv != null) out.push(`CLV médio ${sgp(S.clv)} (bateu o fechamento em ${pc(S.beatClose)})`);
  out.push('');
  for (const t of tips.slice(0, 15)) {
    const what = t.kind === 'multi' ? `Múltipla ${t.legs.length} pernas` : `${t.legs[0].name} ${legText(t.legs[0]).toLowerCase()}`;
    out.push(`${ST[t.status] || '•'} ${brD(t.date)} ${what} @${f2(t.odd)} (${sg(t.profit)}u)`);
  }
  out.push('', 'Todas as tips registradas entram na conta, inclusive as reds. Resultado passado não garante resultado futuro.');
  out.push('🔞 +18 · ' + (WARNINGS[cfg.warn] || WARNINGS.dependencia));
  return out.join('\n');
}
export async function drawResults(canvas, S, tips, { cfg = {}, format = 'feed', label = '' } = {}) {
  const W = 1080, H = format === 'story' ? 1920 : 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  try { await Promise.all(['800 40px Archivo', '600 30px Archivo'].map(f => document.fonts.load(f))); await document.fonts.ready; } catch { }
  const D = FONT, B = FONT; try { ctx.fontStretch = 'condensed'; } catch { }
  const ACC = '#2DB46E', CARD = '#0E1511', INK = '#FFFFFF', MUT = '#97A59C', BAD = '#FF6A5C';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const warnH = Math.ceil(H * .1) + 6, P = 64;
  drawHead(ctx, { W, P, D, B, ACC, INK, MUT, cfg, title: 'Resultados', right: label, rightSub: `${S.n} tips liquidadas` });
  // KPIs
  let y = P + 160; const gap = 18, kw = (W - 2 * P - gap * 3) / 4, kh = 190;
  const kpis = [['LUCRO', sg(S.profit) + 'u', S.profit >= 0 ? ACC : BAD], ['ROI', sgp(S.roi), (S.roi ?? 0) >= 0 ? ACC : BAD], ['ACERTO', S.hit == null ? '—' : Math.round(S.hit * 100) + '%', INK, `${S.green}G · ${S.red}R`], S.clv != null ? ['CLV', sgp(S.clv), S.clv >= 0 ? ACC : BAD, 'vs fechamento'] : ['ODD MÉDIA', f2(S.avgOdd), INK]];
  kpis.forEach(([lb, v, col, sub], i) => {
    const x = P + i * (kw + gap); ctx.fillStyle = CARD; rr(ctx, x, y, kw, kh, 20); ctx.fill();
    ctx.fillStyle = MUT; ctx.font = `700 24px ${B}`; ctx.fillText(lb, x + 24, y + 44);
    ctx.fillStyle = col; fit(ctx, v, kw - 48, D, 64, 800); ctx.fillText(v, x + 24, y + 122);
    if (sub) { ctx.fillStyle = MUT; ctx.font = `600 22px ${B}`; ctx.fillText(sub, x + 24, y + 164); }
  });
  y += kh + 30;
  // por nota
  const grades = ['A+', 'A', 'B', 'C', 'Múltipla'].filter(g => S.by?.grade?.[g]?.n);
  if (grades.length) {
    ctx.fillStyle = MUT; ctx.font = `700 24px ${B}`; ctx.fillText('POR NOTA', P, y + 24); y += 44;
    const gw = (W - 2 * P - gap * (grades.length - 1)) / grades.length;
    grades.forEach((g, i) => {
      const a = S.by.grade[g], x = P + i * (gw + gap); ctx.fillStyle = CARD; rr(ctx, x, y, gw, 96, 16); ctx.fill();
      ctx.fillStyle = g === 'A+' || g === 'A' ? ACC : INK; ctx.font = `800 40px ${D}`; ctx.fillText(g, x + 20, y + 60);
      ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.font = `700 28px ${B}`; ctx.fillText(`${a.green}/${a.green + a.red}`, x + gw - 20, y + 44);
      ctx.fillStyle = a.profit >= 0 ? ACC : BAD; ctx.font = `700 24px ${B}`; ctx.fillText(sg(a.profit) + 'u', x + gw - 20, y + 78); ctx.textAlign = 'left';
    });
    y += 96 + 30;
  }
  // lista das tips (a mais recente primeiro)
  const bottom = H - warnH - 70, rowH = 78, maxRows = Math.max(0, Math.floor((bottom - y - 40) / rowH));
  ctx.fillStyle = MUT; ctx.font = `700 24px ${B}`; ctx.fillText('ÚLTIMAS TIPS', P, y + 24); y += 44;
  for (const t of tips.slice(0, maxRows)) {
    const ok = t.status === 'green' || t.status === 'halfgreen', bad = t.status === 'red' || t.status === 'halfred';
    ctx.fillStyle = CARD; rr(ctx, P, y, W - 2 * P, rowH - 12, 14); ctx.fill();
    ctx.fillStyle = ok ? ACC : bad ? BAD : '#5E6A62'; rr(ctx, P, y, 10, rowH - 12, 5); ctx.fill();
    const what = t.kind === 'multi' ? `Múltipla · ${t.legs.length} pernas` : `${t.legs[0].name} · ${legText(t.legs[0]).toLowerCase()}`;
    ctx.fillStyle = INK; fit(ctx, what, W - 2 * P - 440, B, 28, 700); ctx.fillText(what, P + 30, y + 44);
    ctx.textAlign = 'right'; ctx.fillStyle = MUT; ctx.font = `600 26px ${B}`; ctx.fillText(`${brD(t.date)} · @${f2(t.odd)}`, W - P - 150, y + 44);
    ctx.fillStyle = ok ? ACC : bad ? BAD : MUT; ctx.font = `800 32px ${D}`; ctx.fillText(t.status === 'void' ? 'DEV.' : sg(t.profit) + 'u', W - P - 22, y + 45); ctx.textAlign = 'left';
    y += rowH;
  }
  ctx.fillStyle = MUT; ctx.font = `600 24px ${B}`; ctx.fillText('Todas as tips registradas entram na conta, inclusive as reds.', P, H - warnH - 34);
  drawWarn(ctx, { W, H, P, D, warnH, cfg });
  return canvas;
}

export async function drawCard(canvas, tips, { cfg = {}, format = 'feed', date = null, title = null } = {}) {
  const W = 1080, H = format === 'story' ? 1920 : 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  try { await Promise.all(['800 40px Archivo', '600 30px Archivo'].map(f => document.fonts.load(f))); await document.fonts.ready; } catch { }
  const D = 'Archivo, "Arial Narrow", system-ui, sans-serif', B = D, M = D;
  try { ctx.fontStretch = 'condensed'; } catch { }
  // preto, verde e branco (mesma paleta do app)
  const ACC = cfg.color || '#2DB46E', BG = '#000000', CARD = '#0E1511', INK = '#FFFFFF', MUT = '#97A59C', GOOD = '#2DB46E', UND = '#FFFFFF';
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  // textura de quadra discreta
  ctx.strokeStyle = 'rgba(45,180,110,.10)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(W / 2, H * .42, 360, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(W / 2 - 230, -10, 460, H * .42 - 10);
  const warnH = Math.ceil(H * .1) + 6; // aviso do MF: ≥ 10% da peça
  const P = 64;
  drawHead(ctx, { W, P, D, B, ACC, INK, MUT, cfg, title: title || 'Tips NBA', right: brD(date || tips[0]?.date || '') });
  // tips: escala para preencher o espaço (1 tip fica grande; várias encolhem)
  const top = P + 160, bottom = H - warnH - 36, avail = bottom - top;
  const blocks = tips.map(t => ({ t, h: t.kind === 'multi' ? 150 + t.legs.length * 80 : 300 }));
  const totalH = blocks.reduce((a, b) => a + b.h, 0) + 24 * (blocks.length - 1);
  const sc = Math.min(format === 'story' ? 1.55 : 1.3, avail / totalH);
  const CW = (W - P * 2) / sc;
  const off = Math.max(0, (avail - totalH * sc) / 2) * (tips.length <= 2 ? 1 : 0);
  ctx.save(); ctx.translate(P, top + off); ctx.scale(sc, sc);
  let yy = 0;
  for (const { t, h } of blocks) {
    ctx.fillStyle = CARD; rr(ctx, 0, yy, CW, h, 22); ctx.fill();
    if (t.kind === 'multi') {
      ctx.fillStyle = ACC; ctx.font = `800 40px ${D}`; ctx.fillText(`MÚLTIPLA · ${t.legs.length} PERNAS`, 32, yy + 58);
      let ly = yy + 116;
      for (const l of t.legs) {
        const col = (TEAM_INFO[l.team] || ['', '#444'])[1];
        ctx.fillStyle = col; rr(ctx, 32, ly - 42, 60, 56, 10); ctx.fill();
        ctx.fillStyle = onColor(col); ctx.font = `800 22px ${D}`; ctx.textAlign = 'center'; ctx.fillText(l.team, 62, ly - 6); ctx.textAlign = 'left';
        ctx.fillStyle = INK; fit(ctx, l.name, CW - 150, B, 32, 700); ctx.fillText(l.name, 112, ly - 12);
        ctx.fillStyle = l.side === 'over' ? GOOD : UND; fit(ctx, legText(l), CW - 150, B, 27, 600); ctx.fillText(legText(l), 112, ly + 22);
        ly += 80;
      }
      ctx.fillStyle = INK; ctx.font = `600 48px ${M}`; ctx.fillText(`@ ${f2(t.odd)}`, 32, yy + h - 30);
      ctx.textAlign = 'right'; ctx.fillStyle = MUT; ctx.font = `600 30px ${B}`; ctx.fillText(`${t.book ? t.book + ' · ' : ''}stake ${uTxt(t.units)}`, CW - 32, yy + h - 36); ctx.textAlign = 'left';
    } else {
      const l = t.legs[0]; const col = (TEAM_INFO[l.team] || ['', '#444'])[1];
      ctx.fillStyle = col; rr(ctx, 32, yy + 32, 84, 84, 16); ctx.fill();
      ctx.fillStyle = onColor(col); ctx.font = `800 32px ${D}`; ctx.textAlign = 'center'; ctx.fillText(l.team, 74, yy + 86); ctx.textAlign = 'left';
      ctx.fillStyle = INK; fit(ctx, l.name, CW - 400, B, 46, 800); ctx.fillText(l.name, 140, yy + 72);
      ctx.fillStyle = MUT; ctx.font = `600 27px ${B}`; ctx.fillText(`${l.home === false ? '@' : 'vs'} ${l.opp}${l.time ? ' · ' + l.time : ''}`, 140, yy + 110);
      ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.font = `600 66px ${M}`; ctx.fillText(f2(t.odd), CW - 32, yy + 86);
      ctx.fillStyle = MUT; ctx.font = `600 24px ${B}`; ctx.fillText(t.fairOnly ? 'odd justa' : t.book || 'odd', CW - 32, yy + 116); ctx.textAlign = 'left';
      // linha
      const side = `${l.side === 'over' ? 'MAIS DE' : 'MENOS DE'} ${f1(l.line)}`;
      ctx.fillStyle = l.side === 'over' ? 'rgba(45,180,110,.18)' : 'rgba(255,255,255,.09)'; rr(ctx, 32, yy + 140, CW - 64, 76, 14); ctx.fill();
      ctx.fillStyle = l.side === 'over' ? GOOD : UND; ctx.font = `800 44px ${D}`; ctx.fillText(side, 56, yy + 193);
      const sw = ctx.measureText(side).width; const mkt = MARKETS[l.mk]?.lb || l.mk;
      ctx.fillStyle = INK; fit(ctx, mkt, CW - 64 - sw - 70, B, 34, 700); ctx.fillText(mkt, 56 + sw + 22, yy + 191);
      // rodapé: números e stake
      const bits = [];
      if (cfg.showStats !== false) { if (l.hitsL10) bits.push(`L10 ${l.hitsL10[0]}/${l.hitsL10[1]}`); if (l.hitsH2H?.[1]) bits.push(`H2H ${l.hitsH2H[0]}/${l.hitsH2H[1]}`); if (l.proj != null) bits.push(`proj. ${f1(+l.proj.toFixed(1))}`); }
      const stk = `STAKE ${uTxt(t.units).toUpperCase()}`;
      ctx.font = `800 36px ${D}`; const stw = ctx.measureText(stk).width;
      ctx.textAlign = 'right'; ctx.fillStyle = ACC; ctx.fillText(stk, CW - 34, yy + 268); ctx.textAlign = 'left';
      ctx.fillStyle = MUT; fit(ctx, bits.join(' · '), CW - 68 - stw - 30, M, 28, 600); ctx.fillText(bits.join(' · '), 34, yy + 266);
    }
    yy += h + 24;
  }
  ctx.restore();
  drawWarn(ctx, { W, H, P, D, warnH, cfg });
  return canvas;
}
