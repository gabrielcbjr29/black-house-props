#!/usr/bin/env node
// Gabarito do canal (21/11): lê o texto das imagens das entradas postadas no canal principal (OCR com tesseract) e
// devolve para o bot, que separa jogador, mercado, linha e odd (public/gabarito.js) e corrige depois do jogo.
// Autenticação com o bot: token OIDC da rodada do Actions (sem secret no GitHub); fora do Actions, sha256("gab:" + token do bot). Uso:
//   node scripts/gabarito-ocr.mjs --check   → sai com 0 se há imagens para ler (3 se não há)
//   node scripts/gabarito-ocr.mjs           → lê e manda
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FN = 'https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/telegram-bot';
// chave: o token OIDC da rodada do GitHub Actions (não precisa de secret) ou, rodando fora do Actions, o token do bot
async function oidc() {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, t = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!u || !t) return null;
  const r = await fetch(u + '&audience=black-house-gab', { headers: { Authorization: 'Bearer ' + t } }).then(r => r.json()).catch(() => null);
  return r?.value ?? null;
}
const jwt = await oidc();
const H = jwt ? { Authorization: 'Bearer ' + jwt } : TOKEN ? { 'x-bh-auth': createHash('sha256').update('gab:' + TOKEN).digest('hex') } : null;
if (!H) { console.log('gabarito: sem chave (nem OIDC do Actions, nem TELEGRAM_BOT_TOKEN)'); process.exit(process.argv.includes('--check') ? 3 : 0); }
console.log('gabarito: chave ' + (jwt ? 'OIDC do GitHub' : 'token do bot ' + H['x-bh-auth'].slice(0, 6)));
const resp = await fetch(FN + '?gab=list', { headers: H }).catch(() => null);
if (resp?.status === 403) console.log('gabarito: o bot recusou a chave');
const list = resp?.ok ? await resp.json().catch(() => []) : [];
if (process.argv.includes('--check')) { console.log(`gabarito: ${list.length} imagem(ns) para ler`); process.exit(list.length ? 0 : 3); }
const dir = mkdtempSync(join(tmpdir(), 'gab-'));
const langs = (() => { try { return execFileSync('tesseract', ['--list-langs']).toString(); } catch { return ''; } })();
const lang = /\bpor\b/.test(langs) ? 'por+eng' : 'eng';
let ok = 0;
for (const it of list) {
  try {
    // a imagem vem pelo bot (ele baixa do Telegram com o próprio token)
    const im = await fetch(`${FN}?gab=img&id=${it.id}`, { headers: H });
    if (!im.ok) throw new Error('imagem ' + im.status + ' ' + (await im.text().catch(() => '')).slice(0, 120));
    const buf = Buffer.from(await im.arrayBuffer());
    const img = join(dir, `${it.id}.img`); writeFileSync(img, buf);
    const text = execFileSync('tesseract', [img, '-', '-l', lang], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const r = await fetch(FN + '?gab=ocr', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, text }) }).then(r => r.json()).catch(e => ({ ok: false, erro: String(e) }));
    console.log(`  #G${it.id}: ${r.ok ? `${r.legs} perna(s)${r.odd ? ' @' + r.odd : ''}${r.falta?.length ? ' · falta ' + r.falta.join(', ') : ''}` : 'erro ' + r.erro}`);
    if (r.ok) ok++;
  } catch (e) { console.log(`  #G${it.id}: falhou (${e.message})`); }
}
console.log(`gabarito: ${ok}/${list.length} lidas`);
