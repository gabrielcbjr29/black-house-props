#!/usr/bin/env node
// Refaz o bot.json depois que o Modelo BH (model/predict.py) gravou as previsões no slate.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildBotData } from './botdata.js';
const dir = new URL('../public/data/', import.meta.url);
const slate = JSON.parse(readFileSync(new URL('slate.json', dir), 'utf8'));
let prev = null; try { prev = JSON.parse(readFileSync(new URL('prev.json', dir), 'utf8')); } catch { }
const bot = buildBotData({ ...slate, prev }, { w: +(process.env.BOT_W || .4) });
writeFileSync(new URL('bot.json', dir), JSON.stringify(bot));
console.log(`bot.json refeito com o Modelo BH: ${bot.rows.length} linhas, modelo em ${Object.keys(slate.model?.players || {}).length} jogadores`);
