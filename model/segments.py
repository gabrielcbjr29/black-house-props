"""Segmentos do teste com linhas reais: linha principal x escada, mais x menos, modelo x mercado."""
import json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validate_real as V
from train import features, p_over, OUT

def collect(path):
    lines = json.load(open(path)); names = {}
    for s in ('2026-27', 'espn-2026-27'):
        h = json.load(open(os.path.join(V.ROOT, 'data', 'history', s + '.json')))
        for k, v in h['names'].items(): names[str(k)] = V.norm(v if isinstance(v, str) else v.get('n', ''))
    df = pd.read_pickle(os.path.join(OUT, 'dataset.pkl')); df = df[(df.season == '2026-27') & (df.m10 >= 8)].copy()
    nb = json.load(open(os.path.join(V.ROOT, 'data', 'history', '2026-27.json')))['names']
    df['nm'] = df.pid.astype(str).map(lambda p: V.norm(nb.get(p, '') if isinstance(nb.get(p, ''), str) else ''))
    M = json.load(open(os.path.join(OUT, 'models.json')))
    rows = []
    for l in lines:
        st = V.MK.get(l['mk']); nm = names.get(str(l['pid']))
        if not st or not nm: continue
        hit = df[(df.date == l['date']) & (df.nm == nm)]
        if len(hit) != 1: continue
        fair = [V.devig(x.get('o'), x.get('u')) for x in l['books'].values()]; fair = [f for f in fair if f]
        if not fair: continue
        kal = list(l['books']) == ['Kalshi']
        rows.append({'idx': hit.index[0], 'date': l['date'], 'st': st, 'line': l['line'], 'y': hit.iloc[0]['y_' + st], 'pm': float(np.mean(fair)), 'kal': kal})
    R = pd.DataFrame(rows)
    mu = np.zeros(len(R)); po = np.zeros(len(R))
    P = pd.read_pickle(os.path.join(OUT, 'wf_recal.pkl')) if os.environ.get('RECAL') else None
    for st, g in R.groupby('st'):
        m = M['models'][st]
        if P is not None:
            mm = P.loc[g.idx, 'mu_' + st].values
        else:
            X = features(df.loc[g.idx], st, M['pace_avg'])
            Z = (X.values - np.array(m['mean'])) / np.array(m['sd']); mm = np.exp(m['intercept'] + Z @ np.array(m['coef']))
        mu[g.index] = mm; po[g.index] = p_over(mm, m['k'], g.line.values)
    R['mu'] = mu; R['po'] = po
    return R

def ev_row(p_true_side, hit, pm_side, fee=.03):
    # aposta ao preço justo do mercado menos taxa/margem de ~3 pontos de prob.
    price = 1 / np.clip(pm_side + fee, 0.02, 0.99)
    return np.where(hit, price - 1, -1)

R = collect(sys.argv[1])
R = R[R.y != R.line]
R['logit'] = lambda: None
lo = lambda p: np.log(p / (1 - p))
def show(name, mask, p_model):
    side_o = p_model >= .5; ps = np.where(side_o, p_model, 1 - p_model); pm_s = np.where(side_o, R.pm, 1 - R.pm)
    hit = np.where(side_o, R.y > R.line, R.y < R.line)
    edge = ps - pm_s
    for thr in (0.0, 0.03, 0.06, 0.10):
        k = mask & (edge >= thr)
        if k.sum() < 15: continue
        roi = ev_row(ps[k], hit[k], pm_s[k]).mean()
        print(f'  {name:28s} vantagem≥{int(thr*100):2d}pp n={int(k.sum()):4d} acerto={hit[k].mean():.3f} mercado={pm_s[k].mean():.3f} modelo={ps[k].mean():.3f} ROI(preço mercado−3pp)={roi:+.3f}')
main = (R.pm > .4) & (R.pm < .6)
print('LINHAS PRINCIPAIS (mercado 40–60%):', int(main.sum()), '| ESCADA:', int((~main).sum()))
for st in ['pts', 'reb', 'ast', 'tpm']:
    s = R.st == st
    print(st)
    show('principal', s & main, R.po.values)
    show('principal só MENOS', s & main & (R.po < .5), R.po.values)
    show('principal só MAIS', s & main & (R.po >= .5), R.po.values)
print('TODOS os mercados, linha principal')
show('modelo puro', main, R.po.values)
for w in (.3, .5):
    pb = 1 / (1 + np.exp(-(w * lo(np.clip(R.po, .01, .99)) + (1 - w) * lo(np.clip(R.pm, .01, .99)))))
    show(f'mistura {int(w*100)}% modelo', main, pb.values)
# por data (estabilidade)
side_o = R.po >= .5; hit = np.where(side_o, R.y > R.line, R.y < R.line); ps = np.where(side_o, R.po, 1 - R.po); pm_s = np.where(side_o, R.pm, 1 - R.pm)
k = main & (ps - pm_s >= .03)
print('por data (principal, vantagem≥3pp):', R[k].assign(h=hit[k]).groupby('date').h.agg(['size', 'mean']).round(3).to_dict('index'))
