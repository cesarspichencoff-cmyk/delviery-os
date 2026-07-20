# PLANO TÉCNICO E FUNDAÇÃO — MÓDULO ENTREGAS

| Campo | Valor |
|---|---|
| Gate | Plano técnico + fundação (F0) |
| Data | 2026-07-20 |
| Pré-condição | **ESTRUTURA OPERACIONAL CONFIRMADA** (Gate Zero V2) |
| Contrato | **COR-ENTREGAS-V1 @ 1.0.3** |
| Worktree | `deliveryos-entregas-v1` · `feature/entregas-v1` |
| Piloto | `docs/entregas/gate-zero/DECISOES_PILOTO_RECOMENDADAS.md` (19) |

---

## 0. Limites deste gate

| Autorizado | Proibido |
|---|---|
| Domínio TypeScript isolado em `src/entregas/` | Integrar ao shell principal |
| Testes unitários das regras COR | Push / deploy |
| Documentação de fundação | GPS em produção |
| In-memory / event log em memória | Atribuição automática |
| | Alterar Copiloto / Capacidade Viva / Seleção |
| | UI completa mobile/console (F1) |
| | Migrations de banco de produção |

---

## 1. Arquitetura da fundação (F0)

```text
src/entregas/
  foundation/          — domínio COR (Trip, Delivery, Handoff, …)
  contracts/
    events/            — envelope público versionado (Copiloto futuro)
    EntregasEventFeed.ts
    module-manifest.ts — shell futuro (desabilitado)
  integration/
    outbox.ts          — transactional outbox (memória F0)
    public-event-builder.ts
    event-feed.ts      — adapter + mock consumer
    session.ts         — domínio + outbox na mesma operação lógica
    run-integration-tests.ts
```

Documentação: `docs/entregas/INTEGRACAO_DELIVERYOS_COPILOTO.md`

**Princípios:**

1. Estado derivado de eventos imutáveis (append-only).  
2. Transição sem evento = proibida.  
3. Enums **somente** do COR 1.0.3.  
4. Handoff **nunca** cria `trip_id`.  
5. GPS (quando existir no futuro) só em sessão de Trip ativa; **nunca** → `entregue_confirmado`.  

---

## 2. Distinção de atores (inequívoca)

```typescript
// brands nominais — não são intercambiáveis em TypeScript
type InternalRiderActorId = string & { readonly __brand: "InternalRiderActorId" };
type ExternalCourierRef   = string & { readonly __brand: "ExternalCourierRef" };
```

| Campo | Tipo | Objeto | Usuário do módulo? |
|---|---|---|---|
| `Trip.courier_actor_id` | `InternalRiderActorId` | Trip | Motoboy da casa |
| `Handoff.external_courier_ref` | `ExternalCourierRef` (opcional se só verified) | Handoff | **Não** (ref mínima) |

Courier iFood: sem conta, app, disponibilidade, Trip, GPS, rota, ranking.

---

## 3. Fases

### F0 — Fundação (este gate) ✅ em andamento

- Tipos, enums, event log, máquinas Trip/Delivery/Handoff/Actor  
- Regras: trip_return_started, G3, active=false ∉ G1–G5, handoff verification  
- max_stops na política, não no schema  
- Testes automatizados mínimos  

**Critério de verde F0:** testes da fundação passam; zero acoplamento a OV/Copiloto.

### F1 — Superfícies (depois de F0 estável)

- Console: formação Trip, fila `entrega_sem_confirmacao`, **EXPEDIÇÃO IFOOD**, ocorrências  
- Mobile motoboy: viagem, confirmação, offline  
- **Não** shell principal até aceite  

### F2 — Integração controlada (mais tarde)

- Eventos para consumo futuro  
- **Não** importar Capacidade Viva / Foco  
- **Não** push/deploy sem ordem explícita  

---

## 4. Mapa de regras críticas → código

| Regra COR / Gate Zero | Módulo |
|---|---|
| `trip_created` → preparando_saida; trip_id pré-saída | `trip-machine` |
| `trip_return_started` sem require_all_active_stops_resolved | `trip-machine` |
| G3 em trip_return_started → unconfirmed se active e sem desfecho | `delivery-rules` |
| active=false fora G1–G5 | `delivery-rules` |
| GPS ≠ delivery_confirmed | `delivery-rules` (rejeitar origin system+GPS) |
| entrega_sem_confirmacao não bloqueia trip close | `trip-machine` |
| Handoff: verified + volumes + atores internos | `handoff-machine` |
| Handoff não cria Trip | `handoff-machine` |
| Precedência disponibilidade | `actor-availability` |
| max_stops configurável | `policy` |

---

## 5. Persistência (F0)

- **Somente memória** no processo de teste.  
- Interface `EventStore` preparada para implementação futura (SQLite/local).  
- **Sem** migrations de produção neste gate.

---

## 6. Como rodar a fundação

```bash
npm run typecheck
npm run test:entregas
```

---

## 7. Critérios de aceite F0

- [x] Plano técnico documentado  
- [x] `contract_version = COR-ENTREGAS-V1@1.0.3` em eventos/Trip  
- [x] Brands InternalRider ≠ ExternalCourier  
- [x] trip_return_started sem exigir todos stops  
- [x] G3 gera unconfirmed só active=true  
- [x] active=false ignora G1–G5  
- [x] Handoff exige verificação; não cria Trip  
- [x] delivery_confirmed rejeita se “só GPS”  
- [x] maxStops da policy, default 5  
- [x] Testes verdes (`npm run test:entregas` — 11 OK)  
- [x] Sem alteração Copiloto/CV/Seleção  

---

*Plano técnico F0 · fundação isolada · 2026-07-20*
