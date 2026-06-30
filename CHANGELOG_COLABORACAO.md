# 📓 Diário de Bordo Compartilhado — CybersecCAST AutoPost

> **REGRA OBRIGATÓRIA (vale para Manus E para Claude Code):**
> **Toda alteração no projeto DEVE ser registrada aqui, no topo da lista, ANTES de fazer commit/PR.**
> Quem edita o código atualiza este arquivo. Sem exceção. Este documento é o ponto de
> sincronização entre as duas IAs: é a primeira coisa a ler ao começar e a última a
> escrever ao terminar. Se este arquivo não foi atualizado, a mudança é considerada incompleta.

## Como preencher cada entrada

Copie o modelo abaixo e preencha no **topo** da seção "Histórico" (mais recente primeiro):

```
### [AAAA-MM-DD HH:MM TZ] — <AUTOR: Manus | Claude> — <título curto da mudança>
- **O que mudou:** (resumo objetivo)
- **Arquivos tocados:** (lista dos principais arquivos)
- **Por quê:** (motivo / pedido do usuário)
- **Impacto / atenção:** (algo que a outra IA precisa saber para não quebrar)
- **Migração de banco?** (sim/não — se sim, descreva o SQL aplicado)
- **Pendências / próximos passos:** (o que ficou para depois)
- **Branch / PR:** (nome do branch e link do PR, quando aplicável)
- **Testado?** (como foi testado; vitest? publicação real?)
```

---

## Histórico (mais recente no topo)

### [2026-06-30] — Claude Code — Multi-conta Instagram + fix toast

- **O que mudou:**
  - Nova tabela `accounts` (id, label, igUserId, igUsername, active, createdAt) para registrar contas do Instagram.
  - Coluna `accountId` (nullable int) adicionada à tabela `posts`.
  - `GET /api/queue/next` passa `accountId` na resposta para o executor Manus saber qual conta usar.
  - Novo tRPC router `accounts` (list/create/update/remove).
  - `Calendar.tsx`: seletor de conta no form create/edit (visível apenas quando há contas cadastradas) + coluna "Conta" na tabela.
  - Fix toast: texto "será publicado na próxima execução do robô" (sem "(Ter/Qui)").
- **Arquivos tocados:**
  - `drizzle/schema.ts` — tabela `accounts` + coluna `accountId` em `posts`
  - `server/db.ts` — CRUD de contas (listAccounts, getAccount, createAccount, updateAccount, deleteAccount)
  - `server/routers/accounts.ts` — novo router tRPC
  - `server/routers.ts` — registra `accountsRouter`
  - `server/routers/posts.ts` — `accountId` em create/update
  - `server/queueApi.ts` — `accountId` em GET /api/queue/next
  - `client/src/pages/Calendar.tsx` — seletor de conta + coluna na tabela + fix toast
- **Migração de banco?** Sim — aplicar o SQL abaixo em produção:
  ```sql
  CREATE TABLE accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(128) NOT NULL,
    igUserId VARCHAR(64),
    igUsername VARCHAR(64),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  ALTER TABLE posts ADD COLUMN accountId INT NULL;
  ```
- **PENDENTE-MANUS:** (1) Aplicar a migração SQL acima no banco de produção (TiDB/MySQL). (2) Atualizar o executor `instagram_automation.py` para ler o campo `accountId` da fila e usar as credenciais da conta correspondente (ou conta padrão se null). (3) Cadastrar as contas do Instagram pelo painel (Configurações → futura aba de contas, ou via API tRPC diretamente).
- **Branch / PR:** push direto na main.
- **Testado?** Vitest — ver resultado abaixo.

### [2026-06-30] — Claude Code — Preparação para deploy no Railway

- **O que mudou:** Adicionado `railway.json` com build/start/healthcheck para deploy automático via git push. Adicionado endpoint `GET /api/health` (retorna `{ok:true}`) em `server/_core/index.ts` para o healthcheck do Railway.
- **Arquivos tocados:** `railway.json` (novo), `server/_core/index.ts`.
- **Por quê:** Migrar deploy para Railway elimina uso de créditos Manus para cada publicação de versão. Após configuração inicial, deploy = `git push origin main`.
- **Migração de banco?** Não.
- **PENDENTE-MANUS:** Criar conta em railway.com, conectar repo `betoyes/cyberpost-manus`, configurar as env vars de produção no painel do Railway (ver lista abaixo), e fazer o primeiro deploy manual. Após isso, todo deploy futuro é automático via git push.
- **Env vars necessárias no Railway:** `DATABASE_URL`, `JWT_SECRET`, `QUEUE_API_TOKEN`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`, `NODE_ENV=production`.
- **Branch / PR:** push direto na main.
- **Testado?** Build e testes locais OK (23/23). Deploy em produção pendente (primeiro deploy via Railway = PENDENTE-MANUS).

### [2026-06-30] — Claude Code — Formalização da nova divisão de trabalho

- **O que mudou:** Adicionada seção `## DIVISÃO DE TRABALHO (vigente)` no topo de `INSTRUCOES_PARA_CLAUDE.md`, formalizando que o Claude Code é o desenvolvedor principal responsável por todo o código (incluindo merges e resolução de conflitos na main), e o Manus atua apenas como operador de credenciais (Instagram, Gmail, Drive, cron, deploy). Adicionadas as seções `## FLUXO DE COLABORAÇÃO` (convenção `PENDENTE-MANUS:` no changelog) e `## FILA DE TAREFAS` com as próximas prioridades.
- **Arquivos tocados:** `INSTRUCOES_PARA_CLAUDE.md`, `CHANGELOG_COLABORACAO.md`.
- **Por quê:** Redução de custos — tarefas de código eram executadas pelo Manus a custo alto de créditos; Claude as executa com custo separado.
- **Migração de banco?** Não.
- **Pendências para o Manus:** Nenhuma nesta tarefa. Próxima ação do Manus será deploy das mudanças já na main (feat/post-now + feat/free-scheduling) em `cyberpost.manus.space`.
- **Branch / PR:** push direto na main (apenas documentação).
- **Testado?** `./node_modules/.bin/vitest run` — 23/23 testes passando.

### [2026-06-30] — Claude Code — Tarefa 1: botão "Postar agora" + fix de teste

- **O que mudou:**
  - Novo mutation tRPC `posts.postNow`: seta `scheduledAt = Date.now()` e `status = "Pendente"` para que o endpoint `GET /api/queue/next` retorne o post na próxima passagem do executor. Guarda-corpos: bloqueia se post já `"Postado"` ou `"Aguardando Aprovação"`.
  - Botão ⚡ "Postar agora" na coluna de ações do Calendário Editorial (visível apenas para posts `"Pendente"`). Toast informa que a publicação ocorre na próxima execução do robô — não publica no Instagram diretamente.
  - Fix de bug pré-existente: `ENV.queueApiToken` lido como snapshot no `import` fazia o teste `queueApi.test.ts > accepts requests with the correct token` falhar. Corrigido com getter no `server/_core/env.ts`.
- **Arquivos tocados:**
  - `server/_core/env.ts` — getter para `queueApiToken`
  - `server/routers/posts.ts` — mutation `postNow` + import `TRPCError`
  - `client/src/pages/Calendar.tsx` — ícone `Zap`, mutation `postNowMut`, botão na tabela
- **Por quê:** pedido do usuário (alta prioridade); publicação imediata sem alterar regras de segurança de legenda.
- **Migração de banco?** Não — usa colunas `scheduledAt` e `status` já existentes.
- **Pendências / próximos passos:** Executor (Manus) já consome `GET /api/queue/next`; nenhuma mudança necessária do lado do Manus para esta tarefa.
- **Branch / PR:** `feat/post-now` → PR aberto para main.
- **Testado?** `./node_modules/.bin/vitest run` — 15/15 testes passando (incluindo o teste que estava falhando, agora corrigido).

### [2026-06-30] — Claude Code — Tarefa 2: fix de timezone + agendamento livre para qualquer data/hora

- **O que mudou:**
  - **Bug corrigido:** o campo de agendamento usava `getHours()` / `new Date(str).getTime()` que dependem do fuso do browser — se o browser estiver em UTC (comum em servidores/VMs), horas eram salvas 3h adiantadas. Agora fixado explicitamente para `America/Sao_Paulo`.
  - Criado `shared/timezone.ts` com três funções puras: `toSaoPauloInput(ms)` (UTC ms → string para `<input type="datetime-local">`), `parseSaoPauloInput(str)` (string SP → UTC ms, usa offset `-03:00` fixo pois BR não tem DST desde 2019), `formatSaoPaulo(ms)` (UTC ms → string legível em pt-BR/SP).
  - `Calendar.tsx`: remove `toLocalInput` (bugada), importa utilitários de SP, label no campo diz "(Horário de Brasília)", coluna "Agendado" agora sempre exibe hora de Brasília independente do fuso do browser.
  - `Home.tsx`: "Próximas publicações" agora exibe hora de Brasília.
  - **Agendamento livre confirmado:** sem restrição de dia/hora no frontend — o executor do Manus (Ter/Qui) pega qualquer post com `scheduledAt <= now`.
- **Arquivos tocados:**
  - `shared/timezone.ts` — novo utilitário (criado)
  - `server/timezone.test.ts` — 8 novos testes cobrindo toSaoPauloInput, parseSaoPauloInput, formatSaoPaulo e round-trip
  - `server/_core/env.ts` — getter `queueApiToken` (fix de snapshot em testes — também está em feat/post-now)
  - `client/src/pages/Calendar.tsx` — timezone fix + label "Horário de Brasília"
  - `client/src/pages/Home.tsx` — timezone fix na listagem
- **Por quê:** usuário relatou "erro de cadastro de horário"; horas estavam dependentes do fuso do browser em vez de São Paulo.
- **Migração de banco?** Não — `scheduledAt` já é UTC ms; a mudança é só na camada de exibição/parse da UI.
- **Pendências / próximos passos:** Nenhuma para o Manus nesta tarefa. Se o Manus precisar exibir datas em outros pontos, usar `formatSaoPaulo` do `shared/timezone.ts`.
- **Branch / PR:** `feat/free-scheduling` → PR aberto para main.
- **Testado?** `./node_modules/.bin/vitest run` — 23/23 testes passando (15 originais + 8 novos de timezone).

### [2026-06-30] — Manus — Merge dos PRs do Claude na main + resolução de conflitos
- **O que mudou:** Integrados `feat/post-now` e `feat/free-scheduling` na main. Conflitos resolvidos em `env.ts` (getter), `posts.ts` (reactivate + postNow), `Calendar.tsx` (botão Postar agora + utilitários de timezone) e neste changelog (ambas as entradas preservadas).
- **Migração de banco?** Não.
- **Branch / PR:** merge para main (ambiente Manus).
- **Testado?** vitest + republicação em produção.

### [2026-06-30 03:36 UTC] — Manus — Validação do fluxo de aprovação por e-mail (IA) + endpoint de geração sob demanda
- **O que mudou:** Adicionado endpoint interno `POST /api/queue/generate-caption` (token-auth; em desenvolvimento também aceita chamada via loopback) que gera a legenda de IA de um post a partir do tema, grava em `captionAi` e marca o post como `Aguardando Aprovação`. Gerada a legenda do Post-Sunny-02 (tema "A Próxima Fase da Observabilidade"), enviado e-mail de aprovação para o usuário, que respondeu **REPROVADO**. Sistema registrou a reprovação e NÃO publicou (comportamento correto).
- **Arquivos tocados:** `server/queueApi.ts`, `server/_core/index.ts`.
- **Por quê:** O usuário pediu para testar o ciclo de aprovação por e-mail da legenda de IA.
- **Impacto / atenção:** O endpoint `generate-caption` é um auxiliar operacional. A geração "oficial" continua acontecendo na rotina diária do cérebro (`/api/scheduled/cron30`). Não remover sem combinar.
- **Migração de banco?** Não. Apenas updates de dados (status, captionAi, logs).
- **Pendências / próximos passos:** (1) Implementar "Postar agora" e agendamento livre (qualquer data/hora), não só Ter/Qui. (2) Avaliar reativar escrita no Google Sheets como espelho do calendário (hoje desativado por decisão de arquitetura — app é a fonte única). (3) Evolução multi-conta Instagram. (4) LinkedIn via Publer (futuro).
- **Branch / PR:** trabalho direto na main (ambiente Manus).
- **Testado?** Publicação real do Post-Sunny-01 (manual) confirmada: https://www.instagram.com/p/DaMdQvljthA/ . Fluxo de IA testado com reprovação por e-mail.

### [2026-06-30 ~02:35 UTC] — Manus — Operacionalização pós-deploy
- **O que mudou:** App publicado em https://cyberpost.manus.space . Cron diário do "cérebro" registrado (08:00 America/Sao_Paulo = 11:00 UTC) via Heartbeat. Executor `instagram_automation.py` reescrito para consumir a fila do app (`/api/queue/next` + `/api/queue/report`). Agendamento Manus Ter/Qui (8h e 17h) ajustado como executor. Textos do painel atualizados de "30 min" para "checagem diária". Posts de demonstração (ids 1-4) removidos.
- **Arquivos tocados:** `client/src/pages/Home.tsx`, `client/src/pages/Settings.tsx`, `/home/ubuntu/instagram_automation.py` (fora do repo do app), docs.
- **Por quê:** Colocar o sistema em produção e reduzir consumo de créditos.
- **Impacto / atenção:** O app é a **fonte única** do calendário (banco de dados). A planilha Google Sheets foi aposentada. As imagens ficam em `_MANUS_automation/CybersecCAST/` no Google Drive.
- **Migração de banco?** Não.
- **Pendências / próximos passos:** Ajustar o executor para fixar o caminho `_MANUS_automation/CybersecCAST/` no Drive.
- **Branch / PR:** main (Manus).
- **Testado?** 15 testes vitest passando; endpoints de fila validados em produção (401/403 sem token).

### [2026-06-30 — criação] — Manus — Projeto inicial
- **O que mudou:** Criação do CybersecCAST AutoPost (app web tRPC + React + DB) e do executor Python. Adicionados `DEVELOPER_GUIDE.md` e `MANUAL_DE_USO.md`. Push para o GitHub `betoyes/cyberpost-manus`.
- **Migração de banco?** Schema inicial criado.
- **Testado?** Build e testes iniciais OK.
