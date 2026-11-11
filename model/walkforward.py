"""Teste 'como seria na vida real': o modelo é retreinado toda semana com tudo que aconteceu antes
(peso maior para jogos recentes) e prevê só a semana seguinte. Salva as previsões em model/out/wf.pkl."""
import json, os, sys
import numpy as np, pandas as pd
from sklearn.linear_model import PoissonRegressor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import features, nb_k, TARGETS, OUT, FEATS

HALF_LIFE = 90  # dias: peso cai pela metade a cada 90 dias

def fit(X, y, w):
    mu_s = X.mean(); sd_s = X.std().replace(0, 1)
    glm = PoissonRegressor(alpha=1e-3, max_iter=1000).fit((X - mu_s) / sd_s, y, sample_weight=w)
    k = nb_k(y, glm.predict((X - mu_s) / sd_s))
    return glm, mu_s, sd_s, k

def main():
    df = pd.read_pickle(os.path.join(OUT, 'dataset.pkl')); df = df[df.m10 >= 8].copy()
    pace_avg = float(np.nanmean(df.loc[df.season == '2025-26', 'pace_t']))
    test_dates = sorted(df.loc[df.season == '2026-27', 'date'].unique())
    starts = test_dates[::7]
    preds = pd.DataFrame(index=df.index[df.season == '2026-27'])
    dts = pd.to_datetime(df.date)
    for st in TARGETS:
        X = features(df, st, pace_avg); y = df['y_' + st].values.astype(float)
        mu_col = pd.Series(np.nan, index=df.index); k_col = pd.Series(np.nan, index=df.index)
        for i, s in enumerate(starts):
            e = starts[i + 1] if i + 1 < len(starts) else '9999'
            tr = (df.date < s).values; te = ((df.date >= s) & (df.date < e)).values
            age = (pd.Timestamp(s) - dts[tr]).dt.days.values
            w = 0.5 ** (age / HALF_LIFE)
            glm, mu_s, sd_s, k = fit(X[tr], y[tr], w)
            mu_col[te] = glm.predict((X[te] - mu_s) / sd_s); k_col[te] = k
        preds['mu_' + st] = mu_col[preds.index]; preds['k_' + st] = k_col[preds.index]
        yy = df.loc[preds.index, 'y_' + st]; mu = preds['mu_' + st]
        print(f"{st:4s} viés {mu.mean() - yy.mean():+.2f}  MAE {np.mean(abs(mu - yy)):.3f}  (L10 {np.mean(abs(df.loc[preds.index, 'a10_' + st] - yy)):.3f})")
    preds.to_pickle(os.path.join(OUT, 'wf.pkl'))

if __name__ == '__main__':
    main()
