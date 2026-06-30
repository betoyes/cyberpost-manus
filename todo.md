# CybersecCAST AutoPost — TODO

## Banco de Dados
- [x] Tabela `posts` (filename, theme, mode, status, scheduledAt, captionManual, captionAi, captionApproved, mediaType, instagramId, permalink, imageStorageKey, lastMissingAlertAt)
- [x] Tabela `settings` (chave/valor: e-mail de aprovação, modelo LLM, cron task uid)
- [x] Tabela `activity_logs` (postId, kind, message, createdAt)
- [x] Enum de status: 'Pendente', 'Postado', 'Aguardando Aprovação', 'Erro: Imagem Ausente', 'Fluxo Parado'
- [x] Gerar migração e aplicar via webdev_execute_sql

## Dashboard (UI elegante)
- [x] Layout com sidebar (DashboardLayout) com branding CybersecCAST
- [x] Página Calendário Editorial: tabela de posts (filename, tema, modo, status, data/hora)
- [x] Indicadores de status premium (badges por cor)
- [x] Criar/editar/excluir post manualmente
- [x] Página de Configurações (e-mail de aprovação, modelo LLM, status do cron)
- [x] Página de Logs de atividade
- [x] Página de status das integrações
- [x] Estados de loading, vazio e erro (estado vazio "pipeline" Drive→IA→Aprovação→Instagram)

## Arquitetura híbrida (cérebro no app + executor Manus)
- [x] Módulo de regras de prioridade de legenda (engine.ts): manual > IA aprovada > PARAR
- [x] Geração de legenda via LLM embutido (caption.ts: tema -> legenda + hashtags)
- [x] Fila: processar apenas o post mais antigo devido por execução
- [x] Post bloqueado (sem imagem/aprovação) não avança a fila
- [x] Máquina de estados de status alinhada às strings exatas do spec
- [x] API de fila /api/queue/next (token-auth) — entrega ordem pronta ao executor
- [x] API de callback /api/queue/report (token-auth) — executor reporta postado/imagem ausente/erro
- [x] notifyOwner em: publicado, rejeitado/erro, bloqueado, imagem ausente

## Cron / Agendamento (Heartbeat - sem créditos Manus)
- [x] Handler /api/scheduled/cron30 (verifica pendentes, gera legenda, define estado)
- [x] Alerta de imagem ausente a cada 6h (cadência no cron)
- [ ] Registrar cron de 30min após deploy (depende de deploy do usuário)

## Testes e Entrega
- [x] Testes vitest da lógica de prioridade de legenda (8) e auth do token da fila (3)
- [x] Validação do secret QUEUE_API_TOKEN via teste
- [ ] Checkpoint salvo
- [ ] Configurar agendamento do Manus (Ter/Qui) como executor da fila
- [ ] Manual de uso + guia da arquitetura

## Notas
- Modelo híbrido (Opção 2 + Forma A) confirmado pelo usuário.
- O app web é o cérebro; o agendamento do Manus (Ter/Qui 8h e 17h) executa Drive/Instagram/Gmail via conectores.
- O cron de 30min roda no servidor do app (gratuito); só "escala" ao Manus quando há publicação real na janela agendada.
- Integrações diretas (Google/Meta API) foram descartadas a pedido do usuário para evitar App Review/verificação.
## Pós-deploy (URL: https://cyberpost.manus.space)
- [x] Verificar endpoints técnicos acessíveis por token sem login na produção (401/403 corretos)
- [x] Regra confirmada (Opção A): manual posta direto; IA só após aprovação por e-mail (já implementado/testado)
- [x] Cron reduzido para 1x/dia (08h Brasília / 11:00 UTC) — não consome créditos Manus
- [x] Cron server-side (Heartbeat) registrado: cyberseccast-brain-daily (task_uid AqUEqMKax9BNyrv8xQgmFN)
- [x] instagram_automation.py reescrito: consome /api/queue/next e reporta via /api/queue/report
- [x] Agendamento Manus (Ter/Qui 8h/17h) atualizado para usar a fila do app (Opção 1: app = fonte única)
- [ ] Manual de uso final + guia da arquitetura (em elaboração)
