# Motor de Fluxos do Chatbot V0

## Configuração

Os fluxos vivem em:

- `src/conversation-crm/flows/flows.v0.json`
- `src/conversation-crm/flows/rules.v0.json`
- `src/conversation-crm/flows/policies.v0.json`

Cada bloco declara:

- ID, intenção, origem e gravidade;
- mensagem;
- dados obrigatórios;
- tags;
- próximo bloco e condições;
- ações permitidas e proibidas;
- nível de escalonamento;
- obrigatoriedade de registro interno.

Um teste copia esses arquivos para diretório temporário, altera a mensagem de `I01`, carrega um novo bundle e comprova que a resposta muda sem recompilar o motor.

## Cobertura canônica

| Grupo | Blocos | Papel |
|---|---|---|
| Base | B00–B04 | Abertura e filtros de intenção, origem e gravidade |
| Reservas | R01–R05 | Reserva normal, indisponibilidade, fila e grupos maiores |
| Informações | I01–I02 | Cardápio e informação geral configurada |
| Delivery | D01–D05 | Entrada, triagem, acompanhamento e alteração |
| Ocorrências | O00–O08 | Triagem, item, qualidade, cobrança, atraso, manobrista, alerta e promessa anterior |
| Humano | H01–H03 | Operacional, comercial-operacional e gestão |
| Fechamento | F01–F03 | Informativo, acompanhamento e orientação de marketplace |
| CRM | C01–C03 | Ocorrência, recorrência e promessa autorizada |

Total: 35 blocos.

## Regras inegociáveis

A seção 14 do material canônico contém 12 regras. O número 14 é o número da seção, não a quantidade de regras. A V0 codifica exatamente essas 12, sem acrescentar outras:

1. crédito nunca é oferecido automaticamente;
2. cortesia nunca é oferecida automaticamente;
3. prazo nunca é inventado;
4. marketplace não recebe culpa sem evidência;
5. acolhimento vem antes da explicação;
6. coleta pede o mínimo necessário;
7. resposta informa o próximo passo;
8. caso grave nunca fecha automaticamente;
9. recorrência exige revisão de histórico;
10. promessa exige registro;
11. salão e manobrista escalam;
12. o bot faz triagem e o humano decide.

## Classificação

O motor usa regras determinísticas e contexto explícito:

1. contexto fornecido tem precedência;
2. sinais de intenção são avaliados por ordem conservadora;
3. múltiplos sinais incompatíveis resultam em `ambiguous`;
4. origem ausente permanece desconhecida, exceto quando o contrato do bloco define um domínio inequívoco;
5. gravidade alta ou crítica força humano;
6. campos obrigatórios ausentes ficam visíveis;
7. mensagem bruta é descartada após a classificação.

## Saída

O resultado contém:

- intenção, origem, gravidade e confiança;
- bloco;
- nomes dos campos conhecidos e ausentes, nunca os valores;
- tags;
- resposta sugerida;
- necessidade e nível de humano;
- ações permitidas e proibidas;
- ocorrência ou consentimento codificado;
- evidências de que mensagem não foi persistida, decisão financeira não ocorreu e sistema externo não foi acessado.

## IA

A camada de IA descrita no material permanece registrada como evolução futura. Não há modelo generativo nesta V0. Antes de qualquer uso, será necessário definir contrato de saída, avaliação, privacidade, custo, fallback e soberania das regras.

