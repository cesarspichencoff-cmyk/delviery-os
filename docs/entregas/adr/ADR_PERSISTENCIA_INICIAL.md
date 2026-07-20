# ADR — Persistência inicial do domínio Entregas

| Campo | Valor |
|---|---|
| Status | Aceito (fase 3B.1) |
| Data | 2026-07-20 |

## Contexto

Precisamos de persistência local, reiniciável, com UnitOfWork entre agregado, event store e outbox — sem broker e sem produção multi-instância.

## Decisão

**Adapter primário de desenvolvimento:** arquivo JSON único versionado por processo (`FileUnitOfWork`), com:

- write atômico (temp + rename);
- snapshots de Trip/Handoff/Occurrence/Rider;
- event log imutável append;
- outbox no mesmo documento;
- versionamento otimista por agregado.

**Adapter de teste rápido:** `MemoryUnitOfWork` (mesma porta).

## Alternativas rejeitadas agora

| Opção | Motivo |
|---|---|
| better-sqlite3 | nativo; risco de build Windows; pode ser fase 3B.2 |
| Postgres/Redis | infraestrutura desnecessária para núcleo local |
| Event sourcing completo | além do escopo 3B.1 |

## Consequências

### Garantias atuais (locais / piloto)

- Reinício de processo recupera estado do arquivo.
- Commit agrupa domínio + eventos + outbox na mesma escrita atômica de arquivo.
- Conflito de versão rejeita save concorrente.
- **Não** é cluster-safe; **não** é backup enterprise.

### Produção futura

- Migrar porta `UnitOfWork` para SQLite/Postgres com TX real.
- Outbox durable multi-instância com lock.

## Status de prontidão

**Persistente localmente = SIM. Pronto para produção = NÃO.**
