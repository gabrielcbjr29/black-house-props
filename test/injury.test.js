import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseInjuryText } from '../collector/injuryreport.js';

const WORDS = readFileSync(new URL('./fixtures/injury-report-wordlines.txt', import.meta.url), 'utf8');
const real = o => Object.fromEntries(Object.entries(o).filter(([, v]) => !v.alias));

test('lesões oficiais: lê o PDF extraído uma palavra por linha (pypdf 6), com quebra de página no meio', () => {
  const r = parseInjuryText(WORDS, { date: '2026-11-17' });
  assert.equal(r['kawhi leonard'].status, 'out'); assert.equal(r['kawhi leonard'].team, 'TOR');
  assert.equal(r['kawhi leonard'].note, 'Left Knee Injury Management');
  assert.equal(r['isaiah joe'].status, 'doubtful'); assert.equal(r['isaiah joe'].team, 'DET');
  assert.equal(r['kevin mccullar'].name, 'Kevin McCullar Jr.');
  assert.equal(r['ronald holland'].note, 'Left Knee Contusion / Bone Bruise');
  assert.equal(r['jakobi gillespie'].team, 'SAS');
  assert.equal(r['yanic konan niederhauser'].team, 'LAC');
  assert.equal(r['quentin grimes'].status, 'probable', 'Available = liberado');
  assert.equal(r['walker kessler'].note, 'Right Lower Leg Soreness', 'motivo continua depois da quebra de página');
  assert.equal(r['austin reaves'].status, 'out'); assert.equal(r['austin reaves'].team, 'LAL');
  assert.equal(r['jabari smith'], undefined, 'jogo de amanhã fica de fora');
  assert.equal(Object.keys(real(r)).length, 15);
  assert.equal(Object.keys(real(parseInjuryText(WORDS))).length, 16, 'sem data: pega todos');
});

test('lesões oficiais: também lê o formato antigo (uma linha da tabela por linha)', () => {
  const t = ['Game Date Game Time Matchup Team Player Name Current Status Reason',
    '11/17/2026 07:30 (ET) NYK@TOR Toronto Raptors Bittle, Nate Out Injury/Illness - Right Foot Avulsion Fracture',
    'Leonard, Kawhi Questionable Injury/Illness - Left Knee Injury Management',
    'Da Silva, Tristan Probable Injury/Illness - Ankle'].join('\n');
  const r = parseInjuryText(t, { date: '2026-11-17' });
  assert.equal(r['nate bittle'].note, 'Right Foot Avulsion Fracture');
  assert.equal(r['kawhi leonard'].status, 'questionable');
  assert.equal(r['tristan da silva'].status, 'probable', 'sobrenome de duas palavras entra como apelido');
  assert.ok(r['tristan da silva'].alias);
});
