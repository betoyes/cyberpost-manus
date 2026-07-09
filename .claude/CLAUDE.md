# Postador (CybersecCAST AutoPost) — Contexto para Claude Code

Publisher de Instagram do ecossistema. Antes de qualquer mudança leia
`HANDOFF-BRIDGE.md` (estado vivo — o que é, Fase 1 feita, Fases 2-3, chaves pendentes)
e, pra regras de código/schema, `DEVELOPER_GUIDE.md`.
(Docs históricos da era "Manus" ficam em `arquivo/` — não são mais o estado atual.)

## Stack (atual — Railway, não mais Manus)

- **Frontend:** React 19 + Vite + Tailwind 4 (`client/src/`)
- **Backend:** Express 4 + tRPC 11 + Drizzle ORM (`server/`)
- **Banco:** MySQL no **Railway** (`cyberpost-manus-production.up.railway.app`) — migrações
  são passo **manual** (`npm run db:push`), NÃO rodam no boot.
- **Auth:** login Google.
- **Testes:** Vitest — `npm test` (suíte atual **119 verde**). `npm run check` = `tsc --noEmit`.
  `pnpm` não está no PATH desta máquina — use `npm run` (binários em `node_modules/.bin`).
- Boot completo precisa do MySQL do Railway + segredos — **não simula local**.

## Papel no ecossistema

Publisher **ÚNICO** e testado (Meta Graph API v21.0): agendador in-process (poll ~60s),
aprovação por e-mail, deploy no Railway. O código de Instagram do `Artista` será
aposentado (Fase 3) — a Artista para em "arte pronta + URL pública" e entrega pro Postador
via a **ponte** (`POST /api/bridge/post`, autenticada por `BRIDGE_API_TOKEN`).

## Fila HTTP (fora do tRPC, bearer-token)

- `GET /api/queue/next` — próximo post a publicar
- `POST /api/queue/report` — resultado da publicação
- `POST /api/queue/approval` — resposta de aprovação por e-mail
- `POST /api/queue/generate-caption` — gera legenda de IA para um post
- `POST /api/bridge/post` / `GET /api/bridge/status/:id` — ponte JOBS (ver HANDOFF-BRIDGE)

## Regras de negócio INVIOLÁVEIS

1. Legenda **manual** publica direto; legenda de **IA** só publica após e-mail de aprovação.
2. `"Postar agora"` é bloqueado para posts em `"Aguardando Aprovação"`.
3. Datas sempre em `America/Sao_Paulo` — use `shared/timezone.ts`.
4. Status válidos (exatos): `"Pendente"`, `"Postado"`, `"Aguardando Aprovação"`, `"Erro: Imagem Ausente"`, `"Fluxo Parado"`.
5. Nunca alterar `server/_core/` ou endpoints `/api/queue/*` sem necessidade real.
6. ⚠️ **Invariante frágil (segurança):** o único writer de `imageUrl` http executável é a
   ponte (token + validada). NUNCA voltar a escrever `imageUrl` http nos handlers
   `/api/queue/*` — reabre o H1 (confused-deputy) silenciosamente. Ver HANDOFF-BRIDGE §Fase 1.

## Git

- Push direto na main, testes passando obrigatório.
- Commits `<type>: <descrição>`. (Não há mais changelog manual obrigatório nem tarefas
  `PENDENTE-MANUS` — a operação Manus foi aposentada.)

## Modelo recomendado por tarefa

| Tarefa | Modelo |
|---|---|
| UI simples, labels, toast | `haiku` |
| Features, lógica de negócio | `sonnet` (padrão) |
| Decisões arquiteturais | `opus` |
