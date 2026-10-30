// Alerta no Telegram (opcional): 1 resumo por dia com as linhas de mais valor.
// Precisa de TELEGRAM_BOT_TOKEN (crie com o @BotFather) e TELEGRAM_CHAT_ID (seu chat ou um grupo privado).
// Vai para VOCÊ revisar antes de postar: não publica nada no seu canal sozinho.
import { buildProps, evaluate, kelly, MARKETS, divergence } from '../public/engine.js';
import { countReq } from './http.js';

const f2 = n => Number(n).toFixed(2).replace('.', ','), f1 = n => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1).replace('.', ','));
export function dailySummary(slate, { n = 5, w = .55, appUrl = '' } = {}) {
  const seen = new Set();
  const rows = buildProps(slate).map(pr => { const e = evaluate(pr, null, { w }); return { pr, e, s: e[e.best] }; })
    .filter(x => x.s.odd && x.s.ev >= .03 && (x.s.grade === 'A' || x.s.grade === 'A+') && x.pr.p.status === 'ok')
    .sort((a, b) => kelly(b.s.p, b.s.odd) - kelly(a.s.p, a.s.odd))
    .filter(x => !seen.has(x.pr.p.id) && seen.add(x.pr.p.id)).slice(0, n);
  if (!rows.length) return null;
  const [y, m, d] = slate.meta.date.split('-');
  const lines = [`Resumo ${d}/${m}: ${rows.length} linhas com valor`, ''];
  for (const { pr, e, s } of rows) lines.push(`${s.grade} · ${pr.p.name} (${pr.p.team}) ${s.side === 'over' ? 'mais de' : 'menos de'} ${f1(e.line)} ${MARKETS[pr.mk].lb.toLowerCase()} · odd ${f2(s.odd)} ${s.book} · chance ${Math.round(s.p * 100)}% · EV +${(s.ev * 100).toFixed(1).replace('.', ',')}%`);
  if (appUrl) lines.push('', appUrl);
  lines.push('', 'Confira lesões e quinteto antes de entrar. +18.');
  return lines.join('\n');
}
/* Radar: casa pagando acima do consenso das outras (divergência ≥ min). `sent` = chaves já avisadas
   hoje, para não repetir o mesmo alerta a cada coleta. Devolve { text, keys } ou null. */
export function radarAlerts(slate, { min = .04, sent = [], n = 5 } = {}) {
  const done = new Set(sent);
  const rows = buildProps(slate).filter(pr => pr.book && pr.p.status === 'ok').map(pr => ({ pr, d: divergence(pr.book.books) }))
    .filter(x => x.d && x.d.edge >= min).map(x => ({ ...x, key: `${x.pr.id}|${x.d.side}|${x.pr.book.line}|${x.d.book}` }))
    .filter(x => !done.has(x.key)).sort((a, b) => b.d.edge - a.d.edge).slice(0, n);
  if (!rows.length) return null;
  const lines = ['Radar: casa acima do consenso', ''];
  for (const { pr, d } of rows) lines.push(`${pr.p.name} (${pr.p.team}) ${d.side === 'over' ? 'mais de' : 'menos de'} ${f1(pr.book.line)} ${MARKETS[pr.mk].lb.toLowerCase()} · ${d.book} ${f2(d.odd)} · justa ${f2(d.fairOdd)} · +${(d.edge * 100).toFixed(1).replace('.', ',')}% (${d.n} casas)`);
  lines.push('', 'Linha atrasada costuma corrigir rápido: confira na casa antes de entrar. +18.');
  return { text: lines.join('\n'), keys: rows.map(x => x.key) };
}
export async function sendTelegram({ token, chatId, text }) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`; countReq(url);
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }) });
  if (!r.ok) throw new Error('Telegram respondeu ' + r.status);
}
