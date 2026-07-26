# Chatbot TATÁ humanizado V1.3

## Princípio

O DeliveryOS continua soberano sobre classificação, fatos, capacidade, autoridade, escalonamento e ações. O compositor recebe essa decisão estruturada e escolhe somente como comunicá-la:

`DeliveryOS decide → plano de resposta limita → estratégia redige → validador protege → painel apresenta`

O compositor não consulta o oráculo dos cenários, não cria fatos e não ativa drivers.

## Composição conversacional

O plano registra intenção, estágio da conversa, sentimento operacional, gravidade, fatos conhecidos, campos faltantes, ações verificadas ou pendentes, informações permitidas, perguntas obrigatórias, afirmações proibidas e handoff.

O perfil `tata_warm` aplica linguagem curta, acolhedora e proporcional. A variação é determinística por seed, conversa, intenção e estágio. Casos simples recebem respostas diretas; interesse admite contexto moderado; reclamações recebem acolhimento e próximo passo; segurança alimentar mantém tom sério e sem emoji.

As estratégias cobrem informação, reserva e fila, grupos grandes, item faltante, demais ocorrências, segurança alimentar, ambiguidade e continuidade. Em múltiplos turnos, a resposta usa o contexto preservado e pergunta somente o próximo campo necessário.

## Validação posterior

Toda resposta proposta passa por validação antes de ser publicada. O validador bloqueia:

- números e links fora das fontes permitidas;
- confirmação ou promessa sem resultado observável;
- compensação automática;
- atribuição de responsabilidade;
- afirmação clínica ou causal em segurança alimentar;
- emoji acima do limite do perfil.

Uma rejeição produz fallback seguro e evento sanitizado com códigos, nunca com o texto sensível. Diagnósticos de repetição e a comparação com a resposta anterior são evidências de desenvolvimento; não mudam a decisão.

## Variação e determinismo

Executar:

```powershell
node --test tests/conversation-crm/native-humanization.test.js
node tools/conversation-crm/conversational-variation-report.js
```

O relatório canônico está em `docs/conversation-crm/CONVERSATIONAL_VARIATION_REPORT.md`. A execução aprovada cobre 200 entradas sintéticas, 200 respostas validadas, zero fallback e participação máxima de 14% para uma mesma abertura.

## Painel de experiência

Executar:

```powershell
npm ci
npm run conversation-native:start
```

Abrir `http://127.0.0.1:4179`.

O modo normal oferece atendimento livre, 24 áreas de teste, atalhos sintéticos e avaliação da experiência. Não mostra intenção esperada, resultado esperado nem IDs do oráculo. A decisão do DeliveryOS fica recolhida em `Ver decisão do DeliveryOS`.

O modo de desenvolvimento é ativado somente por `http://127.0.0.1:4179/?dev=1`. Ele libera cenários técnicos, relógio, replay, reset e comparação entre a resposta anterior e a humanizada. O feedback humano existe apenas em memória e é descartado com o processo ou reset.

## Limitações

- ambiente exclusivamente sintético e local;
- drivers reais, leitura real e escrita real continuam desativados;
- nenhuma mensagem é enviada;
- fatos institucionais ainda desconhecidos não são completados;
- variedade menor em segurança alimentar é intencional;
- concorrência multiprocesso e produção permanecem não homologadas.
