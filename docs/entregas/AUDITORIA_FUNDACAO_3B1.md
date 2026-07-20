# Auditoria da fundação — pré 3B.1

| HEAD de partida efetivo | `bb4c4d3` (ancestral inclui `7afdcf0` + teste freeze) |
|---|---|
| Esperado no briefing | `7afdcf0` |
| Testes baseline | **37/37** (11+14+12) — briefing citava 36 pré-teste freeze |

## Matriz

| Agregado / contrato | Já implementado | Parcial | Ausente | Divergente COR | Ação 3B.1 |
|---|---|---|---|---|---|
| Trip | create/start/return/close auto/manual; events | stop_reorder fraco | optimistic lock | — | Completar commands + persistência |
| Delivery | states, G1–G5, confirm, remove, active | cancel, late confirm | — | — | Completar via commands |
| Handoff | create, verify, volumes, no Trip | states full | — | — | Persistência |
| Occurrence | — | — | **ausente** | — | Implementar |
| Rider state | availability helpers | events incompletos | persistência | — | Completar + persistir |
| Event store | InMemoryEventLog | — | durable | — | EventStore persistente |
| Outbox | memória + sessão | — | TX durable | — | Outbox persistente + UoW |
| Commands | implícitos em funções | — | command layer | — | Commands explícitos |
| Auth/roles | — | — | **ausente** | — | Papéis + ActorContext |
| max_stops policy | sim | versionamento config | — | — | Policy versionada |
| A01–A39 | amostra (~11) | — | bulk | — | Suite aceite |
| Contratos públicos | congelados | — | — | **não alterar** | Preservar |
| Legado 705/501 | — | — | estratégia | — | Doc only-read |

**Regra:** não duplicar máquina de estados — estender `foundation/*`.
