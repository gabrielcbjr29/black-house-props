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
