# Integração futura — ENTREGAS × DELIVERYOS COPILOTO

| Campo | Valor |
|---|---|
| Status | **Gate de integração futura ENCERRADO (pre_integration)** |
| Data | 2026-07-20 |
| Contrato domínio | COR-ENTREGAS-V1 @ 1.0.3 |
| Contrato público | catalog **1.0.0** · schema **1.0.0** · `consumer_live: disabled` |
| Outbox atual | **Em memória** (sessão lógica; não DB) |
| Atomicidade produção | **NÃO** — ver declaração abaixo |
| Código | `src/entregas/contracts/` · `src/entregas/integration/` |
| Docs irmãos | `CONTRATOS_PUBLICOS_EVENTOS.md` · `OUTBOX_E_CONFIABILIDADE.md` |

### Declaração de atomicidade (obrigatória)

> **Contrato de atomicidade definido e testado no nível de sessão; garantia transacional definitiva depende do adapter persistente da fase de infraestrutura.**

Não declarar atomicidade de produção com a outbox apenas em memória.

### Nível da outbox (explícito)

| Tipo | Atual |
|---|---|
| Em memória | **SIM** |
| Arquivo local | NÃO |
| Banco persistente | NÃO |
| Transacional com domínio (DB) | NÃO |
| Sessão lógica domínio+enqueue | **SIM** (testado) |
| Apenas contrato vazio | NÃO (implementação simulada funcional) |

### Consumer

- `SimulatedCopilotoConsumer` — só `EntregasEventFeed` + contratos públicos  
- **Import de domínio interno: NÃO**  
- Copiloto real: **NÃO** conectado  

---

## 1. Responsabilidades

### ENTREGAS

- Executa a logística.
- Cria e altera Trip; registra entregas, Handoff iFood, ocorrências.
- Registra chegada, espera, retirada, saída e retorno (quando houver evidência).
- **Emite fatos operacionais** públicos versionados.
- Continua operando se o Copiloto estiver offline.

### DELIVERYOS COPILOTO

- Consome fatos operacionais.
- Observa, interpreta, calcula pressão, apresenta evidências, recomenda.
- **Nunca** altera Trip automaticamente.
- **Nunca** confirma entrega, atribui motoboy, encerra ocorrência ou controla estado interno do Entregas.

---

## 2. Proibição de acoplamento direto

| ENTREGAS não importa | COPILOTO não depende de |
|---|---|
| Capacidade Viva / regras do Copiloto | Tabelas internas do Entregas |
| Calmo / Ambiente / Foco / `body[data-mode]` | Implementação concreta de banco |
| Componentes visuais do Copiloto | UI interna do Entregas |
| `cv-cal-tata-human-v2` | Caminhos internos não versionados |

Conexão **somente** por contratos públicos versionados + adapter.

---

## 3. Contrato de eventos

Local canônico:

```text
src/entregas/contracts/events/
```

Envelope mínimo (schema_version 1.0.0):

| Campo | Obrigatório | Notas |
|---|---|---|
| `event_id` | sim | Único |
| `event_type` | sim | Catálogo §4 |
| `schema_version` | sim | Semântica de contrato público |
| `occurred_at` | sim | Fato operacional |
| `recorded_at` | sim | Registro local |
| `synced_at` | se offline sincronizado | |
| `idempotency_key` | sim | Reprocessamento seguro |
| `source` | sim | `entregas` |
| `source_health` | sim | ok \| degraded \| unknown |
| `confidence` | sim | observed \| inferred \| unknown |
| `unit_id` | sim | |
| `source_mode` | opcional pre_integration | `real` / `simulated` / `control`; sem default; ausência = UNKNOWN e não autoriza promoção causal |
| `trip_id` | se aplicável | |
| `delivery_id` | se aplicável | |
| `handoff_id` | se aplicável | |
| `occurrence_id` | se aplicável | |
| `rider_actor_id` | se necessário | **Anonimizado** (hash/id opaco) |
| `payload` | sim | Mínimo; sem PII desnecessária |
| `correlation_id` | sim | |
| `causation_id` | opcional | Evento causa |

### Proibido no payload público

Nome completo de funcionário · ranking · produtividade individual · telefone · endereço completo sem necessidade · localização histórica desnecessária · WhatsApp bruto.

---

## 4. Eventos operacionais mínimos

Nomes **COR** quando houver equivalente canônico (sem duplicar por sinônimo).

| event_type | Origem | Nota |
|---|---|---|
| `delivery_ready` | Sinal OV/expedição | Pronto para logística; ausência ≠ zero |
| `trip_created` | COR | |
| `delivery_added` | COR | público: `delivery_added` (não duplicar como `*_to_trip`) |
| `delivery_removed` | COR | payload: `active=false` |
| `rider_assigned` | Sinal | courier_actor_id interno anonimizado |
| `rider_arrived_store` | Sinal | presença loja |
| `rider_waiting_store` | Sinal | início de espera |
| `delivery_picked_up` | Sinal | retirada/volumes |
| `trip_started` | COR | saída (público; não inventar `trip_departed` paralelo) |
| `arrival_detected` | COR | evidência de rota; **não** entrega |
| `delivery_confirmed` | COR | humano |
| `delivery_unconfirmed` | COR | G1–G5; sem culpa |
| `customer_not_found` | COR | |
| `return_requested` | COR | |
| `trip_return_started` | COR | |
| `return_detected` | COR | evento, não estado |
| `trip_closed_automatic` | COR | |
| `trip_closed_manual` | COR | |
| `rider_availability_changed` | Sinal | |
| `rider_location_stale` | Sinal | source_health / sem_atualizacao |
| `source_quality_issue` | Sinal | contradição / qualidade |
| `handoff_created` | Fundação | início expedição iFood |
| `handoff_courier_arrived` | COR | |
| `handoff_transferred` | COR | ≈ handoff_confirmed público |
| `handoff_exception` | COR | |
| `occurrence_opened` | COR | |
| `occurrence_updated` | COR | |
| `occurrence_closed` | COR | |
| `event_sync_pending` | Integração | outbox |
| `event_sync_completed` | Integração | outbox |

Aliases de consumo documentados (não eventos duplicados no log):

| Alias de leitura | event_type canônico |
|---|---|
| delivery_added_to_trip | `delivery_added` |
| trip_departed | `trip_started` |
| handoff_started | `handoff_created` |
| handoff_confirmed | `handoff_transferred` (confirmed) |
| occurrence_created | `occurrence_opened` |
| occurrence_resolved | `occurrence_closed` |

---

## 5. Sinais para Capacidade Viva (futuro)

| Pergunta | Evento / evidência | Se ausente |
|---|---|---|
| Quando ficou pronto? | `delivery_ready.occurred_at` | **ausência de evidência** (não 0) |
| Motoboy chegou à loja? | `rider_arrived_store` | ausência |
| Começou a aguardar? | `rider_waiting_store` | ausência |
| Retirada? | `delivery_picked_up` | ausência |
| Viagem saiu? | `trip_started` | ausência |
| Pronto sem saída (duração) | ready → trip_started | só se ambos existirem |
| Espera do motoboy | arrived/waiting → trip_started | só se ambos existirem |
| Fonte desatualizada | `rider_location_stale` / `source_quality_issue` | ausência |
| Status contraditório | `source_quality_issue` | ausência |
| Delivery removida | `delivery_removed` + active=false | ausência |
| entrega_sem_confirmacao | `delivery_unconfirmed` | ausência |
| Início retorno | `trip_return_started` | ausência |
| Viagem fechada | `trip_closed_*` | ausência |

**Regra:** ausência de sinal ≠ zero tempo / zero pressão fabricada.

---

## 6. Outbox e entrega confiável

Padrão: **Transactional Outbox** (F0: memória com mesma unidade de commit lógica).

1. Mudança de domínio + enqueue do evento público na mesma operação.  
2. Publicação assíncrona / simulada não apaga o outbox até ack.  
3. Reprocessamento **idempotente** (`idempotency_key` + `event_id`).  
4. Falha no consumidor **não** reverte Trip/Handoff.  
5. Pendências reenviáveis; histórico de publicação auditável.  
6. Transporte F0: local/simulado — **sem** broker obrigatório.

---

## 7. Versionamento e validação

| Item | Política |
|---|---|
| `schema_version` | Obrigatório em todo evento público |
| Validação | `validatePublicEvent()` |
| Evolução | Campos novos opcionais OK; breaking → **nova** schema_version |
| Testes | Contrato + exemplos anonimizados |
| Proibido | Alterar significado silencioso de campo |

Versão atual do envelope: **1.0.0**.

---

## 8. Adapter

```text
EntregasEventFeed
EntregasOperationalEventAdapter
```

- Copiloto consome sem conhecer domínio interno.  
- F0: `InMemoryEntregasEventFeed` + `MockCopilotoConsumer`.  
- **Não** conectar ao Copiloto congelado.  
- **Não** alterar worktree do Copiloto.  
- **Não** alimentar UI.  
- **Não** decisão automática.

---

## 9. Manifesto de módulo (shell futuro)

```text
src/entregas/contracts/module-manifest.ts
id: entregas
```

Campos: nome, versão, rota futura, disponibilidade, capacidades, permissões, health, contratos públicos, feature flags.

**Não** integrado ao shell principal nesta fase.

---

## 10. Falha segura

Se Copiloto desligado / indisponível / incompatível / atrasado / com falha / recusando eventos:

- ENTREGAS **segue** (Trip, saída, confirmação, retorno, Handoff, ocorrência).  
- Apenas registra `event_sync_pending` / falha técnica no outbox.

---

## 11. O que permanece desabilitado

- Integração ao shell principal  
- Push / deploy  
- Conexão real ao worktree Copiloto  
- Capacidade Viva em produção via estes eventos  
- GPS produção  
- Atribuição automática  

---

## 12. Rollback

1. Feature flag `entregas.public_events_publish` = false.  
2. Outbox deixa de entregar; domínio intacto.  
3. Eventos já publicados: consumidor deve ignorar por versão/flag.  
4. Não há acoplamento de schema interno a reverter no Copiloto (ainda não ligado).

---

## 13. Como rodar testes

```bash
npm run test:entregas
```

Inclui:

1. Fundação COR  
2. Integração pública (outbox, contrato, isolation)  
3. **Gate close** (freeze, consumer simulado, checkpoint, PII, health)  

---

## 14. Matriz implementado × simulado × futuro

| Item | Estado |
|---|---|
| Domínio Trip/Handoff + eventos COR | Implementado |
| Envelope público + validação + hash | Implementado / **congelado pre_integration** |
| Outbox memória + sessão | Implementado (simulado quanto a durabilidade) |
| Feed + adapter mock + consumer simulado | Implementado |
| Health técnico | Implementado |
| Outbox em banco / TX real | Depende de infraestrutura |
| Consumer live Copiloto | Futuro · disabled |
| Shell | Futuro · disabled |

## 15. Rollback

1. `entregas.public_events_publish` = false  
2. Parar flush  
3. Domínio intacto  
4. `consumer_live` permanece disabled  

## 16. Versionamento

- Breaking → nova `schema_version` / `catalog_version`  
- Hash de schemas deve mudar se material canônico mudar  
- Não alterar significado silencioso de campos  

---

*Gate integração futura encerrado · pre_integration · 2026-07-20*

## 17. Adapter shadow de lifecycle — 2026-09-30

`src/platform/ingest/entregas-shadow-adapter.ts` é uma fronteira pura e sem I/O entre o contrato público de Entregas e os eventos de lifecycle que a Operação Viva já entende.

- não habilita `consumer_live`;
- não publica em UI;
- não escreve banco/outbox;
- exige `source_mode` e `trip_id` explícitos;
- preserva `event_id`, correlação e procedência;
- recusa tipos cuja granularidade não é semanticamente equivalente à Trip.

O objetivo é permitir validação causal em shadow sem transformar fato de uma parada em fato da viagem inteira.
## 18. Consumer live — pré-ativação comprovada, conexão ainda desligada — 2026-09-30

Foi preparado `src/platform/runtime/entregas-live-consumer.ts`, mas ele **não está ligado ao `async-runtime.ts`** e a flag canônica `entregas.copiloto_live_connection` continua `false`.

Barreiras de ativação:

1. feature flag explícita;
2. kill switch dinâmico em arquivo — somente conteúdo exato `RUN` libera; arquivo ausente, ilegível, vazio, `STOP` ou qualquer outro valor = parado;
3. cada evento adaptado passa pela mesma `ingerir()` + `EscritorTransacional` da plataforma antes de o checkpoint avançar;
4. checkpoint em arquivo é escrito por temp + rename e serve apenas como cursor de leitura;
5. `platform.event_log` continua sendo a verdade durável que governa reconstrução/replay;
6. tipo público sem equivalência segura ou sem `source_mode` é isolado com metadado mínimo e não vira fato da Operação Viva.

Provas de pré-ativação:

- consumer: **12/12 PASS**;
- PostgreSQL real isolado: **3/3 PASS**;
- crash após commit do fato/outbox e antes do checkpoint: restart relê o evento, o banco reconhece duplicata e preserva exatamente **1 fato + 1 outbox**;
- `source_mode=simulated` permanece igual no event log e na mensagem da outbox;
- ingestão transacional: **17/17 PASS**;
- adapter shadow: **9/9 PASS**;
- Q-003 E2E: **9/9 PASS**;
- runtime wiring: **21/21 PASS**;
- governança: **GREEN** antes desta documentação.

### Gate que continua fechado

A implementação concreta atual de `EntregasEventFeed` é `InMemoryEntregasEventFeed`. Portanto **não existe ainda transporte/feed durável real de Entregas para conectar ao consumer live**.

Ativar o consumer contra esse feed em memória faria restart do produtor perder a fonte antes que o checkpoint/replay pudesse cumprir a promessa. Por isso a ativação permanece proibida até existir um adapter de feed durável provado e uma autorização humana específica de ativação.
## 19. Feed durável do piloto single-instance — 2026-09-30

Foi criado `CommittedOutboxEntregasEventFeed`, dependente somente da porta `OutboxRepository`, e `createFileEntregasEventFeed(dataFile)`, que abre uma `FileUnitOfWork` nova a cada leitura.

Propriedades provadas:

- evento staged e **não commitado** é invisível;
- depois do commit atômico domínio + eventos + outbox, reader novo enxerga o evento;
- restart do reader preserva ordem e cursor;
- cursor inexistente **falha alto** — nunca pula histórico em silêncio;
- status do transporte push (`pending/failed/published`) não altera o histórico do transporte pull;
- o feed devolve cópias, não referências mutáveis ao backing store;
- `source_mode` é carimbado pelo `EntregasApplicationService` apenas quando fornecido explicitamente;
- ausência de `source_mode` permanece UNKNOWN e nunca cai para `real`.

Gate: `test:entregas:durable-feed` = **9/9 PASS**.

### Fronteira

Isto resolve durabilidade do feed para o piloto **single-instance sobre FileUnitOfWork**. Não transforma o arquivo local em banco multi-instância, não conecta o consumer ao `async-runtime.ts`, não altera a flag live e não autoriza produção.
## 20. `source_mode` explícito no produtor piloto — 2026-09-30

`PilotConfig` agora aceita opcionalmente `source_mode: real | simulated | control` e o `PilotApplicationFacade` o propaga ao `EntregasApplicationService`.

Regras:

- não existe default;
- ausência permanece UNKNOWN e os eventos públicos saem sem `source_mode`;
- valor fora do enum falha no carregamento da configuração;
- `reloadStore()` reconstrói o ApplicationService com o mesmo modo configurado;
- feed durável preserva exatamente o modo fornecido.

Gate: `test:entregas:source-mode` = **5/5 PASS**.

Para um piloto que vá alimentar a ponte causal, a configuração operacional precisa declarar o modo conscientemente. Copiar configuração antiga sem o campo continua seguro: o consumer isola os eventos, não os chama de reais.

## 21. Source-ingest com identidade mínima e wiring piloto provados — 2026-09-30

A ponte live-capable deixou de depender de ampliar `deliveryos_async`. Existe agora um processo separado, `entregas-source-ingest`, com configuração própria, OFF por padrão e sem import pelo `async-runtime`.

Autoridade SQL do papel `deliveryos_source_ingest`:

- `USAGE` no schema `platform`;
- `INSERT` em `platform.event_log` e `platform.outbox`;
- `SELECT` apenas nas colunas mínimas necessárias ao conflito/idempotência do writer;
- sem leitura geral do event log/outbox;
- sem `UPDATE`, `DELETE`, `TRUNCATE` ou DDL;
- sem acesso a `identity.device`, `platform.job`, `platform.audit` ou `platform.schema_migration`;
- não é superuser, owner, createrole nem createdb.

Prova PostgreSQL real em branch efêmera Neon São Paulo, isolada da branch operacional:

- `SOURCE_INGEST_ROLE_PG`: **4/4 PASS**;
- `SOURCE_INGEST_PILOT_WIRING_PG`: **6/6 PASS**;
- `ENTREGAS_LIVE_CONSUMER_PG`: **3/3 PASS**;
- `SOURCE_INGEST_CONFIG`: **9/9 PASS**;
- ingest-service: **17/17**;
- live consumer: **12/12**;
- durable feed: **9/9**;
- governança: **GREEN**.

O wiring provado é: `ApplicationService -> store.json commitado -> durable feed -> kill switch -> consumer -> PgTransactionalWriter sob papel mínimo -> platform.event_log/outbox`.

Com kill switch ausente ou `STOP`, zero fatos são escritos e o checkpoint não avança. Com `RUN`, somente lifecycle semanticamente seguro entra; eventos por Delivery ficam isolados. Restart no mesmo checkpoint fica idle e não duplica. Evento novo acumulado durante STOP entra somente após RUN.

### Fronteira que permanece fechada

`FileUnitOfWork` e `store.json` continuam single-instance. Isso é suficiente para o piloto local provado, mas **não é transporte de produção multi-instância/cluster-safe**. A flag `entregas.copiloto_live_connection` continua `false`; não houve wiring no `async-runtime`, deploy ou ativação live.

## 22. Persistência PostgreSQL cluster-safe — adapter provado, wiring do piloto ainda fechado — 2026-09-30

Foi adicionado `PgEntregasUnitOfWork`, implementando a mesma porta `UnitOfWork` do domínio sobre o schema PostgreSQL normalizado de `entregas.*`. A solução **não cria `state_store` JSONB paralelo**: completa e reutiliza `entregas.trip`, `entregas.delivery` e `entregas.occurrence`, adicionando apenas `handoff`, `rider_state`, `domain_event` e `public_outbox` que ainda não tinham armazenamento operacional equivalente.

Concorrência entre instâncias usa optimistic concurrency no próprio commit: `UPDATE ... WHERE version = expected`. Duas instâncias podem ler a mesma versão; exatamente uma confirma, a outra recebe `ConcurrencyError`, recarrega e pode repetir sobre a versão nova. Domínio + domain events + public outbox confirmam na mesma transação SQL.

Prova em GitHub Actions, repositório público, PostgreSQL 17 de serviço:

- migration `0006_entregas_cluster_persistence` aplicada junto das migrations 0001–0005;
- `ENTREGAS_PG_UOW`: **8/8 PASS**;
- duas instâncias concorrentes: exatamente uma vence;
- loser recarrega/retry e as duas mudanças legítimas permanecem;
- falha tardia na outbox desfaz a atualização de domínio inteira;
- feed commitado preserva ordem, cursor e restart;
- isolamento por unidade provado;
- `entregas.domain_event` é append-only por trigger no banco;
- foundation, integration, durable-feed, gate-close, governança e `git diff --check`: PASS/GREEN.

### Fronteira ainda fechada

O `PilotApplicationFacade` continua tipado e construído diretamente com `FileUnitOfWork`, e `snapshot()`/`reloadStore()` ainda consultam `store.json`. Portanto o adapter PostgreSQL está **CODE_READY + POSTGRES_PROVEN**, mas o piloto ainda não foi migrado para ele. `ready_orders.json` também continua local.

Nenhum deploy foi feito, nenhuma migration foi aplicada à branch operacional do Neon e `entregas.copiloto_live_connection` continua `false`.
