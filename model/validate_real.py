"""Teste contra LINHAS REAIS (Kalshi e casas) guardadas no histórico do git, temporada 2026-27.
Mercados com linha real: pontos, rebotes, assistências e bolas de 3.
Uso: python3 model/validate_real.py <real_lines.json>"""
import json, os, sys, unicodedata, re
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import features, p_over, ROOT, OUT

MK = {'PTS': 'pts', 'REB': 'reb', 'AST': 'ast', '3PM': 'tpm'}
norm = lambda s: re.sub(r'[^a-z ]', '', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()).strip()

def devig(o, u):
    if not o or not u: return None
    a, b = 1 / o, 1 / u; return a / (a + b)

def main(path):
    lines = json.load(open(path))
    names = {}
    for s in ('2026-27', 'espn-2026-27'):
        h = json.load(open(os.path.join(ROOT, 'data', 'history', s + '.json')))
        for k, v in h['names'].items(): names[str(k)] = norm(v if isinstance(v, str) else v.get('n', ''))
    df = pd.read_pickle(os.path.join(OUT, 'dataset.pkl'))
    df = df[(df.season == '2026-27') & (df.m10 >= 8)].copy()
    nb = json.load(open(os.path.join(ROOT, 'data', 'history', '2026-27.json')))['names']
    df['nm'] = df.pid.astype(str).map(lambda p: norm(nb.get(p, '') if isinstance(nb.get(p, ''), str) else nb.get(p, {}).get('n', '')))
    M = json.load(open(os.path.join(OUT, 'models.json')))
    rows = []
    for l in lines:
        st = MK.get(l['mk']); nm = names.get(str(l['pid']))
        if not st or not nm: continue
        hit = df[(df.date == l['date']) & (df.nm == nm)]
        if len(hit) != 1: continue
        r = hit.iloc[0]
        books = l['books']; fair = []; best_o = best_u = None
        for b, x in books.items():
            p = devig(x.get('o'), x.get('u'))
            if p: fair.append(p)
            if x.get('o'): best_o = max(best_o or 0, x['o'])
            if x.get('u'): best_u = max(best_u or 0, x['u'])
        rows.append({'idx': hit.index[0], 'st': st, 'line': l['line'], 'y': r['y_' + st], 'p_mkt': np.mean(fair) if fair else np.nan,
                     'odd_o': best_o, 'odd_u': best_u, 'kalshi_only': list(books) == ['Kalshi']})
    R = pd.DataFrame(rows)
    print('linhas reais casadas com resultado:', len(R), R.groupby('st').size().to_dict())
    out = {}
    for st, g in R.groupby('st'):
        m = M['models'][st]
        X = features(df.loc[g.idx], st, M['pace_avg'])
        Z = (X.values - np.array(m['mean'])) / np.array(m['sd'])
        mu = np.exp(m['intercept'] + Z @ np.array(m['coef']))
        po = p_over(mu, m['k'], g.line.values)
        y = g.y.values; line = g.line.values
        side_o = po >= .5; ps = np.where(side_o, po, 1 - po); hitv = np.where(side_o, y > line, y < line)
        push = y == line
        pm = g.p_mkt.values; pm_side = np.where(side_o, pm, 1 - pm)
        # odd real do lado escolhido (Kalshi: preço do meio menos ~4% de spread+taxa)
        odd = np.where(side_o, g.odd_o.values, g.odd_u.values).astype(float)
        odd_net = np.where(g.kalshi_only.values, 1 / (1 / odd + 0.03), odd)
        res = {'n': len(g), 'mae_modelo_vs_linha': round(float(np.mean(abs(mu - line))), 2),
               'over_real': round(float(np.mean(y > line)), 3)}
        for t in (0.55, 0.58, 0.60, 0.65):
            k = (ps >= t) & ~push
            if k.sum() < 10: res[str(t)] = {'n': int(k.sum())}; continue
            h = hitv[k].mean()
            res[str(t)] = {'n': int(k.sum()), 'acerto': round(float(h), 3), 'chance_modelo': round(float(ps[k].mean()), 3),
                           'chance_mercado': round(float(np.nanmean(pm_side[k])), 3),
                           'roi_odd_real_liquida': round(float(np.nanmean(np.where(hitv[k], odd_net[k] - 1, -1))), 3),
                           'roi_1.87': round(float(h * 1.87 - 1), 3), 'over_share': round(float(side_o[k].mean()), 2)}
        # quando o modelo discorda do mercado em 5+ pontos
        k = (np.abs(ps - pm_side) >= .05) & ~np.isnan(pm_side) & ~push & (ps >= .5)
        if k.sum() >= 10:
            res['discorda_mercado_5pp'] = {'n': int(k.sum()), 'acerto': round(float(hitv[k].mean()), 3),
                                          'roi_odd_real_liquida': round(float(np.nanmean(np.where(hitv[k], odd_net[k] - 1, -1))), 3)}
        # mercado sozinho: o lado favorito do mercado acerta quanto?
        fav = pm >= .5
        hm = np.where(fav, y > line, y < line)[~push & ~np.isnan(pm)]
        res['mercado_lado_favorito_acerto'] = round(float(hm.mean()), 3)
        out[st] = res
        print(st, json.dumps(res, ensure_ascii=False))
    json.dump(out, open(os.path.join(OUT, 'real_lines_report.json'), 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main(sys.argv[1])
