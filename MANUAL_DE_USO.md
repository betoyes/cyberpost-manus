# CybersecCAST AutoPost — Manual de Uso e Guia da Arquitetura

Este manual explica, em linguagem simples, como o seu sistema de postagens automáticas no Instagram funciona, como você opera o dia a dia e o que fazer em cada situação. Ele também documenta as decisões de arquitetura tomadas para que o sistema seja **econômico** e **seguro**.

**Painel (seu endereço):** https://cyberpost.manus.space
**E-mail de aprovação/alertas:** betoyes@gmail.com
**Pasta das artes no Google Drive:** CybersecCAST

---

## 1. Visão geral em uma frase

Você cadastra os posts no painel, o sistema cuida sozinho de gerar legenda (quando preciso) e pedir sua aprovação por e-mail, e a publicação real no Instagram acontece nos horários combinados (terça e quinta, 8h e 17h, horário de Brasília). Nada que dependa de IA vai ao ar sem você aprovar.

---

## 2. A arquitetura: "cérebro" + "braço"

O sistema foi dividido em duas partes que trabalham juntas. Essa divisão é a chave para gastar pouco.

| Parte | O que é | O que faz | Custo |
| --- | --- | --- | --- |
| **Cérebro** | O app web (este painel), publicado em cyberpost.manus.space | Guarda o calendário, aplica as regras de legenda, gera a legenda por IA, envia o e-mail de aprovação, define o status de cada post e faz a checagem diária de rotina | Roda no servidor do app — **não consome créditos do Manus** nas rotinas |
| **Braço (executor)** | O agendamento do Manus (terça e quinta, 8h e 17h) | Apenas executa a ação real: baixa a arte do Drive, publica no Instagram e avisa o cérebro do resultado | Só "acorda" **4 vezes por semana**, quando há algo realmente pronto para postar |

Em outras palavras: o trabalho de pensar e organizar é feito de graça pelo app; o Manus só é acionado para a ação final de publicar.

---

## 3. As regras de legenda (como o sistema decide o que postar)

O sistema segue uma ordem de prioridade rígida, pensada para você nunca publicar algo sem querer:

1. **Legenda manual** — se você escreveu a legenda à mão no post, ela **sempre** vence e é publicada como está. Escrever a legenda já conta como a sua aprovação.
2. **Legenda de IA aprovada** — se o post está no modo de IA e você ainda não escreveu legenda, o sistema gera uma legenda automaticamente e **envia para o seu e-mail**. Ela só será publicada **depois** que você responder o e-mail com "aprovado".
3. **Parar (Fluxo Parado)** — se não há legenda manual e a legenda de IA ainda não foi aprovada, o sistema **não publica** e para o fluxo, evitando qualquer postagem indevida.

> Decisão confirmada por você (Opção A): a legenda manual posta direto; a legenda gerada por IA só vai ao ar após sua aprovação por e-mail.

### Como aprovar ou reprovar pelo e-mail

Quando chegar o e-mail de aprovação, basta **responder** com uma destas palavras (não diferencia maiúsculas/minúsculas):

| Para aprovar | Para reprovar |
| --- | --- |
| aprovado, sim, yes | reprovado, não, nao, no |

Se você aprovar, o post fica pronto e será publicado na próxima janela (terça/quinta). Se reprovar, o fluxo para e você pode editar a legenda manualmente ou ajustar o tema para gerar uma nova.

---

## 4. O fluxo completo, passo a passo

1. **Você cadastra o post** no painel: Calendário Editorial → "Novo post". Informe o nome do arquivo da arte (igual ao que está na pasta CybersecCAST do Drive), o tema/palavras-chave, a data prevista e o modo (manual ou IA/aprovação).
2. **Você coloca a arte** correspondente na pasta CybersecCAST do Google Drive, com o mesmo nome de arquivo informado.
3. **A checagem diária (08h Brasília)** verifica os posts. Se for modo IA e ainda não houver legenda aprovada, o cérebro **gera a legenda** e coloca o post em "Aguardando Aprovação". O **envio do e-mail** de aprovação para betoyes@gmail.com é feito pelo executor (Manus) usando o conector Gmail na janela de execução, com a legenda já preparada pelo cérebro.
4. **Você aprova por e-mail** respondendo com "aprovado". O post passa a ficar pronto para publicação.
5. **Nas janelas de terça/quinta (8h e 17h)** o executor publica de fato no Instagram e confirma de volta ao painel, que marca o post como "Postado", com o link.
6. **Se faltar a arte** no Drive, o post fica em "Erro: Imagem Ausente", o sistema te avisa por e-mail a cada 6 horas e **não pula para o próximo post** até você resolver.

---

## 5. Os status que você verá no painel

| Status | Significado |
| --- | --- |
| **Pendente** | Cadastrado e aguardando a janela de publicação |
| **Aguardando Aprovação** | Legenda de IA gerada; esperando você responder o e-mail |
| **Postado** | Publicado no Instagram (com link) |
| **Erro: Imagem Ausente** | A arte não foi encontrada na pasta CybersecCAST; fluxo travado nesse post |
| **Fluxo Parado** | Sem legenda válida (manual ou IA aprovada); nada foi publicado |

---

## 6. Onde gerenciar cada coisa

| Quero... | Onde fazer |
| --- | --- |
| Cadastrar/editar/excluir posts | Painel → Calendário Editorial |
| Ver o que está pendente, postado, parado | Painel → Visão Geral |
| Ver o histórico de ações | Painel → Logs de Atividade |
| Conferir e-mail de aprovação e modelo de IA | Painel → Configurações |
| Conferir as conexões (Drive/Instagram/Gmail) | Painel → Integrações |
| Ver/pausar/editar os agendamentos e o histórico | Painel do Manus (manus.im), na seção de agendamentos do projeto |

---

## 7. Sobre créditos (importante)

A operação normal do sistema foi desenhada para ser barata:

- A **checagem diária** e toda a lógica do cérebro rodam no servidor do app e **não consomem créditos do Manus**.
- O **Manus só é acionado 4 vezes por semana** (terça e quinta, 8h e 17h) para a publicação real.
- A geração de legenda por IA tem um custo pequeno e só ocorre **quando há um post de IA a processar** — nunca nas checagens de rotina.

> Para qualquer dúvida sobre valores, cobrança ou contestação de créditos, o canal oficial é **https://help.manus.im**. Eu não tenho como estimar ou decidir sobre cobranças.

---

## 7.1. O que é automático e o que ainda exige um passo de confirmação

Para que você tenha clareza total e não fique com expectativas erradas, vale distinguir o que roda 100% sozinho do que ainda passa por uma confirmação do executor:

- **Totalmente automático (no cérebro/app):** organização do calendário, escolha do próximo post da fila, geração da legenda por IA, definição dos status, alerta de imagem ausente a cada 6h e a checagem diária.
- **Executado pelo Manus nas janelas Ter/Qui:** o download da arte no Drive, a publicação no Instagram, o envio do e-mail de aprovação (quando aplicável) e a confirmação do resultado de volta ao painel. Nessas janelas, o agendamento está configurado para **pedir sua confirmação antes de agir** (modo "perguntar antes"), o que é uma proteção a mais para você não publicar nada por engano. Se no futuro você quiser que essas janelas rodem sem pedir confirmação, isso pode ser ajustado nas configurações do agendamento.
- **Aprovação por e-mail:** depende de você responder o e-mail. É o ponto de controle humano do sistema, por decisão sua (Opção A).

## 8. Segurança e acesso

O painel é **privado** e pede login (a tela "Sign in to continue"). Isso é proposital: só você administra o calendário. Os canais que o sistema usa internamente (a "fila" que o executor consulta) **não usam login** — são protegidos por um **token secreto**, então funcionam de máquina para máquina sem expor seu painel.

O executor (agendamento Ter/Qui) precisa conhecer esse token para conversar com o app. Ele está guardado como segredo do projeto (`QUEUE_API_TOKEN`). Caso o agendamento peça o token em alguma execução, informe o mesmo valor que está salvo nas configurações de segredo do app (Painel do projeto → Settings → Secrets).

---

## 9. Backup no GitHub (recomendado)

Vale a pena manter uma cópia do projeto. A forma mais simples e sem custo de créditos:

1. Abra o painel do projeto no Manus.
2. Use o menu de três pontos (⋯) → exportar para o GitHub (ou "Download as ZIP").
3. Recomendo um repositório **privado**, já que contém a lógica do seu sistema.

O script executor (`instagram_automation.py`) fica no ambiente do agendamento; se quiser, posso ajudá-lo a versioná-lo junto no mesmo repositório.

---

## 10. Resolução de problemas rápidos

| Sintoma | O que verificar |
| --- | --- |
| Post não publicou | O status no painel: se está "Aguardando Aprovação", responda o e-mail; se "Erro: Imagem Ausente", coloque a arte no Drive; se "Fluxo Parado", escreva a legenda manual ou ajuste o tema |
| Não recebi e-mail de aprovação | Confira a pasta de spam e se o e-mail em Configurações é betoyes@gmail.com |
| A arte não é encontrada | O nome do arquivo no post precisa ser idêntico ao nome do arquivo na pasta CybersecCAST |
| Quero pausar tudo | No painel do Manus, pause o agendamento de terça/quinta e/ou a checagem diária |

---

## 11. Resumo do que está ativo agora

- **Painel publicado:** https://cyberpost.manus.space
- **Checagem diária (cérebro):** todos os dias às 08h de Brasília, no servidor do app (sem créditos Manus)
- **Publicação (executor):** terça e quinta, 8h e 17h de Brasília, via Manus
- **Regra de legenda:** manual posta direto; IA só após aprovação por e-mail
- **Fonte única do calendário:** o painel (a planilha antiga foi aposentada)

---

*Documento preparado por Manus AI.*
