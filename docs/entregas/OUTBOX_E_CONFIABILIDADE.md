# Outbox e confiabilidade — ENTREGAS

| Campo | Valor |
|---|---|
| Data | 2026-07-20 |
| Fase | Fundação / pre_integration |
| Código | `src/entregas/integration/outbox.ts` · `session.ts` |

---

## 1. Nível atual da outbox (explícito)

| Pergunta | Resposta |
|---|---|
| Em memória? | **SIM** |
| Arquivo local? | **NÃO** |
| Banco persistente? | **NÃO** |
| Transacional com o domínio (DB ACID)? | **NÃO** (sem adapter persistente) |
| Apenas contrato futuro? | **NÃO** — implementação **simulada/local** funcional |

### Atomicidade

> **Contrato de atomicidade definido e testado no nível de sessão; garantia transacional definitiva depende do adapter persistente da fase de infraestrutura.**

Na F0, `EntregasSession`:

1. aplica mudança no domínio (`InMemoryEventLog`);
2. enfileira eventos públicos validados na outbox em memória;
3. na **mesma operação síncrona de processo** (mesmo call stack da API de sessão).

Isso **não** é atomicidade de produção com banco (não há `BEGIN/COMMIT` compartilhado).  
Crash de processo pode perder memória; reprocessamento e idempotência protegem o **consumidor**, não a durabilidade do produtor.

---

## 2. O que já está implementado

- Outbox em memória com status: `pending` | `published` | `failed` | `dead_letter`
- Validação de schema no enqueue
- Idempotência por `event_id` e `idempotency_key`
- `flush` assíncrono para `EntregasOperationalEventAdapter`
- Falha do consumer **não** reverte Trip/Handoff
- Reenvio de pendências / failed
- Log de publicação auditável (`publicationLog`)
- Sessão domínio+outbox
- Feed `EntregasEventFeed` sobre eventos **published**
- Health técnico (`EntregasIntegrationHealth`)

---

## 3. O que está simulado

- Transporte (sem broker)
- Consumer DELIVERYOS Copiloto (`SimulatedCopilotoConsumer` + mock adapter)
- Persistência (memória de processo)
- Atomicidade de sessão (não DB)

---

## 4. O que depende de banco / infraestrutura

- Outbox durável (mesma transação que o write do domínio)
- Replay após restart do processo produtor
- Multi-instância / lock de publicação
- Retenção e purge de outbox

---

## 5. O que depende da futura integração

- Consumer live no worktree Copiloto
- Conexão shell
- Capacidade Viva consumindo sinais
- Métricas de lag em produção

---

## 6. Ordenação, duplicidade, replay

| Garantia | Status |
|---|---|
| Ordenação global | **NÃO** prometida |
| Correlação Trip/Delivery/Handoff/Occurrence | **SIM** (ids no envelope) |
| `occurred_at` preservado | **SIM** |
| Sync tardia não reescreve fato | **SIM** (`synced_at` separado) |
| Idempotência no outbox e no consumer | **SIM** |
| Replay não altera domínio Entregas | **SIM** |
| Evento incompatível isolado | **SIM** (consumer) |
| Desconhecido isolado | **SIM** |
| Falha parcial reenviável | **SIM** |

---

## 7. Rollback

1. Flag `entregas.public_events_publish` = false  
2. Parar `flush`  
3. Domínio continua  
4. Consumer live permanece disabled  

---

## 8. Health

`healthFromOutbox` / `EntregasIntegrationHealth`:

- versões produtor/catálogo/schema + hash  
- último publicado, pendentes, erros  
- consumer disconnected|simulated|live (live sempre disabled nesta fase)  
- `kind: technical_integration_health`  
- `operational_pressure: false`  

**Não** usar health como pressão operacional.

---

*Outbox F0 memória · atomicidade de sessão · 2026-07-20*
