#!/usr/bin/env node
// Refaz o bot.json depois que o Modelo BH (model/predict.py) gravou as previsões no slate.json.
// Antes, busca as odds reais dos candidatos ao top 10 (teste do modelo; ver topodds.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { buildBotData } from './botdata.js';
import { topOdds, mergeTopLines } from './topodds.js';
import { loadState, saveState } from './oddsplan.js';
import { fetch99, merge99 } from './casa99.js';
import { pickStrategies } from './strategies.js';
import { buildCombo } from './combo.js';
import { aberturaDoDia, marcaMovimento, buildCorrel } from './leitura.js';
const dir = new URL('../public/data/', import.meta.url);
const STATE = new URL('../data/odds-state.json', import.meta.url).pathname;
const slate = JSON.parse(readFileSync(new URL('slate.json', dir), 'utf8'));
let prev = null; try { prev = JSON.parse(readFileSync(new URL('prev.json', dir), 'utf8')); } catch { }
let state = null;
try { state = await loadState(STATE); } catch (e) { console.log('estado das odds: falhou (' + e.message + ')'); }
// linhas da 99play (casa do usuário): viram a linha principal de cada jogador/mercado que ela abre
let n99 = 0;
if (state) try {
  n99 = merge99(slate, await fetch99({ slate, state }));
  console.log(`99play: ${n99} linhas no slate`);
} catch (e) { console.log('99play: falhou (' + e.message + ')'); }
let n = 0;
if (state) try {
  const lines = await topOdds({ slate: { ...slate, prev }, key: process.env.ODDS_API_KEY, state });
  n = mergeTopLines(slate, lines);
  if (n) console.log(`odds dos tops: ${n} linhas reais no slate`);
} catch (e) { console.log('odds dos tops: falhou (' + e.message + ')'); }
if (state) await saveState(STATE, state).catch(() => null);
if (n || n99) writeFileSync(new URL('slate.json', dir), JSON.stringify(slate));
let kalshi = null; try { kalshi = JSON.parse(readFileSync(new URL('kalshi.json', dir), 'utf8')); } catch { }
// Finta (19/11): leitura gravada pela coleta; só vale a do mesmo dia
let finta = null; try { const f = JSON.parse(readFileSync(new URL('finta.json', dir), 'utf8')); if (f.date === slate.meta?.date) finta = f; } catch { }
const bot = buildBotData({ ...slate, prev }, { w: +(process.env.BOT_W || .4), kalshi, finta });
// leitura do mercado (21/11): abertura do dia (99play e Finta) e movimento em cada linha do bot
try { const A = aberturaDoDia(new URL('../data/abertura.json', import.meta.url).pathname, slate, finta); console.log(`movimento de linha: ${marcaMovimento(bot.rows, A)} linhas mexeram desde a abertura`); }
catch (e) { console.log('movimento de linha: falhou (' + e.message + ')'); }
// props correlacionadas (21/11): histórico por time do dia + linhas de hoje
try { const H = ['2025-26', '2026-27'].map(s => new URL(`../data/history/${s}.json`, import.meta.url).pathname); console.log(`correl: ${buildCorrel(slate, finta, H, new URL('correl', dir).pathname)} times`); }
catch (e) { console.log('correl: falhou (' + e.message + ')'); }
writeFileSync(new URL('bot.json', dir), JSON.stringify(bot));
// fábrica de estratégias: entradas do dia de cada estratégia (registradas em papel pela função estrategias)
try {
  const st = pickStrategies(bot, slate.games);
  writeFileSync(new URL('strategies.json', dir), JSON.stringify(st));
  console.log('estratégias: ' + st.strategies.map(s => `${s.id} ${st.picks.filter(p => p.strategy_id === s.id).length}`).join(' · '));
} catch (e) { console.log('estratégias: falhou (' + e.message + ')'); }
// /combo (19/11): escada de rebotes/assistências da Finta por jogador + últimos 20 jogos; a escada da 99play entra no bot
try { const C = buildCombo(slate, finta); if (C) { writeFileSync(new URL('combo.json', dir), JSON.stringify(C)); console.log(`combo.json: ${C.players.length} jogadores`); } }
catch (e) { console.log('combo.json: falhou (' + e.message + ')'); }
console.log(`bot.json refeito com o Modelo BH: ${bot.rows.length} linhas, modelo em ${Object.keys(slate.model?.players || {}).length} jogadores`);
