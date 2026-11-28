# Black House · Props NBA

Sistema de props da NBA para tipster brasileiro. Responder sempre em **português do Brasil**, direto, em linguagem de apostador (unidades, green/red, odd, linha, over/under).

## Peças
- **Coleta** (`collector/`, `node collector/build.js`): NBA stats, ESPN, relatório oficial de lesões (PDF lido por `collector/pdftext.py`), escalações, Kalshi, odds.
  - Grava `public/data/*.json` (slate, bot, strategies, kalshi...).
- **Modelo** (`public/engine.js`): `buildProps`, `evaluate` (Modelo BH misturado ao mercado, w = 0,4) e `parlayProb` (correlação do próprio jogador no histórico).
- **App** (PWA no GitHub Pages, `public/`): `index.html`, `resultados.html` (painel do canal).
- **Pauta dos canais** (`scripts/canal.mjs`): desenha os cards com Playwright e grava `public/data/canal.json`.
  - Métodos de teste:
    - `scripts/alavanca.mjs`: valor contra a Kalshi + duplas e triplas;
    - `scripts/criar.mjs`: Criar Aposta de um jogador, só over.
  - `scripts/escadas.mjs`: as 🪜 Escadas do bot.
- **Funções Supabase** (`bot/`):
  - `telegram` (bot @blackhouse_props_bot);
  - `canal` (posta nos canais, liquida, fechamento/CLV, endpoint `?resultados`);
  - `estrategias`;
  - `c99-ingest` (recebe as odds da 99play).
- **Pipeline** (`.github/workflows/atualizar.yml`):
  - job `coletar`: coleta e commita `data public/data`;
  - job `publicar`: roda `escadas.mjs` e depois `canal.mjs`.
- **Odds da 99play:** vêm SÓ do script Tampermonkey no navegador do PC do usuário. O feed tem uma linha por mercado.
  A 1.6 chegou a ler a Finta, mas a página da Finta bloqueia envios para outros sites (CSP); desde a 1.7 isso ficou só no `finta.user.js` 1.2, que envia pelo `GM_xmlhttpRequest`. Desde a 1.4 (28/11) o mesmo script também lê as linhas de futebol da 99play (9 ligas; chutes, no gol, defesas; 1º tempo e faltas desde a 1.5; time e jogo) de 30 em 30 min e manda para a função `linhas` do projeto Black House Futebol (`mccxlgtiulpknubdiyrz`) com o C99_TOKEN; o futebol confere o token chamando `c99-ingest/leitor99.user.js` (não guarda o token).
- **Gabarito do canal principal** (21/11): o bot entra no canal do usuário SEM permissão de postar (`cfg.gabarito`). Cada post (imagem + legenda) vira `channel_posts` com `band='gab'`; o pipeline lê a imagem (`scripts/gabarito-ocr.mjs`, tesseract; chave = token OIDC da rodada do Actions, sem secret; a imagem vem pelo bot em `?gab=img`) e `public/gabarito.js` separa jogador/mercado/linha/odd. Correção 100% automática (pedido do dono, 21/11): NBA pelo `results.json`; futebol pela ESPN (`public/futebol.js` + `settleFut` na função `canal`: placar `soccer/all/scoreboard` e `summary`). Registro e resultado NÃO notificam o dono (nem resumo do dia); ele pede em `/resultadoscanal`. Nunca postar nem responder nesse canal.
- **Canal GREENDOG - NBA 🏀** (canais id 3, 22/11, aprovado pelo dono): posta só simples na BR365 (`cfg.casa='365'`, link do jogo), lances livres tentados, lances livres convertidos e reb+ast, até 15/dia, 1u fixa, sem múltiplas (`multis: []`), sem botões, estreia `desde: 2026-11-23` às 10h. Legenda = `cfg.tpl` do dono ("🏀 NBA 🏀 / 💰 1 unidade / Sequência: {SEQUENCIA} em citação, os últimos 10 jogos no mercado / 🎟️ Clique aqui para pegar o bilhete pronto / 🔞 18+ · Aposte com responsabilidade"). Card BR365 sem "×", com a odd à direita da 1ª linha (pedido de 23/11), em Roboto. Os bingos o dono posta à mão.
- **Radar +EV** (21/11, `scripts/radar.mjs`, passo do job `coletar`): varre 99play (mais/menos) e Finta (mais) a cada coleta. Duas trilhas (21/11, após `scripts/radar-backtest.mjs`): Modelo BH com peso 0,2 (EV 6–30%) e Kalshi como preço justo só até 150 min do jogo (EV 4%+); segunda opinião Novig/Kalshi, travas (1 por jogador, 3 por jogo, 12 por dia), carteira de TESTE com Kelly 1/4 (banca 100u, teto 2u; 1u com odd > 3) e 1u fixa em paralelo, CLV e liquidação pelo boxscore. Estado em `data/radar/`, resumo em `public/data/radar.json`; aba `public/radar.html`, bot `/radar`. Nunca aposta de verdade.
- **Aba Jogador** (23/11, aprovada pelo dono): `collector/jogador.js` (passo do job `coletar`) baixa o jogada a jogada da ESPN de cada jogo encerrado (só os novos, em `data/jogador/jogos/`) e grava `public/data/jogador/<TIME>.json`, `index.json` e `fora.json`. Lógica em `public/jogador-core.js` (arremessos com coordenada, quem passou, rebotes, "quem está fora" com repasse calibrado nos jogos reais). Página `public/jogador.html` (Pontos, 3PM, Rebotes, Assistências, Combinados); a aba Jogos mostra "Quem ganha" com os desfalques do dia. Assistência potencial não existe na ESPN (só no rastreamento da NBA).
- **Visual novo** (24/11, aprovado pelo dono): fundo 3D da quadra no topo das Props (`public/arena3d.js`, Three.js r181 em `public/vendor/three`, só com WebGL e sem "reduzir movimento"; pausa fora da tela); Figurinha da entrada do dia (`renderFigura` em `app.js`, melhor linha de `topPicks`); Linha viva e Prancheta na aba Jogador (`public/vivos.js`, linha da casa vem de `slate.json`). Layout escolhido (24/11): mistura da Opção 2 do Subframe (menu lateral com nomes a partir de 1240 px, faixa de placar `.placar-jogos` com os jogos do dia) com o topo da Arena. Tema claro de volta (`garrafao:theme` no localStorage; o topo com a quadra e as quadras da Prancheta ficam sempre escuros).
- **Novig** (21/11): entra na mesma chamada da The Odds API (no lugar da `lowvig`, mesmo custo), mas FORA do consenso (métodos congelados): vai para `public/data/novig.json` e só o Radar usa.
- **Finta no futebol** (28/11): `tools/navegador/finta.user.js` (1.2: envios pelo `GM_xmlhttpRequest`, porque o CSP da Finta bloqueia o fetch para fora; @connect só para os dois projetos Supabase) também lê, no navegador do usuário e de 30 em 30 min, o JSON público da Finta (lobby e jogo) para 6 ligas + copas da UEFA e manda as linhas de chutes, no gol, faltas, desarmes e defesas (jogador; time e jogo) para a função `linhas` do Black House Futebol com o C99_TOKEN.
- **Finta** (`collector/finta.js`, desde 19/11): JSON público do site (`/rs/finta/public/lobby` e `/match/<id>`), lido pela coleta. Só tem over (linha principal + escada). Vai para `public/data/finta.json`; no bot, `fo` (odd da Finta no mesmo over) e `fin` (overs com valor), tela `/finta`.
- **Bilhete automático BR365** (24–28/11, validado ao vivo nos posts #347 e #348): `tools/navegador/bilhete365.user.js` (Tampermonkey, instala por `c99-ingest/bilhete365.user.js?token=`). Painel 🎟️ na br365.io lista os posts de hoje/ontem sem share code (`c99-ingest?bilhetes=1`, sem gabarito), monta o cupom (abre o jogo, acha o mercado e a linha, confere a linha, "Mostrar todos"/abas dos times, "Tentar de novo" até 3x), preenche o valor da unidade (⚙️) e para. O usuário clica em "Fazer Aposta"; o script vai em `#/betHistory`, clica em Compartilhar, pega o código do `Storage/SaveValue` e manda em `c99-ingest?bilhete=<id>&code=`, que chama `canal?relink` e troca o link do post. Botões proibidos no código (`PROIBIDO`): Fazer Aposta, Apostar, Confirmar, Depositar, Sacar, Cash out. Próximo passo combinado: o dono vai pedir funções novas; depois expandir para a 99play.

## Comandos
- Testes: `npm test`. Depois rode `git checkout -q -- public/data`, porque os testes mexem nos dados.
- Checar sintaxe de função/TS: `npx -y esbuild@0.24.0 <arquivo> --format=esm --log-level=error`.
- **Deploy das funções Supabase:**
  - O `index.ts` deployado é uma linha só que carrega o código do commit: `import 'https://raw.githubusercontent.com/gabrielcbjr29/black-house-props/<hash>/bot/<fn>/index.ts';`
  - Fluxo: commit → push → deploy com o hash novo.
  - `verify_jwt: false` em `canal`, `telegram-bot` e `estrategias`.
- **Rodar o pipeline na hora:** `gh api -X POST repos/gabrielcbjr29/black-house-props/actions/workflows/atualizar.yml/dispatches -f ref=main`.

## Regras (não negociáveis)
- **Segredos:**
  - Nunca commitar chaves: o repositório é público.
  - Os segredos ficam nos secrets do GitHub ou em `bot_config` (Supabase, privado).
  - Não reescrever secrets do GitHub sem pedir.
- **99play:**
  - Não criar relay/servidor para contornar o bloqueio de robô da 99play/Altenar.
  - Não tirar print da 99play pela nuvem.
  - Bilhete automático (mudado em 24/11, pedido do dono): a ferramenta pode montar o cupom e gerar o share code/link do bilhete, rodando no navegador do usuário. Nunca clicar em "Apostar" nem confirmar aposta: confirmar fica sempre com o usuário. Começa pela BR365.
- **Imagens:**
  - Sem foto de jogador ou de pessoa real.
  - Sem logo de time da NBA (usar os selos com sigla).
  - Não copiar bilhete com a marca da casa.
- **Banco:**
  - Migração no Supabase só com aprovação do usuário.
  - Apagar dados e mensagens só com cuidado; mensagem de teste é apagada logo depois.
- **Métodos dos canais:** ficam como estão até a revisão de 24/11.
  - Na revisão: backtest de novo, over × under, Alavanca (chance da Kalshi × acerto, CLV), Criar Aposta (chance prevista × acerto, odd real × estimada).
- **Revisão de 26/11 (aplicada com aprovação do dono, "pode aplicar tudo que melhorar"):** docs `claude/revisao-26-11-metodos-bot.md` e `claude/revisao-26-11-numeros.md` no Projeto.
  - Peso do modelo no bot segue 0,4 (testado 0,1/0,2: só reduz entradas e piora o ROI). App: padrão de 55% para 40%, igual ao bot.
  - Estratégias arquivadas (`off`): Método Minutos, m-3pa, m-3pm, m-fgm e o v2 de pts, reb, ast, 3pm, pra, pa, fgm, 2pm, 3pa, tov.
  - Nova `nucleo-under`: menos de em FTA/PF/SB/BLK, linha 1,5–2,5, chance 55–70%, EV > 0, rotação, sem colega fora; ordem pela chance, até 8 por dia, alerta sem corte de EV. No app: atalho "Núcleo under".
  - Risco novo depois do alerta → entrada `cancelada` ("não entre"): sai da conta do placar, mas o resultado fica gravado.
  - Listas do bot/app: tentativas sem FGM; sem under de RA e de 2PM.
  - Radar: compra só pela trilha Kalshi e só na 99play (trilha BH e Finta seguem na varredura, sem compra).
  - GREENDOG: `lado: 'u'`, mercados FTA e RA (o over e o FTM perderam).
  - Liquidação: jogador fora do boxscore espera até 2 dias (em 23/11 os IDs da ESPN anularam o dia).

## Cofre do Obsidian e ciclo de aprendizado
- O cofre "Black House" fica **fora do repositório**, em `Documentos\Black House`. O acesso é liberado em `.claude/settings.local.json`, que não é commitado.
  - Pastas: `Diário/` (uma nota por dia, `AAAA-MM-DD.md`), `Jogadores/`, `Times/`, `Métodos/`, `Revisões/`, `Caixa de entrada/`.
- **Antes de analisar jogador, jogo ou método:** ler `Regras aprendidas.md` e a ficha do jogador/time no cofre, se houver.
- **Ciclo** (tarefas agendadas no app do Claude):
  - toda manhã: conferir o diário de ontem com `public/data/results.json` e o veredito, preencher a coluna Resultado e levar as observações para os métodos e fichas;
  - toda segunda: escrever `Revisões/Revisão DD-MM.md` com padrões e propostas.
- **O Claude propõe, o usuário decide:**
  - Nada muda de status em `Regras aprendidas.md`, nem em regra ou código de método, sem o "sim" do usuário.
  - Amostra mínima de ~30 entradas para confirmar uma regra.
  - O CLV pesa mais que green/red.
- Veredito pelo fechamento, público e agregado: `https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/estrategias?veredito=1`.
- Nada do cofre vai para o repositório, porque ele é público. Também não se escreve chave, senha ou token no cofre.

## Notas privadas
- As análises e decisões ficam no Projeto "Black House | PROPS NBA" do claude.ai.
- Cópias locais vão em `notas/`, que está no `.gitignore` e nunca é commitada, porque o repositório é público.
