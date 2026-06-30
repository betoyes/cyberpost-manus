# Alterações feitas por Claude Code — 2026-06-30

Duas tarefas implementadas em dois PRs separados.
Testes finais: **23/23 passando** (15 originais + 8 novos).

---

## PR 1 — `feat/post-now` — Botão "Postar agora"

### Problema resolvido
O painel não tinha como forçar a publicação imediata de um post cujo `scheduledAt` ainda era data futura. O usuário precisava editar a data manualmente.

### Arquivos alterados

#### `server/_core/env.ts`
**Bug corrigido (pré-existente):** `queueApiToken` era lido uma única vez no `import` do módulo. Nos testes, o `beforeEach` define `process.env.QUEUE_API_TOKEN` depois do import — então o token ficava vazio e o teste `accepts requests with the correct token` falhava (401 em vez de 200).

```diff
- queueApiToken: process.env.QUEUE_API_TOKEN ?? "",
+ get queueApiToken() { return process.env.QUEUE_API_TOKEN ?? ""; },
```

Convertido para getter: lido a cada chamada de `checkToken()`, não em tempo de carregamento.

---

#### `server/routers/posts.ts`
Adicionado import de `TRPCError` e nova mutation `postNow`.

**Lógica da mutation `posts.postNow`:**
1. Busca o post pelo `id`.
2. Rejeita com `NOT_FOUND` se não existir.
3. Rejeita com `BAD_REQUEST` se status for `"Postado"` (já publicado).
4. Rejeita com `BAD_REQUEST` se status for `"Aguardando Aprovação"` (não bypassa a regra de aprovação por e-mail).
5. Atualiza: `scheduledAt = Date.now()`, `status = "Pendente"`, `note = null`.
6. Grava log de auditoria com kind `"priorizado"`.

**Por que `scheduledAt = Date.now()` e não uma data no passado?**
A função `getNextReadyToExecute` filtra `scheduledAt <= nowMs`. Setar para `now` garante que o post se torna elegível imediatamente. Se existirem outros posts com `scheduledAt` mais antigo, eles ainda vêm primeiro na fila (ordenação ASC) — comportamento correto e previsível.

---

#### `client/src/pages/Calendar.tsx`
- Import do ícone `Zap` do lucide-react.
- Nova mutation `postNowMut` consumindo `trpc.posts.postNow`.
- Botão ⚡ adicionado na coluna "Ações" da tabela, **visível apenas quando `status === "Pendente"`**.
- `onSuccess`: invalida a query `posts.list` e exibe toast: *"Post priorizado — será publicado na próxima execução do robô (Ter/Qui)"*.
- `onError`: exibe mensagem de erro do servidor (ex.: "Post já foi publicado").

O botão **não** aparece para outros status porque:
- `"Postado"`: já foi publicado.
- `"Aguardando Aprovação"`: bloqueado pela regra de negócio (precisa de e-mail).
- `"Fluxo Parado"` / `"Erro: Imagem Ausente"`: já têm o botão "Reativar" (RotateCcw).

---

## PR 2 — `feat/free-scheduling` — Fix de timezone + agendamento livre

### Problema resolvido
O campo "Data e hora de publicação" usava `getHours()` e `new Date(str).getTime()` — funções que dependem do **fuso do browser**. Em ambiente com browser em UTC (VMs, servidores de deploy, acessos remotos), o usuário digitava "08:00" (Brasília) e o sistema salvava `08:00 UTC = 05:00 SP` — 3 horas erradas.

### Causa raiz
```ts
// BUGADO — depende do TZ do processo/browser
function toLocalInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-...-${d.getHours()}:${d.getMinutes()}`;
}

const scheduledAt = new Date(form.scheduledLocal).getTime(); // sem TZ explícito
```

### Solução
Brasil é **permanentemente UTC-3** desde que o horário de verão foi abolido em 2019. Isso permite usar o offset fixo `-03:00` sem precisar de biblioteca externa.

---

### Arquivos criados

#### `shared/timezone.ts` (novo)
Três funções puras exportadas:

**`toSaoPauloInput(ms: number | null | undefined): string`**
Converte UTC ms para string `"YYYY-MM-DDTHH:MM"` no fuso de São Paulo, pronta para usar como `value` de `<input type="datetime-local">`.
Usa `Intl.DateTimeFormat` com `locale: "sv-SE"` (produz `YYYY-MM-DD HH:MM`) + `timeZone: "America/Sao_Paulo"`.

**`parseSaoPauloInput(localStr: string): number`**
Converte string `"YYYY-MM-DDTHH:MM"` (entrada do usuário, entendida como hora de SP) para UTC ms.
Concatena `:00-03:00` ao string, forçando o construtor `Date` a interpretar como UTC-3.
Retorna `0` para string vazia.

**`formatSaoPaulo(ms: number | null | undefined): string`**
Formata UTC ms para exibição em pt-BR no fuso de SP.
Usa `toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })`.
Retorna `"—"` para null/undefined/0.

---

#### `server/timezone.test.ts` (novo)
8 testes cobrindo:

| Teste | O que verifica |
|---|---|
| `toSaoPauloInput` converte UTC→SP | `2024-03-01T11:00Z` → `"2024-03-01T08:00"` |
| `toSaoPauloInput` retorna `""` para null/undefined/0 | edge cases |
| `toSaoPauloInput` não depende do TZ do servidor | testa com outra data |
| `parseSaoPauloInput` converte SP→UTC | `"2024-03-01T08:00"` → ms de `2024-03-01T11:00Z` |
| `parseSaoPauloInput` retorna `0` para `""` | edge case |
| Round-trip `parse(format(ms)) === ms` | consistência bidirecional |
| `formatSaoPaulo` retorna `"—"` para null/undefined/0 | edge cases |
| `formatSaoPaulo` inclui data e hora corretas em pt-BR | `"01/03/2024"` e `"08:00"` |

---

### Arquivos alterados

#### `client/src/pages/Calendar.tsx`
- Removida função `toLocalInput` (bugada, baseada em TZ do browser).
- Adicionado import de `toSaoPauloInput`, `parseSaoPauloInput`, `formatSaoPaulo` de `@shared/timezone`.
- `openEdit`: `scheduledLocal: toLocalInput(...)` → `toSaoPauloInput(...)`.
- `submit`: `new Date(form.scheduledLocal).getTime()` → `parseSaoPauloInput(form.scheduledLocal)`.
- Coluna "Agendado" na tabela: `toLocaleString("pt-BR")` → `formatSaoPaulo(p.scheduledAt)`.
- Label do campo: adicionado `(Horário de Brasília)` para deixar explícito ao usuário qual fuso está sendo usado.

#### `client/src/pages/Home.tsx`
- Adicionado import de `formatSaoPaulo` de `@shared/timezone`.
- Lista "Próximas publicações": `toLocaleString("pt-BR")` → `formatSaoPaulo(p.scheduledAt)`.

#### `server/_core/env.ts`
Mesmo fix do PR 1 (getter `queueApiToken`), aplicado também neste branch pois ele partiu de `main`.

---

## Documentos de governança criados (PASSO 0)

Não existiam no repositório — criados antes das tarefas com base no código real.

### `INSTRUCOES_PARA_CLAUDE.md`
Contrato de trabalho para sessões futuras do Claude Code: fronteiras de responsabilidade, regras de negócio invioláveis, fluxo git, convenções de timezone, como rodar testes.

### `CHANGELOG_COLABORACAO.md`
Log compartilhado Claude + Manus. O `git pull` trouxe a versão do Manus (3 entradas históricas). As entradas do Claude foram adicionadas no topo seguindo o modelo estabelecido.

---

## Resumo de impacto

| O que | Antes | Depois |
|---|---|---|
| Publicação imediata | Editar data manualmente | Botão ⚡ no painel |
| Timezone no cadastro | Depende do browser (bug em UTC) | Sempre São Paulo (UTC-3 fixo) |
| Timezone na exibição | Depende do browser | Sempre São Paulo |
| Teste falhando | 14/15 passando | 15/15 (+ 8 novos = 23/23) |
| Agendamento livre | Funcionava, mas mal exibido | Qualquer data/hora, exibição correta |

**Sem migração de banco.** Todas as mudanças são na camada de código — o campo `scheduledAt` já era UTC ms e continua sendo.
