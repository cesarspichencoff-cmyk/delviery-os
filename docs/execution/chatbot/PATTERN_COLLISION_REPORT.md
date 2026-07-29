# Relatório de colisões do Pattern Engine

## Ordem determinística

1. segurança ou pedido de humano;
2. correção explícita;
3. cancelamento/encerramento;
4. repetição/reformulação;
5. resposta à pergunta pendente;
6. referência contextual;
7. pergunta lateral;
8. troca de assunto;
9. retomada;
10. saudação com necessidade;
11. saudação;
12. conversa social curta;
13. nova jornada;
14. esclarecimento conservador.

Quando mais de um sinal aparece, `collision_log` registra vencedor, candidatos
e posição de prioridade. Nenhum candidato é escolhido por modelo ou
`scenario_id`.

## Casos críticos comprovados

- dificuldade para respirar vence saudação e reserva;
- correção de quantidade altera somente o fato identificado;
- cancelamento vence “voltando”;
- resposta curta usa o tipo da pergunta pendente;
- referência ambígua não escolhe opção;
- pergunta lateral responde e volta sem suspender a jornada;
- novo problema suspende a jornada anterior;
- retomada usa a última jornada suspensa;
- pilha acima de três jornadas falha fechada;
- identidade de cliente ambígua exige confirmação;
- alergia declarada bloqueia recomendação sem cobertura de alergênicos.

O corpus contém 390 casos de turno único e 20 conversas de oito turnos. A
latência p95 local permanece abaixo de 50 ms no teste de 1.000 resoluções.
