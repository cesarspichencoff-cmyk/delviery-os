# Catálogo de Journey Graphs

Versão do catálogo: `1.0.0`. Cada grafo referencia um dos 16 playbooks já
aprovados; não contém frase final, fato novo, política ou autoridade própria.

| Jornada | Playbook existente | Fatos mínimos estruturais | Destino autorizado |
|---|---|---|---|
| `reservation` | `reservation` | quantidade, data, horário | consulta/criação/alteração observável |
| `waitlist` | `waitlist` | quantidade, previsão de chegada | consulta/entrada observável |
| `large_group` | `large_group` | quantidade, previsão de chegada | acompanhamento humano |
| `restaurant_information` | `restaurant_information` | conforme a consulta | leitura de informação pública |
| `own_delivery` | `own_delivery` | conforme o pedido | cardápio, pedido ou acompanhamento |
| `ifood_problem` | `ifood` | pedido, item | ocorrência e acompanhamento |
| `missing_item` | `missing_item` | canal, pedido | ocorrência e acompanhamento |
| `wrong_item` | `wrong_item` | canal, pedido, item | ocorrência e acompanhamento |
| `wrong_quantity` | `quantity_personalization` | canal, pedido, quantidades | ocorrência e acompanhamento |
| `personalization` | `quantity_personalization` | canal, pedido, personalização | ocorrência e acompanhamento |
| `delay` | `delay_and_delivery` | canal, pedido | consulta ou ocorrência |
| `quality` | `quality` | pedido, item, evidência | qualidade e gestão |
| `food_safety` | `food_safety` | sinais, início, pessoas, item, pedido | proteção e escalonamento |
| `oke_event` | `events_oke` | quantidade, retirada, itens | avaliação humana |
| `praise` | `praise_and_suggestion` | conforme o relato | registro de feedback |
| `handoff` | `privacy_and_handoff` | escopo | privacidade ou fila humana |

## Forma do grafo

Cada registro expõe `journey_id`, `version`, `entry_conditions`, `nodes`,
`edges`, `required_facts`, `completion_conditions`,
`cancellation_conditions`, `allowed_side_questions`, `backtrack_rules` e
`playbook`.

Os nós contêm objetivo, fatos necessários, `question_key`, ações, transições,
playbook, limites e indicador terminal. `question_key` é uma referência
estrutural; a linguagem é produzida somente depois pelo Response Plan e pelo
compositor ou Writer.

## Invariantes

- a primeira lacuna válida define a próxima etapa;
- fato corrigido reabre apenas o primeiro nó dependente;
- etapa concluída não é repetida sem correção;
- ação exige resultado observável antes de ser afirmada;
- pergunta lateral não conclui a jornada;
- segurança pode interromper qualquer grafo;
- a pilha admite no máximo três jornadas suspensas;
- excesso de profundidade pede esclarecimento e não descarta estado.
