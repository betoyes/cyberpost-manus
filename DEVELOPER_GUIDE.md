# CybersecCAST AutoPost — Guia do Desenvolvedor (Handoff para IA / Devs)

> **Leia este documento por inteiro antes de editar qualquer arquivo.** Ele descreve a arquitetura real, as regras de negócio que **não podem ser quebradas**, e as armadilhas mais comuns. O objetivo é permitir que outra IA ou desenvolvedor faça ajustes sem "sujar" ou quebrar o sistema.
>
> Colaboração Manus encerrada — histórico em `arquivo/CHANGELOG_COLABORACAO.md`.
> Contexto atual: `HANDOFF-BRIDGE.md`.

---

## 0. TL;DR (o mínimo que você precisa saber)

- Stack: **React 19 + Vite + Tailwind 4** (frontend) · **Express 4 + tRPC 11 + Drizzle ORM (MySQL do Railway)** (backend) · **login Google** (Google Sign-In). Processo **único Node.js**, hospedado no Railway.
- O executor é um **worker in-process** (`server/executorWorker.ts`, tick de 60s) no mesmo processo do app: ele mesmo lê o Drive, publica no Instagram e notifica por e-mail.
- O app é a **fonte única de verdade** (banco de dados). A planilha Google Sheets foi **aposentada** — não reintroduza dependência dela.
- **Regra sagrada:** legenda **manual** posta direto; legenda de **IA** só vai ao ar **após aprovação por e-mail**. Sem legenda válida → **"Fluxo Parado"** (nunca publicar).
- Há rotas HTTP **fora do tRPC** (cron + fila), em `server/_core/index.ts`. Não as mova sem entender o porquê.
- Sempre rode `npm test` antes de entregar. **119 testes** vitest em `server/*.test.ts`.

---

## 1. Arquitetura

- Um **worker in-process** (`server/executorWorker.ts`, `setInterval` de 60s) lê o Drive (`server/googleDrive.ts`), publica via Meta Graph API (`server/instagramGraph.ts`) e notifica por e-mail via Resend (`server/email.ts`).
- Ponte JOBS via `/api/bridge/*` (`server/bridgeApi.ts`) — contrato e contexto em `HANDOFF-BRIDGE.md`.
- `/api/queue/*` + Heartbeat = **legado dormente**, mantido de propósito como rede de segurança até o P0 (ver `ROADMAP_MELHORIAS.md` 3.2). Não está vivo, mas não remova por ora.

---

## 2. Stack e estrutura de arquivos (o que você pode/não pode tocar)

```
client/src/
  pages/                  ← Home, Calendar, Accounts, Integrations, Logs, Settings
  pages/ApprovalConfirm   ← Pág. pública /aprovacao/confirmar (anti-prefetch de e-mail)
  pages/ApprovalResult    ← Pág. pública /aprovacao (resultado da aprovação por link)
  components/ui/          ← shadcn/ui — não reescrever; reutilizar
  App.tsx                 ← Registro de rotas
  index.css               ← Tema dark (preserve @layer base)
drizzle/
  schema.ts               ← Tabelas e tipos (mudanças exigem migração — ver §7)
server/
  _core/                  ← Infra (oauth Google, vite, sdk, env) — não editar sem necessidade
  _core/index.ts          ← Bootstrap Express + MAPA DE ROTAS (cron/fila/approval/bridge aqui)
  db.ts                   ← Camada de acesso a dados
  engine.ts               ← REGRAS DE NEGÓCIO (prioridade de legenda) — núcleo
  executor.ts             ← Publicação de um post (side effects: Drive → Instagram)
  executorWorker.ts       ← Worker in-process (tick de 60s) que dispara o executor
  googleDrive.ts          ← Leitura do Drive via Service Account
  instagramGraph.ts       ← Publicação via Meta Graph API
  bridgeApi.ts            ← Ponte JOBS (POST /api/bridge/post, GET /api/bridge/status/:id)
  email.ts                ← Envio de e-mail via Resend
  llm.ts                  ← LLM via OpenAI (usado por caption.ts)
  caption.ts              ← Geração de legenda por IA
  scheduled.ts            ← Handler do cron diário
  schedulePost.ts         ← triggerAiApprovalFlow (vivo) + caminho Heartbeat (legado dormente)
  approvalHandler.ts      ← Endpoint público GET /api/approval/:postId/:token
  queueApi.ts             ← Endpoints /api/queue/* (LEGADO DORMENTE)
  routers.ts              ← Composição tRPC
  routers/posts.ts        ← CRUD do calendário
  routers/accounts.ts     ← CRUD de contas Instagram + Conexão Meta
  routers/config.ts       ← Settings + logs
  *.test.ts               ← Testes vitest (119 — mantenha passando)
instagram_automation.py   ← Executor Python (LEGADO DORMENTE — não roda no servidor)
DEVELOPER_GUIDE.md        ← Este documento
```

> Tudo sob `server/_core/` é nível de framework. Evite editar a menos que esteja estendendo a infraestrutura conscientemente.

---

## 3. Regras de negócio que NÃO podem ser quebradas

Estas regras são a razão de existir do sistema. Qualquer alteração que as viole é um bug, mesmo que o código compile.

### 3.1. Prioridade de legenda (`server/engine.ts` → `resolveCaption`)

1. **Legenda manual** (`captionManual` preenchida) → sempre vence, posta direto.
2. **Legenda de IA** (`captionAi`) → só é usada se `captionApproved === true`.
3. Caso contrário → **`halt`** (vira status "Fluxo Parado"). **Nunca publicar.**

### 3.2. Aprovação por e-mail (`interpretApprovalReply`)

- Aprovar: `aprovado`, `sim`, `yes`. Reprovar: `reprovado`, `não`, `nao`, `no`. Match por token, case-insensitive.
- Aprovar → `captionApproved=true`, status volta a `Pendente` (re-entra na fila).
- Reprovar → status `Fluxo Parado`.

### 3.3. Semântica da fila (sutil, mas crítica — `server/db.ts`)

| Helper | Quem usa | Quais status considera |
| --- | --- | --- |
| `getOldestDuePost` | Cron diário (cérebro) | `Pendente`, `Erro: Imagem Ausente`, `Aguardando Aprovação` |
| `getNextReadyToExecute` | Executor (`/api/queue/next`) | **Apenas** `Pendente` e `Erro: Imagem Ausente` |

Ou seja: o cron "enxerga" posts aguardando aprovação (para gerenciar estado), mas o executor **nunca recebe** um post `Aguardando Aprovação` ou `Fluxo Parado`. Não unifique essas duas funções.

### 3.4. Bloqueio não avança a fila

- `Erro: Imagem Ausente` e `Fluxo Parado` **travam** o post na frente da fila. O sistema **não pula** para o próximo até o bloqueio ser resolvido. Isso é intencional (evita publicar fora de ordem).
- Alerta de imagem ausente é reenviado a cada **6 horas** (`MISSING_ALERT_INTERVAL_MS`).

### 3.5. Idempotência

- O cron pode rodar várias vezes sem duplicar postagem. O estado "pronto" é uma flag que o executor vira para `Postado` via callback. Mantenha essa propriedade ao mexer no fluxo.

---

## 4. Mapa de rotas HTTP (atenção: nem tudo é tRPC)

Definido em `server/_core/index.ts`:

| Método/Rota | Auth | Função |
| --- | --- | --- |
| `POST /api/scheduled/cron30` | Cookie de cron (Heartbeat) | **Legado dormente** — rotina diária do cérebro (`cron30Handler`) |
| `POST /api/scheduled/runPost` | Cookie de cron (Heartbeat por post) | **Legado dormente** — disparo no horário exato |
| `GET /api/approval/:postId/:token` | Nenhuma (token na URL) | Aprovação/reprovação de legenda por link no e-mail |
| `POST /api/bridge/post` | Bearer `BRIDGE_API_TOKEN` | Ponte JOBS: cria post já-aprovado com imagem em URL pública |
| `GET /api/bridge/status/:id` | Bearer `BRIDGE_API_TOKEN` | Ponte JOBS: status/logs de um post |
| `GET /api/queue/next` | Bearer `QUEUE_API_TOKEN` | **Legado dormente** — próxima ordem pro executor Python |
| `POST /api/queue/report` | Bearer `QUEUE_API_TOKEN` | **Legado dormente** — callback de resultado do executor Python |
| `POST /api/queue/approval` | Bearer `QUEUE_API_TOKEN` | **Legado dormente** — decisão de aprovação lida do e-mail |
| `POST /api/queue/generate-caption` | Bearer `QUEUE_API_TOKEN` | **Legado dormente** — legenda de IA sob demanda |
| `/api/trpc/*` | Sessão de usuário (admin) | CRUD do calendário, contas, settings, logs, auth |

> **Armadilha comum:** procurar a lógica de cron/fila/ponte dentro de `routers.ts`. Ela **não está lá** — está nas rotas Express acima. Se mover essas rotas, o worker e a ponte param de funcionar.

### Contratos da fila (legado dormente)

Contratos completos em `server/queueApi.ts`; o contrato da ponte JOBS está em `HANDOFF-BRIDGE.md`.

---

## 5. Modelo de dados (`drizzle/schema.ts`)

Tabela principal **`posts`** (campos-chave):

| Campo | Tipo | Observação |
| --- | --- | --- |
| `filename` | varchar | Nome da arte na pasta CybersecCAST do Drive (precisa bater exatamente) |
| `theme` | text | Tema/palavras-chave para a IA |
| `mode` | enum `manual`/`aprovar`/`auto` | `auto` é alias de `aprovar` — **ambos exigem aprovação** |
| `status` | enum | Strings EXATAS em português: `Pendente`, `Postado`, `Aguardando Aprovação`, `Erro: Imagem Ausente`, `Fluxo Parado` |
| `scheduledAt` | bigint (unix ms UTC) | Sempre UTC; converter para local só na UI |
| `captionManual` / `captionAi` | text | Ver regra de prioridade §3.1 |
| `captionApproved` | boolean | Só `true` após aprovação por e-mail |
| `imageUrl` / `imageStorageKey` | varchar | Referência da mídia (S3/storage), nunca bytes no banco |
| `instagramId` / `permalink` | varchar | Preenchidos após postar |
| `lastMissingAlertAt` | bigint | Cadência do alerta de 6h |

Outras tabelas: **`users`** (auth + `role` admin/user), **`settings`** (key/value: tokens, e-mail de aprovação, modelo LLM, etc.), **`activity_logs`** (observabilidade).

> **Não altere as strings de `status`** sem atualizar TODAS as comparações em `engine.ts`, `db.ts`, `scheduled.ts`, `queueApi.ts` e `routers/posts.ts`. Elas são comparadas como literais.

---

## 6. `instagram_automation.py`

Script legado do ambiente Manus, **dormente**; não roda no servidor.
Rede de segurança até o P0 (ver §1 e ROADMAP 3.2).

---

## 7. Como fazer mudanças com segurança

### Mudança de schema (Drizzle)
1. Edite `drizzle/schema.ts`.
2. `npm run db:push` (drizzle-kit generate + migrate contra o MySQL do Railway) — passo **manual**, migrações NÃO rodam no boot.
3. Leia o `.sql` gerado antes de aplicar. Mantenha schema e banco em sincronia. **Cuidado com comandos destrutivos** — dados não são recuperáveis.

### Mudança de frontend
- Reutilize componentes `shadcn/ui` em `client/src/components/ui`. Não reescreva do zero.
- Tema é dark por padrão (`ThemeProvider defaultTheme="dark"`). Use tokens CSS de `index.css`; ao usar `bg-{semantic}` use também `text-{semantic}-foreground`.
- Não coloque imagens/mídia em `client/public` ou `client/src/assets` (causa timeout de deploy). Use storage/URLs externas.

### Mudança de backend
- Lógica de negócio nova vai em `engine.ts` (puro, testável) sempre que possível; side-effects (Drive/IG/Gmail) ficam no executor.
- Toda LLM call usa os helpers de `server/_core/llm.ts` (credenciais injetadas). Nunca exponha chave no frontend.

---

## 8. Rodar localmente / testar

```bash
npm install
npm test           # vitest (119 testes) — DEVE passar antes de qualquer entrega
npm run build      # vite + esbuild
npm run dev        # sobe o servidor de desenvolvimento (Vite + Express)
```

- `pnpm` não está no PATH desta máquina — use `npm run` (que resolve os binários de `node_modules/.bin`).
- O servidor escolhe a porta por `process.env.PORT` (não hardcode porta).
- Ao mudar regras de negócio, **atualize/adicione testes** em `server/*.test.ts`.

---

## 9. Variáveis de ambiente / segredos

Setadas no Railway (não commitar `.env`). Lista canônica + passo a passo do que falta: **`HANDOFF-BRIDGE.md` §"Chaves que o Beto precisa setar"**. Resumo:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão MySQL do Railway |
| `JWT_SECRET` | Assinatura do cookie de sessão |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `VITE_GOOGLE_CLIENT_ID` | Login Google |
| `EMAIL_OWNER` | Único e-mail que loga + destinatário de notificações |
| `OPENAI_API_KEY` (+ `LLM_MODEL` opcional) | Legenda de IA |
| `RESEND_API_KEY` + `EMAIL_FROM` | E-mail (notificações + aprovação) |
| `GOOGLE_SA_JSON` + `DRIVE_FOLDER_ID` | Drive via Service Account (fluxo por filename) |
| `BRIDGE_API_TOKEN` | Bearer token da ponte JOBS (`/api/bridge/*`) |
| `ALLOWED_IMAGE_HOSTS` (opcional) | Allowlist de hosts de imagem da ponte |
| `PUBLIC_BASE_URL` | URL pública do app — links de aprovação por e-mail |
| `QUEUE_API_TOKEN` | Legado dormente (`/api/queue/*`) |

> Se mudar o `BRIDGE_API_TOKEN`, atualize-o **dos dois lados**: no Railway e no `_Jobs/config/config.json`. Caso contrário a ponte retorna `401`.

---

## 10. Armadilhas frequentes (faça / não faça)

- **NÃO** reintroduza a planilha Google Sheets como fonte de verdade. O banco do app é a fonte única.
- **NÃO** mova as rotas `/api/scheduled/*` e `/api/queue/*` para dentro do tRPC.
- **NÃO** altere as strings literais de `status` sem varrer todo o código.
- **NÃO** faça o executor publicar legenda de IA sem `captionApproved=true`.
- **NÃO** publique conteúdo de usuário falso (reviews/ratings) — política de conteúdo.
- **FAÇA** `npm test` antes de entregar.
- **FAÇA** mudanças de horário sempre em UTC no backend; converta para Brasília só na UI.
- **FAÇA** logs em `activity_logs` para qualquer nova ação relevante (observabilidade).

---

## 11. Horários e fusos

- Tudo persistido como **unix ms em UTC**.
- Cron do cérebro: **11:00 UTC = 08:00 América/São_Paulo** (1x/dia).
- O worker in-process roda em tick de **60s** e publica quando `scheduledAt <= now`.

---

*Fiel ao código na versão atual do repositório (119 testes vitest).*
