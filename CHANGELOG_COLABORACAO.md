# Diário de Bordo — CybersecCAST AutoPost

**Regra:** toda alteração DEVE ser registrada aqui **antes** do commit/PR. Entrada nova sempre no topo.

Modelo mínimo:
```
### [AAAA-MM-DD] — <Claude | Manus> — <título>
- O que mudou / Por quê / Arquivos tocados
- Migração de banco? (sim → descrever SQL) / Testado?
- PENDENTE-MANUS: (se houver)
```

---

## PENDÊNCIAS ATIVAS (MANUS)

> Itens que precisam ser executados em produção — código já está na main.

1. **`PUBLIC_BASE_URL=https://cyberpost.manus.space`** — setar env em produção. Sem isso, os links de aprovação por e-mail ficam com path relativo.
2. **Migração `drizzle/0003_schedule_uid.sql`** — coluna `scheduleCronTaskUid` na tabela `posts`:
   ```sql
   ALTER TABLE `posts` ADD `scheduleCronTaskUid` varchar(65);
   CREATE INDEX `posts_schedule_uid_idx` ON `posts` (`scheduleCronTaskUid`);
   ```
3. **Migração `drizzle/0002_multi_conta.sql`** — cria tabela `accounts` e coluna `accountId` em `posts` (SQL completo na entrada multi-conta abaixo).
4. **Contas Instagram** — após migração, cadastrar conta(s) em `/accounts` no painel, preencher `igUserId`, marcar padrão (★).
5. **Frequência do executor** — posts com legenda manual são liberados pelo Heartbeat no horário exato, mas o executor ainda roda Ter/Qui. Avaliar aumentar frequência.

---

## Histórico (mais recente no topo)

### [2026-06-30] — Claude Code — Fix: login Google entrava em loop por sync legado da Manus

- **Contexto:** depois do fix de `appId` vazio (commit `7b1f899`), o login Google concluía e a sessão JWT passava na validação, mas o app entrava em loop de login. Logs do Railway mostravam `[Auth] Failed to sync user from OAuth: Error: User openId is required for upsert`, originado em `upsertUser` ← `SDKServer.authenticateRequest` ← `createContext`.
- **Causa raiz:** `authenticateRequest` (`server/_core/sdk.ts`), quando `db.getUserByOpenId(session.openId)` não encontra o usuário, tenta um fallback de "sincronizar do OAuth" chamando `getUserInfoWithJwt` — um endpoint da **Manus** (`GetUserInfoWithJwt`, via `axios`/`ENV.oAuthServerUrl`). Esse endpoint não sabe validar um JWT autoassinado do nosso próprio login Google; a resposta não trazia `openId`, e o código tentava `db.upsertUser({ openId: undefined, ... })`, que lança `"User openId is required for upsert"` — capturado, logado, e convertido em `ForbiddenError`, derrubando toda sessão recém-criada e mandando o front de volta pro login (loop).
- **O que mudou:**
  - `server/_core/sdk.ts`: `SessionPayload`/`createSessionToken`/`signSession`/`verifySession` agora carregam um campo opcional `loginMethod` no JWT de sessão (sem tornar `openId`/`appId`/`name` opcionais — a validação de campos obrigatórios em `verifySession` **não foi alterada**). Em `authenticateRequest`, o fallback de sincronização legada da Manus só roda quando `session.loginMethod !== "google"` — para sessões Google, se o usuário não for encontrado no banco, o código agora lança `ForbiddenError("User not found")` diretamente, sem tentar o endpoint da Manus. Usuário Google que já existe no banco (caso normal, já criado pelo próprio callback) continua carregando via `db.getUserByOpenId` sem nenhuma mudança de caminho.
  - `server/_core/oauth.ts`: `sdk.createSessionToken` no callback do Google agora passa `loginMethod: "google"`, marcando a sessão para o `authenticateRequest` acima.
- **Não alterado:** `openId` continua **obrigatório** em `db.upsertUser` (guard global intacto); sessões sem `loginMethod` (legado Manus, se algum dia existirem) continuam usando o fluxo de sync antigo normalmente — mudança é aditiva, não removeu nenhum caminho existente.
- **Arquivos tocados:** `server/_core/sdk.ts`, `server/_core/oauth.ts`.
- **Migração de banco?** Não.
- **Testado?** `server/_core/sdk.test.ts` ganhou 3 testes novos cobrindo exatamente o cenário do bug: sessão Google com usuário já no banco não chama o sync legado (`axios.post` nunca invocado); sessão Google com usuário ausente do banco lança erro limpo sem chamar o sync nem `db.upsertUser`; sessão sem `loginMethod` (compatibilidade) continua chamando o sync legado normalmente. Suíte completa: 72/72 passando. `tsc --noEmit` sem erros. `npm run build` (mesmo comando do Railway) compila sem erros.
- **Branch / PR:** push direto na main.

### [2026-06-30] — Claude Code — Fix: sessão do login Google rejeitada ("Session payload missing required fields")

- **Contexto:** depois do fix de `invalid_client` (commit `1f94d6b`), o callback do Google passou a completar sem erro, mas todo request autenticado subsequente falhava com `[Auth] Session payload missing required fields` nos logs do Railway — o usuário nunca ficava de fato logado.
- **Causa raiz:** `server/_core/sdk.ts` — `createSessionToken` assina o JWT de sessão com `appId: ENV.appId`, e `ENV.appId = process.env.VITE_APP_ID ?? ""`. `VITE_APP_ID` era a identificação do projeto no portal OAuth da Manus; não é mais setada (nem deveria ser) depois da migração para login Google (§6B). Resultado: o token era assinado com `appId: ""`. `verifySession` exige `isNonEmptyString(appId)` — string vazia falha essa checagem e a sessão é descartada, mesmo sendo um token recém-emitido e válido.
- **O que mudou:** `server/_core/sdk.ts` — `createSessionToken` agora assina `appId: ENV.appId || SESSION_APP_ID`, onde `SESSION_APP_ID = "cyberseccast-autopost"` é um identificador fixo e sempre não vazio, próprio do app (não depende mais de configuração externa da Manus). Se `VITE_APP_ID` estiver configurada (ex.: algum ambiente legado), ela continua sendo usada — o fallback só entra quando está vazia. **A validação em `verifySession` não foi alterada nem enfraquecida** — continua exigindo `openId`, `appId` e `name` não vazios; a correção foi garantir que a criação da sessão sempre produza um payload que passa nessa validação.
- **Arquivos tocados:** `server/_core/sdk.ts`.
- **Migração de banco?** Não.
- **Testado?** Novo `server/_core/sdk.test.ts` (2 testes) — cobre exatamente o cenário do bug: cria sessão com `VITE_APP_ID` ausente e confirma que `verifySession` aceita o token (`appId` não vazio, `openId`/`name` corretos); e confirma que `verifySession` continua rejeitando cookie ausente. Suíte completa: 69/69 passando. `tsc --noEmit` sem erros. `npm run build` (mesmo comando do Railway) compila sem erros.
- **Branch / PR:** push direto na main.

### [2026-06-30] — Claude Code — Fix: invalid_client no login Google (Railway) — normalização + diagnóstico

- **Contexto:** login Google (§6B) publicado no commit `5b5b4ef` falhava em produção no Railway com `GaxiosError: invalid_client` no `client.getToken(code)`, mesmo após o dono confirmar `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` idênticos, `GOOGLE_CLIENT_SECRET` recriado e redeployado, tipo de OAuth Client "Web application" e redirect URI cadastrado corretamente.
- **O que mudou:**
  - `server/_core/env.ts`: `googleClientId`/`googleClientSecret` agora aplicam `.trim()` sobre `process.env.GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — protege contra espaço/quebra de linha acidental ao colar o valor no painel do Railway (causa mais provável do `invalid_client`, já que o código/versão da lib `google-auth-library` foram auditados e estão corretos).
  - `server/_core/oauth.ts`: log de diagnóstico seguro imediatamente antes de `client.getToken(code)` — `clientIdLength`, `clientIdLast12` (últimos 12 caracteres, não o valor completo), `clientSecretLength`, `clientSecretHasGocspxPrefix` (booleano) e `redirectUri`. **Nunca loga o client secret inteiro.** No `catch` do callback, também loga `error.response?.data` (corpo do erro devolvido pelo Google, ex. `{error: "invalid_client", error_description: "..."}`) para diagnosticar sem precisar adivinhar.
- **Arquivos tocados:** `server/_core/env.ts`, `server/_core/oauth.ts`.
- **Migração de banco?** Não.
- **Testado?** `server/_core/oauth.test.ts` (6 testes) + `server/auth.logout.test.ts` continuam passando. `tsc --noEmit` sem erros. `npm run build` (mesmo comando do Railway) compila sem erros.
- **Próximo passo do dono:** após o deploy, tentar o login de novo e checar os logs do Railway pela linha `[OAuth] Google token exchange debug` — confirmar se `clientIdLength`/`clientSecretLength` batem com o tamanho esperado das credenciais, e se `client.getToken` continuar falhando, o `[OAuth] Google error response data` vai trazer o motivo exato que o Google está devolvendo.
- **Branch / PR:** push direto na main.

### [2026-06-30] — Claude Code — Login próprio (Google Sign-In) — independência §6B

- **O que mudou (HANDOFF_INDEPENDENCIA_MANUS.md §6B — decisão tomada com o dono: trocar auth próprio desde já, antes de mexer em §6/hospedagem):**
  - Descoberta importante ao investigar: a sessão (`server/_core/sdk.ts` — `createSessionToken`/`verifySession`) já era um **JWT próprio** assinado com `JWT_SECRET` (lib `jose`), 100% independente da Manus. Só o **login inicial** dependia do portal OAuth da Manus. Escopo da mudança ficou menor que o handoff estimava.
  - `server/_core/oauth.ts` (`/api/oauth/callback`): trocou `sdk.exchangeCodeForToken`/`sdk.getUserInfo` (Manus) por `OAuth2Client` da lib `google-auth-library` — troca o `code` por tokens do Google, valida o `id_token` (`verifyIdToken`), extrai `sub`/`email`/`name`.
  - **Login restrito ao dono:** como 100% das rotas tRPC do app já usam `adminProcedure` (confirmado por grep — não existe uso real de papel "user"), o callback **rejeita com 403 qualquer e-mail Google diferente de `EMAIL_OWNER`**, antes de criar sessão ou tocar no banco. O e-mail do dono sempre vira `role: "admin"` diretamente (sem depender mais de `OWNER_OPEN_ID`/Manus openId).
  - `client/src/const.ts` (`getLoginUrl`): trocou a URL do portal da Manus (`VITE_OAUTH_PORTAL_URL` + `VITE_APP_ID`) pela URL padrão de autorização do Google (`accounts.google.com/o/oauth2/v2/auth`) com `VITE_GOOGLE_CLIENT_ID`. Fluxo de redirect/state inalterado (mesmo `btoa`/`atob` de antes).
  - `server/_core/env.ts`: novas chaves `googleClientId`, `googleClientSecret` (getters). `emailOwner` (já criado para §3) agora também é o **gate de quem pode logar**.
  - **Não tocado:** `server/_core/sdk.ts` (sessão JWT, `authenticateRequest`, inclusive o branch `CRON_OPEN_ID_PREFIX` usado pelo Heartbeat da Manus — ainda necessário até §5/§2 serem migrados), `server/db.ts` (`upsertUser` já aceitava `role` explícito, nenhuma mudança necessária).
- **Arquivos tocados:** `server/_core/oauth.ts`, `server/_core/env.ts`, `client/src/const.ts`.
- **Migração de banco?** Não.
- **Testado?** `server/_core/oauth.test.ts` (6 testes novos) — cobre: `code`/`state` ausentes, Google não configurado, rejeição de e-mail não-dono (sem tocar `db.upsertUser` nem criar sessão), criação de sessão admin para o dono, `id_token` ausente na resposta do Google, e-mail do dono case-insensitive. Suíte completa: 67/67 passando. `tsc --noEmit` sem erros.
- **PENDENTE-DONO (setup manual no Google Cloud Console, fora do alcance do Claude):**
  1. Criar um projeto (ou usar um existente) em https://console.cloud.google.com/.
  2. "APIs & Services" → "Credentials" → "Create OAuth client ID" → tipo **Web application**.
  3. Em **Authorized redirect URIs**, adicionar `https://<seu-domínio-de-produção>/api/oauth/callback` (e `http://localhost:5173/api/oauth/callback` se for testar local).
  4. Copiar **Client ID** e **Client secret** gerados.
- **Segredos a gerar/configurar:**
  - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (servidor) — do passo acima.
  - `VITE_GOOGLE_CLIENT_ID` (build do client/Vite) — **mesmo valor** do `GOOGLE_CLIENT_ID` (é público, vai no bundle do navegador; o secret nunca vai pro client).
  - `EMAIL_OWNER` — já configurado (reaproveitado de §3); é o único e-mail Google que pode logar.
- **Risco assumido conscientemente:** login agora depende do Google em vez da Manus — troca uma dependência de terceiro por outra, mas o Google é padrão de mercado e não tem relação com a plataforma Manus, então conta como independência real para o objetivo do dono.
- **Branch / PR:** push direto na main.

### [2026-06-30] — Claude Code — E-mail próprio (Resend) — independência §3

- **O que mudou (HANDOFF_INDEPENDENCIA_MANUS.md §3, item 2/7 da ordem de migração):**
  - Novo `server/email.ts`: `sendEmail({ to, subject, html, text })` via SDK `resend`. Cliente lazy/cacheado; retorna `false` (não lança) em falha de entrega.
  - `server/_core/notification.ts`: `notifyOwner({title, content})` manteve **a mesma assinatura pública** (todos os call sites — `schedulePost.ts`, `queueApi.ts`, `approvalHandler.ts`, `_core/systemRouter.ts` — não precisaram mudar), mas o transporte interno trocou do Manus Notification Service (Forge) para `sendEmail`. Removida `buildEndpointUrl` (Forge, morta). Destinatário resolvido por `settings.approval_email` → fallback `EMAIL_OWNER`; se nenhum estiver configurado, lança `TRPCError`. Conteúdo vai como texto puro (`text`) e como HTML escapado em `<pre>` (`html`) para evitar quebra de marcação.
  - `server/_core/env.ts`: novas chaves `resendApiKey`, `emailFrom`, `emailOwner` (getters, mesmo padrão de `queueApiToken`, para permitir override em testes).
- **Arquivos tocados:** `server/email.ts` (novo), `server/_core/notification.ts`, `server/_core/env.ts`.
- **Migração de banco?** Não.
- **Testado?** `server/email.test.ts` (5 testes) + `server/_core/notification.test.ts` (6 testes) — cobre: faltar `RESEND_API_KEY`/`EMAIL_FROM`, envio OK, erro do provedor, exceção de rede, prioridade `approval_email` > `EMAIL_OWNER`, ausência total de destinatário, escape de HTML. Suíte completa: `./node_modules/.bin/vitest run` — 61/61 passando. `tsc --noEmit` sem erros.
- **PENDENTE-DONO:** gerar `RESEND_API_KEY` (resend.com) e configurar `EMAIL_FROM` (domínio verificado no Resend) e, se não usar a tela de configurações para `approval_email`, `EMAIL_OWNER` — ver lista completa de segredos no final desta entrada e na próxima.
- **Branch / PR:** ainda não commitado — pendente de push (ver entrada de login acima, que foi commitada isoladamente a pedido do dono).

### [2026-06-30] — Claude Code — LLM próprio (OpenAI) — independência §4

- **O que mudou (HANDOFF_INDEPENDENCIA_MANUS.md §4, item 1/7 da ordem de migração):**
  - Novo `server/llm.ts`: `chatComplete({ system, user, model, jsonSchema })` via SDK `openai`, com suporte a `response_format: json_schema` (mesmo contrato usado pela geração de legenda). Cliente lazy/cacheado.
  - `server/caption.ts` (`generateCaption`): trocou `invokeLLM` (Forge, `server/_core/llm.ts`) por `chatComplete`. Assinatura pública de `generateCaption(theme)` inalterada — `schedulePost.ts`, `queueApi.ts`, `engine.ts` não precisaram mudar. Removido `DEFAULT_MODEL` hardcoded — default agora vem de `ENV.llmModel` (`LLM_MODEL`, padrão `gpt-4o-mini`) dentro de `chatComplete`; `settings.llm_model` continua tendo prioridade quando configurado.
  - `server/_core/env.ts`: novas chaves `openaiApiKey`, `llmModel` (getters).
  - `server/_core/llm.ts` (Forge) **não foi alterado nem removido** — ficou sem uso (só era consumido por `caption.ts`); decisão de remover fica para depois de confirmar que nada mais depende dele.
- **Arquivos tocados:** `server/llm.ts` (novo), `server/caption.ts`, `server/_core/env.ts`.
- **Migração de banco?** Não.
- **Testado?** `server/llm.test.ts` (5 testes) + `server/caption.test.ts` (4 testes) — cobre: falta de `OPENAI_API_KEY`, mensagens system/user corretas, override de model, `response_format` json_schema estrito, conteúdo vazio, parsing de JSON/fallback para texto cru. Suíte completa: 61/61 passando.
- **PENDENTE-DONO:** gerar `OPENAI_API_KEY` (platform.openai.com) — ver lista completa de segredos abaixo.
- **Segredos a gerar (§8 do handoff, cobertos por estas duas entradas):**
  - `OPENAI_API_KEY` — geração de legenda de IA.
  - `RESEND_API_KEY` + `EMAIL_FROM` (domínio verificado no Resend) — envio de e-mail (notificações + aprovação por link).
  - Opcional: `LLM_MODEL` (default `gpt-4o-mini`) e `EMAIL_OWNER` (fallback de destinatário; pode usar `settings.approval_email` no painel em vez disso).
  - Ainda **não** geramos/usamos `GOOGLE_SA_JSON`, `DRIVE_FOLDER_ID`, `META_IG_ACCESS_TOKEN` — esses são do §2 (executor Node), próxima etapa da ordem combinada com o dono.
- **Branch / PR:** ainda não commitado — pendente de push.

### [2026-06-30] — Claude Code — Aprovação de legenda por link no e-mail (Opção B1)

- **O que mudou:**
  - `runPostHandler` (Regra 3): ao gerar legenda de IA, gera `approvalToken` (32 bytes hex = 64 chars), persiste com `approvalEmailSentAt`, e envia e-mail via `notifyOwner` com **legenda completa + links APROVAR/REPROVAR** apontando para a página intermediária de confirmação.
  - Novo `server/approvalHandler.ts`: endpoint público `GET /api/approval/:postId/:token?decision=approve|reject` — valida token contra `posts.approvalToken` e `status="Aguardando Aprovação"`, aplica decisão, **limpa `approvalToken` (uso único)**, redireciona para `/aprovacao?status=...`.
  - Proteção contra pré-fetch de e-mail: os links do e-mail apontam para `/aprovacao/confirmar?...` (página React que só exibe), e o botão nessa página navega para `/api/approval/...` (ação real). Assim, scanners de e-mail que fazem GET automático veem apenas a página de confirmação, não executam a ação.
  - `server/_core/env.ts`: novo campo `publicBaseUrl` (env `PUBLIC_BASE_URL`) para construir os links absolutos.
  - `server/_core/index.ts`: monta `GET /api/approval/:postId/:token` antes do fallthrough do Vite.
  - `client/src/pages/ApprovalConfirm.tsx` (novo): rota pública `/aprovacao/confirmar` — lê `postId`, `token`, `decision` da URL, mostra botão de confirmação.
  - `client/src/pages/ApprovalResult.tsx` (novo): rota pública `/aprovacao` — mostra resultado (aprovado / reprovado / link inválido) baseado em `?status=` e `?file=`.
  - `client/src/App.tsx`: adiciona rotas `/aprovacao/confirmar` e `/aprovacao` (sem DashboardLayout — páginas públicas).
  - `server/approvalHandler.test.ts` (novo): 7 testes (aprovar, reprovar, token inválido, já usado, post status errado, decisão inválida, idempotência).
- **Arquivos tocados:** `server/_core/env.ts`, `server/schedulePost.ts`, `server/approvalHandler.ts` (novo), `server/approvalHandler.test.ts` (novo), `server/_core/index.ts`, `client/src/pages/ApprovalConfirm.tsx` (novo), `client/src/pages/ApprovalResult.tsx` (novo), `client/src/App.tsx`, `CHANGELOG_COLABORACAO.md`.
- **Por quê:** `notifyOwner` é mão única — dono recebia "legenda gerada" sem legenda nem link de aprovação, travando o post em "Aguardando Aprovação" para sempre.
- **Migração de banco?** Não — `approvalToken` e `approvalEmailSentAt` já existem no schema desde a criação do projeto.
- **PENDENTE-MANUS (1):** Setar env `PUBLIC_BASE_URL=https://cyberpost.manus.space` em produção. Sem isso, os links de aprovação no e-mail ficam incompletos (iniciam com `/`).
- **PENDENTE-MANUS (2):** Verificar que as colunas `approvalToken` e `approvalEmailSentAt` existem no banco de produção (schema original). Se não existirem, gerar migração.
- **Branch / PR:** push direto na main.
- **Testado?** `./node_modules/.bin/vitest run` — 40 testes passando.

### [2026-06-30] — Claude Code — Disparo no horário exato (Opção B — Heartbeat por post)

- **O que mudou:**
  - Nova coluna `posts.scheduleCronTaskUid varchar(65)` + índice: identifica o Heartbeat cron daquele post no disparo.
  - `server/schedulePost.ts` (novo): `scheduledAtToCron(ms)` converte UTC ms → expressão cron 6-campos UTC; `schedulePostJob` cria Heartbeat; `cancelPostJob` remove; `runPostHandler` é o handler do callback.
  - Handler `/api/scheduled/runPost` (Heartbeat, autenticado por `sdk.authenticateRequest`):
    - Localiza post por `user.taskUid` (nunca por body).
    - Auto-deleta o cron após disparar (comportamento one-shot).
    - **Regra 3** (mode=aprovar/auto, sem legenda manual): gera legenda de IA inline (LLM embutido), marca `Aguardando Aprovação`, notifica dono.
    - **Regras 1+2** (legenda manual presente ou mode=manual): registra log "liberado para executor" — o executor Manus verifica a imagem e publica.
  - `server/routers/posts.ts`: `create` e `update` chamam `schedulePostJob` se `scheduledAt` é futuro; `remove` e `reactivate` chamam `cancelPostJob`. Erros de scheduling são absorbed (try/catch), não quebram a mutation.
  - `server/_core/index.ts`: monta `app.post("/api/scheduled/runPost", runPostHandler)`.
  - `server/schedulePost.test.ts` (novo): 9 testes (timezone, 3 regras de negócio, ciclo de vida, idempotência).
  - `drizzle/0003_schedule_uid.sql`: migração SQL pronta para aplicar.
- **Arquivos tocados:** `drizzle/schema.ts`, `drizzle/0003_schedule_uid.sql`, `server/db.ts`, `server/schedulePost.ts` (novo), `server/schedulePost.test.ts` (novo), `server/routers/posts.ts`, `server/_core/index.ts`, `CHANGELOG_COLABORACAO.md`.
- **Por quê:** pedido do dono via `SPEC — Disparo no horário exato do post (Opção B) + regras de fluxo.md`. Posts agendados para 04:00 eram "percebidos" só às 08:00 pelo cron diário.
- **Migração de banco?** Sim — arquivo `drizzle/0003_schedule_uid.sql`:
  ```sql
  ALTER TABLE `posts` ADD `scheduleCronTaskUid` varchar(65);
  CREATE INDEX `posts_schedule_uid_idx` ON `posts` (`scheduleCronTaskUid`);
  ```
- **Arquitetura Heartbeat (por que não AGENT cron):** O SDK `createHeartbeatJob` CAN be chamado do código do servidor → Heartbeat por post ✅. AGENT crons só podem ser criados via `schedule` tool da sessão Manus (não do código do servidor) — §4b do reference. O Heartbeat dispara no horário exato e executa a lógica do cérebro (Regra 3: IA inline). Para Regras 1+2 (Drive + Instagram), o braço (executor Python) ainda é necessário.
- **PENDENTE-MANUS (1):** Aplicar migração `drizzle/0003_schedule_uid.sql` em produção.
- **PENDENTE-MANUS (2):** Para posts com legenda manual, o Heartbeat libera o post às scheduledAt mas o executor ainda roda Ter/Qui. Para posting verdadeiramente no horário, aumentar frequência do executor (ex: a cada 30 min) OU criar um AGENT cron por post após o Manus agendar cada post. Avaliar custo x benefício com o dono.
- **Branch / PR:** push direto na main.
- **Testado?** `./node_modules/.bin/vitest run` — 32/32 testes passando (23 anteriores + 9 novos).

### [2026-06-30] — Claude Code — Multi-conta Instagram (completo) + fix toast

- **O que mudou:**
  - Nova tabela `accounts`: id, name, handle, igUserId, platform (enum instagram), isDefault, active, createdAt, updatedAt.
  - Coluna `accountId` (nullable int) em `posts` — nulo = usa a conta `isDefault`.
  - `GET /api/queue/next` retorna objeto `account: {id, name, handle, igUserId}` completo (resolve accountId ou default account).
  - Novo tRPC router `accounts` (list/create/update/setDefault/remove).
  - Funções `db.ts`: listAccounts, getAccount, getDefaultAccount, createAccount, updateAccount, setDefaultAccount, deleteAccount.
  - UI: nova página `/accounts` (Contas Instagram) na sidebar — lista, cria, edita, remove e define conta padrão (★).
  - `Calendar.tsx`: seletor de conta no form + coluna "Conta" na tabela.
  - `instagram_automation.py`: `resolve_instagram_server(account)` roteia para o servidor MCP correto por `igUserId`; retrocompatível sem contas.
  - Fix toast: texto "será publicado na próxima execução do robô" (sem "(Ter/Qui)").
- **Arquivos tocados:** `drizzle/schema.ts`, `drizzle/0002_multi_conta.sql`, `server/db.ts`, `server/routers/accounts.ts`, `server/routers.ts`, `server/routers/posts.ts`, `server/queueApi.ts`, `client/src/pages/Calendar.tsx`, `client/src/pages/Accounts.tsx` (novo), `client/src/App.tsx`, `client/src/components/DashboardLayout.tsx`, `instagram_automation.py`.
- **Migração de banco?** Sim — arquivo `drizzle/0002_multi_conta.sql` gerado. SQL exato:
  ```sql
  CREATE TABLE `accounts` (
    `id` int AUTO_INCREMENT NOT NULL,
    `name` varchar(128) NOT NULL,
    `handle` varchar(128),
    `igUserId` varchar(128),
    `platform` enum('instagram') NOT NULL DEFAULT 'instagram',
    `isDefault` boolean NOT NULL DEFAULT false,
    `active` boolean NOT NULL DEFAULT true,
    `createdAt` timestamp NOT NULL DEFAULT (now()),
    `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
  );
  ALTER TABLE `posts` ADD `accountId` int;
  ```
- **PENDENTE-MANUS (1):** Aplicar a migração acima no banco de produção (TiDB/MySQL). Pode rodar o SQL diretamente ou via `DATABASE_URL=... pnpm drizzle-kit migrate`.
- **PENDENTE-MANUS (2):** Verificar suporte a múltiplas contas no conector de Instagram do Manus; conectar a 2ª conta; atualizar `server_map` em `instagram_automation.py` com `{igUserId: "nome-servidor-mcp"}`.
- **PENDENTE-MANUS (3):** Após deploy, cadastrar a(s) conta(s) na nova tela "Contas Instagram" no painel (`/accounts`), preencher o igUserId e marcar a conta principal como padrão (★).
- **Branch / PR:** push direto na main.
- **Testado?** `./node_modules/.bin/vitest run` — 23/23 testes passando.

### [2026-06-30] — Claude Code — Preparação para deploy no Railway
- `railway.json` adicionado + `GET /api/health`. Deploy via git push após configuração inicial.
- **Testado?** 23/23 testes. Deploy pendente (Manus).

### [2026-06-30] — Claude Code — Botão "Postar agora" + fix timezone + agendamento livre
- `posts.postNow` (tRPC): seta `scheduledAt=now`, `status=Pendente`. Botão ⚡ no Calendário.
- `shared/timezone.ts`: utilitários `toSaoPauloInput`, `parseSaoPauloInput`, `formatSaoPaulo` — fix de horas dependentes do fuso do browser.
- Fix: `ENV.queueApiToken` como getter (evitava snapshot em testes).
- **Testado?** 23/23 testes.

### [2026-06-30] — Manus — Merge dos PRs + validação do fluxo de aprovação + operacionalização
- Merge de `feat/post-now` e `feat/free-scheduling` na main (conflitos resolvidos pelo Manus).
- Endpoint `POST /api/queue/generate-caption` adicionado (gera legenda de IA sob demanda).
- App publicado em `cyberpost.manus.space`. Cron diário (08h SP) + executor Ter/Qui registrados.
- Publicação real confirmada: https://www.instagram.com/p/DaMdQvljthA/
- A planilha Google Sheets foi **aposentada** — banco do app é a fonte única.

### [2026-06-30] — Manus — Projeto inicial
- Criação do app (React + Express + tRPC + Drizzle), executor Python, `DEVELOPER_GUIDE.md`. Schema inicial criado.
