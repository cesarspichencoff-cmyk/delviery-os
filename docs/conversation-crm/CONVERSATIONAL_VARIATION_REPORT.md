# Relatório de variação conversacional V1.3

## Execução canônica

- Seed: `TATA-SIM-V1`
- Respostas produzidas: **200**
- Respostas aprovadas pelo validador: **200**
- Fallbacks seguros: **0**
- Maior participação de uma abertura: **14.0%**
- Hash determinístico: `8b3cdcab14b5a146031461cde715ae74335590deaca989c325f8d60436fc587a`

O relatório usa os 200 cenários sintéticos canônicos exclusivamente como entradas externas de teste. O runtime e o compositor não importam o oráculo.

## Aberturas mais usadas

| Abertura normalizada | Uso |
|---|---:|
| poxa sinto muito por isso | 28 |
| sinto muito pelo que aconteceu | 27 |
| sinto muito pelo ocorrido | 24 |
| entendi o que aconteceu | 18 |
| ainda falta confirmação para concluir então o contexto permanece preservado e o acompanhamento continua aberto | 17 |
| o caso continua aberto com as informações disponíveis sem antecipar uma conclusão | 16 |
| vou preservar as informações já fornecidas e manter o caso aberto enquanto os pontos pendentes são verificados | 15 |
| claro te explico de um jeito simples | 9 |
| a última informação pode estar desatualizada | 5 |
| caso os horários de reserva estejam completos quando não houver reserva disponível a fila pode ser acessada pelo mesmo link httpsreservationgetinappmp9xnvkl após a chamada da mesa o prazo informado para chegada é de 5 minutos | 4 |

## Fechamentos mais usados

| Fechamento normalizado | Uso |
|---|---:|
| você pode me dizer qual é o número do pedido e qual item foi afetado | 36 |
| você pode me dizer qual é o número do pedido | 25 |
| ainda falta confirmação para concluir então o contexto permanece preservado e o acompanhamento continua aberto | 20 |
| o caso continua aberto com as informações disponíveis sem antecipar uma conclusão | 20 |
| vou preservar as informações já fornecidas e manter o caso aberto enquanto os pontos pendentes são verificados | 20 |
| você pode me dizer qual é o número do pedido e se o pedido foi feito pelo delivery do tatá ou pelo ifood | 18 |
| vou manter o contexto preservado | 16 |
| você pode me dizer qual dia você prefere | 6 |
| vou manter o caso aberto | 5 |
| não vou estimar posição ou tempo de espera sem resultado observável | 4 |

## Frases mais usadas

| Frase normalizada | Uso |
|---|---:|
| ainda falta confirmação para concluir então o contexto permanece preservado e o acompanhamento continua aberto | 40 |
| vou preservar as informações já fornecidas e manter o caso aberto enquanto os pontos pendentes são verificados | 37 |
| você pode me dizer qual é o número do pedido e qual item foi afetado | 36 |
| o caso continua aberto com as informações disponíveis sem antecipar uma conclusão | 34 |
| poxa sinto muito por isso | 28 |
| sinto muito pelo que aconteceu | 27 |
| você pode me dizer qual é o número do pedido | 25 |
| sinto muito pelo ocorrido | 24 |
| entendi o que aconteceu | 18 |
| você pode me dizer qual é o número do pedido e se o pedido foi feito pelo delivery do tatá ou pelo ifood | 18 |

## Similaridade aproximada por intenção

| Intenção | Respostas | Similaridade Jaccard média |
|---|---:|---:|
| order.status | 24 | 0.245 |
| occurrence.health_symptom | 9 | 1.000 |
| waitlist.create | 8 | 0.300 |
| conversation.multiple_intents | 6 | 0.449 |
| occurrence.foreign_body | 6 | 1.000 |
| occurrence.missing_item | 6 | 0.784 |
| conversation.ambiguous | 4 | 1.000 |
| handoff.failure | 4 | 0.522 |
| occurrence.charge | 4 | 0.315 |
| reservation.create | 4 | 0.515 |
| reservation.update | 4 | 0.697 |
| waitlist.read | 4 | 0.453 |
| abuse.review | 3 | 0.439 |
| feedback.praise | 3 | 0.400 |
| feedback.suggestion | 3 | 0.362 |
| information.address | 3 | 0.333 |
| information.allergen | 3 | 0.778 |
| information.corkage | 3 | 1.000 |
| information.hours | 3 | 0.333 |
| information.menu | 3 | 1.000 |
| information.payment | 3 | 0.026 |
| occurrence.address | 3 | 0.468 |
| occurrence.alert_only | 3 | 0.146 |
| occurrence.allergen | 3 | 1.000 |
| occurrence.appearance | 3 | 0.319 |
| occurrence.collection_delay | 3 | 0.259 |
| occurrence.coupon | 3 | 0.394 |
| occurrence.dining_room | 3 | 0.867 |
| occurrence.driver | 3 | 0.426 |
| occurrence.freshness | 3 | 1.000 |
| occurrence.leak | 3 | 0.524 |
| occurrence.order_disrupted | 3 | 0.161 |
| occurrence.packaging_damage | 3 | 0.644 |
| occurrence.personalization_ignored | 3 | 0.400 |
| occurrence.preparation_delay | 3 | 0.319 |
| occurrence.prior_promise | 3 | 0.095 |
| occurrence.quality | 3 | 1.000 |
| occurrence.refund_request | 3 | 0.373 |
| occurrence.route_delay | 3 | 0.556 |
| occurrence.taste | 3 | 1.000 |
| occurrence.temperature | 3 | 0.556 |
| occurrence.valet | 3 | 0.795 |
| occurrence.wrong_item | 3 | 0.495 |
| occurrence.wrong_quantity | 3 | 0.495 |
| order.cancel | 3 | 0.400 |
| order.modify | 3 | 0.439 |
| privacy.access_request | 3 | 0.439 |
| privacy.correction_request | 3 | 1.000 |
| privacy.opt_out | 3 | 1.000 |
| public_exposure | 3 | 0.536 |
| reservation.large_group | 3 | 1.000 |

## Interpretação

- a escolha de variação é determinística por seed, conversa, intenção e estágio;
- informação simples permanece direta;
- reclamações variam a abertura sem variar fatos, ação ou autoridade;
- casos sensíveis têm menos variação de propósito;
- nenhuma resposta pode adicionar número, link ou confirmação fora da lista permitida;
- alertas de repetição são diagnósticos de desenvolvimento e não mudam a decisão operacional.

## Gate

**APROVADO:** 200 respostas validadas, zero fallback e nenhuma abertura excessivamente dominante.
