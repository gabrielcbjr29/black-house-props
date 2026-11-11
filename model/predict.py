"""Modelo BH do dia: treina os modelos por mercado com a temporada passada, recalibra com os jogos
desta temporada (o nível de jogo muda de um ano para o outro) e prevê os jogos do slate de hoje.
Grava o resultado dentro do public/data/slate.json (campo "model") e em public/data/model.json.

Uso: python3 model/predict.py [public/data/slate.json]
"""
import json, os, re, sys, unicodedata
from datetime import datetime, timezone
import numpy as np, pandas as pd
from sklearn.linear_model import PoissonRegressor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dataset import build, SEASONS, ROOT
from train import features, nb_k, FEATS, LABEL, TARGETS

PRIOR = 150  # recalibração: peso do fator neutro (em jogos)
norm = lambda s: re.sub(r'[^a-z ]', '', unicodedata.normalize('NFD', str(s).lower()).encode('ascii', 'ignore').decode()).strip()


def seasons_available():
    return sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'data', 'history')) if re.match(r'^\d{4}-\d{2}\.json$', f))


def today_games(slate, known_ids, name_to_id):
    """jogos do slate como 'jogos futuros' (sem box score): uma linha por jogador disponível"""
    out = []; mapped = {}
    for g in slate['games']:
        rows = []
        for p in slate['players']:
            if p['team'] not in (g['home'], g['away']) or p.get('status') in ('out', 'doubtful'):
                continue
            pid = int(p['id']) if str(p['id']).isdigit() else None
            if pid not in known_ids:  # ids da ESPN em dia de fallback: casa pelo nome
                pid = name_to_id.get(norm(p['name']))
            if pid is None:
                continue
            mapped[pid] = p['id']
            role = (p.get('lineup') or {}).get('role')
            starter = 1 if role == 'starter' else 0 if role == 'bench' else None
            rows.append([pid, p['team'], p.get('pos') or 'F', starter, 1] + [0] * 14)
        if rows:
            out.append({'gid': 'hoje-' + g['id'], 'd': slate['meta']['date'], 'season': slate['meta'].get('season') or '', 'h': g['home'], 'a': g['away'], 'r': rows, 'future': True})
    return out, mapped


def main(slate_path):
    slate = json.load(open(slate_path))
    seasons = seasons_available()[-2:]  # temporada passada + atual
    cur_season = seasons[-1]
    names = {}
    for s in seasons:
        h = json.load(open(os.path.join(ROOT, 'data', 'history', s + '.json')))
        for k, v in h['names'].items():
            names[norm(v if isinstance(v, str) else v.get('n', ''))] = int(k)
    known = set(names.values())
    fut, mapped = today_games(slate, known, names)
    df = build(future=fut, seasons=seasons)
    hist = df[~df.future & (df.m10 >= 8)]
    today = df[df.future].copy()
    # titular desconhecido: usa o padrão dos últimos 10 jogos
    today['starter'] = today['starter'].where(today['starter'].notna(), (today['start_rate10'] >= .5).astype(int)).astype(int)
    prev = hist[hist.season != cur_season]
    if len(prev) < 5000:  # sem temporada passada suficiente: treina com tudo até 14 dias atrás
        prev = hist[pd.to_datetime(hist.date) < pd.to_datetime(slate['meta']['date']) - pd.Timedelta(days=14)]
    cur = hist[hist.season == cur_season].copy(); cur['grp'] = (cur.gp_season >= 5).astype(int)
    today['grp'] = (today.gp_season >= 5).astype(int)
    pace_avg = float(np.nanmean(prev['pace_t']))
    res = {'v': 1, 'date': slate['meta']['date'], 'gen': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'treino': {'temporada': sorted(prev.season.unique().tolist()), 'jogos': int(len(prev))}, 'recal': {}, 'players': {}}
    for st in TARGETS:
        X = features(prev, st, pace_avg); y = prev['y_' + st].values.astype(float)
        mu_s = X.mean(); sd_s = X.std().replace(0, 1)
        glm = PoissonRegressor(alpha=1e-3, max_iter=1000).fit((X - mu_s) / sd_s, y)
        k = nb_k(y, glm.predict((X - mu_s) / sd_s))
        pr = lambda d: glm.predict((features(d, st, pace_avg) - mu_s) / sd_s)
        fac = {}
        if len(cur):
            mc = pr(cur); yc = cur['y_' + st].values
            for gq in (0, 1):
                m = (cur.grp == gq).values; n = m.sum(); avg = mc[m].mean() if n else 1
                fac[gq] = float((yc[m].sum() + PRIOR * avg) / (mc[m].sum() + PRIOR * avg)) if n else 1.0
        else:
            fac = {0: 1.0, 1: 1.0}
        res['recal'][st] = [round(fac[0], 4), round(fac[1], 4)]
        if len(today):
            mt = pr(today) * today.grp.map(fac).values
            for pid, mu in zip(today.pid.values, mt):
                res['players'].setdefault(str(mapped.get(pid, pid)), {})[st] = [round(float(mu), 2), round(k, 1)]
    out_model = os.path.join(os.path.dirname(slate_path), 'model.json')
    json.dump(res, open(out_model, 'w'), separators=(',', ':'))
    slate['model'] = {'date': res['date'], 'gen': res['gen'], 'players': res['players']}
    json.dump(slate, open(slate_path, 'w'), separators=(',', ':'), ensure_ascii=False)
    print(f"Modelo BH: {len(res['players'])} jogadores, {len(TARGETS)} mercados; treino {res['treino']}; recal pts {res['recal']['pts']} fga {res['recal']['fga']}")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'public', 'data', 'slate.json'))
