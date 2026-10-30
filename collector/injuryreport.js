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
const ST = { out: 'out', doubtful: 'doubtful', questionable: 'questionable', probable: 'probable', available: null };
const NAME = String.raw`([A-Z][A-Za-z'’.\-]+(?: (?:Jr\.?|Sr\.?|II|III|IV|V))?(?: [A-Z][A-Za-z'’.\-]+(?: (?:Jr\.?|Sr\.?|II|III|IV|V))?)?), ?([A-Z][A-Za-z'’.\-]+(?: [A-Z][A-Za-z'’.\-]+)?)`;

/* Texto do PDF → { nomeNormalizado: {name, status, note, team} }.
   Aceita os dois jeitos de extração: uma linha por linha da tabela, ou uma célula por linha. */
export function parseInjuryText(text) {
  const teamRe = new RegExp('(' + Object.keys(TEAMS).sort((a, b) => b.length - a.length).map(t => t.replace(/ /g, '\\s+')).join('|') + ')', 'g');
  let lines = String(text).replace(/\r/g, '').replace(teamRe, m => '\n@@' + TEAMS[m.replace(/\s+/g, ' ')] + '\n').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // remove data, hora e confronto do começo das linhas
  lines = lines.map(s => s.replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*/, '').replace(/^\d{1,2}:\d{2}\s*\(ET\)\s*/i, '').replace(/^[A-Z]{2,3}@[A-Z]{2,3}\s*/, '').trim()).filter(Boolean);
  const out = {}; let team = null;
  const rowRe = new RegExp('^' + NAME + ' (Out|Questionable|Doubtful|Probable|Available)\\b ?(.*)$');
  const nameOnly = new RegExp('^' + NAME + '$');
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i];
    if (s.startsWith('@@')) { team = s.slice(2); continue; }
    if (nameOnly.test(s) && /^(Out|Questionable|Doubtful|Probable|Available)$/.test(lines[i + 1] || '')) { s = s + ' ' + lines[i + 1] + ' ' + (lines[i + 2] && !lines[i + 2].startsWith('@@') && !nameOnly.test(lines[i + 2]) ? lines[i + 2] : ''); i++; }
    const m = rowRe.exec(s); if (!m) continue;
    const name = `${m[2]} ${m[1]}`.trim(), code = ST[m[3].toLowerCase()];
    if (code === undefined) continue;
    out[normName(name)] = { name, status: code, note: (m[4] || '').replace(/^Injury\/Illness\s*-\s*/i, '').slice(0, 80), team, source: 'NBA oficial' };
  }
  for (const k in out) if (out[k].status === null) delete out[k];
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
export async function fetchOfficialInjuries({ log = console.log, after = null, hoursBack = 4 } = {}) {
  const order = s => { const m = /(\d{4}-\d{2}-\d{2})_(\d{2})(?:_(\d{2}))?(AM|PM)/.exec(s); if (!m) return 0; let h = +m[2] % 12 + (m[4] === 'PM' ? 12 : 0); return Date.parse(m[1] + 'T00:00:00Z') / 6e4 + h * 60 + (m[3] ? +m[3] : 30); };
  for (const c of candidates(new Date(), hoursBack)) {
    if (after && order(c) <= order(after)) return null;
    const url = `https://ak-static.cms.nba.com/referee/injury/Injury-Report_${c}.pdf`;
    countReq(url); let res; try { res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) }); } catch { continue; }
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const f = join(mkdtempSync(join(tmpdir(), 'inj-')), 'r.pdf'); writeFileSync(f, buf);
    const text = execFileSync('python3', [join(HERE, 'pdftext.py'), f], { encoding: 'utf8', maxBuffer: 20e6 });
    const parsed = parseInjuryText(text);
    log(`  relatório oficial: ${c} (${Object.keys(parsed).length} jogadores)`);
    return { report: c, injuries: parsed };
  }
  throw new Error('nenhum relatório oficial encontrado nas últimas horas');
}
