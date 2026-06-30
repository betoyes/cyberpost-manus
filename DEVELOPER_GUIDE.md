# CybersecCAST AutoPost — Guia do Desenvolvedor (Handoff para IA / Devs)

> **Leia este documento por inteiro antes de editar qualquer arquivo.** Ele descreve a arquitetura real, as regras de negócio que **não podem ser quebradas**, e as armadilhas mais comuns. O objetivo é permitir que outra IA ou desenvolvedor faça ajustes sem "sujar" ou quebrar o sistema.

---

## 0. TL;DR (o mínimo que você precisa saber)

- Stack: **React 19 + Vite + Tailwind 4** (frontend) · **Express 4 + tRPC 11 + Drizzle ORM (MySQL/TiDB)** (backend) · **Manus OAuth** para login. Processo **único Node.js**.
- O sistema tem duas metades: **"cérebro"** (este app web) e **"braço/executor"** (uma tarefa agendada do Manus + o script `instagram_automation.py`). O app **decide**; o executor **age** (Drive/Instagram/Gmail).
- O app é a **fonte única de verdade** (banco de dados). A planilha Google Sheets foi **aposentada** — não reintroduza dependência dela.
- **Regra sagrada:** legenda **manual** posta direto; legenda de **IA** só vai ao ar **após aprovação por e-mail**. Sem legenda válida → **"Fluxo Parado"** (nunca publicar).
- Há rotas HTTP **fora do tRPC** (cron + fila), em `server/_core/index.ts`. Não as mova sem entender o porquê.
- Sempre rode `pnpm test` antes de entregar. Há testes em `server/*.test.ts`.

---

## 1. Arquitetura: cérebro + braço

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│        CÉREBRO (app)         │         │       BRAÇO (executor)        │
│  cyberpost.manus.space       │         │  Tarefa agendada do Manus     │
│  React + Express + tRPC + DB │         │  (Ter/Qui 8h e 17h) +         │
│                              │         │  instagram_automation.py      │
│  - Calendário (banco)        │         │                               │
│  - Regras de legenda         │◀──token─│  GET  /api/queue/next         │
│  - Geração de legenda (IA)   │  HTTP   │  POST /api/queue/report       │
│  - Status dos posts          │────────▶│  POST /api/queue/approval     │
│  - Cron diário (Heartbeat)   │         │                               │
│                              │         │  Conectores nativos:          │
│  NÃO consome créditos Manus  │         │  Google Drive, Instagram,Gmail│
└─────────────────────────────┘         └──────────────────────────────┘
```

- **Cérebro** roda no servidor do app (deploy Autoscale, Node-only). Toda a lógica de decisão está aqui.
- **Braço** é acionado pelo agendamento do Manus apenas nas janelas Ter/Qui. Ele consulta a fila, baixa a arte, posta e reporta de volta.
- A comunicação entre os dois é via HTTP autenticado por **bearer token** (`QUEUE_API_TOKEN`), **sem sessão de usuário**.

---

## 2. Stack e estrutura de arquivos (o que você pode/não pode tocar)

```
client/src/
  pages/            ← Páginas: Home, Calendar, Integrations, Logs, Settings (EDITÁVEL)
  components/ui/     ← shadcn/ui (NÃO reescrever; reutilizar)
  App.tsx            ← Registro de rotas (EDITÁVEL com cuidado)
  index.css          ← Tema/tokens (preserve as @layer base)
drizzle/
  schema.ts          ← Tabelas e tipos (mudanças exigem migração — ver §7)
server/
  _core/             ← Infra do template (OAuth, contexto, vite, llm, sdk...) — NÃO editar salvo necessidade real
  _core/index.ts     ← Bootstrap Express + MAPA DE ROTAS (cron e fila ficam AQUI)
  db.ts              ← Camada de acesso a dados (helpers de fila críticos)
  engine.ts          ← REGRAS DE NEGÓCIO (prioridade de legenda, aprovação) — núcleo
  caption.ts         ← Geração de legenda por IA
  scheduled.ts       ← Handler do cron diário (rotina do cérebro)
  queueApi.ts        ← Endpoints da fila (next/report/approval)
  routers.ts         ← Composição tRPC
  routers/posts.ts   ← CRUD do calendário (admin)
  routers/config.ts  ← Settings + logs (admin)
  *.test.ts          ← Testes vitest (mantenha-os passando)
instagram_automation.py ← Script EXECUTOR (roda no ambiente do agendamento Manus)
MANUAL_DE_USO.md     ← Manual para o dono (usuário final)
DEVELOPER_GUIDE.md   ← Este documento
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
| `POST /api/scheduled/cron30` | Cookie de cron (Heartbeat) | Rotina diária do cérebro (`cron30Handler`) |
| `GET /api/queue/next` | Bearer `QUEUE_API_TOKEN` | Entrega a próxima ordem pronta ao executor |
| `POST /api/queue/report` | Bearer `QUEUE_API_TOKEN` | Executor reporta resultado (posted/missing-image/error) |
| `POST /api/queue/approval` | Bearer `QUEUE_API_TOKEN` | Registra decisão de aprovação lida do e-mail |
| `/api/trpc/*` | Sessão de usuário (admin) | CRUD do calendário, settings, logs, auth |

> **Armadilha comum:** procurar a lógica de cron/fila dentro de `routers.ts`. Ela **não está lá** — está nas rotas Express acima. Se mover essas rotas, o cron e o executor param de funcionar.

### Contratos da fila (resumo)

`GET /api/queue/next` → `{ order: { postId, filename, mediaType, caption, captionKind, driveFolder } }` ou `{ order: null }` ou `{ order: null, blocked: { postId, reason } }`.

`POST /api/queue/report` body → `{ postId: number, result: "posted"|"missing-image"|"error", permalink?, instagramId?, imageUrl?, imageStorageKey?, message? }`.

`POST /api/queue/approval` body → `{ postId: number, reply: string, imageUrl?, imageStorageKey? }`.

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

## 6. O executor (`instagram_automation.py`)

- Roda no **ambiente do agendamento Manus**, não no servidor do app.
- Fluxo: `GET /api/queue/next` → baixa a arte do Drive (`gws`) → `manus-upload-file` → gera `post_cmd_<id>.sh` (comando `manus-mcp-cli create_instagram`) → gera `report_cmd_<id>.sh`.
- **Por que arquivos `.sh`?** Comandos `manus-mcp-cli` (MCP) **devem** ser executados como comandos shell de topo pelo agente Manus, não dentro de subprocessos Python. Por isso o script os prepara e o agente os executa. Não tente chamar MCP de dentro do Python.
- Variáveis: `QUEUE_API_BASE` (padrão `https://cyberpost.manus.space`), `QUEUE_API_TOKEN` (obrigatória), `CYBERSECCAST_FOLDER_ID`.
- Após postar, o agente substitui `PERMALINK_AQUI` pelo link real e executa o `report_cmd`. Isso é um ponto de confirmação humano/agente intencional.

---

## 7. Como fazer mudanças com segurança

### Mudança de schema (Drizzle)
1. Edite `drizzle/schema.ts`.
2. `pnpm drizzle-kit generate` (gera o `.sql`).
3. Leia o `.sql` gerado e aplique no banco (no ambiente Manus, via ferramenta de SQL; fora dele, aplique a migração no seu MySQL/TiDB).
4. Mantenha schema e banco em sincronia. **Cuidado com comandos destrutivos** — dados não são recuperáveis.

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
pnpm install
pnpm test          # vitest — DEVE passar antes de qualquer entrega
pnpm dev           # sobe o servidor de desenvolvimento (Vite + Express)
```

- O servidor escolhe a porta por `process.env.PORT` (não hardcode porta).
- Testes existentes: `server/engine.test.ts` (regras de legenda), `server/queueApi.test.ts` (auth do token), `server/auth.logout.test.ts`. Ao mudar regras de negócio, **atualize/adicione testes**.

---

## 9. Variáveis de ambiente / segredos

Injetadas pela plataforma (não commitar `.env`):

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão MySQL/TiDB |
| `JWT_SECRET` | Assinatura do cookie de sessão |
| `QUEUE_API_TOKEN` | Token compartilhado app ↔ executor (bearer das rotas `/api/queue/*`) |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` | Manus OAuth |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | APIs internas Manus (LLM, storage, etc.) |

> Se mudar o `QUEUE_API_TOKEN`, atualize-o **dos dois lados**: no segredo do app e na variável do agendamento do executor. Caso contrário a fila retorna `401`.

---

## 10. Armadilhas frequentes (faça / não faça)

- **NÃO** reintroduza a planilha Google Sheets como fonte de verdade. O banco do app é a fonte única.
- **NÃO** mova as rotas `/api/scheduled/*` e `/api/queue/*` para dentro do tRPC.
- **NÃO** altere as strings literais de `status` sem varrer todo o código.
- **NÃO** faça o executor publicar legenda de IA sem `captionApproved=true`.
- **NÃO** chame `manus-mcp-cli` dentro de subprocessos Python; gere `.sh` para o agente executar.
- **NÃO** publique conteúdo de usuário falso (reviews/ratings) — política de conteúdo.
- **NÃO** use `git reset --hard`; no ambiente Manus, use os checkpoints do webdev.
- **FAÇA** `pnpm test` antes de entregar.
- **FAÇA** mudanças de horário sempre em UTC no backend; converta para Brasília só na UI.
- **FAÇA** logs em `activity_logs` para qualquer nova ação relevante (observabilidade).

---

## 11. Horários e fusos

- Tudo persistido como **unix ms em UTC**.
- Cron do cérebro: **11:00 UTC = 08:00 América/São_Paulo** (1x/dia).
- Executor: **Ter e Qui, 8h e 17h (América/São_Paulo)**.

---

## 12. Glossário rápido

| Termo | Significado |
| --- | --- |
| Cérebro | O app web; decide tudo, roda sem créditos Manus |
| Braço / Executor | Agendamento Manus + `instagram_automation.py`; executa a postagem |
| Fila | Ordem de execução exposta por `/api/queue/*` |
| Heartbeat | Cron HTTP do servidor do app (`/api/scheduled/cron30`) |
| Fluxo Parado | Estado de segurança: nada é publicado |

---

*Documento preparado por Manus AI. Fiel ao código na versão atual do repositório.*
