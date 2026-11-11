"""Base de treino dos Modelos BH: uma linha por jogador-jogo, com features calculadas SÓ com
informação anterior ao jogo (sem olhar o futuro). Fonte: data/history/<temporada>.json (NBA ids).

Uso: python3 model/dataset.py  ->  model/out/dataset.parquet (ou .pkl)
"""
import json, math, os, sys
from collections import defaultdict, deque
import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SEASONS = ['2025-26', '2026-27']
# linha do box score (data/history): pid, team, pos, starter, min, pts, reb, oreb, ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta
COLS = ['pid', 'team', 'pos', 'starter', 'min', 'pts', 'reb', 'oreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta']
STATS = ['pts', 'reb', 'ast', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'twoa', 'twom', 'stl', 'blk', 'tov']
# mercados modelados (alvo = estatística do jogo)
TARGETS = ['fga', 'tpa', 'fta', 'twoa', 'twom', 'tpm', 'fgm', 'ftm', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov']


def load_games(seasons=SEASONS):
    games = []
    for s in seasons:
        h = json.load(open(os.path.join(ROOT, 'data', 'history', s + '.json')))
        G = h['games'].values() if isinstance(h['games'], dict) else h['games']
        for g in G:
            if g and g.get('r'):
                g['season'] = s
                games.append(g)
    games.sort(key=lambda g: (g['d'], g['gid']))
    return games


def rate(sumv, summ):
    return sumv / summ if summ > 0 else np.nan


def build(future=None, seasons=SEASONS):
    """future: jogos de hoje (sem box score real) -> geram features e não atualizam o estado"""
    games = load_games(seasons) + list(future or [])
    # estado acumulado (atualizado DEPOIS de gerar as features do jogo)
    plog = defaultdict(list)                 # pid -> lista de dicts por jogo (ordem cronológica)
    team_games = defaultdict(list)           # team -> lista (date, poss, pts_for, pts_against, rotation mins dict)
    allowed = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))  # (season, opp) -> pos -> stat soma (+ 'min')
    allowed_n = defaultdict(int)             # (season, opp) -> jogos
    league = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))  # season -> pos -> stat soma
    league_n = defaultdict(int)
    pace_hist = defaultdict(list)            # team -> posses por jogo
    rows = []
    for g in games:
        season, d = g['season'], g['d']
        home, away = g['h'], g['a']
        box = [dict(zip(COLS, r)) for r in g['r']]
        for b in box:
            b['twoa'] = b['fga'] - b['tpa']; b['twom'] = b['fgm'] - b['tpm']
        fut = bool(g.get('future'))
        teams_in = {home: away, away: home}
        poss_h, poss_a = g.get('ph'), g.get('pa')
        # liga até agora (por posição, por 48 min de posição) — base para "defesa x posição"
        lg = league[season]; lgn = league_n[season]
        for b in box:
            pid, team = b['pid'], b['team']
            if team not in teams_in or b['min'] is None or b['min'] <= 0:
                continue
            opp = teams_in[team]
            hist = plog[pid]
            if len(hist) < 8:
                continue
            last = hist[-1]
            f = {'future': fut, 'gid': g['gid'], 'date': d, 'season': season, 'pid': pid, 'team': team, 'opp': opp, 'pos': b['pos'] or 'F',
                 'home': 1 if team == home else 0, 'starter': (np.nan if (fut and b['starter'] is None) else int(b['starter'] or 0))}
            # minutos esperados
            mins = [x['min'] for x in hist]
            f['m5'] = np.mean(mins[-5:]); f['m10'] = np.mean(mins[-10:]); f['m20'] = np.mean(mins[-20:])
            cur = [x for x in hist if x['season'] == season]
            f['gp_season'] = len(cur)
            f['mS'] = np.mean([x['min'] for x in cur]) if cur else f['m20']
            f['start_rate10'] = np.mean([x['starter'] for x in hist[-10:]])
            # descanso
            dd = (pd.Timestamp(d) - pd.Timestamp(last['date'])).days
            f['rest'] = min(dd, 5); f['b2b'] = 1 if dd == 1 else 0
            # ritmo: média de posses do time e do adversário nos últimos 10 jogos
            ph = pace_hist[team][-10:]; po = pace_hist[opp][-10:]
            f['pace_t'] = np.mean(ph) if ph else np.nan; f['pace_o'] = np.mean(po) if po else np.nan
            # força dos times (saldo médio últimos 15) → risco de lavada
            tg = team_games[team][-15:]; og = team_games[opp][-15:]
            f['net_t'] = np.mean([x[2] - x[3] for x in tg]) if tg else 0.0
            f['net_o'] = np.mean([x[2] - x[3] for x in og]) if og else 0.0
            # desfalques: titulares/rotação recentes do time que NÃO jogaram hoje (participação nos arremessos)
            played = {x['pid'] for x in box if x['team'] == team and (x['min'] or 0) > 0}
            rot = defaultdict(lambda: [0.0, 0.0, 0.0])  # pid -> [min, fga, n]
            for (_, _, _, _, rm) in tg[-5:]:
                for qp, (mm, fa) in rm.items():
                    rot[qp][0] += mm; rot[qp][1] += fa; rot[qp][2] += 1
            vac_min = vac_fga = 0.0
            for qp, (mm, fa, nn) in rot.items():
                if qp == pid or qp in played or nn < 3:
                    continue
                if mm / nn >= 20:
                    vac_min += mm / nn; vac_fga += fa / nn
            f['vac_min'] = vac_min; f['vac_fga'] = vac_fga
            for st in STATS:
                v = np.array([x[st] for x in hist], dtype=float); m = np.array(mins, dtype=float)
                f[f'r5_{st}'] = rate(v[-5:].sum(), m[-5:].sum())
                f[f'r10_{st}'] = rate(v[-10:].sum(), m[-10:].sum())
                f[f'r20_{st}'] = rate(v[-20:].sum(), m[-20:].sum())
                f[f'r60_{st}'] = rate(v[-60:].sum(), m[-60:].sum())
                cv = np.array([x[st] for x in cur], dtype=float); cm = np.array([x['min'] for x in cur], dtype=float)
                f[f'rS_{st}'] = rate(cv.sum(), cm.sum()) if len(cur) else np.nan
                f[f'a10_{st}'] = v[-10:].mean()
                # confronto direto: taxa por minuto contra este adversário (até 2 temporadas)
                hh = [x for x in hist if x['opp'] == opp]
                f[f'h2h_n'] = len(hh)
                f[f'rH_{st}'] = rate(sum(x[st] for x in hh), sum(x['min'] for x in hh)) if hh else np.nan
                # participação do jogador nas tentativas do time (uso)
            fga_t = [x['team_fga'] for x in hist[-10:] if x.get('team_fga')]
            f['fga_share10'] = (sum(x['fga'] for x in hist[-10:]) / sum(fga_t)) if fga_t else np.nan
            # defesa x posição: quanto o adversário cede por 48 min à posição, relativo à liga (temporada atual)
            key = (season, opp); an = allowed_n[key]
            pos = f['pos']
            for st in STATS:
                a = allowed[key][pos]
                f[f'def_{st}'] = (a[st] / a['min'] * 48) if an >= 3 and a['min'] > 0 else np.nan
                lgp = lg[pos]
                f[f'lg_{st}'] = (lgp[st] / lgp['min'] * 48) if lgp['min'] > 0 else np.nan
            f['def_n'] = an
            # alvo
            for st in STATS:
                f['y_' + st] = np.nan if fut else b[st]
            f['y_min'] = np.nan if fut else b['min']
            rows.append(f)
        if fut:
            continue
        # ---- atualiza estado com o jogo ----
        team_fga = defaultdict(float)
        for b in box:
            team_fga[b['team']] += b['fga'] or 0
        for b in box:
            if b['team'] not in teams_in or b['min'] is None or b['min'] <= 0:
                continue
            e = {k: (b[k] or 0) for k in STATS + ['min']}
            e.update({'date': d, 'season': season, 'opp': teams_in[b['team']], 'starter': int(b['starter'] or 0), 'team_fga': team_fga[b['team']]})
            plog[b['pid']].append(e)
            opp = teams_in[b['team']]; pos = b['pos'] or 'F'
            A = allowed[(season, opp)][pos]
            for st in STATS:
                A[st] += e[st]; league[season][pos][st] += e[st]
            A['min'] += e['min']; league[season][pos]['min'] += e['min']
        for t in (home, away):
            allowed_n[(season, t)] += 1
        pts = {home: g.get('hs') or 0, away: g.get('as') or 0}
        for t, poss in ((home, poss_h), (away, poss_a)):
            if poss:
                pace_hist[t].append(poss)
            rm = {b['pid']: (b['min'], b['fga']) for b in box if b['team'] == t and (b['min'] or 0) > 0}
            team_games[t].append((d, poss, pts[t], pts[teams_in[t]], rm))
        league_n[season] += 1
    df = pd.DataFrame(rows)
    return df


if __name__ == '__main__':
    df = build()
    out = os.path.join(ROOT, 'model', 'out'); os.makedirs(out, exist_ok=True)
    df.to_pickle(os.path.join(out, 'dataset.pkl'))
    print(df.shape, df['date'].min(), df['date'].max())
    print(df.groupby('season').size())
