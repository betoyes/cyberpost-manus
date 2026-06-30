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
