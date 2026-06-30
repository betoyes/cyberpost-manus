# Instruções para o Claude Code — CybersecCAST AutoPost

Leia também `DEVELOPER_GUIDE.md` (arquitetura e regras invioláveis) e a seção **PENDÊNCIAS ATIVAS** do `CHANGELOG_COLABORACAO.md` antes de começar.

## Divisão de trabalho

- **Claude Code** — todo o código (features, bugs, UI, testes), merges, push direto na `main` (somente com `./node_modules/.bin/vitest run` passando).
- **Manus** — publicação no Instagram, e-mails (Gmail), Google Drive, cron de produção, deploy em `cyberpost.manus.space`.

## Regras invioláveis (nunca quebrar sem autorização explícita do dono)

- Legenda **manual** publica direto; legenda de **IA** só publica após `captionApproved=true`.
- `"Postar agora"` é bloqueado para posts em `"Aguardando Aprovação"`.
- Datas sempre em `America/Sao_Paulo` — use `shared/timezone.ts`.
- Status válidos (strings exatas): `"Pendente"`, `"Postado"`, `"Aguardando Aprovação"`, `"Erro: Imagem Ausente"`, `"Fluxo Parado"`.
- Não altere `server/_core/` nem `/api/queue/*` nem `/api/scheduled/*` sem necessidade real.
- Migrações de banco via Drizzle (`schema.ts` → `drizzle-kit generate` → descrever SQL no changelog para o Manus aplicar).

## Fluxo de colaboração

1. Claude desenvolve → atualiza `CHANGELOG_COLABORACAO.md` (entrada no topo) → push na `main`.
2. Quando algo precisar de credenciais (Instagram/Gmail/Drive/cron/deploy), anota no changelog com **`PENDENTE-MANUS:`** descrevendo exatamente o que deve ser feito.
3. Manus faz `git pull`, executa apenas a parte de produção, registra resultado no changelog.
