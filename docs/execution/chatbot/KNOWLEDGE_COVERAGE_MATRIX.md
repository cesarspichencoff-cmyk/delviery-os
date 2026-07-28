# Knowledge Coverage Matrix — V1

Fonte estruturada canônica:
`src/conversation-crm/native/knowledge-coverage-catalog.js`.

Versão: `deliveryos-knowledge-coverage-v1`  
Revisão: 2026-07-28  
Cobertura: 52/52 intenções.

Cada entrada estruturada contém domínio, necessidade provável, fatos disponíveis,
fatos relacionados, procedimentos, ações, pergunta obrigatória, pergunta
opcional, resposta direta, enriquecimento, limite, fallback legítimo, claims
proibidos, fontes internas, fontes externas, estado de conhecimento, playbook e
data de revisão.

| Intenção | Domínio | Necessidade | Playbook | Cobertura principal | Limite/fallback |
|---|---|---|---|---|---|
| information.address | information | localizar restaurante | restaurant_information | endereço confirmado | unidade não identificada |
| information.hours | information | saber funcionamento | restaurant_information | horários regulares | feriado não configurado |
| information.menu | information | conhecer cardápio/experiências | experiences | links e menus em cursos | composição específica não confirmada |
| information.payment | information | confirmar pagamento | restaurant_information | oito meios confirmados | demais meios não confirmados |
| information.corkage | information | entender rolha | restaurant_information | valor confirmado | unidade de cobrança ausente |
| information.allergen | information | avaliar alergênico | food_safety | cardápio e orientação segura | composição exige confirmação |
| reservation.create | reservation | consultar/iniciar reserva | reservation | link, tolerância e regra | sem disponibilidade observável |
| reservation.update | reservation | alterar reserva | reservation | procedimento e capacidade | sem referência/integração |
| waitlist.create | waitlist | entrar na fila | waitlist | link e regra de chamada | sem confirmação de entrada |
| waitlist.read | waitlist | acompanhar fila | waitlist | acompanhamento no sistema | sem posição/espera observável |
| reservation.large_group | reservation | grupo acima de oito | large_group | coleta mínima e handoff | sem mesa confirmada |
| order.status | order | andamento do pedido | delay_and_delivery | estado por canal | sem referência/estado observável |
| order.modify | order | alterar pedido | own_delivery | ação controlada | capacidade não confirmada |
| order.cancel | order | cancelar pedido | own_delivery | solicitação/análise | decisão não automática |
| occurrence.missing_item | occurrence | item faltante | missing_item | item, canal e orientação | sem promessa de solução |
| occurrence.wrong_item | occurrence | item errado | wrong_item | recebido versus pedido | sem substituição prometida |
| occurrence.wrong_quantity | occurrence | quantidade errada | quantity_personalization | esperado versus recebido | sem compensação prometida |
| occurrence.personalization_ignored | occurrence | personalização ignorada | quantity_personalization | observação e item | sem compensação prometida |
| occurrence.leak | occurrence | vazamento | quality | registro e análise | causa não presumida |
| occurrence.packaging_damage | occurrence | embalagem danificada | quality | registro/evidência | origem não presumida |
| occurrence.order_disrupted | occurrence | pedido revirado | delay_and_delivery | entrega versus produto | culpa não presumida |
| occurrence.temperature | occurrence | temperatura | quality | qualidade sensorial | não tratar como risco sem sinais |
| occurrence.preparation_delay | occurrence | atraso em preparo | delay_and_delivery | etapa observada | sem previsão inventada |
| occurrence.collection_delay | occurrence | atraso na coleta | delay_and_delivery | etapa observada | sem previsão inventada |
| occurrence.route_delay | occurrence | atraso em rota | delay_and_delivery | etapa observada | sem previsão inventada |
| occurrence.driver | occurrence | problema na entrega | delay_and_delivery | orientação de canal | culpa não presumida |
| occurrence.charge | occurrence | cobrança | ifood | Ajuda no pedido | análise pela plataforma |
| occurrence.refund_request | occurrence | reembolso | ifood | solicitação e acompanhamento | reembolso não prometido |
| occurrence.coupon | occurrence | cupom | ifood | Ajuda da plataforma | loja não decide plataforma |
| occurrence.address | occurrence | endereço da entrega | delay_and_delivery | orientação de canal | alteração depende da etapa |
| occurrence.quality | occurrence | qualidade geral | quality | sinal específico e análise | sem compensação automática |
| occurrence.appearance | occurrence | aparência | quality | evidência visual | sem causalidade |
| occurrence.taste | occurrence | sabor | quality | separar preferência/execução | sem causalidade |
| occurrence.freshness | occurrence | possível impróprio | food_safety | proteção e escalonamento | sem diagnóstico |
| occurrence.allergen | occurrence | possível alergênico | food_safety | saúde, coleta e escalonamento | sem diagnóstico |
| occurrence.foreign_body | occurrence | corpo estranho | food_safety | seriedade e evidência | sem causalidade |
| occurrence.health_symptom | occurrence | sintomas | food_safety | saúde e urgência proporcional | sem diagnóstico |
| occurrence.dining_room | occurrence | problema no salão | quality | registro e acompanhamento | fato não apurado |
| occurrence.valet | occurrence | problema no valet | quality | registro e acompanhamento | fato não apurado |
| occurrence.prior_promise | occurrence | promessa anterior | privacy_and_handoff | preservação para revisão | promessa não revalidada |
| occurrence.alert_only | occurrence | alerta | privacy_and_handoff | registro sem conclusão | ação não autorizada |
| feedback.praise | feedback | elogio | praise_and_suggestion | agradecimento específico | nenhum |
| feedback.suggestion | feedback | sugestão | praise_and_suggestion | preservação específica | execução não prometida |
| privacy.opt_out | privacy | recusar dados | privacy_and_handoff | registro de consentimento | nenhum |
| privacy.access_request | privacy | acessar dados | privacy_and_handoff | orientação de solicitação | prazo não inventado |
| privacy.correction_request | privacy | corrigir dados | privacy_and_handoff | correção append-only | execução exige capacidade |
| abuse.review | abuse | revisar abuso | privacy_and_handoff | revisão proporcional | sem bloqueio automático |
| public_exposure | risk | exposição pública | privacy_and_handoff | cuidado e handoff | sem admissão de culpa |
| conversation.multiple_intents | conversation | múltiplas necessidades | privacy_and_handoff | separar casos | não misturar pedidos |
| conversation.ambiguous | conversation | esclarecer necessidade | privacy_and_handoff | pergunta mínima | fallback só após contexto |
| handoff.failure | handoff | continuidade humana | privacy_and_handoff | preservar caso | sem transferência falsa |
| event.oke_pickup | event | Oke para retirada | events_oke | retirada, prazo e tábuas | preço/quantidade/disponibilidade |

## Lacunas classificadas

- Conhecimento existente, mas anteriormente não utilizado: experiências
  relacionadas, meios de vale-refeição, links de cardápio, delivery e Oke.
- Conhecimento duplicado: passos do iFood aparecem no catálogo interno e nas
  fontes oficiais; a fonte externa define o procedimento e o catálogo interno
  define o que o TATÁ pode executar.
- Conhecimento desconectado: informação pública estava fora do plano de resposta.
- Ausência real: feriado, acessibilidade específica, composição por alergênico,
  disponibilidade, posição na fila, taxa por endereço e decisões financeiras.
- Procedimento sem estratégia: iFood e casos sanitários.
- Estratégia sem procedimento: elogio, privacidade e falha de handoff.

O verificador de cobertura falha se uma intenção canônica for omitida, duplicada
ou ligada a playbook inexistente.
