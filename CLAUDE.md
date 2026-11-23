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
- **Gabarito do canal principal** (21/11): o bot entra no canal do usuário SEM permissão de postar (`cfg.gabarito`). Cada post (imagem + legenda) vira `channel_posts` com `band='gab'`; o pipeline lê a imagem (`scripts/gabarito-ocr.mjs`, tesseract; chave = token OIDC da rodada do Actions, sem secret; a imagem vem pelo bot em `?gab=img`) e `public/gabarito.js` separa jogador/mercado/linha/odd. Correção 100% automática (pedido do dono, 21/11): NBA pelo `results.json`; futebol pela ESPN (`public/futebol.js` + `settleFut` na função `canal`: placar `soccer/all/scoreboard` e `summary`). Registro e resultado NÃO notificam o dono (nem resumo do dia); ele pede em `/resultadoscanal`. Nunca postar nem responder nesse canal.
- **Canal GREENDOG - NBA 🏀** (canais id 3, 22/11, aprovado pelo dono): posta só simples na BR365 (`cfg.casa='365'`, link do jogo), lances livres tentados, lances livres convertidos e reb+ast, até 15/dia, 1u fixa, sem múltiplas (`multis: []`), sem botões, estreia `desde: 2026-11-23` às 10h. Legenda = `cfg.tpl` do dono ("🏀 NBA 🏀 / 💰 1 unidade / Sequência: {SEQUENCIA} em citação, os últimos 10 jogos no mercado / 🎟️ Clique aqui para pegar o bilhete pronto / 🔞 18+ · Aposte com responsabilidade"). Card BR365 sem "×", com a odd à direita da 1ª linha (pedido de 23/11), em Roboto. Os bingos o dono posta à mão.
- **Radar +EV** (21/11, `scripts/radar.mjs`, passo do job `coletar`): varre 99play (mais/menos) e Finta (mais) a cada coleta. Duas trilhas (21/11, após `scripts/radar-backtest.mjs`): Modelo BH com peso 0,2 (EV 6–30%) e Kalshi como preço justo só até 150 min do jogo (EV 4%+); segunda opinião Novig/Kalshi, travas (1 por jogador, 3 por jogo, 12 por dia), carteira de TESTE com Kelly 1/4 (banca 100u, teto 2u; 1u com odd > 3) e 1u fixa em paralelo, CLV e liquidação pelo boxscore. Estado em `data/radar/`, resumo em `public/data/radar.json`; aba `public/radar.html`, bot `/radar`. Nunca aposta de verdade.
- **Aba Jogador** (23/11, aprovada pelo dono): `collector/jogador.js` (passo do job `coletar`) baixa o jogada a jogada da ESPN de cada jogo encerrado (só os novos, em `data/jogador/jogos/`) e grava `public/data/jogador/<TIME>.json`, `index.json` e `fora.json`. Lógica em `public/jogador-core.js` (arremessos com coordenada, quem passou, rebotes, "quem está fora" com repasse calibrado nos jogos reais). Página `public/jogador.html` (Pontos, 3PM, Rebotes, Assistências, Combinados); a aba Jogos mostra "Quem ganha" com os desfalques do dia. Assistência potencial não existe na ESPN (só no rastreamento da NBA).
- **Novig** (21/11): entra na mesma chamada da The Odds API (no lugar da `lowvig`, mesmo custo), mas FORA do consenso (métodos congelados): vai para `public/data/novig.json` e só o Radar usa.
- **Finta** (`collector/finta.js`, desde 19/11): JSON público do site (`/rs/finta/public/lobby` e `/match/<id>`), lido pela coleta. Só tem over (linha principal + escada). Vai para `public/data/finta.json`; no bot, `fo` (odd da Finta no mesmo over) e `fin` (overs com valor), tela `/finta`.

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
  - Não automatizar apostas nem gerar bilhete na conta do usuário.
- **Imagens:**
  - Sem foto de jogador ou de pessoa real.
  - Sem logo de time da NBA (usar os selos com sigla).
  - Não copiar bilhete com a marca da casa.
- **Banco:**
  - Migração no Supabase só com aprovação do usuário.
  - Apagar dados e mensagens só com cuidado; mensagem de teste é apagada logo depois.
- **Métodos dos canais:** ficam como estão até a revisão de 24/11.
  - Na revisão: backtest de novo, over × under, Alavanca (chance da Kalshi × acerto, CLV), Criar Aposta (chance prevista × acerto, odd real × estimada).

## Notas privadas
- As análises e decisões ficam no Projeto "Black House | PROPS NBA" do claude.ai.
- Cópias locais vão em `notas/`, que está no `.gitignore` e nunca é commitada, porque o repositório é público.
