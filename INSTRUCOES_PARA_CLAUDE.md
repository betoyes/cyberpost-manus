# 🤖 Instruções para o Claude Code — Projeto CybersecCAST AutoPost

Este documento orienta como o **Claude Code** deve trabalhar neste repositório
(`betoyes/cyberpost-manus`) em colaboração com o **Manus**. O objetivo é evoluir o
app **economizando os créditos do Manus**, mantendo o código consistente e sem que uma
IA quebre o trabalho da outra.

Leia este arquivo **antes de qualquer alteração**. Em seguida, leia, nesta ordem:
`DEVELOPER_GUIDE.md` (arquitetura e regras de negócio invioláveis) e
`CHANGELOG_COLABORACAO.md` (o que já foi feito).

---

## DIVISÃO DE TRABALHO (vigente)

> Estabelecida em 2026-06-30 pelo dono do projeto. Válida até nova instrução explícita.

1. **O Claude Code é responsável por TODO o código**: novas features, correção de bugs, ajustes de UI, refatorações, escrita de testes, **merges e resolução de conflitos na branch main**. O Manus **nunca** faz merge e **nunca** resolve conflitos de git.

2. **O Claude faz push direto na main** após resolver/mesclar (ou via PR + merge), sempre com os testes passando (`./node_modules/.bin/vitest run`).

3. **O Manus (operador de credenciais)** só é acionado para tarefas que **exigem** conectores autenticados ou o ambiente de produção:
   - Publicar de verdade no Instagram (conector Meta/Instagram).
   - Enviar e ler e-mails de aprovação de legenda (conector Gmail).
   - Baixar artes da pasta do Google Drive (conector Drive).
   - Disparar/gerenciar o cron e o executor em produção (agendador Manus).
   - Fazer deploy (republicar) o app em `cyberpost.manus.space`.

4. **Fronteira de segurança (INVIOLÁVEL — não alterar sem autorização explícita do dono):**
   - Legenda **manual** publica direto; legenda de **IA** só publica **após** aprovação por e-mail (`"aprovado"` / `"sim"` / `"yes"`).
   - `"Postar agora"` **nunca** burla a aprovação: é bloqueado para posts em `"Aguardando Aprovação"`.
   - Datas/horários sempre em `America/Sao_Paulo` — use `shared/timezone.ts`.
   - Banco: nunca rodar comandos destrutivos sem combinar. Migrações via Drizzle (`schema.ts` → `drizzle-kit generate` → aplicar SQL), descritas no changelog.
   - O app é a **fonte única do calendário** (a planilha Google Sheets foi aposentada).

---

## FLUXO DE COLABORAÇÃO (como passamos o bastão)

1. **Claude** desenvolve, testa, resolve conflitos e faz push/merge na `main`. Registra no changelog.
2. Quando uma tarefa precisar de credenciais (publicar/e-mail/Drive/cron/deploy), escreve no changelog uma entrada com o prefixo **`PENDENTE-MANUS:`** descrevendo exatamente o que o Manus deve operar.
3. O dono aciona o Manus, que faz `git pull`, executa apenas a parte de credenciais/produção e registra o resultado no changelog.

---

## FILA DE TAREFAS (próximas sessões, por prioridade)

1. **(UX — simples)** Ajustar texto do toast do botão "Postar agora": remover referência a "(Ter/Qui)" — deve dizer apenas "será publicado na próxima execução do robô".
2. **(Feature)** Multi-conta Instagram: tabela `accounts`, coluna `accountId` em `posts`, seletor de conta no Calendário e filtro por conta. *(Autorização de cada conta no conector = PENDENTE-MANUS.)*
3. **(Feature)** Suporte a LinkedIn: campo "plataforma de destino" (Instagram/LinkedIn/ambos) no post e na fila. *(Publicação real no LinkedIn depende do conector Publer no Manus = PENDENTE-MANUS.)*
4. **(Opcional)** Espelho do calendário no Google Sheets como relatório somente-leitura.

---

## 1. A regra de ouro: o diário de bordo compartilhado

Existe um arquivo chamado **`CHANGELOG_COLABORACAO.md`**. Ele é o ponto de
sincronização entre você (Claude) e o Manus.

**Regra obrigatória, sem exceção:** toda vez que você fizer qualquer alteração no
projeto, você **deve** adicionar uma entrada nova no topo da seção "Histórico" desse
arquivo, usando o modelo que está lá, **antes de abrir o Pull Request**. Se a mudança
não estiver registrada no changelog, ela é considerada incompleta.

O Manus segue exatamente a mesma regra: sempre que ele mexe no projeto, ele registra
ali primeiro. Assim, ao começar a trabalhar, a primeira coisa que você faz é **ler o
changelog** para saber o que o Manus mudou desde a última vez — e vice-versa. É assim
que mantemos um ao outro atualizados.

---

## 2. Fronteira de responsabilidades (quem mexe em quê)

Esta separação é o que evita conflitos. Respeite-a.

| Camada | Responsável | Exemplos |
| --- | --- | --- |
| **Código do app** (frontend, backend, banco, lógica de negócio) | **Claude Code** | Botão "Postar agora", agendamento livre de data/hora, telas, validações, relatórios, voltar a escrever no Google Sheets, base para multi-conta |
| **Integrações que dependem dos conectores Manus** | **Manus** | Publicação real no Instagram, envio de e-mails (Gmail), leitura das respostas de aprovação, download do Google Drive, chamadas de LLM, cron de produção (Heartbeat) |
| **Deploy / publicação** | **Manus** (via plataforma) | Publicar a versão em `cyberpost.manus.space` |

**Por quê:** a publicação no Instagram, os e-mails, o Drive e o LLM funcionam por meio
dos conectores autenticados na conta Manus do usuário. Esses conectores **não existem**
fora do ambiente Manus. Portanto, você (Claude) pode **escrever o código** que chama
esses fluxos (por exemplo, criar a estrutura/endpoint de "Postar agora"), mas **a
execução real e o deploy** ficam com o Manus.

**Regra prática:** nunca edite a mesma funcionalidade que o Manus está editando ao mesmo
tempo. Se uma tarefa cruza a fronteira (ex.: precisa de código novo **e** de um conector),
faça a parte de código e deixe anotado no changelog o que falta para o Manus completar.

---

## 3. Fluxo de trabalho com Git (passo a passo)

1. `git clone` (ou `git pull` se já tiver o repo) — o **GitHub é a fonte única da verdade**.
2. Leia `INSTRUCOES_PARA_CLAUDE.md` (este arquivo), `DEVELOPER_GUIDE.md` e `CHANGELOG_COLABORACAO.md`.
3. Crie um **branch novo** por tarefa, com nome descritivo. Ex.: `feature/postar-agora`,
   `feature/agendar-livre`, `feature/sheets-espelho`.
4. Implemente a mudança. Siga as convenções do `DEVELOPER_GUIDE.md` (tRPC, Drizzle, etc.).
5. **Atualize o `CHANGELOG_COLABORACAO.md`** com uma nova entrada no topo.
6. Rode os testes (`pnpm test`) e garanta que o TypeScript compila sem erros.
7. `commit` + `push` do branch e **abra um Pull Request** descrevendo a mudança.
8. O usuário (Beto) revisa e faz o merge na `main`.
9. Quando o Manus voltar a atuar, ele fará `git pull` da `main` atualizada antes de tudo.

**Nunca** faça `git push --force` na `main`. **Nunca** reescreva o histórico compartilhado.

---

## 4. O que você NÃO deve fazer

- Não remova nem altere os arquivos sob `server/_core/` sem necessidade real (é a
  camada de infraestrutura: OAuth, contexto, conectores, cron). Mudanças aqui podem
  quebrar a integração com o Manus.
- Não apague endpoints da fila (`/api/queue/*`) nem o handler do cron
  (`/api/scheduled/cron30`) — eles são o contrato entre o app e o executor do Manus.
- Não mude as **regras de negócio invioláveis** descritas no `DEVELOPER_GUIDE.md`
  (prioridade de legenda; legenda manual publica direto; legenda de IA só publica após
  aprovação por e-mail) sem que o usuário peça explicitamente.
- Não coloque imagens/binários grandes no repositório do app.
- Não invente segredos/tokens. Variáveis sensíveis são geridas no ambiente Manus.
- Não faça migração de banco destrutiva sem registrar claramente no changelog.

---

## 5. Lista priorizada de tarefas sugeridas (para o Claude começar)

Estas são as evoluções que o usuário deseja e que são adequadas para você fazer
(são código puro, não dependem dos conectores Manus para serem construídas):

1. **"Postar agora" (alta prioridade):** botão/ação no painel que marca um post para
   publicação imediata, criando uma ordem na fila com prioridade, de modo que o executor
   (Manus) a pegue na próxima passagem. Envolve: endpoint/mutation, ajuste na lógica da
   fila (`server/db.ts` / `server/engine.ts`) e botão na UI.
2. **Agendamento livre (alta prioridade):** permitir agendar um post para **qualquer
   data/hora**, não apenas Ter/Qui. A rotina/seleção da fila já trabalha por
   `scheduledAt`; o ponto principal é garantir que o app aceite e respeite qualquer
   horário e que a UI de cadastro funcione (foi onde o usuário teve dificuldade).
3. **Espelho no Google Sheets (média prioridade):** opção para o app escrever um
   resumo/relatório do calendário numa planilha (apenas a parte de montar os dados; a
   gravação que depende do conector Google fica com o Manus, ou via API com credencial
   fornecida pelo usuário).
4. **Base para multi-conta Instagram (média prioridade):** criar tabela `accounts` e
   coluna `accountId` em `posts`, com UI para escolher a conta de destino. A publicação
   em cada conta exige que ela esteja conectada no Manus — isso fica com o Manus.

Sempre que concluir uma dessas, **registre no changelog** e descreva, se houver, a parte
que ficou pendente para o Manus (ex.: "falta o Manus conectar a 2ª conta de Instagram").

---

## 6. Resumo de 30 segundos

Leia o changelog → crie um branch → mexa só no que é "código de app" → atualize o
changelog → teste → abra PR. Deixe Instagram, Gmail, Drive, LLM e deploy para o Manus.
O `CHANGELOG_COLABORACAO.md` é como nós dois conversamos.
