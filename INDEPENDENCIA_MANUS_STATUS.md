# Independência da Manus — Status

> Documenta o que foi migrado a pedido do dono a partir de `HANDOFF_INDEPENDENCIA_MANUS.md`
> (documento original, fora do repo). Leia também `CHANGELOG_COLABORACAO.md` para o histórico
> completo entrada por entrada.

## Objetivo

Parar de depender da plataforma Manus (créditos de agente, LLM, notificação, executor Python,
Heartbeat, OAuth) mantendo o app funcionando 100%. Hospedagem migrada para **Railway**
(`cyberpost-manus-production.up.railway.app`), banco MySQL do próprio Railway.

## Status por peça

| # | Peça | Status | Substituído por |
|---|---|---|---|
| §6B | Login | ✅ Concluído | Google Sign-In (OAuth2 direto com o Google) |
| §6 | Hospedagem + banco | ✅ Concluído | Railway (always-on) + MySQL do Railway |
| §4 | LLM (legenda de IA) | ✅ Código publicado, falta env var | OpenAI (`openai` SDK) |
| §3 | E-mail (notificações + aprovação) | ✅ Código publicado, falta env var | Resend (`resend` SDK) |
| §2 | Executor (Drive + Instagram) | ✅ Código publicado, falta credenciais | Node próprio (Service Account + Graph API) |
| §5 | Cron (disparo no horário exato) | ✅ Código publicado, falta credenciais | Worker in-process (`setInterval`, sem Heartbeat) |
| — | Configuração de conta Instagram/Meta no painel | ✅ Concluído | Tela `/accounts` — token, status, teste de conexão |
| §6B (storage) | Upload/URL pública das imagens | ⏸️ Mantido de propósito | Continua no Forge (S3) da Manus — decisão consciente, fora de escopo por ora |

## Arquitetura — antes e depois

**Antes:** app (cérebro) na Manus + script Python (braço, Drive/Instagram/e-mail) + Heartbeat da
Manus (disparo no horário) + Forge (LLM/notificação/storage) + OAuth portal da Manus (login).

**Depois:** app roda sozinho no Railway. Um **worker in-process** (`server/executorWorker.ts`,
`setInterval` de 60s) substitui o Heartbeat E o script Python ao mesmo tempo — ele mesmo lê o
Drive, gera legenda via OpenAI, publica no Instagram via Graph API, e notifica por e-mail via
Resend. Login é Google Sign-In direto. Só o **storage de imagens continua no Forge da Manus**
(decisão explícita do dono, ver tabela acima).

## Arquivos novos (por peça)

- **Login (§6B):** mudanças em `server/_core/oauth.ts` (callback trocado pra `OAuth2Client` do
  Google), `client/src/const.ts` (`getLoginUrl`), `server/_core/sdk.ts` (sessão JWT ganhou
  `loginMethod` opcional).
- **LLM (§4):** `server/llm.ts` (`chatComplete`), usado por `server/caption.ts`.
- **E-mail (§3):** `server/email.ts` (`sendEmail`), usado por `server/_core/notification.ts`
  (`notifyOwner` manteve a mesma assinatura pública).
- **Executor + cron (§2+§5):** `server/googleDrive.ts` (leitura do Drive via Service Account),
  `server/instagramGraph.ts` (publicação via Meta Graph API), `server/executor.ts`
  (`runExecutionForPost` — aplica as 3 regras do dono), `server/executorWorker.ts`
  (`startExecutorWorker`, hookado em `server/_core/index.ts`).
- **Compartilhado (extraído para evitar duplicação):** `db.resolvePostAccount` (`server/db.ts`,
  reusado por `queueNextHandler` legado e pelo executor novo), `triggerAiApprovalFlow`
  (`server/schedulePost.ts`, reusado por `runPostHandler` legado — Heartbeat — e pelo executor
  novo).
- **Configuração de conta Instagram/Meta no painel:** `client/src/pages/Accounts.tsx` (seção
  "Conexão Meta" — campo de token `password`, botões Salvar/Remover/Testar conexão, card de
  status), `server/routers/accounts.ts` (`metaStatus`, `saveMetaToken`, `removeMetaToken`,
  `testMetaConnection`), `server/_core/trpc.ts` (novo `ownerProcedure`, exige
  `ctx.user.email === EMAIL_OWNER` além de `role === "admin"`), `server/instagramGraph.ts`
  (`testInstagramConnection` — `GET` somente-leitura, nunca publica), `server/db.ts`
  (`getSettingMeta`, `deleteSetting`).

## O que foi mantido de propósito (não removido)

- `server/storage.ts` — upload/URL pública ainda via Forge S3 da Manus.
- `server/queueApi.ts` (`/api/queue/*`) e `server/schedulePost.ts` (`runPostHandler`, criação de
  Heartbeat) — código **intocado**, dormente. Se o executor Python / Heartbeat da Manus continuar
  rodando por engano, não quebra nada (idempotente — quem chegar primeiro processa, o outro acha
  o post já em outro status). Serve de rede de segurança até o dono confirmar que o worker novo
  funciona de ponta a ponta e desativar manualmente o agendamento do lado da Manus.

## Segredos/configuração necessários no Railway

| Variável | Para quê | Status |
|---|---|---|
| `OPENAI_API_KEY` | Geração de legenda de IA (§4) | **Pendente** |
| `RESEND_API_KEY` + `EMAIL_FROM` | Envio de e-mail (§3) | **Pendente** |
| `EMAIL_OWNER` | Destinatário de notificação + único e-mail que pode logar (§6B + §3) | Configurado |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Login Google (§6B) | Configurado |
| `VITE_GOOGLE_CLIENT_ID` | Login Google, build do client (§6B) | Configurado |
| `JWT_SECRET` | Assinatura da sessão | Configurado |
| `DATABASE_URL` | Banco MySQL do Railway | Configurado |
| `GOOGLE_SA_JSON` | Service account pro Drive (§2) | **Pendente** |
| `DRIVE_FOLDER_ID` | ID (não nome) da pasta `CybersecCAST` no Drive (§2) | **Pendente** |
| `PUBLIC_BASE_URL` | URL pública do app (aprovação por e-mail + Instagram precisam) | Confirmar que está setada |

**Não são env vars — já existem em `settings`/`accounts`, editáveis pelo painel:**
`meta_access_token` (token long-lived do Meta) e `igUserId` da conta padrão — **agora
configuráveis diretamente pela tela `/accounts`** (seção "Conexão Meta": campo de token +
botões Salvar/Remover/Testar conexão). Antes desta atualização, não havia UI funcional para
salvar o token — só um placeholder somente-leitura em `/integrations`.

Opcional: `LLM_MODEL` (default `gpt-4o-mini`).

## Passo a passo pendente do dono

1. Gerar `OPENAI_API_KEY` (platform.openai.com) e `RESEND_API_KEY` (resend.com) — setar no
   Railway e testar geração de legenda + e-mail de aprovação.
2. Google Cloud → IAM → Service Accounts → criar uma nova, habilitar a Drive API, baixar a chave
   JSON, compartilhar a pasta `CybersecCAST` do Drive com o e-mail da service account.
3. Pegar o ID da pasta do Drive (não o nome) e setar `GOOGLE_SA_JSON` + `DRIVE_FOLDER_ID` no
   Railway.
4. Em `/accounts`: confirmar/cadastrar a conta CybersecCAST com o `igUserId`, colar o token do
   Meta no campo "Meta Access Token" → Salvar token → clicar em "Testar conexão Meta" e conferir
   que retorna sucesso antes de testar publicação real.
5. Testar publicação real com um post de teste (legenda manual + imagem no Drive), confirmar que
   vira "Postado" com permalink.
6. Só depois de tudo confirmado: desativar manualmente o executor Python + Heartbeat do lado da
   Manus (não é código deste repo).

## Histórico de commits desta migração

```
5b5b4ef feat: login próprio com Google Sign-In, substituindo o portal OAuth da Manus
1f94d6b fix: normaliza GOOGLE_CLIENT_ID/SECRET e adiciona diagnóstico seguro no login Google
7b1f899 fix: sessão do login Google era rejeitada por appId vazio no JWT
464f7a8 fix: login Google entrava em loop por sync legado do OAuth da Manus
6bc357b feat: LLM próprio (OpenAI) e e-mail próprio (Resend), substituindo Forge/Manus
56e1763 feat: executor próprio (Drive + Instagram) e worker in-process, substituindo o script Python e o Heartbeat da Manus
d9949d4 chore: formatação prettier (sem mudança funcional)
f459b12 docs: status completo da migração de independência da Manus
f4b11c3 feat: configuração de conta Instagram/Meta no painel (token, status, teste de conexão)
```

## Testes

103/103 passando (`./node_modules/.bin/vitest run`), `tsc --noEmit` e `npm run build` limpos em
todos os commits acima. Detalhes de cobertura de cada peça estão nas entradas correspondentes do
`CHANGELOG_COLABORACAO.md`.
