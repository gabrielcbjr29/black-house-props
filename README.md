# Black House Props (Garrafão Props)

Painel de análise de props da NBA feito para **tipster**, no celular e no computador. Para cada jogador do dia, calcula a projeção de 20 mercados, mistura com o consenso sem margem das casas, dá a chance de bater, o valor (EV), a **stake sugerida em unidades** e uma nota de A+ a C. Registra as suas tips, **liquida sozinho** pelos boxscores, mede ROI, yield e **CLV**, e gera o **post pronto** (imagem para feed/story e texto para Telegram/WhatsApp).

## Coleta no seu computador (runner próprio)

A NBA bloqueia servidores de nuvem (o GitHub Actions inclusive), mas não a internet de casa. Por isso a coleta roda no seu computador, como "runner próprio" do GitHub, e só a publicação do site fica na nuvem.

1. No repositório: Settings → Actions → Runners → **New self-hosted runner**. Escolha o sistema (Windows, macOS ou Linux) e copie os comandos das seções *Download* e *Configure*, na ordem. Aceite as respostas padrão.
2. Deixe o runner como serviço, para ligar sozinho com o computador:
   - Windows: rode o PowerShell como administrador e, no `config.cmd`, responda **Y** quando ele perguntar se quer rodar como serviço.
   - macOS/Linux: `sudo ./svc.sh install && sudo ./svc.sh start` dentro da pasta do runner.
3. Precisa ter o **Git** instalado (Windows: git-scm.com, que já traz o Git Bash). O Node é baixado sozinho pela coleta. Python é opcional (lê o PDF oficial de lesões).
4. Deixe o computador ligado e sem hibernar nos horários de coleta (10h, 15h, 18h30, 20h30 e 22h de Brasília). Se estiver desligado, a coleta espera na fila por até 24 h e roda quando ele ligar.

Para voltar a coletar na nuvem (com a ESPN como fonte), crie a variável `COLETOR` = `nuvem` em Settings → Secrets and variables → Actions → Variables.

## Novidades da versão 10 (painel escuro preto, verde e dourado)

- Visual de painel escuro: barra lateral de ícones no computador, cartões arredondados, fonte Manrope (licença OFL) e degradê verde → dourado.
- Topo das props: **Valor da rodada**, um gráfico de área com a chance do modelo (verde) contra a chance que a odd cobra (linha dourada), nas melhores linhas de cada jogo. Toque num ponto para abrir a ficha; o rótulo dourado marca a linha com mais EV.
- Faixa de jogos do dia (toque para filtrar), "Melhores da rodada", "Desfalques" e um bloco em degradê com as linhas nota A/A+.
- Cores: verde = mais de e valor; dourado = menos de, nota A+ (com degradê) e destaques; vermelho só para red e jogador fora.
- `black-house-teste.html`: o app inteiro num arquivo só (dados de demonstração embutidos) para testar sem servidor. Gere de novo com o script em `scripts/` se quiser.

## Novidades da versão 9 (visual "Quadra" e chave da BALLDONTLIE)

- **Placar da rodada** no topo das props: os jogos do dia como placas de placar, com as cores dos dois times e o horário em letreiro. Toque num jogo para ver só as props dele (toque de novo para soltar). Embaixo, num piso de madeira com a linha da quadra, a melhor linha da rodada e três números do dia.
- **Cores com significado**: verde = mais de, azul royal = menos de, ouro = nota A+ (e o pódio dos rankings). Cada cartão, ficha e jogo leva a faixa com a cor do time.
- **Letreiro esportivo** (Big Shoulders Display, licença OFL) nos números e títulos; Archivo no texto.
- Sem rótulos em caixa alta e sem "·" separando informações; atalhos da lista viraram abas.
- **BALLDONTLIE** (`BDL_API_KEY`): reserva do calendário do dia e de ontem quando a NBA não responder ao GitHub. A chave grátis cobre jogos, times e jogadores.

## Novidades da versão 8 (mais ideias do Jogada Pro e do ClearEdge)

- **Nota com trava de consistência**: A+ agora exige 7+ acertos nos últimos 10 jogos e 60%+ nos últimos 20, além de EV e chance; A exige 6+ nos últimos 10. Jogador com menos de 10 jogos no histórico fica no máximo com A.
- **Múltipla por odd-alvo**: em "Montar automaticamente", digite a odd que você quer (ex. 3,00) e o app soma pernas fortes, uma por jogo, até chegar nela.
- **Trocar perna** (↻ no bilhete): troca só aquela perna pela próxima linha forte de outro jogo, sem refazer o bilhete.
- **Meta e stop do dia** (Banca → Configurações): aviso no topo da Banca e na hora de registrar quando o lucro do dia bate a meta ou o prejuízo chega no stop.
- **Previsto x acerto por faixa de chance** (Banca): mostra se as chances do modelo batem com a realidade em cada faixa (55–59%, 60–64%…).
- **Amostra na ficha**: a faixa provável mostra quantos jogos entraram na conta.

## Novidades da versão 7 (ideias trazidas do Jogada Pro e do ClearEdge)

- **Escada segura** (Tendências): para cada jogador, o degrau "X ou mais" mais alto com chance de 80% a 93% que bateu em 8+ dos últimos 10 e em 75%+ dos últimos 20. No máximo 5 por mercado, um por jogador. Boa base para duplas e triplas de odd baixa; confira se a odd da linha alternativa paga acima da odd justa.
- **Escada de linhas** na ficha do jogador: chance, odd justa e acerto L10/L20 de cada degrau.
- **Radar de divergência** (Tendências): a melhor odd de cada linha comparada ao consenso sem margem das OUTRAS casas. Casa pagando acima costuma estar atrasada.
- **Radar no Telegram**: a cada coleta, avisa as divergências novas acima de `RADAR_MIN` (padrão 4%), sem repetir no mesmo dia.
- **Faixa provável** da projeção (do 20º ao 80º percentil) no cartão e na ficha.
- **Alerta amarelo**: pouca amostra (menos de 10 jogos no histórico) ou papel novo no começo da temporada (minutos ±20% vs temporada passada). Esses jogadores ficam fora da Escada segura.
- **Card de resultados** (Banca): imagem e texto com lucro, ROI, acerto, CLV, desempenho por nota e as últimas tips, greens e reds, com o aviso do Ministério da Fazenda.

## Novidades da versão 6 (revisão de design, acessibilidade e código)

- **Resumo do dia** no topo das props: jogos, linhas nota A/A+, melhor da rodada, desfalques e mudanças. Cada bloco é clicável.
- **O que mudou**: linhas que andaram, jogador que mudou de status e quem entrou ou saiu do quinteto, desde a abertura ou desde a sua última visita ("Marcar como visto"). Mudanças que afetam suas tips abertas aparecem primeiro.
- **Busca rápida**: Ctrl+K (⌘K no Mac) ou a tecla /, ou a lupa no topo. Enter abre a ficha do primeiro resultado.
- **Alerta nas tips abertas** (Banca): jogador que virou dúvida/fora e linha que andou contra ou a favor depois da sua entrada.
- **Acessibilidade (WCAG 2.1 AA)**: zero violações no axe-core nos temas claro e escuro; contraste do texto secundário corrigido; escudos dos times com texto preto ou branco conforme a cor; foco preso dentro de janelas e devolvido ao fechar; alvos de toque de 40 px no celular; hierarquia de títulos corrigida.
- **Segurança**: a chave da API não aparece mais em mensagens de erro publicadas; o backup em JSON não leva o token do GitHub; o CSV exportado é protegido contra fórmulas maliciosas no Excel.
- **Design system no Figma** (cores claro/escuro, raios, espaçamentos, estilos de texto e componentes Nota, Lado, Botão, Régua de valor e Card de prop) e **modelos de post e story no Canva**.

## Novidades da versão 4 (visual e uso em qualquer aparelho)

- **Visual preto, verde e branco**, com uma família só (Archivo): condensada para números e linhas, como placar. Tema claro e escuro.
- **Régua de valor** em cada prop: a barra verde é a chance; o traço é a chance que a odd cobra. Verde passando do traço = valor.
- **Didático**: “?” ao lado de EV, stake, nota, CLV, ROI e mercado, passo a passo na primeira visita e um **Guia** com glossário.
- **App instalável** no Android, iPhone e computador (ícones, botão “Instalar app”, funciona sem internet com os últimos dados).
- **Mesmas tips no celular e no computador**: sincronização por gist privado do GitHub (Banca → Configurações).

## Usar no computador e no celular

1. Publique o projeto no GitHub Pages (passo a passo em “Rodar sozinho todo dia”, abaixo). Você ganha um link do tipo `https://SEU-USUARIO.github.io/garrafao-props/`.
2. **Android**: abra o link no Chrome e toque em “Instalar app” (no topo do app ou no menu ⋮).
3. **iPhone**: abra no Safari → Compartilhar → “Adicionar à Tela de Início”.
4. **Computador**: abra no Chrome ou Edge → “Instalar app” (no topo ou na barra de endereço). Abre em janela própria.
5. **Mesmas tips nos dois**: crie em github.com/settings/tokens um token clássico só com a permissão `gist`. Em Banca → Configurações, cole o token e toque em “Sincronizar agora”. No outro aparelho, cole o mesmo token e o código do gist que apareceu.

## Novidades da versão 3 (foco tipster)

| Área | O que mudou | Por que dá mais lucro |
|---|---|---|
| Valor de mercado | As odds de cada casa são limpas da margem (método da potência) e viram um consenso ponderado (Pinnacle/FanDuel pesam mais). Esse consenso vira uma média implícita, que avalia **qualquer linha**, inclusive a da sua casa. | Acha **linha atrasada** nas casas brasileiras e corta EV inflado do modelo. |
| Chance final | Mistura modelo + mercado (peso ajustável, padrão 55% modelo). | EV mais realista = menos tips ruins com cara de boas. |
| Stake | Kelly fracionado (padrão 1/4) sobre a banca, em unidades, com teto por tip e limite diário. | Gestão de banca consistente e defensável para quem segue você. |
| Calibração automática | Backtest diário refaz o modelo nos últimos 30 dias e mede previsto × real por mercado. Se o modelo está confiante demais num mercado, a distribuição é aberta (ajuste ×k). | Mostra **em quais mercados o modelo acerta de verdade** (aba Sistema). |
| Sem o colega | Quando um titular está fora, usa os **jogos reais sem ele** (minutos e ritmo de cada estatística, inclusive rebotes e tocos). | É o ângulo nº 1 de prop; antes era só uma estimativa por posição. |
| Quinteto do dia | Lê titulares previstos/confirmados e inativos (stats.nba.com). Reserva que vira titular ganha minutos; titular que vai ao banco perde. | Entrar antes da linha mexer. |
| Lesões oficiais | Lê o PDF oficial da NBA (com Python + pypdf, opcional) e sobrepõe a ESPN. | Mesma fonte que as casas usam. |
| Movimento de linha | Guarda a linha de abertura do dia; mostra “mercado a favor/contra” e o ranking de movimento em Tendências. | Seguir dinheiro afiado e evitar entrar contra ele. |
| Descanso | Back-to-back e 3º jogo em 4 noites. | Ajuste fino de minutos. |
| Banca | Registro de tips (simples e múltiplas), liquidação automática (green/red/devolvida, DNP anula), ROI, yield, acerto, CLV, odd média, maior queda, gráfico da banca, desempenho por mercado/nota/faixa de odd/lado/casa, CSV e backup. | Saber onde você ganha e onde perde. |
| Posts | Cartão em imagem (feed 4:5 e story 9:16) com marca, @ e o aviso obrigatório do Ministério da Fazenda ocupando 10%, e texto para Telegram/WhatsApp. “Card do dia” com as 5 melhores. | Publicar em 10 segundos, dentro da regra. |
| Importar linhas | Cole `Jogador; mercado; linha; odd mais; odd menos` (aceita português: “pontos”, “rebotes + assistências”). | Analisa a sua casa (Betano, Bet365, Superbet…) em lote. |
| Múltipla | Correlação medida nos jogos em que as pernas estiveram juntas; registrar e postar o bilhete. | Chance combinada honesta em same game. |

### Claude como assistente

- **Analista IA / legenda com IA**: com o app aberto como artefato no Claude, a ficha do jogador pede uma análise e a tela de post pede uma legenda (sem promessa de ganho).
- **Claude in Chrome para as casas brasileiras**: nenhuma API grátis traz Betano, Bet365 ou Superbet. Com a extensão Claude in Chrome, peça: *“abra a página de props de NBA da Betano e me devolva no formato Jogador; mercado; linha; odd mais; odd menos”*. Cole o resultado em **Importar linhas**.
- **Tarefa agendada**: dá para agendar no Claude um resumo diário (ex.: 18h) lendo o app publicado.

Não usa nenhuma biblioteca externa: só Node.js 20+ e o navegador.

## Mercados

| Grupo | Mercados |
|---|---|
| Principais | Pontos, Rebotes, Assistências, Bolas de 3 convertidas, Pts+Reb+Ast, Pts+Reb, Pts+Ast, Reb+Ast |
| Arremessos | Arremessos de quadra convertidos e tentados, Arremessos de 2 convertidos e tentados, Bolas de 3 tentadas, Lances livres convertidos e tentados |
| Defesa e outros | Roubos, Tocos, Roubos+Tocos, Erros (turnovers), Faltas pessoais |

## Rodar no computador (teste real em 5 minutos)

1. Instale o Node.js 20 ou mais novo: https://nodejs.org (versão LTS).
2. Abra um terminal na pasta do projeto e rode:

```bash
npm run update   # coleta os dados reais do dia
npm run serve    # abre o app em http://localhost:8080
```

A primeira coleta baixa a temporada passada inteira (cerca de 1.230 jogos) para ter histórico de 20 jogos de cada jogador e a defesa por posição. Leva alguns minutos e fica salva em `data/history/`. As próximas coletas baixam só os jogos novos.

Outros comandos:

```bash
npm run update -- --date 2026-11-02   # coleta para outra data
npm run demo                          # gera dados de demonstração (sem internet)
npm run backtest                      # refaz o backtest de calibração (o update já roda 1x por dia)
npm test                              # testes do motor e dos leitores das APIs
```

Para abrir no celular com o computador ligado, use `http://IP-DO-COMPUTADOR:8080` na mesma rede Wi-Fi.

## Rodar sozinho todo dia (GitHub, grátis)

Com o projeto no GitHub, a automação em `.github/workflows/atualizar.yml` coleta os dados 5 vezes ao dia (10h, 15h, 18h30, 20h30 e 22h de Brasília; as duas últimas pegam quintetos e linhas de fechamento) e publica o app no GitHub Pages. O link abre no celular e no computador e pode ser instalado como app.

1. Crie uma conta em https://github.com e um repositório novo (por exemplo `garrafao-props`). No plano grátis, o GitHub Pages exige repositório público; com o GitHub Pro dá para usar privado.
2. Envie os arquivos desta pasta para o repositório (botão "Add file → Upload files", arrastando a pasta inteira, ou com `git push`).
3. Em **Settings → Pages**, em "Source", escolha **GitHub Actions**.
4. Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions**.
5. Em **Actions → Atualizar dados e publicar → Run workflow**, rode a primeira vez. Quando terminar, o link aparece em Settings → Pages.

## Números reais: fontes de odds e economia de requisições

As estatísticas (NBA e ESPN) já são reais e grátis. O que muda o jogo é ter **odds de verdade**. O coletor junta até três fontes e calcula o consenso sem margem entre todas:

| Fonte | Custo | Chave | O que entra |
|---|---|---|---|
| Kalshi (bolsa dos EUA) | grátis, sem limite prático | não precisa | chance de pontos, rebotes e assistências em degraus (“25+”), sem margem |
| SportsGameOdds Amateur | grátis, 2.500 objetos/mês | `SGO_API_KEY` | props de 9 casas numa chamada só por coleta |
| The Odds API | grátis 500 créditos/mês; US$ 30 por 20 mil | `ODDS_API_KEY` | props de FanDuel, DraftKings, BetMGM, Pinnacle e outras |

### Como o coletor gasta pouco

- **Duas fotos por jogo, no máximo**: abertura (coleta da manhã) e fechamento (a última coleta até 150 min antes do jogo). Entre elas, reaproveita a foto guardada em `data/odds-state.json`.
- **Lista de jogos grátis**: a The Odds API não cobra a lista de eventos; só paga quem precisa de foto.
- **Casas por nome**: até 10 casas custam o mesmo que 1 região (`ODDS_BOOKMAKERS`).
- **Orçamento automático**: lê os créditos restantes e divide pelos dias que faltam no mês; o fechamento tem prioridade sobre a abertura. `ODDS_MONTHLY_BUDGET` põe um teto.
- **SportsGameOdds**: 1 chamada traz o dia inteiro; no máximo `SGO_MAX_DAILY` por dia e dentro do limite do mês.
- **Lesões oficiais**: só procura relatórios mais novos que o último lido.
- **Estatísticas**: os boxscores ficam guardados em `data/history/`; cada coleta baixa só os jogos novos.
- A aba **Guia** mostra quanto cada coleta gastou.

### Quanto dá para fazer (mês com ~220 jogos)

| Modo (`ODDS_MODE`) | Créditos/mês na The Odds API | Plano |
|---|---|---|
| `economico` (só fechamento, pontos e PRA) | ~440 | grátis (500) |
| `padrao` (abertura + fechamento, 4 mercados) | ~1.760 | US$ 30 (20 mil) |
| `completo` (abertura + fechamento, 8 mercados) | ~3.520 | US$ 30 (20 mil) |

Recomendado para começar sem gastar: Kalshi + SportsGameOdds grátis + The Odds API em `economico`.

### Resumo no Telegram (opcional)

Com `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`, o coletor manda para você, uma vez por dia (18h de Brasília por padrão), as 5 linhas de mais valor. Vai para o seu chat para revisar; não posta no canal sozinho.

## Odds reais de props (opcional)

Sem chave, o app usa uma **linha de referência**: a linha .5 que dividiu os últimos 15 jogos do jogador mais perto de 50/50. Em qualquer linha você pode tocar em **✎ Linha** e digitar a linha e as odds da sua casa: o app recalcula chance, EV e nota na hora. É o caminho para os mercados alternativos que nenhuma API grátis cobre (tentativas de 2 e de 3, faltas, arremessos de 2 convertidos).

Para puxar odds automaticamente (recomendado: é o que liga o consenso de mercado, o movimento de linha e o CLV):

1. Crie uma chave grátis em https://the-odds-api.com (500 créditos por mês).
2. No computador: copie `.env.example` para `.env` e preencha `ODDS_API_KEY`.
3. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**, nome `ODDS_API_KEY`.

Cada jogo custa (nº de mercados × nº de regiões) créditos. Com 4 mercados, 1 região e 8 jogos por dia são 32 créditos por coleta. O plano grátis (500/mês) só dá para ~1 coleta por dia com poucos mercados; para abertura + fechamento todo dia, o plano pago de entrada resolve. Controle o gasto com a variável `ODDS_UTC_HOURS` (em **Settings → Secrets and variables → Actions → Variables**), por exemplo `21,23` = só nas coletas das 18h30 e 20h30 de Brasília; nas outras, as odds da coleta anterior são reaproveitadas. `ODDS_REGIONS=us,eu` acrescenta a Pinnacle (dobra o custo). A The Odds API cobre casas dos EUA/Europa: serve como preço de mercado; as casas brasileiras você importa.

Mercados que a The Odds API cobre: pontos, rebotes, assistências, bolas de 3, combinados, roubos, tocos, roubos+tocos, erros, arremessos de quadra convertidos, lances livres convertidos e tentados.

## Fontes de dados

| Fonte | Chave | O que vem dela |
|---|---|---|
| CDN da NBA (`cdn.nba.com`) | não | Calendário e boxscore completo de cada jogo: minutos, pontos, rebotes, assistências, arremessos de 2 e de 3 (convertidos e tentados), lances livres, faltas, roubos, tocos, erros e posição dos titulares |
| ESPN (API pública não oficial) | não | Relatório de lesões e handicap/total dos jogos |
| Relatório oficial de lesões da NBA (PDF) | não | Status oficial (precisa de `pip install pypdf`; a automação já instala). Desligue com `OFFICIAL_INJURIES=0` |
| stats.nba.com (quinteto do dia) | não | Titulares previstos/confirmados e inativos |
| The Odds API | sim (grátis) | Linhas e odds de props por casa |

Os formatos do CDN da NBA estão documentados no projeto [nba_api](https://github.com/swar/nba_api/tree/master/docs/nba_api/live). A ESPN não documenta sua API: os leitores são tolerantes e, se algo falhar, a coleta continua e o aviso aparece na aba Sistema.

## Como o modelo calcula

(Detalhes completos e o backtest por mercado aparecem na aba **Sistema** do app.)

1. **Ritmo por minuto** de cada estatística: 25% últimos 5 jogos, 35% últimos 10, 40% últimos 20.
2. **Minutos esperados**: 40% últimos 5, 35% últimos 10, 25% últimos 20. Corta 4% em back-to-back, 3–6% em jogo com handicap alto, 10% em dúvida. Quando um colega de rotação está fora, parte dos minutos dele vai para quem fica (mais para a mesma posição) e o uso ofensivo sobe até 10%.
3. **Matchup**: quanto o adversário cede por jogo àquela posição em relação à média da liga, com metade do peso (−12% a +12%). Temporada atual pesa mais; a anterior completa a amostra no começo do ano.
4. **Ritmo do jogo**: posses por 48 minutos dos dois times e o total da casa.
5. **Chance**: distribuição com a dispersão real do jogador. Poisson ou binomial negativa para contagens baixas (faltas, tocos, bolas de 3), normal para valores altos. Linha inteira considera devolução.
6. **Desfalques com histórico real**: jogos recentes sem o colega que está fora (minutos e ritmo por minuto), misturados à estimativa por posição conforme a amostra.
7. **Mercado**: consenso sem margem das casas → média implícita → mistura com a projeção própria (peso ajustável).
8. **Calibração**: fator ×k por mercado vindo do backtest abre a distribuição quando o modelo esteve confiante demais.
9. **Stake**: Kelly fracionado × banca ÷ unidade, arredondado a 0,25u, com teto.
10. **Nota**: com odd, A+ exige EV ≥ +6%, chance ≥ 56%, ≥ 6/10 nos últimos 10 e ≥ 50% nos últimos 20; A exige EV ≥ +3% e chance ≥ 53%; B, EV ≥ 0. Sem odd, a nota máxima é A (chance ≥ 62% e 7/10).

## Estrutura

```
collector/        coleta (Node, sem dependências)
  build.js        orquestra tudo: npm run update
  nba.js          calendário e boxscores do CDN da NBA
  espn.js         lesões e handicap/total
  oddsapi.js      odds de props (opcional)
  injuryreport.js relatório oficial de lesões da NBA (PDF → texto via pdftext.py)
  backtest.js     backtest de calibração (npm run backtest)
  slate.js        monta o arquivo do dia: jogadores, ritmo, defesa por posição
  demo.js         dados de demonstração pelo mesmo caminho
public/           o app (vai para o GitHub Pages)
  engine.js       motor de projeção, devig, consenso, Kelly, correlação da múltipla
  tips.js         registro de tips: liquidação, ROI, CLV, CSV
  share.js        posts: cartão em imagem e texto para Telegram/WhatsApp
  importer.js     importação em lote das linhas da sua casa
  fonts/          Archivo (licença OFL), embutida para funcionar offline
  icons/          ícones do app instalável
  app.js          interface
  data/slate.json dados do dia
  data/results.json resultados dos últimos 14 dias (liquidação das tips)
  data/backtest.json calibração por mercado
data/history/     histórico de boxscores por temporada
test/             testes
```

## Analista IA (Claude)

Quando o app é aberto como artefato no Claude, a ficha do jogador mostra o botão **Pedir análise ao Claude**: ele envia os números daquela linha e recebe uma análise curta com prós, contras e veredito, usando a sua conta do Claude. Fora do Claude (GitHub Pages) o botão some.

## Suas tips ficam onde?

No navegador do aparelho (localStorage). Use **Banca → Baixar backup** de vez em quando e **Restaurar backup** em outro aparelho. O CSV abre no Excel/Google Planilhas.

## Publicidade e regras

Os posts levam o aviso do Ministério da Fazenda em 10% da peça (Portaria SPA/MF 1.231/2024, alterada pela 1.964/2026, em vigor desde 17/07/2026). As regras novas também tratam como irregular colocar análise/prognóstico junto de link ou código de casa, prometer ganho fácil ou tratar aposta como renda. Isto não é orientação jurídica: confira com quem cuida da sua parte legal.

Aviso: proibido para menores de 18 anos. A chance é uma estimativa, não garantia de resultado. Aposta não é investimento.
