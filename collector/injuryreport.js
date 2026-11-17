// Relatório OFICIAL de lesões da NBA (PDF publicado ao longo do dia em ak-static.cms.nba.com).
// É a fonte que as casas usam; a ESPN costuma repetir com atraso. Experimental e opcional:
// precisa de Python com pypdf para ler o PDF. Se falhar, a coleta segue com a ESPN.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normName, countReq } from './http.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEAMS = { 'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN', 'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE', 'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET', 'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND', 'LA Clippers': 'LAC', 'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX', 'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS' };
// "Available" no relatório oficial = liberado: vira probable (o slate trata como ok e derruba um "dúvida" antigo da ESPN)
const ST = { out: 'out', doubtful: 'doubtful', questionable: 'questionable', probable: 'probable', available: 'probable' };
const W = String.raw`[A-ZÀ-Þ][A-Za-zÀ-ÿ'’.\-]*`, SUF = String.raw`(?:Jr\.?|Sr\.?|II|III|IV|V)`;

/* Texto do PDF → { nomeNormalizado: {name, status, note, team} }.
   Não depende do jeito que o PDF foi extraído (uma linha da tabela por linha, uma célula por linha ou uma PALAVRA por
   linha, como o pypdf 5+/6 faz): junta tudo num texto só e ancora em "Sobrenome, Nome <Status>".
   date (YYYY-MM-DD): fica só com os jogos desse dia (o relatório também traz os jogos de amanhã).
   Sobrenome de duas palavras (Da Silva, Jones Garcia) é ambíguo no texto corrido; grava também essa chave como apelido
   (alias: true) — uma chave que não é de ninguém não casa com jogador nenhum. */
const SUFX = /^(Jr\.?|Sr\.?|II|III|IV|V)$/;
export function parseInjuryText(text, { date = null } = {}) {
  const teamRe = new RegExp('(' + Object.keys(TEAMS).sort((a, b) => b.length - a.length).map(t => t.replace(/ /g, '\\s+')).join('|') + ')', 'g');
  let t = String(text).replace(/\r/g, '')
    .replace(/Injury\s+Report:\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)/gi, ' ')
    .replace(/Page\s+\d+\s+of\s+\d+/gi, ' ')
    .replace(/Game\s+Date\s+Game\s+Time\s+Matchup\s+Team\s+Player\s+Name\s+Current\s+Status\s+Reason/gi, ' ')
    .replace(/\s+/g, ' ');
  // marcadores de data e de time na ordem em que aparecem
  const marks = [];
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) marks.push({ at: m.index, date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` });
  for (const m of t.matchAll(teamRe)) marks.push({ at: m.index, team: TEAMS[m[0].replace(/\s+/g, ' ')] });
  marks.sort((a, b) => a.at - b.at);
  const ctxAt = i => { let d = null, tm = null; for (const k of marks) { if (k.at > i) break; if (k.date) d = k.date; if (k.team) tm = k.team; } return { d, tm }; };
  const rowRe = new RegExp(String.raw`((?:${W} )?${W}(?: ${SUF})?), ((?:${W} ){0,2}${W}) (Out|Questionable|Doubtful|Probable|Available)\b`, 'g');
  const rows = [...t.matchAll(rowRe)].map(m => {
    const words = m[1].split(' '), one = SUFX.test(words[words.length - 1]) ? words.slice(-2) : words.slice(-1);
    return Object.assign(m, { words, one, start: m.index + m[1].length - one.join(' ').length });
  });
  const out = {};
  rows.forEach((m, i) => {
    const { d, tm } = ctxAt(m.index);
    if (date && d && d !== date) return;
    const code = ST[m[3].toLowerCase()]; if (code === undefined) return;
    // motivo: do fim do status até a próxima linha/time/data
    const from = m.index + m[0].length, nxt = Math.min(rows[i + 1]?.start ?? t.length, ...marks.filter(k => k.at > from).map(k => k.at).slice(0, 1));
    const note = t.slice(from, nxt).replace(/NOT YET SUBMITTED.*$/i, '').replace(/^\s*Injury\/Illness\s*-\s*/i, '').trim().slice(0, 80);
    // a forma de uma palavra (+ sufixo) é a principal; a de duas palavras vira apelido
    const { words, one } = m, first = m[2];
    const main = `${first} ${one.join(' ')}`;
    const rec = { name: main, status: code, note, team: tm, source: 'NBA oficial' };
    out[normName(main)] = rec;
    if (words.length > one.length) { const alt = `${first} ${words.join(' ')}`; out[normName(alt)] ??= { ...rec, name: alt, alias: true }; }
  });
  return out;
}
// horários candidatos (do mais recente para trás) no fuso de Nova York
function candidates(now = new Date(), hoursBack = 10) {
  const out = [];
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });
  for (let m = 0; m <= hoursBack * 60; m += 15) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(now.getTime() - m * 6e4)).map(x => [x.type, x.value]));
    const mm = String(Math.floor(+p.minute / 15) * 15).padStart(2, '0'); const ap = p.dayPeriod.toUpperCase();
    const d = `${p.year}-${p.month}-${p.day}`;
    out.push(`${d}_${p.hour}_${mm}${ap}`); if (mm === '30') out.push(`${d}_${p.hour}${ap}`);
  }
  return [...new Set(out)];
}
/* after: último relatório já lido (não busca de novo nem os mais antigos que ele).
   hoursBack: quanto voltar no tempo procurando. Devolve null se não há relatório novo. */
export async function fetchOfficialInjuries({ log = console.log, after = null, hoursBack = 4, date = null } = {}) {
  const order = s => { const m = /(\d{4}-\d{2}-\d{2})_(\d{2})(?:_(\d{2}))?(AM|PM)/.exec(s); if (!m) return 0; let h = +m[2] % 12 + (m[4] === 'PM' ? 12 : 0); return Date.parse(m[1] + 'T00:00:00Z') / 6e4 + h * 60 + (m[3] ? +m[3] : 30); };
  for (const c of candidates(new Date(), hoursBack)) {
    if (after && order(c) <= order(after)) return null;
    const url = `https://ak-static.cms.nba.com/referee/injury/Injury-Report_${c}.pdf`;
    countReq(url); let res; try { res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) }); } catch { continue; }
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const f = join(mkdtempSync(join(tmpdir(), 'inj-')), 'r.pdf'); writeFileSync(f, buf);
    // python3 no Linux/Mac; no Windows costuma ser python ou py
    let text = null, lastErr = null;
    for (const py of ['python3', 'python', 'py']) { try { text = execFileSync(py, [join(HERE, 'pdftext.py'), f], { encoding: 'utf8', maxBuffer: 20e6, windowsHide: true }); break; } catch (e) { lastErr = e; } }
    if (text == null) throw lastErr;
    const parsed = parseInjuryText(text, { date });
    const n = Object.values(parsed).filter(x => !x.alias).length;
    log(`  relatório oficial: ${c} (${n} jogadores)`);
    // leitura vazia com o PDF baixado = formato mudou; volta a tentar na próxima coleta em vez de guardar "ninguém"
    if (!n && !/NOT YET SUBMITTED/i.test(text)) throw new Error(`relatório ${c} baixado mas nenhum jogador lido (formato do PDF mudou?)`);
    return { report: c, injuries: parsed };
  }
  throw new Error('nenhum relatório oficial encontrado nas últimas horas');
}
