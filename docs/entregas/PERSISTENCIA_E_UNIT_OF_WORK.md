# Persistência e UnitOfWork — 3B.1

## Portas

`TripRepository`, `HandoffRepository`, `OccurrenceRepository`, `RiderStateRepository`, `EventStore`, `OutboxRepository`, `UnitOfWork`.

## Adapters

| Adapter | Uso |
|---|---|
| `MemoryUnitOfWork` | testes |
| `FileUnitOfWork` | dev local, reinício de processo |

## UnitOfWork

Na mesma unidade de commit:

1. mutação de agregados  
2. append de eventos operacionais  
3. enqueue outbox pública  

Falha → `rollback()` descarta staging.

## Garantias

| Nível | O que |
|---|---|
| **Atual** | memória + arquivo local atômico |
| **Local/piloto** | reinício, versão otimista, outbox reenviável |
| **Produção** | ainda exige SQLite/Postgres TX multi-instância |

Ver ADR e OUTBOX atualizado.
