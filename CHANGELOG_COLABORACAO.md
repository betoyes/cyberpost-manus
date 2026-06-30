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
