"""Treino e teste dos Modelos BH por mercado (regressão de Poisson com features de forma, minutos,
defesa x posição, ritmo, mando, descanso, confronto direto e desfalques).

Divisão no tempo (o modelo nunca vê o futuro):
  treino     2025-26 até 28/02
  validação  2025-26 de 01/03 ao fim
  teste      2026-27 (temporada atual, nada disso entra no treino)

Uso: python3 model/train.py  ->  model/out/report.json e public/data/models.json (coeficientes)
"""
import json, math, os, sys
import numpy as np
import pandas as pd
from scipy import stats as sps
from sklearn.linear_model import PoissonRegressor
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'model', 'out')
TARGETS = ['fga', 'tpa', 'fta', 'twoa', 'twom', 'tpm', 'fgm', 'ftm', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov']
LABEL = {'fga': 'Arremessos tentados', 'tpa': 'Bolas de 3 tentadas', 'fta': 'Lances livres tentados', 'twoa': 'Arremessos de 2 tentados',
         'tpm': 'Bolas de 3 convertidas', 'fgm': 'Arremessos convertidos', 'pts': 'Pontos', 'reb': 'Rebotes', 'ast': 'Assistências',
         'twom': 'Arremessos de 2 convertidos', 'ftm': 'Lances livres convertidos', 'stl': 'Roubos', 'blk': 'Tocos', 'tov': 'Erros'}
PRICE = 1.87  # odd típica de prop (−115)
EPS = 1e-3
# nomes das features (ordem = ordem dos coeficientes exportados)
FEATS = ['lm', 'lr5', 'lr10', 'lr20', 'lrS', 'lr60', 'starter', 'role_chg', 'home', 'b2b', 'rest', 'ldef', 'lpace', 'h2h', 'vac', 'share', 'blow']


def features(df, st, pace_avg):
    X = pd.DataFrame(index=df.index)
    mexp = 0.4 * df['m5'] + 0.35 * df['m10'] + 0.25 * df['mS'].fillna(df['m20'])
    X['lm'] = np.log(mexp.clip(lower=4))
    r60 = df[f'r60_{st}'].fillna(df[f'r20_{st}'])
    lr = lambda c: np.log(df[c].fillna(r60).clip(lower=0) * 36 + EPS * 36 + 0.05)
    X['lr5'] = lr(f'r5_{st}'); X['lr10'] = lr(f'r10_{st}'); X['lr20'] = lr(f'r20_{st}')
    # temporada atual encolhida para a janela longa quando há poucos jogos
    w = (df['gp_season'] / (df['gp_season'] + 8)).fillna(0)
    rS = (df[f'rS_{st}'].fillna(r60) * w + r60 * (1 - w))
    X['lrS'] = np.log(rS.clip(lower=0) * 36 + 0.05 + EPS * 36)
    X['lr60'] = np.log(r60.clip(lower=0) * 36 + 0.05 + EPS * 36)
    X['starter'] = df['starter']
    X['role_chg'] = df['starter'] - df['start_rate10']
    X['home'] = df['home']; X['b2b'] = df['b2b']; X['rest'] = df['rest'].clip(upper=4) / 4
    dr = np.log((df[f'def_{st}'] + 0.5) / (df[f'lg_{st}'] + 0.5))
    X['ldef'] = (dr * (df['def_n'] / (df['def_n'] + 6))).fillna(0).clip(-0.6, 0.6)
    X['lpace'] = np.log(((df['pace_t'] + df['pace_o']) / 2) / pace_avg).fillna(0).clip(-0.15, 0.15)
    hr = np.log((df[f'rH_{st}'] + 0.02) / (r60 + 0.02))
    X['h2h'] = (hr * (df['h2h_n'] / (df['h2h_n'] + 6))).fillna(0).clip(-0.7, 0.7)
    X['vac'] = (df['vac_fga'] / 20).clip(upper=2)
    X['share'] = df['fga_share10'].fillna(0.1)
    X['blow'] = (abs(df['net_t'] - df['net_o']) / 10).clip(upper=2.5)
    return X[FEATS]


def nb_k(y, mu):
    """dispersão da binomial negativa por momentos: var = mu + mu^2/k"""
    num = (mu ** 2).sum(); den = (((y - mu) ** 2) - mu).sum()
    return float(num / den) if den > 0 else 200.0


def p_over(mu, k, line):
    """P(X > line) com X ~ NegBin(média mu, dispersão k); line com .5"""
    mu = np.asarray(mu, float); thr = np.floor(line).astype(int)
    if k >= 150:
        return 1 - sps.poisson.cdf(thr, mu)
    n = k; p = n / (n + mu)
    return 1 - sps.nbinom.cdf(thr, n, p)


def dev(y, mu):
    mu = np.clip(mu, 1e-6, None)
    return float(np.mean(2 * (np.where(y > 0, y * np.log(np.where(y > 0, y, 1) / mu), 0) - (y - mu))))


def book_line(df, st):
    """linha 'tipo casa' para testar quando não há linha real: média ponderada de L10 e temporada,
       ajustada pelos minutos recentes, no .5 mais próximo"""
    r = 0.5 * df[f'r10_{st}'].fillna(df[f'r20_{st}']) + 0.5 * df[f'rS_{st}'].fillna(df[f'r20_{st}'])
    m = 0.5 * df['m5'] + 0.5 * df['m10']
    return np.floor(r * m) + 0.5


def bet_sim(y, p_o, line, thrs=(0.55, 0.58, 0.60, 0.65), price=PRICE):
    out = {}
    side_o = p_o >= 0.5; p_side = np.where(side_o, p_o, 1 - p_o)
    hit = np.where(side_o, y > line, y < line)
    for t in thrs:
        m = p_side >= t
        n = int(m.sum())
        if n == 0:
            out[str(t)] = {'n': 0}; continue
        h = float(hit[m].mean())
        out[str(t)] = {'n': n, 'acerto': round(h, 4), 'roi': round(h * price - 1, 4), 'chance_media': round(float(p_side[m].mean()), 4),
                       'over_share': round(float(side_o[m].mean()), 3)}
    return out


def main():
    df = pd.read_pickle(os.path.join(OUT, 'dataset.pkl'))
    df = df[(df['m10'] >= 8) & ~df.get('future', False)].copy()  # rotação, só jogos com resultado
    tr = (df.season == '2025-26') & (df.date < '2026-03-01')
    va = (df.season == '2025-26') & (df.date >= '2026-03-01')
    te = df.season == '2026-27'
    pace_avg = float(np.nanmean(df.loc[tr, 'pace_t']))
    report = {'split': {'treino': int(tr.sum()), 'validacao': int(va.sum()), 'teste': int(te.sum())}, 'mercados': {}}
    export = {'v': 1, 'pace_avg': pace_avg, 'feats': FEATS, 'models': {}}
    for st in TARGETS:
        X = features(df, st, pace_avg); y = df['y_' + st].values.astype(float)
        mu_s = X.loc[tr].mean(); sd_s = X.loc[tr].std().replace(0, 1)
        Z = (X - mu_s) / sd_s
        glm = PoissonRegressor(alpha=1e-3, max_iter=1000).fit(Z[tr], y[tr])
        gbm = HistGradientBoostingRegressor(loss='poisson', max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=80,
                                            l2_regularization=1.0, random_state=0).fit(X[tr], y[tr])
        res = {'label': LABEL[st]}
        preds = {}
        base_l10 = df['a10_' + st].values
        base_book = (0.5 * df[f'r10_{st}'].fillna(df[f'r20_{st}']) + 0.5 * df[f'rS_{st}'].fillna(df[f'r20_{st}'])).values * (0.5 * df['m5'] + 0.5 * df['m10']).values
        for name, mask in (('validacao', va), ('teste', te)):
            mg = glm.predict(Z[mask]); mb = gbm.predict(X[mask]); yy = y[mask]
            preds[name] = mg
            res[name] = {
                'n': int(mask.sum()),
                'mae': {'modelo': round(float(np.mean(abs(yy - mg))), 3), 'gbm': round(float(np.mean(abs(yy - mb))), 3),
                        'media_L10': round(float(np.mean(abs(yy - base_l10[mask]))), 3), 'linha_casa': round(float(np.mean(abs(yy - base_book[mask]))), 3)},
                'deviance': {'modelo': round(dev(yy, mg), 4), 'gbm': round(dev(yy, mb), 4), 'media_L10': round(dev(yy, np.clip(base_l10[mask], .05, None)), 4),
                             'linha_casa': round(dev(yy, np.clip(base_book[mask], .05, None)), 4)},
            }
        # dispersão estimada no treino e simulação de apostas contra a linha tipo casa
        k = nb_k(y[tr], glm.predict(Z[tr]))
        res['k'] = round(k, 2)
        for name, mask in (('validacao', va), ('teste', te)):
            line = book_line(df[mask], st).values
            ok = ~np.isnan(line)
            po = p_over(preds[name][ok], k, line[ok])
            res[name]['apostas_linha_casa'] = bet_sim(y[mask][ok], po, line[ok])
            # calibração simples por faixa
            side_o = po >= .5; ps = np.where(side_o, po, 1 - po); hit = np.where(side_o, y[mask][ok] > line[ok], y[mask][ok] < line[ok])
            cal = []
            for lo, hi in ((.5, .55), (.55, .6), (.6, .65), (.65, .7), (.7, 1.01)):
                m = (ps >= lo) & (ps < hi)
                if m.sum() >= 20:
                    cal.append({'faixa': f'{int(lo*100)}–{min(int(hi*100),100)}%', 'n': int(m.sum()), 'prevista': round(float(ps[m].mean()), 3), 'real': round(float(hit[m].mean()), 3)})
            res[name]['calibracao'] = cal
        res['coef'] = {f: round(float(c), 4) for f, c in zip(FEATS, glm.coef_)}
        report['mercados'][st] = res
        export['models'][st] = {'label': LABEL[st], 'intercept': float(glm.intercept_), 'coef': [float(c) for c in glm.coef_],
                                'mean': [float(mu_s[f]) for f in FEATS], 'sd': [float(sd_s[f]) for f in FEATS], 'k': k}
        v = res['teste']
        print(f"{st:5s} k={k:6.1f} | teste MAE modelo {v['mae']['modelo']:.3f} gbm {v['mae']['gbm']:.3f} L10 {v['mae']['media_L10']:.3f} casa {v['mae']['linha_casa']:.3f}"
              f" | dev {v['deviance']['modelo']:.3f}/{v['deviance']['gbm']:.3f}/{v['deviance']['media_L10']:.3f}/{v['deviance']['linha_casa']:.3f}"
              f" | 58%+: {v['apostas_linha_casa'].get('0.58')}")
    json.dump(report, open(os.path.join(OUT, 'report.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(export, open(os.path.join(OUT, 'models.json'), 'w'))


if __name__ == '__main__':
    main()
