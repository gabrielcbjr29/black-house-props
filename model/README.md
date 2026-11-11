# Modelo BH

Modelos estatísticos por mercado: tentativas de arremesso, de 3, de lance livre e de 2, convertidos, bolas de 3, pontos, rebotes, assistências, roubos, tocos e erros.

**Como funciona**
- Uma regressão de Poisson por mercado, com dispersão de binomial negativa, treinada na temporada passada inteira.
- **Recalibração diária** com os jogos da temporada atual. O nível de jogo muda de um ano para o outro: no começo de 2026-27 os jogadores jogaram cerca de 1 minuto a menos e pontuaram menos por minuto.
- Features, todas calculadas só com informação anterior ao jogo:
  - forma: taxa por minuto nos últimos 5, 10, 20 e 60 jogos e na temporada;
  - minutos esperados e papel (titular, mudança de papel);
  - defesa do adversário contra a posição, relativa à liga;
  - ritmo dos dois times, mando e descanso (back-to-back);
  - confronto direto;
  - desfalques do time (arremessos da rotação que não joga);
  - participação nos arremessos do time;
  - diferença de força entre os times (risco de lavada).

| arquivo | o que faz |
|---|---|
| `dataset.py` | monta a base jogador-jogo a partir de `data/history/*.json` |
| `train.py` | treino 2025-26 até fev; validação mar–abr; teste em 2026-27 (relatório em `out/report.json`) |
| `walkforward.py`, `recal.py` | teste com retreino semanal e com recalibração diária da temporada |
| `validate_real.py`, `segments.py` | teste contra linhas reais (Kalshi e casas) guardadas no histórico do git |
| `predict.py` | roda no GitHub a cada coleta: treina, recalibra e grava as previsões de hoje no `slate.json` |

## Resultados (11/11/2026)

**Erro médio nos 3,1 mil jogos de 2026-27, que o modelo não viu:**
- arremessos tentados: 2,83 (média dos últimos 10: 3,13), 10% menor;
- arremessos de 2 tentados: 1,99 (2,22), 10% menor;
- pontos: 4,68 (5,09), 8% menor;
- assistências: 1,36 (1,46), 7% menor;
- bolas de 3 tentadas: 1,54 (1,65), 7% menor;
- rebotes: 1,88 (2,02), 7% menor;
- lances livres tentados: 1,70 (1,79), 5% menor;
- bolas de 3: 0,90 (0,95), 5% menor.

A média dos últimos 10 superestima quem está em alta. No quintil de maior volume de arremessos, ela previa 16,1, o real foi 15,1 e o modelo previu 15,0.

**Contra linhas reais** (Kalshi e casas, 29/10–10/11): ~1.500 linhas principais (mercado entre 40% e 60%) de pontos, rebotes, assistências e bolas de 3.
- O lado do modelo acertou 51,5%, contra 50% que o mercado já precificava.
- Para lucrar com odd ~1,87 é preciso ~53,5%. Ainda não há vantagem provada nesses mercados.

**Tentativas:** nenhuma fonte de odds tem linha real. Contra uma linha "estilo casa" (média de 10 jogos e da temporada), o modelo acertaria 63% a 69%. Isso não está provado. O teste real é o `/modelo` do bot: a linha da casa entra, o teste fica registrado e é conferido no dia seguinte (`/testes`).
