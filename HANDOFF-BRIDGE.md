# HANDOFF — Postador (publisher do ecossistema) + ponte JOBS

> Ponto de partida pra continuar numa janela nova SEM reprocessar a conversa
> antiga. Leia este arquivo. Escrito 2026-07-09.

## O que é o Postador

O **Postador** (pasta `_Claude-Code/Postador`, repo `cyberpost-manus` no GitHub,
package `cyberseccast_autopost`) é o **braço de publicação direta no Instagram** do
ecossistema JOBS — o único com publisher testado (Meta Graph API v21.0), agendador
in-process, aprovação por e-mail e deploy. Foi trazido de `_AI_Projects/` em 09-jul.

- **Diferente dos irmãos:** não é Node vanilla local. É React + tRPC + Drizzle/**MySQL**,
  **hospedado no Railway** (`cyberpost-manus-production.up.railway.app`), login Google.
- **Papel:** publisher ÚNICO. O código de Instagram do `Artista` vai se **aposentar**
  (Fase 3) — a Artista para em "arte pronta + URL pública" e entrega pro Postador.
- Rodar/build local: `npm run build` (vite+esbuild), `npm test` (vitest), `npm run check`
  (tsc). `pnpm` não está no PATH desta máquina — use os binários de `node_modules/.bin`
  via `npm run`. Boot completo precisa do MySQL do Railway + segredos (não simula local).
- ⚠️ **Migrações NÃO rodam no boot** — são passo manual (`npm run db:push` =
  drizzle-kit generate && migrate contra o Railway). Por isso a Fase 1 evitou coluna nova.

## Fase 1 — CONCLUÍDA, VERIFICADA, COMMITADA (branch `feat/jobs-bridge`, `bd880ee`)

A ponte que deixa o JOBS (processo Python local, sem sessão de navegador) originar um
post já-aprovado a partir de uma imagem em URL pública.

**Arquivos (repo Postador):**
- `server/bridgeApi.ts` (NOVO) — `POST /api/bridge/post` e `GET /api/bridge/status/:id`,
  autenticados por `BRIDGE_API_TOKEN`. Cria post com `imageUrl` externa + `captionManual`,
  `mode:"manual"`, `captionApproved:true`, `status:"Pendente"`, `scheduledAt` (default agora).
- `server/_core/bearerToken.ts` (NOVO) — check de token constant-time compartilhado.
  `queueApi.checkToken` refatorado pra usá-lo.
- `server/executor.ts` — branch novo: se `post.imageUrl` é URL http(s) absoluta, publica
  direto via `publishImageToInstagram` e **pula o Google Drive**. Posts do Drive guardam
  `imageUrl` relativa → a convenção `^https?://` distingue os dois sem coluna nova.
- `server/_core/index.ts` — registra as 2 rotas.
- `server/_core/env.ts` — getters `bridgeApiToken` e `allowedImageHosts`.

**Contrato do endpoint** `POST /api/bridge/post` (header `Authorization: Bearer <BRIDGE_API_TOKEN>`):
```
{ imageUrl (req, http(s) público), caption (req, <=2200), filename?, accountId?, scheduledAt? }
→ { ok, postId, status:"Pendente", scheduledAt }
```
`GET /api/bridge/status/:id` → `{ ok, post:{status,permalink,instagramId,note,...}, logs }`.
O executor in-process (poll de 60s) publica sozinho quando `scheduledAt <= now`.

**Correções de segurança aplicadas (2 rodadas do security-reviewer — todas CLOSED):**
- **H1** (confused-deputy, que EU introduzi): os handlers `/api/queue/*` aceitavam
  `imageUrl` sem validar; com o branch novo do executor isso viraria vetor de publicar
  imagem de atacante. Corrigido REMOVENDO a escrita de `imageUrl`/`imageStorageKey` de
  `queueApprovalHandler` e `queueReportHandler`. Agora o único writer de `imageUrl` http
  executável é a ponte (token + validada). Sem regressão (executor próprio usa `filename`
  pro Drive, nunca `post.imageUrl`).
- **M1** — allowlist opcional de host (`ALLOWED_IMAGE_HOSTS`, CSV). Vazia = qualquer http(s).
  Resíduo LOW: não checa porta.
- **M2** — removido `stack` das respostas de erro do `queueApi`.
- ⚠️ **Invariante frágil:** a segurança do branch do executor depende de NINGUÉM voltar a
  escrever `imageUrl` http nesses handlers. Não há guarda de tipo — só convenção. Qualquer
  `db.updatePost({imageUrl})` novo num handler token-only reabre o H1 silenciosamente.

**Testes:** suíte completa **119 verde**, `tsc --noEmit` limpo.

## Fase 2 — PRÓXIMA (ponte no `_Jobs`, ainda não começou)

Criar `_Jobs/voz/postador.py` — cliente HTTP determinístico que fala com o Railway:
- Lê `BRIDGE_API_TOKEN` e a base URL do `_Jobs/config/config.json` (gitignored, o modelo
  nunca vê a chave). Sugestão de config:
  `"postador": { "base_url": "https://cyberpost-manus-production.up.railway.app", "token": "<...>" }`
- Dispara `POST /api/bridge/post` (gatilho tipo "posta isso pra <cliente>") e consulta
  `GET /api/bridge/status/:id`. Segue o padrão dos outros bridges (`arte.py`, `avatar.py`,
  `social.py`).
- Registrar no `CAPACIDADES.md` + `GATILHOS.md` (com data) e **reiniciar** `voz/server.py`
  (a ponte cacheia módulos — browser refresh não basta).
- **Não precisa do token pra ESCREVER o código** — só lê do config. O token/URL só entram
  no teste ao vivo.

## Fase 3 — aposentar o Instagram do Artista

Em `_Claude-Code/Artista`: tirar o passo de publish de `_scripts/utils/agendador.js` +
`instagram.js`; a Artista para em "arte + URL pública" e entrega pro Postador. Atualizar
`Artista/CLAUDE.md`. (As vars IG do Artista já estão inativas nesta máquina.)

## ⚠️ Chaves que o Beto precisa setar pro Postador publicar de verdade

Hoje o Postador está *"falta credenciais"*. Este é o **checklist canônico do P0**:
1. `BRIDGE_API_TOKEN` — gerar (`openssl rand -hex 32`), colar no **Railway** (env) E no
   `_Jobs/config/config.json`. Têm que ser IDÊNTICOS.
2. `OPENAI_API_KEY` (gerar em platform.openai.com) — geração de legenda de IA.
   Opcional: `LLM_MODEL` (default `gpt-4o-mini`).
3. `RESEND_API_KEY` (gerar em resend.com) + `EMAIL_FROM` — e-mail de notificação/aprovação.
4. `meta_access_token` + `igUserId` — no painel `/accounts` do app (tela "Conexão Meta"),
   e rodar "Testar conexão".
5. `PUBLIC_BASE_URL` no Railway — confirmar que está setada (links de aprovação por e-mail
   e Instagram precisam).
6. (opcional, defense-in-depth) `ALLOWED_IMAGE_HOSTS` no Railway = host do CDN da Artista.
7. Google Drive (`GOOGLE_SA_JSON` + `DRIVE_FOLDER_ID`) só é necessário pro fluxo LEGADO
   (posts por filename). Posts vindos da ponte (URL externa) NÃO precisam do Drive.
   Se for ativar: Google Cloud → IAM → Service Accounts → criar uma nova, habilitar a
   Drive API, baixar a chave JSON, compartilhar a pasta `CybersecCAST` do Drive com o
   e-mail da service account; setar `GOOGLE_SA_JSON` (o JSON) + `DRIVE_FOLDER_ID` (o **ID**
   da pasta, não o nome) no Railway.

**Passo a passo pendente do dono (sequência de validação):** setar as chaves acima →
testar geração de legenda + e-mail de aprovação → "Testar conexão Meta" em `/accounts` →
publicação real de teste (legenda manual + imagem) e conferir que vira "Postado" com
permalink → só depois de tudo confirmado, desativar manualmente o executor Python +
Heartbeat do lado da Manus (não é código deste repo).

Nota: o storage de imagens segue no Forge/S3 da Manus **de propósito** (última
dependência — ROADMAP 3.1).
