# Roadmap de Melhorias e Evolução

> Gerado a partir de uma análise completa do código em 2026-07-01 (pós-migração de
> independência da Manus — ver `INDEPENDENCIA_MANUS_STATUS.md`). Cada item traz o
> problema, a solução proposta e os arquivos envolvidos, para ser desenvolvido
> futuramente sem precisar redescobrir o contexto.
>
> Convenções: prioridades **P0** (bloqueante) → **P3** (desejável). Marcar itens
> concluídos com data e commit. Não confundir com `todo.md`, que é o checklist
> histórico do que já foi construído.

## Visão geral do estado atual

Pontos fortes que devem ser preservados em qualquer mudança:

- Separação limpa entre lógica de decisão pura (`server/engine.ts`) e side effects
  (`server/executor.ts`).
- Regras de negócio invioláveis protegidas por testes (legenda de IA nunca publica
  sem aprovação por e-mail).
- Segurança: token Meta nunca ecoado ao client (`getSettingMeta`), `ownerProcedure`,
  mensagens de erro sanitizadas em `testInstagramConnection`.
- 103 testes passando, `tsc --noEmit` e build limpos.

---

## P0 — Terminar a migração (pré-requisito de tudo)

**Status: pendente de credenciais.** O executor novo está publicado mas nunca rodou
de ponta a ponta. Passo a passo completo em `INDEPENDENCIA_MANUS_STATUS.md`
("Passo a passo pendente do dono").

- [ ] Setar no Railway: `OPENAI_API_KEY`, `RESEND_API_KEY`, `GOOGLE_SA_JSON`,
      `DRIVE_FOLDER_ID`; confirmar `PUBLIC_BASE_URL`.
- [ ] Configurar token Meta + `igUserId` pela tela `/accounts` e testar conexão.
- [ ] Publicação real de teste (legenda manual + imagem no Drive) → status "Postado"
      com permalink.
- [ ] Só então desativar executor Python + Heartbeat do lado da Manus.

---

## P1 — Confiabilidade do executor

Três problemas concretos encontrados na análise. São fixes pequenos, cirúrgicos e
que protegem exatamente o teste de ponta a ponta do P0.

### 1.1 Risco de post duplicado no Instagram

**Problema:** em `server/executor.ts` (bloco de publicação), se o processo morrer
(deploy do Railway, crash) entre o `media_publish` na Meta e o
`updatePost(status: "Postado")`, o post continua "Pendente" e o próximo tick do
worker publica de novo. O guard `isTicking` de `server/executorWorker.ts` só
protege dentro do mesmo processo.

**Solução proposta:** marcar um estado intermediário **antes** de chamar a Graph
API — gravar o `creationId` retornado pelo passo `/media` no post (novo campo
`igCreationId`). No tick seguinte, se o post estiver nesse estado, verificar antes
de repetir a publicação e alertar o dono em vez de duplicar.

**Arquivos:** `server/executor.ts`, `server/instagramGraph.ts`,
`drizzle/schema.ts` (novo campo), `server/db.ts`.

**Atenção:** exige migração de banco (`npm run db:push`).

### 1.2 Loop de "Imagem Ausente" a cada 60 segundos

**Problema:** `db.getNextReadyToExecute` (`server/db.ts`) considera
"Erro: Imagem Ausente" acionável (correto, para re-tentar), mas o executor então
baixa do Drive e grava um log de warning **a cada minuto** enquanto a imagem não
aparecer — spam de logs e chamadas desnecessárias à Drive API. A cadência de 6h
que já existe na engine (`shouldSendMissingAlert` + `lastMissingAlertAt` +
`MISSING_ALERT_INTERVAL_MS` em `server/engine.ts`) era usada só pelo fluxo legado
da Manus (`server/queueApi.ts`) e **não é usada pelo executor novo**.

**Solução proposta:** no `runExecutionForPost`, quando o status já é
"Erro: Imagem Ausente", re-tentar o download com intervalo maior (ex.: a cada
15-30 min, não a cada tick) e logar/notificar respeitando `shouldSendMissingAlert`
(máx. a cada 6h), atualizando `lastMissingAlertAt`.

**Arquivos:** `server/executor.ts`, `server/db.ts` (`getNextReadyToExecute`),
`server/engine.ts` (já pronto, só reusar).

### 1.3 Retry com backoff para erros transitórios

**Problema:** qualquer erro de rede ou 5xx da Meta/Drive vira "Fluxo Parado"
permanente, exigindo intervenção manual. Erros transitórios deveriam ser
re-tentados antes de parar o fluxo.

**Solução proposta:** novo campo `attemptCount` no schema; 2-3 tentativas com
backoff (ex.: próximo tick, +5 min, +15 min) antes de marcar "Fluxo Parado".
Zerar o contador quando o post for editado/reagendado. Distinguir erros
permanentes (token inválido, conta ausente → parar direto) de transitórios
(timeout, 5xx → re-tentar).

**Arquivos:** `drizzle/schema.ts`, `server/executor.ts`, `server/db.ts`.

**Atenção:** exige migração de banco.

---

## P1 — Operação contínua

### 2.1 Alerta de expiração do token Meta

**Problema:** o token long-lived da Meta dura ~60 dias; hoje a expiração só é
descoberta quando uma publicação falha.

**Solução proposta:** check diário no worker (reusar `testInstagramConnection` de
`server/instagramGraph.ts`, que já é somente-leitura) com e-mail de aviso via
`notifyOwner` ao detectar token inválido ou perto de expirar. Evolução: renovação
automática via endpoint de refresh da Meta
(`GET /oauth/access_token?grant_type=fb_exchange_token`).

**Arquivos:** `server/executorWorker.ts` (novo tick diário),
`server/instagramGraph.ts`, `server/_core/notification.ts`.

### 2.2 Watchdog do worker + healthcheck

**Problema:** o worker é um `setInterval` in-process invisível — se morrer ou o
event loop travar, nada avisa.

**Solução proposta:**
- Gravar "última execução do tick" em `settings` (ex.: `executor_last_tick_at`) a
  cada tick.
- Exibir no painel: "executor ativo, último tick há Xs" (Home ou Settings).
- Endpoint `GET /health` que responde 200 se o último tick foi há < 5 min —
  plugável no healthcheck do Railway e/ou monitor externo (UptimeRobot).

**Arquivos:** `server/executorWorker.ts`, `server/db.ts`,
`server/_core/index.ts` (rota), `client/src/pages/Home.tsx` ou `Settings.tsx`.

### 2.3 Filtro de status no SQL

**Problema:** `getNextReadyToExecute` e `getOldestDuePost` (`server/db.ts`)
carregam **todos** os posts vencidos e filtram status em JS — cresce com o
histórico de posts.

**Solução proposta:** `inArray(posts.status, [...])` + `.limit(1)` direto na
query Drizzle. Aproveitar e criar índice em (`status`, `scheduledAt`).

**Arquivos:** `server/db.ts`, `drizzle/schema.ts` (índice).

---

## P2 — Cortar a última dependência da Manus + limpeza

### 3.1 Migrar storage de imagens do Forge/S3 da Manus

**Problema:** decisão consciente na migração (ver
`INDEPENDENCIA_MANUS_STATUS.md`), mas é a **última dependência**: se a Manus
desligar, a URL pública da imagem quebra e a publicação para
(`server/storage.ts` + `server/_core/storageProxy.ts`).

**Solução proposta:** Cloudflare R2 (grátis até 10 GB, API compatível com S3 — o
`@aws-sdk/client-s3` já instalado serve direto). Alternativas: S3 real, ou volume
do Railway + serving estático. Manter a mesma interface `storagePut` para não
tocar no executor.

**Arquivos:** `server/storage.ts` (trocar backend), env vars novas no Railway.

### 3.2 Remover código morto pós-confirmação do worker

**Pré-condição:** dono confirmou o worker novo funcionando em produção e desativou
o lado da Manus (P0 completo).

- [ ] `server/queueApi.ts` + rotas `/api/queue/*` (bridge do executor Python).
- [ ] Caminho Heartbeat em `server/schedulePost.ts` (`runPostHandler`,
      `schedulePostJob`, `cancelPostJob`, `scheduledAtToCron`) e
      `server/_core/heartbeat.ts`.
- [ ] Módulos Forge não usados: `server/_core/llm.ts`,
      `server/_core/imageGeneration.ts`, `server/_core/voiceTranscription.ts`,
      `server/_core/dataApi.ts`, `server/_core/map.ts` (conferir usos antes).
- [ ] Client: `ManusDialog.tsx`, `Map.tsx`, `vite-plugin-manus-runtime`
      (package.json + vite.config.ts).
- [ ] `client/src/pages/ComponentShowcase.tsx` (1.437 linhas) fora do bundle de
      produção (remover a rota ou lazy-load só em dev).
- [ ] Campo `scheduleCronTaskUid` do schema (após confirmar que nenhum post ativo
      o usa).

**Atenção:** a regra do projeto diz para não tocar em `/api/queue/*` e
`server/_core/` "sem necessidade real" — esta limpeza só entra quando o legado
estiver comprovadamente desativado. Atualizar `.claude/CLAUDE.md` e docs junto.

---

## P2 — Evolução de produto

### 4.1 Aprovar/editar legenda de IA pela UI

Hoje a aprovação é só pelo link do e-mail (`/aprovacao/confirmar`). Adicionar no
painel: botão Aprovar/Reprovar em posts "Aguardando Aprovação" e edição da legenda
de IA antes de aprovar (editar converte em legenda manual? — decidir regra;
cuidado com a regra inviolável nº 1).

**Arquivos:** `client/src/pages/Home.tsx` / `Calendar.tsx`,
`server/routers/posts.ts`, reusar lógica de `server/approvalHandler.ts`.

### 4.2 Preview da imagem do Drive no painel

Buscar thumbnail do Drive na criação/listagem do post, evitando descobrir
"Erro: Imagem Ausente" só na hora da publicação. A Drive API retorna
`thumbnailLink`. Um botão "verificar imagem agora" também resolveria.

**Arquivos:** `server/googleDrive.ts`, `server/routers/posts.ts`,
`client/src/pages/Calendar.tsx` / `Home.tsx`.

### 4.3 Suporte a Reels e carrossel

O schema já prevê `mediaType: "reel"` (`drizzle/schema.ts`), mas
`publishImageToInstagram` só publica imagem única. Graph API: Reels usam
`media_type=REELS` + `video_url` (com polling de status do container); carrossel
usa containers filhos + `media_type=CAROUSEL`.

**Arquivos:** `server/instagramGraph.ts`, `server/executor.ts`,
`server/googleDrive.ts` (vídeos), UI de criação de post.

### 4.4 Métricas pós-publicação

Buscar likes/comentários/alcance via Graph API (`GET /{media-id}/insights`) dos
posts "Postado" e exibir dashboard — `recharts` já está instalado. Coleta diária
pelo worker; nova tabela `post_metrics`.

**Arquivos:** novo `server/instagramInsights.ts`, `drizzle/schema.ts`,
`server/executorWorker.ts`, nova página ou seção em `Home.tsx`.

### 4.5 Legendas de IA melhores

- Tom de voz e hashtags fixas configuráveis em Settings (tabela `settings` já
  serve).
- Few-shot: incluir as melhores legendas passadas como exemplo no prompt de
  `server/caption.ts`.
- Regenerar legenda com feedback ("mais curta", "menos emoji") na UI de aprovação
  (sinergia com 4.1).

**Arquivos:** `server/caption.ts`, `server/llm.ts`,
`client/src/pages/Settings.tsx`.

### 4.6 Multi-conta real

A tabela `accounts` existe e `resolvePostAccount` já resolve conta por post, mas
`meta_access_token` é um setting global único. Mover o token para a conta
(campo `metaToken` em `accounts`) destravaria publicar em mais de um perfil. UI em
`/accounts` já tem a seção "Conexão Meta" para evoluir.

**Arquivos:** `drizzle/schema.ts`, `server/db.ts`, `server/executor.ts`,
`server/routers/accounts.ts`, `client/src/pages/Accounts.tsx`.

**Atenção:** exige migração de banco.

### 4.7 Auto-rascunho a partir do Drive

Detectar arquivos novos na pasta do Drive e criar posts "rascunho"
automaticamente, invertendo o fluxo (hoje o filename é cadastrado à mão). Scan
periódico no worker + flag `isDraft`.

**Arquivos:** `server/googleDrive.ts` (listagem), `server/executorWorker.ts`,
`drizzle/schema.ts`, UI.

**Atenção:** status é enum fechado com strings invioláveis — introduzir "rascunho"
requer decisão explícita do dono sobre a regra de negócio nº 4.

---

## P3 — Higiene técnica

- **Logger estruturado** (ex.: `pino`) no lugar de `console.log/warn/error` —
  facilita filtrar logs no Railway. Arquivos: todo o `server/`.
- **Pool MySQL configurado** em `server/db.ts` (`getDb` cria conexão sem
  pool/timeout explícitos — conferir defaults do `mysql2`).
- **Rate limiting** nos endpoints públicos (`/api/queue/*` enquanto existirem,
  handler de aprovação) — higiene, o token de aprovação de 32 bytes já é forte.
- **Índices**: (`status`, `scheduledAt`) em `posts` (junto com 2.3);
  `approvalToken` é lookup frequente — conferir se é indexado.

---

## Sequência recomendada

1. **P0** — credenciais + teste de ponta a ponta.
2. **P1 confiabilidade** (1.1 → 1.2 → 1.3) — pequenos e protegem o teste do P0.
3. **P1 operação** (2.1 → 2.2 → 2.3).
4. **P2 limpeza** (3.1 → 3.2) — só após o legado da Manus estar desativado.
5. **P2 produto** na ordem 4.1 → 4.7 (ou conforme prioridade do dono).
6. **P3** oportunisticamente, junto com os itens acima.

## Regras para o desenvolvimento destes itens

- Respeitar as regras de negócio invioláveis de `.claude/CLAUDE.md` (aprovação de
  IA, timezone `America/Sao_Paulo`, strings de status exatas).
- Testes primeiro (o projeto está com 103/103 verdes — manter).
- Registrar cada mudança em `CHANGELOG_COLABORACAO.md` antes do commit.
- Itens marcados com **"exige migração de banco"**: rodar `npm run db:push` e
  validar em produção com cautela.
