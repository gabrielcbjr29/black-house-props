"""Recalibração diária da temporada: fator = (real + prior) / (previsto + prior) com os jogos da
temporada atual ANTES do dia, por estatística e por grupo (janela com muitos jogos da temporada
passada x só desta temporada). Gera model/out/wf_recal.pkl com as previsões corrigidas."""
import json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import features, TARGETS, OUT

PRIOR = 150  # jogos "imaginários" com fator 1

def main():
    df = pd.read_pickle(os.path.join(OUT, 'dataset.pkl')); df = df[df.m10 >= 8].copy()
    M = json.load(open(os.path.join(OUT, 'models.json')))
    cur = df[df.season == '2026-27'].copy()
    # grupo: o jogador já tem 5+ jogos nesta temporada?
    cur['grp'] = (cur.gp_season >= 5).astype(int)
    out = pd.DataFrame(index=cur.index)
    for st in TARGETS:
        m = M['models'][st]; X = features(cur, st, M['pace_avg'])
        Z = (X.values - np.array(m['mean'])) / np.array(m['sd'])
        mu = pd.Series(np.exp(m['intercept'] + Z @ np.array(m['coef'])), index=cur.index)
        y = cur['y_' + st]
        fac = pd.Series(1.0, index=cur.index)
        for D in sorted(cur.date.unique()):
            today = cur.date == D; past = cur.date < D
            for gq in (0, 1):
                pm = past & (cur.grp == gq); tm = today & (cur.grp == gq)
                sy, sm = y[pm].sum(), mu[pm].sum(); n = pm.sum()
                avg = sm / n if n else mu.mean()
                fac[tm] = (sy + PRIOR * avg) / (sm + PRIOR * avg) if n else 1.0
        out['mu_' + st] = mu * fac; out['k_' + st] = m['k']; out['fac_' + st] = fac
        print(f"{st:4s} viés antes {mu.mean() - y.mean():+.2f} depois {(mu*fac).mean() - y.mean():+.2f} | MAE {np.mean(abs(mu*fac - y)):.3f} (sem recal {np.mean(abs(mu - y)):.3f}, L10 {np.mean(abs(cur['a10_'+st]-y)):.3f}) | fator hoje {fac[cur.date==cur.date.max()].mean():.3f}")
    out.to_pickle(os.path.join(OUT, 'wf_recal.pkl'))

if __name__ == '__main__':
    main()
