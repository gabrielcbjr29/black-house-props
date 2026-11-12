#!/usr/bin/env node
// Refaz o bot.json depois que o Modelo BH (model/predict.py) gravou as previsões no slate.json.
// Antes, busca as odds reais dos candidatos ao top 10 (teste do modelo; ver topodds.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { buildBotData } from './botdata.js';
import { topOdds, mergeTopLines } from './topodds.js';
import { loadState, saveState } from './oddsplan.js';
const dir = new URL('../public/data/', import.meta.url);
const STATE = new URL('../data/odds-state.json', import.meta.url).pathname;
const slate = JSON.parse(readFileSync(new URL('slate.json', dir), 'utf8'));
let prev = null; try { prev = JSON.parse(readFileSync(new URL('prev.json', dir), 'utf8')); } catch { }
try {
  const state = await loadState(STATE);
  const lines = await topOdds({ slate: { ...slate, prev }, key: process.env.ODDS_API_KEY, state });
  const n = mergeTopLines(slate, lines);
  await saveState(STATE, state);
  if (n) { writeFileSync(new URL('slate.json', dir), JSON.stringify(slate)); console.log(`odds dos tops: ${n} linhas reais no slate`); }
} catch (e) { console.log('odds dos tops: falhou (' + e.message + ')'); }
const bot = buildBotData({ ...slate, prev }, { w: +(process.env.BOT_W || .4) });
writeFileSync(new URL('bot.json', dir), JSON.stringify(bot));
console.log(`bot.json refeito com o Modelo BH: ${bot.rows.length} linhas, modelo em ${Object.keys(slate.model?.players || {}).length} jogadores`);
