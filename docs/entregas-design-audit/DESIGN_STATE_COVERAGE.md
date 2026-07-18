# Cobertura de Estados de Design — Entregas

Estados pedidos na Missão 1 × material existente.  
**Importante:** estados estão no **contrato de domínio**, não em design visual.

Legenda clareza: **Alta** / **Média** / **Baixa** (como o material comunica o estado).

---

## Matriz

| Estado (pedido) | Material | Clareza | Ação principal (doc) | Lacuna | Risco de interpretação |
|---|---|---|---|---|---|
| Viagem em preparação | Trip `draft`/`preparing` | Alta | Montar stops; preparar sacolas | Sem UI | Parecer “pedido em produção” |
| Pronta para sair | `ready_to_depart` | Alta | DepartureEvent | Sem UI | Confundir com collected |
| Aguardando entregador | Delivery `waiting_assignment` + rider avail | Alta | Assign | Sem UI desktop fila | Capacidade falsa se presença=disponível |
| Em rota | `departed`/`in_route` | Alta | Confirmar stops; GPS session | Mapa proibido como Foco | App genérico de tracking |
| Parada concluída | TripStop `done` | Alta | Próximo stop | Sem UI sequência | — |
| Tentativa sem sucesso | — / Incident | Baixa | Report incident | **Sem estado stop “attempted”** | Contar como delivered |
| Ocorrência aberta | Incident `open` | Média | Resolver; pode interrupt | Tipos fracos | Punição / Foco auto |
| Retorno necessário | `returning` | Alta | ReturnEvent | — | Auto-disponível por GPS |
| Viagem parcialmente concluída | `partially_completed` | Alta | Continuar ou abort parcial | UX de escolha | Esquecer stops |
| Viagem concluída | `completed` | Alta | Encerrar ciclo | — | Completed sem return |
| Fechamento pendente | Return `provisional` | Média | Confirmar retorno | Pouco destaque “pendente” | Liberar rider cedo |
| Offline | SyncPending `pending` | Média | Continuar local | UI “não enviado” | Perda silenciosa |
| Sincronizando | → `synced` | Baixa | Aguardar | Sem estado “syncing” explícito | — |
| Conflito | `conflict` / under_review | Média | Humano | UX resolução | Auto-merge |
| Localização indisponível | U-05 / sem sinal | Alta | Offline local; não inventar | — | Inventar pin |
| Dado desatualizado | rider `sem_atualizacao` | Alta | Não assumir disponível | UI stale | Capacidade mentirosa |
| Falha técnica | insufficient_data; parse fail | Média | Desconhecido | Superfície técnica | Esconder como calmo |

---

## Contagens

| Classe | Estados |
|---|---|
| **Completos** (nome + regra + transição) | preparação, pronta sair, aguardando rider, em rota, parada ok, retorno, parcial, concluída, fechamento (provisional/confirm), loc indisponível, dado desatualizado — **11** |
| **Parciais** | ocorrência aberta, offline, conflito, falha técnica, fechamento pendente (UI) — **5** |
| **Ausentes** (como estado de design/domínio fino) | tentativa sem sucesso (attempt), sincronizando (explícito) — **2** |

---

## Marketplace (extra, não na lista)

ready_awaiting_courier · courier_waiting · handoff_pending · handed_off · handoff_exception — **completos no domínio**.

---

## Conclusão

Máquina de estados de **Trip/Rider/Delivery** é o ativo mais maduro do pacote.  
O que falta para “estado de design” é **expressão visual e mobile** + estado fino de **tentativa de entrega**.
