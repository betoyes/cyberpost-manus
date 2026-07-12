# HANDOFF — Postador (publisher do ecossistema) + ponte JOBS

> Ponto de partida pra continuar numa janela nova SEM reprocessar a conversa
> antiga. Leia este arquivo. Escrito 2026-07-09, **atualizado 2026-07-12**.

## 🔵 LinkedIn (Company Page, texto puro) — pronto, não-mergeado (12-jul)
Além do Instagram, o Postador ganhou um caminho de **texto puro pra LinkedIn Company Page**
na branch **`feat/linkedin-text-only`** (a partir de `feat/linkedin-publisher`), **NÃO mergeada**:
`publishTextToLinkedIn` no `linkedinApi.ts` (share sem mídia, `/rest/posts`), roteamento no
`executor.ts` por `mediaType==='text'`, e o bridge aceitando post sem imagem (`mediaType:'text'`).
Suíte 136/136 verde. **Aguarda:** a LinkedIn aprovar a Community Management API do app próprio +
`db:push` + conta platform=linkedin no `/accounts`. **Enquanto isso**, o JOBS publica em Company
Page por uma **ponte via Make** (fora do Postador) — ver memória `linkedin-company-page-publishing`.
Quando o app for aprovado, o JOBS troca a ponte Make pelo Postador (auto-aposenta).

## ✅ ESTADO ATUAL (2026-07-10): PUBLICANDO DE VERDADE

A cadeia inteira foi provada ponta a ponta — post real publicado no feed do
CybersecCAST: `https://www.instagram.com/p/Dal8M1MmkBK/`. Fluxo que FUNCIONA:

```
Artista (arte local) → JOBS voz/postador.py (BYTES da arte, base64)
  → POST /api/bridge/post (auth BRIDGE_API_TOKEN)
    → Postador hospeda a imagem no CLOUDFLARE R2 (server/r2.ts) → URL pública r2.dev
      → publica via graph.INSTAGRAM.com (Instagram Login API, server/instagramGraph.ts)
        → espera container status_code=FINISHED → media_publish → permalink
```

**Descobertas que corrigem suposições antigas deste doc (LEIA antes de mexer):**
- **NÃO é `graph.facebook.com`.** O app Meta "Cyberpost Manus" é do tipo **Instagram
  Login** (permissões `instagram_business_*`), sem vínculo com Página do Facebook. O
  publisher usa **`graph.instagram.com/v21.0`**. Token = **Instagram User token** gerado
  no painel do app (Casos de uso → API do Instagram → "Configuração da API com login do
  Instagram" → seção 2 "Gerar tokens" → Gerar token na conta conectada). NÃO é token do
  Graph API Explorer/Facebook.
- **NÃO é o Forge/S3 da Manus.** O Forge está morto no Railway (`BUILT_IN_FORGE_*`
  ausentes) — dava "Storage config missing". Hospedagem hoje = **Cloudflare R2** (bucket
  `postador-media`, S3 via `@aws-sdk/client-s3`, servido pela URL pública r2.dev). Env:
  `R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET/PUBLIC_BASE_URL`.
- **A ponte aceita `imageBase64`** (os bytes da arte) além de `imageUrl` — o Postador
  hospeda no R2 e publica. É a Fase 3 fechada: JOBS/Artista entregam a arte, o Postador
  é o host.
- **`media_publish` precisa esperar o container FINISHED** — publicar na hora dá "Media
  ID is not available" (o IG baixa/processa a imagem assíncrono). Resolvido com poll de
  `status_code` em `instagramGraph.ts`.

**Pegadinhas / resíduos conhecidos:**
- **r2.dev tem propagação**: numa imagem INÉDITA, o r2.dev pode levar segundos pra servir;
  se o executor publicar antes, o container vai a ERROR (mensagem clara, post "Fluxo
  Parado", re-disparável — não é perda silenciosa). Hardening opcional: HEAD-check da URL
  no bridge antes de criar o post. r2.dev é oficialmente "não pra produção" → migrar pra
  domínio custom no R2 é o passo durável.
- **Multi-conta**: `meta_access_token` é UM setting global; cada conta tem seu `igUserId`.
  Com Instagram Login, um token é escopado a UMA conta IG. Publicar em várias contas com
  tokens diferentes exigiria token por conta (hoje o modelo é 1 token global).

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

## Fase 2 — CONCLUÍDA (ponte no `_Jobs`, 2026-07-09, commit `f2ffbb1`)

`_Jobs/voz/postador.py` criado — cliente HTTP determinístico que fala com o Railway,
espelhando `avatar.py`/`social.py`:
- Lê `postador.base_url` + `postador.token` do `_Jobs/config/config.json` (gitignored, o
  modelo nunca vê a chave — entra só no header `Authorization: Bearer`). Stanza já no
  `config.exemplo.json`. Sem base_url+token → a ponte reporta `nao_configurado` (não finge).
- `postar(prateleira, image_url, caption, scheduled_at?)` → `POST /api/bridge/post`
  (valida URL http(s) + legenda <=2200 na fronteira); `status(post_id)` → GET; e
  `confirmar_publicacao()` registra a entrega datada na prateleira quando o post vira
  `Postado` (fecha o loop publicado→radar; reusa `arte.registrar_entrega`).
- Wiring em `voz/server.py`: rotas `/postador/pedido` (reconhece "posta isso pra X"),
  `/postador/postar` (escrita confirmada), `/postador/status`. Gatilho registrado em
  `GATILHOS.md · 2026-07-09`.
- **Verificado:** py_compile + smoke tests (intenção, `nao_configurado` sem config,
  validação de URL/legenda, token nunca vaza no retorno). Falta só o teste AO VIVO, que
  depende do P0 (chaves) abaixo.
- ⚠️ **Ao editar o postador.py, reiniciar `voz/server.py`** — a ponte cacheia módulos.

**Falta pra funcionar de verdade:** o P0 (chaves abaixo). Sem `postador.token` no config,
`postar()` devolve `nao_configurado`. A imagem (URL pública) hoje entra manual; o
encadeamento automático arte→post é a Fase 3.

## Fase 3 — CONCLUÍDA no essencial (arte → R2 → publica)

O núcleo está feito: a ponte aceita os BYTES da arte (`imageBase64`), o Postador hospeda
no R2 e publica (commits `1e13661` bytes, `081c9d4` R2, `6c4c67b` graph.instagram,
`d06c65b` poll de container). **Resta só** aposentar o código de Instagram DENTRO do
Artista (`_scripts/utils/agendador.js` + `instagram.js`) — a Artista já não publica nesta
máquina (vars IG inativas), então é limpeza, não bloqueio. Atualizar `Artista/CLAUDE.md`
quando fizer.

## Chaves / env — o que está SETADO (2026-07-10) e o que falta

Já configurado e funcionando (Railway + `_Jobs/config/config.json`):
- ✅ `BRIDGE_API_TOKEN` — no Railway E no config do JOBS (idênticos).
- ✅ **R2** — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET=postador-media`, `R2_PUBLIC_BASE_URL=https://pub-695e...r2.dev` (Railway).
- ✅ `meta_access_token` (Instagram User token) + `igUserId` (17841431858411620) —
  setados no painel `/accounts`, "Testar conexão Meta" verde.
- ✅ `PUBLIC_BASE_URL` no Railway.

Ainda não setado (não bloqueia a publicação por imagem, mas limita features):
- `OPENAI_API_KEY` (+ `LLM_MODEL`) — só pra GERAÇÃO de legenda por IA no app. A ponte JOBS
  manda a legenda pronta, então não precisa pra o fluxo JOBS→post.
- `RESEND_API_KEY` + `EMAIL_FROM` — e-mail de aprovação/notificação (posts da ponte já
  vêm aprovados, `captionApproved:true`, então não passam por e-mail).
- Google Drive (`GOOGLE_SA_JSON` + `DRIVE_FOLDER_ID`) — só pro fluxo LEGADO por `filename`.
  A ponte NÃO usa Drive nem R2-via-Drive; hospeda direto no R2.

**⚠️ Renovar o token do Meta:** o Instagram User token é long-lived (~60 dias). Quando
expirar, gerar de novo no painel do app (Casos de uso → API do Instagram → seção "Gerar
tokens") e colar em `/accounts` → Salvar → Testar. Sinal de expiração nos logs:
"Invalid OAuth access token" / "Object ... does not exist".
